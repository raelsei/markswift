import { expect, test } from "bun:test";
import { join } from "node:path";
import { buildMatrix, loadFixtureSet, loadPilot, motionTag, openKey, reflowTag, validatePilot } from "./pilot.ts";
import { pilotName } from "./pilot-run.ts";

const fixtureRoot = join(import.meta.dir, "fixtures");

test("openKey appends @open:<layerId> to a matrix key", () => {
  expect(openKey("overlay-dialog-390-light-app", "edit-profile")).toBe(
    "overlay-dialog-390-light-app@open:edit-profile",
  );
});

test("pilot manifest resolves the original eight plus seven text fixtures with explicit outcomes", async () => {
  const cases = await loadPilot();
  expect(cases).toHaveLength(15);
  expect(new Set(cases.map((item) => item.id)).size).toBe(15);
  expect(cases.every((item) => item.themes.includes("light") && item.themes.includes("dark"))).toBe(true);
  expect(cases.every((item) => item.tier && item.feature)).toBe(true);
  const textCases = cases.filter((item) => item.expectedText !== undefined);
  expect(textCases).toHaveLength(7);
  expect(textCases.every((item) => item.expectedLines?.["320"] && item.expectedLines?.["390"])).toBe(true);
});

test("pilot manifest rejects an unknown fixture rather than skipping it", async () => {
  await expect(
    validatePilot(
      {
        version: 1,
        cases: [
          {
            id: "missing",
            feature: "layout",
            tier: "native",
            fixture: "css-layout/no-such-case.html",
            themes: ["light"],
            diagnosticFamily: null,
          },
        ],
      },
      fixtureRoot,
    ),
  ).rejects.toThrow("css-layout/no-such-case.html");
});

test("pilot anchors are nonempty #ids, and only the geometry cases carry them", async () => {
  const base = {
    id: "flex",
    feature: "layout",
    tier: "native",
    fixture: "css-layout/display--flex.html",
    themes: ["light"],
    diagnosticFamily: null,
  };
  for (const anchors of [["flex-row"], []]) {
    await expect(validatePilot({ version: 1, cases: [{ ...base, anchors }] }, fixtureRoot)).rejects.toThrow(
      "pilot flex: invalid anchors",
    );
  }
  const anchored = (await loadPilot()).filter((item) => item.anchors);
  expect(anchored.map((item) => item.id)).toEqual([
    "display-flex",
    "display-grid",
    "flex-wrap",
    "box-shadow",
    "background-image",
    "image",
  ]);
});

test("pilot CLI validates cases without running capture", async () => {
  const run = Bun.spawn([process.execPath, join(import.meta.dir, "pilot.ts"), "--validate"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(run.stdout).text();
  expect(await run.exited).toBe(0);
  expect(output.trim().split("\n")).toHaveLength(15);
});

test("pilot expands each feature into two widths, themes and output modes without duplicate IDs", async () => {
  const matrix = buildMatrix(await loadPilot());
  expect(matrix).toHaveLength(120);
  expect(new Set(matrix.map((item) => item.key)).size).toBe(120);
  expect(
    matrix
      .filter((item) => item.case.id === "display-flex")
      .map((item) => item.width)
      .sort(),
  ).toEqual([320, 320, 320, 320, 390, 390, 390, 390]);
});

test("Swift view names of matrix keys are unchanged; an @open key adds its layer words", async () => {
  const old = (key: string) =>
    "Pilot" +
    key
      .split("-")
      .filter(Boolean)
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join("");
  const matrix = buildMatrix(await loadPilot());
  expect(matrix).toHaveLength(120);
  // Frame entries compile nothing: they render their rest capture's conversion.
  for (const { key, frame } of buildMatrix(await loadFixtureSet(await loadPilot()), true))
    if (!frame) expect(pilotName(key)).toBe(old(key));
  expect(pilotName(openKey("details-390-light-app", "returns"))).toBe("PilotDetails390LightAppOpenReturns");
});

test("--reflow adds 768 captures only for reflow-tagged cases", async () => {
  const cases = await loadFixtureSet(await loadPilot());
  const keys = (reflow: boolean) => buildMatrix(cases, reflow).map((item) => item.key);
  expect(keys(true)).toContain("grid-templates-768-light-app");
  expect(keys(true)).toContain("display-flex-768-dark-fidelity");
  expect(keys(false).filter((key) => key.includes("-768-"))).toEqual([]);
});

test("markswift-viewport-height sets a case's capture height; other cases and the matrix size are unchanged", async () => {
  const cases = await loadFixtureSet(await loadPilot());
  const byId = (id: string) => cases.find((item) => item.id === id)!;
  expect(byId("overlay-dialog").viewportHeight).toBe(844);
  expect(byId("shadcn-card").viewportHeight).toBeUndefined();
  expect(
    cases
      .filter((item) => item.viewportHeight !== undefined)
      .map((item) => item.id)
      .sort(),
  ).toEqual([
    "overlay-alert-dialog",
    "overlay-context-menu",
    "overlay-dialog",
    "overlay-dropdown-menu",
    "overlay-hover-card",
    "overlay-menubar",
    "overlay-native",
    "overlay-popover",
    "overlay-select",
    "overlay-sheet",
  ]);
  const plain = cases.map(({ viewportHeight: _, ...item }) => item);
  expect(buildMatrix(cases).length).toBe(buildMatrix(plain).length);
});

test("an invalid markswift-reflow tag throws", () => {
  expect(() => reflowTag('<meta name="markswift-reflow" content="maybe">', "x")).toThrow("invalid markswift-reflow");
});

test("markswift-motion metas give ascending ms lists; invalid ones throw", () => {
  expect(
    motionTag(
      '<meta name="markswift-motion" content="250,500"><meta name="markswift-motion-reduced" content="250">',
      "x",
    ),
  ).toEqual({ motion: [250, 500], motionReduced: [250] });
  expect(motionTag("<p>", "x")).toEqual({});
  expect(() => motionTag('<meta name="markswift-motion" content="500,250">', "x")).toThrow("invalid markswift-motion");
  expect(() => motionTag('<meta name="markswift-motion-reduced" content="1.5">', "x")).toThrow(
    "invalid markswift-motion-reduced",
  );
});

test("motion-tagged cases add 390 app frame captures per theme", () => {
  const item = { id: "spin", fixture: "css-misc/spin.html", themes: ["light", "dark"] as const };
  const matrix = buildMatrix([{ ...item, themes: [...item.themes], motion: [50, 250], motionReduced: [250] }]);
  const frames = matrix.filter((entry) => entry.frame);
  expect(frames.map((entry) => entry.key)).toEqual([
    "spin-390-light-app@t:50",
    "spin-390-light-app@t:250",
    "spin-390-light-app@reduced@t:250",
    "spin-390-dark-app@t:50",
    "spin-390-dark-app@t:250",
    "spin-390-dark-app@reduced@t:250",
  ]);
  expect(frames.every((entry) => entry.width === 390 && entry.mode === "app")).toBe(true);
  expect(frames[2]!.frame).toEqual({ t: 250, reduced: true });
  expect(matrix.filter((entry) => !entry.frame)).toHaveLength(8);
});

test("pilot rejects expectedText on a reflow-tagged fixture", async () => {
  const entry = {
    id: "flex",
    feature: "layout",
    tier: "native",
    fixture: "css-layout/display--flex.html",
    themes: ["light"],
    diagnosticFamily: null,
    expectedText: "x",
    expectedLines: { "320": 1, "390": 1 },
  };
  await expect(validatePilot({ version: 1, cases: [entry] }, fixtureRoot)).rejects.toThrow(
    "pilot flex: reflow-tagged cases cannot have expectedText",
  );
});
