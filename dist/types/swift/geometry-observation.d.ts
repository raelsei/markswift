import type { SemNode } from "../model/semantic.ts";
export type GeometryRole = "border" | "scroll-content" | "scroll-viewport";
export interface GeometryManifestNode {
    key: string;
    sourceId: string;
    kind: SemNode["kind"];
    parent?: string;
    relation: string;
    role: GeometryRole;
    /** Helper emitted in source; runtime realization is reported separately by actual frames. */
    instrumented: boolean;
}
export interface GeometryManifest {
    version: 1;
    namespace: string;
    nodes: GeometryManifestNode[];
}
export interface GeometryInstrumentation {
    manifest: GeometryManifest;
    keys: Map<SemNode, string>;
    entries: Map<string, GeometryManifestNode>;
    suppressed: Set<SemNode>;
}
/** Keys identify semantic occurrences; source ids remain separate and may collide. */
export declare function geometryInstrumentation(root: SemNode, namespace: string): GeometryInstrumentation;
export declare function geometryAlias(replacement: SemNode, original: SemNode, state?: GeometryInstrumentation, viewport?: boolean): void;
export declare function geometryModifier(node: SemNode, state?: GeometryInstrumentation, viewport?: boolean): string[];
