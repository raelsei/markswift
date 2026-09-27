/** Reproducible native text proof: prepare from a frozen graph, then execute under a simulator lease. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { TextNode } from "../../src/model/semantic.ts";
import { textExpr } from "../../src/swift/text.ts";
import { SWIFT_RUNTIME } from "../../src/swift/runtime.ts";
import { verifySourceSnapshot } from "./corpus-snapshot.ts";
import { instrumentTextWords, textNativeFixtures, textNativeState, textNativeTests, type TextNativeReference } from "./text-native-fixtures.ts";
import { checkTextNativeGeometry } from "./text-native-checks.ts";

const root = resolve(import.meta.dir, "../..");
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
interface ProofManifest {
  version: 1; sourceDirectory: string; sourceHash: string; dependencyHash: string; preparedAt: string;
  files: Record<string, string>; references: TextNativeReference[];
}

export async function prepareTextNativeProof(output: string): Promise<string> {
  const snapshot = await verifySourceSnapshot(root), directory = resolve(output), files: Record<string, string> = {};
  await mkdir(directory, { recursive: false });
  async function save(path: string, contents: string | Uint8Array): Promise<void> {
    await mkdir(resolve(directory, path, ".."), { recursive: true });
    await writeFile(join(directory, path), contents); files[path] = digest(contents);
  }
  const references: TextNativeReference[] = [];
  let views = "import SwiftUI\n";
  for (const fixture of textNativeFixtures) {
    let captured: TextNode | undefined;
    for (const viewport of [390, 320, 500]) {
      let words: TextNativeReference["words"] = [], png: Buffer | undefined;
      const html = `<main data-markswift-root><${fixture.tag} id="sample">${fixture.value}</${fixture.tag}></main>`;
      const css = `body{margin:0}main{box-sizing:border-box;width:100%;padding:16px;background:white;color:black}${fixture.tag}{margin:0;font:${fixture.font} system-ui}`;
      const result = await convertHtml(html, { name: `Native${fixture.id}`, dpr: 2, viewport: { width: viewport, height: 240 }, css,
        async prepare(page) {
          await page.evaluate(() => document.fonts.ready);
          words = await page.evaluate(() => {
            const element = document.querySelector("#sample")!, text = element.firstChild as Text, box = element.getBoundingClientRect();
            return [...text.data.matchAll(/\S+/g)].map(match => {
              const range = document.createRange(); range.setStart(text, match.index!); range.setEnd(text, match.index! + match[0].length);
              const rect = range.getBoundingClientRect(); return { text: match[0], x: rect.x - box.x, y: rect.y - box.y, w: rect.width, h: rect.height };
            });
          });
          png = await page.locator("main").screenshot();
        },
      });
      const inferred = inferScreen(result.layout, `Native${fixture.id}`).root;
      const node = (inferred.kind === "stack" || inferred.kind === "grid" ? inferred.children.find(child => child.kind === "text") : inferred) as TextNode;
      if (node.kind !== "text" || !node.lineBox) throw new Error(`Unsupported text proof fixture: ${fixture.id}`);
      if (viewport === 390) captured = node;
      references.push({ id: fixture.id, viewport, width: viewport - 32, height: node.frame.h, first: node.lineBox.firstBaseline, words });
      const prefix = `Chrome/${fixture.id}-${viewport}`;
      await save(`${prefix}.html`, html); await save(`${prefix}.css`, css); await save(`${prefix}.png`, png!);
      await save(`${prefix}.layout.json`, JSON.stringify(result.layout, null, 2));
      views += `struct Fidelity_${fixture.id}_${viewport}: View { var body: some View { ${textExpr(node, { mode: "fidelity", fontMetrics: {} }).join("\n")} } }\n`;
    }
    views += `struct App_${fixture.id}: View { var body: some View { ${textExpr(captured!, { mode: "app", fontMetrics: {} }).join("\n")}.coordinateSpace(name: "WordContent") } }\n`;
  }
  await save("Chrome/words.json", JSON.stringify(references, null, 2));
  await save("Sources/Generated/Views.swift", views);
  await save("Sources/Generated/Runtime.swift", instrumentTextWords(SWIFT_RUNTIME));
  await save("Sources/Generated/AdvanceProofState.swift", textNativeState);
  await save("Tests/ProbeTests/ProbeTests.swift", textNativeTests(directory, references));
  await save("Package.swift", '// swift-tools-version: 6.0\nimport PackageDescription\nlet package = Package(name: "TextNativeProof", platforms: [.iOS("18.0")], targets: [.target(name: "Generated"), .testTarget(name: "ProbeTests", dependencies: ["Generated"])], swiftLanguageModes: [.v6])\n');
  await verifySourceSnapshot(root);
  const manifest: ProofManifest = { version: 1, sourceDirectory: root, sourceHash: snapshot.sourceHash, dependencyHash: snapshot.dependencyHash,
    preparedAt: new Date().toISOString(), files, references };
  await writeFile(join(directory, "prepared.json"), JSON.stringify(manifest, null, 2));
  return directory;
}

export async function executeTextNativeProof(directory: string, simulator: string): Promise<number> {
  const manifest = JSON.parse(await readFile(join(directory, "prepared.json"), "utf8")) as ProofManifest;
  const frozen = await verifySourceSnapshot(manifest.sourceDirectory);
  if (frozen.sourceHash !== manifest.sourceHash || frozen.dependencyHash !== manifest.dependencyHash) throw new Error("Text proof source identity changed");
  async function checkFiles() {
    for (const [path, expected] of Object.entries(manifest.files)) if (digest(await readFile(join(directory, path))) !== expected) throw new Error(`Text proof input changed: ${path}`);
  }
  await checkFiles();
  const log = Bun.file(join(directory, "xcodebuild.log")).writer();
  const process = Bun.spawn(["xcodebuild", "test", "-scheme", "TextNativeProof-Package", "-destination", `platform=iOS Simulator,id=${simulator}`,
    "-derivedDataPath", ".build/DerivedData", "-resultBundlePath", "result.xcresult", "-parallel-testing-enabled", "NO"], { cwd: directory, stdout: "pipe", stderr: "pipe" });
  async function copy(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; log.write(value); }
    } finally { reader.releaseLock(); }
  }
  const [, , nativeExitCode] = await Promise.all([copy(process.stdout), copy(process.stderr), process.exited]); await log.end();
  await checkFiles(); await verifySourceSnapshot(manifest.sourceDirectory);
  let geometry: ReturnType<typeof checkTextNativeGeometry> | undefined, geometryError: string | undefined;
  if (nativeExitCode === 0) {
    try { geometry = checkTextNativeGeometry(await readFile(join(directory, "xcodebuild.log"), "utf8"), manifest.references); }
    catch (error) { geometryError = error instanceof Error ? error.message : String(error); }
  }
  const exitCode = nativeExitCode || (geometryError ? 1 : 0);
  const results: Record<string, string> = {};
  for await (const path of new Bun.Glob("**/*").scan({ cwd: directory, onlyFiles: true, dot: true })) {
    if ((path.startsWith("result.xcresult/") || path.endsWith(".png") || path === "xcodebuild.log") && !path.startsWith(".build/")) results[path] = digest(await readFile(join(directory, path)));
  }
  await writeFile(join(directory, "executed.json"), JSON.stringify({ sourceHash: manifest.sourceHash, dependencyHash: manifest.dependencyHash,
    preparedHash: digest(await readFile(join(directory, "prepared.json"))), exitCode, nativeExitCode, geometry, geometryError, executedAt: new Date().toISOString(), results }, null, 2));
  return exitCode;
}

if (import.meta.main) {
  const [phase, directory, simulator] = Bun.argv.slice(2);
  if (phase === "prepare" && directory) console.log(await prepareTextNativeProof(directory));
  else if (phase === "execute" && directory && simulator) process.exit(await executeTextNativeProof(resolve(directory), simulator));
  else throw new Error("Usage: text-native-proof.ts prepare <absolute-output> | execute <output> <simulator-id>");
}
