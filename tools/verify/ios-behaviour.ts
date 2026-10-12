/**
 * V4b: converts the curated component cases, builds them into the XCUITest host app
 * (`tools/verify/ios-behaviour/`), runs it on the iOS simulator and judges what iOS exposed:
 * accessibility tree, Apple's audit, Dynamic Type height (R7), RTL mirroring and interaction.
 *
 *   bun run tools/verify/ios-behaviour.ts [--build-only] --out <fresh dir>
 */
import type { Page } from "playwright-core";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { inferScreen } from "../../src/analysis/infer.ts";
import { convert } from "../../src/index.ts";
import { walk } from "../../src/model/semantic.ts";
import { controlMembers } from "../../src/swift/control-state.ts";
import { nearestTextStyle } from "../../src/swift/format.ts";
import { browserAxNodes, normalizeName, type AxNamed } from "./ax.ts";
import { ensureSimulator } from "./native.ts";
import { command } from "./process.ts";

const ROOT = resolve(import.meta.dir, "../..");
const FIXTURES = join(ROOT, "tests/conformance/fixtures");
const PROJECT_DIR = join(import.meta.dir, "ios-behaviour");
const GENERATED = join(PROJECT_DIR, "Generated");
const PROJECT = join(PROJECT_DIR, "MarkswiftBehaviour.xcodeproj");
/**
 * `@ScaledMetric(relativeTo:)` / `.custom(_:size:relativeTo:)` multiplier of each `Font.TextStyle` at
 * `.accessibilityExtraLarge` (AX3, `UICTContentSizeCategoryAccessibilityXL`) over `.large`, for a 100 pt value.
 * Not the text styles' own point-size ratios (body 40/17 = 2.35): app-mode text scales a CSS size through UIFontMetrics,
 * whose curve is flatter for titles and steeper for captions.
 * ponytail: calibration measured with SwiftUI ImageRenderer + UIFontMetrics on iPhone 17 Pro / iOS 27.0 (2026-10-12);
 * re-measure when Apple changes the Dynamic Type curves.
 */
const AX3_FACTOR: Record<string, number> = {
  largeTitle: 1.49,
  title: 1.68,
  title2: 1.86,
  title3: 2.04,
  body: 2.18,
  callout: 2.19,
  subheadline: 2.15,
  footnote: 2.22,
  caption: 2.44,
  caption2: 2.69,
};

interface Known {
  case: string;
  check: string;
  match: string;
  reason: string;
  owner: string;
}
interface Failure {
  case: string;
  check: string;
  match: string;
  detail: string;
}
interface Prepared {
  id: string;
  view: string;
  ax: AxNamed[];
  chromeHeightAx3: number;
  pickers: Array<{ current: string; next: string }>;
  /** Option names of every picker: a closed picker exposes only its selection, and a menu picker's value is one of these. */
  pickerValues: string[];
  /** The screen's own action members in source order (= its `init` order); `live` = some element calling it is enabled. */
  actions: Array<{ name: string; takesArgs: boolean; live: boolean }>;
  fonts: boolean;
}
interface El {
  type: string;
  label: string;
  identifier: string;
  value: string;
  selected: boolean;
  frame: [number, number, number, number];
  children: El[];
}
interface AuditIssue {
  type: string;
  label: string;
  description: string;
}
interface CaseLog {
  launches: {
    large?: {
      tree: El;
      audit: AuditIssue[];
      rootHeight: number;
      interactions: {
        switches: Array<{ label: string; before: string; after: string }>;
        fields: Array<{ type: string; label: string; value: string }>;
        pickers: Array<{ current: string; next: string; reached: boolean }>;
        log: string;
      };
    };
    rtl?: { tree: El };
    xSmall?: { audit: AuditIssue[] };
    ax5?: { audit: AuditIssue[] };
    ax3?: { rootHeight: number };
  };
  errors: string[];
}

/** XCUITest element types an iOS counterpart of a Chrome role may have. */
const SNAPSHOT_TYPES: Record<string, string[]> = {
  button: ["button"],
  tab: ["button"],
  menuitem: ["button"],
  option: ["button"],
  link: ["link", "button"],
  heading: ["staticText", "other"],
  image: ["image"],
  img: ["image"],
  checkbox: ["switch", "toggle", "button"],
  switch: ["switch", "toggle", "button"],
  radio: ["button", "switch"],
  textbox: ["textField", "secureTextField", "textView", "searchField"],
  searchbox: ["textField", "secureTextField", "textView", "searchField"],
  combobox: ["button", "popUpButton", "picker"],
  slider: ["slider"],
  progressbar: ["progressIndicator", "other"],
  meter: ["progressIndicator", "other"],
};
const FIELD_TYPES: Record<string, true> = { textField: true, secureTextField: true, textView: true, searchField: true };
const TEXT_TYPES: Record<string, true> = { staticText: true, button: true, link: true, other: true };
const FAILING_AUDITS: Record<string, true> = {
  dynamicType: true,
  textClipped: true,
  sufficientElementDescription: true,
  trait: true,
};

/** iOS joins a combined element's parts with ", "; Chrome with a space. */
const flat = (s: string) => normalizeName(s.replace(/,/g, " "));

/** The `markswift.root` element and its descendants, in document order (scroll bars and the log are outside it). */
function elements(tree: El): El[] {
  const out: El[] = [];
  const visit = (e: El, inside: boolean) => {
    const now = inside || e.identifier === "markswift.root";
    if (now) out.push(e);
    for (const c of e.children) visit(c, now);
  };
  visit(tree, false);
  return out;
}

/**
 * R7 page at AX3, as the app-mode emitter scales it: each element's font-size (and px line-height, which native text
 * derives from the same scaled size) grows by the AX3 factor of the text style `nearestTextStyle` maps it to, and every
 * HTML box with an authored height that holds text or a form control turns that height into a floor (`min-height`):
 * app mode never pins text in a box (Chrome would overflow or clip it), so neither does the reference.
 */
export async function scaleToAx3(page: Page) {
  const root = "[data-markswift-root], [data-markswift-root] *";
  const sizes = await page.evaluate(
    (root) => [...new Set([...document.querySelectorAll(root)].map((e) => getComputedStyle(e).fontSize))],
    root,
  );
  const factors = Object.fromEntries(sizes.map((s) => [s, AX3_FACTOR[nearestTextStyle(Number.parseFloat(s))]!]));
  await page.evaluate(
    ({ root, factors }) => {
      const all = [...document.querySelectorAll<HTMLElement>(root)];
      const before = all.map((e) => {
        const s = getComputedStyle(e);
        const floor =
          e instanceof HTMLElement &&
          e.computedStyleMap().get("height")?.toString() !== "auto" &&
          (/\S/.test(e.textContent ?? "") ||
            /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) ||
            !!e.querySelector("input, select, textarea"));
        return { fontSize: s.fontSize, lineHeight: s.lineHeight, height: floor ? s.height : undefined };
      });
      all.forEach((e, i) => {
        const { fontSize, lineHeight, height } = before[i]!;
        const scale = factors[fontSize]!;
        e.style.setProperty("font-size", `${Number.parseFloat(fontSize) * scale}px`, "important");
        if (lineHeight.endsWith("px"))
          e.style.setProperty("line-height", `${Number.parseFloat(lineHeight) * scale}px`, "important");
        if (height?.endsWith("px")) {
          e.style.setProperty("min-height", height, "important");
          e.style.setProperty("height", "auto", "important");
        }
      });
    },
    { root, factors },
  );
}

async function prepareCase(id: string): Promise<{ prepared: Prepared; files: Record<string, Uint8Array> }> {
  const fixture = join(FIXTURES, "components", `${id}.html`);
  const view = `Behaviour${id.replace(/(^|-)(\w)/g, (_, _dash, c: string) => c.toUpperCase())}`;
  let ax: AxNamed[] = [];
  const result = await convert(
    { file: fixture },
    {
      name: view,
      mode: "app",
      theme: "light",
      browserChannel: "chromium",
      // `prepare` collects this capture's AX nodes; a probe capture's second `prepare` would overwrite them.
      probe: false,
      prepare: async (page) => {
        ax = await browserAxNodes(page, "[data-markswift-root]");
      },
    },
  );
  const scaled = await convert(
    { file: fixture },
    {
      name: view,
      mode: "app",
      theme: "light",
      browserChannel: "chromium",
      probe: false,
      prepare: scaleToAx3,
    },
  );
  const screen = inferScreen(result.layout, id);
  const pickers: Prepared["pickers"] = [];
  const pickerValues: string[] = [];
  walk(screen.root, (n) => {
    if (n.kind !== "control" || n.control !== "picker") return;
    pickerValues.push(...(n.options ?? []));
    const current = n.value ?? n.options?.[0];
    const next = n.options?.find((o) => o !== current);
    if (current && next) pickers.push({ current, next });
  });
  const code = result.files[`${view}.swift`] ?? "";
  // Callbacks only disabled elements call cannot fire: `controlMembers` is the emitter's own key → member naming.
  const { actionOf } = controlMembers(screen.root);
  const live: Record<string, true> = {};
  walk(screen.root, (n) => {
    if ((n.kind === "control" && n.disabled) || n.a11y?.disabled) return;
    for (const a of [n.action, ...(n.kind === "text" ? n.runs.map((r) => r.link?.action) : [])]) {
      const name = a && actionOf.get(a.key);
      if (name) live[name] = true;
    }
  });
  const actions = [...code.matchAll(/^ {4}(?:public )?var (on[A-Z]\w*): (\([^)]*\)) -> Void/gm)].map((m) => ({
    name: m[1]!,
    takesArgs: m[2] !== "()",
    live: !!live[m[1]!],
  }));
  const files: Record<string, Uint8Array> = {};
  for (const [name, source] of Object.entries(result.files))
    if (name.endsWith(".swift")) files[name] = new TextEncoder().encode(source);
  for (const [path, bytes] of Object.entries(result.assets)) files[basename(path)] = bytes;
  return {
    prepared: {
      id,
      view,
      ax,
      chromeHeightAx3: scaled.layout.size.h,
      pickers,
      pickerValues,
      actions,
      fonts: `${view}+Fonts.swift` in result.files,
    },
    files,
  };
}

function registrySwift(entries: Prepared[]) {
  const fonts = entries.filter((e) => e.fonts).map((e) => `        ${e.view}.BundledFonts.register(in: .main)`);
  const cases = entries.map(({ view, actions }) => {
    const args = actions.map(
      (a) => `${a.name}: { ${a.takesArgs ? "_ in " : ""}BehaviourLog.shared.hit(${JSON.stringify(a.name)}) }`,
    );
    return `        case ${JSON.stringify(view)}: ${view}(${args.join(", ")})`;
  });
  return `// Generated by tools/verify/ios-behaviour.ts — do not edit.
import SwiftUI

enum BehaviourRegistry {
    static func registerFonts() {
${fonts.join("\n")}
    }

    @ViewBuilder static func view(named name: String) -> some View {
        switch name {
${cases.join("\n")}
        default: Text("unknown \\(name)")
        }
    }
}
`;
}

function judge(item: Prepared, log: CaseLog | undefined) {
  const failures: Failure[] = [];
  const hitRegion: AuditIssue[] = [];
  const errors = log ? log.errors.map((e) => `${item.id}: ${e}`) : [`${item.id}: no result file`];
  const fail = (check: string, match: string, detail: string) => failures.push({ case: item.id, check, match, detail });
  const large = log?.launches.large;
  if (log && !large) errors.push(`${item.id}: large launch missing`);
  if (large) {
    const all = elements(large.tree);
    const text = flat(
      all
        .filter((e) => TEXT_TYPES[e.type])
        .map((e) => e.label)
        .join(" "),
    );
    for (const { role, name: chromeName } of item.ax) {
      if (role === "option" && item.pickerValues.some((o) => normalizeName(o) === chromeName)) continue; // covered by interaction
      const name = flat(chromeName);
      const types = SNAPSHOT_TYPES[role];
      const found = types
        ? all.some(
            (e) =>
              types.includes(e.type) &&
              (flat(e.label).includes(name) || (FIELD_TYPES[e.type] && flat(e.value).includes(name))),
          )
        : text.includes(name);
      if (!found)
        fail("snapshot", `${role}:${chromeName}`, `no ${types?.join("/") ?? "text"} element exposes "${chromeName}"`);
    }
    const ix = large.interactions;
    for (const s of ix.switches)
      if (s.before === s.after) fail("interaction", `switch:${s.label}`, `value stayed ${s.before}`);
    for (const f of ix.fields)
      if (!(f.type === "secureTextField" ? /•{2}/.test(f.value) : f.value.includes("mk")))
        fail("interaction", `field:${f.label}`, `value after typing: "${f.value}"`);
    for (const p of ix.pickers)
      if (!p.reached) fail("interaction", `picker:${p.next}`, `could not select "${p.next}" from "${p.current}"`);
    const hits = ix.log.split(",");
    for (const { name, live } of item.actions)
      if (live && !hits.includes(name)) fail("interaction", `action:${name}`, "never called");
  }
  for (const [size, launch] of [
    ["large", large],
    ["xSmall", log?.launches.xSmall],
    ["ax5", log?.launches.ax5],
  ] as const) {
    if (log && !launch) errors.push(`${item.id}: ${size} launch missing`);
    for (const issue of launch?.audit ?? []) {
      if (issue.type === "hitRegion") hitRegion.push(issue);
      else if (FAILING_AUDITS[issue.type])
        fail(`audit:${issue.type}`, issue.label || issue.description, `${size}: ${issue.description}`);
    }
  }
  const ax3 = log?.launches.ax3;
  if (log && !ax3) errors.push(`${item.id}: ax3 launch missing`);
  if (ax3 && Math.abs(ax3.rootHeight / item.chromeHeightAx3 - 1) > 0.1)
    fail("height", "rootHeight", `AX3 root ${ax3.rootHeight} pt vs Chrome AX3-scaled ${item.chromeHeightAx3} px`);
  const rtl = log?.launches.rtl;
  if (log && !rtl) errors.push(`${item.id}: rtl launch missing`);
  if (large && rtl) {
    const keyed = (tree: El) => {
      const seen: Record<string, number> = {};
      const out: Record<string, El> = {};
      for (const e of elements(tree)) {
        // System scroll indicators (a TextEditor's) sit on the scroll view's trailing edge, not in the design's layout.
        if (!e.label || !e.frame[2] || !e.frame[3] || /scroll bar/i.test(e.label)) continue;
        const key = `${e.type}:${e.label}`;
        seen[key] = (seen[key] ?? -1) + 1;
        out[`${key}#${seen[key]}`] = e;
      }
      return out;
    };
    const R = elements(large.tree)[0]?.frame;
    const RR = elements(rtl.tree)[0]?.frame;
    if (!R || !RR) errors.push(`${item.id}: markswift.root missing from the rtl comparison`);
    else {
      const ltr = keyed(large.tree);
      for (const [key, r] of Object.entries(keyed(rtl.tree))) {
        const l = ltr[key];
        if (!l) continue;
        // Mirrored: the LTR leading edge's inset becomes the RTL trailing edge's, or (equal widths) the trailing one the leading
        // one's. Either suffices: text shaping can change a label's width by a few points between directions.
        const startMirrors = Math.abs(RR[0] + RR[2] - (r.frame[0] + r.frame[2]) - (l.frame[0] - R[0])) <= 1;
        const endMirrors = Math.abs(r.frame[0] - RR[0] - (R[0] + R[2] - (l.frame[0] + l.frame[2]))) <= 1;
        if (!(startMirrors || endMirrors) || Math.abs(r.frame[1] - l.frame[1]) > 1)
          fail("rtl", key.replace(/#\d+$/, ""), `ltr ${l.frame.join(",")} → rtl ${r.frame.join(",")}`);
      }
    }
  }
  return { failures, hitRegion, errors };
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: "string" }, "build-only": { type: "boolean" } } });
  if (!values.out) throw new Error("usage: bun run tools/verify/ios-behaviour.ts [--build-only] --out <fresh dir>");
  const out = resolve(values.out);
  if ((await readdir(out).catch(() => [])).length) throw new Error(`--out ${out} is not empty`);
  await mkdir(out, { recursive: true });
  const spec = (await Bun.file(join(ROOT, "tests/conformance/ios-behaviour.json")).json()) as {
    cases: string[];
    known: Known[];
  };

  await rm(GENERATED, { recursive: true, force: true });
  await mkdir(GENERATED, { recursive: true });
  const written: Record<string, Uint8Array> = {};
  const prepared: Prepared[] = [];
  for (const id of spec.cases) {
    const { prepared: item, files } = await prepareCase(id);
    for (const [name, bytes] of Object.entries(files)) {
      const prior = written[name];
      if (prior && !Buffer.from(prior).equals(Buffer.from(bytes)))
        throw new Error(`${id}: ${name} differs from the copy another case wrote`);
      written[name] = bytes;
      await Bun.write(join(GENERATED, name), bytes);
    }
    prepared.push(item);
    console.log(`converted ${id}`);
  }
  await Bun.write(join(GENERATED, "Registry.swift"), registrySwift(prepared));
  await Bun.write(
    join(out, "cases.json"),
    JSON.stringify(
      prepared.map(({ view, pickers, pickerValues, actions }) => ({
        view,
        pickers,
        pickerValues,
        actions: actions.map((a) => a.name),
      })),
    ),
  );

  const dd = join(out, "_dd");
  const xcode = ["xcodebuild", "-project", PROJECT, "-scheme", "Behaviour", "-derivedDataPath", dd];
  await command(
    [...xcode, "build-for-testing", "-destination", "generic/platform=iOS Simulator", "-quiet"],
    ROOT,
    1_800_000,
  );
  if (values["build-only"]) {
    console.log("built");
    return;
  }

  const sim = await ensureSimulator();
  const runErrors: string[] = [];
  try {
    // xcodebuild hands `TEST_RUNNER_`-prefixed variables to the test process without the prefix.
    await command(
      [
        "env",
        `TEST_RUNNER_MARKSWIFT_BEHAVIOUR_DIR=${out}`,
        ...xcode,
        "test-without-building",
        "-destination",
        `id=${sim.udid}`,
        "-resultBundlePath",
        join(out, "_result.xcresult"),
      ],
      ROOT,
      3_600_000,
    );
  } catch (error) {
    runErrors.push(`xcodebuild test-without-building: ${String(error).slice(-4000)}`);
  }

  const cases: Record<string, { failures: Failure[] }> = {};
  const all: Failure[] = [];
  const hitRegion: Array<AuditIssue & { case: string }> = [];
  const errors = [...runErrors];
  for (const item of prepared) {
    const file = Bun.file(join(out, `${item.view}.json`));
    const log = (await file.exists()) ? ((await file.json()) as CaseLog) : undefined;
    const judged = judge(item, log);
    cases[item.id] = { failures: judged.failures };
    all.push(...judged.failures);
    hitRegion.push(...judged.hitRegion.map((h) => ({ ...h, case: item.id })));
    errors.push(...judged.errors);
  }
  const used = new Set<Known>();
  const unknownFailures = all.filter((f) => {
    const known = spec.known.find((k) => k.case === f.case && k.check === f.check && k.match === f.match);
    if (known) used.add(known);
    return !known;
  });
  const staleKnown = spec.known.filter((k) => !used.has(k));
  const ok = !unknownFailures.length && !staleKnown.length && !errors.length;
  const report = { ok, simulator: sim, cases, unknownFailures, staleKnown, hitRegion, errors };
  await Bun.write(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `${ok ? "ok" : "FAILED"}: ${unknownFailures.length} unknown failures, ${staleKnown.length} stale known, ${errors.length} errors, ${hitRegion.length} hit-region findings → ${join(out, "report.json")}`,
  );
  if (!ok) process.exit(1);
}

if (import.meta.main) await main();
