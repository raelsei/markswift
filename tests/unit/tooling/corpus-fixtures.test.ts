import { expect, test } from "bun:test";
import { parseDocument } from "htmlparser2";
import type { AnyNode, Element } from "domhandler";
import { corpusCategories, corpusFixtures, corpusManifest, createCorpusFixtures } from "../../../tools/verify/corpus-fixtures.ts";

function elements(nodes: AnyNode[]): Element[] {
  return nodes.flatMap(node => node.type === "tag" || node.type === "script" || node.type === "style" ? [node, ...elements(node.children)] : "children" in node ? elements(node.children) : []);
}

/** Ignore prose, class hashes, and colors; keep content topology and CSS layout declarations. */
function structuralSignature(html: string, css: string): string {
  const shape = (nodes: AnyNode[]): string => nodes.map(node => {
    if (!(node.type === "tag" || node.type === "script" || node.type === "style")) return "";
    const semantic = ["type", "size", "multiple", "rowspan", "colspan", "open", "dir", "role", "popover", "shadowrootmode"]
      .filter(attr => attr in node.attribs).map(attr => `${attr}=${node.attribs[attr]}`).join(",");
    return `${node.name}[${semantic}](${shape(node.children)})`;
  }).join("");
  const behavior = css.replace(/#[\da-f]{3,8}\b/gi, "COLOR").replace(/rgba?\([^)]*\)/gi, "COLOR")
    .replace(/(?:background(?:-color)?|color|border-color)\s*:[^;}]+/g, "paint:COLOR")
    .replace(/url\([^)]*\)/g, "url(ASSET)").replace(/\s+/g, " ");
  return `${shape(parseDocument(html).children)}|${behavior}`;
}

test("corpus has 240 authored structures across forty categories with a predeclared holdout in every category", () => {
  expect(corpusFixtures).toHaveLength(240);
  expect(corpusCategories).toHaveLength(40);
  expect(new Set(corpusFixtures.map(fixture => fixture.id)).size).toBe(240);
  expect(new Set(corpusFixtures.map(fixture => fixture.structureKey)).size).toBe(240);
  expect(new Set(corpusFixtures.map(fixture => structuralSignature(fixture.html, fixture.css))).size).toBe(240);
  for (const group of corpusCategories) {
    const fixtures = corpusFixtures.filter(fixture => fixture.category === group.id);
    expect(fixtures).toHaveLength(6);
    expect(fixtures.filter(fixture => fixture.split === "holdout")).toHaveLength(2);
    expect(fixtures.filter(fixture => fixture.split === "development")).toHaveLength(4);
    expect(fixtures[1]!.split).toBe("holdout");
    expect(fixtures[4]!.split).toBe("holdout");
  }
});

test("rebuilding corpus and manifest is deterministic without environment, clock, converter output, or scores", () => {
  expect(createCorpusFixtures()).toEqual([...corpusFixtures]);
  expect(corpusManifest()).toEqual(corpusManifest(createCorpusFixtures()));
  const manifest = corpusManifest();
  expect(manifest.total).toBe(240);
  expect(manifest.development).toBe(160);
  expect(manifest.holdout).toBe(80);
  expect(manifest.cases.every(entry => !("html" in entry) && !("css" in entry))).toBe(true);
});

test("all inputs have meaningful visible content and actual critical regions with no remote assets", () => {
  for (const fixture of corpusFixtures) {
    const nodes = elements(parseDocument(fixture.html).children);
    const root = nodes.find(node => node.attribs.id === "corpus");
    expect(root).toBeDefined();
    expect(root!.attribs["data-markswift-root"]).toBe("");
    expect(fixture.rootSelector).toBe("#corpus");
    expect(fixture.height).toBeGreaterThanOrEqual(300);
    expect(fixture.height).toBeLessThanOrEqual(650);
    expect(fixture.css).toContain(`#corpus{height:${fixture.height}px}`);
    expect(fixture.regions.length).toBeGreaterThanOrEqual(3);
    for (const region of fixture.regions) expect(nodes.some(node => node.attribs.id === region.id)).toBe(true);
    const ids = nodes.filter(node => node.attribs.id).map(node => node.attribs.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(nodes.some(node => node.name === "script")).toBe(false);
    for (const node of nodes) for (const attribute of ["src", "srcset", "href", "poster"]) {
      const value = node.attribs[attribute];
      if (value) expect(value.startsWith("data:") || value.startsWith("#")).toBe(true);
    }
    expect(fixture.css).not.toMatch(/@import\b|https?:\/\//);
    const visibleWords = fixture.html.replace(/<[^>]+>/g, "").replace(/\s/g, "").length;
    const paintedValues = nodes.reduce((sum, node) => sum + (node.name === "input" ? (node.attribs.value ?? "").length : 0), 0);
    const visualContent = nodes.some(node => ["svg", "img", "picture", "progress", "meter"].includes(node.name));
    expect(visibleWords + paintedValues).toBeGreaterThan(visualContent ? 40 : 45);
    expect(elements(root!.children).length).toBeGreaterThanOrEqual(3);
    expect(fixture.name).toMatch(/^Corpus[A-Za-z0-9]+$/);
  }
});

test("real layout variation includes documents, fragments, controls, responsive CSS, inline media and explicit challenges", () => {
  const features = new Set(corpusFixtures.flatMap(fixture => [...fixture.features]));
  for (const feature of ["inline-runs", "lists", "navigation", "toolbar", "forms", "grow", "shrink", "wrap", "alignment", "intrinsic-sizing", "grid", "fr", "spans", "auto-placement", "responsive", "rowspan", "colspan", "auto-layout", "gradients", "shadow", "pseudo-elements", "transform", "images", "svg", "dialog", "details", "ruby", "custom-element", "declarative-shadow-dom", "css-modules", "utility-classes", "container-query", "keyframes"]) {
    expect(features.has(feature)).toBe(true);
  }
  expect(corpusFixtures.filter(fixture => fixture.html.startsWith("<!doctype html>")).length).toBeGreaterThanOrEqual(4);
  expect(corpusFixtures.filter(fixture => fixture.html.startsWith("<section")).length).toBeGreaterThan(200);
  expect(corpusFixtures.filter(fixture => fixture.responsive).length).toBeGreaterThanOrEqual(6);
  expect(corpusFixtures.filter(fixture => fixture.hosted).length).toBeGreaterThanOrEqual(30);
  expect(corpusFixtures.filter(fixture => fixture.challenge).length).toBeGreaterThanOrEqual(40);
  expect(corpusManifest().cases.filter(entry => entry.challenge).length).toBe(corpusFixtures.filter(fixture => fixture.challenge).length);
  expect(corpusFixtures.some(fixture => fixture.html.includes("data:image/png;base64,"))).toBe(true);
  expect(corpusFixtures.some(fixture => fixture.html.includes("data:image/svg+xml,"))).toBe(true);
});
