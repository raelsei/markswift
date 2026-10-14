import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

/**
 * `swiftc -typecheck` like `typecheck.ts`, but WITHOUT `-default-isolation MainActor`: generated code must also compile
 * in app targets that keep Swift's default isolation. Lives outside pilot-run.ts `harnessFiles` on purpose, so adding it
 * does not change any capture's `harnessHash`. Soft deprecations stay `typecheck.ts`'s job.
 */
export async function typecheckLoose(swiftDir: string): Promise<{ ok: boolean; output: string }> {
  const files = (await readdir(swiftDir)).filter((f) => f.endsWith(".swift")).map((f) => join(swiftDir, f));
  const sdk = (await $`xcrun --sdk iphonesimulator --show-sdk-path`.text()).trim();
  const r =
    await $`xcrun swiftc -typecheck -parse-as-library -sdk ${sdk} -target arm64-apple-ios18.0-simulator -swift-version 6 -strict-concurrency=complete ${files}`
      .nothrow()
      .quiet();
  const output = r.stderr.toString() + r.stdout.toString();
  return { ok: r.exitCode === 0 && !/warning:/.test(output), output };
}
