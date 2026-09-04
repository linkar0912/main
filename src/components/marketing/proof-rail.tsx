import type { CSSProperties } from "react";
import Image from "next/image";
import styles from "./proof-rail.module.css";

const creatorExamples = [
  {
    name: "Aanya Mehta",
    role: "Beauty creator",
    location: "Bengaluru",
    image: "/marketing/linkar-creator-aanya.webp",
    alt: "Aanya Mehta at a Bengaluru cafe",
    tint: "#fff100",
    quote: "One thoughtful reply turns a passing comment into a real conversation.",
  },
  {
    name: "Arjun Nair",
    role: "Growth marketer",
    location: "Mumbai",
    image: "/marketing/linkar-creator-arjun.webp",
    alt: "Arjun Nair on a Mumbai terrace",
    tint: "#fa0cf7",
    quote: "The right follow-up is already waiting when I open my inbox.",
  },
] as const;

function CreatorCard({
  creator,
  duplicate = false,
}: {
  creator: (typeof creatorExamples)[number];
  duplicate?: boolean;
}) {
  return (
    <article
      className={styles.example}
      aria-label={`${creator.name}, ${creator.role.toLowerCase()}`}
      data-proof-card={!duplicate || undefined}
    >
      <div
        className={styles.portraitFrame}
        data-proof-portrait
        style={{ "--proof-tint": creator.tint } as CSSProperties}
      >
        <Image
          className={styles.portrait}
          src={creator.image}
          alt={creator.alt}
          width={136}
          height={136}
          sizes="68px"
        />
      </div>
      <div className={styles.body}>
        <div className={styles.identity}>
          <h3 className={styles.name}>{creator.name}</h3>
          <p className={styles.meta}>{creator.role} · {creator.location}</p>
        </div>
        <blockquote>“{creator.quote}”</blockquote>
        <p className={styles.exampleFooter}>
          Creator workflow <span aria-hidden="true">→</span>
        </p>
      </div>
    </article>
  );
}

function CreatorSet({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div
      className={styles.trackSegment}
      data-proof-duplicate={duplicate || undefined}
      aria-hidden={duplicate || undefined}
    >
      {creatorExamples.map((creator) => (
        <CreatorCard key={creator.name} creator={creator} duplicate={duplicate} />
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
          <h2>Made for creators, marketers &amp; brands.</h2>
        </div>

        <div
          className={styles.ticker}
          data-proof-ticker
          data-ticker="continuous"
          data-pause-on-hover="true"
          data-pause-on-focus="true"
        >
          <div className={styles.track} data-proof-track>
            <CreatorSet />
            <CreatorSet duplicate />
          </div>
        </div>
      </div>
    </section>
  );
}
