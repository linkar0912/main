import { getSeoPages, seoCollections, seoPagePath, type SeoCollection, type SeoPage } from "@/src/content/seo";

/*
 * Which section variants a detail page uses, and in what order. Every page gets
 * its own mix, picked by a PRNG seeded from its path, so pages differ from each
 * other but never change between builds. Picks are balanced across each
 * collection, then nudged so neighbouring sections never share a surface.
 */

export type HeroVariant = "split" | "fullbleed" | "centered";
export type OverviewVariant = "pile" | "zigzag" | "statement";
export type StepsVariant = "canvas" | "timeline";
export type BenefitsVariant = "cards" | "sticky" | "zigzag" | "iconlist";
export type ExampleVariant = "phone" | "flow" | "thread";
export type NotesVariant = "split" | "statement";
export type ExtraVariant = "compare" | "channels" | "photo" | "checklist";
export type FaqVariant = "dark" | "columns";
export type RelatedVariant = "cards" | "rows";
export type CtaVariant = "plans" | "photo" | "banner";
export type SectionKey = "overview" | "steps" | "benefits" | "example" | "notes" | "faq" | "related" | "pager" | "cta" | `extra:${ExtraVariant}`;

export type DetailLayout = {
  hero: HeroVariant; overview: OverviewVariant; steps: StepsVariant; benefits: BenefitsVariant;
  example: ExampleVariant; notes: NotesVariant; extras: readonly ExtraVariant[]; faq: FaqVariant;
  related: RelatedVariant; cta: CtaVariant;
  /** Everything after the hero, in render order. */
  order: readonly SectionKey[];
};

export const layoutVariants = {
  hero: ["split", "fullbleed", "centered"],
  overview: ["pile", "zigzag", "statement"],
  steps: ["canvas", "timeline"],
  benefits: ["cards", "sticky", "zigzag", "iconlist"],
  example: ["phone", "flow", "thread"],
  notes: ["split", "statement"],
  extras: ["compare", "channels", "photo", "checklist"],
  faq: ["dark", "columns"],
  related: ["cards", "rows"],
  cta: ["plans", "photo", "banner"],
} as const satisfies Record<string, readonly string[]>;

export type LayoutRole = keyof typeof layoutVariants;

/**
 * The "photo" variants and surface keep their names, but only the hero carries
 * a photograph. The photo extra (the statement band) and the photo CTA are
 * full-width bands of Linkar UI drawn in code.
 */
export type SectionSurface = "canvas" | "band" | "color" | "accent" | "photo" | "ink";

type SurfaceRole = Exclude<LayoutRole, "hero">;

export const variantSurfaces: { [R in SurfaceRole]: Record<(typeof layoutVariants)[R][number], SectionSurface> } = {
  overview: { pile: "canvas", zigzag: "canvas", statement: "band" },
  steps: { canvas: "canvas", timeline: "band" },
  benefits: { cards: "band", sticky: "canvas", zigzag: "canvas", iconlist: "band" },
  example: { phone: "canvas", flow: "color", thread: "band" },
  notes: { split: "accent", statement: "color" },
  extras: { compare: "canvas", channels: "color", photo: "photo", checklist: "band" },
  faq: { dark: "ink", columns: "canvas" },
  related: { cards: "canvas", rows: "band" },
  cta: { plans: "color", photo: "photo", banner: "accent" },
};

/** Fixed ids: the on-page nav, the hero's secondary link and the tests rely on them. */
export const sectionIds: Record<SectionKey, string | null> = {
  overview: "overview",
  steps: "how-it-works",
  benefits: "benefits",
  example: "example",
  notes: "campaign-notes",
  faq: "questions",
  related: "related",
  pager: null,
  cta: null,
  "extra:compare": "compare",
  "extra:channels": "channels",
  "extra:photo": "statement",
  "extra:checklist": "checklist",
};

/** On-page nav entries. Extras, related, pager and the CTA stay out of the nav. */
export const sectionNav: Record<SectionKey, { id: string; label: string } | null> = {
  overview: { id: "overview", label: "Overview" },
  steps: { id: "how-it-works", label: "How it works" },
  benefits: { id: "benefits", label: "Benefits" },
  example: { id: "example", label: "Example" },
  notes: { id: "campaign-notes", label: "Campaign notes" },
  faq: { id: "questions", label: "Questions" },
  related: null,
  pager: null,
  cta: null,
  "extra:compare": null,
  "extra:channels": null,
  "extra:photo": null,
  "extra:checklist": null,
};

export function pageNavItems(layout: DetailLayout): readonly { id: string; label: string }[] {
  return layout.order.flatMap((key) => {
    const item = sectionNav[key];
    return item ? [item] : [];
  });
}

export function sectionSurface(layout: DetailLayout, key: SectionKey): SectionSurface {
  if (key === "pager") return "canvas";
  if (key.startsWith("extra:")) return variantSurfaces.extras[key.slice(6) as ExtraVariant];
  const role = key as Exclude<SectionKey, "pager" | `extra:${ExtraVariant}`>;
  return (variantSurfaces[role] as Record<string, SectionSurface>)[layout[role]];
}

/* Seeding: FNV-1a over the page path feeds mulberry32. No Math.random anywhere. */

export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PageRef = Pick<SeoPage, "collection" | "slug">;

/** A stable coin flip for small per-page choices inside a variant (which side a visual sits on). */
export function pageCoin(page: PageRef, purpose: string): boolean {
  return mulberry32(fnv1a(`${page.collection}/${page.slug}:${purpose}`))() < .5;
}

const rankedRoles = ["hero", "overview", "steps", "benefits", "example", "notes", "extras", "faq", "related", "cta"] as const satisfies readonly LayoutRole[];
type RankedRole = (typeof rankedRoles)[number];

type Draws = { rank: Record<RankedRole, number>; twoExtras: boolean; secondExtra: number; gaps: number; benefitsFirst: boolean; headFlip: boolean; tailFlip: boolean; photoFlip: boolean };

function drawsFor(page: PageRef, salt: number): Draws {
  const next = mulberry32(fnv1a(salt === 0 ? `${page.collection}/${page.slug}` : `${page.collection}/${page.slug}#${salt}`));
  const rank = {} as Record<RankedRole, number>;
  for (const role of rankedRoles) rank[role] = next();
  return { rank, twoExtras: next() >= .5, secondExtra: next(), gaps: next(), benefitsFirst: next() < .5, headFlip: next() < .5, tailFlip: next() < .5, photoFlip: next() < .5 };
}

/** Rank pages by their draw for each role and deal the variants out in turn: every variant gets an even share. */
function dealVariants(pages: readonly SeoPage[], draws: ReadonlyMap<string, Draws>): Map<string, Record<RankedRole, number>> {
  const dealt = new Map<string, Record<RankedRole, number>>(pages.map((page) => [page.slug, {} as Record<RankedRole, number>]));
  for (const role of rankedRoles) {
    const count = layoutVariants[role].length;
    const ranked = [...pages].sort((a, b) => draws.get(a.slug)!.rank[role] - draws.get(b.slug)!.rank[role] || a.slug.localeCompare(b.slug));
    ranked.forEach((page, position) => { dealt.get(page.slug)![role] = position % count; });
  }
  return dealt;
}

type SectionRole = Exclude<SurfaceRole, "extras">;

type Slot =
  | { kind: "role"; role: SectionRole; start: number }
  | { kind: "extra"; start: number }
  | { kind: "pager" };

function rotation<T>(list: readonly T[], start: number): T[] {
  return list.map((_, index) => list[(start + index) % list.length]);
}

function surfaceAllowed(surfaces: readonly SectionSurface[], next: SectionSurface): boolean {
  const last = surfaces[surfaces.length - 1];
  if (last === undefined) return true;
  if (next !== "canvas") return next !== last;
  return !(last === "canvas" && surfaces[surfaces.length - 2] === "canvas");
}

/** Dark or saturated surfaces. Light canvas and band sections are the rests between them. */
export const heavySurfaces: ReadonlySet<SectionSurface> = new Set<SectionSurface>(["photo", "accent", "ink", "color"]);

/** Never more than this many heavy surfaces in a row, counting a full-bleed hero photo. */
export const MAX_HEAVY_RUN = 2;

/**
 * Heavy pacing: a page never runs three dark or saturated surfaces in a row
 * (a full-width photo band, then the accent notes, then the ink FAQ reads as
 * one long dark block), so a light section always breaks the run.
 */
function pacingAllowed(surfaces: readonly SectionSurface[], next: SectionSurface, rules: PhotoRules): boolean {
  if (!heavySurfaces.has(next)) return true;
  const seen: readonly SectionSurface[] = [rules.hero === "fullbleed" ? "photo" : "canvas", ...surfaces];
  const run = seen.slice(-MAX_HEAVY_RUN);
  return !(run.length === MAX_HEAVY_RUN && run.every((surface) => heavySurfaces.has(surface)));
}

/**
 * Photo pacing: besides the hero, a page carries at most one full-width photo
 * band (the photo extra or the photo CTA, never both; both are drawn in code),
 * and a full-bleed hero photo is never followed straight away by such a band.
 */
type PhotoRules = { hero: HeroVariant; extrasMayUsePhoto: boolean };

function photoAllowed(surfaces: readonly SectionSurface[], next: SectionSurface, slot: Slot, rules: PhotoRules): boolean {
  if (next !== "photo") return true;
  if (surfaces.includes("photo")) return false;
  if (slot.kind === "extra" && !rules.extrasMayUsePhoto) return false;
  return !(surfaces.length === 0 && rules.hero === "fullbleed");
}

/** Depth-first: keep each seeded pick where possible, else try the next variant in the role list. */
function solve(slots: readonly Slot[], rules: PhotoRules): string[] | null {
  const picks: string[] = [];
  const surfaces: SectionSurface[] = [];
  const visit = (index: number): boolean => {
    if (index === slots.length) return true;
    const slot = slots[index];
    const candidates = slot.kind === "pager" ? ["pager"]
      : slot.kind === "extra" ? rotation(layoutVariants.extras, slot.start)
      : rotation<string>(layoutVariants[slot.role], slot.start);
    for (const candidate of candidates) {
      if (slot.kind === "extra" && picks.some((pick, at) => slots[at].kind === "extra" && pick === candidate)) continue;
      const surface: SectionSurface = slot.kind === "pager" ? "canvas"
        : slot.kind === "extra" ? variantSurfaces.extras[candidate as ExtraVariant]
        : (variantSurfaces[slot.role] as Record<string, SectionSurface>)[candidate];
      if (!surfaceAllowed(surfaces, surface) || !photoAllowed(surfaces, surface, slot, rules) || !pacingAllowed(surfaces, surface, rules)) continue;
      picks.push(candidate);
      surfaces.push(surface);
      if (visit(index + 1)) return true;
      picks.pop();
      surfaces.pop();
    }
    return false;
  };
  return visit(0) ? picks : null;
}

const gapPairs = [[0, 1], [0, 2], [1, 2]] as const;

const variantIndex = <R extends RankedRole>(role: R, variant: (typeof layoutVariants)[R][number]) => (layoutVariants[role] as readonly string[]).indexOf(variant);

/**
 * The two fixed pairs that can clash (statement overview over a timeline, a
 * column FAQ over card related guides and the pager) would always resolve by
 * moving the later section. A coin decides which side moves instead, so both
 * variants keep a fair share.
 */
function settlePairs(dealt: Record<RankedRole, number>, draw: Draws): Record<RankedRole, number> {
  const settled = { ...dealt };
  if (settled.overview === variantIndex("overview", "statement") && settled.steps === variantIndex("steps", "timeline")) {
    if (draw.headFlip) settled.overview = variantIndex("overview", "pile");
    else settled.steps = variantIndex("steps", "canvas");
  }
  if (settled.faq === variantIndex("faq", "columns") && settled.related === variantIndex("related", "cards")) {
    if (draw.tailFlip) settled.faq = variantIndex("faq", "dark");
    else settled.related = variantIndex("related", "rows");
  }
  return settled;
}

function layoutFor(dealtPicks: Record<RankedRole, number>, draw: Draws): DetailLayout | null {
  const dealt = settlePairs(dealtPicks, draw);
  const extrasStart = dealt.extras;
  const secondStart = rotation([0, 1, 2, 3].filter((index) => index !== extrasStart), Math.floor(draw.secondExtra * 3))[0];
  const extraStarts = draw.twoExtras ? [extrasStart, secondStart] : [extrasStart];
  const gaps: readonly number[] = draw.twoExtras ? gapPairs[Math.floor(draw.gaps * 3)] : [Math.floor(draw.gaps * 3)];
  const pair: SectionRole[] = draw.benefitsFirst ? ["benefits", "example"] : ["example", "benefits"];
  const middle: Slot[] = [];
  for (let gap = 0; gap <= 2; gap += 1) {
    const extraIndex = gaps.indexOf(gap);
    if (extraIndex >= 0) middle.push({ kind: "extra", start: extraStarts[extraIndex] });
    if (gap < 2) middle.push({ kind: "role", role: pair[gap], start: dealt[pair[gap]] });
  }
  const role = (name: SectionRole): Slot => ({ kind: "role", role: name, start: dealt[name] });
  const slots: Slot[] = [role("overview"), role("steps"), ...middle, role("notes"), role("faq"), role("related"), { kind: "pager" }, role("cta")];
  // When the CTA is dealt the photo band, a coin decides which section keeps it,
  // so the photo extra and the photo CTA both keep a fair share.
  const hero = layoutVariants.hero[dealt.hero];
  const extrasMayUsePhoto = !(dealt.cta === variantIndex("cta", "photo") && draw.photoFlip);
  const picks = solve(slots, { hero, extrasMayUsePhoto });
  if (!picks) return null;
  const chosen: Partial<Record<SectionRole, string>> = {};
  const extras: ExtraVariant[] = [];
  const order = slots.map((slot, index): SectionKey => {
    if (slot.kind === "pager") return "pager";
    if (slot.kind === "extra") {
      extras.push(picks[index] as ExtraVariant);
      return `extra:${picks[index] as ExtraVariant}`;
    }
    chosen[slot.role] = picks[index];
    return slot.role;
  });
  return {
    hero,
    overview: chosen.overview as OverviewVariant,
    steps: chosen.steps as StepsVariant,
    benefits: chosen.benefits as BenefitsVariant,
    example: chosen.example as ExampleVariant,
    notes: chosen.notes as NotesVariant,
    extras,
    faq: chosen.faq as FaqVariant,
    related: chosen.related as RelatedVariant,
    cta: chosen.cta as CtaVariant,
    order,
  };
}

/** How many pages use each variant of each role (extras count pages that include them). */
export function variantDistribution(layouts: Iterable<DetailLayout>): Record<LayoutRole, Record<string, number>> {
  const counts = Object.fromEntries(
    (Object.keys(layoutVariants) as LayoutRole[]).map((role) => [role, Object.fromEntries(layoutVariants[role].map((variant) => [variant, 0]))]),
  ) as Record<LayoutRole, Record<string, number>>;
  for (const layout of layouts) {
    for (const role of Object.keys(layoutVariants) as LayoutRole[]) {
      if (role === "extras") layout.extras.forEach((extra) => { counts.extras[extra] += 1; });
      else counts[role][layout[role]] += 1;
    }
  }
  return counts;
}

/** Every variant of every role must appear on at least this many pages of a collection. */
export const MIN_PAGES_PER_VARIANT = 2;

function spreadHolds(layouts: Iterable<DetailLayout>): boolean {
  return Object.values(variantDistribution(layouts)).every((counts) => Object.values(counts).every((count) => count >= MIN_PAGES_PER_VARIANT));
}

/**
 * Layouts for a set of pages from one collection, keyed by slug. Pure: the same
 * pages always give the same layouts. If the nudged picks starve a variant, the
 * whole collection is re-dealt with the next salt.
 */
export function buildDetailLayouts(pages: readonly SeoPage[]): ReadonlyMap<string, DetailLayout> {
  let fallback: Map<string, DetailLayout> | null = null;
  for (let salt = 0; salt < 64; salt += 1) {
    const draws = new Map(pages.map((page) => [page.slug, drawsFor(page, salt)]));
    const dealt = dealVariants(pages, draws);
    const layouts = new Map<string, DetailLayout>();
    for (const page of pages) {
      const layout = layoutFor(dealt.get(page.slug)!, draws.get(page.slug)!);
      if (!layout) break;
      layouts.set(page.slug, layout);
    }
    if (layouts.size !== pages.length) continue;
    fallback ??= layouts;
    if (pages.length < 8 || spreadHolds(layouts.values())) return layouts;
  }
  if (fallback) return fallback;
  throw new Error("No valid section layout for these pages");
}

const collectionLayouts = new Map<SeoCollection, ReadonlyMap<string, DetailLayout>>();

export function detailLayout(page: SeoPage): DetailLayout {
  let layouts = collectionLayouts.get(page.collection);
  if (!layouts) {
    layouts = buildDetailLayouts(getSeoPages(page.collection));
    collectionLayouts.set(page.collection, layouts);
  }
  return layouts.get(page.slug) ?? buildDetailLayouts([page]).get(page.slug)!;
}

/* Navigation data for heroes and the pager. */

export type SeoCrumb = { label: string; href: string; current: boolean };

/** Home / Collection / Page. The last crumb is the current page. */
export function seoBreadcrumbs(target: { collection: SeoCollection } | SeoPage): readonly SeoCrumb[] {
  const hub = seoCollections[target.collection];
  const crumbs: SeoCrumb[] = [
    { label: "Home", href: "/", current: false },
    { label: hub.label, href: `/${target.collection}`, current: !("slug" in target) },
  ];
  if ("slug" in target) crumbs.push({ label: target.label, href: seoPagePath(target), current: true });
  return crumbs;
}

export type SeoPagerData = { previous: SeoPage; next: SeoPage; position: number; total: number };

/** Previous and next guide in the collection's own order, wrapping at both ends. */
export function seoPager(page: SeoPage): SeoPagerData {
  const pages = getSeoPages(page.collection);
  const index = Math.max(0, pages.findIndex((candidate) => candidate.slug === page.slug));
  return {
    previous: pages[(index - 1 + pages.length) % pages.length],
    next: pages[(index + 1) % pages.length],
    position: index + 1,
    total: pages.length,
  };
}
