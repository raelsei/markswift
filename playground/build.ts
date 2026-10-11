/** Copy the browser-only workbench to a static host such as Cloudflare or GitHub Pages. */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validatedOrigin } from "./origin.ts";

const assets = ["styles.css", "app.js", "sample.js"];

export async function buildStatic(outputDirectory: string, apiBaseUrl: string): Promise<void> {
  const origin = validatedOrigin(apiBaseUrl);
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  for (const file of assets) await copyFile(join(import.meta.dir, "public", file), join(output, file));
  // GitHub Pages ignores `_headers`, so the CSP is a <meta> tag; the hosted API is the only other origin the page may call.
  const html = await readFile(join(import.meta.dir, "public/index.html"), "utf8");
  await writeFile(join(output, "index.html"), html.replace("connect-src 'self'", `connect-src 'self' ${origin}`));
  await writeFile(
    join(output, "config.js"),
    `window.MARKSWIFT_CONFIG={apiBaseUrl:${JSON.stringify(origin)},nativePreview:false};\n`,
  );
  await writeFile(join(output, ".nojekyll"), "");
  await writeFile(
    join(output, "_headers"),
    `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`,
  );
}

if (import.meta.main) {
  const api = process.env.MARKSWIFT_API_URL;
  if (!api) throw new Error("Set MARKSWIFT_API_URL to the deployed conversion service origin");
  const output = process.env.MARKSWIFT_OUTPUT_DIR ?? join(import.meta.dir, "dist");
  await buildStatic(output, api);
  console.log(`Static playground ready: ${output}`);
}
