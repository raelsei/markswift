const PREVIEW_POLICY = [
  "default-src 'none'", "script-src 'none'", "style-src 'unsafe-inline'",
  "img-src data: blob:", "font-src data: blob:", "connect-src 'none'",
  "media-src 'none'", "frame-src 'none'", "object-src 'none'",
  "form-action 'none'", "base-uri 'none'",
].join("; ");

/** This frame is a source reference. It never executes pasted scripts or fetches remote assets. */
export function renderPreview(frame, html, css, viewport) {
  const documentForPreview = new DOMParser().parseFromString(html || "<!doctype html><html><body></body></html>", "text/html");
  documentForPreview.querySelectorAll("base, script, link, iframe, object, embed, portal, audio, video, source, track, meta[http-equiv]").forEach((node) => node.remove());

  const policy = documentForPreview.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = PREVIEW_POLICY;
  documentForPreview.head.prepend(policy);

  const attachedCss = documentForPreview.createElement("style");
  attachedCss.textContent = css.replace(/<\/style/gi, "<\\/style");
  documentForPreview.head.append(attachedCss);

  frame.style.width = `${viewport.width}px`;
  frame.style.height = `${viewport.height}px`;
  frame.srcdoc = `<!doctype html>\n${documentForPreview.documentElement.outerHTML}`;
}
