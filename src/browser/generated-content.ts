import type { Raw } from "./snapshot-types.ts";

/** CSS image-valued pseudo content has a measured box but no drawable image in the IR. */
export function generatedContentWarnings(root: Raw): string[] {
  const warnings: string[] = [];
  const visit = (node: Raw): void => {
    if (node.pseudo && hasImageFunction(node.styles.content ?? "") &&
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
