import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTROL_RUNTIME } from "../../../src/swift/control-runtime.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest("checkbox style builds in Swift 5 and Swift 6 without default actor isolation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-toggle-style-"));
  try {
    const source = join(directory, "ToggleFixture.swift");
    await Bun.write(source, `import SwiftUI
${CONTROL_RUNTIME}

struct ToggleFixture: View {
    @State private var checked = false

    var body: some View {
        Toggle(isOn: $checked) { Text("Check me") }
            .toggleStyle(MarkswiftMarkToggleStyle(mark: .check, tint: .blue))
    }
}
`);
    const sdkProcess = Bun.spawn(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"], { stdout: "pipe", stderr: "pipe" });
    const sdk = (await new Response(sdkProcess.stdout).text()).trim();
    expect(await sdkProcess.exited).toBe(0);

    for (const version of ["5", "6"]) {
      const compiler = Bun.spawn([
        "xcrun", "swiftc", "-emit-module", "-parse-as-library", "-sdk", sdk,
        "-target", "arm64-apple-ios18.0-simulator", "-swift-version", version,
        "-strict-concurrency=complete", "-module-name", "ToggleFixture",
        "-emit-module-path", join(directory, `ToggleFixture${version}.swiftmodule`), source,
      ], { stdout: "pipe", stderr: "pipe" });
      const output = (await new Response(compiler.stderr).text()) + (await new Response(compiler.stdout).text());
      expect(await compiler.exited, `Swift ${version}: ${output}`).toBe(0);
      expect(output).not.toContain("warning:");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
