import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://raelsei.github.io",
  base: "/markswift",
  trailingSlash: "ignore",
  // Astro's compression drops the space at a line break between text and an inline element.
  compressHTML: false,
});
