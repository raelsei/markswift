import { defineConfig } from "astro/config";

export default defineConfig({
  // GitHub Pages serves project sites under the owner's custom domain (raelsei.github.io redirects there).
  site: "https://koray.dev",
  base: "/markswift",
  trailingSlash: "ignore",
  // Astro's compression drops the space at a line break between text and an inline element.
  compressHTML: false,
});
