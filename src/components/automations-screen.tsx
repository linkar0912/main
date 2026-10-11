"use client";

import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { AutomationList, useAutomations } from "./automation-list";
import { DeliveryDiagnostics } from "./delivery-diagnostics";
import type { AutomationRecord } from "@/src/lib/repository";
import { toReadableApiError } from "@/src/lib/validation-error";

type StatusFilter = "ALL" | "ACTIVE" | "PAUSED" | "DRAFT";
const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "Paused" },
  { key: "DRAFT", label: "Drafts" },
];

export function AutomationsScreen({ initialAutomations }: { initialAutomations?: AutomationRecord[] } = {}) {
  const router = useRouter();
  const { automations, loading, error, setStatus, reload, addAutomation } = useAutomations(initialAutomations);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const counts = {
    ALL: automations.length,
    ACTIVE: automations.filter((automation) => automation.status === "ACTIVE").length,
    PAUSED: automations.filter((automation) => automation.status === "PAUSED").length,
    DRAFT: automations.filter((automation) => automation.status === "DRAFT").length,
  };
  const needle = query.trim().toLowerCase();
  const visible = automations.filter((automation) =>
    (statusFilter === "ALL" || automation.status === statusFilter)
    && (!needle || automation.name.toLowerCase().includes(needle)));
  const filtering = statusFilter !== "ALL" || needle !== "";

  async function duplicateAutomation(id: string) {
    const response = await fetch(`/api/automations/${id}/duplicate`, { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Could not duplicate this automation.");
    }
    const payload = (await response.json()) as { data: AutomationRecord };
    addAutomation(payload.data);
    router.push(`/automations/${payload.data.id}/edit`);
  }

  async function deleteAutomation(id: string) {
    const response = await fetch(`/api/automations/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(toReadableApiError(payload.error, "Could not delete this automation."));
    }
    await reload();
  }

  return (
    <>
      <div className="automation-section">
        <div className="page-stack">
          {/* No separate Total / Active / Paused / Drafts strip: the filter
              below already carries those counts, and two rows of the same
              numbers was noise. */}
          <section className="surface is-flush automations-surface" aria-label="Your automations">
            <div className="list-toolbar">
              <label className="list-search">
                <Search size={16} aria-hidden />
                <input
                  type="search"
                  aria-label="Search automations"
                  placeholder="Search automations"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="segmented" role="group" aria-label="Filter automations by status">
                {STATUS_FILTERS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={`segmented-option ${statusFilter === key ? "is-on" : ""}`}
                    aria-pressed={statusFilter === key}
                    onClick={() => setStatusFilter(key)}
                  >
                    {label} <span className="chip-count">{counts[key]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="surface-body">
              {error && automations.length > 0 ? <p className="form-error" role="alert">{error}</p> : null}
              {error && automations.length === 0 ? (
                <div className="empty-state is-inline" role="alert">
                  <h3>Your automations didn’t load</h3>
                  <p>Check your connection and try again.</p>
                  <button className="button button-secondary button-small" type="button" onClick={() => void reload()}>
                    <RefreshCw size={15} aria-hidden /> Try again
                  </button>
                </div>
              ) : filtering && visible.length === 0 && automations.length > 0 ? (
                <div className="empty-state is-inline">
                  <span className="empty-icon"><Search size={20} /></span>
                  <h3>No matching automations</h3>
                  <p>Try another name or status.</p>
                  <button className="button button-secondary button-small" type="button" onClick={() => { setQuery(""); setStatusFilter("ALL"); }}>Clear filters</button>
                </div>
              ) : (
                <AutomationList automations={visible} loading={loading} onStatusChange={setStatus} onDuplicate={duplicateAutomation} onDelete={deleteAutomation} onChanged={() => void reload()} />
              )}
            </div>
          </section>
          {automations.length > 0 && <DeliveryDiagnostics />}
        </div>
      </div>
    </>
  );
}
