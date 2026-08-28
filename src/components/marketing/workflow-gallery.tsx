"use client";

import { useEffect, useRef, useState } from "react";
import { workflowItems, type WorkflowItem } from "./marketing-content";
import styles from "./workflow-gallery.module.css";

const panelId = "workflow-gallery-panel";

function workflowNodes(workflow: WorkflowItem) {
  return [workflow.event, ...workflow.reply.split(" → ")];
}

function BuilderPreview({ workflow }: { workflow: WorkflowItem }) {
  const nodes = workflowNodes(workflow);

  return (
    <figure className={styles.preview} aria-label={`${workflow.title} flow preview`} data-reduced-motion-state="visible">
      <div className={styles.builderFrame}>
        <div className={styles.builderChrome}>
          <span>Flow canvas</span>
          <span>Live logic</span>
        </div>
        <p className={styles.workflowTitle}>{workflow.title}</p>
        <div className={styles.canvas}>
          <svg className={styles.connectors} viewBox="0 0 560 220" fill="none" aria-hidden="true" preserveAspectRatio="none">
            {nodes.slice(1).map((node, index) => {
              const fromX = 30 + index * (500 / Math.max(nodes.length - 1, 1));
              const toX = 30 + (index + 1) * (500 / Math.max(nodes.length - 1, 1));
              return <path key={node} d={`M${fromX} 110 C${fromX + 56} 110 ${toX - 56} 110 ${toX} 110`} />;
            })}
          </svg>
          <ol className={styles.nodes} style={{ "--node-count": nodes.length } as React.CSSProperties}>
            {nodes.map((node, index) => (
              <li key={node} className={styles.node} data-node={index}>
                <span className={styles.port} aria-hidden="true" />
                <span>{node}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption>{workflow.body}</figcaption>
    </figure>
  );
}

export function WorkflowGallery() {
  const [activeId, setActiveId] = useState(workflowItems[0].id);
  const [leavingWorkflow, setLeavingWorkflow] = useState<WorkflowItem | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const accordionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeWorkflow = workflowItems.find((workflow) => workflow.id === activeId) ?? workflowItems[0];

  const selectWorkflow = (id: string, shouldFocus = false) => {
    if (id === activeId) return;
    const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setLeavingWorkflow(reducedMotion ? null : activeWorkflow);
    setActiveId(id);
    if (shouldFocus) tabRefs.current[id]?.focus();
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const moveFocusForViewport = () => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) return;
      if (mobileQuery.matches && focused.closest(`.${styles.desktopGallery}`)) {
        accordionRefs.current[activeId]?.focus();
      }
      if (!mobileQuery.matches && focused.closest(`.${styles.mobileAccordion}`)) {
        tabRefs.current[activeId]?.focus();
      }
    };
    mobileQuery.addEventListener("change", moveFocusForViewport);
    return () => mobileQuery.removeEventListener("change", moveFocusForViewport);
  }, [activeId]);

  const selectByKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (index + 1) % workflowItems.length;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = (index - 1 + workflowItems.length) % workflowItems.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = workflowItems.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    selectWorkflow(workflowItems[nextIndex].id, true);
  };

  return (
    <section
      id="workflows"
      className={styles.section}
      aria-labelledby="gallery-title"
      data-reduced-motion-state="visible"
    >
      <header className={styles.header}>
        <h2 id="gallery-title">Build the path your audience actually needs.</h2>
        <p>Start with a real moment, then decide what Linkar should remember, send, or hand back.</p>
      </header>

      <div className={styles.desktopGallery}>
        <div className={styles.tablist} role="tablist" aria-label="Workflow examples" aria-orientation="vertical">
          {workflowItems.map((workflow, index) => {
            const isActive = workflow.id === activeId;
            const tabId = `workflow-tab-${workflow.id}`;
            return (
              <button
                key={workflow.id}
                ref={(element) => { tabRefs.current[workflow.id] = element; }}
                id={tabId}
                className={styles.tab}
                type="button"
                role="tab"
                aria-label={workflow.label}
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectWorkflow(workflow.id)}
                onKeyDown={(event) => selectByKeyboard(event, index)}
              >
                <span>{workflow.label}</span>
                <small>{workflow.body}</small>
              </button>
            );
          })}
        </div>

        <div className={styles.stage}>
          {leavingWorkflow ? (
            <div
              className={`${styles.panel} ${styles.leavingPanel}`}
              aria-hidden="true"
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) setLeavingWorkflow(null);
              }}
            >
              <BuilderPreview workflow={leavingWorkflow} />
            </div>
          ) : null}
          <div
            key={activeWorkflow.id}
            id={panelId}
            className={styles.panel}
            role="tabpanel"
            aria-labelledby={`workflow-tab-${activeWorkflow.id}`}
          >
            <BuilderPreview workflow={activeWorkflow} />
          </div>
        </div>
      </div>

      <div className={styles.mobileAccordion} aria-label="Workflow examples on mobile">
        {workflowItems.map((workflow) => {
          const isActive = workflow.id === activeId;
          const contentId = `workflow-mobile-panel-${workflow.id}`;
          return (
            <section className={styles.accordionItem} key={workflow.id}>
              <h3>
                <button
                  className={styles.accordionTrigger}
                  type="button"
                  ref={(element) => { accordionRefs.current[workflow.id] = element; }}
                  aria-expanded={isActive}
                  aria-controls={contentId}
                  onClick={() => selectWorkflow(workflow.id)}
                >
                  <span>{workflow.label}</span>
                  <span aria-hidden="true" className={styles.accordionMark}>+</span>
                </button>
              </h3>
              <div id={contentId} className={styles.accordionPanel} hidden={!isActive}>
                <p>{workflow.body}</p>
                <BuilderPreview workflow={workflow} />
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
