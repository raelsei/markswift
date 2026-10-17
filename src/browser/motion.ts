/**
 * Motion capture: CSS animations and transitions as Chrome's Web Animations objects report them
 * (`CSSAnimation` / `CSSTransition`: `var()`-resolved keyframes, timing, per element). Read on the
 * live page before `settle()` finishes them; nothing here changes what the snapshots see.
 */
import type { ElementHandle, Page } from "playwright-core";
import type { Anim, Motion, Transition } from "../model/layout.ts";

/** Key: element path as `readPreferredSizes` builds it ("0/2/1", "" = root), or `<path>::before|::after`. */
export type MotionByPath = Record<string, Motion>;

declare global {
  interface Window {
    /** CSS animations started since `recordAnimations` (overlay enter/exit, 066). */
    __markswiftStarted?: Animation[];
  }
}

interface Collected {
  byPath: Record<string, Array<Anim | Transition>>;
  byTarget: Array<Array<Anim | Transition>>;
  /** `targets` slots left empty because several of their descendants animate. */
  ambiguous: number[];
  script: number;
  paused: number;
}

/**
 * In-page: serialise animations of `targets` (or of `root` and its descendants), optionally finishing them. A target
 * without an animation of its own takes its single animated descendant's (a Radix popper wrapper's content); with
 * `targets`, the animations `recordAnimations` kept are read too, finished ones included.
 */
const collect = (arg: {
  root?: string;
  targets?: Element[];
  /** `CSSAnimation` or `CSSTransition`. */
  kind: string;
  finish: boolean;
}): Collected => {
  const root = arg.root === undefined ? null : document.querySelector(arg.root);
  const out: Collected = {
    byPath: {},
    byTarget: (arg.targets ?? []).map(() => []),
    ambiguous: [],
    script: 0,
    paused: 0,
  };
  const inner: Array<Map<Element, Array<Anim | Transition>>> = (arg.targets ?? []).map(() => new Map());
  const recorded = arg.targets ? (window.__markswiftStarted ?? []) : [];
  const SKIP: Record<string, true> = { offset: true, computedOffset: true, easing: true, composite: true };
  for (const a of new Set([...document.getAnimations(), ...recorded])) {
    const effect = a.effect as KeyframeEffect | null;
    const target = effect?.target;
    if (!effect || !target) continue;
    let slot = arg.targets ? arg.targets.indexOf(target) : -1;
    if (arg.targets && slot < 0) slot = arg.targets.findIndex((t) => t.contains(target));
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
    if (arg.targets) {
      if (target === arg.targets[slot]) out.byTarget[slot]!.push(entry);
      else inner[slot]!.set(target, [...(inner[slot]!.get(target) ?? []), entry]);
    } else {
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
  inner.forEach((m, slot) => {
    if (out.byTarget[slot]!.length || !m.size) return;
    if (m.size === 1) out.byTarget[slot] = [...m.values()][0]!;
    else out.ambiguous.push(slot);
  });
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

/**
 * Starts (or restarts) the page's record of the CSS animations that start from now on, so a short overlay enter or
 * exit can be read after it finished (`readElementAnimations`). Call right before the activation or dismissal.
 * Each DOM mutation records the CSS animations it created, in the same task: `animationstart` alone misses one when
 * a busy main thread delivers it with `animationend` (a 100 ms enter on a slow runner) — the finished, fill-none
 * animation has already left `getAnimations()`. The listener still catches style-only starts (`:hover`, `:focus`).
 */
export async function recordAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const fresh = !window.__markswiftStarted;
    window.__markswiftStarted = [];
    if (!fresh) return;
    const add = (anims: Animation[]) => {
      const list = window.__markswiftStarted!;
      for (const a of anims) if (!list.includes(a)) list.push(a);
    };
    new MutationObserver(() => add(document.getAnimations().filter((a) => a instanceof CSSAnimation))).observe(
      document,
      { subtree: true, childList: true, attributes: true },
    );
    document.addEventListener("animationstart", (e) => add((e.target as Element).getAnimations()), true);
  });
}

/**
 * CSS animations on each of `targets` (overlay layer roots) under `prefers-reduced-motion: no-preference`, so
 * motion-safe-only animations are seen (the context runs `reduce` and is left there): the running ones and those
 * `recordAnimations` kept. A target without its own takes its single animated descendant's; with several, none
 * (warned). Nothing is finished.
 */
export async function readElementAnimations(
  page: Page,
  targets: ElementHandle[],
): Promise<{ lists: Anim[][]; warnings: string[] }> {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { byTarget, ambiguous } = await page.evaluate(collect, {
    targets: targets as ElementHandle<Element>[],
    kind: "CSSAnimation",
    finish: false,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  return {
    lists: byTarget as Anim[][],
    warnings: ambiguous.map(
      (i) => `layer root ${i} has no animation of its own and several animated descendants; its enter/exit is not read`,
    ),
  };
}
