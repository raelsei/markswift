import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The chapters in reading order; `slug` is the path under the site base. */
export const chapters = [
  { slug: "", title: "Overview" },
  { slug: "capture/", title: "Capture" },
  { slug: "layoutdoc/", title: "LayoutDoc" },
  { slug: "ir/", title: "Semantic IR" },
  { slug: "swiftui/", title: "SwiftUI" },
  { slug: "runtime/", title: "Runtime" },
  { slug: "verification/", title: "Verification" },
  { slug: "use/", title: "Use it" },
  { slug: "limits/", title: "Limits" },
] as const;

/** A file of the repository this site documents, read at build time. */
export const readRepo = (path: string) => readFileSync(resolve(process.cwd(), "..", path), "utf8");

export const version: string = JSON.parse(readRepo("package.json")).version;
export const layoutDocVersion = readRepo("src/model/layout.ts").match(/LAYOUT_DOC_VERSION = (\d+)/)![1];
/** The repository revision every artifact in `src/artifacts/` was produced from. */
export const artifactRevision = "90bba3d";

/** One recorded run from `artifacts/transcript.txt`: its `$ command` line and everything it printed. */
export function run(transcript: string, command: string): string {
  const lines = transcript.split("\n");
  const at = lines.indexOf(`$ ${command}`);
  if (at < 0) throw new Error(`transcript has no run of ${command}`);
  const end = lines.findIndex((l, i) => i > at && l.startsWith("$ "));
  return lines.slice(at, end < 0 ? undefined : end).join("\n").trimEnd();
}

export const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** One apparatus entry in edition form: the lemma, a bracket, the reading. */
export const lemma = (l: string, reading: string) => `${l} <span class="sep" aria-hidden="true">]</span> ${reading}`;

/** The `Run` siglum: a recorded command as the lemma and what it printed as the reading. */
export function runEntry(transcript: string, command: string, more = ""): string {
  const [typed, ...printed] = run(transcript, command).split("\n");
  return lemma(`<code>${esc(typed!)}</code>`, `${printed.map((l) => `<code>${esc(l)}</code>`).join("<br>")}${more}`);
}

export const github = "https://github.com/raelsei/markswift";
export const blob = (path: string) => `${github}/blob/main/${path}`;

/** One spread cell: a line of text, or a rendered image. */
export type Cell = string | { src: string; alt: string; width: number; height: number };
/** One spread row: verso and recto. A `## name` cell names the source the following lines come from. */
export type Row = [verso: Cell, recto: Cell];

export const isHead = (c: Cell): c is string => typeof c === "string" && c.startsWith("## ");
export const isCut = (c: Cell) => typeof c === "string" && /^(\/\/ )?…$/.test(c.trim());

/**
 * Throws unless one page's text lines are verbatim lines of its sources, in source order, with every skipped
 * stretch marked by a cut row (`…` or `// …`). Indentation and blank lines are not compared.
 */
export function checkVerbatim(cells: Cell[], sources: Record<string, string>, page: string): void {
  let lines: string[] = [];
  let at = 0;
  let free = true;
  for (const cell of cells) {
    if (typeof cell !== "string" || !cell.trim()) continue;
    if (isHead(cell)) {
      const source = sources[cell.slice(3)];
      if (source === undefined) throw new Error(`${page}: no source named ${cell.slice(3)}`);
      lines = source.split("\n").map((l) => l.trim()).filter(Boolean);
      at = 0;
      free = true;
      continue;
    }
    if (isCut(cell)) {
      free = true;
      continue;
    }
    const line = cell.trim();
    const i = free ? lines.indexOf(line, at) : lines[at] === line ? at : -1;
    if (i < 0) throw new Error(`${page}: "${line}" is not ${free ? "a later line" : "the next line"} of its source`);
    at = i + 1;
    free = false;
  }
}
