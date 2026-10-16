import { expect, test } from "bun:test";
import { command } from "../../../tools/verify/process.ts";

test("stderr chatter stays out of a successful command's output but explains a failure", async () => {
  // Xcode prints "Install Started / Install Failed: …" on stderr of every simctl call while a component install is pending.
  expect(await command(["sh", "-c", 'echo \'{"ok":1}\'; echo "Install Failed" >&2'])).toBe('{"ok":1}\n');
  await expect(command(["sh", "-c", 'echo partial; echo "boom" >&2; exit 3'])).rejects.toThrow(/partial\nboom/);
});
