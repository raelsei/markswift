import type { LayoutNode } from "../model/layout.ts";
import type { ControlNode } from "../model/semantic.ts";

/** Chrome's supported native control schemes, independently of prefers-color-scheme page CSS. */
export function markColorScheme(node: LayoutNode, notes: string[]): ControlNode["markColorScheme"] {
  const value = node.styles["color-scheme"];
  if (value === undefined) return undefined;
  const tokens = value.trim().toLowerCase().split(/\s+/);
  if (tokens.length === 1 && tokens[0] === "normal") return "light";
  if (tokens.some(token => !["only", "light", "dark"].includes(token))) {
    notes.push(`approximated: checkbox/radio custom color-scheme ${JSON.stringify(value)} → supported Chrome light/dark schemes only`);
  }
  const light = tokens.includes("light"), dark = tokens.includes("dark");
  if (light && dark) return "light dark";
  if (light) return "light";
  if (dark) return "dark";
  notes.push(`approximated: checkbox/radio color-scheme ${JSON.stringify(value)} has no supported native scheme → Chrome default light palette`);
  return "light";
}
