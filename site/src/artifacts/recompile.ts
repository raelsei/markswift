// Dump the WelcomeCard LayoutDoc and semantic IR, then recompile the saved LayoutDoc without Chrome.
import { readFileSync, writeFileSync } from "node:fs";
import { convert, compileLayout } from "../../../src/index.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";

const r = await convert({ file: "welcome.html" }, { name: "WelcomeCard" });
writeFileSync("WelcomeCard.layout.json", JSON.stringify(r.layout, null, 2));
writeFileSync("WelcomeCard.ir.json", JSON.stringify(inferScreen(r.layout, "WelcomeCard-light"), null, 2));
console.log(r.diagnostics.length, "diagnostics,", r.warnings.length, "warnings");

const saved = JSON.parse(readFileSync("WelcomeCard.layout.json", "utf8"));
const again = compileLayout(saved, { name: "WelcomeCard" });
writeFileSync("WelcomeCard.recompiled.swift", again.code);
console.log(Object.keys(again.files));
try {
  compileLayout({ ...saved, version: 4 }, { name: "WelcomeCard" });
} catch (error) {
  console.log((error as Error).message);
}
writeFileSync("WelcomeCard.fidelity.swift", compileLayout(saved, { name: "WelcomeCard", mode: "fidelity" }).code);
