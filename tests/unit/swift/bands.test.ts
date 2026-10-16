import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bandOf } from "../../../src/css/media.ts";
import bandsRuntime from "../../../src/swift/runtime/bands.swift" with { type: "text" };
import { command } from "../../../tools/verify/process.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";
import { typecheckLoose } from "../../../tools/verify/typecheck-loose.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest(
  "MarkswiftBands typechecks with and without MainActor default isolation",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-bands-typecheck-"));
    try {
      await Bun.write(
        join(directory, "BandsFixture.swift"),
        `import SwiftUI\n\n${bandsRuntime}\n
struct BandsFixture: View {
    var body: some View {
        MarkswiftBands(edges: [.atLeast(600), .above(1023)]) { band in Text("b\\(band)") }
    }
}
`,
      );
      for (const check of [await typecheck(directory), await typecheckLoose(directory)])
        if (!check.ok) throw new Error(check.output);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);

nativeTest(
  "MarkswiftBands evaluates only the band bandOf picks for the proposed width",
  async () => {
    const widths = [390, 599, 600, 600.5, 1023, 1023.5, 1210];
    const directory = await mkdtemp(join(tmpdir(), "markswift-bands-parity-"));
    try {
      await Bun.write(join(directory, "bands.swift"), `import SwiftUI\n\n${bandsRuntime}`);
      await Bun.write(
        join(directory, "main.swift"),
        `import SwiftUI

struct Probe: View {
    nonisolated(unsafe) static var log: [Int] = []
    let band: Int
    var body: some View {
        Probe.log.append(band)
        return Text("b\\(band)").frame(maxWidth: .infinity)
    }
}

for w: CGFloat in [${widths.join(", ")}] {
    Probe.log = []
    let renderer = ImageRenderer(content: MarkswiftBands(edges: [.atLeast(600), .above(1023)]) { band in Probe(band: band) }.frame(width: w))
    _ = renderer.cgImage
    print(Set(Probe.log).sorted().map(String.init).joined(separator: ","))
}
`,
      );
      const sdk = (await command(["xcrun", "--sdk", "macosx", "--show-sdk-path"], undefined, 15_000)).trim();
      await command(
        [
          "xcrun",
          "swiftc",
          "-sdk",
          sdk,
          "-target",
          "arm64-apple-macos15.0",
          "-swift-version",
          "6",
          "-strict-concurrency=complete",
          "-default-isolation",
          "MainActor",
          "-o",
          join(directory, "parity"),
          join(directory, "bands.swift"),
          join(directory, "main.swift"),
        ],
        directory,
        240_000,
      );
      const lines = (await command([join(directory, "parity")], directory, 30_000)).trim().split("\n");
      const edges = [
        { px: 600, inclusive: true },
        { px: 1023, inclusive: false },
      ];
      expect(lines).toEqual(widths.map((w) => String(bandOf(w, edges))));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  300000,
);
