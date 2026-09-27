import { createHash } from "node:crypto";

const id = (name: string): string => createHash("sha256").update(name).digest("hex").slice(0, 24).toUpperCase();
const quote = (text: string): string => JSON.stringify(text);
export const interactionScheme = "CorpusInteractions";

/** A genuine app host is required: a SwiftPM unit-test target cannot drive XCUIApplication. */
export function interactionProject(sources: readonly string[], resources: readonly string[]): { pbxproj: string; scheme: string } {
  for (const path of [...sources, ...resources]) {
    if (!path || path.startsWith("/") || /[\\\x00-\x1f]/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error(`Unsafe interaction project path: ${path}`);
    }
  }
  if (new Set([...sources, ...resources].map(path => path.toLowerCase())).size !== sources.length + resources.length) {
    throw new Error("Duplicate interaction project path");
  }
  const objects: string[] = [];
  const object = (key: string, body: string) => { objects.push(`        ${id(key)} = { ${body} };`); return id(key); };
  const array = (keys: string[]) => `(${keys.join(", ")})`;
  const files = (paths: readonly string[], phase: "sources" | "resources") => paths.map(path => {
    const ref = object(`file:${path}`, `isa = PBXFileReference; lastKnownFileType = ${phase === "sources" ? "sourcecode.swift" : "folder"}; path = ${quote(path)}; sourceTree = "<group>";`);
    return { ref, build: object(`build:${path}`, `isa = PBXBuildFile; fileRef = ${ref};`) };
  });
  const appSources = files(sources, "sources"), appResources = files(resources, "resources");
  const testSources = files(["UITests/CorpusInteractionUITests.swift"], "sources");
  const appProduct = object("app-product", 'isa = PBXFileReference; explicitFileType = wrapper.application; path = CorpusInteractionApp.app; sourceTree = BUILT_PRODUCTS_DIR;');
  const testProduct = object("test-product", 'isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = CorpusInteractionUITests.xctest; sourceTree = BUILT_PRODUCTS_DIR;');
  const products = object("products", `isa = PBXGroup; children = ${array([appProduct, testProduct])}; name = Products; sourceTree = "<group>";`);
  const main = object("main", `isa = PBXGroup; children = ${array([...appSources, ...appResources, ...testSources].map(file => file.ref).concat(products))}; sourceTree = "<group>";`);
  const phase = (key: string, isa: string, builds: string[]) => object(key, `isa = ${isa}; buildActionMask = 2147483647; files = ${array(builds)}; runOnlyForDeploymentPostprocessing = 0;`);
  const appPhases = [phase("app-sources", "PBXSourcesBuildPhase", appSources.map(file => file.build)),
    phase("app-frameworks", "PBXFrameworksBuildPhase", []), phase("app-resources", "PBXResourcesBuildPhase", appResources.map(file => file.build))];
  const testPhases = [phase("test-sources", "PBXSourcesBuildPhase", testSources.map(file => file.build)),
    phase("test-frameworks", "PBXFrameworksBuildPhase", []), phase("test-resources", "PBXResourcesBuildPhase", [])];
  const configuration = (key: string, settings: string) => {
    const configs = ["Debug", "Release"].map(name => object(`${key}:${name}`, `isa = XCBuildConfiguration; buildSettings = { ${settings} ${name === "Debug" ? 'SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)"; SWIFT_OPTIMIZATION_LEVEL = "-Onone";' : 'SWIFT_OPTIMIZATION_LEVEL = "-O";'} }; name = ${name};`));
    return object(`${key}:list`, `isa = XCConfigurationList; buildConfigurations = ${array(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug;`);
  };
  const shared = `SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 18.0; SWIFT_VERSION = 6.0;
            SWIFT_STRICT_CONCURRENCY = complete; TARGETED_DEVICE_FAMILY = 1; CODE_SIGNING_ALLOWED = NO;
            SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; ENABLE_USER_SCRIPT_SANDBOXING = YES;`;
  const projectConfig = configuration("project-config", shared);
  const appConfig = configuration("app-config", `${shared} GENERATE_INFOPLIST_FILE = YES;
            PRODUCT_NAME = "$(TARGET_NAME)"; PRODUCT_BUNDLE_IDENTIFIER = org.markswift.CorpusInteractionApp;
            INFOPLIST_KEY_UILaunchScreen_Generation = YES; INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;`);
  const testConfig = configuration("test-config", `${shared} GENERATE_INFOPLIST_FILE = YES;
            PRODUCT_NAME = "$(TARGET_NAME)"; PRODUCT_BUNDLE_IDENTIFIER = org.markswift.CorpusInteractionUITests;
            TEST_TARGET_NAME = CorpusInteractionApp;`);
  const proxy = object("test-proxy", `isa = PBXContainerItemProxy; containerPortal = ${id("project")}; proxyType = 1; remoteGlobalIDString = ${id("app-target")}; remoteInfo = CorpusInteractionApp;`);
  const dependency = object("test-dependency", `isa = PBXTargetDependency; target = ${id("app-target")}; targetProxy = ${proxy};`);
  const app = object("app-target", `isa = PBXNativeTarget; buildConfigurationList = ${appConfig}; buildPhases = ${array(appPhases)}; buildRules = (); dependencies = (); name = CorpusInteractionApp; productName = CorpusInteractionApp; productReference = ${appProduct}; productType = "com.apple.product-type.application";`);
  const tests = object("test-target", `isa = PBXNativeTarget; buildConfigurationList = ${testConfig}; buildPhases = ${array(testPhases)}; buildRules = (); dependencies = (${dependency}); name = CorpusInteractionUITests; productName = CorpusInteractionUITests; productReference = ${testProduct}; productType = "com.apple.product-type.bundle.ui-testing";`);
  object("project", `isa = PBXProject; attributes = { LastUpgradeCheck = 2700; TargetAttributes = { ${app} = { CreatedOnToolsVersion = 27.0; }; ${tests} = { CreatedOnToolsVersion = 27.0; TestTargetID = ${app}; }; }; }; buildConfigurationList = ${projectConfig}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; knownRegions = (en, Base); mainGroup = ${main}; productRefGroup = ${products}; projectDirPath = ""; projectRoot = ""; targets = (${app}, ${tests});`);
  const reference = (target: string, name: string, product: string) => `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${id(target)}" BuildableName="${product}" BlueprintName="${name}" ReferencedContainer="container:CorpusInteractions.xcodeproj"/>`;
  const appRef = reference("app-target", "CorpusInteractionApp", "CorpusInteractionApp.app");
  const testRef = reference("test-target", "CorpusInteractionUITests", "CorpusInteractionUITests.xctest");
  return {
    pbxproj: `// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n${objects.join("\n")}\n    }; rootObject = ${id("project")}; }\n`,
    scheme: `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2700" version="1.3">
  <BuildAction parallelizeBuildables="NO" buildImplicitDependencies="YES"><BuildActionEntries>
    <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${appRef}</BuildActionEntry>
    <BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${testRef}</BuildActionEntry>
  </BuildActionEntries></BuildAction>
  <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO" parallelizable="NO">${testRef}</TestableReference></Testables></TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">${appRef}</BuildableProductRunnable></LaunchAction>
</Scheme>
`,
  };
}
