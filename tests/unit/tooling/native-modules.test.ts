import { expect, test } from "bun:test";
import { planNativeModules } from "../../../tools/verify/native-modules.ts";

test("explicitly shared view bundles use one namespace while independent bundles remain isolated", () => {
  const bundle = { files: { "First.swift": "struct First {}", "Second.swift": "struct Second {}" } };
  const plan = planNativeModules([{ moduleID: "batch", bundle }, { moduleID: "batch", bundle }, { bundle }]);
  expect(plan.modules).toHaveLength(2);
  expect(plan.snapshotModules).toEqual(["Generated0", "Generated0", "Generated1"]);
});

test("a shared namespace cannot silently replace source or resource bytes", () => {
  const first = { moduleID: "batch", bundle: { files: { "View.swift": "A" }, assets: { "Fonts/A.ttf": new Uint8Array([1]) } } };
  expect(() => planNativeModules([first, { ...first, bundle: { ...first.bundle, files: { "View.swift": "B" } } }])).toThrow("Conflicting");
  expect(() => planNativeModules([first, { ...first, bundle: { ...first.bundle, assets: { "Fonts/A.ttf": new Uint8Array([2]) } } }])).toThrow("Conflicting");
  expect(planNativeModules([first, structuredClone(first)]).modules).toHaveLength(1);
});

test("font and other binary resources are declared completely without unsafe writes", () => {
  const bundle = { files: { "View.swift": "" }, assets: { "Fonts/A.ttf": new Uint8Array([1]), "Images/card.png": new Uint8Array([2]), "data.json": new Uint8Array([3]) } };
  expect(planNativeModules([{ bundle }]).modules[0]!.resources).toEqual(["Fonts", "Images", "data.json"]);
  for (const path of ["../secret", "/absolute", "Fonts/../secret", "Fonts\\secret", "C:/secret"]) {
    expect(() => planNativeModules([{ bundle: { files: {}, assets: { [path]: new Uint8Array([1]) } } }])).toThrow("Unsafe");
  }
  expect(() => planNativeModules([{ bundle: { files: { "View.swift": "" }, assets: { "View.swift": new Uint8Array([1]) } } }])).toThrow("collision");
});
