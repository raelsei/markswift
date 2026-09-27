import type { LayoutNode, Rect } from "../model/layout.ts";
import type { SemBase } from "../model/semantic.ts";
import { parseDeclared } from "../css/syntax.ts";

const pixel = (value: string): number | undefined => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/.test(value)
  && (value.endsWith("px") || Number(value) === 0) ? Number.parseFloat(value) : undefined;

/** Only authored fixed pixels establish all-width relative positioning. */
export function relativePosition(n: LayoutNode): { offset?: [number, number]; reason?: string } {
  if (n.styles.position !== "relative") return {};
  const insets = n.preferredSize?.relativeInsets;
  if (!insets) {
    // Partial legacy LayoutDocs omit CSS defaults. Missing inset fields mean default
    // auto; resolved zero pixels remain ambiguous (a calc can equal zero at capture).
    const absent = ["top", "right", "bottom", "left"].every(edge => n.styles[edge] === undefined);
    const declared = Object.keys(parseDeclared(n.attrs.style)).some(property => /^(?:inset(?:-|$)|top$|right$|bottom$|left$)/.test(property));
    if (absent && !declared) return {};
    return { reason: "authored relative insets unavailable" };
  }
  const values = insets.map(value => value === "auto" ? null : pixel(value));
  if (values.some(value => value === undefined)) return { reason: "percentage or complex relative inset" };
  const [top, right, bottom, left] = values as [number | null, number | null, number | null, number | null];
  if (left !== null && right !== null && !n.preferredSize?.relativeContainingDirection) return { reason: "relative containing-block direction unavailable" };
  const x = left !== null && (right === null || n.preferredSize?.relativeContainingDirection !== "rtl") ? left : right !== null ? -right : 0;
  const y = top !== null ? top : bottom !== null ? -bottom : 0;
  return x || y ? { offset: [x, y] } : {};
}

/** A child keeps its painted capture coordinates; normal flow excludes only its own shift. */
export function flowFrame(n: Pick<SemBase, "frame" | "relativeOffset">): Rect {
  const [x, y] = n.relativeOffset ?? [0, 0];
  return x || y ? { ...n.frame, x: n.frame.x - x, y: n.frame.y - y } : n.frame;
}

export function flowBounds(n: LayoutNode): Rect {
  return flowFrame({ frame: n.bounds, relativeOffset: relativePosition(n).offset });
}

export function relativeFallback(n: SemBase): boolean {
  return n.notes.some(note => note.startsWith("approximated: relative position "));
}
