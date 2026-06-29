import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 80;
const TITLE_SIZE = 64;
const DESC_SIZE = 28;
const TITLE_LINE_HEIGHT = TITLE_SIZE * 1.2;
const DESC_LINE_HEIGHT = DESC_SIZE * 1.35;
const FONT_STACK =
  "'DejaVu Sans','Liberation Sans','Helvetica Neue',Arial,sans-serif";

type Entry = CollectionEntry<"blog"> | CollectionEntry<"projects">;

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapByChars(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
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

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function makeSvg(entry: Entry) {
  const title = escapeXml(entry.data.title);
  const desc = escapeXml(entry.data.description);
  const date = formatDate(entry.data.date);
  const tags = "tags" in entry.data ? entry.data.tags ?? [] : [];

  const titleLines = wrapByChars(title, 32).slice(0, 2);
  const descLines = wrapByChars(desc, 64).slice(0, 2);

  const titleStartY = 250;
  const descStartY =
    titleStartY + titleLines.length * TITLE_LINE_HEIGHT + 24;

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
          .map((t) => "#" + t)
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
  <text x="${PADDING}" y="${HEIGHT - PADDING + 4}" font-family="${FONT_STACK}" font-size="22" fill="#a3a3a3">${date}</text>
  ${tagsEl}
</svg>`;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const [blog, projects] = await Promise.all([
    getCollection("blog"),
    getCollection("projects"),
  ]);
  return [...blog, ...projects].map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const { entry } = props as { entry: Entry };
  const svg = makeSvg(entry);
  const png = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
