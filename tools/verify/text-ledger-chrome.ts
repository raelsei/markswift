import { createHash } from "node:crypto";
import type { Page } from "playwright-core";
import type { ChromeTextLedger, TextLedgerAncestor, TextLedgerNode, TextLedgerOccurrence, TextLedgerRect } from "./text-ledger-model.ts";

export const utf16Hash = (value: string): string => createHash("sha256").update(value, "utf16le").digest("hex");
export const textLedgerHash = (ledger: ChromeTextLedger): string => createHash("sha256").update(JSON.stringify(ledger)).digest("hex");

/** Reads every real childNode before pruning. No converter layout/normalization helpers. */
export async function readChromeTextLedger(page: Page, selector: string): Promise<ChromeTextLedger> {
  const observed = await page.evaluate(selector => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`Text ledger root ${selector} not found`);
    const origin = root.getBoundingClientRect(), nodes: TextLedgerNode[] = [];
    const occurrences: Omit<TextLedgerOccurrence, "rawUtf16Sha256">[] = [], unavailable: string[] = [];
    const stylesOf = (element: Element): Record<string, string> => {
      const style = getComputedStyle(element);
      return Object.fromEntries([...style].map(property => [property, style.getPropertyValue(property)]));
    };
    const rectangles = (values: DOMRectList): TextLedgerRect[] => [...values].map(rect => ({
      x: rect.x - origin.x, y: rect.y - origin.y, w: rect.width, h: rect.height,
    }));
    const walk = (node: Node, key: string, ancestors: TextLedgerAncestor[]) => {
      const raw = node.nodeValue ?? "";
      nodes.push({ key, type: node.nodeType, name: node.nodeName.toLowerCase(), raw, ancestors });
      const element = node instanceof Element ? node : node.parentElement;
      if (node instanceof Element) {
        if (node.shadowRoot || node.localName.includes("-") || node.localName === "slot") unavailable.push(`${key}: shadow/custom/slot composition is unproved`);
        if (node instanceof HTMLIFrameElement) unavailable.push(`${key}: embedded document text is unobserved`);
        if (node instanceof HTMLInputElement && !["checkbox", "radio", "hidden", "range", "color"].includes(node.type)
          || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) unavailable.push(`${key}: attribute-backed or dynamic control text is unobserved`);
        for (const pseudo of ["::before", "::after", "::marker"]) {
          const content = getComputedStyle(node, pseudo).content;
          if (content && content !== "none" && content !== "normal") unavailable.push(`${key}${pseudo}: generated text origin is unobserved`);
        }
        if (getComputedStyle(node).display === "list-item" && getComputedStyle(node).listStyleType !== "none") unavailable.push(`${key}::marker: resolved default marker text is unobserved`);
      }
      const kind = node.nodeType === Node.TEXT_NODE ? "text" : node instanceof Element && (node.localName === "br" || node.localName === "wbr") ? node.localName : undefined;
      if (kind) {
        const styles = element ? stylesOf(element) : {}, suppression: string[] = [], reasons: string[] = [];
        // visibility is inherited but descendants may override it; an ancestor's hidden
        // value alone cannot prove that this descendant's text is suppressed.
        if (styles.visibility && styles.visibility !== "visible") suppression.push(`visibility:${styles.visibility}`);
        for (let parent = element; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.display === "none") suppression.push("display:none ancestor");
          if (Number(style.opacity) === 0) suppression.push("opacity:0 ancestor");
          if (style.contentVisibility !== "visible") reasons.push(`content-visibility:${style.contentVisibility} scope is unproved`);
          if (style.transform !== "none" || style.direction !== "ltr" || style.writingMode !== "horizontal-tb") reasons.push("transformed/bidi/vertical text scope is unproved");
        }
        if (!element) reasons.push("detached text style is unavailable");
        if (styles["text-transform"] && styles["text-transform"] !== "none") reasons.push("text-transform projection is unproved");
        let visibilityHost = element;
        while (visibilityHost && getComputedStyle(visibilityHost).display === "contents") visibilityHost = visibilityHost.parentElement;
        if (visibilityHost && !visibilityHost.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true }) && !suppression.length) reasons.push("flat-tree paint visibility is unproved");
        const range = document.createRange(), ranges: TextLedgerOccurrence["ranges"] = [];
        if (kind === "text") {
          range.selectNodeContents(node);
          for (let start = 0; start < raw.length;) {
            const end = start + (raw.codePointAt(start)! > 0xffff ? 2 : 1);
            range.setStart(node, start); range.setEnd(node, end);
            ranges.push({ start, end, fragments: rectangles(range.getClientRects()) }); start = end;
          }
          range.selectNodeContents(node);
        } else range.selectNode(node);
        occurrences.push({ key, kind, raw: kind === "text" ? raw : "", ancestors, styles,
          rendering: suppression.length ? "suppressed" : reasons.length ? "unavailable" : "visible",
          suppression: [...new Set(suppression)], unavailable: [...new Set(reasons)], fragments: rectangles(range.getClientRects()), ranges });
      }
      const next = node instanceof Element ? [...ancestors, { key, tag: node.localName, display: getComputedStyle(node).display }] : ancestors;
      [...node.childNodes].forEach((child, index) => walk(child, key === "dom:/" ? `${key}${index}` : `${key}/${index}`, next));
    };
    walk(root, "dom:/", []);
    const externalAncestors: ChromeTextLedger["root"]["externalAncestors"] = [];
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) externalAncestors.push({ tag: ancestor.localName, styles: stylesOf(ancestor) });
    return { document: { url: location.href, mode: document.compatMode, html: document.documentElement.outerHTML,
      viewportWidth: innerWidth, viewportHeight: innerHeight, deviceScaleFactor: devicePixelRatio,
      theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" as const : "light" as const },
      root: { key: "dom:/" as const, type: 1 as const, tag: root.localName, selector,
        frame: { x: origin.x, y: origin.y, w: origin.width, h: origin.height }, externalAncestors }, nodes, occurrences, unavailable };
  }, selector);
  const { html, ...documentMetadata } = observed.document;
  return { version: 1, contract: "live-dom-text-ledger-v1", observer: "independent-live-dom", hashEncoding: "utf16le",
    browserVersion: page.context().browser()?.version() ?? "unavailable", document: { ...documentMetadata, htmlSha256: utf16Hash(html) },
    root: observed.root, nodes: observed.nodes,
    occurrences: observed.occurrences.map(occurrence => ({ ...occurrence, rawUtf16Sha256: utf16Hash(occurrence.raw) })),
    unavailable: observed.unavailable };
}
