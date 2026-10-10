import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

/**
 * SwiftUI marks retired APIs with `deprecated: 100000.0` ("soft" deprecation): documented as
 * deprecated, never warned about by the compiler. The emitter must not use them, so they are
 * caught by text, not by swiftc.
 */
const SOFT_DEPRECATED: Array<[RegExp, string]> = [
  [/\.foregroundColor\(/, "foregroundColor → foregroundStyle"],
  [/\.cornerRadius\(/, "cornerRadius → clipShape(RoundedRectangle)"],
  [/\.accentColor\(/, "accentColor → tint"],
  [/\bNavigationView\b/, "NavigationView → NavigationStack"],
  [/\.navigationBarTitle\(/, "navigationBarTitle → navigationTitle"],
  [/\.autocapitalization\(/, "autocapitalization → textInputAutocapitalization"],
  [/\.disableAutocorrection\(/, "disableAutocorrection → autocorrectionDisabled"],
  [/\.mask\(\s*[A-Z]/, "mask(_:) → mask(alignment:_:)"],
  [/\.animation\([^)]*\)\s*$/m, "animation(_:) without value → animation(_:value:)"],
  [/showsIndicators:/, "ScrollView(_:showsIndicators:) → ScrollView(_:) + .scrollIndicators(_:)"],
];

async function softDeprecations(swiftDir: string): Promise<string[]> {
  const hits: string[] = [];
  for (const f of (await readdir(swiftDir)).filter((f) => f.endsWith(".swift"))) {
    const text = await Bun.file(join(swiftDir, f)).text();
    for (const [re, msg] of SOFT_DEPRECATED) {
      const m = re.exec(text);
      if (m) hits.push(`${f}: ${msg} (first at char ${m.index})`);
    }
  }
  return hits;
}

/**
 * `swiftc -typecheck` every generated file together against the iOS 18 simulator SDK in Swift 6
 * language mode with complete strict concurrency and MainActor default isolation.
 */
export async function typecheck(
  swiftDir: string,
): Promise<{ ok: boolean; output: string; ms: number; deprecations: number }> {
  const files = (await readdir(swiftDir)).filter((f) => f.endsWith(".swift")).map((f) => join(swiftDir, f));
  const t0 = performance.now();
  const sdk = (await $`xcrun --sdk iphonesimulator --show-sdk-path`.text()).trim();
  const r =
    await $`xcrun swiftc -typecheck -parse-as-library -sdk ${sdk} -target arm64-apple-ios18.0-simulator -swift-version 6 -strict-concurrency=complete -default-isolation MainActor ${files}`
      .nothrow()
      .quiet();
  const output = r.stderr.toString() + r.stdout.toString();
  // Deprecation warnings are failures: the emitter must never lean on APIs Apple is retiring.
  // Any warning fails: deprecations, isolation, unused — generated code ships warning-free.
  const deprecations = output.split("\n").filter((l) => /warning:/.test(l));
  const soft = await softDeprecations(swiftDir);
  const problems = [...deprecations, ...soft];
  return {
    ok: r.exitCode === 0 && problems.length === 0,
    output: problems.length ? problems.join("\n") + "\n" + output : output,
    ms: performance.now() - t0,
    deprecations: problems.length,
  };
}
