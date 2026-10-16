import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { applyLayers } from "../../../src/analysis/layers.ts";
import { LAYOUT_DOC_VERSION, type Anim, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import { type Easing, type SemNode, walk } from "../../../src/model/semantic.ts";
import { DIALOG, MENU } from "../../helpers/presentations.ts";

const EASE: Easing = { bezier: [0.25, 0.1, 0.25, 1] };
const EASE_OUT: Easing = { bezier: [0, 0, 0.58, 1] };
/** tw-animate `enter`/`exit` as Chrome reports them on a `fade-in-0 zoom-in-95` root (`from` / `to` only). */
const ZOOM = "translate3d(0px, 0px, 0px) scale3d(0.95, 0.95, 0.95) rotate(0deg)";
const anim = (name: string, frames: Array<Record<string, string>>, duration = 150, easing = "ease"): Anim => ({
  name,
  duration,
  delay: 0,
  iterations: 1,
  direction: "normal",
  fill: "none",
  keyframes: frames.map((values, i) => ({ offset: i / (frames.length - 1), easing, values })),
});
const ENTER = anim("enter", [
  { opacity: "0", transform: ZOOM },
  { opacity: "1", transform: "none" },
]);
const EXIT = anim("exit", [
  { opacity: "1", transform: "none" },
  { opacity: "0", transform: ZOOM },
]);

const byId = (root: SemNode, id: string) => {
  let hit: SemNode | undefined;
  walk(root, (n) => {
    if (n.id === id) hit ??= n;
  });
  for (const o of root.overlays) walk(o.node, (n) => (n.id === id ? (hit ??= n) : undefined));
  return hit;
};
const messages = (n: SemNode | undefined) => n?.diagnostics.map((d) => `${d.feature}: ${d.message}`) ?? [];
const run = (d: LayoutDoc) => {
  const screen = inferScreen(d, "s");
  applyLayers(screen, d);
  return screen.root;
};
const dialog = (
  card: LayoutNode["motion"],
  scrim: LayoutNode["motion"] = { enter: [anim("enter", [{ opacity: "0" }, { opacity: "1" }])] },
) => {
  const d = DIALOG();
  const [s, c] = d.layers![0]!.nodes;
  s!.motion = scrim;
  c!.motion = card;
  return d;
};

test("enter: the content root plays it on appear; Reduce Motion keeps its opacity only", () => {
  const root = run(dialog({ enter: [ENTER] }));
  const card = byId(root, "card")!;
  const curve = (from: number) => ({ from, segments: [{ to: 1, until: 1, easing: EASE }] });
  expect(card.motion?.animations).toEqual([
    {
      name: "enter",
      duration: 150,
      delay: 0,
      iterations: 1,
      direction: "normal",
      fill: "none",
      tracks: { opacity: curve(0), sx: curve(0.95), sy: curve(0.95) },
    },
  ]);
  expect(card.motion?.reduced?.map((a) => Object.keys(a.tracks))).toEqual([["opacity"]]);
  expect(card.motion?.base).toEqual({ opacity: 1, sx: 1, sy: 1 });
  // The centring translate went to the runtime: the keyframes compose on nothing.
  expect(messages(card).filter((m) => m.includes("composed"))).toEqual([]);
  expect(Object.keys(byId(root, "scrim")!.motion!.animations![0]!.tracks)).toEqual(["opacity"]);
});

test("exit: two keyframes from the settled look are exact; three are played from → to and reported", () => {
  const exact = byId(run(dialog({ exit: [EXIT] })), "card")!;
  expect(exact.motion?.animations).toBeUndefined();
  expect(exact.motion?.exit?.approximated).toBeUndefined();
  const t = exact.motion!.exit!.motion.tracks;
  expect([t.opacity?.segments.at(-1)?.to, t.sx?.segments.at(-1)?.to, t.sy?.segments.at(-1)?.to]).toEqual([
    0, 0.95, 0.95,
  ]);
  const three = anim("exit", [{ opacity: "1" }, { opacity: "0.5" }, { opacity: "0" }]);
  const approx = byId(run(dialog({ exit: [three, EXIT] })), "card")!;
  expect(approx.motion?.exit?.approximated).toBe(true);
  expect(messages(approx)).toContain("animation-name: exit exit played as from→to");
  expect(messages(approx)).toContain("animation-name: several exit animations; exit not played");
});

test("enter on a root whose own animation drives the same channel is not animated", () => {
  const card = byId(
    run(dialog({ animations: [anim("pulse", [{ opacity: "0.5" }, { opacity: "1" }], 1000)], enter: [ENTER] })),
    "card",
  )!;
  expect(card.motion?.animations?.map((a) => a.name)).toEqual(["pulse"]);
  expect(messages(card)).toContain("animation-name: two animations drive opacity; enter is not animated");
});

const FONT = { "font-family": "system-ui", "font-size": "15px", "line-height": "20px", color: "rgb(17, 24, 39)" };
const el = (tag: string, id: string, [x, y, w, h]: number[], children: LayoutNode[] = [], attrs = {}): LayoutNode => ({
  id,
  tag,
  attrs,
  styles: { ...FONT, display: "block" },
  bounds: { x: x!, y: y!, w: w!, h: h! },
  children,
});
const text = (value: string, [x, y, w, h]: number[]): LayoutNode => ({
  tag: "#text",
  attrs: {},
  styles: {},
  bounds: { x: x!, y: y!, w: w!, h: h! },
  text: value,
  children: [],
});
/** An accordion item: the h3 trigger, then `next`; the 30 px answer opens between them with `motion`. */
const accordion = (motion: LayoutNode["motion"], details = false): LayoutDoc => {
  const answer = { ...el("p", "c", [0, 20, 320, 30], [text("Answer", [0, 20, 60, 20])]), motion };
  const parent = details
    ? el("details", "#faq", [0, 0, 320, 20], [el("summary", "0/0", [0, 0, 320, 20], [text("More", [0, 0, 40, 20])])])
    : el(
        "div",
        "item",
        [0, 0, 320, 40],
        [
          el("h3", "h3", [0, 0, 320, 20], [el("button", "btn", [0, 0, 320, 20], [text("Question", [0, 0, 60, 20])])]),
          el("div", "next", [0, 20, 320, 20], [text("Next", [0, 20, 40, 20])]),
        ],
      );
  return {
    version: LAYOUT_DOC_VERSION,
    source: "accordion.html",
    combo: { screen: "accordion", theme: "light" },
    size: { w: 320, h: 200 },
    viewport: { x: 0, y: 0, w: 320, h: 200 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: el("main", "root", [0, 0, 320, 200], [parent]),
    layers: [
      {
        id: "answer",
        trigger: details ? "0/0" : "btn",
        activation: "click",
        relation: details ? "details" : "aria-controls",
        modal: false,
        placement: "inflow",
        parent: details ? "#faq" : "item",
        index: 1,
        nodes: [answer],
        dismiss: { escape: false, outside: false, buttons: [] },
      },
    ],
  };
};
const DOWN = anim("accordion-down", [{ height: "0px" }, { height: "30px" }], 200, "ease-out");
const UP = anim("accordion-up", [{ height: "30px" }, { height: "0px" }], 200, "ease-out");
const SPEC = { duration: 200, delay: 0, easing: EASE_OUT };

test("in-flow height 0 ↔ its own height is the reveal, not an animation", () => {
  const c = byId(run(accordion({ enter: [DOWN], exit: [UP] })), "c")!;
  expect(c.motion).toEqual({ reveal: { open: SPEC, close: SPEC } });
  expect(c.diagnostics).toEqual([]);
});

test("in-flow keyframes with other channels: those play, height still reveals; other heights are reported", () => {
  const fade = anim(
    "accordion-down",
    [
      { height: "0px", opacity: "0" },
      { height: "auto", opacity: "1" },
    ],
    200,
    "ease-out",
  );
  const c = byId(run(accordion({ enter: [fade] })), "c")!;
  expect(c.motion?.reveal).toEqual({ open: SPEC });
  expect(c.motion?.animations?.map((a) => Object.keys(a.tracks))).toEqual([["opacity"]]);
  const half = byId(run(accordion({ enter: [anim("grow", [{ height: "0px" }, { height: "12px" }])] })), "c")!;
  expect(half.motion).toBeUndefined();
  expect(messages(half)).toContain(
    "animation-name: keyframed height of grow is not animated (only 0 ↔ the content's height once)",
  );
});

test("<details>: the content's height reveal times the disclosure itself", () => {
  const root = run(accordion({ enter: [DOWN], exit: [UP] }, true));
  expect(byId(root, "#faq")!.motion).toEqual({ reveal: { open: SPEC, close: SPEC } });
});

test("a native menu with enter keeps the system animation (reported)", () => {
  const d = MENU();
  d.layers![0]!.nodes[0]!.motion = { enter: [ENTER] };
  expect(messages(byId(run(d), "trigger"))).toContain("animation-name: native menu presents with the system animation");
});
