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
  /** From the fixture's `markswift-reflow` meta (see `reflowTag`); set by the loaders, never by pilot.json. */
  reflow?: "native" | "pinned";
  /** Frame times (ms) from `markswift-motion` / `markswift-motion-reduced` metas (see `motionTag`); set by the loaders. */
  motion?: number[];
  motionReduced?: number[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `<meta name="markswift-reflow" content="native|pinned">`: native = app output must reflow like Chrome (its app Δ
 * is gated), pinned = known reflow gap (Δ measured and reported, never gated). Untagged = no reflow arm. */
export function reflowTag(html: string, id: string): RunCase["reflow"] {
  const tag = /<meta name="markswift-reflow" content="([^"]*)"/.exec(html)?.[1];
  if (tag === undefined) return undefined;
  if (tag !== "native" && tag !== "pinned") throw new Error(`fixture ${id}: invalid markswift-reflow "${tag}"`);
  return tag;
}

/** `<meta name="markswift-motion" content="250,500">` (and `markswift-motion-reduced`): ascending integer ms at which
 * the 390 app capture is also frame-captured with every animation paused (`@t:<ms>`, `@reduced@t:<ms>` keys). */
export function motionTag(html: string, id: string): Pick<RunCase, "motion" | "motionReduced"> {
  const out: Pick<RunCase, "motion" | "motionReduced"> = {};
  for (const [name, key] of [
    ["markswift-motion", "motion"],
    ["markswift-motion-reduced", "motionReduced"],
  ] as const) {
    const tag = new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(html)?.[1];
    if (tag === undefined) continue;
    const times = tag.split(",").map((t) => t.trim());
    if (!times.every((t) => /^\d+$/.test(t)) || times.some((t, i) => i && Number(t) <= Number(times[i - 1])))
      throw new Error(`fixture ${id}: invalid ${name} "${tag}"`);
    out[key] = times.map(Number);
  }
  return out;
}

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
    const source = await Bun.file(file).text();
    const reflow = reflowTag(source, entry.id);
    if (reflow && entry.expectedText !== undefined)
      throw new Error(`pilot ${entry.id}: reflow-tagged cases cannot have expectedText`);
    cases.push({ ...(entry as unknown as PilotCase), ...(reflow ? { reflow } : {}), ...motionTag(source, entry.id) });
  }
  return cases;
}

const FIXTURES = join(import.meta.dir, "fixtures");

export async function loadPilot(path = join(import.meta.dir, "pilot.json")): Promise<PilotCase[]> {
  return validatePilot(await Bun.file(path).json(), FIXTURES);
}

/** What the runner needs from a case; pilot.json cases add feature, tier and diagnostic expectations. */
export type RunCase = Pick<
  PilotCase,
  "id" | "fixture" | "themes" | "expectedText" | "expectedLines" | "anchors" | "reflow" | "motion" | "motionReduced"
>;

/** Every `fixtures/<domain>/*.html` (`_`-prefixed dirs excluded). Pilot cases keep their id and expectations;
 * the rest are named by file stem and use the themes in `<meta name="markswift-themes">` (default light). */
export async function loadFixtureSet(pilot: PilotCase[]): Promise<RunCase[]> {
  const cases: RunCase[] = [...pilot];
  const piloted = new Set(pilot.map((item) => item.fixture));
  for (const fixture of (await Array.fromAsync(new Bun.Glob("*/*.html").scan(FIXTURES))).sort()) {
    if (fixture.startsWith("_") || piloted.has(fixture)) continue;
    const id = fixture.slice(fixture.indexOf("/") + 1, -".html".length);
    if (cases.some((item) => item.id === id)) throw new Error(`duplicate fixture case id: ${id} (${fixture})`);
    const html = await Bun.file(join(FIXTURES, fixture)).text();
    const themes = /<meta name="markswift-themes" content="([^"]*)"/.exec(html)?.[1];
    const reflow = reflowTag(html, id);
    cases.push({
      id,
      fixture,
      themes: themes ? (themes.split(",") as RunCase["themes"]) : ["light"],
      ...(reflow ? { reflow } : {}),
      ...motionTag(html, id),
    });
  }
  return cases;
}

export interface PilotEntry {
  key: string;
  case: RunCase;
  width: number;
  theme: "light" | "dark";
  mode: "app" | "fidelity";
  /** Motion frame of the case's 390 app capture: every animation paused `t` ms in (`reduced`: under Reduce Motion). */
  frame?: { t: number; reduced: boolean };
}

/** Capture widths of a case. With --reflow a tagged case adds 768, and 390 comes first because the reflow arm reuses
 * its compiled code. */
export function widthsFor(item: RunCase, reflow = false): number[] {
  return reflow && item.reflow ? [390, 320, 768] : [320, 390];
}
/** Every capture; a motion-tagged case adds its frame entries per theme (390, `app`):
 * `<caseId>-390-<theme>-app@t:<ms>` and `<caseId>-390-<theme>-app@reduced@t:<ms>`. */
export function buildMatrix(cases: RunCase[], reflow = false): PilotEntry[] {
  return cases.flatMap((item) => [
    ...widthsFor(item, reflow).flatMap((width) =>
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
    ...item.themes.flatMap((theme) =>
      [
        ...(item.motion ?? []).map((t) => ({ t, reduced: false })),
        ...(item.motionReduced ?? []).map((t) => ({ t, reduced: true })),
      ].map((frame) => ({
        key: `${item.id}-390-${theme}-app${frame.reduced ? "@reduced" : ""}@t:${frame.t}`,
        case: item,
        width: 390,
        theme,
        mode: "app" as const,
        frame,
      })),
    ),
  ]);
}

/** Capture key of a layer's open state: `<caseId>-<width>-<theme>-<mode>@open:<layerId>` (390, `app` only). */
export const openKey = (key: string, layer: string) => `${key}@open:${layer}`;

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
