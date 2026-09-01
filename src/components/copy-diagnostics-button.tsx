"use client";

import { useState } from "react";
import { ClipboardCheck, Copy } from "lucide-react";
import { buildSafeDiagnostics } from "@/src/lib/support-diagnostics";

async function readData(url: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({})) as { data?: Record<string, unknown>[]; error?: string };
  if (!response.ok || !Array.isArray(payload.data)) throw new Error(payload.error ?? "Could not read diagnostics");
  return payload.data;
}

export function CopyDiagnosticsButton() {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">("idle");

  async function copyDiagnostics() {
    setState("copying");
    try {
      const [instagramHealth, facebookHealth, failures] = await Promise.all([
        readData("/api/meta/connection/health"),
        readData("/api/facebook/connection/health"),
        readData("/api/insights/failures"),
      ]);
      const diagnostics = buildSafeDiagnostics({
        generatedAt: new Date().toISOString(),
        instagramHealth,
        facebookHealth,
        failures,
      });
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setState("copied");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="copy-diagnostics">
      <button className="button button-secondary button-small" type="button" disabled={state === "copying"} onClick={() => void copyDiagnostics()}>
        {state === "copied" ? <ClipboardCheck size={15} /> : <Copy size={15} />}
        {state === "copying" ? "Collecting…" : "Copy diagnostics"}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Diagnostics copied." : state === "error" ? "Could not copy diagnostics." : ""}
      </span>
    </div>
  );
}
