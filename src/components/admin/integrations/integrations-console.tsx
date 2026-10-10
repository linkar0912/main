"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw, ShieldAlert, Wrench, X } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import type { AdminIntegrationDetail, AdminIntegrationItem } from "@/src/lib/admin/integrations/types";
import { AdminPagination } from "../shared/admin-pagination";
import { adminCommand, adminErrorMessage, adminQuery, humanizeAdminCode } from "../shared/admin-request";
import { REASON_LABEL } from "../shared/reason-dialog";
import { StatusPill } from "../shared/status-pill";
import { useAdminDialog } from "../shared/use-admin-dialog";

const actionIcons: Record<string, typeof Wrench> = { repair_subscription: Wrench, refresh_token: RefreshCcw, disconnect: ShieldAlert };

const actionLabels: Record<string, string> = {
  refresh_token: "Refresh access",
  mark_expired: "Mark as expired",
  repair_subscription: "Repair event subscription",
  disconnect: "Disconnect",
};
const providerNames = { instagram: "Instagram", facebook: "Facebook" } as const;
const subscriptionStates: Record<AdminIntegrationItem["subscriptionHealth"], { status: string; label: string }> = {
  healthy: { status: "healthy", label: "Receiving events" },
  drifted: { status: "drifted", label: "Needs repair" },
  unchecked: { status: "unchecked", label: "Not checked" },
  unavailable: { status: "unavailable", label: "Unavailable" },
};

function label(value: string): string {
  return actionLabels[value] ?? humanizeAdminCode(value);
}

function TokenExpiry({ item }: { item: AdminIntegrationItem }) {
  if (item.tokenExpiresAt) return <RelativeTime value={item.tokenExpiresAt} />;
  return <>{item.tokenExpiry === "expired" ? "Expired" : "Not set"}</>;
}

function integrationUrl(item: AdminIntegrationItem): string {
  return `/api/admin/integrations/${item.provider}/${item.id}`;
}

function ActionDialog({ item, action, onClose, onDone }: { item: AdminIntegrationItem; action: string; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ token: string; confirmationPhrase: string } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useAdminDialog<HTMLFormElement>(onClose, busy);
  const disconnecting = action === "disconnect";
  const ready = reason.trim().length >= 3 && (!challenge || confirmation === challenge.confirmationPhrase);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      if (disconnecting && !challenge) {
        // Disconnect is a two-step command: the server issues a single-use challenge first.
        const data = await adminCommand(integrationUrl(item), { method: "PATCH", body: { action: "prepare_disconnect", version: item.version }, reason, fallback: "integration_operation_failed" });
        if (!data) throw new Error("integration_operation_failed");
        setChallenge({ token: String(data.token), confirmationPhrase: String(data.confirmationPhrase) });
        return;
      }
      const body = challenge ? { action, version: item.version, challengeToken: challenge.token, confirmation } : { action, version: item.version };
      await adminCommand(integrationUrl(item), { method: "PATCH", body, reason, fallback: "integration_operation_failed" });
      onDone(`Done: ${label(action)}.`);
    } catch (cause) {
      setError(adminErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <form ref={dialogRef} tabIndex={-1} className="admin-reason-dialog" role="dialog" aria-modal="true" aria-labelledby="integration-action-title" onSubmit={submit}>
        <h2 id="integration-action-title">{label(action)}: {item.accountName}</h2>
        {disconnecting ? <p className="admin-callout is-danger"><ShieldAlert size={16} aria-hidden /><span>Disconnecting stops every automation on this account until the workspace connects it again.</span></p> : null}
        {error ? <div className="form-error admin-message" role="alert">{error}</div> : null}
        <label className="field">
          <span>{REASON_LABEL}</span>
          <textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        {challenge ? (
          <label className="field">
            <span>Type <code className="admin-phrase">{challenge.confirmationPhrase}</code> to confirm</span>
            <input autoFocus required autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
        ) : null}
        <div className="admin-actions">
          <button className="button button-ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button className={disconnecting ? "button button-danger" : "button button-primary"} disabled={busy || !ready} type="submit">
            {disconnecting && !challenge ? "Continue" : disconnecting ? "Disconnect" : "Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function IntegrationsConsole({ items, filters, nextCursor = null, history = [] }: { items: AdminIntegrationItem[]; filters: Record<string, string>; nextCursor?: string | null; history?: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<AdminIntegrationDetail | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const drawerRef = useAdminDialog<HTMLElement>(() => setSelected(null), action !== null, selected !== null);
  const inspectAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => inspectAbortRef.current?.abort(), []);

  async function inspect(item: AdminIntegrationItem) {
    setSelected(null);
    setAction(null);
    setLoadingId(`${item.provider}-${item.id}`);
    setError(null);
    setNotice(null);
    inspectAbortRef.current?.abort();
    const controller = new AbortController();
    inspectAbortRef.current = controller;
    try {
      const detail = await adminQuery<AdminIntegrationDetail>(integrationUrl(item), { signal: controller.signal, fallback: "integration_unavailable" });
      if (controller.signal.aborted) return;
      setSelected(detail);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(adminErrorMessage(cause, "Integration unavailable"));
    } finally {
      if (!controller.signal.aborted) setLoadingId(null);
    }
  }

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    router.push(`/admin/integrations${params.size ? `?${params}` : ""}`);
  }

  return (
    <main className="page-wrap admin-page">
      <PageHeader title="Connected accounts" description="Instagram and Facebook accounts linked to workspaces." />

      {error ? <div className="form-error admin-message" role="alert">{error}</div> : null}
      {notice ? <div className="form-success admin-message" role="status">{notice}</div> : null}

      <form key={JSON.stringify(filters)} className="admin-toolbar" onSubmit={filter}>
        <label className="field">
          <span>Platform</span>
          <select name="provider" defaultValue={filters.provider ?? ""}>
            <option value="">Any</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Any</option>
            <option value="CONNECTED">Connected</option>
            <option value="EXPIRED">Expired</option>
            <option value="DISCONNECTED">Disconnected</option>
          </select>
        </label>
        <label className="field">
          <span>Access expires</span>
          <select name="expiry" defaultValue={filters.expiry ?? ""}>
            <option value="">Any time</option>
            <option value="expired">Already expired</option>
            <option value="within_24_hours">Within 24 hours</option>
            <option value="within_7_days">Within 7 days</option>
            <option value="within_30_days">Within 30 days</option>
            <option value="later">In more than 30 days</option>
            <option value="unknown">Not set</option>
          </select>
        </label>
        <label className="field"><span>Workspace ID</span><input name="workspaceId" defaultValue={filters.workspaceId ?? ""} /></label>
        <label className="field is-grow"><span>Account name</span><input name="text" defaultValue={filters.text ?? ""} placeholder="@handle or Page name" /></label>
        <button className="button button-secondary" type="submit">Apply filters</button>
      </form>

      <section className="admin-section" aria-label="Provider connections">
        <div className="admin-results"><span>{items.length ? `Showing ${items.length} ${items.length === 1 ? "account" : "accounts"}` : "No accounts to show"}</span></div>
        <div className="admin-card is-flush">
          {items.length === 0 ? (
            <div className="admin-empty">
              <p>No connected accounts match these filters. Try a different platform, status or expiry.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table is-stackable">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Workspace</th>
                    <th>Status</th>
                    <th>Access expires</th>
                    <th>Events</th>
                    <th className="is-action"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const rowId = `${item.provider}-${item.id}`;
                    const subscription = subscriptionStates[item.subscriptionHealth];
                    return (
                      <tr key={rowId}>
                        <td><span className="cell-stack"><strong>{item.accountName}</strong><span className="cell-meta">{providerNames[item.provider]}</span></span></td>
                        <td data-label="Workspace"><Link href={`/admin/workspaces/${item.workspace.id}`}>{item.workspace.name}</Link></td>
                        <td data-label="Status"><StatusPill status={item.status} /></td>
                        <td data-label="Access expires"><TokenExpiry item={item} /></td>
                        <td data-label="Events"><StatusPill status={subscription.status} label={subscription.label} /></td>
                        <td className="is-action">
                          <button className="button button-ghost button-small" disabled={loadingId !== null} aria-label={`Open ${item.accountName}`} onClick={() => void inspect(item)} type="button">
                            {loadingId === rowId ? "Loading…" : "Open"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <AdminPagination
          basePath="/admin/integrations"
          params={filters}
          cursor={filters.cursor ?? null}
          history={history}
          nextCursor={nextCursor}
          label="Integration pagination"
          summary="Access tokens never leave the server."
        />
      </section>

      {selected ? (
        <>
          <button className="admin-drawer-scrim" type="button" disabled={action !== null} onClick={() => setSelected(null)} aria-label="Close integration detail" />
          <aside ref={drawerRef} tabIndex={-1} className="admin-detail-drawer" role="dialog" aria-modal="true" aria-label="Integration detail">
            <div className="admin-drawer-head">
              <div>
                <h2>{selected.accountName}</h2>
                <div className="admin-header-meta">
                  <StatusPill status={selected.status} />
                  <span className="admin-hint">{providerNames[selected.provider]}</span>
                </div>
              </div>
              <button className="button button-ghost button-small" type="button" disabled={action !== null} onClick={() => setSelected(null)} aria-label="Close integration detail">
                <X size={16} aria-hidden />
              </button>
            </div>
            <dl className="admin-kv">
              <div><dt>Workspace</dt><dd>{selected.workspace.name}</dd></div>
              <div><dt>Account ID</dt><dd><IdChip id={selected.accountId} /></dd></div>
              <div><dt>Access expires</dt><dd><TokenExpiry item={selected} /></dd></div>
              <div><dt>Events</dt><dd>{subscriptionStates[selected.subscriptionHealth].label}</dd></div>
              <div><dt>Subscribed to</dt><dd>{selected.subscribedFields.join(", ") || "Nothing"}</dd></div>
              <div><dt>Missing</dt><dd>{selected.missingFields.join(", ") || "Nothing"}</dd></div>
              <div><dt>Last checked</dt><dd><RelativeTime value={selected.checkedAt} /></dd></div>
              {selected.safeErrorCode ? <div><dt>Last error</dt><dd>{humanizeAdminCode(selected.safeErrorCode.toLowerCase())}</dd></div> : null}
            </dl>
            <div>
              <h3>What you can do</h3>
              {selected.allowedActions.length === 0 ? <p className="admin-hint">Nothing can be changed on this account right now.</p> : null}
              <div className="admin-actions">
                {selected.allowedActions.map((name) => {
                  const Icon = actionIcons[name];
                  return (
                    <button key={name} className={name === "disconnect" ? "button button-danger button-small" : "button button-secondary button-small"} onClick={() => setAction(name)} type="button">
                      {Icon ? <Icon size={14} aria-hidden /> : null}{label(name)}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </>
      ) : null}

      {selected && action ? (
        <ActionDialog
          item={selected}
          action={action}
          onClose={() => setAction(null)}
          onDone={(message) => { setNotice(message); setAction(null); setSelected(null); router.refresh(); }}
        />
      ) : null}
    </main>
  );
}
