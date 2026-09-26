import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type ControlNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("live date-family values retain local components and native selection granularity", async () => {
  const result = await convertHtml(`<main data-markswift-root style="font:14px system-ui">
    <input id="day" type="date" value="2023-02-01">
    <input id="clock" type="time" value="08:15">
    <input id="appointment" type="datetime-local" value="2023-02-01T08:15">
    <input id="month" type="month" value="2023-02">
    <input id="week" type="week" value="2023-W05">
    <input id="empty" type="date">
  </main>`, {
    name: "CapturedDates",
    async prepare(page) {
      await page.evaluate(() => {
        (document.querySelector("#day") as HTMLInputElement).value = "2024-02-29";
        (document.querySelector("#clock") as HTMLInputElement).value = "23:07";
        (document.querySelector("#appointment") as HTMLInputElement).value = "2023-02-01T08:15:30.250";
      });
    },
  });
  const controls = new Map<string, ControlNode>();
  walk(inferScreen(result.layout, "CapturedDates").root, node => { if (node.kind === "control") controls.set(node.id, node); });
  expect(controls.get("#day")?.dateComponents).toEqual({ year: 2024, month: 2, day: 29 });
  expect(controls.get("#clock")?.dateComponents).toEqual({ hour: 23, minute: 7, second: 0, nanosecond: 0 });
  expect(controls.get("#appointment")?.dateComponents).toEqual({ year: 2023, month: 2, day: 1, hour: 8, minute: 15, second: 30, nanosecond: 250000000 });
  expect(result.code).toContain("year: 2024, month: 2, day: 29");
  expect(result.code).toContain("DatePicker(selection: $s_clock, displayedComponents: .hourAndMinute)");
  expect(result.code).toContain("DatePicker(selection: $s_appointment, displayedComponents: [.date, .hourAndMinute])");
  expect(result.code).toContain('Text(verbatim: "2023-02")');
  expect(result.code).toContain('Text(verbatim: "2023-W05")');
  expect(result.code).not.toContain("s_month");
  expect(result.code).not.toContain("s_week");
  expect(result.diagnostics.find(item => item.id === "#empty")?.notes.join(" ")).toContain("empty selection");
  expect(result.diagnostics.find(item => item.id === "#appointment")?.notes.join(" ")).toContain("seconds/fractions");
}, 30000);

browserTest("readonly date-family controls retain captured text without DatePicker state", async () => {
  const result = await convertHtml(`<main data-markswift-root>
    <input id="day" readonly type="date" value="2023-02-01">
    <input id="clock" readonly type="time" value="23:07">
    <input id="appointment" readonly type="datetime-local" value="2023-02-01T23:07">
  </main>`, { name: "ReadonlyDates" });
  for (const value of ["2023-02-01", "23:07", "2023-02-01T23:07"]) expect(result.code).toContain(`Text(verbatim: "${value}")`);
  expect(result.code).not.toContain("@State");
  expect(result.code).not.toContain("DatePicker(");
}, 30000);
