import { convert } from "markswift";
import { conversionOptions, parseConversionInput } from "./input.ts";
import { serializeResult } from "./output.ts";

try {
  const input = parseConversionInput(JSON.parse(await Bun.stdin.text()));
  const result = await convert({ html: input.html }, conversionOptions(input));
  process.stdout.write(JSON.stringify(serializeResult(result)));
} catch (error) {
  if (error instanceof Error && error.message.startsWith("name must be a Swift type identifier")) {
    process.stdout.write(JSON.stringify({ error: error.message }));
    process.exitCode = 2;
  } else {
    console.error(error);
    process.exitCode = 1;
  }
}
