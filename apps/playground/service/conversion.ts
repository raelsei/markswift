import { convert, convertResponsive, type ConvertOptions, type ResponsiveConvertOptions } from "./core.ts";
import { conversionOptions, responsiveOptions, type ConversionInput } from "./input.ts";
import { serializeResult, serializeResponsiveResult, type PublicResult, type PublicResponsiveResult, type ServiceResult } from "./output.ts";

export interface Converters {
  convert: (source: { html: string }, options: ConvertOptions) => Promise<PublicResult>;
  convertResponsive: (source: { html: string }, options: ResponsiveConvertOptions) => Promise<PublicResponsiveResult>;
}

/** Both modes use the package's public API; the HTTP service runs this inside its isolated worker. */
export async function convertInput(input: ConversionInput, converters: Converters = { convert, convertResponsive }): Promise<ServiceResult> {
  const source = { html: input.html };
  if (input.compactWidth !== undefined) {
    const options = responsiveOptions(input);
    return serializeResponsiveResult(await converters.convertResponsive(source, options), options);
  }
  return serializeResult(await converters.convert(source, conversionOptions(input)));
}
