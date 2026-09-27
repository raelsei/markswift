/** Keep the browser's interpolation class before individual stops become sRGB channels. */
export function gradientInterpolation(args: readonly string[]): { args: string[]; oklab: boolean } | undefined {
  const result = [...args];
  const explicit = /\bin\s+([a-z][\w-]*)/i.exec(result[0] ?? "");
  let oklab = result.some(stop => /^(?:lab|lch|oklab|oklch|color)\(/i.test(stop.trim()));
  if (explicit) {
    const space = explicit[1]!.toLowerCase();
    if (space !== "srgb" && space !== "oklab") return undefined;
    // Hue methods belong to polar spaces, which this route does not implement.
    if (/\b(?:shorter|longer|increasing|decreasing|hue)\b/i.test(result[0]!)) return undefined;
    oklab = space === "oklab";
    const prelude = result[0]!.replace(explicit[0], "").replace(/\s+/g, " ").trim();
    if (prelude) result[0] = prelude;
    else result.shift();
  }
  return { args: result, oklab };
}
