import { describe, expect, test } from "bun:test";
import { contentAlt, counterText, parseCounter } from "../../../src/css/index.ts";
import type { CounterStyle } from "../../../src/model/semantic.ts";

/** Chrome 155 marker texts without the `". "` suffix (probed 2026-10-15, `<li value=v>`). */
const COUNTER_PROBES: Array<[CounterStyle, number, string]> = [
  ["decimal", 1, "1"],
  ["decimal", -3, "-3"],
  ["decimal-leading-zero", 0, "00"],
  ["decimal-leading-zero", 1, "01"],
  ["decimal-leading-zero", 10, "10"],
  ["decimal-leading-zero", -3, "-3"],
  ["lower-alpha", 1, "a"],
  ["lower-alpha", 26, "z"],
  ["lower-alpha", 27, "aa"],
  ["lower-alpha", 52, "az"],
  ["lower-alpha", 702, "zz"],
  ["lower-alpha", 703, "aaa"],
  ["lower-alpha", 3999, "ewu"],
  ["lower-alpha", 0, "0"],
  ["lower-alpha", -3, "-3"],
  ["upper-alpha", 1, "A"],
  ["upper-alpha", 28, "AB"],
  ["lower-roman", 9, "ix"],
  ["lower-roman", 3999, "mmmcmxcix"],
  ["lower-roman", 0, "0"],
  ["lower-roman", 4000, "4000"],
  ["lower-roman", -3, "-3"],
  ["upper-roman", 1, "I"],
  ["upper-roman", 4, "IV"],
  ["upper-roman", 14, "XIV"],
  ["upper-roman", 1994, "MCMXCIV"],
];

describe("counterText / parseCounter", () => {
  test.each(COUNTER_PROBES)("%s %d prints %s", (style, value, text) => {
    expect(counterText(value, style)).toBe(text);
  });
  test.each(COUNTER_PROBES)("%s %d parses back from %s", (style, value, text) => {
    expect(parseCounter(`${text}. `, style)).toEqual({ value, suffix: ". " });
  });
  test("rejects a token counterText would not print; honours the prefix", () => {
    expect(parseCounter("iiii. ", "lower-roman")).toBeUndefined();
    expect(parseCounter("• ", "decimal")).toBeUndefined();
    expect(parseCounter("Step 3", "decimal", "Step ")).toEqual({ value: 3, suffix: "" });
    expect(parseCounter("3", "decimal", "Step ")).toBeUndefined();
  });
});

describe("contentAlt", () => {
  test("strings after a top-level slash", () => {
    expect(contentAlt('url("data:image/svg+xml,%3Csvg/%3E") / "Info"')).toBe("Info");
    expect(contentAlt('url("a.png") url("b.png") " t" / "two" "f"')).toBe("twof");
    expect(contentAlt('url("a.png")')).toBeUndefined();
    expect(contentAlt('"a / b"')).toBeUndefined();
    expect(contentAlt(undefined)).toBeUndefined();
  });
});
