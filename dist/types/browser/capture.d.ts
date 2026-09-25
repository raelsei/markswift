import { type LayoutDoc } from "../model/layout.ts";
import type { NodeIdentity, CaptureRequest } from "../input/types.ts";
export interface Capture {
    /** Resource failures and page errors observed while preparing this capture. */
    warnings: string[];
    layout: LayoutDoc;
    png: Buffer;
    /** outerHTML of the captured root with all template values resolved. */
    domHtml: string;
    /** Every <style> on the page (theme variables, keyframes). */
    themeCss: string;
    /**
     * Bytes of every `@font-face` source that was not already inline, named by content hash.
     * Written by `captureInput` to `<outDir>/_fonts/<name>`, which is what
     * `LayoutDoc.fonts[].src[].file` points at; identical faces across screens or inputs collapse
     * onto one file.
     */
    fontFiles: Array<{
        name: string;
        bytes: Uint8Array;
    }>;
}
export declare class BrowserCapture {
    private readonly opts;
    private browser;
    private context;
    constructor(opts: {
        dpr: number;
        viewport: {
            width: number;
            height: number;
        };
        channel?: string;
        restricted?: boolean;
    });
    start(): Promise<void>;
    stop(): Promise<void>;
    /**
     * Capture one screen. `identity` names layout nodes; `source` is the
     * LayoutDoc.source label. The page's `prefers-color-scheme` follows `spec.theme`.
     */
    capture(spec: CaptureRequest, identity: NodeIdentity, source: string): Promise<Capture>;
}
