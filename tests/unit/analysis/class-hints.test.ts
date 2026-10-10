import { expect, test } from "bun:test";
import { classColorHints } from "../../../src/analysis/class-hints.ts";

test("a dark: utility does not name the light colour", () => {
  expect(classColorHints({ class: "text-slate-500 dark:text-slate-400" })).toEqual(["slate-500"]);
});

test("every variant is dropped", () => {
  expect(classColorHints({ class: "bg-white dark:bg-slate-900 hover:bg-gray-50 md:text-red-500" })).toEqual(["white"]);
});

test("important markers are stripped and non-colour utilities ignored", () => {
  expect(classColorHints({ class: "!bg-card text-muted-foreground border-x" })).toEqual(["card", "muted-foreground"]);
});
