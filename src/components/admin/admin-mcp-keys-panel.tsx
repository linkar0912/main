"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Plus, Trash2, TriangleAlert } from "lucide-react";

import { Presence } from "@/src/components/ui/use-presence";
import { StatusBadge } from "@/src/components/ui/status-badge";
import { formatDate, formatDateTime } from "@/src/lib/format-date";
import type { AdminMcpKeySummary } from "@/src/lib/admin/mcp/keys";
import { adminCommand, adminErrorMessage, AdminCommandError } from "./shared/admin-request";
import { AdminDialog } from "./shared/admin-dialog";
import { ReasonDialog, ReasonField } from "./shared/reason-dialog";

const TTL_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  mcp_key_limit: "You already have 10 active keys. Revoke one you no longer use first.",
  mcp_key_not_found: "That key no longer exists. Reload the page.",
  mfa_required: "Verify your authenticator again, then try once more.",
};

const STATUS: Record<AdminMcpKeySummary["status"], { label: string; tone: "success" | "neutral" }> = {
  ACTIVE: { label: "Active", tone: "success" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  REVOKED: { label: "Revoked", tone: "neutral" },
};

type Draft = { label: string; scope: "READ" | "WRITE"; ttlDays: number; reason: string };
type Created = { key: AdminMcpKeySummary; token: string };

function messageFor(cause: unknown, fallback: string): string {
  if (cause instanceof AdminCommandError && ERROR_MESSAGES[cause.code]) return ERROR_MESSAGES[cause.code];
  return adminErrorMessage(cause, fallback);
}

function connectCommand(mcpUrl: string, token: string): string {
  return `claude mcp add --transport http --scope user linkar-admin ${mcpUrl} --header "Authorization: Bearer ${token}"`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "blocked">("idle");
  return (
    <button
      className="button button-secondary button-small"
      type="button"
      onClick={() => {
        // Clipboard access can be blocked; the value stays selectable above.
        navigator.clipboard?.writeText(value)
          .then(() => {
            setState("copied");
            window.setTimeout(() => setState("idle"), 2000);
          })
          .catch(() => setState("blocked"));
      }}
    >
      {state === "copied" ? <><Check size={14} aria-hidden /> Copied</> : <><Copy size={14} aria-hidden /> {state === "blocked" ? "Select and copy it above" : label}</>}
    </button>
  );
}

function KeysUnavailable() {
  return (
    <section className="admin-card" aria-labelledby="mcp-keys-title">
      <div className="admin-card-head">
        <div>
          <h2 id="mcp-keys-title">Claude MCP keys</h2>
          <p>Your MCP keys could not be loaded just now. Reload the page to try again; two-factor settings on this page still work.</p>
        </div>
      </div>
    </section>
  );
}

/** `initialKeys` is null when the keys could not be loaded. */
export function AdminMcpKeysPanel({ initialKeys, mcpUrl }: { initialKeys: AdminMcpKeySummary[] | null; mcpUrl: string }) {
  if (initialKeys === null) return <KeysUnavailable />;
  return <KeysPanel initialKeys={initialKeys} mcpUrl={mcpUrl} />;
}

function KeysPanel({ initialKeys, mcpUrl }: { initialKeys: AdminMcpKeySummary[]; mcpUrl: string }) {
  const [keys, setKeys] = useState(initialKeys);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [revoking, setRevoking] = useState<AdminMcpKeySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftReady = draft !== null && draft.label.trim().length >= 2 && draft.reason.trim().length >= 3;

  async function createKey() {
    if (!draft || !draftReady) return;
    setBusy(true);
    setError(null);
    try {
      const data = await adminCommand<Created>("/api/admin/mcp-keys", {
        body: { label: draft.label.trim(), scope: draft.scope, ttlDays: draft.ttlDays },
        reason: draft.reason,
        fallback: "mcp_key_create_failed",
      });
      if (!data) throw new AdminCommandError("mcp_key_create_failed", 500);
      setKeys((current) => [data.key, ...current]);
      setCreated(data);
      setDraft(null);
    } catch (cause) {
      setError(messageFor(cause, "The key could not be created"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(reason: string) {
    if (!revoking) return;
    setBusy(true);
    setError(null);
    try {
      const data = await adminCommand<AdminMcpKeySummary>(`/api/admin/mcp-keys/${encodeURIComponent(revoking.id)}`, { method: "DELETE", reason, fallback: "mcp_key_revoke_failed" });
      if (data) setKeys((current) => current.map((key) => (key.id === data.id ? data : key)));
      if (created?.key.id === revoking.id) setCreated(null);
      setRevoking(null);
    } catch (cause) {
      setError(messageFor(cause, "The key could not be revoked"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card" aria-labelledby="mcp-keys-title">
      <div className="admin-card-head">
        <div>
          <h2 id="mcp-keys-title">Claude MCP keys</h2>
          <p>Let Claude use the owner console for you. A key acts as you, and every change made with it is in the audit log with its reason.</p>
        </div>
        {!created ? (
          <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => { setError(null); setDraft({ label: "", scope: "READ", ttlDays: 30, reason: "" }); }}>
            <Plus size={15} aria-hidden /> Create key
          </button>
        ) : null}
      </div>

      {error && !draft && !revoking ? <p className="form-error admin-message" role="alert">{error}</p> : null}

      {created ? (
        <div className="admin-form is-full">
          <p className="admin-callout"><TriangleAlert size={16} aria-hidden /><span>Copy this key now. It won’t be shown again, and anyone who has it can act as you in the owner console.</span></p>
          <code className="admin-secret">{created.token}</code>
          <div className="admin-actions"><CopyButton value={created.token} label="Copy key" /></div>
          <p className="admin-hint">To connect Claude Code, run this in a terminal:</p>
          <code className="admin-secret">{connectCommand(mcpUrl, created.token)}</code>
          <div className="admin-actions">
            <CopyButton value={connectCommand(mcpUrl, created.token)} label="Copy command" />
            <button className="button button-primary button-small" type="button" onClick={() => setCreated(null)}>Done</button>
          </div>
        </div>
      ) : null}

      {keys.length === 0 ? (
        <p className="admin-hint">No keys yet. Create one to connect Claude Code to {mcpUrl}.</p>
      ) : (
        <ul className="admin-list">
          {keys.map((key) => (
            <li key={key.id}>
              <span className="admin-list-main">
                <strong>{key.label}</strong>
                <span className="cell-meta">
                  {key.scope === "WRITE" ? "Read and write" : "Read only"} · {key.tokenPrefix}… · Expires {formatDate(key.expiresAt)} · {key.lastUsedAt ? `Last used ${formatDateTime(key.lastUsedAt)}` : "Never used"}
                </span>
              </span>
              <span className="admin-list-side">
                <StatusBadge tone={STATUS[key.status].tone} label={STATUS[key.status].label} />
                <Link className="button button-ghost button-small" href={`/admin/audit?mcpKeyId=${encodeURIComponent(key.id)}`} aria-label={`Audit log for ${key.label}`}>Audit log</Link>
                {key.status === "ACTIVE" ? (
                  <button className="button button-ghost button-small" type="button" disabled={busy} aria-label={`Revoke ${key.label}`} onClick={() => { setError(null); setRevoking(key); }}>
                    <Trash2 size={15} aria-hidden /> Revoke
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Presence>{draft ? (
        <AdminDialog
          title="Create an MCP key"
          busy={busy}
          onClose={() => { setDraft(null); setError(null); }}
          onSubmit={() => void createKey()}
          footer={(
            <>
              <button className="button button-ghost" type="button" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
              <button className="button button-primary" type="submit" disabled={busy || !draftReady}>{busy ? "Working…" : "Create key"}</button>
            </>
          )}
        >
          <p className="admin-dialog-intro">The key is shown once. Read only keys can look at everything; read and write keys can also make any change the console can, including permanent deletions.</p>
          {error ? <p className="form-error admin-message" role="alert">{error}</p> : null}
          <label className="field">
            <span>Name</span>
            <input value={draft.label} maxLength={80} autoComplete="off" placeholder="Work laptop" onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
          </label>
          <fieldset className="admin-segmented">
            <legend>Access</legend>
            <label><input type="radio" name="mcp-key-scope" checked={draft.scope === "READ"} onChange={() => setDraft({ ...draft, scope: "READ" })} /> Read only</label>
            <label><input type="radio" name="mcp-key-scope" checked={draft.scope === "WRITE"} onChange={() => setDraft({ ...draft, scope: "WRITE" })} /> Read and write</label>
          </fieldset>
          <label className="field">
            <span>Expires after</span>
            <select value={draft.ttlDays} onChange={(event) => setDraft({ ...draft, ttlDays: Number(event.target.value) })}>
              {TTL_OPTIONS.map((option) => <option key={option.days} value={option.days}>{option.label}</option>)}
            </select>
          </label>
          <ReasonField value={draft.reason} onChange={(reason) => setDraft({ ...draft, reason })} rows={2} />
        </AdminDialog>
      ) : null}</Presence>

      <Presence>{revoking ? (
        <ReasonDialog
          title={`Revoke ${revoking.label}`}
          intro="Claude stops being able to use this key straight away. This can’t be undone."
          danger
          busy={busy}
          error={error}
          confirmLabel="Revoke key"
          onCancel={() => { setRevoking(null); setError(null); }}
          onConfirm={(reason) => void revokeKey(reason)}
        />
      ) : null}</Presence>
    </section>
  );
}
