"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { TemplatePickerModal } from "./template-picker-modal";

/**
 * Every "Create/New automation" entry point in the app opens the same
 * template picker instead of navigating to a separate chooser page.
 */
export function CreateAutomationButton({ className, children }: { className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <TemplatePickerModal onClose={() => setOpen(false)} />}
    </>
  );
}
