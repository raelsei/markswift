import { expect, test } from "bun:test";
import { buildControl, controlOf } from "../../../src/analysis/controls.ts";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

function element(tag: string, attrs: Record<string, string> = {}, children: LayoutNode[] = [], text?: string): LayoutNode {
  return { tag, attrs, children, ...(text !== undefined ? { text } : {}), id: tag === "select" ? "#list" : undefined,
    styles: { display: "inline-block", "font-family": "system-ui", "font-size": "14px" },
    bounds: { x: 10, y: 20, w: tag === "select" ? 180 : 0, h: tag === "select" ? 70 : 0 } };
}
function option(label: string, attrs: Record<string, string> = {}): LayoutNode {
  return element("option", attrs, [element("#text", {}, [], label)]);
}
function compile(root: LayoutNode, mode: "app" | "fidelity" = "app") {
  const layout: LayoutDoc = { version: 1, source: "select-list.html", combo: { screen: "select-list", theme: "light", demoState: "normal" },
    size: { w: 200, h: 120 }, dpr: 1, canvas: "white", fonts: [], root };
  return compileLayout(layout, { name: "Scroll", mode });
}

test("multiple selects retain all selected ordinals including hidden, disabled, duplicate and empty choices", () => {
  const root = element("select", { multiple: "" }, [option("Twin", { selected: "", value: "same" }),
    option("Twin", { value: "same" }), option("", { selected: "", value: "" }),
    element("optgroup", { label: "Unavailable", disabled: "" }, [option("Blocked", { selected: "" })]),
    option("Hidden", { selected: "", hidden: "" })]);
  const spec = controlOf(root)!;
  expect(spec).toMatchObject({ selectList: "multiple", selectedChoices: [0, 2, 3, 4] });
  expect(spec.selectStatic).toBeUndefined();
  expect(spec.choices?.map(choice => [choice.id, choice.value, choice.label])).toEqual([
    [0, "same", "Twin"], [1, "same", "Twin"], [2, "", ""], [3, "Blocked", "Blocked"], [4, "Hidden", "Hidden"],
  ]);
  const result = compile(root);
  expect(result.code).toContain("@State private var s_list: Set<Int> = [0, 2, 3, 4]");
  expect(result.code).toContain("MarkswiftSelectionList(");
  expect(result.code).toContain("markswiftToggleSelect(s_list, choice: choice)");
  expect(result.code).not.toContain("SwiftUI.Menu");
  expect(result.code).not.toContain('Text(verbatim: "Twin\\n\\nBlocked\\nHidden")');
});

test("single listboxes retain explicit empty state and use exclusive ordinal selection", () => {
  const root = element("select", { size: "4" }, [option("A"), option("B")]);
  root.selectedIndex = -1;
  expect(controlOf(root)).toMatchObject({ selectList: "single", selectedChoice: -1 });
  expect(compile(root).code).toContain("@State private var s_list: Int = -1");
  expect(compile(root).code).toContain("markswiftSelectOne(s_list, choice: choice)");
  expect(controlOf(element("select", { multiple: "" }, [option("A")]))).toMatchObject({ selectedChoices: [] });
});

test("fidelity retains measured visible option and heading rows at captured scrolled positions", () => {
  const a = option("Before", { selected: "" }); a.bounds = { x: 11, y: -2, w: 178, h: 17 };
  const b = option("Visible"); b.bounds = { x: 11, y: 32, w: 178, h: 17 };
  b.styles["padding-left"] = "20px";
  const c = option("After"); c.bounds = { x: 11, y: 49, w: 178, h: 17 };
  const group = element("optgroup", { label: "Group" }, [b, c]); group.bounds = { x: 11, y: 15, w: 178, h: 51 };
  const root = element("select", { multiple: "" }, [a, group]);
  const spec = controlOf(root)!;
  expect(spec.selectRows?.map(row => [row.kind, row.label, row.frame.y])).toEqual([["group", "Group", -5], ["option", "Visible", 12], ["option", "After", 29]]);
  const result = compile(root, "fidelity");
  expect(result.code).toContain("MarkswiftCapturedSelectRows(");
  expect(result.code).not.toContain("MarkswiftSelectionList(");
  expect(result.code).not.toContain('Text(verbatim: "Before")');
  expect(result.diagnostics.flatMap(item => item.notes).join(" ")).toContain("browser list row paint");
});

test("unmeasured fidelity lists show diagnosed option rows rather than joined selected labels", () => {
  const root = element("select", { multiple: "" }, [option("One", { selected: "" }), option("Two", { selected: "" }), option("Unselected")]);
  const result = compile(root, "fidelity");
  expect(result.code).toContain("MarkswiftSelectionList(");
  expect(result.code).toContain('label: "Unselected"');
  expect(result.code).toContain("interactive: false");
  expect(result.diagnostics.flatMap(item => item.notes).join(" ")).toContain("scroll position");
});

test("app list rows retain measured appearance by ordinal even outside the captured viewport", () => {
  const first = option("Selected", { selected: "" });
  first.bounds = { x: 11, y: 21, w: 178, h: 17 };
  first.styles["padding-left"] = "2px"; first.styles["padding-bottom"] = "1px";
  first.styles["background-color"] = "rgb(20, 60, 100)";
  const last = option("Below viewport"); last.bounds = { x: 11, y: 200, w: 178, h: 21 };
  const root = element("select", { multiple: "" }, [first, last]);
  const spec = controlOf(root)!;
  expect(spec.choices?.[0]?.row).toMatchObject({ height: 17, padding: [0, 0, 1, 2], background: { r: 20 / 255, g: 60 / 255, b: 100 / 255, a: 1 } });
  expect(spec.choices?.[1]?.row?.height).toBe(21);
  expect(spec.selectRows?.map(row => row.label)).toEqual(["Selected"]);
  expect(compile(root).code).toContain("appearance: [0: MarkswiftSelectRowAppearance(");
  expect(compile(root).code).toContain("height: 21.0");
});

test("an intrinsic HTML list viewport retains captured height rather than expanding into stack slack", () => {
  const root = element("select", { size: "3" }, [option("A")]);
  const node = buildControl(controlOf(root)!, { base: {
    id: "list", frame: { x: 0, y: 0, w: 180, h: 71 }, width: { kind: "fill" }, height: { kind: "hug" },
    padding: [1, 1, 1, 1], style: { fills: [], shadows: [] }, overlays: [], confidence: "mapped", notes: [],
  }, children: [], texts: [] });
  expect(node.height).toEqual({ kind: "fixed", px: 71 });
});

test("visibility-hidden list rows retain space and selection but cannot expose visible actions or headings", () => {
  const invisible = option("Invisible", { selected: "" });
  invisible.styles.visibility = "hidden"; invisible.bounds = { x: 11, y: 21, w: 178, h: 17 };
  const restored = option("Visible override"); restored.bounds = { x: 11, y: 55, w: 178, h: 17 };
  const group = element("optgroup", { label: "Invisible heading" }, [restored]);
  group.styles.visibility = "hidden"; group.bounds = { x: 11, y: 38, w: 178, h: 34 };
  const root = element("select", { multiple: "" }, [invisible, group]);
  const spec = controlOf(root)!;
  expect(spec.choices?.[0]).toMatchObject({ invisible: true, row: { height: 17 } });
  expect(spec.choices?.[0]?.hidden).toBeUndefined();
  expect(spec.choices?.[1]?.group).toMatchObject({ invisible: true });
  expect(spec.selectedChoices).toEqual([0]);
  expect(spec.selectRows?.map(row => row.label)).toEqual(["Visible override"]);
  expect(compile(root).code).toContain("invisible: true");
  expect(compile(root).code).toContain("groupInvisible: true");
  expect(spec.notes.join(" ")).toContain("initial scroll position starts at the top");
  expect(spec.notes.join(" ")).toContain("native highlight");
});

test("option wrappers and optgroups contribute choice metadata without unused views or mapping nodes", () => {
  const first = option("Twin", { value: "same", selected: "" }); first.bounds = { x: 11, y: 21, w: 178, h: 17 };
  const last = option("Twin", { value: "same", selected: "" }); last.bounds = { x: 11, y: 55, w: 178, h: 17 };
  const group = element("optgroup", { label: "Group" }, [last]); group.id = "#unused_group"; group.bounds = { x: 11, y: 38, w: 178, h: 34 };
  const wrapper = element("div", {}, [first, group]); wrapper.id = "#unused_wrapper"; wrapper.bounds = { x: 11, y: 21, w: 178, h: 51 };
  const select = element("select", { multiple: "" }, [wrapper]);
  const root = element("main", {}, [select]); root.bounds = { x: 0, y: 0, w: 200, h: 120 };
  for (const mode of ["app", "fidelity"] as const) {
    const result = compile(root, mode);
    expect(result.mapping.total).toBe(2);
    expect(result.code).not.toContain("private var v_unused_group");
    expect(result.code).not.toContain("private var v_unused_wrapper");
    if (mode === "app") {
      expect(result.code).toContain('id: 0, value: "same", label: "Twin"');
      expect(result.code).toContain('id: 1, value: "same", label: "Twin"');
      expect(result.code).toContain('groupLabel: "Group"');
    } else {
      expect(result.code).toContain('MarkswiftCapturedSelectRow(label: "Group"');
    }
  }
});
