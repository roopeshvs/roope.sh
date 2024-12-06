import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";
import partytown from '@astrojs/partytown'

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import pagefind from "astro-pagefind";

// https://astro.build/config
export default defineConfig({
  site: "https://roope.sh",
  integrations: [tailwind(), sitemap(), mdx(), pagefind(),
    partytown({
      config: {
        forward: ["dataLayer.push"],
      },
  }),
  ],
  markdown: {
    shikiConfig: {
      theme: "css-variables",
    },
  },
});
