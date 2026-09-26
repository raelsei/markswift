import type { ConversionResult, ResponsiveConversionResult, ResponsiveConvertOptions } from "./core.ts";

export type PublicResult = Pick<ConversionResult, "name" | "files" | "mapping" | "diagnostics" | "warnings" | "assets">;
export type PublicResponsiveResult = Pick<ResponsiveConversionResult, "name" | "files" | "views" | "warnings" | "branchWarnings" | "assets">;
export interface ResponsiveBranch extends Pick<PublicResult, "name" | "mapping" | "diagnostics" | "warnings"> {
  branch: "compact" | "regular";
  width: number;
  height: number;
}
export type SingleServiceResult = Omit<PublicResult, "assets"> & { assets: Record<string, string> };
export interface ResponsiveServiceResult {
  name: string;
  files: Record<string, string>;
  assets: Record<string, string>;
  warnings: string[];
  breakpoint: number;
  branches: ResponsiveBranch[];
}
export type ServiceResult = SingleServiceResult | ResponsiveServiceResult;

export function serializeResult(result: PublicResult): SingleServiceResult {
  return {
    name: result.name,
    files: result.files,
    mapping: result.mapping,
    diagnostics: result.diagnostics,
    warnings: result.warnings,
    assets: serializeAssets(result.assets),
  };
}

export function serializeResponsiveResult(result: PublicResponsiveResult, options: ResponsiveConvertOptions): ResponsiveServiceResult {
  const branches = (["compact", "regular"] as const).map(branch => {
    const name = `${result.name}${branch === "compact" ? "Compact" : "Regular"}`;
    const view = result.views.find(candidate => candidate.name === name);
    if (!view) throw new Error(`Responsive conversion returned no ${branch} view.`);
    return {
      branch, name, ...options[branch].viewport,
      mapping: view.mapping, diagnostics: view.diagnostics, warnings: result.branchWarnings[branch],
    };
  });
  return {
    name: result.name, files: result.files, assets: serializeAssets(result.assets),
    warnings: result.warnings, breakpoint: options.breakpoint, branches,
  };
}

function serializeAssets(assets: PublicResult["assets"]): Record<string, string> {
  return Object.fromEntries(Object.entries(assets).map(([path, bytes]) => [path, Buffer.from(bytes).toString("base64")]));
}
