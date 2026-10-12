import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import { emitSwift, type EmitOptions } from "../../../src/swift/emit.ts";

function element(
  tag: string,
  x: number,
  y: number,
  w: number,
  h: number,
  styles: Record<string, string>,
  children: LayoutNode[] = [],
): LayoutNode {
  return { tag, attrs: {}, bounds: { x, y, w, h }, styles, children };
}
function text(s: string, x: number, y: number, w: number, color = "rgb(17, 17, 17)", weight = "400"): LayoutNode {
  const t: LayoutNode = { tag: "#text", attrs: {}, styles: {}, bounds: { x, y, w, h: 20 }, text: s, children: [] };
  return element(
    "p",
    x,
    y,
    w,
    20,
    { display: "block", "font-size": "14px", "line-height": "20px", color, "font-weight": weight },
    [t],
  );
}
interface RowSpec {
  name: string;
  role: string;
  color: string;
  weight?: string;
  /** Radius of an absolutely positioned badge painted over the row. */
  badge?: number;
}
const ROWS: RowSpec[] = [
  { name: "Ada", role: "Owner", color: "rgb(200, 30, 30)" },
  { name: "Alan", role: "Editor", color: "rgb(30, 120, 30)" },
  { name: "Grace", role: "Viewer", color: "rgb(30, 30, 200)" },
];
const FLEX_ROW = {
  display: "flex",
  "flex-direction": "row",
  "align-items": "center",
  gap: "12px",
  position: "relative",
};
function row(r: RowSpec, x: number, y: number, w: number): LayoutNode {
  const kids = [text(r.name, x, y, 100, "rgb(17, 17, 17)", r.weight), text(r.role, x + 112, y, 60, r.color)];
  if (r.badge !== undefined)
    kids.push(
      element("span", x + w - 20, y, 20, 20, {
        position: "absolute",
        display: "block",
        "background-color": "rgb(220, 40, 40)",
        "border-top-left-radius": `${r.badge}px`,
        "border-top-right-radius": `${r.badge}px`,
        "border-bottom-left-radius": `${r.badge}px`,
        "border-bottom-right-radius": `${r.badge}px`,
      }),
    );
  return element("li", x, y, w, 20, FLEX_ROW, kids);
}
function doc(root: LayoutNode): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "components-test",
    combo: { screen: "list", theme: "light" },
    size: { w: 393, h: 200 },
    dpr: 3,
    canvas: "rgb(255,255,255)",
    fonts: [],
    root,
  };
}
/** A column list of rows with a uniform 8px gap inside a block root. */
function listDoc(rows: RowSpec[]): LayoutDoc {
  const list = element(
    "ul",
    16,
    16,
    360,
    rows.length * 28 - 8,
    { display: "flex", "flex-direction": "column", gap: "8px" },
    rows.map((r, i) => row(r, 16, 16 + i * 28, 360)),
  );
  return doc(
    element("main", 0, 0, 393, 200, { display: "block", "padding-top": "16px", "padding-left": "16px" }, [list]),
  );
}
function emit(input: LayoutDoc, opts: Partial<EmitOptions> = {}): string {
  return emitSwift(inferScreen(input, "list"), "List", { mode: "app", ...opts }).view;
}
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

test("equal rows in a uniform column become one ForEach over a row type", () => {
  const swift = emit(listDoc(ROWS));
  expect(count(swift, /ForEach\(Self\.rows\) \{ row in/g)).toBe(1);
  expect(count(swift, /struct Row: Identifiable/g)).toBe(1);
  expect(count(swift, /struct RowView: View/g)).toBe(1);
  expect(count(swift, /Row\(id: /g)).toBe(3);
  expect(swift).toContain("Text(verbatim: row.text)");
  expect(swift).toContain(".foregroundStyle(row.color)");
  expect(swift).not.toContain("private var v_0_1");
  expect(swift).not.toContain("private var v_0_2");
});

test("extract: false keeps every container unrolled", () => {
  const swift = emit(listDoc(ROWS), { extract: false });
  expect(swift).not.toContain("ForEach(");
  // main, ul and three li.
  expect(count(swift, /private var v_/g)).toBe(5);
});

test("a screen without repeated rows is byte-identical with extraction on", () => {
  const input = listDoc([ROWS[0]!]);
  expect(emit(input)).toBe(emit(input, { extract: false }));
});

test("a row with a different font weight breaks the run", () => {
  const swift = emit(listDoc([ROWS[0]!, ROWS[1]!, { ...ROWS[2]!, weight: "700" }]));
  expect(count(swift, /ForEach\(/g)).toBe(1);
  expect(count(swift, /Row\(id: /g)).toBe(2);
  expect(swift).toContain('Text(verbatim: "Grace")');
  const apart = emit(listDoc([ROWS[0]!, { ...ROWS[1]!, weight: "700" }, ROWS[2]!]));
  expect(apart).not.toContain("ForEach(");
  expect(apart).not.toContain("struct Row");
});

test("grid tiles share a subview called once per tile", () => {
  const tile = (i: number) => {
    const x = 16 + (i % 2) * 180,
      y = 16 + Math.floor(i / 2) * 50;
    return element("div", x, y, 170, 40, { display: "flex", "flex-direction": "column", gap: "0px" }, [
      text(`Tile ${i + 1}`, x, y, 170),
      text(`${i + 1}0 items`, x, y + 20, 170),
    ]);
  };
  const grid = element(
    "section",
    16,
    16,
    350,
    90,
    {
      display: "grid",
      "grid-template-columns": "170px 170px",
      "grid-template-rows": "40px 40px",
      "column-gap": "10px",
      "row-gap": "10px",
    },
    [0, 1, 2, 3].map(tile),
  );
  const swift = emit(
    doc(element("main", 0, 0, 393, 200, { display: "block", "padding-top": "16px", "padding-left": "16px" }, [grid])),
  );
  expect(swift).not.toContain("ForEach(");
  for (const i of [0, 1, 2, 3]) expect(swift).toContain(`RowView(row: Self.rows[${i}])`);
});

test("rows whose overlays differ are not a run", () => {
  const swift = emit(
    listDoc([
      { ...ROWS[0]!, badge: 4 },
      { ...ROWS[1]!, badge: 8 },
    ]),
  );
  expect(swift).toContain("RoundedRectangle(cornerRadius: 4.0");
  expect(swift).not.toContain("ForEach(");
  // Control: the same badge on both rows is a run, so the overlay alone broke it above.
  expect(
    emit(
      listDoc([
        { ...ROWS[0]!, badge: 4 },
        { ...ROWS[1]!, badge: 4 },
      ]),
    ),
  ).toContain("ForEach(");
  expect(swift).not.toContain("struct Row");
});

test("lists sharing a row type keep each list's own constants", () => {
  const ul = (rows: RowSpec[], y: number) =>
    element(
      "ul",
      16,
      y,
      360,
      rows.length * 28 - 8,
      { display: "flex", "flex-direction": "column", gap: "8px" },
      rows.map((r, i) => row(r, 16, y + i * 28, 360)),
    );
  // Within each list the role is constant; across the two lists it differs. Different lengths keep
  // the lists themselves from forming the (outermost) run.
  const same = (role: string) => ROWS.map((r) => ({ ...r, role, color: "rgb(30, 30, 200)" }));
  const lists = [ul(same("Owner"), 16), ul(same("Editor").slice(0, 2), 100)];
  const swift = emit(
    doc(element("main", 0, 0, 393, 200, { display: "block", "padding-top": "16px", "padding-left": "16px" }, lists)),
  );
  expect(count(swift, /struct Row\w*: Identifiable/g)).toBe(1);
  expect(count(swift, /ForEach\(Self\.rows2?\) \{ row in/g)).toBe(2);
  expect(swift).toContain('text2: "Editor"');
  expect(swift).toContain("Text(verbatim: row.text2)");
});

test("fidelity mode never extracts", () => {
  expect(emit(listDoc(ROWS), { mode: "fidelity" })).not.toContain("ForEach(");
});

test("extraction is deterministic", () => {
  expect(emit(listDoc(ROWS))).toBe(emit(listDoc(ROWS)));
});
