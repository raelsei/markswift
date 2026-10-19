import { defineConfig } from "astro/config";

export default defineConfig({
  // This repository's custom domain serves the site at the root.
  site: "https://markswift.koray.dev",
  trailingSlash: "ignore",
  // Astro's compression drops the space at a line break between text and an inline element.
  compressHTML: false,
});
