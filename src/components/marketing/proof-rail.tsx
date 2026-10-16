import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProofTicker } from "./proof-ticker";
import styles from "./proof-rail.module.css";

/*
 * Illustrative use cases, not testimonials. Each card is a kind of account and
 * one thing Linkar can do for it, so there are no personal names, no quotation
 * marks and no blockquote, and the alt text describes the scene without naming
 * anyone. Names and quotes may return only for real Linkar users who have given
 * written consent to appear here.
 */
const useCaseExamples = [
  {
    id: "beauty-creator",
    who: "Beauty creator in Bengaluru",
    useCase: "Sends the shade guide when someone comments SHADE.",
    workflow: "Comment to DM workflow",
    href: "/features/instagram-comment-to-dm",
    image: "/marketing/linkar-example-beauty-creator.webp",
    alt: "A smiling woman in a linen shirt at a cafe table",
    tint: "#fff100",
  },
  {
    id: "growth-marketer",
    who: "Growth marketer in Mumbai",
    useCase: "Asks each new lead one question, then sends the follow-up that fits.",
    workflow: "Lead qualification workflow",
    href: "/features/instagram-lead-qualification",
    image: "/marketing/linkar-example-growth-marketer.webp",
    alt: "A man in a dark shirt on a rooftop terrace at dusk",
    tint: "#fa0cf7",
  },
] as const;

function UseCaseCard({
  example,
  duplicate = false,
}: {
  example: (typeof useCaseExamples)[number];
  duplicate?: boolean;
}) {
  // The marquee repeats every card once so the strip can loop. The copy is
  // hidden from assistive technology and must not add a second set of
  // headings, a second article or a second focusable link, so it is a plain
  // div with a paragraph where the original has its heading, and its footer
  // is text drawn exactly like the original's link so the loop stays seamless.
  const Card = duplicate ? "div" : "article";
  const Title = duplicate ? "p" : "h3";
  const titleId = duplicate ? undefined : `proof-${example.id}-title`;
  const footer = (
    <>
      {example.workflow} <span aria-hidden="true">→</span>
    </>
  );

  return (
    <Card
      className={styles.example}
      aria-labelledby={titleId}
      data-proof-card={!duplicate || undefined}
    >
      <div
        className={styles.portraitFrame}
        data-proof-portrait
        style={{ "--proof-tint": example.tint } as CSSProperties}
      >
        <Image
          className={styles.portrait}
          src={example.image}
          alt={duplicate ? "" : example.alt}
          width={68}
          height={68}
        />
      </div>
      <div className={styles.body}>
        <div className={styles.identity}>
          <p className={styles.tag}>Example</p>
          <Title className={styles.who} id={titleId}>{example.who}</Title>
        </div>
        <p className={styles.useCase}>{example.useCase}</p>
        <p className={styles.exampleFooter}>
          {duplicate ? (
            <span className={styles.footerLink}>{footer}</span>
          ) : (
            <Link className={styles.footerLink} href={example.href}>{footer}</Link>
          )}
        </p>
      </div>
    </Card>
  );
}

function UseCaseSet({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div
      className={styles.trackSegment}
      data-proof-duplicate={duplicate || undefined}
      aria-hidden={duplicate || undefined}
    >
      {useCaseExamples.map((example) => (
        <UseCaseCard key={example.id} example={example} duplicate={duplicate} />
      ))}
    </div>
  );
}

export function ProofRail() {
  return (
    <section
      id="proof"
      className={styles.section}
      aria-label="Creator conversation examples"
      data-proof-layout="compact"
      data-brand-palette="linkar"
      data-strip="creator-marquee"
    >
      <div className={styles.inner}>
        <div className={styles.statement} data-proof-statement>
          <h2>Instagram automation for creators, marketers &amp; brands.</h2>
        </div>

        <ProofTicker>
          <div className={styles.track} data-proof-track>
            <UseCaseSet />
            <UseCaseSet duplicate />
          </div>
        </ProofTicker>
      </div>
    </section>
  );
}
