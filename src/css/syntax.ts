/** Pure syntax interpretation of browser-resolved CSS values. */


export function px(s: string | undefined): number {
  if (!s) return 0;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : 0;
}


/** Declared inline style → property map (lower-cased names, trimmed values). */
export function parseDeclared(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const decl of splitTop(style, ";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const k = decl.slice(0, i).trim().toLowerCase();
    if (k) out[k] = decl.slice(i + 1).trim();
  }
  return out;
}


/** Split on `sep` at paren depth 0 (for comma-separated lists containing function calls). */
export function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}


/**
 * `<length-percentage>` → px against `ref`: `12px`, `50%`, `0`, or a linear
 * `calc(100% - 10px)` mixing px and % terms. Unknown units → undefined.
 */
export function resolveLength(t: string, ref: number): number | undefined {
  t = t.trim();
  const calc = /^calc\((.*)\)$/s.exec(t);
  const terms = calc ? calc[1]!.replace(/\s*([-+])\s+/g, " $1").trim().split(/\s+/) : [t];
  let sum = 0;
  for (const term of terms) {
    const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px|%)?$/i.exec(term.replace(/^\+/, ""));
    if (!m) return undefined;
    if (m[2] === "%") sum += (+m[1]! / 100) * ref;
    else if (m[2] === "px" || +m[1]! === 0) sum += +m[1]!;
    else return undefined;
  }
  return sum;
}


export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
