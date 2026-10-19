import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { z } from "zod";
import { LAYOUT_DOC_VERSION, LayoutDoc, STYLE_WHITELIST } from "../../src/model/layout.ts";

/**
 * One fingerprint per LayoutDoc version. Entries of released versions are frozen. Only the entry of
 * UNRELEASED_LAYOUT_DOC_VERSION may be re-pinned: one bump per release cycle, later schema changes in the same cycle
 * update that entry instead of bumping again.
 */
const FINGERPRINTS: Record<number, string> = {
  2: "cad15d763304e55bd3849ea25b46a4af44d2ba4d189bf6bb6ff4fd4fa78f6934",
  3: "de56c7ffecbd76f793281327e13bf2e64aa3f6260723ec8bf87d4c0a0f3ab2e8",
  4: "bc365965ab8703da96f5935ec0072b609c3412875bbfcf2e63c45604853b1896",
  5: "2db7f96f39ff7f92d21fd9cdd2af5dbbbcf54c2aa892777915ab4718ebed6876",
};
/** The LayoutDoc version not yet shipped in a `v*` tag, or null. The release commit sets it back to null. */
const UNRELEASED_LAYOUT_DOC_VERSION: number | null = 5;

test("STYLE_WHITELIST and the LayoutDoc schema change only with a LayoutDoc.version bump", () => {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ schema: z.toJSONSchema(LayoutDoc.omit({ version: true })), styles: STYLE_WHITELIST }))
    .digest("hex");
  expect(
    { version: LAYOUT_DOC_VERSION, fingerprint },
    "Changed STYLE_WHITELIST or the LayoutDoc schema. If UNRELEASED_LAYOUT_DOC_VERSION === LAYOUT_DOC_VERSION, re-pin that FINGERPRINTS entry; otherwise bump LAYOUT_DOC_VERSION (src/model/layout.ts), add its FINGERPRINTS entry, set UNRELEASED_LAYOUT_DOC_VERSION to it, and note the breaking change in CHANGELOG.md.",
  ).toEqual({ version: LAYOUT_DOC_VERSION, fingerprint: FINGERPRINTS[LAYOUT_DOC_VERSION]! });
});

test("only the current LayoutDoc version may be unreleased", () => {
  expect([null, LAYOUT_DOC_VERSION]).toContain(UNRELEASED_LAYOUT_DOC_VERSION);
  expect(Math.max(...Object.keys(FINGERPRINTS).map(Number))).toBe(LAYOUT_DOC_VERSION);
});

test("fingerprints of released LayoutDoc versions never change", () => {
  const tag = Bun.spawnSync(["git", "describe", "--tags", "--abbrev=0", "--match", "v*"]).stdout.toString().trim();
  if (!tag) {
    // A local clone without tags has nothing to compare. CI must fetch them (`fetch-depth: 0` in ci.yml and
    // release.yml); a tagless CI checkout would skip the freeze silently.
    expect(
      process.env.CI,
      "no v* tag reachable from HEAD: fetch tags (actions/checkout fetch-depth: 0)",
    ).toBeUndefined();
    return;
  }
  const old = Bun.spawnSync(["git", "show", `${tag}:tests/architecture/layout-doc.test.ts`]).stdout.toString();
  const unreleased = /^const UNRELEASED_LAYOUT_DOC_VERSION[^=]*= (\d+)/m.exec(old)?.[1];
  for (const [, version, sha] of old.matchAll(/^\s+(\d+): "([0-9a-f]{64})",$/gm))
    if (version !== unreleased)
      expect(FINGERPRINTS[Number(version)], `FINGERPRINTS[${version}] shipped in ${tag}`).toBe(sha);
});
