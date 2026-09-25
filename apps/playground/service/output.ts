import type { ConversionResult } from "./core.ts";

export type PublicResult = Pick<ConversionResult, "name" | "files" | "mapping" | "diagnostics" | "warnings" | "assets">;
export type ServiceResult = Omit<PublicResult, "assets"> & { assets: Record<string, string> };

export function serializeResult(result: PublicResult): ServiceResult {
  return {
    name: result.name,
    files: result.files,
    mapping: result.mapping,
    diagnostics: result.diagnostics,
    warnings: result.warnings,
    assets: Object.fromEntries(Object.entries(result.assets).map(([path, bytes]) => [path, Buffer.from(bytes).toString("base64")])),
  };
}
