"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { presenceProps, usePresenceState } from "./ui/use-presence";

export function ActionNotice({
  tone,
  message,
  onDismiss,
}: {
  tone: "error" | "success";
  message: string;
  onDismiss: () => void;
}) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  // Inside a <Presence> the notice slides away instead of vanishing.
  const presence = usePresenceState();
  return (
    <div className={`action-notice action-notice-${tone}`} role={tone === "error" ? "alert" : "status"} {...presenceProps(presence)}>
      <Icon size={19} aria-hidden="true" />
      <p>{message}</p>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
