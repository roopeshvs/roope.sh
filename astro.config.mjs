import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import partytown from "@astrojs/partytown";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import pagefind from "astro-pagefind";

// https://astro.build/config
export default defineConfig({
  site: "https://roope.sh",
  integrations: [
    sitemap(),
    mdx(),
    pagefind(),
    partytown({
      config: {
        forward: ["dataLayer.push"],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      theme: "css-variables",
    },
  },
});
