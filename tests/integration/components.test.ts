import { expect, test } from "bun:test";
import { convert, convertHtml } from "../../src/index.ts";
import { GRID_RADIO, GRID_RADIO_CSS, ICONS, ICONS_CSS, SETTINGS, SETTINGS_CSS } from "../helpers/component-fixtures.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const LIST24 = "tests/conformance/fixtures/components/shadcn-list-24.html";
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

browserTest(
  "a 24-row list is one ForEach over 24 data rows",
  async () => {
    const { code } = await convert({ file: LIST24 }, { name: "List24" });
    expect(count(code, /ForEach\(/g)).toBe(1);
    expect(code.split("\n").length).toBeLessThanOrEqual(200);
    expect(count(code, /private var v_/g)).toBeLessThanOrEqual(6);
    expect(code).toContain("static let rows: [Row] = [");
    expect(count(code, /^\s+Row\(id: /gm)).toBe(24);
  },
  60000,
);

browserTest(
  "extraction is deterministic across conversions",
  async () => {
    const a = await convert({ file: LIST24 }, { name: "List24" });
    const b = await convert({ file: LIST24 }, { name: "List24" });
    expect(b.files).toEqual(a.files);
  },
  60000,
);

browserTest(
  "rows with controls bind through ForEach($rows) and collapse their actions",
  async () => {
    const { code } = await convertHtml(SETTINGS, { name: "Settings", css: SETTINGS_CSS });
    expect(code).toContain("ForEach($rows) { $row in");
    expect(code).toContain("@Binding var row: Row");
    expect(code).toContain("$row.isOn");
    expect(code).toContain("row.isOn.toggle()");
    expect(count(code, /\(Row\) -> Void = \{ _ in \}/g)).toBe(1);
    const action = code.match(/var (on\w+): \(Row\) -> Void = \{ _ in \}/)![1]!;
    expect(code).toContain(`{ ${action}(row) }`);
    expect(count(code, /var onSave: \(\) -> Void = \{\}/g)).toBe(1);
  },
  60000,
);

browserTest(
  "differing icons become AnyShape fields",
  async () => {
    const { code } = await convertHtml(ICONS, { name: "Icons", css: ICONS_CSS });
    expect(code).toContain("var icon: AnyShape");
    expect(count(code, /AnyShape\(MarkswiftShape_/g)).toBe(3);
    expect(code).toMatch(/row\.icon\.(fill|stroke)\(/);
  },
  60000,
);

browserTest(
  "grid tiles are unrolled calls and radio rows pass their group binding through",
  async () => {
    const { code } = await convertHtml(GRID_RADIO, { name: "GridRadio", css: GRID_RADIO_CSS });
    expect(code).not.toContain("ForEach(Self.rows)");
    expect(code).toContain("RowView(row: Self.rows[3]");
    expect(code).toMatch(/@Binding var s_\w+: String/);
  },
  60000,
);
