import { describe, expect, it } from "vitest";

import { tallyVariantPerformance } from "./variant-performance";

describe("tallyVariantPerformance", () => {
  it("merges the unlabelled group into A instead of reporting it twice", () => {
    // Postgres groups NULL and 'A' separately, so a campaign that predates
    // variant labelling reports both. Collapsing them only at render time
    // produced two rows both titled "Variant A".
    const result = tallyVariantPerformance({
      participants: [{ variantLabel: null, count: 122 }, { variantLabel: "A", count: 79 }],
      delivered: [{ variantLabel: null, count: 50 }, { variantLabel: "A", count: 50 }],
      clicked: [{ variantLabel: null, count: 22 }, { variantLabel: "A", count: 22 }],
    });

    expect(result).toEqual([{ variant: "A", participants: 201, delivered: 100, clicked: 44 }]);
  });

  it("keeps genuinely different variants apart and sorted", () => {
    const result = tallyVariantPerformance({
      participants: [{ variantLabel: "B", count: 79 }, { variantLabel: "A", count: 122 }],
      delivered: [{ variantLabel: "B", count: 33 }, { variantLabel: "A", count: 50 }],
      clicked: [{ variantLabel: "B", count: 11 }, { variantLabel: "A", count: 22 }],
    });

    expect(result).toEqual([
      { variant: "A", participants: 122, delivered: 50, clicked: 22 },
      { variant: "B", participants: 79, delivered: 33, clicked: 11 },
    ]);
  });

  it("does not let a delivered-only group invent participants", () => {
    // delivered/clicked are filtered subsets of participants, so a variant can
    // never appear there without appearing in the participant groups.
    const result = tallyVariantPerformance({
      participants: [{ variantLabel: "A", count: 5 }],
      delivered: [{ variantLabel: "A", count: 2 }, { variantLabel: "B", count: 9 }],
      clicked: [],
    });

    expect(result).toEqual([{ variant: "A", participants: 5, delivered: 2, clicked: 0 }]);
  });

  it("reports zeroes rather than dropping a variant with no delivery yet", () => {
    const result = tallyVariantPerformance({
      participants: [{ variantLabel: "A", count: 4 }, { variantLabel: "B", count: 6 }],
      delivered: [{ variantLabel: "A", count: 4 }],
      clicked: [],
    });

    expect(result).toEqual([
      { variant: "A", participants: 4, delivered: 4, clicked: 0 },
      { variant: "B", participants: 6, delivered: 0, clicked: 0 },
    ]);
  });

  it("returns nothing for an automation with no participants", () => {
    expect(tallyVariantPerformance({ participants: [], delivered: [], clicked: [] })).toEqual([]);
  });
});
