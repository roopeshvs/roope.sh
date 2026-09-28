#!/usr/bin/env node
// Regenerates the Open Graph cards in static/og/.
//
// Ported from the Astro build-time endpoint src/pages/og/[slug].png.ts. Zola has
// no way to render text into an image, so these are generated ahead of time and
// committed. Run after adding or renaming a post; see tools/README.md.

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "static", "og");
const SECTIONS = ["blog", "projects"];

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 80;
const TITLE_SIZE = 64;
const DESC_SIZE = 28;
const TITLE_LINE_HEIGHT = TITLE_SIZE * 1.2;
const DESC_LINE_HEIGHT = DESC_SIZE * 1.35;
const FONT_STACK =
  "'DejaVu Sans','Liberation Sans','Helvetica Neue',Arial,sans-serif";

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapByChars(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatDate(d) {
  // Pinned to UTC so the output does not depend on the machine's timezone.
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Minimal TOML front matter reader: enough for the handful of scalar and array
// keys these files use. Not a general TOML parser.
function parseFrontMatter(raw) {
  const m = raw.match(/^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+/);
  if (!m) throw new Error("no TOML front matter");
  const data = {};
  let table = null;
  for (const line of m[1].split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const tbl = t.match(/^\[([^\]]+)\]$/);
    if (tbl) {
      table = tbl[1];
      continue;
    }
    const kv = t.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = table ? `${table}.${kv[1]}` : kv[1];
    let v = kv[2].trim();
    if (v.startsWith("[")) {
      data[key] = [...v.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
    } else if (v.startsWith('"')) {
      data[key] = v.slice(1, v.lastIndexOf('"'));
    } else {
      data[key] = v;
    }
  }
  return data;
}

function makeSvg({ title, description, date, tags }) {
  const titleLines = wrapByChars(escapeXml(title), 32).slice(0, 2);
  const descLines = wrapByChars(escapeXml(description), 64).slice(0, 2);

  const titleStartY = 250;
  const descStartY = titleStartY + titleLines.length * TITLE_LINE_HEIGHT + 24;

  const titleEls = titleLines
    .map(
      (line, i) =>
        `<text x="${PADDING}" y="${titleStartY + i * TITLE_LINE_HEIGHT}" font-family="${FONT_STACK}" font-size="${TITLE_SIZE}" font-weight="700" fill="#fafafa">${line}</text>`,
    )
    .join("");

  const descEls = descLines
    .map(
      (line, i) =>
        `<text x="${PADDING}" y="${descStartY + i * DESC_LINE_HEIGHT}" font-family="${FONT_STACK}" font-size="${DESC_SIZE}" fill="#a3a3a3">${line}</text>`,
    )
    .join("");

  const tagsEl =
    tags.length > 0
      ? `<text x="${WIDTH - PADDING}" y="${HEIGHT - PADDING + 4}" font-family="${FONT_STACK}" font-size="22" fill="#ea580c" text-anchor="end">${tags
          .map((t) => "#" + escapeXml(t))
          .join("  ")}</text>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0a"/>
  <g transform="translate(${PADDING}, ${PADDING})">
    <polyline points="0,4 26,22 0,40" fill="none" stroke="#fafafa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="40" y1="40" x2="70" y2="40" stroke="#fafafa" stroke-width="5" stroke-linecap="round"/>
  </g>
  <text x="${WIDTH - PADDING}" y="${PADDING + 38}" font-family="${FONT_STACK}" font-size="24" fill="#a3a3a3" text-anchor="end">roope.sh</text>
  ${titleEls}
  ${descEls}
  <text x="${PADDING}" y="${HEIGHT - PADDING + 4}" font-family="${FONT_STACK}" font-size="22" fill="#a3a3a3">${formatDate(date)}</text>
  ${tagsEl}
</svg>`;
}

async function collectEntries() {
  const entries = [];
  for (const section of SECTIONS) {
    const dir = join(ROOT, "content", section);
    for (const d of await readdir(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const file = join(dir, d.name, "index.md");
      const fm = parseFrontMatter(await readFile(file, "utf8"));
      entries.push({
        slug: d.name,
        title: fm.title,
        description: fm.description ?? "",
        date: new Date(fm.date),
        tags: fm["taxonomies.tags"] ?? [],
      });
    }
  }
  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}

const entries = await collectEntries();
await mkdir(OUT_DIR, { recursive: true });

for (const entry of entries) {
  const png = await sharp(Buffer.from(makeSvg(entry)))
    .png({ compressionLevel: 9 })
    .toBuffer();
  const out = join(OUT_DIR, `${entry.slug}.png`);
  await writeFile(out, png);
  console.log(
    `  ${String(png.length).padStart(7)} B  static/og/${entry.slug}.png`,
  );
}

console.log(`\n${entries.length} card(s) written to static/og/`);
