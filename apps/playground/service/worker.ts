import { convertInput } from "./conversion.ts";
import { parseConversionInput } from "./input.ts";

try {
  const input = parseConversionInput(JSON.parse(await Bun.stdin.text()));
  process.stdout.write(JSON.stringify(await convertInput(input)));
} catch (error) {
  if (error instanceof Error && error.message.startsWith("name must be a Swift type identifier")) {
    process.stdout.write(JSON.stringify({ error: error.message }));
    process.exitCode = 2;
  } else {
    console.error(error);
    process.exitCode = 1;
  }
}
