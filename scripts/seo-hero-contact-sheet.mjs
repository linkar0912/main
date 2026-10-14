import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next/package.json")] }));
const scenes = JSON.parse(await readFile("src/content/seo/hero-scenes.json", "utf8"));
const destination = process.argv[2];
if (!destination) throw new Error("Provide a contact sheet output path");
const entries = scenes.map((scene) => ({
  ...scene,
  file: `public/marketing/seo/${scene.key.includes("/") ? scene.key : `${scene.key}/index`}.webp`,
})).filter((scene) => existsSync(scene.file));
const columns = 6;
const tileWidth = 330;
const photoHeight = 220;
const tileHeight = 284;
const rows = Math.ceil(entries.length / columns);
const layers = await Promise.all(entries.map(async (scene, index) => {
  const [collection, slug = "collection hub"] = scene.key.split("/");
  const label = slug.replaceAll("-", " ");
  const words = label.split(" ");
  const lines = [""];
  for (const word of words) {
    if ((lines.at(-1) + word).length > 37) lines.push("");
    lines[lines.length - 1] += `${word} `;
  }
  const caption = Buffer.from(`<svg width="330" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="330" height="64" fill="#fff"/><text x="12" y="18" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="#656570">${collection}</text>${lines.map((line, lineIndex) => `<text x="12" y="${36 + lineIndex * 16}" font-family="Helvetica,Arial,sans-serif" font-size="12" fill="#101116">${line.trim()}</text>`).join("")}</svg>`);
  const thumbnail = await sharp(scene.file).resize(tileWidth, photoHeight).toBuffer();
  const left = (index % columns) * tileWidth;
  const top = Math.floor(index / columns) * tileHeight;
  return [{ input: thumbnail, left, top }, { input: caption, left, top: top + photoHeight }];
}));
await mkdir(path.dirname(destination), { recursive: true });
await sharp({ create: { width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: "#ffffff" } })
  .composite(layers.flat()).jpeg({ quality: 88 }).toFile(destination);
console.log(JSON.stringify({ entries: entries.length, destination }));
