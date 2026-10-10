import type { LayoutNode } from "../model/layout.ts";

/** Resolve images from resources the browser actually loaded; no second network fetch. */
export function inlineCapturedImages(root: LayoutNode, baseURL: string, images: ReadonlyMap<string, string>): string[] {
  const warnings = new Set<string>();
  const resolve = (source: string): string => {
    if (!source || source.startsWith("data:") || source.startsWith("#")) return source;
    let url: string;
    try { url = new URL(source, baseURL).href; } catch { url = source; }
    const bytes = images.get(url);
    if (bytes) return bytes;
    warnings.add(`Image could not be embedded: ${url}; supply a data URL or a reachable image resource.`);
    // Preserve failure rather than turn a relative URL into a seemingly valid asset-catalog name.
    return url;
  };
  const visit = (node: LayoutNode) => {
    if (node.tag === "img") {
      const source = node.currentSrc ?? node.attrs.src;
      if (source) node.currentSrc = resolve(source);
    }
    for (const property of ["background-image", "mask-image"]) {
      const value = node.styles[property];
      if (value) node.styles[property] = value.replace(/url\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^)]*))\s*\)/g,
        (match, double: string | undefined, single: string | undefined, bare: string | undefined) => {
          const source = (double ?? single ?? bare ?? "").trim();
          if (source.startsWith("data:") || source.startsWith("#")) return match;
          return `url(${JSON.stringify(resolve(source))})`;
        });
    }
    node.children.forEach(visit);
  };
  visit(root);
  return [...warnings];
}
