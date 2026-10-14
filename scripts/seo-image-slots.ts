/*
 * Lists every image slot the current SEO layouts actually render, with its
 * path, size, alt text, generation prompt and whether the file exists yet.
 *
 *   pnpm exec tsx scripts/seo-image-slots.ts              Markdown table
 *   pnpm exec tsx scripts/seo-image-slots.ts --json       JSON
 *   pnpm exec tsx scripts/seo-image-slots.ts --missing    only slots without a file
 *   pnpm exec tsx scripts/seo-image-slots.ts --out DIR    write image-slots.md and image-slots.json to DIR
 *   pnpm exec tsx scripts/seo-image-slots.ts --install <slot id> <source image>
 *     resizes the source to the slot's size and saves it as WebP at the slot's path
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { seoPagePath, seoPages, type SeoCollection } from "@/src/content/seo";
import type { ImageSlot } from "@/src/content/seo/image-slots";
import { hubImageSlots, requiredImageSlots } from "@/src/components/marketing/seo/seo-layout";

type SlotRow = ImageSlot & { exists: boolean; usedOn: string[] };

const args = process.argv.slice(2);
const missingOnly = args.includes("--missing");
const outIndex = args.indexOf("--out");
const outDir = outIndex >= 0 ? args[outIndex + 1] : undefined;
if (outIndex >= 0 && !outDir) throw new Error("--out needs a directory");

const rows = new Map<string, SlotRow>();

function add(slot: ImageSlot, usedOn: string) {
  const row = rows.get(slot.id);
  if (row) {
    if (!row.usedOn.includes(usedOn)) row.usedOn.push(usedOn);
    return;
  }
  rows.set(slot.id, { ...slot, exists: existsSync(path.join(process.cwd(), "public", slot.src)), usedOn: [usedOn] });
}

for (const page of seoPages) for (const slot of requiredImageSlots(page)) add(slot, seoPagePath(page));
for (const collection of ["features", "solutions", "templates"] as const satisfies readonly SeoCollection[]) {
  for (const slot of hubImageSlots(collection)) add(slot, `/${collection}`);
}

const all = [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));

type Sharp = (input: string) => { resize(width: number, height: number, options: { fit: "cover"; position: string }): { webp(options: { quality: number }): { toBuffer(): Promise<Buffer> } } };

/* Hero photos live directly under public/marketing/seo; slots never reuse one. */
function heroHashes(): Set<string> {
  const hashes = new Set<string>();
  const root = path.join(process.cwd(), "public/marketing/seo");
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "slots") walk(full); }
      else if (entry.name.endsWith(".webp")) hashes.add(createHash("sha256").update(readFileSync(full)).digest("hex"));
    }
  };
  if (existsSync(root)) walk(root);
  for (const file of ["public/marketing/linkar-hero-creator-studio.webp", "public/marketing/linkar-hero-indian-relaxed.webp"]) {
    if (existsSync(file)) hashes.add(createHash("sha256").update(readFileSync(file)).digest("hex"));
  }
  return hashes;
}

async function install(id: string | undefined, source: string | undefined) {
  const slot = id ? rows.get(id) : undefined;
  if (!slot || !source) throw new Error("Usage: --install <slot id from the table, e.g. features/instagram-comment-to-dm/card> <source image>");
  if (!existsSync(source)) throw new Error(`Source image not found: ${source}`);
  if (heroHashes().has(createHash("sha256").update(readFileSync(source)).digest("hex"))) throw new Error("That is a hero photo. Slots need their own image.");
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const sharp = require(require.resolve("sharp", { paths: [require.resolve("next/package.json")] })) as Sharp;
  const destination = path.join(process.cwd(), "public", slot.src);
  mkdirSync(path.dirname(destination), { recursive: true });
  const image = await sharp(source).resize(slot.width, slot.height, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
  writeFileSync(destination, image);
  console.log(JSON.stringify({ id: slot.id, destination: path.relative(process.cwd(), destination), width: slot.width, height: slot.height, bytes: image.length }));
}

if (args[0] === "--install") {
  await install(args[1], args[2]);
  process.exit(0);
}
const listed = missingOnly ? all.filter((row) => !row.exists) : all;
const present = all.filter((row) => row.exists).length;

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

function markdown(): string {
  const byKey = new Map<string, number>();
  for (const row of all) byKey.set(row.key, (byKey.get(row.key) ?? 0) + 1);
  const lines = [
    "# SEO image slots",
    "",
    `${all.length} slots are used by the current layouts: ${present} present, ${all.length - present} missing.`,
    `By key: ${[...byKey].map(([key, count]) => `${key} ${count}`).join(", ")}.`,
    "",
    "| Path | Size | Exists | Used on | Alt | Prompt |",
    "|---|---|---|---|---|---|",
    ...listed.map((row) => `| \`public${row.src}\` | ${row.width}×${row.height} | ${row.exists ? "yes" : "no"} | ${row.usedOn.slice(0, 4).join(", ")}${row.usedOn.length > 4 ? ` +${row.usedOn.length - 4}` : ""} | ${cell(row.alt)} | ${cell(row.prompt)} |`),
  ];
  return `${lines.join("\n")}\n`;
}

function json(): string {
  return `${JSON.stringify({ total: all.length, present, missing: all.length - present, slots: listed.map(({ id, key, src, width, height, alt, prompt, exists, usedOn }) => ({ id, key, path: `public${src}`, src, width, height, alt, prompt, exists, usedOn })) }, null, 2)}\n`;
}

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "image-slots.md"), markdown());
  writeFileSync(path.join(outDir, "image-slots.json"), json());
  console.log(`Wrote ${listed.length} slots to ${path.join(outDir, "image-slots.md")} and image-slots.json`);
} else {
  process.stdout.write(args.includes("--json") ? json() : markdown());
}
