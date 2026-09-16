/** SVG presentation attributes, inherited values and references. */
import { type LayoutNode } from "../../model/layout.ts";
import { parseDeclared } from "../../css/index.ts";
import { type SvgScope, type SvgContext } from "./context.ts";

/** Presentation attributes that inherit to descendants (SVG 2 property index). */
const INHERITED_ATTRS = [
  "clip-rule",
  "color",
  "fill",
  "fill-opacity",
  "fill-rule",
  "font-family",
  "font-size",
  "font-weight",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
];

export function inherit(parent: Record<string, string>, own: Record<string, string>): Record<string, string> {
  const out = { ...parent };
  for (const k of INHERITED_ATTRS) if (own[k] !== undefined) out[k] = own[k]!;
  return out;
}

/** Presentation value: computed style first, attribute fallback; inside a `<use>` instance `currentColor` follows the use element. */
export function styleProp(c: LayoutNode, attrs: Record<string, string>, k: string, scope: SvgScope): string | undefined {
  const declared = attrs[k];
  if (scope.useColor && declared === "currentColor") return scope.useColor;
  return c.styles[k] ?? declared;
}

/** `url(#id)` target from an attribute or the inline `style` (non-whitelisted properties such as `clip-path`/`mask`). */
export function reference(c: LayoutNode, attrs: Record<string, string>, k: string, ctx: SvgContext): LayoutNode | undefined {
  const raw = attrs[k] ?? parseDeclared(c.attrs["style"])[k];
  const m = raw && /^url\(["']?#([^"')]+)["']?\)/.exec(raw);
  if (m && !ctx.ids[m[1]!]) ctx.notes.push(`unmapped: svg ${k} url(#${m[1]}) (target not in document)`);
  return m ? ctx.ids[m[1]!] : undefined;
}

export function parseDash(s: string | undefined): number[] {
  if (!s || s === "none") return [];
  const v = s.split(/[\s,]+/).map(parseFloat).filter((x) => Number.isFinite(x) && x >= 0);
  return v.some((x) => x > 0) ? v : [];
}

export function num(s: string | undefined, def = 0): number {
  const v = s === undefined ? NaN : parseFloat(s);
  return Number.isFinite(v) ? v : def;
}
