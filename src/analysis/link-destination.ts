/** Validated, serialized URL that SwiftUI can hand to the system; undefined means app-specific navigation. */
export function nativeExternalURL(href: string): string | undefined {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (!scheme || !["http", "https", "mailto", "tel"].includes(scheme)) return undefined;
  if ((scheme === "http" || scheme === "https") && !/^https?:\/\//i.test(href)) return undefined;
  try {
    const url = new URL(href);
    const hasDestination = scheme === "http" || scheme === "https" ? Boolean(url.hostname) : Boolean(url.pathname);
    return hasDestination ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function linkDestinationLoss(href: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) ? "unsupported or malformed URL" : "app navigation route or fragment";
}
