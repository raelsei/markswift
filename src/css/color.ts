/** Pure color interpretation of browser-resolved CSS values. */
/** sRGB color, channels 0..1 (wide-gamut inputs are gamut-clipped). */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}


export const TRANSPARENT: Color = { r: 0, g: 0, b: 0, a: 0 };


/** CSS named colours. Computed styles never use them, but attribute-only SVG markup (data: images) does. */
export const NAMED_COLORS: Record<string, string> = Object.fromEntries(
  ("aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32")
    .split(" ").flatMap((v, i, a) => (i % 2 ? [] : [[v, a[i + 1]!]])),
);


/**
 * Any CSS color Chrome serialises: `transparent`, `#hex` (3/4/6/8), legacy and modern
 * `rgb()/rgba()`, `hsl()/hsla()`, `hwb()`, `lab()/lch()`, `oklab()/oklch()`, and
 * `color(<space> …)` for the CSS Color 4 predefined spaces. Non-sRGB inputs are converted
 * through XYZ D65, clipped to the sRGB gamut and rounded to 4 decimals. Unknown → undefined.
 */
export function parseColor(s: string | undefined): Color | undefined {
  if (!s) return undefined;
  s = s.trim();
  if (s === "transparent") return TRANSPARENT;
  const named = NAMED_COLORS[s.toLowerCase()];
  if (named) s = "#" + named;
  let m: RegExpExecArray | null;
  if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/.exec(s))) {
    return { r: +m[1]! / 255, g: +m[2]! / 255, b: +m[3]! / 255, a: m[4] === undefined ? 1 : parseAlpha(m[4]) };
  }
  if ((m = /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(s))) {
    return { r: +m[1]! / 255, g: +m[2]! / 255, b: +m[3]! / 255, a: m[4] === undefined ? 1 : parseAlpha(m[4]) };
  }
  if ((m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(s))) {
    return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a: m[4] === undefined ? 1 : parseAlpha(m[4]) };
  }
  if ((m = /^#([0-9a-f]{3,8})$/i.exec(s))) {
    const h = m[1]!;
    if (h.length === 5 || h.length === 7) return undefined;
    const n = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    const v = (i: number) => parseInt(n.slice(i, i + 2), 16) / 255;
    return { r: v(0), g: v(2), b: v(4), a: n.length === 8 ? v(6) : 1 };
  }
  if ((m = /^([a-z]+)\((.*)\)$/is.exec(s))) return parseColorFunction(m[1]!.toLowerCase(), m[2]!.trim());
  return undefined;
}


function parseAlpha(s: string): number {
  return s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
}


// ---------- color functions (CSS Color 4) ----------

type Vec3 = [number, number, number];

type Mat3 = [Vec3, Vec3, Vec3];


const SRGB_TO_XYZ: Mat3 = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];

const XYZ_TO_SRGB: Mat3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

const P3_TO_XYZ: Mat3 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];

const A98_TO_XYZ: Mat3 = [
  [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
  [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
  [0.02703136138641234, 0.07068885253582723, 0.9913375368376388],
];

const PROPHOTO_TO_XYZ_D50: Mat3 = [
  [0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
  [0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
  [0, 0, 0.8251046025104602],
];

const REC2020_TO_XYZ: Mat3 = [
  [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
  [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
  [0, 0.028072693049087428, 1.060985057710791],
];

const D50_TO_D65: Mat3 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];

const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const OKLAB_TO_LMS: Mat3 = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];

const LMS_TO_XYZ: Mat3 = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];

const D50_WHITE: Vec3 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];


function mul(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}


function srgbToLinear(c: number): number {
  const a = Math.abs(c);
  return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4;
}


function linearToSrgb(c: number): number {
  const a = Math.abs(c);
  return a > 0.0031308 ? Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055) : 12.92 * c;
}


/** `color(<space> …)` spaces: component transfer to linear light and the matrix to XYZ (D65 unless `d50`). */
const COLOR_SPACES: Record<string, { lin: (c: number) => number; m: Mat3; d50?: boolean }> = {
  srgb: { lin: srgbToLinear, m: SRGB_TO_XYZ },
  "srgb-linear": { lin: (c) => c, m: SRGB_TO_XYZ },
  "display-p3": { lin: srgbToLinear, m: P3_TO_XYZ },
  "a98-rgb": { lin: (c) => Math.sign(c) * Math.abs(c) ** (563 / 256), m: A98_TO_XYZ },
  "prophoto-rgb": { lin: (c) => (Math.abs(c) <= 16 / 512 ? c / 16 : Math.sign(c) * Math.abs(c) ** 1.8), m: PROPHOTO_TO_XYZ_D50, d50: true },
  rec2020: {
    lin: (c) => {
      const α = 1.09929682680944, β = 0.018053968510807, a = Math.abs(c);
      return a < β * 4.5 ? c / 4.5 : Math.sign(c) * ((a + α - 1) / α) ** (1 / 0.45);
    },
    m: REC2020_TO_XYZ,
  },
  xyz: { lin: (c) => c, m: IDENTITY },
  "xyz-d65": { lin: (c) => c, m: IDENTITY },
  "xyz-d50": { lin: (c) => c, m: IDENTITY, d50: true },
};


const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i;


/** One color-function component: `none` → 0; `%` → `pct` × value/100; bare number → value × `unit`. */
function component(t: string, pct: number, unit = 1): number | undefined {
  if (t === "none") return 0;
  const m = NUM.exec(t);
  if (!m) return undefined;
  const rest = t.slice(m[0].length);
  if (rest === "%") return (+m[0] / 100) * pct;
  return rest === "" ? +m[0] * unit : undefined;
}


/** Hue component in degrees (`deg`, `rad`, `grad`, `turn`, bare number, `none`). */
export function hue(t: string): number | undefined {
  if (t === "none") return 0;
  const m = NUM.exec(t);
  if (!m) return undefined;
  const v = +m[0];
  switch (t.slice(m[0].length).toLowerCase()) {
    case "":
    case "deg":
      return v;
    case "rad":
      return (v * 180) / Math.PI;
    case "grad":
      return v * 0.9;
    case "turn":
      return v * 360;
    default:
      return undefined;
  }
}


function parseColorFunction(name: string, body: string): Color | undefined {
  let tokens: string[];
  let alphaTok: string | undefined;
  if (body.includes(",")) {
    // Legacy comma syntax exists only for hsl()/hsla() here (rgb handled above).
    if (name !== "hsl" && name !== "hsla") return undefined;
    tokens = body.split(",").map((t) => t.trim());
    if (tokens.length === 4) alphaTok = tokens.pop();
  } else {
    const slash = body.indexOf("/");
    const main = slash < 0 ? body : body.slice(0, slash);
    if (slash >= 0) alphaTok = body.slice(slash + 1).trim();
    tokens = main.trim().split(/\s+/);
  }
  let alpha = 1;
  if (alphaTok !== undefined) {
    const a = component(alphaTok, 1);
    if (a === undefined || alphaTok === "") return undefined;
    alpha = Math.min(1, Math.max(0, a));
  }
  const space = name === "color" ? tokens.shift()?.toLowerCase() : undefined;
  if (tokens.length !== 3) return undefined;
  const [t0, t1, t2] = tokens as [string, string, string];
  switch (name) {
    case "hsl":
    case "hsla": {
      const h = hue(t0), sat = component(t1, 100), l = component(t2, 100);
      if (h === undefined || sat === undefined || l === undefined) return undefined;
      return fromRgb(hslToRgb(h, Math.max(0, sat) / 100, Math.min(1, Math.max(0, l / 100))), alpha);
    }
    case "hwb": {
      const h = hue(t0), w = component(t1, 100), b = component(t2, 100);
      if (h === undefined || w === undefined || b === undefined) return undefined;
      return fromRgb(hwbToRgb(h, Math.min(1, Math.max(0, w / 100)), Math.min(1, Math.max(0, b / 100))), alpha);
    }
    case "lab":
    case "lch": {
      const L = component(t0, 100);
      const c1 = name === "lab" ? component(t1, 125) : component(t1, 150);
      const c2 = name === "lab" ? component(t2, 125) : hue(t2);
      if (L === undefined || c1 === undefined || c2 === undefined) return undefined;
      const [a, b] = name === "lab" ? [c1, c2] : polar(Math.max(0, c1), c2);
      return fromXyz(mul(D50_TO_D65, labToXyzD50(Math.max(0, L), a, b)), alpha);
    }
    case "oklab":
    case "oklch": {
      const L = component(t0, 1);
      const c1 = component(t1, 0.4);
      const c2 = name === "oklab" ? component(t2, 0.4) : hue(t2);
      if (L === undefined || c1 === undefined || c2 === undefined) return undefined;
      const [a, b] = name === "oklab" ? [c1, c2] : polar(Math.max(0, c1), c2);
      return fromXyz(oklabToXyz(Math.max(0, L), a, b), alpha);
    }
    case "color": {
      const sp = space === undefined ? undefined : COLOR_SPACES[space];
      if (!sp) return undefined;
      const c0 = component(t0, 1), c1 = component(t1, 1), c2 = component(t2, 1);
      if (c0 === undefined || c1 === undefined || c2 === undefined) return undefined;
      const xyz = mul(sp.m, [sp.lin(c0), sp.lin(c1), sp.lin(c2)]);
      return fromXyz(sp.d50 ? mul(D50_TO_D65, xyz) : xyz, alpha);
    }
    default:
      return undefined;
  }
}


function polar(chroma: number, hueDeg: number): [number, number] {
  const h = (hueDeg * Math.PI) / 180;
  return [chroma * Math.cos(h), chroma * Math.sin(h)];
}


function hslToRgb(h: number, s: number, l: number): Vec3 {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}


function hwbToRgb(h: number, w: number, b: number): Vec3 {
  if (w + b >= 1) {
    const gray = w / (w + b);
    return [gray, gray, gray];
  }
  return hslToRgb(h, 1, 0.5).map((c) => c * (1 - w - b) + w) as Vec3;
}


function labToXyzD50(L: number, a: number, b: number): Vec3 {
  const κ = 24389 / 27, ε = 216 / 24389;
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const x = fx ** 3 > ε ? fx ** 3 : (116 * fx - 16) / κ;
  const y = L > κ * ε ? fy ** 3 : L / κ;
  const z = fz ** 3 > ε ? fz ** 3 : (116 * fz - 16) / κ;
  return [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]];
}


function oklabToXyz(L: number, a: number, b: number): Vec3 {
  const lms = mul(OKLAB_TO_LMS, [L, a, b]).map((c) => c ** 3) as Vec3;
  return mul(LMS_TO_XYZ, lms);
}


function fromXyz(xyz: Vec3, a: number): Color {
  return fromRgb(mul(XYZ_TO_SRGB, xyz).map(linearToSrgb) as Vec3, a);
}


/** Clip to the sRGB gamut and round to 4 decimals. */
function fromRgb([r, g, b]: Vec3, a: number): Color {
  const clip = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 1e4) / 1e4;
  return { r: clip(r), g: clip(g), b: clip(b), a };
}
