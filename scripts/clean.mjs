import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Only reproducible outputs belong here. Never include environment files,
// dependencies, migrations, source, or user/editor configuration.
const outputs = [
  ".next", "dist", "coverage", "playwright-report", "test-results",
  ".playwright", ".playwright-mcp", ".code-review-graph", "tsconfig.tsbuildinfo",
];
const root = new URL("../", import.meta.url);
await Promise.all(outputs.map((output) => rm(new URL(output, root), { recursive: true, force: true })));
console.log(`Removed generated output from ${fileURLToPath(root)}`);
