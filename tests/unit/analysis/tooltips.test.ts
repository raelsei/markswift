/** `title` and captured tooltip layers become `SemBase.tooltip`. */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { isTooltipLayer } from "../../../src/analysis/tooltips.ts";
import { LAYOUT_DOC_VERSION, type Layer, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import { type SemNode, walk } from "../../../src/model/semantic.ts";

const FONT = { "font-family": "system-ui", "font-size": "17px", "line-height": "22px", color: "rgb(0, 0, 0)" };

const text = (value: string, x = 0, y = 0, w = 60): LayoutNode => ({
  tag: "#text",
  attrs: {},
  styles: {},
  bounds: { x, y, w, h: 22 },
  text: value,
  children: [],
});

function el(
  tag: string,
  attrs: Record<string, string>,
  children: LayoutNode[],
  display = "block",
  id?: string,
): LayoutNode {
  return {
    tag,
    ...(id ? { id } : {}),
    attrs,
    styles: { ...FONT, display },
    bounds: { x: 0, y: 0, w: 200, h: 22 },
    children,
  };
}

function doc(children: LayoutNode[], layers?: Layer[]): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "tooltips.html",
    combo: { screen: "tooltips", theme: "light" },
    size: { w: 320, h: 400 },
    viewport: { x: 0, y: 0, w: 320, h: 400 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: {
      tag: "main",
      id: "root",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 320, h: 400 },
      children,
    },
    ...(layers ? { layers } : {}),
  };
}

const nodes = (d: LayoutDoc): SemNode[] => {
  const out: SemNode[] = [];
  walk(inferScreen(d, "Tooltips").root, (n) => out.push(n));
  return out;
};
const tooltips = (d: LayoutDoc) => nodes(d).flatMap((n) => (n.tooltip ? [n.tooltip] : []));

function layer(over: Partial<Layer>, content: LayoutNode): Layer {
  return {
    id: "tip",
    trigger: "trigger",
    activation: "hover",
    relation: "dom-diff",
    modal: false,
    placement: "anchored",
    nodes: [content],
    dismiss: { escape: false, outside: false, buttons: [] },
    ...over,
  };
}

const trigger = (slot: string) => el("button", { "data-slot": slot }, [text("Hover")], "inline-flex", "trigger");

describe("title", () => {
  test("an element's title is its tooltip", () => {
    expect(tooltips(doc([el("button", { title: "Save draft" }, [text("Save")], "inline-block")]))).toEqual([
      "Save draft",
    ]);
  });

  test("an inline element's title applies to the paragraph's Text", () => {
    const p = el("p", {}, [
      text("Read "),
      el("abbr", { title: "HyperText  Markup\nLanguage" }, [text("HTML", 40)], "inline"),
      text(" docs", 80),
    ]);
    const all = nodes(doc([p]));
    expect(all.find((n) => n.kind === "text")?.tooltip).toBe("HyperText Markup Language");
  });

  test("two inline titles join with a semicolon, each once", () => {
    const p = el("p", {}, [
      el("abbr", { title: "HyperText Markup Language" }, [text("HTML")], "inline"),
      text(" and "),
      el("abbr", { title: "Cascading Style Sheets" }, [text("CSS", 100)], "inline"),
      el("abbr", { title: "HyperText Markup Language" }, [text(" HTML", 140)], "inline"),
    ]);
    expect(nodes(doc([p])).find((n) => n.kind === "text")?.tooltip).toBe(
      "HyperText Markup Language; Cascading Style Sheets",
    );
  });

  test("an iframe's title is its name and a blank title says nothing", () => {
    const frame = el("iframe", { title: "Embedded frame" }, [], "inline-block");
    expect(tooltips(doc([frame, el("button", { title: "  " }, [text("Save")], "inline-block")]))).toEqual([]);
  });
});

describe("tooltip layers", () => {
  const tip = el("div", { role: "tooltip" }, [text("Add to library")]);

  test("a describedby hover layer becomes its trigger's tooltip", () => {
    const l = layer({ relation: "aria-describedby" }, tip);
    expect(isTooltipLayer(l)).toBe(true);
    const all = nodes(doc([trigger("tooltip-trigger")], [l]));
    expect(all.find((n) => n.id === "trigger")?.tooltip).toBe("Add to library");
  });

  test("Radix's visually hidden role=tooltip copy is read once", () => {
    const content = el("div", { "data-slot": "tooltip-content" }, [
      text("Add to library"),
      el("span", { role: "tooltip" }, [text("Add to library")], "inline"),
    ]);
    const all = nodes(doc([trigger("tooltip-trigger")], [layer({}, content)]));
    expect(all.find((n) => n.id === "trigger")?.tooltip).toBe("Add to library");
  });

  test("an interestfor layer is a tooltip", () => {
    const hint = el("div", { popover: "hint" }, [text("More information")]);
    expect(isTooltipLayer(layer({ relation: "interestfor" }, hint))).toBe(true);
  });

  test("a hover layer of a shadcn tooltip trigger is a tooltip once the trigger is resolved", () => {
    const d = doc([trigger("tooltip-trigger")]);
    const plain = layer({}, el("div", {}, [text("Add to library")]));
    expect(isTooltipLayer(plain, d.root)).toBe(true);
  });

  test("hover cards and dialogs are not tooltips", () => {
    const card = layer({}, el("div", { "data-slot": "hover-card-content" }, [text("@nextjs")]));
    const d = doc([trigger("hover-card-trigger")], [card]);
    expect(isTooltipLayer(card, d.root)).toBe(false);
    expect(tooltips(d)).toEqual([]);
    const dialog = layer(
      { activation: "click", relation: "aria-controls", modal: true, placement: "viewport" },
      el("div", { role: "dialog" }, [text("Edit profile")]),
    );
    expect(isTooltipLayer(dialog, d.root)).toBe(false);
  });
});
