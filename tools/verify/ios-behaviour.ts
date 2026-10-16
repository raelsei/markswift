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
import { applyLayers } from "../../src/analysis/layers.ts";
import { convert } from "../../src/index.ts";
import { type SemNode, walk } from "../../src/model/semantic.ts";
import { cssTransform } from "../../src/css/transforms.ts";
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
  /** Texts of the `<label>`s whose tap focuses a text field. */
  labels: string[];
  /** Labels of text fields whose focused look has a CSS transition: the look must still arrive (also under Reduce Motion). */
  focusLooks: string[];
  /** The screen's own action members in source order (= its `init` order); `live` = some element calling it is enabled. */
  actions: Array<{ name: string; takesArgs: boolean; live: boolean }>;
  /** In-flow layers of the app screen: tapping the button labelled `trigger` shows the text `shows`, and hides it again.
   * Drawn presentations (060): the trigger (long-pressed when `longPress`) shows `shows`; each of `closers` (the
   * content's dismissing buttons) closes it; a tap at the root's normalised `outsidePoint` closes it iff `outside`;
   * `buttons` are the content's other buttons, tapped so their actions log. */
  layers: Array<
    | { id: string; kind: "inflow"; trigger: string; shows: string }
    | {
        id: string;
        kind: "presentation";
        trigger: string;
        shows: string;
        closers: string[];
        buttons: string[];
        outside: boolean;
        modal: boolean;
        longPress: boolean;
        outsidePoint: [number, number];
      }
  >;
  fonts: boolean;
  /** `live`: some node animates; `reduced`: some node still animates under Reduce Motion (`reduced ?? animations`). */
  motion: { live: boolean; reduced: boolean };
  /** `markswift-breakpoints` widths (empty for other cases): every launch frames the view at the first; with two or more,
   * the `bands` launch switches between them. */
  widths: number[];
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
        labels: Array<{ label: string; focused: boolean }>;
        focusLooks: Array<{ label: string; changed: boolean }>;
        log: string;
      };
      /** Presentations add: the trigger still exposed while open, closed per closer label, closed by the outside tap,
       * and the log after tapping the content's buttons. */
      layers?: Array<{
        id: string;
        opened: boolean;
        closed?: boolean;
        triggerExposed?: boolean;
        closers?: Record<string, boolean>;
        outside?: boolean;
        log?: string;
      }>;
    };
    rtl?: { tree: El };
    xSmall?: { audit: AuditIssue[] };
    ax5?: { audit: AuditIssue[] };
    ax3?: { rootHeight: number };
    /** Live clock: SHA-256 of two root screenshots 300 ms apart (Reduce Motion forced in `motionReduced`). */
    motion?: { frames: string[] };
    motionReduced?: { frames: string[] };
    /** Band switch (cases with ≥ 2 widths): text fields' and switches' values and the root's element count per control
     * label, before the first width switch, after it and after switching back; `audit` after the first switch. */
    bands?: {
      snapshots: Array<{ values: Record<string, string>; counts: Record<string, number> }>;
      audit: AuditIssue[];
    };
    /** `interactions.focusLooks` again with Reduce Motion forced. */
    focusReduced?: { focusLooks: Array<{ label: string; changed: boolean }> };
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
  // `<dir>/<name>` names a fixture outside components/ (a test-only `_behaviour/` case).
  const fixture = join(FIXTURES, id.includes("/") ? `${id}.html` : join("components", `${id}.html`));
  const view = `Behaviour${basename(id).replace(/(^|-+)(\w)/g, (_, _dash, c: string) => c.toUpperCase())}`;
  let ax: AxNamed[] = [];
  // A breakpoint fixture converts across its bands (054), its first capture at its first width.
  const widths =
    /<meta name="markswift-breakpoints" content="([^"]*)"/
      .exec(await Bun.file(fixture).text())?.[1]
      ?.split(",")
      .map(Number) ?? [];
  const bands = widths.length
    ? {
        viewport: { width: widths[0]!, height: 844 },
        breakpoints: { devices: widths.map((width) => ({ width, height: 844 })) },
      }
    : {};
  const result = await convert(
    { file: fixture },
    {
      name: view,
      mode: "app",
      theme: "light",
      browserChannel: "chromium",
      ...bands,
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
      ...bands,
      probe: false,
      prepare: scaleToAx3,
    },
  );
  const screen = inferScreen(result.layout, id);
  applyLayers(screen, result.layout);
  /** The text nodes under `n`, in order, whitespace collapsed (as iOS labels them). */
  const texts = (n: SemNode) => {
    const out: string[] = [];
    walk(n, (d) => {
      if (d.kind === "text")
        out.push(
          d.runs
            .map((r) => r.text)
            .join("")
            .replace(/\s+/g, " ")
            .trim(),
        );
    });
    return out.filter(Boolean);
  };
  const layers: Prepared["layers"] = [];
  walk(screen.root, (n) => {
    if (!n.opens) return;
    const opener = n.kind === "control" && n.control === "disclosure" ? n.label : n;
    const trigger = n.a11y?.label ?? (opener && texts(opener).join(" "));
    if (n.opens.kind === "presentation") {
      const id = n.opens.layer;
      const roots = screen.root.overlays.filter((o) => o.presentation?.id === id);
      const p = roots[0]?.presentation;
      const shows = roots.flatMap((o) => texts(o.node))[0];
      if (!p || !trigger || !shows) return;
      const buttons: SemNode[] = [];
      for (const o of roots)
        walk(o.node, (d) => {
          if (d.action) buttons.push(d);
        });
      const labels = (keep: (b: SemNode) => boolean) =>
        buttons
          .filter(keep)
          .map((b) => b.a11y?.label ?? texts(b).join(" "))
          .filter(Boolean);
      // The root corner farthest from the content's centre where Chrome painted it.
      const r = result.layout.root.bounds;
      const box = result.layout.layers
        ?.find((l) => l.id === id)
        ?.nodes.find((c) => c.bounds.w < r.w - 1 || c.bounds.h < r.h - 1);
      const t = box && cssTransform(box.styles, box.bounds.w, box.bounds.h).transform;
      const [cx, cy] = box
        ? [box.bounds.x + box.bounds.w / 2 + (t?.tx ?? 0), box.bounds.y + box.bounds.h / 2 + (t?.ty ?? 0)]
        : [r.x + r.w / 2, r.y + r.h / 2];
      const outsidePoint: [number, number] = [cx - r.x < r.w / 2 ? 0.98 : 0.02, cy - r.y < r.h / 2 ? 0.98 : 0.02];
      layers.push({
        id,
        kind: "presentation",
        trigger,
        shows,
        closers: labels((b) => p.dismiss.buttons.includes(b.id)),
        buttons: labels((b) => !p.dismiss.buttons.includes(b.id)),
        outside: p.dismiss.outside,
        modal: p.modal,
        longPress: !!n.opens.longPress,
        outsidePoint,
      });
      return;
    }
    const content: SemNode[] = [];
    walk(screen.root, (d) => {
      if (d.shownBy === n.opens!.layer) content.push(d);
    });
    if (n.kind === "control" && n.control === "disclosure") content.push(...n.content);
    const shows = content.flatMap(texts)[0];
    if (trigger && shows) layers.push({ id: n.opens.layer, kind: "inflow", trigger, shows });
  });
  const pickers: Prepared["pickers"] = [];
  const pickerValues: string[] = [];
  walk(screen.root, (n) => {
    if (n.kind !== "control" || n.control !== "picker") return;
    pickerValues.push(...(n.options ?? []).map((o) => o.label));
    const current = n.value ?? n.options?.[0]?.label;
    // A disabled option cannot be chosen, so the harness taps the next enabled one.
    const next = n.options?.find((o) => !o.disabled && o.label !== current)?.label;
    if (current && next) pickers.push({ current, next });
  });
  const motion = { live: false, reduced: false };
  walk(screen.root, (n) => {
    if (n.motion?.animations?.length) motion.live = true;
    if ((n.motion?.reduced ?? n.motion?.animations ?? []).length) motion.reduced = true;
  });
  const code = result.files[`${view}.swift`] ?? "";
  // Callbacks only disabled elements call cannot fire: `controlMembers` is the emitter's own key → member naming.
  const { actionOf, activate, focusOf } = controlMembers(screen.root, "app");
  // Text labels whose tap focuses a text field (`<label for>`): the harness taps each and expects that field focused.
  const focusable = new Set([...focusOf.keys()].map((n) => n.id));
  const labels: string[] = [];
  walk(screen.root, (n) => {
    if (n.kind === "text" && n.labelFor && focusable.has(n.labelFor) && activate.has(n.labelFor))
      labels.push(n.runs.map((r) => r.text).join(""));
  });
  const focusLooks: string[] = [];
  walk(screen.root, (n) => {
    const t = n.motion?.transitions?.focused;
    if (n.kind === "control" && focusOf.has(n) && t && Object.keys(t.in).length)
      focusLooks.push(n.a11y?.label ?? n.placeholder ?? "");
  });
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
      labels,
      focusLooks,
      actions,
      layers,
      fonts: `${view}+Fonts.swift` in result.files,
      motion,
      widths,
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
    // A tap on the selected radio keeps it selected (HTML and ARIA): only an unselected one must flip.
    const radios = new Set(item.ax.filter((a) => a.role === "radio").map((a) => flat(a.name)));
    for (const s of ix.switches)
      if (s.before === s.after && !(s.before === "1" && radios.has(flat(s.label))))
        fail("interaction", `switch:${s.label}`, `value stayed ${s.before}`);
    for (const f of ix.fields)
      if (!(f.type === "secureTextField" ? /•{2}/.test(f.value) : f.value.includes("mk")))
        fail("interaction", `field:${f.label}`, `value after typing: "${f.value}"`);
    for (const p of ix.pickers)
      if (!p.reached) fail("interaction", `picker:${p.next}`, `could not select "${p.next}" from "${p.current}"`);
    // HTML: tapping a field's `<label>` focuses the field.
    for (const l of ix.labels)
      if (!l.focused) fail("interaction", `label:${l.label}`, "tapping the label did not focus its field");
    for (const f of ix.focusLooks)
      if (!f.changed) fail("interaction", `focusLook:${f.label}`, "focused look never appeared after its transition");
    // A presentation's content buttons are tapped in their own launches (`layers`): their log hits count too.
    const hits = [ix.log, ...(large.layers ?? []).map((l) => l.log ?? "")].join(",").split(",");
    for (const { name, live } of item.actions)
      if (live && !hits.includes(name)) fail("interaction", `action:${name}`, "never called");
    // In-flow layers (plan 059): the trigger shows the content, and a second tap hides it. Presentations (060): the
    // trigger shows it, a modal one hides the trigger from VoiceOver, its closers and (iff dismissable) an outside tap close it.
    for (const layer of item.layers) {
      const { id } = layer;
      const run = large.layers?.find((l) => l.id === id);
      if (!run?.opened) fail("interaction", `layer:${id}`, "did not open");
      else if (layer.kind === "inflow") {
        if (!run.closed) fail("interaction", `layer:${id}`, "did not close");
      } else {
        if (layer.modal && run.triggerExposed) fail("interaction", `layer:${id}`, "not modal");
        for (const closer of layer.closers)
          if (!run.closers?.[closer]) fail("interaction", `layer:${id}`, `closer ${closer} did not close`);
        if (run.outside !== layer.outside) fail("interaction", `layer:${id}`, "outside tap");
      }
    }
  }
  // D-STATE-OWNERSHIP: a band switch keeps every typed value and toggle, and each control stays one element.
  const bands = log?.launches.bands;
  if (log && item.widths.length > 1 && !bands) errors.push(`${item.id}: bands launch missing`);
  if (bands) {
    const [first, ...rest] = bands.snapshots;
    for (const [label, value] of Object.entries(first?.values ?? {}))
      if (rest.some((s) => s.values[label] !== value))
        fail(
          "band-switch",
          label,
          `values across the switch: ${bands.snapshots.map((s) => s.values[label]).join(" → ")}`,
        );
    const labels = new Set(bands.snapshots.flatMap((s) => Object.keys(s.counts)));
    for (const label of labels)
      if (bands.snapshots.some((s) => s.counts[label] !== 1))
        fail(
          "band-switch",
          `count ${label}`,
          `elements per snapshot: ${bands.snapshots.map((s) => s.counts[label] ?? 0).join(", ")}`,
        );
  }
  for (const [size, launch] of [
    ["large", large],
    ["xSmall", log?.launches.xSmall],
    ["ax5", log?.launches.ax5],
    ...(item.widths.length > 1 ? ([["bands", bands]] as const) : []),
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
  if (item.focusLooks.length) {
    const reduced = log?.launches.focusReduced;
    if (log && !reduced) errors.push(`${item.id}: focusReduced launch missing`);
    for (const f of reduced?.focusLooks ?? [])
      if (!f.changed)
        fail("interaction", `focusLookReduced:${f.label}`, "focused look never appeared under Reduce Motion");
  }
  if (item.motion.live) {
    const live = log?.launches.motion;
    const reduced = log?.launches.motionReduced;
    if (log && (!live || !reduced)) errors.push(`${item.id}: motion launches missing`);
    if (live && live.frames[0] === live.frames[1]) fail("motion", "live", "two frames 300 ms apart are identical");
    // Equal frames under Reduce Motion are expected exactly when nothing survives it (D-MOTION).
    if (reduced && (reduced.frames[0] === reduced.frames[1]) === item.motion.reduced)
      fail(
        "motion",
        "reduced",
        item.motion.reduced
          ? "two frames 300 ms apart are identical under Reduce Motion"
          : "frames change under Reduce Motion although nothing should move",
      );
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
      prepared.map(({ view, pickers, pickerValues, labels, focusLooks, actions, layers, motion, widths }) => ({
        view,
        pickers,
        pickerValues,
        labels,
        focusLooks,
        actions: actions.map((a) => a.name),
        layers,
        motion,
        widths,
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
