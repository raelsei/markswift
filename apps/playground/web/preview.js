import { themeDeclaration, themeMedia, themeScheme, themeStylesheet } from "./preview-theme.js";

const PREVIEW_POLICY = [
  "default-src 'none'", "script-src 'none'", "style-src 'unsafe-inline'",
  "img-src data: blob:", "font-src data: blob:", "connect-src 'none'",
  "media-src 'none'", "frame-src 'none'", "object-src 'none'",
  "form-action 'none'", "base-uri 'none'",
].join("; ");

/** This frame is a source reference. It never executes pasted scripts or fetches remote assets. */
export function renderPreview(frame, html, css, viewport, theme = "light") {
  const documentForPreview = new DOMParser().parseFromString(html || "<!doctype html><html><body></body></html>", "text/html");
  documentForPreview.querySelectorAll("base, script, link, iframe, object, embed, portal, audio, video, source, track, meta[http-equiv]").forEach((node) => node.remove());

  const policy = documentForPreview.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = PREVIEW_POLICY;
  documentForPreview.head.prepend(policy);

  for (const meta of documentForPreview.querySelectorAll('meta[name="color-scheme" i]')) {
    meta.setAttribute("content", themeScheme(meta.getAttribute("content") ?? "", theme));
  }
  for (const element of documentForPreview.querySelectorAll("[style]")) {
    if (element.style) themeDeclaration(element.style, theme);
  }

  for (const style of documentForPreview.querySelectorAll("style")) {
    style.textContent = themeStylesheet(style.textContent ?? "", theme);
    if (style.hasAttribute("media")) style.setAttribute("media", themeMedia(style.getAttribute("media"), theme));
  }

  const attachedCss = documentForPreview.createElement("style");
  attachedCss.textContent = themeStylesheet(css, theme);
  documentForPreview.head.append(attachedCss);

  // A closing style token inside a CSS string must not terminate serialized srcdoc markup.
  for (const style of documentForPreview.querySelectorAll("style")) style.textContent = style.textContent.replace(/<\/style/gi, "<\\/style");

  frame.style.width = `${viewport.width}px`;
  frame.style.height = `${viewport.height}px`;
  frame.srcdoc = `<!doctype html>\n${documentForPreview.documentElement.outerHTML}`;
}
