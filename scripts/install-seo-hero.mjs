import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next/package.json")] }));
const [key, source] = process.argv.slice(2);
const scenes = JSON.parse(await readFile("src/content/seo/hero-scenes.json", "utf8"));
if (!scenes.some((scene) => scene.key === key) || !source) throw new Error("A known hero scene and source image are required");
const relative = key.includes("/") ? key : `${key}/index`;
const destination = path.join("public/marketing/seo", `${relative}.webp`);
await mkdir(path.dirname(destination), { recursive: true });
const image = await sharp(source).resize(1536, 1024, { fit: "cover" }).webp({ quality: 84 }).toBuffer();
await writeFile(destination, image);
console.log(JSON.stringify({ key, destination, bytes: image.length, sha256: createHash("sha256").update(image).digest("hex") }));
