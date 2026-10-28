// Throwaway CI diagnostic for #25: table captures on iOS against the tracked baseline.
import { readdirSync } from "node:fs";

const baseline = (await Bun.file("tests/conformance/baselines/visual-all-ios.json").json()) as Record<
  string,
  { ssim: number; artifactHashes: Record<string, string> }
>;
const hash = async (path: string) =>
  new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
for (const dir of process.argv.slice(2)) {
  for (const key of readdirSync(dir).filter((k) => !k.startsWith("_") && !k.endsWith(".json")).sort()) {
    const score = (await Bun.file(`${dir}/${key}/compare.json`).json()) as { ssim: number };
    const base = baseline[key];
    const same = base && (await hash(`${dir}/${key}/native.png`)) === base.artifactHashes["native.png"];
    console.log(
      `${key.padEnd(40)} ssim ${score.ssim.toFixed(4)} base ${base?.ssim.toFixed(4) ?? "-"} Δ ${base ? (score.ssim - base.ssim).toFixed(4) : "-"} native ${same ? "same" : "DIFFERS"}`,
    );
  }
}
