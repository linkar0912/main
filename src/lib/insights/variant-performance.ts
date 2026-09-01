import type { VariantPerformance } from "@/src/lib/repository";

/**
 * Aggregates A/B opening-variant performance from grouped participant counts.
 *
 * `variantLabel` is nullable: participants created before a campaign had an
 * opening variant carry NULL, and Postgres groups NULL separately from 'A'.
 * The Prisma repository used to normalize `null -> "A"` only when mapping the
 * grouped rows, which meant a campaign with both shapes reported *two* rows
 * both titled "Variant A", and the delivered/clicked lookup - a Map keyed by
 * the same normalized label - silently kept whichever group came last, so both
 * rows displayed one group's numbers. It also faked a second variant, which
 * made the A/B panel appear for campaigns running no test at all.
 *
 * Normalizing before aggregating is what keeps those cases correct, so this
 * lives apart from the query and is tested directly.
 */
export const DEFAULT_VARIANT = "A";

export type VariantGroupCount = {
  variantLabel: string | null;
  count: number;
};

function sumByVariant(rows: VariantGroupCount[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const variant = row.variantLabel ?? DEFAULT_VARIANT;
    totals.set(variant, (totals.get(variant) ?? 0) + row.count);
  }
  return totals;
}

export function tallyVariantPerformance(input: {
  participants: VariantGroupCount[];
  delivered: VariantGroupCount[];
  clicked: VariantGroupCount[];
}): VariantPerformance[] {
  const delivered = sumByVariant(input.delivered);
  const clicked = sumByVariant(input.clicked);
  // Participants are the source of truth for which variants exist: delivered
  // and clicked are filtered subsets of the same rows, so a variant appearing
  // only there would be a counting error, not a real variant.
  return [...sumByVariant(input.participants).entries()]
    .map(([variant, participants]) => ({
      variant,
      participants,
      delivered: delivered.get(variant) ?? 0,
      clicked: clicked.get(variant) ?? 0,
    }))
    .sort((a, b) => a.variant.localeCompare(b.variant));
}
