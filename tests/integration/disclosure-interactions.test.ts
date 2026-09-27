import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corpusFixtures } from "../../tools/verify/corpus-fixtures.ts";
import { prepareInteractions } from "../../tools/verify/interaction/prepare.ts";
import type { BrowserOracle } from "../../tools/verify/interaction/browser-types.ts";
import type { InteractionManifest } from "../../tools/verify/interaction/types.ts";
import { freezeBrowserExpectations } from "../../tools/verify/interaction/browser-oracle.ts";
import { TYPECHECK_TARGET, typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? browserTest : test.skip;

browserTest("original open/nested disclosure summary clicks produce direct live DOM/AX expectations without changing frozen inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-disclosure-oracle-"));
  try {
    const fixtures = corpusFixtures.filter(fixture => ["semantic-details-open-disclosure", "semantic-details-nested-disclosures"].includes(fixture.id));
    const inputs = fixtures.map(fixture => [fixture.html, fixture.css]);
    expect(fixtures.every(fixture => fixture.split === "development")).toBe(true);
    const output = await prepareInteractions(fixtures, { outputRoot: directory });
    const manifest: InteractionManifest = JSON.parse(await readFile(join(output, "prepared.json"), "utf8"));
    expect(manifest.status).toBe("prepared"); expect(manifest.passedStatefulFamilies).toBe(0);
    expect(manifest.plans.map(plan => plan.transitionCount)).toEqual([2, 4]);
    expect(manifest.plans[1]!.limitations.join("\n")).toContain("closed disclosure opening has no captured content layout");
    for (const [index, plan] of manifest.plans.entries()) {
      const oracle: BrowserOracle = JSON.parse(await readFile(join(output, manifest.browserOracles![index]!.path), "utf8"));
      const firstTap = plan.steps.findIndex(step => step.kind === "tap");
      const target = plan.steps[firstTap]!.target;
      expect(oracle.snapshots[firstTap]!.controls[target]!.expanded).toBe(true);
      expect(oracle.snapshots[firstTap + 1]!.controls[target]!.expanded).toBe(false);
      expect(oracle.snapshots[firstTap + 1]!.gesture).toBe("click");
      const content = plan.steps.find(step => step.kind === "expectPresent")!.target;
      expect(oracle.snapshots[firstTap + 1]!.controls[content]).toMatchObject({ visible: false, accessible: false });
      expect(oracle.snapshots.at(-1)!.controls[content]).toMatchObject({ visible: true, accessible: true });
      const poisoned = structuredClone(plan);
      poisoned.steps[firstTap + 1] = { kind: "expectExpanded", target, expanded: true };
      expect(() => freezeBrowserExpectations(poisoned, oracle)).toThrow("disagrees with direct browser state");
    }
    expect(fixtures.map(fixture => [fixture.html, fixture.css])).toEqual(inputs);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);

nativeTest("generated disclosure interaction app compiles with native Button identities and conditional accessible content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-disclosure-ui-"));
  try {
    const fixtures = corpusFixtures.filter(fixture => ["semantic-details-open-disclosure", "semantic-details-nested-disclosures"].includes(fixture.id));
    const output = await prepareInteractions(fixtures, { outputRoot: directory });
    const generated = join(output, "App", "Generated");
    const runtime = await readFile(join(generated, "MarkswiftRuntime.swift"), "utf8");
    expect(runtime).toContain(".accessibilityIdentifier(summaryIdentifier)");
    expect(runtime).toContain(".accessibilityIdentifier(contentIdentifier)");
    await writeFile(join(generated, "Host.swift"), await readFile(join(output, "App", "Host.swift")));
    for (const mainActor of [false, true]) {
      const checked = await typecheck(generated, { ...TYPECHECK_TARGET, defaultIsolationMainActor: mainActor });
      if (!checked.ok) throw new Error(checked.output); expect(checked.ok).toBe(true);
    }
    const sdk = (await Bun.$`xcrun --sdk iphonesimulator --show-sdk-path`.text()).trim();
    const frameworks = "/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/Library/Frameworks";
    const library = "/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/usr/lib";
    const swift = join(output, "UITests", "CorpusInteractionUITests.swift");
    const ui = await Bun.$`xcrun swiftc -typecheck -parse-as-library -swift-version 6 -strict-concurrency=complete -sdk ${sdk} -target arm64-apple-ios18.0-simulator -F ${frameworks} -I ${library} ${swift}`.nothrow().quiet();
    expect(ui.exitCode, ui.stderr.toString()).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
