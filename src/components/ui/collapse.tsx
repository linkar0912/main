"use client";

import { useState, type ReactNode } from "react";
import { usePresence } from "./use-presence";

/**
 * Smooth height for a disclosure body that React shows and hides (FAQ
 * answers, "More filters", inline forms). The wrapper is a one-row grid whose
 * row animates between 0fr and 1fr, so the height follows the content without
 * measuring it; @starting-style in globals.css runs the opening half, the
 * presence closing beat runs the other. Like <Presence>, the last children
 * stay on screen while it closes, so call sites keep `{open && (…)}`:
 *
 *   <Collapse open={open}>{open && <div className="faq-answer">…</div>}</Collapse>
 */
export function Collapse({ open, children, id, className = "" }: {
  open: boolean;
  children: ReactNode;
  /** For aria-controls on the toggle. */
  id?: string;
  className?: string;
}) {
  const [last, setLast] = useState<ReactNode>(children);
  if (open && children !== last) setLast(children);
  const { mounted, state } = usePresence(open);
  if (!mounted) return null;
  return (
    <div className={`collapse ${className}`.trim()} id={id} data-state={state} inert={state === "closing" || undefined}>
      <div className="collapse-inner">{open ? children : last}</div>
    </div>
  );
}
