/** Optional source claims. Independent live-DOM verification remains the coverage authority. */
import { z } from "zod";

const Offset = z.number().int().nonnegative();
export const SourceInterval = z.object({ occurrence: z.string(), start: Offset, end: Offset })
  .refine(value => value.end >= value.start, "inverted UTF16 source interval");
export type SourceInterval = z.infer<typeof SourceInterval>;
export const SourceBoundary = z.object({
  kind: z.enum(["br", "source-newline", "wbr", "fidelity-inserted"]),
  owner: z.string().nullable(), source: SourceInterval.optional(), ordinal: Offset,
});
export type SourceBoundary = z.infer<typeof SourceBoundary>;
export const TextSourceOccurrence = z.object({
  /** Capture element root is dom:/; every real childNode (including comments) consumes an index. */
  key: z.string(), kind: z.enum(["text", "br", "wbr"]), raw: z.string(),
  ancestors: z.array(z.object({ key: z.string(), tag: z.string(), display: z.string() })),
  origin: z.enum(["dom", "generated", "unavailable"]),
  /** A converter claim of exact live path/type/raw equality, independently recomputed by verifier. */
  join: z.enum(["verified", "unavailable"]), layoutPresent: z.boolean(),
});
export type TextSourceOccurrence = z.infer<typeof TextSourceOccurrence>;
export const TextSourceCapture = z.object({
  version: z.literal(1), trust: z.literal("converter-capture-claim"),
  root: z.object({ key: z.literal("dom:/"), type: z.literal(1), tag: z.string(),
    externalAncestors: z.array(z.object({ tag: z.string(), styles: z.record(z.string(), z.string()) })) }),
  /** Includes empty Text and unlaid-out occurrences. This is not an expected paint ledger. */
  occurrences: z.array(TextSourceOccurrence), unavailable: z.array(z.string()),
});
export type TextSourceCapture = z.infer<typeof TextSourceCapture>;
export const TextProjectionUnit = z.object({
  output: z.tuple([Offset, Offset]).refine(value => value[1] >= value[0], "inverted UTF16 output interval"),
  sources: z.array(SourceInterval), operation: z.enum(["copy", "collapse", "source-break", "synthetic", "unknown"]),
  group: z.string().optional(), boundary: SourceBoundary.optional(), reason: z.string().optional(),
});
export type TextProjectionUnit = z.infer<typeof TextProjectionUnit>;
export const TextRunSource = z.object({
  version: z.literal(1), units: z.array(TextProjectionUnit),
  excluded: z.array(z.object({ sources: z.array(SourceInterval),
    operation: z.enum(["trim", "collapse-join", "suppressed", "unknown"]), group: z.string().optional(), reason: z.string().optional() })),
  unavailable: z.array(z.string()),
});
export type TextRunSource = z.infer<typeof TextRunSource>;
