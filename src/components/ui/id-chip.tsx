"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

// Record IDs carry a type prefix ("workspace_", "admin_req_") that says nothing
// the surrounding screen does not already say.
const TYPE_PREFIX = /^(?:[a-z]+_)+/i;
const GIT_SHA = /^[0-9a-f]{40}$/i;

/**
 * "workspace_9f30c8c8-a723-4c1e-b0d4-1e2f3a4b633c" -> "9f30c8c8…633c".
 * A full 40-character commit SHA becomes the usual 7-character short SHA.
 */
export function shortId(id: string): string {
  const value = id.trim();
  if (GIT_SHA.test(value)) return value.slice(0, 7);
  const stripped = value.replace(TYPE_PREFIX, "");
  const core = stripped.length >= 6 ? stripped : value;
  return core.length <= 14 ? core : `${core.slice(0, 8)}…${core.slice(-4)}`;
}

/**
 * A short, copyable ID for operators who need to quote or paste one. Never the
 * primary label of a row: put it on a secondary line or a detail page. The
 * full value is in the tooltip and is what the copy button copies.
 */
export function IdChip({ id, prefix, className = "" }: { id: string; prefix?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the full ID stays selectable in the tooltip.
    }
  }

  const what = prefix ? prefix.toLowerCase() : "ID";
  return (
    <span className={`id-chip ${className}`.trim()} title={id}>
      {prefix ? <span className="id-chip-label">{prefix}</span> : null}
      <code>{shortId(id)}</code>
      <button className="id-chip-copy" type="button" aria-label={copied ? `Copied ${what}` : `Copy ${what}`} onClick={() => void copy()}>
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      </button>
    </span>
  );
}
