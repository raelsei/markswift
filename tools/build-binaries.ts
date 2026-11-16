import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";
import pkg from "../package.json" with { type: "json" };

const ROOT = resolve(import.meta.dir, "..");
const DIST_BIN = join(ROOT, "dist/bin");
const STAGING = join(DIST_BIN, "staging");

interface TargetConfig {
  id: string;
  bunTarget: string;
}

const ALL_TARGETS: TargetConfig[] = [
  { id: "darwin-arm64", bunTarget: "bun-darwin-arm64" },
  { id: "darwin-x64", bunTarget: "bun-darwin-x64" },
  { id: "linux-x64", bunTarget: "bun-linux-x64" },
  { id: "linux-arm64", bunTarget: "bun-linux-arm64" },
];

async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

function formulaContent(version: string, checksums: Record<string, string>): string {
  return `class Markswift < Formula
  desc "Convert rendered HTML and CSS to native SwiftUI components"
  homepage "https://github.com/raelsei/markswift"
  version "${version}"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/raelsei/markswift/releases/download/v#{version}/markswift-darwin-arm64.tar.gz"
      sha256 "${checksums["darwin-arm64"] ?? "CHECKSUM_DARWIN_ARM64"}"
    else
      url "https://github.com/raelsei/markswift/releases/download/v#{version}/markswift-darwin-x64.tar.gz"
      sha256 "${checksums["darwin-x64"] ?? "CHECKSUM_DARWIN_X64"}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/raelsei/markswift/releases/download/v#{version}/markswift-linux-arm64.tar.gz"
      sha256 "${checksums["linux-arm64"] ?? "CHECKSUM_LINUX_ARM64"}"
    else
      url "https://github.com/raelsei/markswift/releases/download/v#{version}/markswift-linux-x64.tar.gz"
      sha256 "${checksums["linux-x64"] ?? "CHECKSUM_LINUX_X64"}"
    end
  end

  def install
    bin.install "markswift"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/markswift --version")
  end
end
`;
}

async function main(): Promise<void> {
  const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const targets = onlyArg ? ALL_TARGETS.filter((t) => t.id === onlyArg) : ALL_TARGETS;

  if (!targets.length) {
    console.error(`Unknown target: ${onlyArg}. Available: ${ALL_TARGETS.map((t) => t.id).join(", ")}`);
    process.exit(1);
  }

  await mkdir(DIST_BIN, { recursive: true });
  await rm(STAGING, { recursive: true, force: true });

  const checksums: Record<string, string> = {};

  for (const target of targets) {
    console.log(`Building markswift for ${target.id} (${target.bunTarget})...`);
    const stageDir = join(STAGING, target.id);
    await mkdir(stageDir, { recursive: true });
    const binaryPath = join(stageDir, "markswift");

    const build =
      await $`bun build --compile --target=${target.bunTarget} --external chromium-bidi --outfile ${binaryPath} ${join(ROOT, "src/cli.ts")}`
        .nothrow()
        .quiet();
    if (build.exitCode !== 0) {
      console.error(`Build failed for ${target.id}:`, build.stderr.toString());
      process.exit(1);
    }

    const tarball = join(DIST_BIN, `markswift-${target.id}.tar.gz`);
    const tar = await $`tar -czf ${tarball} -C ${stageDir} markswift`.nothrow().quiet();
    if (tar.exitCode !== 0) {
      console.error(`Tar failed for ${target.id}:`, tar.stderr.toString());
      process.exit(1);
    }

    const hash = await sha256File(tarball);
    checksums[target.id] = hash;
    console.log(`  -> ${tarball} (${hash})`);
  }

  await rm(STAGING, { recursive: true, force: true });

  const checksumLines = Object.entries(checksums).map(([id, hash]) => `${hash}  markswift-${id}.tar.gz\n`);
  await writeFile(join(DIST_BIN, "checksums.txt"), checksumLines.join(""));
  console.log(`Wrote ${join(DIST_BIN, "checksums.txt")}`);

  if (!onlyArg) {
    // Generated per release from these exact tarballs and published as a release asset (never committed: a
    // checksum from another build would not match the published binaries).
    const formulaPath = join(DIST_BIN, "markswift.rb");
    await writeFile(formulaPath, formulaContent(pkg.version, checksums));
    console.log(`Wrote ${formulaPath} with release checksums.`);
  }
}

await main();
