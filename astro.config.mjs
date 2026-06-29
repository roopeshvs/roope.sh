import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import partytown from "@astrojs/partytown";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import pagefind from "astro-pagefind";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

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
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: "append",
          properties: {
            className: ["heading-anchor"],
            ariaLabel: "Anchor link to this heading",
          },
          content: { type: "text", value: "#" },
        },
      ],
    ],
  },
});
