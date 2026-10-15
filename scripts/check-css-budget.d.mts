export type CssBudget = { route: string; html: string; maxGzipBytes: number };

export type CssBudgetFile = { href: string; rawBytes: number; gzipBytes: number };

export type CssBudgetResult = {
  route: string;
  maxGzipBytes: number;
  missing?: string;
  files: CssBudgetFile[];
  rawBytes: number;
  gzipBytes: number;
  catalogueModules: string[];
  overBudget: boolean;
};

export declare const CSS_BUDGETS: CssBudget[];

export function renderBlockingStyles(html: string): { hrefs: string[]; inline: string[] };

export function resolveBuildAsset(distDir: string, href: string): string | null;

export function gzipSize(text: string): number;

export function catalogueModulePrefixes(root?: string): string[];

export function findCatalogueModules(css: string, prefixes: string[]): string[];

export function measureCssBudgets(distDir: string, options?: { budgets?: CssBudget[]; root?: string }): CssBudgetResult[];
