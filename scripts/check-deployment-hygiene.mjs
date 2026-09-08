import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const retiredHosts = [["cool", "ify"].join(""), ["host", "inger"].join("")];
const retiredReferences = [
  ...retiredHosts,
  ["SOURCE", "COMMIT"].join("_"),
  ["check", ":", "compose"].join(""),
  ["docker-compose.", "production", ".yml"].join(""),
  ["http-follow", "-redirects"].join(""),
];
const retiredReferencePattern = new RegExp(retiredReferences.join("|"), "i");
const retiredArtifacts = new Set([
  ["docker-compose.", retiredHosts[0], ".yml"].join(""),
  ["docker-compose.", "production", ".yml"].join(""),
  ["ops/", retiredHosts[0].toUpperCase(), "_DEPLOYMENT.md"].join(""),
  ["scripts/", retiredHosts[0], "-deploy.mjs"].join(""),
  ["scripts/", retiredHosts[0], "-status.mjs"].join(""),
  ["scripts/http-follow", "-redirects.mjs"].join(""),
  ["scripts/http-follow", "-redirects.d.mts"].join(""),
  ["scripts/http-follow", "-redirects.test.ts"].join(""),
]);

function shouldInspect(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");

  if (normalized.startsWith("docs/superpowers/")) return false;
  if (/(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(normalized)) return false;

  const rootFiles = new Set([
    "README.md",
    ".env.example",
    ".env.production.example",
    ".gitignore",
    "package.json",
  ]);
  if (rootFiles.has(normalized)) return true;

  return [".github/", "app/", "docs/", "ops/", "scripts/", "src/"].some((prefix) =>
    normalized.startsWith(prefix),
  );
}

export async function findRetiredDeploymentArtifacts(root, relativePaths) {
  const findings = [];

  for (const relativePath of [...relativePaths].sort()) {
    const normalized = relativePath.split(path.sep).join("/");
    if (retiredArtifacts.has(normalized)) {
      try {
        await access(path.join(root, normalized));
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
      findings.push({ path: normalized, line: 0, message: "retired deployment artifact" });
      continue;
    }
    if (!shouldInspect(normalized)) continue;

    let contents;
    try {
      contents = await readFile(path.join(root, normalized), "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    if (contents.includes("\0")) continue;

    contents.split(/\r?\n/).forEach((line, index) => {
      if (retiredReferencePattern.test(line)) {
        findings.push({
          path: normalized,
          line: index + 1,
          message: "retired deployment reference",
        });
      }
    });
  }

  return findings;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const relativePaths = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const findings = await findRetiredDeploymentArtifacts(root, relativePaths);

  if (findings.length === 0) {
    console.log("Deployment hygiene check passed");
    return;
  }

  for (const finding of findings) {
    const location = finding.line > 0 ? `${finding.path}:${finding.line}` : finding.path;
    console.error(`${location} — ${finding.message}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
