"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Presence } from "@/src/components/ui/use-presence";

// The picker portals into document.body, so it only ever renders on the
// client - the same lazy import the app's entry points use.
const TemplatePickerModal = dynamic(
  () => import("@/src/components/template-picker-modal").then((module) => module.TemplatePickerModal),
  { ssr: false },
);

/** Opens the picker straight away; closing it leaves a button to reopen it. */
export function TemplatePickerPreview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <h1>Templates</h1>
          <p>Preview of the template picker.</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => setOpen(true)}>Open the picker</button>
      </header>
      <Presence>{open && <TemplatePickerModal onClose={() => setOpen(false)} />}</Presence>
    </div>
  );
}
