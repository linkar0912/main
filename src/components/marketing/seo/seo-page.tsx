import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { getSeoPages, seoCollections, seoTopics, type SeoCollection, type SeoPage, type SeoTopic } from "@/src/content/seo";
import { seoCollectionStructuredData, seoStructuredData } from "@/src/lib/seo-pages";
import { MarketingFooter } from "../marketing-footer";
import { MarketingHeader } from "../marketing-header";
import pageStyles from "../marketing-page.module.css";
import { Icon, MockLinkButton, MockOption, MockPanel, MockStatus, MockToggleRow } from "./mock-ui";
import { benefitsVariants } from "./sections/benefits";
import { CtaPlans, ctaVariants } from "./sections/cta";
import { exampleVariants } from "./sections/example";
import { extraVariants } from "./sections/extras";
import { faqVariants } from "./sections/faq";
import { heroVariants, SeoHubHero } from "./sections/hero";
import { notesVariants } from "./sections/notes";
import { overviewVariants } from "./sections/overview";
import { SeoPager } from "./sections/pager";
import { relatedVariants, SeoHubGroups } from "./sections/related";
import { StepTimeline, stepsVariants } from "./sections/steps";
import { detailLayout, pageNavItems, type DetailLayout, type ExtraVariant, type SectionKey } from "./seo-layout";
import { HashLink } from "./hash-link";
import inline from "./inline-link.module.css";
import { SeoHubFilter, SeoPageNav } from "./seo-page-nav";
import styles from "./seo-page.module.css";
import shell from "./seo-section.module.css";
import { collectionAccents, collectionAccentStyle, finalCtaTone, topicAccentStyle, topicShortLabels, topicVisuals } from "./seo-theme";

/** The accent vars sit on <main>, so every section can read var(--seo-accent). */
function SeoShell({ children, className, style }: { children: ReactNode; className?: string; style: CSSProperties }) {
  return (
    <div className={`${pageStyles.root} marketing-page-root`}>
      <HashLink className={styles.skip} href="#main-content">Skip to content</HashLink>
      <MarketingHeader />
      <main id="main-content" className={[pageStyles.page, shell.palette, className].filter(Boolean).join(" ")} style={style}>{children}</main>
      <MarketingFooter compact />
    </div>
  );
}

function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** One section of a detail page, from the variant its layout picked. */
function DetailSection({ sectionKey, layout, page }: { sectionKey: SectionKey; layout: DetailLayout; page: SeoPage }) {
  switch (sectionKey) {
    case "overview": { const Section = overviewVariants[layout.overview]; return <Section page={page} />; }
    case "steps": { const Section = stepsVariants[layout.steps]; return <Section page={page} />; }
    case "benefits": { const Section = benefitsVariants[layout.benefits]; return <Section page={page} />; }
    case "example": { const Section = exampleVariants[layout.example]; return <Section page={page} />; }
    case "notes": { const Section = notesVariants[layout.notes]; return <Section page={page} />; }
    case "faq": { const Section = faqVariants[layout.faq]; return <Section page={page} />; }
    case "related": { const Section = relatedVariants[layout.related]; return <Section page={page} />; }
    case "pager": return <SeoPager page={page} />;
    case "cta": { const Section = ctaVariants[layout.cta]; return <Section page={page} tone={finalCtaTone(topicVisuals[page.topic].accent)} />; }
    default: { const Section = extraVariants[sectionKey.slice("extra:".length) as ExtraVariant]; return <Section page={page} />; }
  }
}

export function SeoLandingPage({ page }: { page: SeoPage }) {
  const layout = detailLayout(page);
  const Hero = heroVariants[layout.hero];
  return (
    <SeoShell className={styles.detailMain} style={topicAccentStyle(page.topic)}>
      <JsonLd data={seoStructuredData(page)} />
      <Hero page={page} />
      <SeoPageNav items={pageNavItems(layout)} recipeHref={page.collection === "templates" ? `/templates/${page.slug}/recipe` : null} />
      {layout.order.map((key) => <DetailSection key={key} sectionKey={key} layout={layout} page={page} />)}
    </SeoShell>
  );
}

const collectionOrder: readonly SeoCollection[] = ["features", "solutions", "templates"];
/** Phone labels for the collection tabs, so no tab wraps. */
const tabShortLabels: Record<SeoCollection, string> = { features: "Features", solutions: "Solutions", templates: "Recipes" };

/** Collection tabs and topic anchors. The client component adds the scrollspy and the stuck state. */
function HubFilterBar({ collection, topics }: { collection: SeoCollection; topics: readonly SeoTopic[] }) {
  return (
    <SeoHubFilter
      tabs={collectionOrder.map((key) => ({ href: `/${key}`, label: seoCollections[key].label, short: tabShortLabels[key], current: key === collection }))}
      topics={topics.map((topic) => ({ id: topic, label: topicShortLabels[topic], accent: topicVisuals[topic].accent }))}
    />
  );
}

/**
 * One factual sentence per hub that closes its intro with a link to the
 * homepage, which owns "Instagram automation". The anchor is the head term
 * itself, so the catalogue supports the homepage instead of competing with it.
 */
const homeLinkSentences: Record<SeoCollection, ReactNode> = {
  features: <>Together, these features make up Linkar’s <Link className={inline.link} href="/">Instagram automation</Link>, plus public comment replies for Facebook Pages.</>,
  solutions: <>Each guide applies Linkar’s <Link className={inline.link} href="/">Instagram automation</Link> to the requests one kind of business receives.</>,
  templates: <>You can build every recipe with Linkar’s <Link className={inline.link} href="/">Instagram automation</Link> or its Facebook Page comment replies.</>,
};

/** "The first two sentences" lead in a larger size; the rest of the hub intro follows. */
function splitIntro(text: string): readonly [lead: string, rest: string] {
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g) ?? [text];
  return [sentences.slice(0, 2).join("").trim(), sentences.slice(2).join("").trim()];
}

function Check({ children }: { children: ReactNode }) {
  return <span className={styles.check}><span className={styles.checkIcon}><Icon name="check" size={13} /></span>{children}</span>;
}

/** Real setup UIs for the three planning notes of each hub. The last one is the same live check everywhere. */
function guidanceVisuals(collection: SeoCollection): readonly ReactNode[] {
  const live = (
    <div key="live" className={styles.guidanceStack}>
      <MockToggleRow label="Automation live" />
      <Check>Destination tested</Check>
      <MockStatus className={styles.guidanceStatus}>Tested and live</MockStatus>
    </div>
  );
  if (collection === "solutions") {
    return [
      <MockPanel key="question" title="Your most repeated question">
        <MockOption label="Where can I see your prices?" selected />
        <MockOption label="Is there a booking link?" />
      </MockPanel>,
      <div key="handoff" className={styles.guidanceStack}>
        <MockLinkButton>See available sessions</MockLinkButton>
        <Check>Confirmed in your booking tool</Check>
      </div>,
      live,
    ];
  }
  if (collection === "templates") {
    return [
      <MockPanel key="interaction" title="Choose the interaction">
        <MockOption label="Comment on a post" selected />
        <MockOption label="Incoming DM" />
        <MockOption label="Story reply" />
      </MockPanel>,
      <MockPanel key="destination" title="Your resource link">
        <MockLinkButton>Open the guide</MockLinkButton>
        <Check>Opens on a phone</Check>
      </MockPanel>,
      live,
    ];
  }
  return [
    <MockPanel key="interaction" title="Choose the interaction">
      <MockOption label="Comment on a post" selected />
      <MockOption label="Incoming DM" />
      <MockOption label="Story mention" />
    </MockPanel>,
    <div key="channels" className={styles.guidanceStack}>
      <MockToggleRow label="Instagram" />
      <MockToggleRow label="Facebook Page" />
    </div>,
    live,
  ];
}

export function SeoCollectionPage({ collection }: { collection: SeoCollection }) {
  const hub = seoCollections[collection];
  const pages = getSeoPages(collection);
  const topics = (Object.keys(seoTopics) as SeoTopic[]).filter((topic) => pages.some((page) => page.topic === topic));
  const [introLead, introRest] = splitIntro(hub.intro);
  const countLabel = collection === "templates" ? `${pages.length} workflow recipes` : `${pages.length} ${collection === "features" ? "feature" : "solution"} guides`;
  return (
    <SeoShell className={styles.hubMain} style={collectionAccentStyle(collection)}>
      <JsonLd data={seoCollectionStructuredData(collection)} />
      <SeoHubHero collection={collection} />
      {/* The filter bar sticks only while the guides are on screen. */}
      <div className={styles.hubBody}>
        <HubFilterBar collection={collection} topics={topics} />
        <section id="browse" className={styles.browse} aria-labelledby="choose-title">
          <div className={styles.browseHead}>
            <div>
              <p className={shell.monoPill}>{countLabel}</p>
              <h2 id="choose-title" className={shell.h2}>Choose a useful place to start.</h2>
            </div>
            <div className={styles.browseIntro}>
              <p className={styles.browseLead}>{introLead}</p>
              <p>{introRest ? `${introRest} ` : null}{homeLinkSentences[collection]}</p>
            </div>
          </div>
        </section>
        <SeoHubGroups collection={collection} />
      </div>
      <section className={`${shell.section} ${styles.guidance}`} id="planning" aria-labelledby="planning-title">
        <div className={`${shell.frame} ${styles.guidanceLayout}`}>
          <header className={styles.guidanceHead}>
            <p className={shell.monoPill}>Planning notes</p>
            <h2 id="planning-title" className={shell.h2}>Build a workflow you can maintain.</h2>
            <p className={shell.sub}>Three habits that keep a workflow accurate after it goes live.</p>
          </header>
          <StepTimeline items={hub.guidance} visuals={guidanceVisuals(collection)} />
        </div>
      </section>
      <CtaPlans tone={finalCtaTone(collectionAccents[collection])} />
    </SeoShell>
  );
}
