import { expect, test } from "bun:test";
import { join } from "node:path";
import { convert, convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const FIXTURES = join(import.meta.dir, "../conformance/fixtures");
const OPTS = { name: "Motion", mode: "app", theme: "light", browserChannel: "chromium" } as const;

const capture = (file: string, theme: "light" | "dark" = "light") =>
  convert({ file: join(FIXTURES, file) }, { ...OPTS, theme });

function all(n: LayoutNode): LayoutNode[] {
  return [n, ...n.children.flatMap(all)];
}
const byId = (root: LayoutNode, id: string) => all(root).find((n) => n.attrs["id"] === id)!;
const byClass = (root: LayoutNode, cls: string) => all(root).find((n) => n.attrs["class"]?.split(/\s+/).includes(cls))!;

browserTest(
  "animation-name.html — spin, fade and pulse from Web Animations; rest snapshot still settled",
  async () => {
    const { layout } = await capture("css-misc/animation-name.html");
    const spinner = byClass(layout.root, "spinner");
    const spin = spinner.motion!.animations![0]!;
    expect(spin).toMatchObject({
      name: "spin",
      duration: 1000,
      delay: 0,
      iterations: "infinite",
      direction: "normal",
      fill: "none",
    });
    expect(spin.keyframes.map((k) => k.offset)).toEqual([0, 1]);
    expect(spin.keyframes.at(-1)!.values["transform"]).toBe("rotate(360deg)");
    expect(spinner.motion!.reduced).toBeUndefined();
    const fade = byClass(layout.root, "fade");
    expect(fade.motion!.animations![0]).toMatchObject({ name: "fade", delay: 100, fill: "both" });
    expect(fade.motion!.animations![0]!.keyframes[0]!.values["opacity"]).toBe("0");
    const pulse = byClass(layout.root, "pulse").motion!.animations![0]!;
    expect(pulse.keyframes).toHaveLength(3);
    expect(pulse.keyframes.every((k) => k.easing === "ease-in-out")).toBe(true);
    // Rest snapshot: the values settle() produced before motion was read.
    expect(spinner.styles["transform"]).toBe("none");
    expect(fade.styles["opacity"]).toBe("1");
  },
  120000,
);

browserTest(
  "motion-timing.html — negative delay, steps(), linear(), fractional iterations, ::after",
  async () => {
    const { layout } = await capture("css-misc/motion-timing.html");
    const first = (id: string) => byId(layout.root, id).motion!.animations![0]!;
    expect(first("dot-2").delay).toBe(-400);
    expect(first("steps").keyframes[0]!.easing).toMatch(/^steps\(8/);
    expect(first("linear-fn").keyframes[0]!.easing).toStartWith("linear(");
    expect(first("partial").iterations).toBe(2.5);
    expect(first("alternate").direction).toBe("alternate");
    expect(first("reverse")).toMatchObject({ direction: "reverse", iterations: 2, fill: "both" });
    expect(first("backwards")).toMatchObject({ delay: 300, fill: "backwards" });
    const pseudo = byId(layout.root, "pseudo");
    expect(pseudo.motion).toBeUndefined();
    const after = pseudo.children.find((c) => c.tag === "::after")!;
    expect(after.motion!.animations![0]).toMatchObject({ name: "blink", pseudo: "::after" });
  },
  120000,
);

browserTest(
  "motion-reduced.html — both prefers-reduced-motion branches and per-direction press transitions",
  async () => {
    const { layout } = await capture("css-misc/motion-reduced.html");
    const motion = (id: string) => byId(layout.root, id).motion!;
    expect(motion("safe-spin").animations![0]!.name).toBe("spin");
    expect(motion("safe-spin").reduced).toEqual([]);
    expect(motion("reduce-fade").animations).toBeUndefined();
    expect(motion("reduce-fade").reduced![0]!.name).toBe("fade");
    expect(motion("swap").animations![0]!.name).toBe("spin");
    expect(motion("swap").reduced![0]!.name).toBe("fade");
    const pressed = motion("press").transitions!.pressed!;
    expect(pressed.in).toHaveLength(1);
    expect(pressed.in[0]).toMatchObject({ property: "background-color", duration: 50, delay: 0 });
    expect(pressed.out[0]!.duration).toBe(200);
    expect(pressed.reduced).toBeDefined();
    for (const t of [...pressed.reduced!.in, ...pressed.reduced!.out]) expect(t.duration).toBe(0);
  },
  120000,
);

browserTest(
  "shadcn button spinner keyframes and 150 ms press transitions; shadcn input focus border",
  async () => {
    const button = (await capture("components/shadcn-button.html")).layout;
    const spin = all(button.root).find((n) => n.motion?.animations?.[0]?.name === "spin");
    expect(spin).toBeDefined();
    expect(spin!.motion!.animations![0]!.keyframes.at(-1)!.values["transform"]).toBe("rotate(360deg)");
    const pressed = all(button.root).filter((n) => (n.motion?.transitions?.pressed?.in.length ?? 0) > 0);
    expect(pressed.length).toBeGreaterThan(0);
    for (const t of pressed.flatMap((n) => n.motion!.transitions!.pressed!.in)) {
      expect(t.duration).toBe(150);
      expect(t.easing).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    }
    const input = (await capture("components/shadcn-input.html")).layout;
    const focused = all(input.root).flatMap((n) => n.motion?.transitions?.focused?.in ?? []);
    expect(focused.some((t) => /^border-\w+-color$/.test(t.property))).toBe(true);
  },
  240000,
);

browserTest(
  "script animations and @starting-style are reported",
  async () => {
    const script = await convertHtml(
      `<div id=s></div><script>document.getElementById("s").animate([{opacity:0},{opacity:1}],{duration:1000,iterations:Infinity})</script>`,
      OPTS,
    );
    expect(script.warnings.some((w) => /script animation/.test(w.message))).toBe(true);
    const starting = await convertHtml(`<style>@starting-style { #s { opacity: 0 } }</style><div id=s>x</div>`, OPTS);
    expect(starting.warnings.some((w) => /@starting-style/.test(w.message))).toBe(true);
  },
  120000,
);

browserTest(
  "reduced-motion emulation keeps the colour scheme; captures are deterministic",
  async () => {
    const dark = await capture("css-misc/animation-name.html", "dark");
    expect(dark.layout.canvas).toBe("rgb(11, 14, 19)");
    const a = await capture("components/shadcn-button.html");
    const b = await capture("components/shadcn-button.html");
    // The tree (motion included); font URLs carry the per-conversion server port.
    expect(b.layout.root).toEqual(a.layout.root);
  },
  240000,
);

browserTest(
  "every unmapped animation in motion-unmapped.html is reported on its node; @starting-style warns",
  async () => {
    const result = await capture("css-misc/motion-unmapped.html");
    const diagnostics = (id: string) => {
      const node = byId(result.layout.root, id);
      return result.diagnostics.find((r) => r.id === node.id)?.diagnostics ?? [];
    };
    const expected: Array<[string, string, RegExp]> = [
      ["scroll", "animation-timeline", /scroll-driven animation grow/],
      ["skew", "animation-name", /transform list skewX/],
      ["shimmer", "animation-name", /keyframed background-position-x is not animated/],
      ["dash", "animation-name", /animated circle inside an svg/],
      ["compose", "animation-composition", /composites with add/],
    ];
    for (const [id, feature, message] of expected)
      expect(diagnostics(id)).toContainEqual({ level: "unmapped", feature, message: expect.stringMatching(message) });
    expect(result.warnings.some((w) => /@starting-style/.test(w.message))).toBe(true);
    // Nothing mapped: no node animates in app output.
    expect(result.files["Motion.swift"]).not.toContain("MarkswiftAnimation");
  },
  120000,
);

browserTest(
  "app output animates the fixtures' keyframes; Reduce Motion stops loops and keeps fades' opacity",
  async () => {
    const swift = (await capture("css-misc/animation-name.html")).files["Motion.swift"]!;
    // spin (decorative loop: stops), fade (one-shot: movement removed, opacity kept, so `reduced` differs), pulse.
    expect(swift.match(/MarkswiftAnimation\(/g)).toHaveLength(3);
    expect(swift).toContain("degrees: MarkswiftMotionTrack(0.0, [MarkswiftSegment(360.0, 1.0,");
    const spinner = (await capture("components/shadcn-spinner.html")).files["Motion.swift"]!;
    expect(spinner).toContain("MarkswiftAnimation(");
  },
  240000,
);
