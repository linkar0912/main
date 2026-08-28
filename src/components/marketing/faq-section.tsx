"use client";

import { useState } from "react";
import { faqItems } from "./marketing-content";
import styles from "./faq-section.module.css";

export function FaqSection() {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string) => {
    setOpenItems((items) => ({ ...items, [id]: !items[id] }));
  };

  return (
    <section id="faq" className={styles.section} aria-labelledby="faq-title" data-reduced-motion-state="immediate">
      <div className={styles.frame}>
        <h2 id="faq-title">Good questions before you switch anything on.</h2>
        <div className={styles.questions}>
          {faqItems.map((item, index) => {
            const itemNumber = index + 1;
            const triggerId = `faq-trigger-${itemNumber}`;
            const panelId = `faq-panel-${itemNumber}`;
            const isOpen = openItems[item.id] === true;

            return (
              <section className={styles.question} key={item.id}>
                <h3>
                  <button
                    className={styles.trigger}
                    type="button"
                    id={triggerId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleItem(item.id)}
                  >
                    <span>{item.question}</span>
                    <span className={styles.mark} aria-hidden="true" />
                  </button>
                </h3>
                <div
                  id={panelId}
                  className={styles.panel}
                  role="region"
                  aria-labelledby={triggerId}
                  aria-hidden={!isOpen}
                  data-open={isOpen}
                >
                  <div className={styles.panelInner}>
                    <p>{item.answer}</p>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
