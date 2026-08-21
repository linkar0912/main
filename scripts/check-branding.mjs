import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const forbidden = new RegExp(["DM", "Setu"].join(""), "gi");
const ignored = /^(?:node_modules\/|\.next\/|coverage\/|dist\/|build\/|\.superpowers\/)/;
// git ls-files reports tracked files even when deleted in the working tree
// (unstaged deletions); skip anything missing on disk.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((file) => file && !ignored.test(file) && existsSync(file));
const matches = [];

for (const file of files) {
  const contents = readFileSync(file, "utf8");
  if (forbidden.test(contents)) matches.push(file);
  forbidden.lastIndex = 0;
}

if (matches.length > 0) {
  console.error("Forbidden legacy branding found in:");
  for (const file of matches) console.error(file);
  process.exit(1);
}

console.log("Branding check passed.");
