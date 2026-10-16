/** CSS the capture resolved for one viewport and one validation state, reported instead of silently baked in. */
import type { Page } from "playwright-core";
import { matchesWidth, widthQuery } from "../css/index.ts";
import {
  CONDITIONAL_MARK,
  CONTAINER_MARK,
  VALIDATION_MARK,
  type LayoutCondition,
  type LayoutNode,
} from "../model/layout.ts";
import type { ConversionWarning } from "../model/semantic.ts";

/** A size condition whose rules hit captured elements; `container`: the serial stamped on the query container. */
export interface FoundCondition {
  kind: "media" | "container";
  query: string;
  matches?: boolean;
  container?: number;
}

/**
 * Walks every readable stylesheet (nested rules included). For `@media`/`@container` rules with a
 * size condition, collects the selectors inside that match the captured root or its descendants
 * (whether or not the condition holds now) and stamps the matching elements with CONDITIONAL_MARK
 * (their query container with CONTAINER_MARK); marks elements an author rule styles through
 * `:valid`/`:invalid` with VALIDATION_MARK. Call before DOMSnapshot A so the marks land in `attrs`.
 * `breakpoints`: the conversion reconstructs width media queries, so they are not reported as losses.
 */
export async function readConditionalRules(
  page: Page,
  selector: string,
  viewportWidth: number,
  breakpoints = false,
): Promise<{ warnings: ConversionWarning[]; found: FoundCondition[] }> {
  const { rules, found } = await page.evaluate(
    ({ selector, mark, conditionalMark, containerMark }) => {
      const found: Array<{ kind: "media" | "container"; query: string; matches?: boolean; container?: number }> = [];
      const root = document.querySelector(selector);
      if (!root) return { rules: [], found };
      const SIZE = /\b(width|height|aspect-ratio|orientation|inline-size|block-size)\b/;
      const VALIDATION = /:(user-)?(in)?valid\b/;
      const PSEUDO_ELEMENT =
        /::?(before|after|marker|placeholder|selection|first-line|first-letter|backdrop|file-selector-button)\b/g;
      const matching = (sel: string): Element[] => {
        const plain = sel.replace(PSEUDO_ELEMENT, "");
        try {
          return [...(root.matches(plain) ? [root] : []), ...root.querySelectorAll(plain)];
        } catch {
          return [];
        }
      };
      const hits = (sel: string) => matching(sel).length > 0;
      type Cond = { key: string; kind: "media" | "container"; query: string; name: string };
      const index = new Map<string, number>();
      const containers = new Map<Element, number>();
      // Only containers inside the capture root are stamped (one outside has no node to resolve to).
      const containerOf = (el: Element, name: string): Element | undefined => {
        for (let a = el.parentElement; a && root.contains(a); a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.containerType !== "normal" && (!name || cs.containerName.split(/\s+/).includes(name))) return a;
        }
        return undefined;
      };
      const stamp = (cond: Cond, sel: string) => {
        for (const el of matching(sel)) {
          let key = `media\u0000${cond.query}`;
          let entry: (typeof found)[number] = { kind: "media", query: cond.query };
          if (cond.kind === "container") {
            const host = containerOf(el, cond.name);
            if (!host) continue;
            let serial = containers.get(host);
            if (serial === undefined) {
              serial = containers.size;
              containers.set(host, serial);
              host.setAttribute(containerMark, String(serial));
            }
            key = `container\u0000${cond.query}\u0000${serial}`;
            entry = { kind: "container", query: cond.query, container: serial };
          } else entry.matches = window.matchMedia(cond.query).matches;
          let i = index.get(key);
          if (i === undefined) {
            i = found.push(entry) - 1;
            index.set(key, i);
          }
          const marks = (el.getAttribute(conditionalMark) ?? "").split(" ").filter(Boolean);
          if (!marks.includes(String(i))) el.setAttribute(conditionalMark, [...marks, i].join(" "));
        }
      };
      const conditions = new Map<string, { query: string; selectors: Set<string> }>();
      const walk = (rules: CSSRuleList, parent: string | undefined, condition: Cond | undefined) => {
        for (const rule of Array.from(rules)) {
          let sel = parent;
          let cond = condition;
          if (rule instanceof CSSStyleRule) {
            // Nested rules: `&` is the parent; a nested selector without `&` is relative to it.
            sel =
              parent === undefined
                ? rule.selectorText
                : rule.selectorText.includes("&")
                  ? rule.selectorText.replaceAll("&", `:is(${parent})`)
                  : `:is(${parent}) ${rule.selectorText}`;
            if (cond && hits(sel)) {
              conditions.get(cond.key)!.selectors.add(rule.selectorText);
              stamp(cond, sel);
            }
            if (VALIDATION.test(sel))
              for (const el of [root, ...root.querySelectorAll("*")])
                try {
                  if (el.matches(sel)) el.setAttribute(mark, "");
                } catch {
                  /* unsupported selector */
                }
          } else if (
            (rule instanceof CSSMediaRule || rule instanceof CSSContainerRule) &&
            SIZE.test(rule.conditionText)
          ) {
            cond =
              rule instanceof CSSMediaRule
                ? { key: `@media ${rule.conditionText}`, kind: "media", query: rule.conditionText, name: "" }
                : {
                    key: `@container ${rule.conditionText}`,
                    kind: "container",
                    query: rule.containerQuery,
                    name: rule.containerName,
                  };
            if (!conditions.has(cond.key)) conditions.set(cond.key, { query: cond.query, selectors: new Set() });
            // Tailwind v4 nests the query inside the utility's own rule.
            if (parent && hits(parent)) {
              conditions.get(cond.key)!.selectors.add(parent);
              stamp(cond, parent);
            }
          }
          if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules, sel, cond);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules, undefined, undefined);
        } catch {
          /* cross-origin: unreadable, already reported */
        }
      }
      return {
        rules: [...conditions].map(([condition, c]) => ({ condition, query: c.query, selectors: [...c.selectors] })),
        found,
      };
    },
    { selector, mark: VALIDATION_MARK, conditionalMark: CONDITIONAL_MARK, containerMark: CONTAINER_MARK },
  );
  // Width media and container queries are reconstructed with `breakpoints`; the compile reports what stays lost.
  const warnings = rules
    .filter((c) => c.selectors.length && !(breakpoints && widthQuery(c.query)))
    .map(({ condition, selectors }) => ({
      source: "capture" as const,
      level: "approximated" as const,
      feature: condition.startsWith("@container") ? "container-query" : "media-query",
      message: `${condition} restyles ${selectors.length} rule(s) matching captured elements (${selectors.slice(0, 5).join(", ")}${selectors.length > 5 ? ", …" : ""}); the view keeps the layout captured at a ${viewportWidth}px viewport and does not switch`,
    }));
  return { warnings, found };
}

/** Moves the stamped marks into `conditional` and resolves container entries to node ids and `matches`. */
export function applyConditionMarks(root: LayoutNode, found: FoundCondition[]): LayoutCondition[] {
  const hosts = new Map<number, LayoutNode>();
  const visit = (n: LayoutNode) => {
    const marks = n.attrs[CONDITIONAL_MARK];
    if (marks !== undefined) {
      n.conditional = [...new Set(marks.split(" ").filter(Boolean).map(Number))].sort((a, b) => a - b);
      delete n.attrs[CONDITIONAL_MARK];
    }
    const serial = n.attrs[CONTAINER_MARK];
    if (serial !== undefined) {
      hosts.set(Number(serial), n);
      delete n.attrs[CONTAINER_MARK];
    }
    n.children.forEach(visit);
  };
  visit(root);
  return found.map((f): LayoutCondition => {
    if (f.kind === "media") return { kind: "media", query: f.query, matches: f.matches ?? false };
    const host = f.container === undefined ? undefined : hosts.get(f.container);
    if (!host?.id) return { kind: "container", query: f.query, matches: false };
    const px = (p: string) => Number.parseFloat(host.styles[p] ?? "") || 0;
    const content =
      host.bounds.w - px("padding-left") - px("padding-right") - px("border-left-width") - px("border-right-width");
    const q = widthQuery(f.query);
    return {
      kind: "container",
      query: f.query,
      container: host.id,
      matches: q !== undefined && matchesWidth(q, content),
    };
  });
}
