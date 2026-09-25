/** Current public marker plus the version-1 spelling retained for existing HTML inputs. */
export declare const DEFAULT_ROOT = "[data-markswift-root], [data-h2s-root], body:not(:has([data-markswift-root], [data-h2s-root]))";
/** A static document can choose its root before opening the browser. */
export declare function rootForHtml(html: string): string;
