/** CSS Images 3 ending-shape geometry, independently of native paint/layout. */
export type RadialExtent = "closest-side" | "farthest-side" | "closest-corner" | "farthest-corner";
export type GradientLength = { value: number; unit: "px" | "%" };
export type RadialSize = RadialExtent | [GradientLength, GradientLength];
export interface RadialGeometrySpec {
  ellipse: boolean;
  center: [number, number];
  /** Retained when a center coordinate is absolute; fractions remain in `center`. */
  position?: [GradientLength, GradientLength];
  /** Absent is the CSS default farthest-corner. */
  size?: RadialSize;
}

const extents = new Set<RadialExtent>(["closest-side", "farthest-side", "closest-corner", "farthest-corner"]);
function length(token: string): GradientLength | undefined {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|%)$/.exec(token);
  if (match) return { value: Number(match[1]), unit: match[2] as "px" | "%" };
  return token === "0" ? { value: 0, unit: "px" } : undefined;
}
function coordinate(token: string): GradientLength | undefined {
  const keyword = ({ left: 0, top: 0, center: 50, right: 100, bottom: 100 } as Record<string, number>)[token];
  return keyword === undefined ? length(token) : { value: keyword, unit: "%" };
}
function position(tokens: string[]): [GradientLength, GradientLength] | undefined {
  const middle: GradientLength = { value: 50, unit: "%" };
  if (tokens.length === 1) {
    const value = coordinate(tokens[0]!);
    if (!value) return undefined;
    return /^(top|bottom)$/.test(tokens[0]!) ? [middle, value] : [value, middle];
  }
  if (tokens.length !== 2) return undefined;
  let [x, y] = tokens as [string, string];
  if (/^(top|bottom)$/.test(x) || /^(left|right)$/.test(y)) [x, y] = [y, x];
  if (/^(top|bottom)$/.test(x) || /^(left|right)$/.test(y)) return undefined;
  const cx = coordinate(x), cy = coordinate(y);
  return cx && cy ? [cx, cy] : undefined;
}

/** Reject unresolved syntax instead of silently replacing authored geometry. */
export function parseRadialPrelude(prelude: string): RadialGeometrySpec | undefined {
  const parts = prelude.trim().split(/\s+at\s+|^at\s+/);
  if (parts.length > 2) return undefined;
  const tokens = (parts[0] ?? "").split(/\s+/).filter(Boolean);
  const shapes = tokens.filter(token => token === "circle" || token === "ellipse");
  if (shapes.length > 1) return undefined;
  const dimensions = tokens.filter(token => token !== "circle" && token !== "ellipse");
  let size: RadialSize | undefined;
  let ellipse = shapes[0] !== "circle";
  if (dimensions.length === 1 && extents.has(dimensions[0] as RadialExtent)) {
    if (dimensions[0] !== "farthest-corner") size = dimensions[0] as RadialExtent;
  } else if (dimensions.length) {
    const values = dimensions.map(length);
    if (values.some(value => !value || value.value < 0)) return undefined;
    if (values.length === 1 && shapes[0] !== "ellipse" && values[0]!.unit === "px") {
      ellipse = false;
      size = [values[0]!, values[0]!];
    } else if (values.length === 2 && shapes[0] !== "circle") {
      size = values as [GradientLength, GradientLength];
    } else return undefined;
  }
  const point = parts.length === 2 ? position(parts[1]!.trim().split(/\s+/)) : undefined;
  if (parts.length === 2 && !point) return undefined;
  const center: [number, number] = point
    ? point.map(value => value.unit === "%" ? value.value / 100 : 0.5) as [number, number]
    : [0.5, 0.5];
  return { ellipse, center, ...(size ? { size } : {}), ...(point?.some(value => value.unit === "px") ? { position: point } : {}) };
}

export function gradientLength(value: GradientLength, dimension: number): number {
  return value.unit === "px" ? value.value : value.value * dimension / 100;
}

export function radialGeometry(paint: RadialGeometrySpec, width: number, height: number): { center: [number, number]; radii: [number, number] } {
  const center: [number, number] = paint.position
    ? [gradientLength(paint.position[0], width), gradientLength(paint.position[1], height)]
    : [paint.center[0] * width, paint.center[1] * height];
  if (Array.isArray(paint.size)) return { center, radii: [gradientLength(paint.size[0], width), gradientLength(paint.size[1], height)] };
  const extent = paint.size ?? "farthest-corner";
  const distances = [[Math.abs(center[0]), Math.abs(width - center[0])], [Math.abs(center[1]), Math.abs(height - center[1])]];
  const choose = extent.startsWith("closest") ? Math.min : Math.max;
  const x = choose(...distances[0]!), y = choose(...distances[1]!);
  const corner = extent.endsWith("corner");
  if (paint.ellipse) return { center, radii: [x * (corner ? Math.SQRT2 : 1), y * (corner ? Math.SQRT2 : 1)] };
  const radius = corner ? Math.hypot(x, y) : choose(x, y);
  return { center, radii: [radius, radius] };
}
