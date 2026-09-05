import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const BANNED_TERMS = [
  { term: "automation surface", pattern: /\bautomation surface\b/i },
  { term: "payload", pattern: /\bpayloads?\b/i },
  { term: "recipient", pattern: /\brecipients?\b/i },
  { term: "webhook", pattern: /\bwebhooks?\b/i },
];

const LEGAL_PAGES = new Set([
  "app/terms/page.tsx",
  "app/privacy/page.tsx",
  "app/cookies/page.tsx",
  "app/acceptable-use/page.tsx",
  "app/data-processing/page.tsx",
  "app/service-providers/page.tsx",
  "app/data-deletion/page.tsx",
]);

function normalized(file) {
  return file.split(path.sep).join("/").replace(/^\.\//, "");
}

export function shouldScanCustomerFile(file) {
  const value = normalized(file);
  if (!/\.(?:ts|tsx)$/.test(value)) return false;
  if (/\.(?:test|spec)\.[^.]+$/.test(value)) return false;
  if (value.startsWith("app/api/") || value.startsWith("src/components/admin/") || value.startsWith("app/admin/")) return false;
  if (LEGAL_PAGES.has(value)) return false;
  return value.startsWith("src/components/") || value.startsWith("app/");
}

function visiblePieces(expression) {
  if (!expression) return [];
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression];
  if (ts.isTemplateExpression(expression)) return [expression.head, ...expression.templateSpans.map((span) => span.literal)];
  if (ts.isConditionalExpression(expression)) return [...visiblePieces(expression.whenTrue), ...visiblePieces(expression.whenFalse)];
  if (ts.isParenthesizedExpression(expression)) return visiblePieces(expression.expression);
  return [];
}

export function findViolationsInSource(source, file) {
  const relativeFile = normalized(file);
  if (!shouldScanCustomerFile(relativeFile)) return [];
  const sourceFile = ts.createSourceFile(relativeFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pieces = [];
  function visit(node) {
    if (ts.isJsxText(node) && node.getText(sourceFile).trim()) pieces.push(node);
    if (ts.isJsxAttribute(node) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) pieces.push(node.initializer);
      if (ts.isJsxExpression(node.initializer)) pieces.push(...visiblePieces(node.initializer.expression));
    }
    if (ts.isJsxExpression(node)) pieces.push(...visiblePieces(node.expression));
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const seen = new Set();
  const violations = [];
  for (const piece of pieces) {
    const text = piece.getText(sourceFile).replace(/^['"`]|['"`]$/g, "");
    for (const banned of BANNED_TERMS) {
      if (!banned.pattern.test(text)) continue;
      const location = sourceFile.getLineAndCharacterOfPosition(piece.getStart(sourceFile));
      const key = `${banned.term}:${location.line}:${location.character}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({ file: relativeFile, line: location.line + 1, column: location.character + 1, term: banned.term, text: text.trim() });
    }
  }
  return violations;
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

export function findCustomerCopyViolations(rootDir = process.cwd()) {
  return ["src/components", "app"]
    .flatMap((directory) => filesUnder(path.join(rootDir, directory)))
    .map((file) => path.relative(rootDir, file))
    .filter(shouldScanCustomerFile)
    .flatMap((file) => findViolationsInSource(fs.readFileSync(path.join(rootDir, file), "utf8"), file));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const violations = findCustomerCopyViolations();
  if (violations.length) {
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line}:${violation.column} customer copy contains “${violation.term}”: ${violation.text}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Customer copy uses the approved plain-language vocabulary.");
  }
}
