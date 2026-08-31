"use client";

import { useEffect, useRef, useState } from "react";
import { workflowItems, type WorkflowItem } from "./marketing-content";
import styles from "./workflow-gallery.module.css";

function workflowNodes(workflow: WorkflowItem) {
  return [workflow.event, ...workflow.reply.split(" → ")];
}

/**
 * What kind of step this is, read off the step's own name. The builder types
 * every step, and the type is the useful part: it is what tells you a flow
 * waits, remembers, branches, or hands over - which four identical rows of
 * words never could. Position alone only ever identifies the trigger.
 */
type StepKind = "trigger" | "action" | "delay" | "memory" | "condition" | "handoff" | "queue";

function stepKind(label: string, index: number): StepKind {
  if (index === 0) return "trigger";
  const text = label.toLowerCase();
  if (text.startsWith("wait")) return "delay";
  if (text.startsWith("save")) return "memory";
  if (text.startsWith("branch")) return "condition";
  if (text.startsWith("pause")) return "handoff";
  if (text.includes("queue")) return "queue";
  return "action";
}

const stepIcons: Record<StepKind, string> = {
  trigger: "M13.2 3 6.4 13.4h4.3l-1.5 7.6 7.2-11h-4.7l1.5-7Z",
  action: "M21 4 3 10.6l6.6 2.3M21 4l-6.5 16-3.6-6.4M21 4 9.9 12.9",
  delay: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.4V12l3.3 2",
  memory: "M6.5 3.5h11a.6.6 0 0 1 .6.6v16.1l-6.1-4.4-6.1 4.4V4.1a.6.6 0 0 1 .6-.6Z",
  condition: "M7 4v7.5c0 2 1.6 3.5 3.5 3.5H18M18 15l-3.5-3.5M18 15l-3.5 3.5M7 4a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 7 4Z",
  handoff: "M9.5 5v14M14.5 5v14",
  queue: "M3.5 13.5h4l1.4 2.6h6.2l1.4-2.6h4M3.5 13.5 6.2 5h11.6l2.7 8.5v4a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2Z",
};

const stepLabels: Record<StepKind, string> = {
  trigger: "Trigger",
  action: "Action",
  delay: "Delay",
  memory: "Memory",
  condition: "Condition",
  handoff: "Handoff",
  queue: "Queue",
};

function StepIcon({ kind }: { kind: StepKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={stepIcons[kind]} />
    </svg>
  );
}

/**
 * A fragment of Linkar's automation builder. The builder is a typed step rail,
 * not a node-and-noodle canvas, so the preview is a step rail: numbered markers
 * down a connected spine, each step naming its kind and its setting. The
 * numbering is load-bearing here - a flow really does run top to bottom.
 */
function BuilderPreview({ workflow }: { workflow: WorkflowItem }) {
  const nodes = workflowNodes(workflow);

  return (
    <figure className={styles.preview} aria-label={`${workflow.title} flow preview`} data-reduced-motion-state="visible">
      <div className={styles.builderFrame}>
        <div className={styles.builderChrome}>
          <span>Flow canvas</span>
          <span className={styles.livePill}>
            <i aria-hidden="true" />
            Live logic
          </span>
        </div>
        <div className={styles.builderBody}>
          <p className={styles.workflowTitle}>{workflow.title}</p>
          <ol className={styles.steps}>
            {nodes.map((node, index) => {
              const kind = stepKind(node, index);
              return (
                <li key={node} className={styles.step} data-kind={kind}>
                  <span className={styles.stepRail} aria-hidden="true">
                    <span className={styles.stepMarker}>{String(index + 1).padStart(2, "0")}</span>
                  </span>
                  <span className={styles.stepCard}>
                    <span className={styles.stepKind}>{stepLabels[kind]}</span>
                    <span className={styles.stepName}>
                      <i className={styles.stepIcon} aria-hidden="true"><StepIcon kind={kind} /></i>
                      {node}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        {/* The builder's own footer, which keeps the frame balanced with true
            information rather than empty canvas. */}
        <div className={styles.builderFooter}>
          <span>{nodes.length} steps</span>
          <span>Instagram</span>
          <span className={styles.draftTag}>Draft saved</span>
        </div>
      </div>
      {/* The tab and the mobile accordion both already show this sentence, so
          here it is the figure's accessible name only. */}
      <figcaption className={styles.srOnly}>{workflow.body}</figcaption>
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
                aria-controls={`workflow-panel-${workflow.id}`}
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
              data-transition-state="leaving"
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) setLeavingWorkflow(null);
              }}
            >
              <BuilderPreview workflow={leavingWorkflow} />
            </div>
          ) : null}
          {workflowItems.map((workflow) => (
            <div
              key={workflow.id}
              id={`workflow-panel-${workflow.id}`}
              className={styles.panel}
              role="tabpanel"
              aria-labelledby={`workflow-tab-${workflow.id}`}
              hidden={workflow.id !== activeId}
            >
              <BuilderPreview workflow={workflow} />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.mobileAccordion} aria-label="Workflow examples on mobile">
        {workflowItems.map((workflow) => {
          const isActive = workflow.id === activeId;
          const contentId = `workflow-mobile-panel-${workflow.id}`;
          const triggerId = `workflow-mobile-trigger-${workflow.id}`;
          return (
            <section className={styles.accordionItem} key={workflow.id}>
              <h3>
                <button
                  className={styles.accordionTrigger}
                  type="button"
                  id={triggerId}
                  ref={(element) => { accordionRefs.current[workflow.id] = element; }}
                  aria-expanded={isActive}
                  aria-controls={contentId}
                  onClick={() => selectWorkflow(workflow.id)}
                >
                  <span>{workflow.label}</span>
                  <span aria-hidden="true" className={styles.accordionMark}>+</span>
                </button>
              </h3>
              <div id={contentId} className={styles.accordionPanel} aria-labelledby={triggerId} hidden={!isActive}>
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
