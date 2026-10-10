"use client";

import { useState } from "react";

import { Reveal } from "./reveal";
import styles from "./pricing-page.module.css";

export type PricingFaqItem = { id: string; question: string; answer: string };

/** One billing question open at a time. Closed answers are hidden from the
 *  accessibility tree and from find-in-page, not just collapsed visually. */
export function PricingFaq({ items }: { items: readonly PricingFaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className={styles.faq} aria-labelledby="pricing-faq-title">
      <Reveal className={styles.faqGrid}>
        <div className={styles.faqLead}>
          <p className={styles.sectionEyebrow}>Billing questions</p>
          <h2 id="pricing-faq-title">Before you pay for anything</h2>
        </div>
        <div className={styles.faqList}>
          {items.map((item) => {
            const isOpen = openId === item.id;
            const panelId = `pricing-faq-panel-${item.id}`;
            const triggerId = `pricing-faq-trigger-${item.id}`;
            return (
              <div className={styles.faqItem} key={item.id} data-open={isOpen || undefined}>
                <h3>
                  <button
                    className={styles.faqTrigger}
                    type="button"
                    id={triggerId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                  >
                    <span>{item.question}</span>
                    <span className={styles.faqMark} aria-hidden="true" />
                  </button>
                </h3>
                <div className={styles.faqPanel} id={panelId} role="region" aria-labelledby={triggerId} data-open={isOpen || undefined}>
                  <div className={styles.faqPanelInner} aria-hidden={!isOpen}>
                    <p>{item.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
