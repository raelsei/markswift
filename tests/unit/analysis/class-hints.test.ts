import { expect, test } from "bun:test";
import { classColorHints } from "../../../src/analysis/class-hints.ts";

test("a dark: utility does not name the light colour", () => {
  expect(classColorHints({ class: "text-slate-500 dark:text-slate-400" })).toEqual(["text:slate-500"]);
});

test("every variant is dropped", () => {
  expect(classColorHints({ class: "bg-white dark:bg-slate-900 hover:bg-gray-50 md:text-red-500" })).toEqual(["bg:white"]);
});

test("important markers are stripped and non-colour utilities ignored", () => {
  expect(classColorHints({ class: "!bg-card text-muted-foreground border-x" })).toEqual(["bg:card", "text:muted-foreground"]);
});

test("each hint keeps the utility that painted it, so one name cannot be read as another role's", () => {
  expect(classColorHints({ class: "bg-white text-black border-t-red-500 ring-offset-white" })).toEqual(["bg:white", "text:black", "border-t:red-500", "ring-offset:white"]);
});

test("gradient stops keep their position, in Tailwind v3 and v4 spellings", () => {
  expect(classColorHints({ class: "bg-gradient-to-r from-sky-500 via-white to-indigo-500/80" })).toEqual(["from:sky-500", "via:white", "to:indigo-500"]);
  expect(classColorHints({ class: "bg-linear-to-r/oklch from-indigo-500 from-10% to-sky-500 to-90%" })).toEqual(["from:indigo-500", "to:sky-500"]);
});
