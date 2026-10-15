/**
 * Motion capture: CSS animations and transitions as Chrome's Web Animations objects report them
 * (`CSSAnimation` / `CSSTransition`: `var()`-resolved keyframes, timing, per element). Read on the
 * live page before `settle()` finishes them; nothing here changes what the snapshots see.
 */
import type { ElementHandle, Page } from "playwright-core";
import type { Anim, Motion, Transition } from "../model/layout.ts";

/** Key: element path as `readPreferredSizes` builds it ("0/2/1", "" = root), or `<path>::before|::after`. */
export type MotionByPath = Record<string, Motion>;

interface Collected {
  byPath: Record<string, Array<Anim | Transition>>;
  byTarget: Array<Array<Anim | Transition>>;
  script: number;
  paused: number;
}

/** In-page: serialise animations of `targets` (or of `root` and its descendants), optionally finishing them. */
const collect = (arg: {
  root?: string;
  targets?: Element[];
  /** `CSSAnimation` or `CSSTransition`. */
  kind: string;
  finish: boolean;
}): Collected => {
  const root = arg.root === undefined ? null : document.querySelector(arg.root);
  const out: Collected = { byPath: {}, byTarget: (arg.targets ?? []).map(() => []), script: 0, paused: 0 };
  const SKIP: Record<string, true> = { offset: true, computedOffset: true, easing: true, composite: true };
  for (const a of document.getAnimations()) {
    const effect = a.effect as KeyframeEffect | null;
    const target = effect?.target;
    if (!effect || !target) continue;
    const slot = arg.targets ? arg.targets.indexOf(target) : -1;
    if (arg.targets ? slot < 0 : !root?.contains(target)) continue;
    const kind = a.constructor.name;
    if (kind === "Animation") out.script++;
    if (kind !== arg.kind) continue;
    if (a.playState === "paused") {
      out.paused++;
      continue;
    }
    const pseudo = effect.pseudoElement;
    if (pseudo && pseudo !== "::before" && pseudo !== "::after") continue;
    const keyframes = effect.getKeyframes().map((k) => {
      const values: Record<string, string> = {};
      for (const [key, v] of Object.entries(k)) {
        if (SKIP[key] || typeof v !== "string") continue;
        // getKeyframes() spells properties in IDL camelCase (`cssFloat`, `webkitTextFillColor`); custom ones as authored.
        const css = key.startsWith("--")
          ? key
          : key
              .replace(/^css(?=[A-Z])/, "")
              .replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
              .replace(/^-/, "")
              .replace(/^webkit-/, "-webkit-");
        values[css] = v;
      }
      return { offset: k.computedOffset as number, easing: k.easing ?? "linear", values };
    });
    const timing = effect.getTiming();
    const duration = typeof timing.duration === "number" ? timing.duration : 0;
    const delay = timing.delay ?? 0;
    let entry: Anim | Transition;
    if (kind === "CSSTransition") {
      const property = (a as CSSTransition).transitionProperty;
      entry = {
        property,
        duration,
        delay,
        easing: timing.easing ?? "linear",
        from: keyframes[0]?.values[property] ?? "",
        to: keyframes.at(-1)?.values[property] ?? "",
      };
    } else {
      const anim: Anim = {
        name: (a as CSSAnimation).animationName,
        duration,
        delay,
        iterations: timing.iterations === Infinity ? "infinite" : (timing.iterations ?? 1),
        direction: timing.direction ?? "normal",
        fill: !timing.fill || timing.fill === "auto" ? "none" : timing.fill,
        keyframes,
      };
      if (pseudo === "::before" || pseudo === "::after") anim.pseudo = pseudo;
      if (effect.composite !== "replace") anim.composite = effect.composite;
      const timeline = a.timeline;
      if (timeline === null) anim.timeline = "none";
      else if (timeline.constructor.name !== "DocumentTimeline") anim.timeline = timeline.constructor.name;
      entry = anim;
    }
    if (arg.targets) out.byTarget[slot]!.push(entry);
    else {
      let path = "";
      for (let el: Element = target; el !== root; el = el.parentElement!) {
        const i = Array.prototype.indexOf.call(el.parentElement!.children, el);
        path = path ? `${i}/${path}` : String(i);
      }
      (out.byPath[path + (pseudo ?? "")] ??= []).push(entry);
    }
    if (arg.finish) {
      try {
        a.finish();
      } catch {
        a.cancel();
      }
    }
  }
  return out;
};

/** In-page: `@starting-style` rules and whether any `@media` rule tests `prefers-reduced-motion`. */
const scanSheets = (): { startingStyle: number; authorReduce: boolean } => {
  const out = { startingStyle: 0, authorReduce: false };
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (r.constructor.name === "CSSStartingStyleRule") out.startingStyle++;
      if (r instanceof CSSMediaRule && r.conditionText.includes("prefers-reduced-motion")) out.authorReduce = true;
      if (r instanceof CSSImportRule && r.styleSheet) read(r.styleSheet);
      if ("cssRules" in r) walk((r as CSSGroupingRule).cssRules);
    }
  };
  const read = (sheet: CSSStyleSheet) => {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return; // cross-origin
    }
    walk(rules);
  };
  for (const sheet of document.styleSheets) read(sheet);
  return out;
};

/**
 * CSS animations under `root` in both `prefers-reduced-motion` branches. Call before `settle()`: a finished
 * CSSAnimation leaves `getAnimations()`. The context runs `reduce`; the page ends there again.
 */
export async function readMotion(
  page: Page,
  root: string,
): Promise<{ motion: MotionByPath; warnings: string[]; authorReduce: boolean }> {
  const reduce = await page.evaluate(collect, { root, kind: "CSSAnimation", finish: false });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const normal = await page.evaluate(collect, { root, kind: "CSSAnimation", finish: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { startingStyle, authorReduce } = await page.evaluate(scanSheets);
  const motion: MotionByPath = {};
  for (const path of new Set([...Object.keys(normal.byPath), ...Object.keys(reduce.byPath)])) {
    const animations = (normal.byPath[path] ?? []) as Anim[];
    const reduced = (reduce.byPath[path] ?? []) as Anim[];
    const m: Motion = {};
    if (animations.length) m.animations = animations;
    if (authorReduce || JSON.stringify(reduced) !== JSON.stringify(animations)) m.reduced = reduced;
    if (m.animations || m.reduced) motion[path] = m;
  }
  const paused = Math.max(reduce.paused, normal.paused);
  const warnings: string[] = [];
  if (reduce.script) warnings.push(`${reduce.script} script animation(s) (Element.animate) are not translated`);
  if (paused) warnings.push(`${paused} paused animation(s) are captured at their settled look`);
  if (startingStyle) warnings.push(`@starting-style rules are not translated (${startingStyle})`);
  return { motion, warnings, authorReduce };
}

/** CSSTransitions running under `root` (started by a forced state), keyed by element path; finishes them. */
export async function readTransitions(page: Page, root: string): Promise<Record<string, Transition[]>> {
  const { byPath } = await page.evaluate(collect, { root, kind: "CSSTransition", finish: true });
  return byPath as Record<string, Transition[]>;
}

/** CSS animations on each of `targets` (overlay layer roots) under the current media; nothing is finished. */
export async function readElementAnimations(page: Page, targets: ElementHandle[]): Promise<Anim[][]> {
  const { byTarget } = await page.evaluate(collect, {
    targets: targets as ElementHandle<Element>[],
    kind: "CSSAnimation",
    finish: false,
  });
  return byTarget as Anim[][];
}
