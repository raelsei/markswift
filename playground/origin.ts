/** Public deployment configuration is an origin, never a URL path or a client-side secret. */
export function validatedOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  ) {
    throw new Error("A deployed origin must use HTTPS (HTTP is allowed for localhost only)");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Expected an origin without credentials, path, query or fragment");
  }
  return url.origin;
}
