import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corpusFixtures } from "../../tools/verify/corpus-fixtures.ts";
import { prepareInteractions } from "../../tools/verify/interaction/prepare.ts";
import { verifyInteractionSources } from "../../tools/verify/interaction/runner.ts";
import { digest } from "../../tools/verify/corpus-evidence.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import type { InteractionManifest } from "../../tools/verify/interaction/types.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" && process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const ids = ["text-controls-login-fields", "boolean-controls-checkbox-preferences", "boolean-controls-two-radio-groups", "selection-controls-multiple-optgroups"];

browserTest("frozen corpus controls prepare real UI-test app targets without counting execution", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "markswift-ui-prepare-"));
  try {
    const fixtures = ids.map(id => corpusFixtures.find(fixture => fixture.id === id)!);
    const directory = await prepareInteractions(fixtures, { outputRoot: temporary });
    const manifest = JSON.parse(await readFile(join(directory, "prepared.json"), "utf8")) as InteractionManifest;
    expect(manifest.status).toBe("prepared"); expect(manifest.passedStatefulFamilies).toBe(0);
    expect(manifest.results.every(item => item.status === "not-executed")).toBe(true);
    expect(manifest.plans.map(plan => plan.fixture)).toEqual(ids);
    expect(manifest.plans.every(plan => plan.transitionCount > 0)).toBe(true);
    expect(manifest.plans.every(plan => plan.split === "development")).toBe(true);
    expect(manifest.browserOracles?.map(oracle => oracle.fixture)).toEqual(ids);
    for (const [index, fixture] of fixtures.entries()) {
      expect(await readFile(join(directory, "Inputs", fixture.id, "source.html"), "utf8")).toBe(fixture.html);
      expect(manifest.fixtures[index]!.sourceHash).toBe(digest(fixture.html + "\n" + fixture.css));
      const generated = await readFile(join(directory, "App/Generated", manifest.plans[index]!.viewName + ".swift"), "utf8");
      for (const identifier of manifest.plans[index]!.coveredControls) expect(generated).toContain(`.accessibilityIdentifier(${JSON.stringify(identifier)})`);
    }
    const tests = await readFile(join(directory, "UITests/CorpusInteractionUITests.swift"), "utf8");
    expect(tests).toContain("target.typeText(text)"); expect(tests).toContain("target.swipeUp()");
    expect(tests).toContain("#exports/option/4");
    await verifyInteractionSources(directory, manifest);
    const oracle = manifest.browserOracles![0]!;
    const oraclePath = join(directory, oracle.path), originalOracle = await readFile(oraclePath);
    await writeFile(oraclePath, "{}");
    await expect(verifyInteractionSources(directory, manifest)).rejects.toThrow("source changed");
    await writeFile(oraclePath, originalOracle);
    await writeFile(join(directory, "App/Host.swift"), "// altered host");
    await expect(verifyInteractionSources(directory, manifest)).rejects.toThrow("source changed");
  } finally { await rm(temporary, { recursive: true, force: true }); }
}, 60_000);

nativeTest("app host and XCUITest gestures compile against the iOS SDK without running a simulator", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "markswift-ui-compile-"));
  try {
    const directory = await prepareInteractions(ids.map(id => corpusFixtures.find(fixture => fixture.id === id)!), { outputRoot: temporary });
    const generated = join(directory, "App/Generated");
    await writeFile(join(generated, "Host.swift"), await readFile(join(directory, "App/Host.swift")));
    const check = await typecheck(generated); expect(check.ok, check.output).toBe(true);
    const sdk = (await Bun.$`xcrun --sdk iphonesimulator --show-sdk-path`.text()).trim();
    const frameworks = "/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/Library/Frameworks";
    const library = "/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/usr/lib";
    const swift = join(directory, "UITests/CorpusInteractionUITests.swift");
    const ui = await Bun.$`xcrun swiftc -typecheck -parse-as-library -swift-version 6 -strict-concurrency=complete -sdk ${sdk} -target arm64-apple-ios18.0-simulator -F ${frameworks} -I ${library} ${swift}`.nothrow().quiet();
    expect(ui.exitCode, ui.stderr.toString()).toBe(0);
    const project = join(directory, "CorpusInteractions.xcodeproj");
    const listing = await Bun.$`xcodebuild -list -json -project ${project}`.nothrow().quiet();
    expect(listing.exitCode, listing.stderr.toString()).toBe(0);
    expect(JSON.parse(listing.stdout.toString()).project.targets).toEqual(["CorpusInteractionApp", "CorpusInteractionUITests"]);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}, 120_000);
