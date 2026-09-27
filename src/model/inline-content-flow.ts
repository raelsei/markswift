import type { TextLineBox } from "./semantic.ts";
import type { TextRunSource } from "./text-source.ts";

/** One exact direct caption occurrence; no captured advance or soft line division. */
export interface InlineContentToken {
  kind: "word" | "separator";
  value: string;
  rawRange: [number, number];
  source?: TextRunSource;
}
export interface InlineContentFlow {
  widget: number;
  caption: number;
  raw: string;
  tokens: InlineContentToken[];
  lineBox: TextLineBox;
  strutAscent: number;
  strutDescent: number;
  sourceInsets: [number, number, number, number];
  widgetMargins: [number, number, number, number];
}
/** App-only natural height; source insets and blocked end margin have distinct ownership. */
export interface ContentAutoHeight {
  sourceInsets: [number, number, number, number];
  trailingMargin: number;
}
