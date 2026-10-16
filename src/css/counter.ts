import type { CounterStyle } from "../model/semantic.ts";

/** `list-style-type` / `counter()` styles whose text Markswift can regenerate; Chrome's `*-latin` print as `*-alpha`. */
export const COUNTER_STYLES: Readonly<Record<string, CounterStyle>> = {
  decimal: "decimal",
  "decimal-leading-zero": "decimal-leading-zero",
  "lower-alpha": "lower-alpha",
  "lower-latin": "lower-alpha",
  "upper-alpha": "upper-alpha",
  "upper-latin": "upper-alpha",
  "lower-roman": "lower-roman",
  "upper-roman": "upper-roman",
};

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** A counter value as Chrome prints it; alphabetic below 1 and roman outside 1…3999 fall back to decimal. Mirror: `markswiftCounter` (runtime/counter.swift). */
export function counterText(value: number, style: CounterStyle): string {
  if (style === "decimal-leading-zero") return value >= 0 && value < 10 ? `0${value}` : String(value);
  if ((style === "lower-alpha" || style === "upper-alpha") && value >= 1) {
    let s = "";
    for (let k = value; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
    return style === "upper-alpha" ? s.toUpperCase() : s;
  }
  if ((style === "lower-roman" || style === "upper-roman") && value >= 1 && value <= 3999) {
    let s = "";
    let k = value;
    for (const [n, r] of ROMAN) for (; k >= n; k -= n) s += r;
    return style === "lower-roman" ? s.toLowerCase() : s;
  }
  return String(value);
}

const LETTERS: Readonly<Record<CounterStyle, RegExp | undefined>> = {
  decimal: undefined,
  "decimal-leading-zero": undefined,
  "lower-alpha": /^[a-z]+/,
  "upper-alpha": /^[A-Z]+/,
  "lower-roman": /^[ivxlcdm]+/,
  "upper-roman": /^[IVXLCDM]+/,
};

/** The counter value at the start of `text` (after `prefix`), and the rest; undefined unless `counterText` reproduces it. */
export function parseCounter(
  text: string,
  style: CounterStyle,
  prefix = "",
): { value: number; suffix: string } | undefined {
  if (!text.startsWith(prefix)) return undefined;
  const rest = text.slice(prefix.length);
  const letters = LETTERS[style]?.exec(rest)?.[0];
  let value: number;
  let token: string;
  if (letters) {
    token = letters;
    const upper = letters.toUpperCase();
    if (style === "lower-alpha" || style === "upper-alpha")
      value = [...upper].reduce((v, c) => v * 26 + c.charCodeAt(0) - 64, 0);
    else {
      value = 0;
      for (let i = 0; i < upper.length; ) {
        const pair = ROMAN.find(([, r]) => upper.startsWith(r, i));
        if (!pair) return undefined;
        value += pair[0];
        i += pair[1].length;
      }
    }
  } else {
    const d = /^-?\d+/.exec(rest)?.[0];
    if (!d) return undefined;
    token = d;
    value = Number(d);
  }
  if (counterText(value, style) !== token) return undefined;
  return { value, suffix: rest.slice(token.length) };
}
