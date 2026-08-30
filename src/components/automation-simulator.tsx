"use client";

import { useState } from "react";
import type { SimulationResult, ValidationIssue } from "@/src/lib/automation/simulator";

type SimulatorPayload = {
  data?: { result: SimulationResult; issues: ValidationIssue[] };
  error?: string;
};

const SAMPLE_EVENTS = [
  { value: "message.received", label: "Direct message" },
  { value: "comment.created", label: "Comment" },
  { value: "referral.received", label: "Referral link tap" },
  { value: "story_mention.received", label: "Story mention" },
];

/**
 * Dry-runs the current draft against a sample event via /api/automations/simulate.
 * Purely read-only: no Meta calls, nothing persisted.
 */
export function AutomationSimulator({ buildDefinition }: { buildDefinition: () => unknown }) {
  const [eventType, setEventType] = useState("message.received");
  const [text, setText] = useState("");
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/automations/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: buildDefinition(),
          event: {
            type: eventType,
            ...(eventType === "message.received" || eventType === "comment.created" ? { text } : {}),
            ...(username.trim() ? { senderUsername: username.trim().replace(/^@/, "") } : {}),
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as SimulatorPayload;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not run the simulation");
      setResult(payload.data.result);
      setIssues(payload.data.issues);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not run the simulation");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="panel simulator-panel" aria-label="Test run">
      <p className="eyebrow field-spaced">Test run <em>no messages are sent</em></p>
      <div className="field-grid">
        <label className="field">
          <span>Sample event</span>
          <select aria-label="Sample event type" value={eventType} onChange={(event) => setEventType(event.target.value)}>
            {SAMPLE_EVENTS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {(eventType === "message.received" || eventType === "comment.created") && (
          <label className="field">
            <span>Message text</span>
            <input
              aria-label="Sample event text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={200}
              placeholder={'e.g. "guide"' }
            />
          </label>
        )}
        <label className="field">
          <span>From <em>optional</em></span>
          <input
            aria-label="Sample sender username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={60}
            placeholder="@creator"
          />
        </label>
      </div>
      <button className="button button-secondary button-small field-spaced" type="button" onClick={run} disabled={running}>
        {running ? "Running…" : "Run simulation"}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
      {result && (
        <div className="simulator-result field-spaced">
          {result.matched ? (
            <>
              <p className="form-success" role="status">This event would fire {result.actions.length} action{result.actions.length === 1 ? "" : "s"}:</p>
              <ul className="simulator-actions">
                {result.actions.map((action, index) => (
                  <li key={`${action.type}-${index}`}><code>{action.type}</code> {action.summary}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">No match - {result.reason}.</p>
          )}
          {issues.filter((issue) => issue.severity === "error").map((issue, index) => (
            <p className="form-error" key={`e-${index}`} role="alert">{issue.message}</p>
          ))}
          {issues.filter((issue) => issue.severity === "warning").map((issue, index) => (
            <p className="muted warning-text" key={`w-${index}`}>⚠ {issue.message}</p>
          ))}
        </div>
      )}
    </section>
  );
}
