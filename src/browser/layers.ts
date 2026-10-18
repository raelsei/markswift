/**
 * Open-state pass: find what can open (discovery in the rest page), open each trigger for real in a fresh
 * page, and keep the content that gained layout (LayoutDoc `layers`), the trigger's paint while open
 * (`states.open`) and how the layer is dismissed. Nothing here emits Swift.
 */
import type { CDPSession, Page } from "playwright-core";
import type { CaptureRequest, NodeIdentity, Trigger } from "../input/types.ts";
import type { Layer, LayoutNode, Rect } from "../model/layout.ts";
import type { Capture } from "./capture.ts";
import {
  findByAttr,
  pathChildren,
  pathOf,
  rawAt,
  snapshotToTree,
  toLayout,
  type DomSnapshot,
  type Raw,
} from "./snapshot.ts";
import { PAINT_KEYS } from "./states.ts";
import { recordAnimations } from "./motion.ts";
import { settle } from "./settle.ts";

/** Stamped through CDP on each layer root, valued by its paint-order index. */
export const LAYER_MARK = "data-markswift-layer-root";
/** At most this many triggers are opened per conversion. */
const MAX_TRIGGERS = 12;
/** At most this many buttons of a layer are clicked to find the ones that dismiss it. */
const MAX_DISMISS_BUTTONS = 8;
/** The snapshot `layerRoots` reads: opacity is `styles[li][0]`. */
const ROOTS_ARGS = { computedStyles: ["opacity"], includePaintOrder: true };
/** Before activation: what was laid out, and its paint (`openDelta`'s rest side). */
const PRE_ARGS = { computedStyles: [...PAINT_KEYS] };

type Activation = Layer["activation"];
interface Rule {
  /** `hint`: the value of `data-markswift-opens`. */
  activation: Activation | "hint";
  relation?: Layer["relation"];
  /** Only when the page runs script (an ARIA state nothing would ever flip is not a trigger). */
  scripted?: true;
}
/** Discovery rules, first match wins: native HTML, the author hint, then scripted ARIA/shadcn shapes. */
const TRIGGER_RULES: Record<string, Rule> = {
  "[popovertarget]": { activation: "click", relation: "popovertarget" },
  "button[commandfor]:is([command=show-modal i], [command=show-popover i], [command=toggle-popover i])": {
    activation: "click",
    relation: "commandfor",
  },
  "[interestfor]": { activation: "hover", relation: "interestfor" },
  "details:not([open]) > summary:first-of-type": { activation: "click", relation: "details" },
  "[data-markswift-opens]": { activation: "hint" },
  "[data-slot=tooltip-trigger], [data-slot=hover-card-trigger]": { activation: "hover", scripted: true },
  "[data-slot=context-menu-trigger]": { activation: "contextmenu", scripted: true },
  "[aria-haspopup]:not([aria-haspopup=false]), [aria-expanded=false]": { activation: "click", scripted: true },
};

/** Laid-out backend ids of a snapshot (layout.nodeIndex → nodes.backendNodeId). The content of a closed `<details>`
 * (all but its first `<summary>`) has boxes in DOMSnapshot but paints nothing (`::details-content` is
 * `content-visibility: hidden`), so it does not count. */
export function laidOut(snap: DomSnapshot): Set<number> {
  const { nodes, layout } = snap.documents[0]!;
  const name = (i: number) => snap.strings[nodes.nodeName[i]!];
  const closed = new Map<number, number | undefined>(); // closed <details> → its first <summary>
  nodes.parentIndex.forEach((p, i) => {
    if (name(i) === "DETAILS" && !nodes.attributes[i]!.some((s, k) => k % 2 === 0 && snap.strings[s] === "open"))
      closed.set(i, undefined);
    if (p >= 0 && closed.has(p) && closed.get(p) === undefined && name(i) === "SUMMARY") closed.set(p, i);
  });
  const hidden = (i: number) => {
    for (let c = i, p = nodes.parentIndex[i]!; p >= 0; c = p, p = nodes.parentIndex[p]!)
      if (closed.has(p) && closed.get(p) !== c) return true;
    return false;
  };
  return new Set(layout.nodeIndex.filter((i) => !hidden(i)).map((i) => nodes.backendNodeId![i]!));
}

/** New roots in paint order, excluding `exclude` (the trigger subtree's backend ids), zero-area
 * subtrees and opacity-0 roots. `snap` is taken with `ROOTS_ARGS`. */
export function layerRoots(before: Set<number>, snap: DomSnapshot, exclude: Set<number>): number[] {
  const { nodes, layout } = snap.documents[0]!;
  const ids = nodes.backendNodeId!;
  const pseudo = new Set(nodes.pseudoType?.index);
  const now = laidOut(snap);
  const fresh = new Set<number>();
  const area = new Set<number>(); // node indices whose subtree has a box of positive area
  const entry = new Map<number, number>(); // node index → its first layout index
  layout.nodeIndex.forEach((i, li) => {
    if (now.has(ids[i]!) && !before.has(ids[i]!)) fresh.add(i);
    if (!entry.has(i)) entry.set(i, li);
    const [, , w, h] = layout.bounds[li]!;
    if (w! > 0 && h! > 0) for (let p = i; p >= 0 && !area.has(p); p = nodes.parentIndex[p]!) area.add(p);
  });
  const paint = (i: number) => layout.paintOrders?.[entry.get(i)!] ?? 0;
  return [...fresh]
    .filter(
      (i) =>
        nodes.nodeType[i] === 1 &&
        !pseudo.has(i) &&
        !fresh.has(nodes.parentIndex[i]!) &&
        !exclude.has(ids[i]!) &&
        area.has(i) &&
        snap.strings[layout.styles[entry.get(i)!]?.[0] ?? -1] !== "0",
    )
    .sort((a, b) => paint(a) - paint(b))
    .map((i) => ids[i]!);
}

/** 2 px inside the first viewport corner (top-left, top-right, bottom-left, bottom-right) outside every rect; undefined when none. */
export function outsidePoint(
  rects: Rect[],
  viewport: { width: number; height: number },
): { x: number; y: number } | undefined {
  const { width: w, height: h } = viewport;
  return [
    { x: 2, y: 2 },
    { x: w - 2, y: 2 },
    { x: 2, y: h - 2 },
    { x: w - 2, y: h - 2 },
  ].find((p) => !rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h));
}

/** PAINT_KEYS of `open` that differ from `rest` (both `styles` records). */
export function openDelta(
  rest: Record<string, string>,
  open: Record<string, string>,
): Record<string, string> | undefined {
  const keys = PAINT_KEYS.filter((k) => open[k] !== undefined && open[k] !== rest[k]);
  return keys.length ? Object.fromEntries(keys.map((k) => [k, open[k]!])) : undefined;
}

/** Layer ids: slug of each name (diacritics dropped, first 4 words, `layer` when empty), made unique with `-2`, `-3`…. */
export function layerIds(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const words = name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    const base = words.filter(Boolean).slice(0, 4).join("-") || "layer";
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

/** Triggers inside `root` (document order) and the hint values that were not understood. */
export async function findTriggers(
  page: Page,
  root: string,
): Promise<{ triggers: Array<Omit<Trigger, "trigger">>; warnings: string[] }> {
  const found = await page.evaluate(
    ({ root, rules }) => {
      const top = document.querySelector(root)!;
      const scripted =
        document.scripts.length > 0 ||
        [...document.querySelectorAll("*")].some((e) => [...e.attributes].some((a) => a.name.startsWith("on")));
      const matched: Element[] = [];
      const triggers: Array<{ path: string; activation: string; relation?: string; name: string }> = [];
      const warnings: string[] = [];
      for (const el of top.querySelectorAll("*")) {
        if (matched.some((m) => m.contains(el))) continue;
        const rule = rules.find(([sel, r]) => (!r.scripted || scripted) && el.matches(sel))?.[1];
        if (!rule || !el.getClientRects().length) continue;
        if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") continue;
        let activation: string = rule.activation;
        if (activation === "hint") {
          activation = el.getAttribute("data-markswift-opens") ?? "";
          if (!["click", "hover", "contextmenu"].includes(activation)) {
            warnings.push(
              `data-markswift-opens="${activation}" is not click, hover or contextmenu; the element is not opened`,
            );
            continue;
          }
        }
        matched.push(el);
        const steps: number[] = [];
        for (let e = el; e !== top; e = e.parentElement!) steps.unshift([...e.parentElement!.children].indexOf(e));
        triggers.push({
          path: steps.join("/"),
          activation,
          ...(rule.relation ? { relation: rule.relation } : {}),
          name:
            el.getAttribute("aria-label")?.trim() || el.textContent?.trim() || el.getAttribute("title")?.trim() || "",
        });
      }
      return { triggers, warnings };
    },
    { root, rules: Object.entries(TRIGGER_RULES) },
  );
  const ids = layerIds(found.triggers.map((t) => t.name));
  return {
    // The page returns the rules' own values, typed as plain strings across `evaluate`.
    triggers: found.triggers.map(({ name: _, ...t }, i) => ({
      ...(t as Omit<Trigger, "trigger" | "id">),
      id: ids[i]!,
    })),
    warnings: found.warnings,
  };
}

/**
 * Scroll the trigger into view and activate it with the real mouse; false when it is not in the page. The animations
 * the activation starts are recorded (a short enter finishes before the layer is read).
 */
export async function activate(page: Page, root: string, trigger: Trigger): Promise<boolean> {
  const at = await page.evaluate(
    ({ root, path }) => {
      let el = document.querySelector(root) ?? undefined;
      for (const step of path ? path.split("/") : []) el = el?.children[Number(step)];
      if (!el) return undefined;
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    { root, path: trigger.path },
  );
  if (!at) return false;
  await recordAnimations(page);
  if (trigger.activation === "hover") {
    // ponytail: waits for the first mutation up to 1000 ms (a native `interestfor` popover mutates nothing, so it
    // always waits the full second); listen for `toggle` events too if that cost matters.
    const mutated = await page.evaluateHandle(() => {
      const { promise, resolve } = Promise.withResolvers<void>();
      const o = new MutationObserver(() => {
        o.disconnect();
        resolve();
      });
      o.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      setTimeout(resolve, 1000);
      return { done: promise };
    });
    await page.mouse.move(at.x, at.y);
    await mutated.evaluate((m) => m.done);
    await mutated.dispose();
  } else {
    await page.mouse.click(at.x, at.y, { button: trigger.activation === "contextmenu" ? "right" : "left" });
    // The trigger's :hover paint is not its open paint.
    await page.mouse.move(0, 0);
  }
  await page.evaluate(async () => {
    const frame = Promise.withResolvers<void>();
    requestAnimationFrame(() => requestAnimationFrame(() => frame.resolve()));
    await frame.promise;
    scrollTo(0, 0);
  });
  return true;
}

const snapshot = async (cdp: CDPSession, args: { computedStyles: string[]; includePaintOrder?: boolean }) =>
  (await cdp.send("DOMSnapshot.captureSnapshot", args)) as unknown as DomSnapshot;

/** The root, or an ancestor, is hidden from assistive technology (`aria-hidden`/`inert`). */
export const rootHidden = (page: Page, root: string): Promise<boolean> =>
  page.evaluate((root) => !!document.querySelector(root)?.closest("[aria-hidden=true], [inert]"), root);

/** An activated trigger in its open page. */
export interface Opening {
  /** Paint of every node laid out before activation, by backend id. */
  rest: Map<number, Record<string, string>>;
  /** The root (or an ancestor) was aria-hidden/inert before activation. */
  hidden: boolean;
  /** Backend ids of the layer roots in paint order (marked `LAYER_MARK="<i>"`); empty = nothing opened. */
  roots: number[];
  /** The step-3 diff is non-empty. */
  isOpen(): Promise<boolean>;
  /** Activate again when closed, then re-mark the roots. */
  reopen(): Promise<void>;
}

/**
 * Steps 2–3: snapshot, activate `trigger`, and mark the roots of what gained layout outside the trigger.
 * `rootMark` is the attribute the capture root carries. Undefined when the trigger is not in the page.
 */
export async function openLayer(
  page: Page,
  cdp: CDPSession,
  root: string,
  rootMark: string,
  trigger: Trigger,
): Promise<Opening | undefined> {
  const pre = await snapshot(cdp, PRE_ARGS);
  const before = laidOut(pre);
  const { nodes, layout } = pre.documents[0]!;
  const rest = new Map(
    layout.nodeIndex.map((i, li) => [
      nodes.backendNodeId![i]!,
      Object.fromEntries(
        PAINT_KEYS.flatMap((k, s) => (layout.styles[li]![s]! >= 0 ? [[k, pre.strings[layout.styles[li]![s]!]!]] : [])),
      ),
    ]),
  );
  const hidden = await rootHidden(page, root);
  if (!(await activate(page, root, trigger))) return undefined;
  let open = await snapshot(cdp, ROOTS_ARGS);
  // Structure only: the tree's styles are misread (this snapshot carries opacity alone).
  const triggerRaw = rawAt(findByAttr(snapshotToTree(open), rootMark, "1")!, trigger.path);
  const exclude = new Set<number>();
  const collect = (r: Raw) => {
    if (r.backend !== undefined) exclude.add(r.backend);
    r.children.forEach(collect);
  };
  if (triggerRaw) collect(triggerRaw);
  const mark = async (ids: number[]) => {
    await page.evaluate((m) => {
      for (const e of document.querySelectorAll(`[${m}]`)) e.removeAttribute(m);
    }, LAYER_MARK);
    await cdp.send("DOM.getDocument", { depth: 0 });
    for (const [i, backendNodeId] of ids.entries()) {
      const { object } = await cdp.send("DOM.resolveNode", { backendNodeId });
      await cdp.send("Runtime.callFunctionOn", {
        objectId: object.objectId!,
        functionDeclaration: "function (m, i) { this.setAttribute(m, i); }",
        arguments: [{ value: LAYER_MARK }, { value: String(i) }],
      });
    }
  };
  const roots = layerRoots(before, open, exclude);
  await mark(roots);
  const isOpen = async () => {
    open = await snapshot(cdp, ROOTS_ARGS);
    return layerRoots(before, open, exclude).length > 0;
  };
  return {
    rest,
    hidden,
    roots,
    isOpen,
    async reopen() {
      if (!(await isOpen())) {
        await activate(page, root, trigger);
        await settle(page);
        open = await snapshot(cdp, ROOTS_ARGS);
      }
      await mark(layerRoots(before, open, exclude));
    },
  };
}

/** A button of the layer the dismiss probe clicks: the `root`-th layer root, element `path` below it. */
export interface DismissCandidate {
  root: number;
  path: string;
  /** Its LayoutNode id. */
  id: string;
}

/** Clickable without leaving the page: a submit button only when its form is `method=dialog`. */
function dismissable(raw: Raw): boolean {
  if (!raw.bounds || raw.bounds.w <= 0 || raw.bounds.h <= 0) return false;
  const role = raw.attrs.role?.trim().toLowerCase() ?? "";
  if (role === "button" || role === "option" || role.startsWith("menuitem")) return true;
  if (raw.name === "a") return raw.attrs.href === undefined;
  if (raw.name !== "button" || (raw.attrs.type?.toLowerCase() ?? "submit") !== "submit") return raw.name === "button";
  let form = raw.parent;
  while (form && form.name !== "form") form = form.parent;
  return !form || form.attrs.method?.toLowerCase() === "dialog";
}

/** `button, [role=button], [role^=menuitem], [role=option], a:not([href])` in roots order then document order. */
export function dismissCandidates(roots: Raw[], paths: string[], identity: NodeIdentity): DismissCandidate[] {
  const out: DismissCandidate[] = [];
  roots.forEach((root, i) => {
    const walk = (raw: Raw, path: string) => {
      const full = [paths[i], path].filter(Boolean).join("/");
      if (dismissable(raw)) out.push({ root: i, path, id: identity(raw.name, raw.attrs, full) ?? full });
      for (const [k, c] of pathChildren(raw).entries()) walk(c, path ? `${path}/${k}` : String(k));
    };
    walk(root, "");
  });
  return out.slice(0, MAX_DISMISS_BUTTONS);
}

/**
 * The layer from the marked raws of the open tree (`marked[i]` carries `LAYER_MARK="<i>"`, already
 * removed from its attrs). `root` is the open tree's root LayoutNode; `rootRaw` its raw.
 */
export function assembleLayer(o: {
  trigger: Trigger;
  rootRaw: Raw;
  root: LayoutNode;
  marked: Raw[];
  origin: { x: number; y: number };
  identity: NodeIdentity;
  /** Per root, from the open page: `:modal`, and CSS anchor positioning. */
  info: Array<{ modal: boolean; anchored: boolean }>;
  /** The root (or an ancestor) became aria-hidden/inert on open. */
  hiddenOnOpen: boolean;
}): { layer: Layer; paths: string[] } {
  const { trigger, marked } = o;
  const inside = marked.map((raw) => pathOf(o.rootRaw, raw));
  const paths = inside.map((p, i) => p ?? (i ? `${trigger.id}/${i}` : trigger.id));
  const nodes = marked.map((raw, i) => toLayout(raw, o.origin, o.identity, paths[i])!);
  const any = (n: LayoutNode, f: (n: LayoutNode) => boolean): boolean => f(n) || n.children.some((c) => any(c, f));
  const fixed = (raw: Raw) => raw.styles.position === "fixed";
  const placement: Layer["placement"] = marked.every(
    (raw, i) => inside[i] !== undefined && raw.styles.overlay !== "auto" && !fixed(raw),
  )
    ? "inflow"
    : o.info.some((r) => r.anchored) ||
        marked.some(
          (raw) =>
            fixed(raw) &&
            Math.abs(raw.bounds!.x) < 0.5 &&
            Math.abs(raw.bounds!.y) < 0.5 &&
            (raw.styles.transform !== "none" || raw.styles.translate !== "none"),
        )
      ? "anchored"
      : "viewport";
  const triggerAttrs = rawAt(o.rootRaw, trigger.path)?.attrs ?? {};
  const inLayer = (attr: "aria-controls" | "aria-describedby") => {
    const ids = new Set(triggerAttrs[attr]?.split(/\s+/).filter(Boolean));
    return ids.size > 0 && nodes.some((n) => any(n, (d) => ids.has(d.attrs.id ?? "")));
  };
  const relation: Layer["relation"] =
    trigger.relation ??
    (inLayer("aria-controls") ? "aria-controls" : inLayer("aria-describedby") ? "aria-describedby" : "dom-diff");
  const layer: Layer = {
    id: trigger.id,
    trigger: trigger.trigger,
    activation: trigger.activation,
    relation,
    modal:
      o.info.some((r) => r.modal) ||
      o.hiddenOnOpen ||
      nodes.some((n) => any(n, (d) => d.attrs["aria-modal"] === "true")),
    placement,
    nodes,
    dismiss: { escape: false, outside: false, buttons: [] },
  };
  if (placement === "inflow") {
    const parent = (n: LayoutNode): LayoutNode | undefined =>
      n.children.some((c) => c.id === nodes[0]!.id) ? n : n.children.map(parent).find(Boolean);
    const p = parent(o.root);
    if (p?.id !== undefined) {
      layer.parent = p.id;
      layer.index = p.children.findIndex((c) => c.id === nodes[0]!.id);
    }
  }
  return { layer, paths };
}

/**
 * Paint the trigger and its descendants show while the layer is open (by LayoutNode id), and how many of
 * its elements appeared or disappeared (not reproduced).
 */
export function triggerPaint(
  rest: Map<number, Record<string, string>>,
  rootRaw: Raw,
  trigger: Trigger,
  identity: NodeIdentity,
): { paint: Record<string, Record<string, string>>; changed: number } {
  const paint: Record<string, Record<string, string>> = {};
  let changed = 0;
  const walk = (raw: Raw, path: string) => {
    const before = raw.backend === undefined ? undefined : rest.get(raw.backend);
    if (!before !== !raw.bounds) changed++;
    else if (before) {
      const delta = openDelta(before, raw.styles);
      const id = identity(raw.name, raw.attrs, path);
      if (delta && id !== undefined) paint[id] = delta;
    }
    for (const [k, c] of pathChildren(raw).entries()) walk(c, path ? `${path}/${k}` : String(k));
  };
  const raw = rawAt(rootRaw, trigger.path);
  if (raw) walk(raw, trigger.path);
  return { paint, changed };
}

/** After the Escape probe: outside click, then each candidate button. `escape` = the Escape probe closed it. */
export async function probeDismiss(
  page: Page,
  opening: Opening,
  o: {
    root: string;
    trigger: Trigger;
    candidates: DismissCandidate[];
    viewport: { width: number; height: number };
    escape: boolean;
    warn: (message: string) => void;
  },
): Promise<Layer["dismiss"]> {
  await opening.reopen();
  // A root covering the whole viewport is a scrim: clicking it is clicking outside.
  const rects = await page.evaluate(
    ({ mark, root, path, vw, vh }) => {
      const box = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const rs = [...document.querySelectorAll(`[${mark}]`)]
        .map(box)
        .filter((r) => !(r.x <= 0 && r.y <= 0 && r.x + r.w >= vw && r.y + r.h >= vh));
      let el = document.querySelector(root) ?? undefined;
      for (const step of path ? path.split("/") : []) el = el?.children[Number(step)];
      return el ? [...rs, box(el)] : rs;
    },
    { mark: LAYER_MARK, root: o.root, path: o.trigger.path, vw: o.viewport.width, vh: o.viewport.height },
  );
  const at = outsidePoint(rects, o.viewport);
  let outside = false;
  if (at) {
    await page.mouse.click(at.x, at.y);
    await settle(page);
    outside = !(await opening.isOpen());
  } else o.warn(`layer ${o.trigger.id} covers every viewport corner; its outside-click dismissal was not probed`);
  const buttons: string[] = [];
  for (const c of o.candidates) {
    await opening.reopen();
    const point = await page.evaluate(
      ({ sel, path }) => {
        let el = document.querySelector(sel) ?? undefined;
        for (const step of path ? path.split("/") : []) el = el?.children[Number(step)];
        if (!el) return undefined;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      },
      { sel: `[${LAYER_MARK}="${c.root}"]`, path: c.path },
    );
    if (!point) continue;
    await page.mouse.click(point.x, point.y);
    await settle(page);
    if (!(await opening.isOpen())) buttons.push(c.id);
  }
  return { escape: o.escape, outside, buttons };
}

/** What an `@open` capture needs: the open page's root-clipped screenshot (with `spec.screenshot`), root size, and the
 * trigger that opened it (its enter frames reopen it). */
export type OpenShots = Record<string, { png?: Uint8Array; size: { w: number; h: number }; trigger: Trigger }>;

/**
 * Open the first 12 of `rest.triggers`, each in a fresh page (`capture`), append the layers to
 * `rest.layout.layers`, write `states.open` into `rest.layout.root`, and append warnings.
 */
export async function captureLayers(
  capture: (spec: CaptureRequest) => Promise<Capture>,
  spec: CaptureRequest,
  rest: Capture,
  { probeDismiss }: { probeDismiss: boolean },
): Promise<OpenShots> {
  const triggers = rest.triggers ?? [];
  const warn = (message: string) => rest.warnings.push({ source: "capture", message });
  if (triggers.length > MAX_TRIGGERS) {
    const skipped = triggers.slice(MAX_TRIGGERS);
    warn(
      `${skipped.length} open-state trigger(s) beyond the first ${MAX_TRIGGERS} were not captured: ${skipped
        .slice(0, 5)
        .map((t) => t.id)
        .join(", ")}${skipped.length > 5 ? ", …" : ""}`,
    );
  }
  const byId = new Map<string, LayoutNode>();
  const index = (n: LayoutNode) => {
    if (n.id !== undefined) byId.set(n.id, n);
    n.children.forEach(index);
  };
  index(rest.layout.root);
  const layers: Layer[] = [];
  const shots: OpenShots = {};
  // ponytail: one trigger at a time (a page each, ~0.3 s); open them concurrently if many-trigger pages get slow.
  for (const trigger of triggers.slice(0, MAX_TRIGGERS)) {
    const open = await capture({ ...spec, open: trigger, probeDismiss });
    for (const w of open.warnings) if (!rest.warnings.some((r) => r.message === w.message)) rest.warnings.push(w);
    if (!open.opened) continue;
    layers.push(open.opened.layer);
    shots[open.opened.layer.id] = { ...(open.png ? { png: open.png } : {}), size: open.opened.size, trigger };
    for (const [id, delta] of Object.entries(open.opened.openPaint)) {
      const node = byId.get(id);
      if (node) node.states = { ...node.states, open: delta };
    }
  }
  if (layers.length) rest.layout.layers = layers;
  return shots;
}
