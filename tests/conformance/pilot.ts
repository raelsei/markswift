import { resolve, join } from "node:path";
import { stat } from "node:fs/promises";

export interface PilotCase {
  id: string;
  feature: string;
  tier: "native" | "approximation" | "unsupported";
  fixture: string;
  themes: Array<"light" | "dark">;
  diagnosticFamily: string | null;
  expectedText?: string;
  expectedLines?: { "320": number; "390": number };
  /** Element ids (`#id`) whose browser vs native region mismatch the gate records. */
  anchors?: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function validatePilot(raw: unknown, fixtureRoot: string): Promise<PilotCase[]> {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.cases) || raw.cases.length === 0)
    throw new Error("pilot manifest needs version 1 and nonempty cases");
  const seen = new Set<string>();
  const cases: PilotCase[] = [];
  for (const entry of raw.cases) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(entry.id) || seen.has(entry.id))
      throw new Error(`invalid or duplicate pilot id: ${String(entry?.id)}`);
    seen.add(entry.id);
    if (typeof entry.feature !== "string" || !entry.feature.trim())
      throw new Error(`pilot ${entry.id}: missing feature`);
    if (!["native", "approximation", "unsupported"].includes(String(entry.tier)))
      throw new Error(`pilot ${entry.id}: invalid tier`);
    if (typeof entry.diagnosticFamily !== "string" && entry.diagnosticFamily !== null)
      throw new Error(`pilot ${entry.id}: invalid diagnostic family`);
    if (entry.expectedText !== undefined && (typeof entry.expectedText !== "string" || !entry.expectedText.length))
      throw new Error(`pilot ${entry.id}: invalid expected text`);
    const lines = entry.expectedLines;
    if (
      lines !== undefined &&
      (!isRecord(lines) || !["320", "390"].every((width) => Number.isInteger(lines[width]) && Number(lines[width]) > 0))
    )
      throw new Error(`pilot ${entry.id}: invalid expected lines`);
    const anchors = entry.anchors;
    if (
      anchors !== undefined &&
      (!Array.isArray(anchors) ||
        !anchors.length ||
        new Set(anchors).size !== anchors.length ||
        anchors.some((a) => typeof a !== "string" || !/^#[a-z][a-z0-9-]*$/.test(a)))
    )
      throw new Error(`pilot ${entry.id}: invalid anchors`);
    if (entry.tier !== "native" && !entry.diagnosticFamily)
      throw new Error(`pilot ${entry.id}: expected diagnostic family`);
    if (
      !Array.isArray(entry.themes) ||
      !entry.themes.length ||
      entry.themes.some((theme) => theme !== "light" && theme !== "dark") ||
      new Set(entry.themes).size !== entry.themes.length
    )
      throw new Error(`pilot ${entry.id}: invalid themes`);
    if (typeof entry.fixture !== "string" || !/^[a-z0-9-]+\/[a-z0-9-]+\.html$/.test(entry.fixture))
      throw new Error(`pilot ${entry.id}: invalid fixture path`);
    const file = resolve(fixtureRoot, entry.fixture);
    if (!file.startsWith(resolve(fixtureRoot) + "/") || !(await stat(file).catch(() => undefined))?.isFile())
      throw new Error(`pilot ${entry.id}: fixture not found: ${entry.fixture}`);
    cases.push(entry as unknown as PilotCase);
  }
  return cases;
}

const FIXTURES = join(import.meta.dir, "fixtures");

export async function loadPilot(path = join(import.meta.dir, "pilot.json")): Promise<PilotCase[]> {
  return validatePilot(await Bun.file(path).json(), FIXTURES);
}

/** What the runner needs from a case; pilot.json cases add feature, tier and diagnostic expectations. */
export type RunCase = Pick<PilotCase, "id" | "fixture" | "themes" | "expectedText" | "expectedLines" | "anchors">;

/** Every `fixtures/<domain>/*.html` (`_`-prefixed dirs excluded). Pilot cases keep their id and expectations;
 * the rest are named by file stem and use the themes in `<meta name="markswift-themes">` (default light). */
export async function loadFixtureSet(pilot: PilotCase[]): Promise<RunCase[]> {
  const cases: RunCase[] = [...pilot];
  const piloted = new Set(pilot.map((item) => item.fixture));
  for (const fixture of (await Array.fromAsync(new Bun.Glob("*/*.html").scan(FIXTURES))).sort()) {
    if (fixture.startsWith("_") || piloted.has(fixture)) continue;
    const id = fixture.slice(fixture.indexOf("/") + 1, -".html".length);
    if (cases.some((item) => item.id === id)) throw new Error(`duplicate fixture case id: ${id} (${fixture})`);
    const themes = /<meta name="markswift-themes" content="([^"]*)"/.exec(
      await Bun.file(join(FIXTURES, fixture)).text(),
    )?.[1];
    cases.push({ id, fixture, themes: themes ? (themes.split(",") as RunCase["themes"]) : ["light"] });
  }
  return cases;
}

export interface PilotEntry {
  key: string;
  case: RunCase;
  width: number;
  theme: "light" | "dark";
  mode: "app" | "fidelity";
}

export function buildMatrix(cases: RunCase[]): PilotEntry[] {
  return cases.flatMap((item) =>
    [320, 390].flatMap((width) =>
      item.themes.flatMap((theme) =>
        (["app", "fidelity"] as const).map((mode) => ({
          key: `${item.id}-${width}-${theme}-${mode}`,
          case: item,
          width,
          theme,
          mode,
        })),
      ),
    ),
  );
}

if (import.meta.main) {
  const command = process.argv[2];
  if (command === "--validate" || command === "--list") {
    try {
      for (const item of await loadPilot()) console.log(item.id);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  } else {
    console.error("usage: bun tests/conformance/pilot.ts --validate|--list");
    process.exitCode = 2;
  }
}
