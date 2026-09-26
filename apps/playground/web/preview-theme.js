/** Parse CSS before editing media conditions, so declaration strings never become queries. */
export function themeStylesheet(css, theme) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  rewriteRules(sheet.cssRules, theme);
  return [...sheet.cssRules].map(rule => rule.cssText).join("\n");
}

/** A style's media attribute has the same query grammar as an @media prelude. */
export function themeMedia(media, theme) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync("@media all {}");
  const rule = sheet.cssRules[0];
  if (!(rule instanceof CSSMediaRule)) return media;
  try { rule.media.mediaText = media; }
  catch { return media; }
  return themeCondition(rule.conditionText, theme);
}

function rewriteRules(rules, theme) {
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule) rule.media.mediaText = themeCondition(rule.conditionText, theme);
    if (rule.style) themeDeclaration(rule.style, theme);
    if (rule.cssRules) rewriteRules(rule.cssRules, theme);
  }
}

/** Select among explicitly offered schemes, retaining fixed schemes and variable expressions. */
export function themeScheme(value, theme) {
  const tokens = value.trim().toLowerCase().split(/\s+/);
  if (!tokens.includes("light") || !tokens.includes("dark") || tokens.some(token => !/^[a-z_-][a-z0-9_-]*$/i.test(token))) return value;
  return `${tokens.includes("only") ? "only " : ""}${theme}`;
}

export function themeDeclaration(style, theme) {
  const value = style.getPropertyValue("color-scheme");
  const selected = themeScheme(value, theme);
  if (selected !== value) style.setProperty("color-scheme", selected, style.getPropertyPriority("color-scheme"));
}

function themeCondition(condition, theme) {
  // Preview widths are positive. These features are constant true/false while preserving
  // surrounding conjunctions, disjunctions, negation, media types and width/height conditions.
  return condition.replace(/\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)/gi,
    (_, scheme) => scheme.toLowerCase() === theme ? "(min-width: 0px)" : "(max-width: 0px)");
}
