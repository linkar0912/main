"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, ListOrdered, Pause, Play, Plus, Trash2 } from "lucide-react";
import { AppShell } from "./app-shell";
import { AutomationSectionNav } from "./automation-section-nav";

type SequenceStepView = { id: string; delayHours: number; text: string };
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

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      const [sequenceResponse, automationResponse] = await Promise.all([
        fetch("/api/sequences").then((r) => r.json()),
        fetch("/api/automations").then((r) => r.json()),
      ]);
      setSequences(sequenceResponse.data ?? []);
      setAutomations(
        ((automationResponse.data ?? []) as { id: string; name: string; version: number }[])
          .filter((automation) => automation.version === 1)
          .map(({ id, name }) => ({ id, name })),
      );
    } catch {
      setPageError("Could not load sequences.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setEditingId("");
    setName("");
    setSourceAutomationId("");
    setSteps([{ id: `step-${Date.now()}`, delayHours: 0, text: "" }]);
    setFormError("");
  }

  function loadForEdit(row: SequenceRow) {
    setEditingId(row.id);
    setName(row.name);
    setSourceAutomationId(row.sourceAutomationId ?? "");
    setSteps(row.steps.map((step) => ({ ...step })));
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    if (!name.trim()) return setFormError("Give the sequence a name.");
    if (steps.some((step) => !step.text.trim())) return setFormError("Every step needs a message.");

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
      setTimeout(() => setJustSaved(false), 2500);
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
    // Only reflect the new status once the server has accepted it — otherwise a
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
      if (editingId === row.id) resetForm();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not delete this sequence.");
    }
  }

  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Workspace / automation</p>
            <h1>Sequences</h1>
            <p className="muted page-lede">
              Timed follow-up campaigns. New email leads enroll automatically and get each step by
              DM — STOP suppression respected everywhere.
            </p>
          </div>
        </header>

        <div className="section-layout">
          <AutomationSectionNav active="sequences" />
          <div className="section-content">
            <form className="panel full-list-panel" onSubmit={save}>
              <div className="list-intro">
                <div className="list-count"><ListOrdered size={17} /><span>{editingId ? "Edit sequence" : "New sequence"}</span></div>
                {justSaved && <span className="form-success" role="status"><Check size={14} /> Saved.</span>}
              </div>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <label className="field">
                <span>Sequence name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. New lead nurture" />
              </label>
              <label className="field field-spaced">
                <span>Enroll leads captured by</span>
                <select value={sourceAutomationId} onChange={(e) => setSourceAutomationId(e.target.value)}>
                  <option value="">No automatic enrollment</option>
                  {automations.map((automation) => (
                    <option key={automation.id} value={automation.id}>{automation.name}</option>
                  ))}
                </select>
                <small>Pick an email-capture flow — its new leads start this sequence automatically. People who reply STOP never enroll or continue.</small>
              </label>

              <p className="eyebrow field-spaced">Steps</p>
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
                      min={0}
                      max={2160}
                      value={String(step.delayHours)}
                      onChange={(e) => updateStep(index, { delayHours: Number(e.target.value) })}
                    />
                    <small>{index === 0 ? "0 = as soon as the scheduler runs after enrollment" : "hours after the previous step"}</small>
                  </label>
                  <label className="field">
                    <span>Message</span>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={step.text}
                      onChange={(e) => updateStep(index, { text: e.target.value })}
                      placeholder="Write the exact DM to send"
                    />
                  </label>
                </div>
              ))}
              <button
                type="button"
                className="button button-secondary"
                disabled={steps.length >= 10}
                onClick={() => setSteps((cur) => [...cur, { id: `step-${Date.now()}`, delayHours: 24, text: "" }])}
              >
                <Plus size={15} /> Add step
              </button>

              <div className="builder-footer">
                <div>{editingId && <button type="button" className="text-link" onClick={resetForm}>Cancel editing</button>}</div>
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create sequence"}
                </button>
              </div>
            </form>

            <section className="panel full-list-panel">
              <div className="list-intro">
                <div className="list-count"><ListOrdered size={17} /><span>{loading ? "Loading" : `${sequences.length} ${sequences.length === 1 ? "sequence" : "sequences"}`}</span></div>
                <Link className="text-link" href="/automations/sequences">Refresh</Link>
              </div>
              {!loading && sequences.length === 0 && (
                <p className="muted">No sequences yet — create one above and wire it to an email capture flow.</p>
              )}
              {sequences.map((row) => (
                <article className="automation-row" key={row.id}>
                  <div className="automation-icon"><ListOrdered size={19} strokeWidth={1.7} /></div>
                  <div className="automation-copy">
                    <div className="automation-title">
                      <strong>{row.name}</strong>
                      <em className="sequence-status" data-status={row.status}>{row.status}</em>
                    </div>
                    <p>
                      {row.steps.length} {row.steps.length === 1 ? "step" : "steps"}
                      <span className="row-divider">·</span> {row.enrolledCount} enrolled
                      {row.sourceAutomationId && (
                        <>
                          <span className="row-divider">·</span>
                          source: {automations.find((a) => a.id === row.sourceAutomationId)?.name ?? "removed flow"}
                        </>
                      )}
                    </p>
                  </div>
                  <button className="icon-button" type="button" title="Edit sequence" aria-label={`Edit ${row.name}`} onClick={() => loadForEdit(row)}>✎</button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`${row.status === "ACTIVE" ? "Pause" : "Activate"} ${row.name}`}
                    title={row.status === "ACTIVE" ? "Pause" : "Activate"}
                    onClick={() => void toggleStatus(row)}
                  >
                    {row.status === "ACTIVE" ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button className="icon-button icon-danger" type="button" aria-label={`Delete ${row.name}`} title="Delete" onClick={() => void remove(row)}>
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
