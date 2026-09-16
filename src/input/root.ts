/** Current public marker plus the version-1 spelling retained for existing HTML inputs. */
export const DEFAULT_ROOT = "[data-markswift-root], [data-h2s-root], body:not(:has([data-markswift-root], [data-h2s-root]))";

/** A static document can choose its root before opening the browser. */
export function rootForHtml(html: string): string {
  if (/\sdata-markswift-root(?=[\s=>/])/.test(html)) return "[data-markswift-root]";
  if (/\sdata-h2s-root(?=[\s=>/])/.test(html)) return "[data-h2s-root]";
  return "body";
}
