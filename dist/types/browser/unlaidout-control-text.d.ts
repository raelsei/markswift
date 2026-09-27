import type { TextSourceCapture } from "../model/text-source.ts";
/** A missing text layout is a capture limitation, not permission to invent a native glyph. */
export declare function unlaidOutControlTextWarnings(capture: TextSourceCapture | undefined): string[];
