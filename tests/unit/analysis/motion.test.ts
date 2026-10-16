import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { walk, type SemNode } from "../../../src/model/semantic.ts";
import { LAYOUT_DOC_VERSION, type Anim, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";

const BOX = { "font-family": "system-ui", "font-size": "15px", color: "rgb(0, 0, 0)", display: "block" };

function anim(name: string, keyframes: Anim["keyframes"], extra: Partial<Anim> = {}): Anim {
  return { name, duration: 1000, delay: 0, iterations: 1, direction: "normal", fill: "none", keyframes, ...extra };
}
const kf = (offset: number, values: Record<string, string>, easing = "linear") => ({ offset, easing, values });
const spin = anim("spin", [kf(0, { transform: "rotate(0deg)" }), kf(1, { transform: "rotate(360deg)" })], {
  iterations: "infinite",
});

function box(id: string, motion?: LayoutNode["motion"], styles: Record<string, string> = {}, attrs = {}): LayoutNode {
  return {
    tag: "div",
    id,
    attrs: { id, ...attrs },
    styles: { ...BOX, "transform-origin": "20px 20px", ...styles },
    bounds: { x: 0, y: 0, w: 40, h: 40 },
    children: [],
    ...(motion ? { motion } : {}),
  };
}

function infer(...children: LayoutNode[]): Record<string, SemNode> {
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "motion.html",
    combo: { screen: "motion", theme: "light" },
    size: { w: 320, h: 400 },
    viewport: { x: 0, y: 0, w: 320, h: 400 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: { ...box("root"), bounds: { x: 0, y: 0, w: 320, h: 400 }, children },
  };
  const out: Record<string, SemNode> = {};
  walk(inferScreen(doc, "Motion").root, (n) => {
    out[n.id] = n;
  });
  return out;
}
const diag = (n: SemNode, feature: string) => n.diagnostics.filter((d) => d.feature === feature);

test("infinite spin: rotation track, decorative loop stops under Reduce Motion", () => {
  const { s } = infer(box("s", { animations: [spin] }));
  expect(s!.motion!.animations![0]!.tracks).toEqual({
    deg: {
      from: 0,
      segments: [
        {
          to: 360,
          until: 1,
          easing: {
            points: [
              [0, 1],
              [0, 1],
            ],
          },
        },
      ],
    },
  });
  expect(s!.motion!.base!.deg).toBe(0);
  expect(s!.motion!.reduced).toEqual([]);
  expect(s!.motion!.anchor).toBeUndefined();
  expect(diag(s!, "animation-name")).toEqual([]);
});

test("status spinner keeps turning under Reduce Motion", () => {
  const { s, b } = infer(
    box("s", { animations: [spin] }, {}, { role: "status" }),
    box("b", { animations: [spin] }, {}, { "aria-busy": "true" }),
  );
  expect(s!.motion!.reduced).toBeUndefined();
  expect(b!.motion!.reduced).toBeUndefined();
});

test("one-shot fade: opacity and ty tracks; Reduce Motion keeps only the opacity timing", () => {
  const fade = anim(
    "fade",
    [
      kf(0, { opacity: "0", transform: "translateY(8px)" }, "ease-out"),
      kf(1, { opacity: "1", transform: "translateY(0px)" }),
    ],
    { duration: 300, delay: 100, fill: "both" },
  );
  const { f } = infer(box("f", { animations: [fade] }));
  const m = f!.motion!;
  expect(Object.keys(m.animations![0]!.tracks).sort()).toEqual(["opacity", "ty"]);
  expect(m.animations![0]!.tracks.ty).toEqual({
    from: 8,
    segments: [{ to: 0, until: 1, easing: { bezier: [0, 0, 0.58, 1] } }],
  });
  expect(Object.keys(m.reduced![0]!.tracks)).toEqual(["opacity"]);
  expect(m.base).toEqual({ opacity: 1, tx: 0, ty: 0 });
});

test("author reduced list wins regardless of role", () => {
  const { s } = infer(box("s", { animations: [spin], reduced: [] }, {}, { role: "status" }));
  expect(s!.motion!.reduced).toEqual([]);
});

test("dialog enter: scale3d → none drives sx/sy; constant translate is omitted", () => {
  const enter = anim(
    "enter",
    [kf(0, { transform: "translate3d(0px, 0px, 0px) scale3d(0.95, 0.95, 0.95)" }), kf(1, { transform: "none" })],
    { duration: 150 },
  );
  const { d } = infer(box("d", { animations: [enter] }));
  const tracks = d!.motion!.animations![0]!.tracks;
  expect(Object.keys(tracks).sort()).toEqual(["sx", "sy"]);
  expect(tracks.sx!.from).toBe(0.95);
  expect(tracks.sx!.segments[0]!.to).toBe(1);
});

test("translateX(50%) resolves against the border box", () => {
  const slide = anim("slide", [kf(0, { transform: "none" }), kf(1, { transform: "translateX(50%)" })]);
  const { n } = infer({ ...box("n", { animations: [slide] }), bounds: { x: 0, y: 0, w: 200, h: 40 } });
  expect(n!.motion!.animations![0]!.tracks.tx!.segments[0]!.to).toBe(100);
  // transform-origin 20px 20px on a 200×40 box.
  expect(n!.motion!.anchor).toEqual([0.1, 0.5]);
});

test("unmapped animations are reported per node and produce no motion", () => {
  const cases: Array<[string, Anim, string, RegExp]> = [
    ["timeline", { ...spin, timeline: "ScrollTimeline" }, "animation-timeline", /scroll-driven/],
    ["composite", { ...spin, composite: "add" }, "animation-composition", /add/],
    [
      "colour",
      anim("c", [kf(0, { "background-color": "red" }), kf(1, { "background-color": "blue" })]),
      "animation-name",
      /keyframed background-color/,
    ],
    [
      "skew",
      anim("k", [kf(0, { transform: "none" }), kf(1, { transform: "skewX(10deg)" })]),
      "animation-name",
      /transform list/,
    ],
    [
      "rx",
      anim("r", [kf(0, { transform: "none" }), kf(1, { transform: "rotateX(45deg)" })]),
      "animation-name",
      /transform list/,
    ],
    [
      "order",
      anim("o", [
        kf(0, { transform: "translate(10px, 0px) scale(2)" }),
        kf(1, { transform: "scale(2) translate(10px, 0px)" }),
      ]),
      "animation-name",
      /transform list/,
    ],
    [
      "easing",
      anim("e", [kf(0, { opacity: "0" }, "bounce"), kf(1, { opacity: "1" })]),
      "animation-timing-function",
      /bounce/,
    ],
  ];
  const nodes = infer(...cases.map(([id, a]) => box(id, { animations: [a] })));
  for (const [id, , feature, message] of cases) {
    const n = nodes[id]!;
    expect(n.motion).toBeUndefined();
    const d = diag(n, feature);
    expect(d.length).toBeGreaterThan(0);
    expect(d[0]!.level).toBe("unmapped");
    expect(d[0]!.message).toMatch(message);
  }
});

test("two animations driving one channel: the later one is dropped", () => {
  const blink = (name: string) => anim(name, [kf(0, { opacity: "0" }), kf(1, { opacity: "1" })]);
  const { n } = infer(box("n", { animations: [blink("a"), blink("b")] }));
  expect(n!.motion!.animations!.map((a) => a.name)).toEqual(["a"]);
  expect(diag(n!, "animation-name")[0]).toMatchObject({
    level: "unmapped",
    message: expect.stringMatching(/two animations drive opacity/),
  });
});

test("mixed keyframes keep the mapped track and approximate the rest", () => {
  const mixed = anim("m", [
    kf(0, { opacity: "0", "background-color": "red" }),
    kf(1, { opacity: "1", "background-color": "blue" }),
  ]);
  const { n } = infer(box("n", { animations: [mixed] }));
  expect(Object.keys(n!.motion!.animations![0]!.tracks)).toEqual(["opacity"]);
  expect(diag(n!, "animation-name")[0]).toMatchObject({
    level: "approximated",
    message: "keyframed background-color is not animated",
  });
});

test("fill forwards with a delay shows the end look during the delay", () => {
  const late = anim("late", [kf(0, { opacity: "0" }), kf(1, { opacity: "1" })], { delay: 200, fill: "forwards" });
  const { n } = infer(box("n", { animations: [late] }));
  expect(diag(n!, "animation-fill-mode")[0]!.level).toBe("approximated");
});

test("animation-name without captured motion keeps the legacy unmapped report", () => {
  const { n } = infer(box("n", undefined, { "animation-name": "spin" }));
  expect(diag(n!, "animation-name")[0]!.message).toMatch(/no motion is generated/);
});

test("an animated node at opacity 0 is kept; static opacity becomes the base", () => {
  const fadeIn = anim("in", [kf(0, { opacity: "0" }), kf(1, { opacity: "1" })], { iterations: "infinite" });
  const { n } = infer(box("n", { animations: [fadeIn] }, { opacity: "0" }));
  expect(n!.style.hidden).toBeUndefined();
  expect(n!.motion!.base).toEqual({ opacity: 0 });
});
