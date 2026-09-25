import { expect, test } from "bun:test";
import { mediaWarning } from "../../../src/browser/media.ts";

test("media warning stays absent for plain CSS and bounds compiled query lists", () => {
  expect(mediaWarning([])).toBeUndefined();
  const conditions = Array.from({ length: 7 }, (_, i) => `(min-width: ${i + 1}00px)`);
  const warning = mediaWarning(conditions)!;
  expect(warning).toContain("(min-width: 100px)");
  expect(warning).toContain("(min-width: 500px)");
  expect(warning).not.toContain("(min-width: 600px)");
  expect(warning).toContain("+2 more");
  expect(warning).toContain("freezes this media-query state");
});
