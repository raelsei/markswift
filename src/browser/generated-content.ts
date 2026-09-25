import type { Raw } from "./snapshot-types.ts";

/** A lone CSS `url(...)` is a drawable replaced image; mixed content needs a richer model. */
export function singleGeneratedImageUrl(content: string): string | undefined {
  const value = content.trim();
  const head = /^url\s*\(/i.exec(value);
  if (!head) return undefined;
  let index = head[0].length;
  while (/\s/.test(value[index] ?? "")) index++;
  const quote = value[index] === '"' || value[index] === "'" ? value[index++] : undefined;
  let source = "";
  let closed = false;
  while (index < value.length) {
    const char = value[index++]!;
    if (char === "\\") {
      // Computed CSS normally resolves escapes, but keep authored escaped URLs usable too.
      const hex = /^[0-9a-f]{1,6}/i.exec(value.slice(index));
      if (hex) {
        source += String.fromCodePoint(parseInt(hex[0], 16));
        index += hex[0].length;
        if (/\s/.test(value[index] ?? "")) index++;
      } else if (index < value.length) source += value[index++]!;
      else return undefined;
    } else if (char === quote) { closed = true; break; }
    else if (!quote && char === ")") { closed = true; break; }
    else if (!quote && (/\s/.test(char) || char === '"' || char === "'" || char === "(")) return undefined;
    else source += char;
  }
  if (!closed || !source) return undefined;
  if (quote) {
    while (/\s/.test(value[index] ?? "")) index++;
    if (value[index++] !== ")") return undefined;
  }
  return value.slice(index).trim() === "" ? source : undefined;
}

/** Report image content that cannot be represented as one drawable source. */
export function generatedContentWarnings(root: Raw): string[] {
  const warnings: string[] = [];
  const visit = (node: Raw): void => {
    if (node.pseudo && hasImageFunction(node.styles.content ?? "") && !singleGeneratedImageUrl(node.styles.content ?? "") &&
        (node.box?.w || node.bounds?.w || node.box?.h || node.bounds?.h)) {
      const host = node.parent;
      const source = host ? `<${host.name}>${host.attrs.id ? `#${host.attrs.id}` : ""}` : "element";
      warnings.push(`CSS ::${node.pseudo} generated image content on ${source} is not translated; only its measured box is kept`);
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return warnings;
}

/** A quoted `"url(icon.png)"` is painted text, not CSS `url(...)` image content. */
function hasImageFunction(content: string): boolean {
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < content.length; i++) {
    const char = content[i]!;
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (i > 0 && /[\w-]/.test(content[i - 1]!)) continue;
    if (/^(?:url|(?:-webkit-)?image-set)\s*\(/i.test(content.slice(i))) return true;
  }
  return false;
}
