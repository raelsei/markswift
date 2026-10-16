/** CSS easing functions (css-easing-2) → IR `Easing`. */
import type { Easing } from "../model/semantic.ts";

const KEYWORDS: Record<string, Easing> = {
  linear: {
    points: [
      [0, 1],
      [0, 1],
    ],
  },
  ease: { bezier: [0.25, 0.1, 0.25, 1] },
  "ease-in": { bezier: [0.42, 0, 1, 1] },
  "ease-out": { bezier: [0, 0, 0.58, 1] },
  "ease-in-out": { bezier: [0.42, 0, 0.58, 1] },
  "step-start": { steps: [1, "start"] },
  "step-end": { steps: [1, "end"] },
};

const JUMPS: Record<string, "start" | "end" | "none" | "both"> = {
  "jump-start": "start",
  start: "start",
  "jump-end": "end",
  end: "end",
  "jump-none": "none",
  "jump-both": "both",
};

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const number = (s: string | undefined) => (s !== undefined && NUMBER.test(s) ? Number(s) : undefined);

/** `ease`, `cubic-bezier(…)`, `steps(…)`, `linear(…)` → IR; undefined when it is not a valid easing function. */
export function parseEasing(s: string): Easing | undefined {
  const value = s.trim().toLowerCase();
  if (Object.hasOwn(KEYWORDS, value)) return KEYWORDS[value];
  const fn = /^([a-z-]+)\((.*)\)$/.exec(value);
  if (!fn) return undefined;
  const args = fn[2]!.split(",").map((a) => a.trim());
  if (fn[1] === "cubic-bezier") {
    const p = args.map(number);
    if (p.length !== 4 || p.some((v) => v === undefined) || p[0]! < 0 || p[0]! > 1 || p[2]! < 0 || p[2]! > 1)
      return undefined;
    return { bezier: p as [number, number, number, number] };
  }
  if (fn[1] === "steps") {
    const n = number(args[0]);
    const position = args[1] === undefined ? "end" : JUMPS[args[1]];
    if (n === undefined || !Number.isInteger(n) || !position || args.length > 2 || n < (position === "none" ? 2 : 1))
      return undefined;
    return { steps: [n, position] };
  }
  if (fn[1] === "linear") return linearPoints(args);
  return undefined;
}

/** `linear()` stops → completed points: missing inputs filled per css-easing-2 §2.1.2. */
function linearPoints(args: string[]): Easing | undefined {
  const outputs: number[] = [];
  const inputs: Array<number | undefined> = [];
  for (const arg of args) {
    const [out, ...pcts] = arg.split(/\s+/);
    const o = number(out);
    const p = pcts.map((s) => (s.endsWith("%") ? number(s.slice(0, -1)) : undefined));
    if (o === undefined || pcts.length > 2 || p.some((v) => v === undefined)) return undefined;
    if (!p.length) p.push(undefined);
    for (const v of p) {
      outputs.push(o);
      inputs.push(v === undefined ? undefined : v / 100);
    }
  }
  if (outputs.length < 2) return undefined;
  inputs[0] ??= 0;
  let max = -Infinity;
  for (const v of inputs) if (v !== undefined) max = Math.max(max, v);
  inputs[inputs.length - 1] ??= Math.max(1, max);
  let largest = -Infinity;
  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i] === undefined) continue;
    largest = Math.max(largest, inputs[i]!);
    inputs[i] = largest;
  }
  for (let i = 1; i < inputs.length; i++) {
    if (inputs[i] !== undefined) continue;
    let j = i;
    while (inputs[j] === undefined) j++;
    const a = inputs[i - 1]!,
      b = inputs[j]!;
    for (let k = i; k < j; k++) inputs[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  return { points: [outputs, inputs as number[]] };
}
