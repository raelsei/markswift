/** Standalone Bun service artifact; Chrome remains a host/runtime dependency. */
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function buildService(outputDirectory: string): Promise<void> {
  const output = resolve(outputDirectory);
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, "server/public.ts")],
    target: "bun",
    external: ["playwright-core"],
  });
  if (!built.success || built.outputs.length !== 1) {
    throw new Error(`Service bundle failed: ${built.logs.map((log) => String(log)).join("\n")}`);
  }
  const playwright = await Bun.file(join(import.meta.dir, "../node_modules/playwright-core/package.json")).json();
  // The default dist folder is generated. Clear local install/cache files before packaging it.
  if (output === resolve(join(import.meta.dir, "dist-service"))) await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await Bun.write(join(output, "server.js"), built.outputs[0]!);
  await copyFile(join(import.meta.dir, "../src/fonts/convert-font.py"), join(output, "convert-font.py"));
  await writeFile(
    join(output, "package.json"),
    JSON.stringify(
      {
        name: "markswift-conversion-service",
        private: true,
        type: "module",
        scripts: { start: "bun server.js" },
        dependencies: { "playwright-core": playwright.version },
        engines: { bun: ">=1.4.2" },
      },
      null,
      2,
    ) + "\n",
  );
}

if (import.meta.main) {
  const output = process.env.MARKSWIFT_SERVICE_OUTPUT_DIR ?? join(import.meta.dir, "dist-service");
  await buildService(output);
  console.log(`Conversion service ready: ${output}`);
}
