"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ListOrdered, Pause, Pencil, Play, Plus, RotateCw, Trash2 } from "lucide-react";
import { InlineContentSkeleton } from "./skeleton";
import { LocalStatusBadge, lifecycleStatus } from "./workspace-primitives";

type SequenceStepView = { id: string; delayHours: number | string; text: string };
type SequenceRow = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  steps: SequenceStepView[];
  sourceAutomationId?: string;
  enrolledCount: number;
};
type AutomationOption = { id: string; name: string };

const EMPTY_STEPS: SequenceStepView[] = [{ id: "step-initial", delayHours: 0, text: "" }];

/**
 * Mirrors MAX_STEP_DELAY_HOURS in src/lib/automation/sequence.ts: Meta only
 * accepts an automated DM inside the 24-hour messaging window, so the API
 * rejects any gap of 24 hours or more.
 */
const MAX_STEP_DELAY_HOURS = 23;

/**
 * Step ids only have to be unique within one submitted sequence, but they used to
 * be `step-${Date.now()}` - two clicks inside the same millisecond produced a
 * duplicate pair, which the API rejects outright. The counter makes that
 * impossible regardless of how fast the steps are added.
 */
let stepCounter = 0;
function nextStepId(): string {
  stepCounter += 1;
  return `step-${Date.now()}-${stepCounter}`;
}

/** Timed drip campaigns: ordered DM steps sent to enrolled email leads. */
export function SequencesScreen() {
  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [automations, setAutomations] = useState<AutomationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [sourceAutomationId, setSourceAutomationId] = useState("");
  const [steps, setSteps] = useState<SequenceStepView[]>(EMPTY_STEPS);
  const [formError, setFormError] = useState("");
  // Field-level problems sit under the field they belong to.
  const [nameError, setNameError] = useState("");
  const [stepErrors, setStepErrors] = useState<Record<number, { delay?: string; text?: string }>>({});
  const formRef = useRef<HTMLFormElement>(null);
  // Deleting takes two clicks, like automations: a sequence can have people
  // enrolled mid-way, and one stray click used to remove it outright.
  const [confirmDeleteId, setConfirmDeleteId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  async function refresh(signal?: AbortSignal) {
    setPageError("");
    try {
      const [sequenceResponse, automationResponse] = await Promise.all([
        fetch("/api/sequences", { signal }),
        fetch("/api/automations", { signal }),
      ]);
      const [sequencePayload, automationPayload] = await Promise.all([
        sequenceResponse.json().catch(() => ({})) as Promise<{ data?: SequenceRow[]; error?: string }>,
        automationResponse.json().catch(() => ({})) as Promise<{ data?: { id: string; name: string; definition?: { version?: number } }[]; error?: string }>,
      ]);
      if (signal?.aborted) return;
      if (!sequenceResponse.ok) throw new Error(sequencePayload.error ?? "Could not load sequences.");
      if (!automationResponse.ok) throw new Error(automationPayload.error ?? "Could not load automations.");
      setSequences(sequencePayload.data ?? []);
      setAutomations(
        (automationPayload.data ?? [])
          // Classic (definition v1) flows are the only ones that can enroll into a
          // sequence. `Automation.version` is an edit counter, not the flow shape.
          .filter((automation) => automation.definition?.version === 1)
          .map(({ id, name }) => ({ id, name })),
      );
    } catch (error) {
      if (signal?.aborted) return;
      setPageError(error instanceof Error ? error.message : "Could not load sequences.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  function resetForm() {
    setEditingId("");
    setName("");
    setSourceAutomationId("");
    setSteps([{ id: nextStepId(), delayHours: 0, text: "" }]);
    setFormError("");
    setNameError("");
    setStepErrors({});
  }

  function loadForEdit(row: SequenceRow) {
    setEditingId(row.id);
    setName(row.name);
    setSourceAutomationId(row.sourceAutomationId ?? "");
    setSteps(row.steps.map((step) => ({ ...step })));
    setFormError("");
    setNameError("");
    setStepErrors({});
    // The form sits beside the list on desktop but below it on phones, so
    // bring the form itself into view rather than the top of the page.
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function updateStep(index: number, patch: Partial<SequenceStepView>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addStep() {
    setSteps((current) => [
      ...current,
      { id: nextStepId(), delayHours: MAX_STEP_DELAY_HOURS, text: "" },
    ]);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    const nextNameError = name.trim() ? "" : "Give the sequence a name.";
    const nextStepErrors: Record<number, { delay?: string; text?: string }> = {};
    steps.forEach((step, index) => {
      const problems: { delay?: string; text?: string } = {};
      if (!step.text.trim()) problems.text = "Write the message for this step.";
      if (Number(step.delayHours) > MAX_STEP_DELAY_HOURS) {
        problems.delay = `Wait at most ${MAX_STEP_DELAY_HOURS} hours - Meta only allows automated messages within 24 hours of the person's last message.`;
      }
      if (problems.text || problems.delay) nextStepErrors[index] = problems;
    });
    setNameError(nextNameError);
    setStepErrors(nextStepErrors);
    if (nextNameError || Object.keys(nextStepErrors).length > 0) return;

    const payload = {
      name: name.trim(),
      status: editingId ? sequences.find((row) => row.id === editingId)?.status ?? "DRAFT" : "DRAFT",
      ...(editingId
        ? { sourceAutomationId: sourceAutomationId || null }
        : sourceAutomationId
          ? { sourceAutomationId }
          : {}),
      steps: steps.map((step) => ({
        id: step.id,
        delayHours: Math.max(0, Math.round(Number(step.delayHours) || 0)),
        text: step.text.trim(),
      })),
    };

    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/sequences/${editingId}` : "/api/sequences", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? "Could not save this sequence.");
      }
      setJustSaved(true);
      resetForm();
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this sequence.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: SequenceRow) {
    const status = row.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setPageError("");
    // Only reflect the new status once the server has accepted it - otherwise a
    // rejected pause keeps running while the UI claims it stopped.
    try {
      const response = await fetch(`/api/sequences/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Could not update this sequence.");
      setSequences((current) => current.map((s) => (s.id === row.id ? { ...s, status } : s)));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not update this sequence.");
    }
  }

  async function remove(row: SequenceRow) {
    setPageError("");
    try {
      const response = await fetch(`/api/sequences/${row.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete this sequence.");
      setSequences((current) => current.filter((s) => s.id !== row.id));
      setConfirmDeleteId("");
      if (editingId === row.id) resetForm();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not delete this sequence.");
    }
  }

  return (
    <>
      <div className="automation-section">
        {pageError && <p className="form-error" role="alert">{pageError}</p>}

        <div className="split-layout">
            <section className="surface is-flush" aria-label="Your sequences">
              <div className="surface-head">
                <div className="surface-head-copy"><h2>Your sequences</h2><p>{loading || sequences.length === 0 ? "Follow-ups that run on their own." : `${sequences.length} ${sequences.length === 1 ? "sequence" : "sequences"}, running on their own.`}</p></div>
                {/* A Link here pointed at the page it already sits on, so the soft
                    navigation never remounted the screen and nothing refetched. */}
                <button className="text-link" type="button" onClick={() => void refresh()}>
                  <RotateCw size={14} aria-hidden /> Refresh
                </button>
              </div>
              <div className="surface-body">
              {loading && sequences.length === 0 && <InlineContentSkeleton label="Loading sequences" rows={3} />}
              {!loading && !pageError && sequences.length === 0 && (
                <div className="empty-state is-inline">
                  <span className="empty-icon"><ListOrdered size={22} /></span>
                  <h3>No sequences yet</h3>
                  <p>Use the form to create one and follow up with new leads automatically.</p>
                </div>
              )}
              {sequences.map((row) => (
                <article className="automation-row" key={row.id}>
                  <div className="automation-icon"><ListOrdered size={19} strokeWidth={1.7} /></div>
                  <div className="automation-copy">
                    <div className="automation-title">
                      <strong>{row.name}</strong>
                      <LocalStatusBadge {...lifecycleStatus(row.status)} />
                    </div>
                    <p>
                      {row.steps.length} {row.steps.length === 1 ? "step" : "steps"}
                      <span className="row-divider">·</span> {row.enrolledCount} enrolled
                      {row.sourceAutomationId && (
                        <>
                          <span className="row-divider">·</span>
                          from {automations.find((a) => a.id === row.sourceAutomationId)?.name ?? "a deleted automation"}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="automation-actions">
                  <button className="icon-button" type="button" title="Edit sequence" aria-label={`Edit ${row.name}`} onClick={() => loadForEdit(row)}><Pencil size={16} /></button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`${row.status === "ACTIVE" ? "Pause" : "Activate"} ${row.name}`}
                    title={row.status === "ACTIVE" ? "Pause" : "Activate"}
                    onClick={() => void toggleStatus(row)}
                  >
                    {row.status === "ACTIVE" ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  {confirmDeleteId === row.id ? (
                    // Spelled out, like automations: the old second click on the
                    // same trash icon only changed a tooltip nobody saw.
                    <button
                      className="button button-danger button-small is-confirming"
                      type="button"
                      ref={(element) => element?.focus()}
                      aria-label={`Confirm delete ${row.name}`}
                      title={row.enrolledCount > 0 ? `${row.enrolledCount} enrolled will stop receiving it` : "Permanently delete this sequence"}
                      onClick={() => void remove(row)}
                      onBlur={() => setConfirmDeleteId("")}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setConfirmDeleteId("");
                        }
                      }}
                    >
                      Confirm delete?
                    </button>
                  ) : (
                    <button className="icon-button icon-danger" type="button" aria-label={`Delete ${row.name}`} title="Delete" onClick={() => setConfirmDeleteId(row.id)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                  </div>
                </article>
              ))}
              </div>
            </section>
            <form ref={formRef} className="surface composer-card sequence-composer" onSubmit={save} noValidate aria-label={editingId ? "Edit sequence" : "New sequence"}>
              <div className="surface-head">
                <div className="surface-head-copy"><h2>{editingId ? "Edit sequence" : "New sequence"}</h2><p>Timed DMs sent one after another.</p></div>
                {justSaved && <span className="form-success" role="status"><Check size={14} /> Saved.</span>}
              </div>
              <div className="surface-body">
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <label className="field">
                <span>Sequence name</span>
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError(""); }}
                  maxLength={120}
                  placeholder="e.g. New lead nurture"
                  aria-invalid={nameError ? true : undefined}
                />
                {nameError ? <small className="field-error" role="alert">{nameError}</small> : null}
              </label>
              <label className="field field-spaced">
                <span>Enroll leads captured by</span>
                <select value={sourceAutomationId} onChange={(e) => setSourceAutomationId(e.target.value)}>
                  <option value="">No automatic enrollment</option>
                  {automations.map((automation) => (
                    <option key={automation.id} value={automation.id}>{automation.name}</option>
                  ))}
                </select>
                <small>New leads from this flow enroll automatically; STOP replies are skipped.</small>
              </label>

              <h3 className="composer-subhead field-spaced">Steps</h3>
              {steps.map((step, index) => (
                <div className="sequence-step-row field-spaced" key={step.id}>
                  <div className="sequence-step-head">
                    <strong>Step {index + 1}</strong>
                    <span className="sequence-step-actions">
                      <button type="button" className="icon-button" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => moveStep(index, -1)}><ArrowUp size={14} /></button>
                      <button type="button" className="icon-button" aria-label={`Move step ${index + 1} down`} disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}><ArrowDown size={14} /></button>
                      <button type="button" className="icon-button icon-danger" aria-label={`Remove step ${index + 1}`} disabled={steps.length === 1} onClick={() => setSteps((cur) => cur.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
                    </span>
                  </div>
                  <label className="field">
                    <span>Send after (hours)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_STEP_DELAY_HOURS}
                      value={String(step.delayHours)}
                      aria-invalid={stepErrors[index]?.delay ? true : undefined}
                      onChange={(e) => updateStep(index, { delayHours: e.target.value })}
                    />
                    {stepErrors[index]?.delay ? (
                      <small className="field-error" role="alert">{stepErrors[index].delay}</small>
                    ) : (
                      <small>
                        {index === 0 ? "0 sends it right after enrollment" : "Hours after the previous step"}
                        {`, up to ${MAX_STEP_DELAY_HOURS}. Meta only allows automated messages within 24 hours of the person’s last message.`}
                      </small>
                    )}
                  </label>
                  <label className="field">
                    <span>Message</span>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={step.text}
                      onChange={(e) => updateStep(index, { text: e.target.value })}
                      placeholder="Write the exact DM to send"
                      aria-invalid={stepErrors[index]?.text ? true : undefined}
                    />
                  </label>
                  {stepErrors[index]?.text ? <small className="field-error" role="alert">{stepErrors[index].text}</small> : null}
                </div>
              ))}
              <div className="sequence-form-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={steps.length >= 10}
                  onClick={addStep}
                >
                  <Plus size={15} /> Add step
                </button>
                <div className="sequence-submit-actions">
                  {editingId && <button type="button" className="text-link" onClick={resetForm}>Cancel editing</button>}
                  <button className="button button-primary" type="submit" disabled={saving}>
                    {saving ? "Saving…" : editingId ? "Save changes" : "Create sequence"}
                  </button>
                </div>
              </div>
              </div>
            </form>
        </div>
      </div>
    </>
  );
}
