/** Opt-in emission claims. Expected source and native coverage are verified independently. */
import type { SemNode, TextNode, TextRun } from "../model/semantic.ts";
import type { TextRunSource, TextSourceCapture, SourceBoundary } from "../model/text-source.ts";
import type { EmitMode } from "./context.ts";
import type { InlineContentToken } from "../model/inline-content-flow.ts";

export interface TextEmission {
  key: string; node: string; run: number; kind: "text-run" | "greedy-word" | "flow-separator" | "inline-gap";
  value: string; literalUTF16Length: number; source?: TextRunSource;
  fontBinding: string; unavailable: string[];
  hardLines: Array<{ key: string; valueRange: [number, number]; precedingBoundary?: SourceBoundary }>;
}
export interface TextObservationManifest {
  version: 1; namespace: string; trust: "converter-emission-claim";
  capture?: TextSourceCapture; nodes: Array<{ key: string; semanticId: string; sourceAccounting?: TextRunSource }>;
  emissions: TextEmission[];
}
export interface TextInstrumentation { manifest: TextObservationManifest; keys: Map<SemNode, string> }

/** Guarded direct ASCII caption tokens; the caller proves original object/run ownership. */
export function registerInlineContentEmission(node: TextNode, token: InlineContentToken, state: TextInstrumentation): TextEmission {
  const nodeKey = state.keys.get(node);
  if (!nodeKey) throw new Error("Inline caption observation occurrence unavailable");
  const key = `${nodeKey}/runs/0/inline-${token.kind}/${token.rawRange[0]}`;
  if (state.manifest.emissions.some(entry => entry.key === key)) throw new Error("Duplicate inline caption emission occurrence");
  const entry: TextEmission = { key, node: nodeKey, run: 0, kind: token.kind === "word" ? "greedy-word" : "flow-separator",
    value: token.value, literalUTF16Length: token.value.length, ...(token.source ? { source: structuredClone(token.source) } : {}),
    fontBinding: "shared-supplied-ui-font; actual-font-name-recorded-natively",
    unavailable: [...(token.source ? [] : ["source lineage unavailable"]),
      ...(token.kind === "separator" ? ["Layout-gap advance is not TextRenderer glyph geometry; native draw coverage unavailable"] : []),
      "native final-draw and source cluster scope unavailable"],
    hardLines: [{ key: `${key}/hard-line/0`, valueRange: [0, token.value.length] }] };
  state.manifest.emissions.push(entry); return entry;
}

/** Native custom drawing can shift decoration ink. Keep the ordinary paint path. */
export function textDrawObservationUnavailable(node: TextNode): string | undefined {
  return node.runs.some(run => run.decoration?.lines.some(line => line === "underline" || line === "line-through"))
    ? "native draw observation unavailable: decorated text retains the ordinary SwiftUI renderer" : undefined;
}

export function textInstrumentation(root: SemNode, namespace: string, capture?: TextSourceCapture): TextInstrumentation {
  const state: TextInstrumentation = { manifest: { version: 1, namespace, trust: "converter-emission-claim", ...(capture ? { capture } : {}), nodes: [], emissions: [] }, keys: new Map() };
  const walk = (node: SemNode, path: string) => {
    if (state.keys.has(node)) throw new Error("Text observation requires distinct semantic occurrences");
    const key = `${namespace}/${path}`;
    state.keys.set(node, key);
    if (node.kind === "text") state.manifest.nodes.push({ key, semanticId: node.id, ...(node.sourceAccounting ? { sourceAccounting: node.sourceAccounting } : {}) });
    if (node.kind === "stack" || node.kind === "grid") node.children.forEach((child, i) => walk(child, `${path}/children/${i}`));
    if (node.kind === "control") {
      if (node.label) walk(node.label, `${path}/label`);
      node.content.forEach((child, i) => walk(child, `${path}/content/${i}`));
    }
    node.overlays.forEach((overlay, i) => walk(overlay.node, `${path}/overlays/${i}`));
  };
  walk(root, "root");
  return state;
}

/** Only a call site that knows the exact original may associate its actual content clone. */
export function textObservationAlias(replacement: SemNode, original: SemNode, state?: TextInstrumentation): void {
  if (!state) return;
  const key = state.keys.get(original);
  if (!key) throw new Error("Original text observation occurrence unavailable");
  const previous = state.keys.get(replacement);
  if (previous && previous !== key) throw new Error("Conflicting text observation clone ownership");
  if (replacement.kind !== original.kind || (replacement.kind === "text" && original.kind === "text" && replacement.runs !== original.runs))
    throw new Error("Text observation alias requires unchanged original run ownership");
  state.keys.set(replacement, key);
}

/** Mirrors authored fidelity breaks while retaining consumed source spaces as separate claims. */
export function emittedRunProjection(run: TextRun, mode: EmitMode): { value: string; source?: TextRunSource; unavailable: string[] } {
  let value = run.text;
  let source = run.source ? structuredClone(run.source) : undefined;
  const unavailable = [...(source?.unavailable ?? ["source lineage unavailable"])];
  if (mode === "fidelity" && run.breaks?.length) {
    const original = source;
    if (source) source = { ...source, units: [], excluded: [...source.excluded] };
    let at = 0, broken = "", ordinal = 0;
    const append = (start: number, end: number) => {
      const offset = broken.length - start;
      for (const unit of original?.units ?? []) if (unit.output[0] >= start && unit.output[1] <= end)
        source!.units.push({ ...unit, output: [unit.output[0] + offset, unit.output[1] + offset] });
      broken += value.slice(start, end);
    };
    for (const boundary of run.breaks) {
      const end = value[boundary - 1] === " " ? boundary - 1 : boundary;
      append(at, end);
      if (end < boundary) for (const unit of original?.units ?? []) if (unit.output[0] >= end && unit.output[1] <= boundary)
        source!.excluded.push({ sources: unit.sources, operation: "trim", reason: "source separator consumed by fidelity layout break" });
      if (source) source.units.push({ output: [broken.length, broken.length + 1], sources: [], operation: "synthetic",
        boundary: { kind: "fidelity-inserted", owner: null, ordinal: ordinal++ }, reason: "captured soft division inserted as layout-only newline" });
      broken += "\n"; at = boundary;
    }
    append(at, value.length);
    value = broken;
    unavailable.push("hard-line native index scope requires an actual probe");
  }
  if (run.bound) unavailable.push("dynamic source value unavailable");
  if (run.transform) unavailable.push("text-transform source-to-native mapping unavailable");
  if (value.includes("\n")) unavailable.push("hard-line native index scope requires an actual probe");
  if (run.gap !== undefined) unavailable.push("native inline-gap geometry unavailable");
  return { value, ...(source ? { source } : {}), unavailable: [...new Set(unavailable)] };
}

export function registerTextEmission(node: TextNode, run: TextRun, runIndex: number, mode: EmitMode, state: TextInstrumentation,
  kind: TextEmission["kind"] = "text-run", suffix = "", range?: [number, number], emittedValue?: string): TextEmission {
  const nodeKey = state.keys.get(node);
  if (!nodeKey) throw new Error("Observed text is absent from its semantic occurrence manifest");
  const projected = emittedRunProjection(run, mode), key = `${nodeKey}/runs/${runIndex}${suffix}`;
  let value = projected.value, source = projected.source;
  if (emittedValue !== undefined && emittedValue !== value) {
    value = emittedValue;
    projected.unavailable.push("literal transform source projection unavailable");
    if (source) source = { ...source, units: [], excluded: [...source.excluded, ...source.units.map(unit => ({ sources: unit.sources, operation: "unknown" as const, reason: "transformed literal source mapping unavailable" }))] };
  }
  if (range) {
    value = value.slice(range[0], range[1]);
    if (source) source = { ...source, excluded: [], units: source.units.filter(unit => unit.output[0] >= range[0] && unit.output[1] <= range[1])
      .map(unit => ({ ...unit, output: [unit.output[0] - range[0], unit.output[1] - range[0]] })) };
  }
  const unavailable = [...projected.unavailable];
  const drawUnavailable = textDrawObservationUnavailable(node);
  if (drawUnavailable) unavailable.push(drawUnavailable);
  if (kind === "flow-separator") unavailable.push("actual Flow-gap geometry unavailable");
  const hardLines: TextEmission["hardLines"] = [];
  let start = 0;
  for (let i = 0; i <= value.length; i++) if (i === value.length || value[i] === "\n") {
    const precedingBoundary = source?.units.find(unit => unit.output[0] === start - 1)?.boundary;
    hardLines.push({ key: `${key}/hard-line/${hardLines.length}`, valueRange: [start, i], ...(precedingBoundary ? { precedingBoundary } : {}) });
    start = i + 1;
  }
  const emission: TextEmission = { key, node: nodeKey, run: runIndex, kind, value, literalUTF16Length: value.length,
    ...(source ? { source } : {}), fontBinding: kind === "greedy-word" ? "shared-supplied-ui-font; actual-font-name-recorded-natively" : "emission-specified-swiftui-font; resolved-font-unavailable",
    unavailable: [...new Set(unavailable)], hardLines };
  if (state.manifest.emissions.some(existing => existing.key === key)) throw new Error(`Duplicate text emission occurrence ${key}`);
  state.manifest.emissions.push(emission);
  return emission;
}

export function registerGreedyText(node: TextNode, state: TextInstrumentation): string {
  const run = node.runs[0]!, value = run.text;
  const entry = state.manifest.nodes.find(entry => entry.key === state.keys.get(node));
  if (entry && run.source?.excluded.length) {
    entry.sourceAccounting ??= { version: 1, units: [], excluded: [], unavailable: [] };
    entry.sourceAccounting.excluded.push(...run.source.excluded);
  }
  let ordinal = 0;
  for (const match of value.matchAll(/[^ ]+| +/g)) {
    const start = match.index!, end = start + match[0].length;
    if (match[0].startsWith(" ")) registerTextEmission(node, run, 0, "app", state, "flow-separator", `/separator/${start}`, [start, end]);
    else registerTextEmission(node, run, 0, "app", state, "greedy-word", `/word/${ordinal++}`, [start, end]);
  }
  return `${state.keys.get(node)!}/runs/0`;
}
