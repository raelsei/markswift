import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayout } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION, type Anim, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";
import { DIALOG, NATIVE } from "../../helpers/presentations.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const compile = (d: LayoutDoc, mode: "app" | "fidelity" = "app") => compileLayout(d, { name: "Overlay", mode });

const ZOOM = "translate3d(0px, 0px, 0px) scale3d(0.95, 0.95, 0.95) rotate(0deg)";
const anim = (name: string, frames: Array<Record<string, string>>, duration = 150, easing = "ease"): Anim => ({
  name,
  duration,
  delay: 0,
  iterations: 1,
  direction: "normal",
  fill: "none",
  keyframes: frames.map((values, i) => ({ offset: i, easing, values })),
});
const ENTER = anim("enter", [
  { opacity: "0", transform: ZOOM },
  { opacity: "1", transform: "none" },
]);
const EXIT = anim("exit", [
  { opacity: "1", transform: "none" },
  { opacity: "0", transform: ZOOM },
]);
const FADE_IN = anim("enter", [{ opacity: "0" }, { opacity: "1" }], 100);
const FADE_OUT = anim("exit", [{ opacity: "1" }, { opacity: "0" }], 100);
const CURVE = ".timingCurve(0.25, 0.1, 0.25, 1.0, duration: 0.15)";

const dialog = () => {
  const d = DIALOG();
  const [scrim, card] = d.layers![0]!.nodes;
  scrim!.motion = { enter: [FADE_IN], exit: [FADE_OUT] };
  card!.motion = { enter: [ENTER], exit: [EXIT] };
  return d;
};

test("dialog: the content enters through MarkswiftAnimation and leaves with its exit frame and curve", () => {
  const { code } = compile(dialog());
  expect(code).toContain(
    ".modifier(MarkswiftAnimation(motions: [MarkswiftMotion(MarkswiftTiming(duration: 0.15), opacity: MarkswiftMotionTrack(0.0, [MarkswiftSegment(1.0, 1.0, .bezier(0.25, 0.1, 0.25, 1.0))]), scaleX: MarkswiftMotionTrack(0.95, [MarkswiftSegment(1.0, 1.0, .bezier(0.25, 0.1, 0.25, 1.0))]), scaleY: MarkswiftMotionTrack(0.95, [MarkswiftSegment(1.0, 1.0, .bezier(0.25, 0.1, 0.25, 1.0))]))], reduced: [MarkswiftMotion(MarkswiftTiming(duration: 0.15), opacity: MarkswiftMotionTrack(0.0, [MarkswiftSegment(1.0, 1.0, .bezier(0.25, 0.1, 0.25, 1.0))]))]))",
  );
  expect(code).toMatch(
    new RegExp(
      String.raw`\.markswiftPlaced\(\.center\)\n +\.transition\(\.asymmetric\(insertion: \.identity, removal: \.modifier\(active: MarkswiftExitFrame\(value: MarkswiftMotionValue\(opacity: 0\.0, scaleX: 0\.95, scaleY: 0\.95\), reduced: MarkswiftMotionValue\(opacity: 0\.0\)\), identity: MarkswiftExitFrame\(\)\)\.animation\(\.timingCurve\(0\.25, 0\.1, 0\.25, 1\.0, duration: 0\.15\)\)\)\)`,
    ),
  );
  // The scrim fades out on its own 100 ms curve.
  expect(code).toContain(
    ".transition(.asymmetric(insertion: .identity, removal: .modifier(active: MarkswiftExitFrame(value: MarkswiftMotionValue(opacity: 0.0), reduced: MarkswiftMotionValue(opacity: 0.0)), identity: MarkswiftExitFrame()).animation(.timingCurve(0.25, 0.1, 0.25, 1.0, duration: 0.1))))",
  );
  // Closing waits for the longest exit: the closers and the runtime's own dismissal.
  expect(code).toMatch(
    new RegExp(
      String.raw`Button \{\n +onCancel\(\)\n +withAnimation\(\.timingCurve\(0\.25, 0\.1, 0\.25, 1\.0, duration: 0\.15\)\) \{ isEditProfilePresented = false \}\n`,
    ),
  );
  expect(code).toContain(`dismissOnOutside: true, exit: ${CURVE}, onDismiss: onEditProfileDismissed) {`);
});

test("an off-centre transform-origin anchors the exit frame", () => {
  const d = dialog();
  d.layers![0]!.nodes[1]!.styles["transform-origin"] = "150px 0px";
  expect(compile(d).code).toContain("reduced: MarkswiftMotionValue(opacity: 0.0), anchor: UnitPoint(x: 0.5, y: 0.0))");
});

test("a native ::backdrop leaves on the content's exit curve", () => {
  const d = NATIVE();
  d.layers![0]!.nodes[0]!.motion = { exit: [EXIT] };
  expect(compile(d).code).toMatch(
    new RegExp(
      String.raw`Color\.markswift\(0\.0, 0\.0, 0\.0, 0\.1\)\n +\.allowsHitTesting\(false\)\n +\.transition\(\.opacity\.animation\(\.timingCurve\(0\.25, 0\.1, 0\.25, 1\.0, duration: 0\.15\)\)\)\n`,
    ),
  );
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
const DOWN = anim("accordion-down", [{ height: "0px" }, { height: "30px" }], 200, "ease-out");
const UP = anim("accordion-up", [{ height: "30px" }, { height: "0px" }], 200, "ease-out");
const OPEN = ".timingCurve(0.0, 0.0, 0.58, 1.0, duration: 0.2)";
/** An accordion item (or a `<details>`) whose 30 px answer opens with `motion`. */
const accordion = (motion: LayoutNode["motion"], details = false): LayoutDoc => {
  const answer = { ...el("p", "c", [0, 28, 320, 30], [text("Answer", [0, 28, 60, 20])]), motion };
  const parent = details
    ? el("details", "#faq", [0, 0, 320, 20], [el("summary", "0/0", [0, 0, 320, 20], [text("More", [0, 0, 40, 20])])])
    : el(
        "div",
        "item",
        [0, 0, 320, 40],
        [
          el(
            "h3",
            "h3",
            [0, 0, 320, 20],
            [
              el("button", "btn", [0, 0, 320, 20], [text("Question", [0, 0, 60, 20])], {
                "aria-expanded": "false",
                "aria-controls": "c",
              }),
            ],
          ),
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

test("accordion: the toggle runs inside the close/open curve; the content reveals its height", () => {
  const { code } = compile(accordion({ enter: [DOWN], exit: [UP] }));
  expect(code).toMatch(
    new RegExp(
      String.raw`Button \{\n +withAnimation\(isAnswerExpanded \? \.timingCurve\(0\.0, 0\.0, 0\.58, 1\.0, duration: 0\.2\) : \.timingCurve\(0\.0, 0\.0, 0\.58, 1\.0, duration: 0\.2\)\) \{ isAnswerExpanded\.toggle\(\) \}\n`,
    ),
  );
  expect(code).toMatch(
    /\n( +)if isAnswerExpanded \{\n[\s\S]*?\n\1 {4}\.transition\(\.modifier\(active: MarkswiftReveal\(fraction: 0\), identity: MarkswiftReveal\(fraction: 1\)\)\)\n\1\}/,
  );
  // Without a reveal the toggle and the content are today's.
  const plain = compile(accordion(undefined)).code;
  expect(plain).toMatch(/Button \{\n +isAnswerExpanded\.toggle\(\)\n/);
  expect(plain).not.toContain("MarkswiftReveal");
});

test("<details>: MarkswiftDisclosureStyle takes the open and close curves", () => {
  expect(compile(accordion({ enter: [DOWN], exit: [UP] }, true)).code).toContain(
    `.disclosureGroupStyle(MarkswiftDisclosureStyle(spacing: 8.0, open: ${OPEN}, close: ${OPEN}))`,
  );
  expect(compile(accordion(undefined, true)).code).toContain(
    ".disclosureGroupStyle(MarkswiftDisclosureStyle(spacing: 8.0))",
  );
});

test("fidelity output is byte-identical with and without enter/exit", () => {
  for (const [withMotion, without] of [
    [dialog(), DIALOG()],
    [accordion({ enter: [DOWN], exit: [UP] }), accordion(undefined)],
    [accordion({ enter: [DOWN], exit: [UP] }, true), accordion(undefined, true)],
  ] as const)
    expect(compile(withMotion, "fidelity").code).toBe(compile(without, "fidelity").code);
});

nativeTest(
  "generated enter/exit, reveal and disclosure curves typecheck",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-overlay-motion-"));
    try {
      for (const [i, d] of [
        dialog(),
        accordion({ enter: [DOWN], exit: [UP] }),
        accordion({ enter: [DOWN] }, true),
      ].entries()) {
        const out = join(directory, String(i));
        for (const [file, content] of Object.entries(compile(d).files)) await Bun.write(join(out, file), content);
        const check = await typecheck(out);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  180_000,
);
