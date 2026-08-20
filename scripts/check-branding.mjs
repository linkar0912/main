import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const forbidden = new RegExp(`${["DM", "Setu"].join("")}|${["dm", "setu"].join("")}`, "g");
const ignored = /^(?:node_modules\/|\.next\/|coverage\/|dist\/|build\/|\.superpowers\/|docs\/superpowers\/)/;
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((file) => file && !ignored.test(file));
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
