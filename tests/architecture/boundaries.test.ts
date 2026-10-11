import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const repository = resolve(import.meta.dir, "../..");
const sourceRoot = join(repository, "src");
const display = (path: string) => relative(repository, path).split(sep).join("/");
interface ImportEdge {
  specifier: string;
  runtime: boolean;
}
interface Dependency extends ImportEdge {
  target?: string;
}

/** Type-only references still obey layer boundaries, but do not create runtime cycles. */
function importsOf(source: string, filename: string): ImportEdge[] {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const edges: ImportEdge[] = [];
  const add = (node: ts.Node | undefined, runtime: boolean) => {
    if (node && ts.isStringLiteralLike(node)) edges.push({ specifier: node.text, runtime });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyNamedTypes =
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((item) => item.isTypeOnly);
      add(node.moduleSpecifier, !clause?.isTypeOnly && (!onlyNamedTypes || !!clause?.name));
    } else if (ts.isExportDeclaration(node)) {
      const bindings = node.exportClause;
      const onlyNamedTypes =
        bindings &&
        ts.isNamedExports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((item) => item.isTypeOnly);
      add(node.moduleSpecifier, !node.isTypeOnly && !onlyNamedTypes);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, !node.isTypeOnly);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, false);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const argument = node.arguments[0];
      if (!argument || !ts.isStringLiteralLike(argument))
        throw new Error(`${filename}: dependency boundaries require a static import path`);
      add(argument, true);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return edges;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceFiles(join(directory, entry.name))
        : Promise.resolve(/\.[cm]?tsx?$/.test(entry.name) ? [join(directory, entry.name)] : []),
    ),
  );
  return nested.flat().sort();
}

const files = await sourceFiles(sourceRoot);
const configFile = ts.readConfigFile(join(repository, "tsconfig.json"), ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repository);
const graph = new Map<string, Dependency[]>(
  await Promise.all(
    files.map(async (file) => {
      const dependencies = importsOf(await readFile(file, "utf8"), display(file)).map((edge) => {
        const resolved = ts.resolveModuleName(edge.specifier, file, options, ts.sys).resolvedModule;
        const target =
          resolved?.resolvedFileName ??
          (edge.specifier.startsWith(".") ? resolve(dirname(file), edge.specifier) : undefined);
        return { ...edge, target: target ? resolve(target) : undefined };
      });
      return [file, dependencies] as const;
    }),
  ),
);

test("source imports never depend on tools, tests, playground or research", () => {
  const violations: string[] = [];
  for (const [file, dependencies] of graph)
    for (const edge of dependencies) {
      if (edge.target && /^(tools|tests|playground|research)(\/|$)/.test(display(edge.target)))
        violations.push(`${display(file)} -> ${display(edge.target)}`);
    }
  expect(violations).toEqual([]);
});

test("tests live outside the distributed source tree", () => {
  expect(files.filter((file) => /\.(test|spec)\.[cm]?tsx?$/.test(file)).map(display)).toEqual([]);
});

test("source modules have no runtime import cycles", () => {
  const active: string[] = [];
  const done = new Set<string>();
  const cycles = new Set<string>();
  const visit = (file: string) => {
    const index = active.indexOf(file);
    if (index >= 0) {
      cycles.add([...active.slice(index), file].map(display).join(" -> "));
      return;
    }
    if (done.has(file)) return;
    active.push(file);
    for (const edge of graph.get(file) ?? [])
      if (edge.runtime && edge.target && graph.has(edge.target)) visit(edge.target);
    active.pop();
    done.add(file);
  };
  for (const file of files) visit(file);
  expect([...cycles]).toEqual([]);
});

/**
 * Directory layering of the pipeline, type-only imports included: a layer may import itself
 * and the layers listed here, nothing else. `model` is the IR vocabulary every stage shares;
 * `swift` prints the IR and must not parse CSS or run analysis.
 */
const ALLOWED: Record<string, readonly string[]> = {
  model: [],
  css: ["model"],
  html: ["model"],
  analysis: ["model", "css", "html"],
  swift: ["model"],
  compiler: ["model", "analysis", "swift"],
  fonts: ["model"],
  input: ["model"],
  browser: ["model", "css", "input"],
  api: ["model", "input", "browser", "compiler", "fonts"],
  cli: ["model", "api", "compiler", "input"],
  index: ["api", "compiler", "html"],
};
const layerOf = (file: string) => /^src\/([^/.]+)/.exec(display(file))?.[1];

test("each source layer imports only the layers the pipeline allows, type-only imports included", () => {
  const layers = [...new Set([...graph.keys()].map((file) => layerOf(file)!))].sort();
  expect(Object.keys(ALLOWED).sort()).toEqual(layers);
  const violations: string[] = [];
  for (const [file, dependencies] of graph) {
    const from = layerOf(file)!;
    for (const edge of dependencies) {
      const to = edge.target && graph.has(edge.target) ? layerOf(edge.target) : undefined;
      if (to && to !== from && !ALLOWED[from]!.includes(to))
        violations.push(`${display(file)} -> ${display(edge.target!)}`);
    }
  }
  expect(violations).toEqual([]);
});

test("the compiler cannot load browser capture or filesystem font packaging", () => {
  const violations: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const edge of graph.get(file) ?? []) {
      if (!edge.runtime) continue;
      const target = edge.target ? display(edge.target) : edge.specifier;
      const next = [...chain, target];
      if (
        /^src\/(browser|fonts|api)\//.test(target) ||
        /^(playwright(?:-core)?|(?:node:)?(?:fs|child_process)|bun)(\/|$)/.test(edge.specifier)
      ) {
        violations.push(next.join(" -> "));
      } else if (edge.target && graph.has(edge.target)) visit(edge.target, next);
    }
  };
  const entry = join(sourceRoot, "compiler/index.ts");
  expect(graph.has(entry)).toBe(true);
  visit(entry, [display(entry)]);
  expect(violations).toEqual([]);
});

test("dependency scanning distinguishes erased types from runtime imports and re-exports", () => {
  const edges = importsOf(
    `
    import type { Model } from "./type-import.ts";
    import { type Options } from "./named-type.ts";
    export type { Model } from "./type-export.ts";
    export { type Options } from "./named-type-export.ts";
    type Saved = import("./import-type.ts").Saved;
    import "./side-effect.ts";
    import {} from "./empty-import.ts";
    import { parse, type Input } from "./mixed.ts";
    export * from "./barrel.ts";
    export { run, type Result } from "./mixed-export.ts";
    const lazy = import("./lazy.ts");
  `,
    "fixture.ts",
  );
  expect(edges.filter((edge) => edge.runtime).map((edge) => edge.specifier)).toEqual([
    "./side-effect.ts",
    "./empty-import.ts",
    "./mixed.ts",
    "./barrel.ts",
    "./mixed-export.ts",
    "./lazy.ts",
  ]);
  expect(edges.filter((edge) => !edge.runtime)).toHaveLength(5);
});
