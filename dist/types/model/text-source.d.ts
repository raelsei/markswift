/** Optional source claims. Independent live-DOM verification remains the coverage authority. */
import { z } from "zod";
export declare const SourceInterval: z.ZodObject<{
    occurrence: z.ZodString;
    start: z.ZodNumber;
    end: z.ZodNumber;
}, z.core.$strip>;
export type SourceInterval = z.infer<typeof SourceInterval>;
export declare const SourceBoundary: z.ZodObject<{
    kind: z.ZodEnum<{
        br: "br";
        "source-newline": "source-newline";
        wbr: "wbr";
        "fidelity-inserted": "fidelity-inserted";
    }>;
    owner: z.ZodNullable<z.ZodString>;
    source: z.ZodOptional<z.ZodObject<{
        occurrence: z.ZodString;
        start: z.ZodNumber;
        end: z.ZodNumber;
    }, z.core.$strip>>;
    ordinal: z.ZodNumber;
}, z.core.$strip>;
export type SourceBoundary = z.infer<typeof SourceBoundary>;
export declare const TextSourceOccurrence: z.ZodObject<{
    key: z.ZodString;
    kind: z.ZodEnum<{
        br: "br";
        wbr: "wbr";
        text: "text";
    }>;
    raw: z.ZodString;
    ancestors: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        tag: z.ZodString;
        display: z.ZodString;
    }, z.core.$strip>>;
    origin: z.ZodEnum<{
        dom: "dom";
        generated: "generated";
        unavailable: "unavailable";
    }>;
    join: z.ZodEnum<{
        unavailable: "unavailable";
        verified: "verified";
    }>;
    layoutPresent: z.ZodBoolean;
}, z.core.$strip>;
export type TextSourceOccurrence = z.infer<typeof TextSourceOccurrence>;
export declare const TextSourceCapture: z.ZodObject<{
    version: z.ZodLiteral<1>;
    trust: z.ZodLiteral<"converter-capture-claim">;
    root: z.ZodObject<{
        key: z.ZodLiteral<"dom:/">;
        type: z.ZodLiteral<1>;
        tag: z.ZodString;
        externalAncestors: z.ZodArray<z.ZodObject<{
            tag: z.ZodString;
            styles: z.ZodRecord<z.ZodString, z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    occurrences: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        kind: z.ZodEnum<{
            br: "br";
            wbr: "wbr";
            text: "text";
        }>;
        raw: z.ZodString;
        ancestors: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            tag: z.ZodString;
            display: z.ZodString;
        }, z.core.$strip>>;
        origin: z.ZodEnum<{
            dom: "dom";
            generated: "generated";
            unavailable: "unavailable";
        }>;
        join: z.ZodEnum<{
            unavailable: "unavailable";
            verified: "verified";
        }>;
        layoutPresent: z.ZodBoolean;
    }, z.core.$strip>>;
    unavailable: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type TextSourceCapture = z.infer<typeof TextSourceCapture>;
export declare const TextProjectionUnit: z.ZodObject<{
    output: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
    sources: z.ZodArray<z.ZodObject<{
        occurrence: z.ZodString;
        start: z.ZodNumber;
        end: z.ZodNumber;
    }, z.core.$strip>>;
    operation: z.ZodEnum<{
        unknown: "unknown";
        copy: "copy";
        collapse: "collapse";
        "source-break": "source-break";
        synthetic: "synthetic";
    }>;
    group: z.ZodOptional<z.ZodString>;
    boundary: z.ZodOptional<z.ZodObject<{
        kind: z.ZodEnum<{
            br: "br";
            "source-newline": "source-newline";
            wbr: "wbr";
            "fidelity-inserted": "fidelity-inserted";
        }>;
        owner: z.ZodNullable<z.ZodString>;
        source: z.ZodOptional<z.ZodObject<{
            occurrence: z.ZodString;
            start: z.ZodNumber;
            end: z.ZodNumber;
        }, z.core.$strip>>;
        ordinal: z.ZodNumber;
    }, z.core.$strip>>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TextProjectionUnit = z.infer<typeof TextProjectionUnit>;
export declare const TextRunSource: z.ZodObject<{
    version: z.ZodLiteral<1>;
    units: z.ZodArray<z.ZodObject<{
        output: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        sources: z.ZodArray<z.ZodObject<{
            occurrence: z.ZodString;
            start: z.ZodNumber;
            end: z.ZodNumber;
        }, z.core.$strip>>;
        operation: z.ZodEnum<{
            unknown: "unknown";
            copy: "copy";
            collapse: "collapse";
            "source-break": "source-break";
            synthetic: "synthetic";
        }>;
        group: z.ZodOptional<z.ZodString>;
        boundary: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<{
                br: "br";
                "source-newline": "source-newline";
                wbr: "wbr";
                "fidelity-inserted": "fidelity-inserted";
            }>;
            owner: z.ZodNullable<z.ZodString>;
            source: z.ZodOptional<z.ZodObject<{
                occurrence: z.ZodString;
                start: z.ZodNumber;
                end: z.ZodNumber;
            }, z.core.$strip>>;
            ordinal: z.ZodNumber;
        }, z.core.$strip>>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    excluded: z.ZodArray<z.ZodObject<{
        sources: z.ZodArray<z.ZodObject<{
            occurrence: z.ZodString;
            start: z.ZodNumber;
            end: z.ZodNumber;
        }, z.core.$strip>>;
        operation: z.ZodEnum<{
            unknown: "unknown";
            trim: "trim";
            "collapse-join": "collapse-join";
            suppressed: "suppressed";
        }>;
        group: z.ZodOptional<z.ZodString>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    unavailable: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type TextRunSource = z.infer<typeof TextRunSource>;
