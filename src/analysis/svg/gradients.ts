/** Resolve SVG gradient paint servers and inherited stops. */
import { type Rect, type LayoutNode } from "../../model/layout.ts";
import { type SvgGradient, addDiagnostic } from "../../model/semantic.ts";
import { parseDeclared, parseColor, round2 } from "../../css/index.ts";
import { type SvgContext } from "./context.ts";
import { transformAttr, apply, isIdentity } from "./transforms.ts";

// ---------- paint servers ----------

/** `url(#id)` → gradient in user units, or undefined (reported) when the id is not a gradient. */
export function gradientOf(raw: string, bbox: Rect, ctx: SvgContext): SvgGradient | undefined {
  const id = raw.replace(/^url\(["']?#|["']?\)$/g, "");
  const el = ctx.ids[id];
  if (!el || (el.tag !== "lineargradient" && el.tag !== "radialgradient")) {
    addDiagnostic(ctx.diagnostics, "unmapped", "fill", `svg paint url(#${id})`);
    return undefined;
  }
  // `href` chains: attributes and stops fall back to the referenced gradient.
  const chain: LayoutNode[] = [el];
  for (let cur = el, i = 0; i < 8; i++) {
    const href = cur.attrs["href"] ?? cur.attrs["xlink:href"];
    const next = href?.startsWith("#") ? ctx.ids[href.slice(1)] : undefined;
    if (!next || chain.includes(next)) break;
    chain.push(next);
    cur = next;
  }
  const attr = (k: string) => chain.map((g) => g.attrs[k]).find((v) => v !== undefined);
  const stopsEl = chain.find((g) => g.children.some((s) => s.tag === "stop")) ?? el;
  const stops: SvgGradient["stops"] = [];
  for (const s of stopsEl.children) {
    if (s.tag !== "stop") continue;
    const decl = parseDeclared(s.attrs["style"]);
    const color = parseColor(s.attrs["stop-color"] ?? decl["stop-color"] ?? s.styles["stop-color"] ?? "black");
    if (!color) continue;
    const so = parseFloat(s.attrs["stop-opacity"] ?? decl["stop-opacity"] ?? s.styles["stop-opacity"] ?? "1");
    const offRaw = s.attrs["offset"] ?? "0";
    let pos = parseFloat(offRaw) / (offRaw.trim().endsWith("%") ? 100 : 1);
    if (!Number.isFinite(pos)) pos = 0;
    pos = Math.max(stops[stops.length - 1]?.pos ?? 0, Math.min(1, pos));
    stops.push({ color: Number.isFinite(so) && so < 1 ? { ...color, a: color.a * so } : color, pos });
  }
  if (!stops.length) {
    addDiagnostic(ctx.diagnostics, "unmapped", "svg:stop", `svg gradient #${id} has no stops`);
    return undefined;
  }
  const [vx, , vw, vh] = ctx.vb;
  const obb = (attr("gradientunits") ?? "objectBoundingBox") !== "userSpaceOnUse";
  // Object-bounding-box coordinates map through the box; a gradientTransform applies in that space.
  const tf = transformAttr(attr("gradienttransform"));
  const toUser = (x: number, y: number): [number, number] => {
    const [tx, ty] = apply(tf, x, y);
    return obb ? [round2(bbox.x + tx * bbox.w), round2(bbox.y + ty * bbox.h)] : [round2(tx), round2(ty)];
  };
  // Percentages: of the bounding box (a fraction) or of the viewport span in user units.
  const len = (k: string, def: number, span: number) => {
    const v = attr(k);
    if (v === undefined) return def;
    const n = parseFloat(v);
    return v.trim().endsWith("%") ? (n / 100) * (obb ? 1 : span) : n;
  };
  if (el.tag === "lineargradient") {
    return {
      kind: "linear",
      stops,
      start: toUser(len("x1", 0, vw), len("y1", 0, vh)),
      end: toUser(len("x2", obb ? 1 : vx + vw, vw), len("y2", 0, vh)),
    };
  }
  const diag = Math.hypot(vw, vh) / Math.SQRT2;
  const r = len("r", obb ? 0.5 : diag / 2, diag);
  const center = toUser(len("cx", obb ? 0.5 : vx + vw / 2, vw), len("cy", obb ? 0.5 : ctx.vb[1] + vh / 2, vh));
  const radius: [number, number] = obb ? [round2(r * bbox.w), round2(r * bbox.h)] : [round2(r), round2(r)];
  if (!isIdentity(tf))
    addDiagnostic(
      ctx.diagnostics,
      "approximated",
      "svg:radialGradient",
      "svg radialGradient gradientTransform → centre only",
    );
  // Emitters draw an ellipse proportional to the frame or a circle; anything else is approximated.
  const proportional = Math.abs(bbox.w / vw - bbox.h / vh) < 0.005;
  if (obb && !proportional && Math.abs(radius[0] - radius[1]) > 0.01)
    addDiagnostic(
      ctx.diagnostics,
      "approximated",
      "svg:radialGradient",
      "svg radialGradient on a non-proportional bounding box → circular",
    );
  return { kind: "radial", stops, center, radius };
}
