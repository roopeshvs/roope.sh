# tools

Dev-only. The site build (`zola build`) does not use anything in here.

## og.mjs

Regenerates the Open Graph cards in `static/og/`. Run it when you add or rename
a post, or change a title/description, then commit the resulting PNGs.

```sh
cd tools && npm install   # once
npm run og
```

Zola cannot render text to an image, so the cards are generated ahead of time
and committed rather than built on every deploy. This is the only part of the
site that still needs Node, and it runs on your machine, never in CI.
