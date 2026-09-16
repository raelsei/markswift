/**
 * Colour names a design put in a class list — the utility-framework counterpart of
 * `var(--token)` in an inline style. Pure and input-agnostic: a page with no colour
 * utilities yields nothing, so the inference pass can always ask.
 *
 * Lives in `ir/` rather than in the Tailwind preparation because the inference pass must not
 * depend on an adapter; the adapter re-exports it for its own reporting.
 */

/** Utility prefixes whose value is a colour. */
const COLOR_UTILS = [
  "bg",
  "text",
  "border",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "border-x",
  "border-y",
  "divide",
  "ring",
  "ring-offset",
  "outline",
  "shadow",
  "fill",
  "stroke",
  "accent",
  "caret",
  "decoration",
  "placeholder",
  "from",
  "via",
  "to",
];

/**
 * Values of a `COLOR_UTILS` prefix that are not colours. Sizes and keywords, plus the side
 * letters: `border-y`/`divide-x` are *width* utilities, so without these `colorHint` falls back
 * to the `border`/`divide` prefix and reports the side as if it were a colour name.
 */
const NOT_A_COLOR: Record<string, true> = {
  xs: true, sm: true, base: true, md: true, lg: true, xl: true, "2xl": true, "3xl": true, "4xl": true,
  "5xl": true, "6xl": true, "7xl": true, "8xl": true, "9xl": true, none: true, inherit: true, auto: true,
  solid: true, dashed: true, dotted: true, double: true, hidden: true, current: true, transparent: true,
  left: true, center: true, right: true, justify: true, start: true, end: true, wrap: true, nowrap: true,
  balance: true, pretty: true, ellipsis: true, clip: true, truncate: true, collapse: true, separate: true,
  inner: true, reverse: true,
  x: true, y: true, t: true, r: true, b: true, l: true,
  fixed: true, local: true, scroll: true, cover: true, contain: true, repeat: true, "no-repeat": true,
  visible: true, top: true, bottom: true, slice: true, clone: true, inset: true,
};

/** Families that begin with a `COLOR_UTILS` prefix but carry no colour. */
const NOT_A_COLOR_FAMILY = ["bg-clip-", "bg-blend-", "bg-origin-", "bg-gradient-", "bg-linear-", "bg-radial-", "bg-conic-", "bg-position-", "bg-size-", "text-shadow-", "border-spacing-", "outline-offset-"];

/**
 * Token-hint channel for the emit pass: the *semantic* part of a node's colour utilities, in
 * the same shape `Style.tokens` already carries CSS custom-property names (`bg-card` → `card`,
 * `text-muted-foreground` → `muted-foreground`, `bg-blue-500` → `blue-500`, which `tokens.ts`
 * camelizes into `Color.blue500`).
 *
 * `dark:` is kept because it paints the dark counterpart of the same slot; other variants
 * (`hover:`, `md:`, `focus:`) name states the static capture never sees. Arbitrary values
 * (`bg-[#0f172a]`) carry no name and are dropped.
 */
export function classColorHints(attrs: Record<string, string>): string[] {
  const out: string[] = [];
  for (const raw of (attrs["class"] ?? "").split(/\s+/)) {
    if (!raw) continue;
    const parts = raw.split(":");
    // Tailwind v3 writes the important marker as a leading `!`, v4 as a trailing one.
    const util = parts[parts.length - 1]!.replace(/^!/, "").replace(/!$/, "");
    if (parts.length > 1 && !parts.slice(0, -1).every((v) => v === "dark")) continue;
    if (util.includes("[")) continue;
    const hint = colorHint(util);
    if (hint && !out.includes(hint)) out.push(hint);
  }
  return out;
}

/** `bg-blue-500` → `blue-500`; `text-sm` → undefined. */
function colorHint(util: string): string | undefined {
  if (NOT_A_COLOR_FAMILY.some((p) => util.startsWith(p))) return undefined;
  // Longest prefix first so `border-t-red-500` is not read as `border` → `t-red-500`.
  const prefix = COLOR_UTILS.filter((p) => util.startsWith(p + "-")).sort((a, b) => b.length - a.length)[0];
  if (!prefix) return undefined;
  const value = util.slice(prefix.length + 1).split("/")[0]!;
  if (!value || NOT_A_COLOR[value] || /^\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(value)) return undefined;
  return value;
}
