/** Copy the static web app for Pages or any ordinary file host. */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const directory = fileURLToPath(new URL(".", import.meta.url));
const target = join(directory, "dist");
const api = process.env.PLAYGROUND_API_ORIGIN?.trim().replace(/\/$/, "") ?? "";
if (api) {
  const url = new URL(api);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PLAYGROUND_API_ORIGIN must be an HTTP(S) origin without a path");
  }
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(join(directory, "web"), target, { recursive: true });
const html = await readFile(join(target, "index.html"), "utf8");
if (!html.includes("__MARKSWIFT_API_ORIGIN__")) throw new Error("missing playground API origin marker");
await writeFile(join(target, "index.html"), html.replaceAll("__MARKSWIFT_API_ORIGIN__", api.replaceAll("&", "&amp;").replaceAll('"', "&quot;")));
console.log(`Static playground built in ${target}`);
