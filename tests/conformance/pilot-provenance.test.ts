import { expect, test } from "bun:test";
import { selectSimulator } from "../../tools/verify/native.ts";
import { assertCleanSource } from "./pilot-run.ts";

const inventory = {
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-27-0": [
      { udid: "new", name: "iPhone 17", state: "Shutdown", isAvailable: true },
      { udid: "ipad", name: "iPad Pro 13-inch (M5)", state: "Booted", isAvailable: true },
    ],
    "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
      { udid: "old", name: "iPhone 16", state: "Booted", isAvailable: true },
    ],
  },
};

test("recorded simulator selection respects override and chooses the booted device otherwise", () => {
  expect(selectSimulator(inventory).udid).toBe("old");
  expect(selectSimulator(inventory, "new").runtime).toBe("com.apple.CoreSimulator.SimRuntime.iOS-27-0");
  expect(() => selectSimulator(inventory, "missing")).toThrow();
});

test("an iPad is selected only by name or UDID", () => {
  expect(selectSimulator(inventory, "iPad Pro 13-inch (M5)").udid).toBe("ipad");
  expect(selectSimulator(inventory, "ipad").udid).toBe("ipad");
  expect(selectSimulator(inventory).udid).toBe("old");
});

test("dirty converter code cannot be labeled as a clean Git revision", () => {
  expect(() => assertCleanSource("")).not.toThrow();
  expect(() => assertCleanSource(" M src/compiler/index.ts")).toThrow("converter source is dirty");
});
