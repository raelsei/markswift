/** Opt-in emission claims. Expected source and native coverage are verified independently. */
import type { SemNode, TextNode, TextRun } from "../model/semantic.ts";
import type { TextRunSource, TextSourceCapture, SourceBoundary } from "../model/text-source.ts";
import type { EmitMode } from "./context.ts";
export interface TextEmission {
    key: string;
    node: string;
    run: number;
    kind: "text-run" | "greedy-word" | "flow-separator" | "inline-gap";
    value: string;
    literalUTF16Length: number;
    source?: TextRunSource;
    fontBinding: string;
    unavailable: string[];
    hardLines: Array<{
        key: string;
        valueRange: [number, number];
        precedingBoundary?: SourceBoundary;
    }>;
}
export interface TextObservationManifest {
    version: 1;
    namespace: string;
    trust: "converter-emission-claim";
    capture?: TextSourceCapture;
    nodes: Array<{
        key: string;
        semanticId: string;
        sourceAccounting?: TextRunSource;
    }>;
    emissions: TextEmission[];
}
export interface TextInstrumentation {
    manifest: TextObservationManifest;
    keys: Map<SemNode, string>;
}
/** Native custom drawing can shift decoration ink. Keep the ordinary paint path. */
export declare function textDrawObservationUnavailable(node: TextNode): string | undefined;
export declare function textInstrumentation(root: SemNode, namespace: string, capture?: TextSourceCapture): TextInstrumentation;
/** Only a call site that knows the exact original may associate its actual content clone. */
export declare function textObservationAlias(replacement: SemNode, original: SemNode, state?: TextInstrumentation): void;
/** Mirrors authored fidelity breaks while retaining consumed source spaces as separate claims. */
export declare function emittedRunProjection(run: TextRun, mode: EmitMode): {
    value: string;
    source?: TextRunSource;
    unavailable: string[];
};
export declare function registerTextEmission(node: TextNode, run: TextRun, runIndex: number, mode: EmitMode, state: TextInstrumentation, kind?: TextEmission["kind"], suffix?: string, range?: [number, number], emittedValue?: string): TextEmission;
export declare function registerGreedyText(node: TextNode, state: TextInstrumentation): string;
