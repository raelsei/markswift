import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { convertHtml } from "../../src/index.ts";
import type { CaptureRequest } from "../../src/input/types.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const browser = new BrowserCapture({ dpr: 1, viewport: { width: 390, height: 844 } });
beforeAll(async () => {
  if (process.env.MARKSWIFT_BROWSER_TESTS === "1") await browser.start();
});
afterAll(() => browser.stop());

const cap = (html: string, extra: Partial<CaptureRequest> = {}) =>
  browser.capture(
    { screen: "s", theme: "light", url: "http://markswift.invalid/", html, root: "[data-markswift-root]", ...extra },
    htmlIdentity,
    "test",
  );

/** The rest capture's trigger `id` (the only one when omitted), opened in its own page. */
async function open(html: string, id?: string, probeDismiss = false) {
  const rest = await cap(html);
  const trigger = rest.triggers!.find((t) => id === undefined || t.id === id)!;
  return cap(html, { open: trigger, probeDismiss });
}

const SCRIPT = "<script>/* scripted */</script>";
const DISCOVERY = `<main data-markswift-root>
<button aria-expanded="false">Menu</button>
<details><summary>More</summary><p>Answer</p></details>
<button popovertarget="p">Share link</button><div popover id="p">Copy</div>
</main>`;

const DIALOG = `<style>dialog::backdrop { background: rgba(0,0,0,.4) }</style><main data-markswift-root>
<button commandfor="d" command="show-modal">Open dialog</button><dialog id="d" closedby="any"><p>Hi</p><form method="dialog"><button id="close">Close</button></form></dialog>
</main>`;

const POPOVER = `<main data-markswift-root><button popovertarget="p" style="anchor-name:--a">Share link</button><div popover id="p" style="position-anchor:--a; position-area: bottom; margin:0">Copy</div></main>`;

/** Radix-shaped dialog: portal scrim + content, focus guards, root aria-hidden, focus moved into the content. */
const radix = ({
  role = "dialog",
  content = "top:50%; left:50%; transform: translate(-50%,-50%)",
  scrim = true,
  outside = "scrim",
} = {}) => `<style>
button { background: rgb(255, 255, 255); border: 0 }
[aria-expanded=true] { background: rgb(240, 240, 240) }
</style>
<main data-markswift-root><button id="t" aria-haspopup="dialog" aria-expanded="false">Edit profile</button></main>
<script>
const t = document.getElementById("t");
const root = document.querySelector("main");
const add = (tag, css) => {
  const el = document.createElement(tag);
  el.setAttribute("data-layer", "");
  el.style.cssText = css;
  document.body.append(el);
  return el;
};
const close = () => {
  for (const el of document.querySelectorAll("[data-layer]")) el.remove();
  root.removeAttribute("aria-hidden");
  t.setAttribute("aria-expanded", "false");
  t.removeAttribute("aria-controls");
};
t.addEventListener("click", () => {
  add("span", "position:fixed; opacity:0").tabIndex = 0;
  ${scrim ? `add("div", "position:fixed; inset:0; background: rgba(0,0,0,.1)").addEventListener("click", close);` : ""}
  const c = add("div", "position:fixed; background: white; padding: 16px; ${content}");
  c.id = "c";
  c.setAttribute("role", "${role}");
  c.setAttribute("aria-modal", "true");
  c.innerHTML = '<input><button id="cancel">Cancel</button>';
  c.querySelector("#cancel").addEventListener("click", close);
  add("span", "position:fixed; opacity:0").tabIndex = 0;
  root.setAttribute("aria-hidden", "true");
  t.setAttribute("aria-controls", "c");
  t.setAttribute("aria-expanded", "true");
  c.querySelector("input").focus();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
${outside === "corner" ? `document.addEventListener("click", (e) => { if (e.clientX < 10 && e.clientY < 10) close(); });` : ""}
</script>`;

describe("discovery", () => {
  browserTest("a scriptless page finds native triggers only", async () => {
    const { triggers } = await cap(DISCOVERY);
    expect(triggers!.map((t) => [t.id, t.activation, t.relation])).toEqual([
      ["more", "click", "details"],
      ["share-link", "click", "popovertarget"],
    ]);
  });

  browserTest("a scripted page also finds the aria-expanded button", async () => {
    const { triggers } = await cap(DISCOVERY + SCRIPT);
    expect(triggers!.map((t) => [t.id, t.trigger])).toEqual([
      ["menu", "0"],
      ["more", "1/0"],
      ["share-link", "2"],
    ]);
  });

  browserTest("duplicate names, disabled and nested triggers, and a bogus hint", async () => {
    const { triggers, warnings } = await cap(`<main data-markswift-root>
<button aria-haspopup="menu">Open</button><button aria-haspopup="menu">Open</button>
<button aria-haspopup="menu" disabled>Gone</button>
<div aria-expanded="false">Outer <button aria-haspopup="dialog">Inner</button></div>
<span data-markswift-opens="bogus">b</span>
</main>${SCRIPT}`);
    expect(triggers!.map((t) => t.id)).toEqual(["open", "open-2", "outer-inner"]);
    expect(warnings.map((w) => w.message)).toContain(
      'data-markswift-opens="bogus" is not click, hover or contextmenu; the element is not opened',
    );
  });
});

describe("open", () => {
  browserTest("native dialog: modal, viewport, ::backdrop", async () => {
    const { opened } = await open(DIALOG);
    const { nodes, ...layer } = opened!.layer;
    expect(layer).toEqual({
      id: "open-dialog",
      trigger: "0",
      activation: "click",
      relation: "commandfor",
      modal: true,
      placement: "viewport",
      dismiss: { escape: false, outside: false, buttons: [] },
    });
    expect(nodes.map((n) => [n.id, n.tag, n.styles.overlay])).toEqual([["#d", "dialog", "auto"]]);
    expect(nodes[0]!.pseudoStyles?.backdrop?.["background-color"]).toBe("rgba(0, 0, 0, 0.4)");
  });

  browserTest("anchored popover", async () => {
    const { opened } = await open(POPOVER);
    const { nodes, ...layer } = opened!.layer;
    expect(layer).toEqual({
      id: "share-link",
      trigger: "0",
      activation: "click",
      relation: "popovertarget",
      modal: false,
      placement: "anchored",
      dismiss: { escape: false, outside: false, buttons: [] },
    });
    expect(nodes.map((n) => n.id)).toEqual(["#p"]);
  });

  browserTest("details: inflow at index 1 of #faq", async () => {
    const { opened } = await open(
      `<main data-markswift-root><details id="faq"><summary>More</summary><p>Answer</p></details></main>`,
    );
    const { nodes, ...layer } = opened!.layer;
    expect(layer).toEqual({
      id: "more",
      trigger: "0/0",
      activation: "click",
      relation: "details",
      modal: false,
      placement: "inflow",
      parent: "#faq",
      index: 1,
      dismiss: { escape: false, outside: false, buttons: [] },
    });
    expect(nodes.map((n) => [n.id, n.tag])).toEqual([["0/1", "p"]]);
  });

  browserTest("Radix-shaped dialog: scrim + content, no guards, no focus ring, trigger open paint", async () => {
    const { opened } = await open(radix());
    const { nodes, ...layer } = opened!.layer;
    expect(layer).toEqual({
      id: "edit-profile",
      trigger: "#t",
      activation: "click",
      relation: "aria-controls",
      modal: true,
      placement: "viewport",
      dismiss: { escape: false, outside: false, buttons: [] },
    });
    expect(nodes.map((n) => [n.id, n.tag])).toEqual([
      ["edit-profile", "div"],
      ["#c", "div"],
    ]);
    const input = nodes[1]!.children.find((n) => n.tag === "input")!;
    expect([input.id, input.styles["outline-style"]]).toEqual(["edit-profile/1/0", "none"]);
    expect(opened!.openPaint["#t"]?.["background-color"]).toBe("rgb(240, 240, 240)");
  });

  browserTest("hover hint: a tooltip shown 300 ms after mouseenter", async () => {
    const { opened } = await open(`<main data-markswift-root><span data-markswift-opens="hover">i</span></main>
<script>
// A real page-side delay: the hover activation must wait for the tooltip's first DOM mutation.
document.querySelector("span").addEventListener("mouseenter", () => setTimeout(() => {
  const tip = document.createElement("div");
  tip.textContent = "Info";
  tip.style.cssText = "position:fixed; top:40px; left:8px";
  document.body.append(tip);
}, 300));
</script>`);
    expect([opened!.layer.activation, opened!.layer.relation, opened!.layer.nodes.length]).toEqual([
      "hover",
      "dom-diff",
      1,
    ]);
  });

  browserTest("a trigger without a handler opens nothing", async () => {
    const { opened } = await open(`<main data-markswift-root><button aria-expanded="false">X</button></main>${SCRIPT}`);
    expect(opened).toBeUndefined();
  });
});

describe("dismiss probes", () => {
  browserTest("native dialog: Escape, outside, the form's close button", async () => {
    expect((await open(DIALOG, undefined, true)).opened!.layer.dismiss).toEqual({
      escape: true,
      outside: true,
      buttons: ["#close"],
    });
  });

  browserTest("Radix-shaped: Escape, scrim click, Cancel", async () => {
    expect((await open(radix(), undefined, true)).opened!.layer.dismiss).toEqual({
      escape: true,
      outside: true,
      buttons: ["#cancel"],
    });
  });

  browserTest("popover: Escape and light dismiss, no buttons", async () => {
    expect((await open(POPOVER, undefined, true)).opened!.layer.dismiss).toEqual({
      escape: true,
      outside: true,
      buttons: [],
    });
  });

  browserTest("right sheet covering x ≥ 40: the outside click lands at the top-left corner", async () => {
    const html = radix({ scrim: false, content: "top:0; bottom:0; left:40px; right:0", outside: "corner" });
    expect((await open(html, undefined, true)).opened!.layer.dismiss.outside).toBe(true);
  });

  browserTest("alertdialog that ignores outside clicks", async () => {
    const html = radix({ role: "alertdialog", scrim: false });
    expect((await open(html, undefined, true)).opened!.layer.dismiss.outside).toBe(false);
  });
});

describe("convert", () => {
  browserTest("adaptive: layers pair by id and dark copies the light dismissal", async () => {
    const result = await convertHtml(DIALOG, { theme: "adaptive" });
    const [light, dark] = [result.layout.layers![0]!, result.darkLayout!.layers![0]!];
    expect(dark.id).toBe(light.id);
    expect(light.dismiss.escape).toBe(true);
    expect(dark.dismiss).toEqual(light.dismiss);
  });
});
