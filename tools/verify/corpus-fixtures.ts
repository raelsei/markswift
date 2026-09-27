import type { CorpusFixture, CorpusManifestEntry } from "./corpus-model.ts";
import { cardCategories } from "./corpus/cards.ts";
import { contentCategories } from "./corpus/content.ts";
import { flexCategories } from "./corpus/flex.ts";
import { formCategories } from "./corpus/forms.ts";
import { gridCategories } from "./corpus/grid.ts";
import { navigationCategories } from "./corpus/navigation.ts";
import { paintCategories } from "./corpus/paint.ts";
import { baseCss } from "./corpus/shared.ts";
import { tableCategories } from "./corpus/tables.ts";

/** Order and holdout ordinals are authored before any conversion or visual run. */
export const corpusCategories = [
  ...contentCategories, ...navigationCategories, ...cardCategories, ...formCategories,
  ...flexCategories, ...gridCategories, ...tableCategories, ...paintCategories,
] as const;

function swiftName(id: string): string {
  return `Corpus${id.split("-").map(part => part[0]!.toUpperCase() + part.slice(1)).join("")}`;
}

/** Give the runner a small region containing actual feature text, not just a page heading. */
function criticalBody(source: string): { body: string; id: string } {
  const leaf = /<(h2|h3|p|button|label|legend|li|summary|td|th|span|div|dt|dd|pre|figcaption|caption|strong)(\s[^>]*)?>([^<>]*\S[^<>]*)<\/\1>/i.exec(source);
  if (!leaf) throw new Error("Corpus example needs visible feature text for a critical region");
  const existingId = /\bid\s*=\s*"([^"]+)"/.exec(leaf[2] ?? "")?.[1];
  if (existingId) return { body: source, id: existingId };
  const tagged = leaf[0].replace(/^<([\w-]+)/, `<$1 id="corpus-critical"`);
  return { body: source.slice(0, leaf.index) + tagged + source.slice(leaf.index + leaf[0].length), id: "corpus-critical" };
}

export function createCorpusFixtures(): CorpusFixture[] {
  return corpusCategories.flatMap(group => group.examples.map((sample, ordinal) => {
    const id = `${group.id}-${sample.key}`;
    const { body, id: criticalId } = sample.criticalId ? { body: sample.body, id: sample.criticalId } : criticalBody(sample.body);
    const root = `<section id="corpus" data-markswift-root><h1 id="corpus-heading">${group.title}</h1><div id="corpus-feature">${body}</div></section>`;
    const height = sample.height ?? 380;
    return {
      id, name: swiftName(id), category: group.id, structureKey: `${group.id}/${sample.key}`,
      features: [...new Set([...group.features, ...sample.features ?? []])],
      split: ordinal === 1 || ordinal === 4 ? "holdout" : "development",
      html: sample.document ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${group.title}</title></head><body>${root}</body></html>` : root,
      css: `${baseCss}\n#corpus{height:${height}px}\n${sample.css ?? ""}`,
      rootSelector: "#corpus", height, responsive: sample.responsive ?? false, hosted: sample.hosted ?? false,
      background: { light: [246, 248, 251], dark: [22, 30, 43] },
      regions: [
        { id: "corpus-heading", label: "category heading" },
        { id: criticalId, label: "critical feature text" },
        { id: "corpus-feature", label: "feature structure", maxError: 16 },
      ],
      ...sample.challenge ? { challenge: sample.challenge } : {},
    } satisfies CorpusFixture;
  }));
}

export const corpusFixtures: readonly CorpusFixture[] = createCorpusFixtures();

export function corpusManifest(fixtures: readonly CorpusFixture[] = corpusFixtures) {
  const cases: CorpusManifestEntry[] = fixtures.map(({ id, category, structureKey, features, split, height, responsive, hosted, challenge }) => ({
    id, category, structureKey, features, split, height, responsive, hosted, ...challenge ? { challenge } : {},
  }));
  return {
    schemaVersion: 1 as const,
    total: cases.length,
    development: cases.filter(entry => entry.split === "development").length,
    holdout: cases.filter(entry => entry.split === "holdout").length,
    categories: [...new Set(cases.map(entry => entry.category))].map(id => {
      const members = cases.filter(entry => entry.category === id);
      return { id, total: members.length, development: members.filter(entry => entry.split === "development").length, holdout: members.filter(entry => entry.split === "holdout").length };
    }),
    cases,
  };
}
