import type { NodeIdentity } from "./types.ts";

/** Stable names shared by all HTML inputs, independent of stylesheet origin. */
export const htmlIdentity: NodeIdentity = (_tag, attrs, path) => {
  if (attrs.id) return `#${attrs.id}`;
  return attrs["data-markswift"] ?? attrs["data-h2s"] ?? attrs["data-testid"] ?? attrs["data-name"] ?? (path === "" ? "root" : path);
};
