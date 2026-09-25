import type { LayoutNode } from "../model/layout.ts";
/** Resolve images from resources the browser actually loaded; no second network fetch. */
export declare function inlineCapturedImages(root: LayoutNode, baseURL: string, images: ReadonlyMap<string, string>): string[];
