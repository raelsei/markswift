import type { InlineContentToken } from "../model/inline-content-flow.ts";
import type { TextNode } from "../model/semantic.ts";
import type { TextInstrumentation } from "./text-observation.ts";
import { registerInlineContentEmission } from "./text-observation.ts";

/** An alternate actual emission of the same exact node, never an ID/string alias. */
export function inlineCaptionKeys(node: TextNode, tokens: InlineContentToken[], state?: TextInstrumentation): string[] {
  if (!state) return [];
  const entry = state.manifest.nodes.find(entry => entry.key === state.keys.get(node));
  // This admission covers the complete sole raw occurrence. The old trimmed-run account
  // cannot be retained beside a re-emitted leading source separator (duplicate coverage).
  if (entry && tokens.every(token => token.source)) entry.sourceAccounting = { version: 1, units: [], excluded: [], unavailable: [] };
  return tokens.map(token => registerInlineContentEmission(node, token, state).key);
}
