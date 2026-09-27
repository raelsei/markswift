import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type ControlNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
browserTest("live disabled marks retain theme/opacity and inherited disabled semantics in both output modes", async () => {
  const html = `<main data-markswift-root><fieldset disabled><legend><input id="exempt" type="checkbox" checked></legend>
    <input id="inherited" type="checkbox" checked><input id="radio" type="radio" checked>
    </fieldset><input id="direct" type="checkbox" checked disabled><input id="enabled" type="checkbox" checked></main>`;
  for (const theme of ["light", "dark"] as const) for (const mode of ["app", "fidelity"] as const) {
    let states: Array<{ id: string; checked: boolean; disabled: boolean }> = [];
    const result = await convertHtml(html, {
      name: "DisabledMarks", mode, theme,
      css: `html{color-scheme:${theme}}body{margin:0}main{width:280px;padding:8px}input:disabled{opacity:.4}`,
      async prepare(page) {
        await page.locator("#direct").click({ force: true });
        await page.locator("#inherited").click({ force: true });
        await page.locator("#exempt").click();
        await page.locator("#enabled").click();
        states = await page.locator("input").evaluateAll(inputs => inputs.map(node => {
          const input = node as HTMLInputElement;
          return { id: input.id, checked: input.checked, disabled: input.matches(":disabled") };
        }));
      },
    });
    expect(states).toEqual([
      { id: "exempt", checked: false, disabled: false }, { id: "inherited", checked: true, disabled: true },
      { id: "radio", checked: true, disabled: true }, { id: "direct", checked: true, disabled: true },
      { id: "enabled", checked: false, disabled: false },
    ]);
    const controls: ControlNode[] = [];
    walk(inferScreen(result.layout, "DisabledMarks").root, node => { if (node.kind === "control") controls.push(node); });
    expect(controls.filter(node => node.disabled)).toHaveLength(3);
    expect(controls.filter(node => node.disabled).every(node => node.style.opacity === .4)).toBe(true);
    expect(result.code.match(/disabled: true, palette:/g)).toHaveLength(3);
    expect(result.code.match(/\.opacity\(0\.4\)/g)).toHaveLength(3);
    expect(result.code).toContain(`palette: .${theme}`);
    expect(result.code.match(/\.disabled\(true\)/g)?.length ?? 0).toBe(mode === "app" ? 3 : 0);
  }
}, 60000);

browserTest("live default and inherited native color schemes are independent of page preference", async () => {
  for (const theme of ["light", "dark"] as const) for (const scheme of ["normal", "dark", "only light", "only dark", "light dark", "only parchment"]) {
    const palette = scheme === "dark" || scheme === "only dark" ? "dark" : scheme === "light dark" ? theme : "light";
    const result = await convertHtml(`<main data-markswift-root><fieldset disabled><legend>Choices</legend><input id="inherited-scheme" type="checkbox" checked></fieldset></main>`, {
      mode: "app", theme, css: `body{margin:0}main{width:180px;color-scheme:${scheme}}input:disabled{opacity:.4}`,
    });
    let control: ControlNode | undefined;
    walk(inferScreen(result.layout, "NativeScheme").root, node => { if (node.kind === "control") control = node; });
    expect(control?.disabled).toBe(true);
    expect(control?.style.opacity).toBe(.4);
    expect(control?.markColorScheme).toBe(scheme === "light dark" ? "light dark" : palette);
    expect(result.code).toContain(`disabled: true, palette: .${palette}`);
    expect(result.code).toContain(".opacity(0.4)");
    if (scheme === "only parchment") expect(control?.notes.join("\n")).toContain("no supported native scheme");
  }
}, 60000);

browserTest("enabled checkbox/radio native palettes preserve CSS normal/light/dark independently of page theme", async () => {
  for (const theme of ["light", "dark"] as const) for (const scheme of ["normal", "light", "dark"]) {
    const palette = scheme === "dark" ? "dark" : "light";
    for (const mode of ["app", "fidelity"] as const) {
      let live: Array<{ id: string; checked: boolean; scheme: string; opacity: string }> = [];
      const result = await convertHtml(`<main data-markswift-root><input id="check" type="checkbox"><input id="dot" type="radio"></main>`, {
        name: "EnabledNativeScheme", mode, theme, css: `body{margin:0}main{width:180px;color-scheme:${scheme}}input{opacity:.4}`,
        async prepare(page) {
          await page.locator("#check").click(); await page.locator("#dot").click();
          live = await page.locator("input").evaluateAll(nodes => nodes.map(node => ({ id: node.id, checked: (node as HTMLInputElement).checked, scheme: getComputedStyle(node).colorScheme, opacity: getComputedStyle(node).opacity })));
        },
      });
      expect(live).toEqual([{ id: "check", checked: true, scheme, opacity: "0.4" }, { id: "dot", checked: true, scheme, opacity: "0.4" }]);
      expect(result.code.match(new RegExp(`disabled: false, palette: \\.${palette}`, "g"))).toHaveLength(2);
      expect(result.code.match(/\.opacity\(0\.4\)/g)).toHaveLength(2);
    }
  }
}, 60000);
