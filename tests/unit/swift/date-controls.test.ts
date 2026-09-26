import { expect, test } from "bun:test";
import { controlOf } from "../../../src/analysis/controls.ts";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

function input(type: string, value: string, attrs: Record<string, string> = {}): LayoutNode {
  return {
    id: "#date-field", tag: "input", attrs: { type, value, ...attrs },
    styles: { display: "inline-block", width: "200px", height: "32px", "font-family": "system-ui", "font-size": "14px" },
    bounds: { x: 0, y: 0, w: 200, h: 32 }, children: [],
  };
}

function compile(node: LayoutNode, mode: "app" | "fidelity" = "app") {
  const layout: LayoutDoc = {
    version: 1, source: "date-controls.html", combo: { screen: "date-controls", theme: "light", demoState: "normal" },
    size: { w: 200, h: 32 }, dpr: 1, canvas: "white", fonts: [], root: node,
  };
  return compileLayout(layout, { name: "DateControls", mode });
}

test("captured date and datetime values seed Gregorian local components with the correct picker granularity", () => {
  const date = compile(input("date", "2023-02-01"));
  expect(date.code).toContain("Calendar(identifier: .gregorian).date(from: DateComponents(timeZone: .current, year: 2023, month: 2, day: 1, hour: 12, minute: 0, second: 0, nanosecond: 0))");
  expect(date.code).toContain("displayedComponents: .date");
  const datetime = compile(input("datetime-local", "2024-02-29T08:15:30.25"));
  expect(datetime.code).toContain("year: 2024, month: 2, day: 29, hour: 8, minute: 15, second: 30, nanosecond: 250000000");
  expect(datetime.code).toContain("displayedComponents: [.date, .hourAndMinute]");
  expect(datetime.diagnostics.flatMap(item => item.notes).join(" ")).toContain("seconds/fractions");
  expect(date.diagnostics.flatMap(item => item.notes).join(" ")).toContain("locale formatting");
});

test("time-only values retain their local clock and expose only time selection", () => {
  const result = compile(input("time", "23:07"));
  expect(result.code).toContain("DateComponents(timeZone: .current, year: 2001, month: 1, day: 1, hour: 23, minute: 7, second: 0, nanosecond: 0)");
  expect(result.code).toContain("displayedComponents: .hourAndMinute");
  expect(result.code).not.toContain("timeIntervalSince1970");
  expect(result.code).not.toContain("ISO8601DateFormatter");
});

test("month and week selection remain diagnosed static values without broader date state", () => {
  for (const [type, value] of [["month", "2023-02"], ["week", "2023-W05"]] as const) {
    const result = compile(input(type, value));
    expect(result.code).toContain(`Text(verbatim: "${value}")`);
    expect(result.code).not.toContain("DatePicker(");
    expect(result.code).not.toContain("@State");
    expect(result.diagnostics.flatMap(item => item.notes).join(" ")).toContain("editing requires a custom selector");
  }
});

test("empty or invalid date values start at current local time with an explicit limitation", () => {
  for (const [type, value] of [["date", ""], ["date", "2023-02-29"], ["time", "24:00"], ["datetime-local", "2023-02-01T08:15Textra"]] as const) {
    const result = compile(input(type, value));
    expect(result.code).toContain("@State private var s_date_field: Date = .now");
    expect(result.diagnostics.flatMap(item => item.notes).join(" ")).toContain("native picker starts at the current local date/time");
  }
  expect(controlOf(input("date", "2000-02-29"))?.dateComponents).toEqual({ year: 2000, month: 2, day: 29 });
  expect(controlOf(input("date", "1900-02-29"))?.dateComponents).toBeUndefined();
});

test("readonly and fidelity date controls preserve raw values as text, with readonly owning no state", () => {
  for (const mode of ["app", "fidelity"] as const) for (const type of ["date", "time", "datetime-local"]) {
    const value = type === "date" ? "2023-02-01" : type === "time" ? "23:07" : "2023-02-01T23:07";
    const result = compile(input(type, value, { readonly: "" }), mode);
    expect(result.code).toContain(`Text(verbatim: "${value}")`);
    expect(result.code).not.toContain("DatePicker(");
    expect(result.code).not.toContain("@State");
    expect(result.diagnostics.flatMap(item => item.notes).join(" ")).not.toContain("picker starts");
  }
  expect(compile(input("date", "2023-02-01"), "fidelity").code).toContain('Text(verbatim: "2023-02-01")');
});

test("date validation and minute-only picker limitations remain visible", () => {
  const spec = controlOf(input("time", "12:00", { min: "09:00", max: "17:00", step: "1" }))!;
  expect(spec.notes.join(" ")).toContain("min/max/step validation constraints");
  expect(spec.notes.join(" ")).toContain("hour and minute selection only");
});
