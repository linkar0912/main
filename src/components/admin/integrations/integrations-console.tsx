"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Cable, RefreshCcw, ShieldAlert, Wrench, X } from "lucide-react";

import { formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import type { AdminIntegrationDetail, AdminIntegrationItem } from "@/src/lib/admin/integrations/types";
import { adminCommand, adminErrorMessage, adminQuery } from "../shared/admin-request";
import { StatusPill } from "../shared/status-pill";
import { useAdminDialog } from "../shared/use-admin-dialog";

const actionIcons: Record<string, typeof Wrench> = { repair_subscription: Wrench, refresh_token: RefreshCcw, disconnect: ShieldAlert };

function label(value: string): string {
  return value.replaceAll("_", " ");
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
      onDone(`${label(action)} completed`);
    } catch (cause) {
      setError(adminErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <form ref={dialogRef} tabIndex={-1} className="panel admin-reason-dialog" role="dialog" aria-modal="true" aria-labelledby="integration-action-title" onSubmit={submit}>
        <h2 id="integration-action-title">{label(action)} {item.accountName}</h2>
        {disconnecting ? <p className="admin-warning-copy">Disconnecting stops every automation on this account until the workspace reconnects it.</p> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <label className="field">
          <span>Operator reason</span>
          <textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        {challenge ? (
          <label className="field">
            <span>Type <code>{challenge.confirmationPhrase}</code></span>
            <input autoFocus required autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
        ) : null}
        <div className="admin-command-actions">
          <button className="button button-ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button className={disconnecting ? "button button-danger" : "button button-primary"} disabled={busy || !ready} type="submit">
            {disconnecting && !challenge ? "Prepare disconnect" : "Confirm action"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function IntegrationsConsole({ items, filters, nextCursor }: { items: AdminIntegrationItem[]; filters: Record<string, string>; nextCursor?: string | null }) {
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
    <main className="page-wrap admin-resource-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator / providers</p>
          <h1>Integrations</h1>
          <p className="muted page-lede">Derived token and subscription health. Credential material never leaves the server.</p>
        </div>
        <span className="admin-count-badge"><Cable size={16} /> {items.length} connections on this page</span>
      </header>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="form-success" role="status">{notice}</div> : null}

      <form key={JSON.stringify(filters)} className="admin-filter-bar admin-integration-filter" onSubmit={filter}>
        <label className="field">
          <span>Provider</span>
          <select name="provider" defaultValue={filters.provider ?? ""}>
            <option value="">All</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">All</option>
            <option value="CONNECTED">Connected</option>
            <option value="EXPIRED">Expired</option>
            <option value="DISCONNECTED">Disconnected</option>
          </select>
        </label>
        <label className="field">
          <span>Expiry window</span>
          <select name="expiry" defaultValue={filters.expiry ?? ""}>
            <option value="">All</option>
            <option value="expired">Expired</option>
            <option value="within_24_hours">Within 24 hours</option>
            <option value="within_7_days">Within 7 days</option>
            <option value="within_30_days">Within 30 days</option>
            <option value="later">Later</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="field"><span>Workspace ID</span><input name="workspaceId" defaultValue={filters.workspaceId ?? ""} /></label>
        <label className="field"><span>Search</span><input name="text" defaultValue={filters.text ?? ""} /></label>
        <button className="button button-secondary" type="submit">Apply filters</button>
      </form>

      <section className="panel admin-table-panel" aria-label="Provider connections">
        {items.length === 0 ? (
          <div className="empty-state">
            <h2>No integrations found</h2>
            <p>Adjust the provider, status, or expiry filters.</p>
          </div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Workspace</th>
                  <th>Status</th>
                  <th>Token expiry</th>
                  <th>Subscription</th>
                  <th><span className="sr-only">Inspect</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const rowId = `${item.provider}-${item.id}`;
                  return (
                    <tr key={rowId}>
                      <td><strong>{item.accountName}</strong><small>{item.provider} · {item.accountId}</small></td>
                      <td><Link href={`/admin/workspaces/${item.workspace.id}`}><strong>{item.workspace.name}</strong></Link><small>{item.workspace.id}</small></td>
                      <td><StatusPill status={item.status} /></td>
                      <td><StatusPill status={item.tokenExpiry === "expired" ? "expired" : item.tokenExpiry === "within_24_hours" || item.tokenExpiry === "within_7_days" ? "pending" : "idle"} label={label(item.tokenExpiry)} /></td>
                      <td><StatusPill status={item.subscriptionHealth} /></td>
                      <td>
                        <button className="button button-ghost button-small" disabled={loadingId !== null} aria-label={`Inspect ${item.accountName}`} onClick={() => void inspect(item)} type="button">
                          {loadingId === rowId ? "Loading…" : "Inspect"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <nav className="admin-pagination" aria-label="Integration pagination">
        <span className="muted">Token and subscription state is derived on the server.</span>
        {nextCursor
          ? <Link className="button button-secondary" href={`/admin/integrations?${new URLSearchParams({ ...filters, cursor: nextCursor })}`}>Next page <ArrowRight size={16} /></Link>
          : <span className="muted">End of results</span>}
      </nav>

      {selected ? (
        <>
          <button className="admin-drawer-scrim" type="button" disabled={action !== null} onClick={() => setSelected(null)} aria-label="Close integration detail" />
          <aside ref={drawerRef} tabIndex={-1} className="admin-detail-drawer" role="dialog" aria-modal="true" aria-label="Integration detail">
            <button className="button button-ghost button-small admin-drawer-close" type="button" disabled={action !== null} onClick={() => setSelected(null)} aria-label="Close integration detail">
              <X size={16} />
            </button>
            <p className="eyebrow">{selected.provider} / {selected.id}</p>
            <h2>{selected.accountName}</h2>
            <p><StatusPill status={selected.status} /></p>
            <dl className="admin-inline-kv">
              <div><dt>Workspace</dt><dd>{selected.workspace.name}</dd></div>
              <div><dt>Token expiry</dt><dd>{label(selected.tokenExpiry)}</dd></div>
              <div><dt>Subscription</dt><dd>{selected.subscriptionHealth}</dd></div>
              <div><dt>Subscribed fields</dt><dd>{selected.subscribedFields.join(", ") || "None"}</dd></div>
              <div><dt>Missing fields</dt><dd>{selected.missingFields.join(", ") || "None"}</dd></div>
              <div><dt>Checked</dt><dd>{formatAdminDateTime(selected.checkedAt)}</dd></div>
              {selected.safeErrorCode ? <div><dt>Last error</dt><dd>{selected.safeErrorCode}</dd></div> : null}
            </dl>
            <h3>Allowed actions</h3>
            {selected.allowedActions.length === 0 ? <p className="muted">No operator actions are available for this connection.</p> : null}
            <div className="admin-command-actions">
              {selected.allowedActions.map((name) => {
                const Icon = actionIcons[name];
                return (
                  <button key={name} className={name === "disconnect" ? "button button-danger button-small" : "button button-secondary button-small"} onClick={() => setAction(name)} type="button">
                    {Icon ? <Icon size={14} aria-hidden /> : null}{label(name)}
                  </button>
                );
              })}
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
