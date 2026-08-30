"use client";

import { useCallback, useMemo, useState } from "react";
import { KeyRound, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";

type Factor = {
  id: string;
  friendlyName: string;
  factorType: string;
  status: "verified" | "unverified";
};

export type AdminSecurityScreenState = {
  aal: "aal1" | "aal2";
  nextAal: "aal1" | "aal2";
  factors: Factor[];
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

type Removal = {
  factor: Factor;
  token: string;
  confirmationPhrase: string;
  confirmation: string;
  reason: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "This account is not allowed to access Linkar operator security.",
  invalid_mfa_code: "That verification code was not accepted. Wait for a fresh code and try again.",
  invalid_request: "Check the security form and try again.",
  last_verified_factor: "Add and verify a backup factor before removing this one.",
  mfa_provider_error: "MFA provider is temporarily unavailable. Your existing security settings were not changed.",
  security_operation_failed: "The security operation could not be completed.",
};

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `security-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function messageFor(error: unknown): string {
  const code = typeof error === "string" ? error : "security_operation_failed";
  return ERROR_MESSAGES[code] ?? "The security operation could not be completed.";
}

export function AdminSecurityScreen({
  ownerEmail,
  initialSecurity,
  onVerified = (path) => window.location.assign(path),
}: {
  ownerEmail: string;
  initialSecurity: AdminSecurityScreenState;
  onVerified?: (path: string) => void;
}) {
  const [security, setSecurity] = useState<AdminSecurityScreenState>(initialSecurity);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/security", { cache: "no-store" });
      const body = await readJson(response);
      if (!response.ok) throw body.error;
      setSecurity((body.data ?? initialSecurity) as AdminSecurityScreenState);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [initialSecurity]);

  const post = useCallback(async (body: Record<string, unknown>, reason: string) => {
    const response = await fetch("/api/admin/security", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-reason": reason,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);
    if (!response.ok) throw payload.error;
    return payload.data as Record<string, unknown>;
  }, []);

  const verifiedFactors = useMemo(
    () => security?.factors.filter((factor) => factor.status === "verified") ?? [],
    [security],
  );

  async function beginEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const data = await post({ action: "enroll" }, "Enroll owner MFA");
      setEnrollment(data as Enrollment);
      setCode("");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnrollment(event: React.FormEvent) {
    event.preventDefault();
    if (!enrollment || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    try {
      const data = await post(
        { action: "verify", factorId: enrollment.factorId, code },
        "Verify owner MFA",
      );
      onVerified(typeof data.redirectTo === "string" ? data.redirectTo : "/admin");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function prepareRemoval(factor: Factor) {
    setBusy(true);
    setError(null);
    try {
      const data = await post(
        { action: "prepare_unenroll", factorId: factor.id },
        `Prepare removal of MFA factor ${factor.friendlyName}`,
      );
      setRemoval({
        factor,
        token: String(data.token),
        confirmationPhrase: String(data.confirmationPhrase),
        confirmation: "",
        reason: "",
      });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(event: React.FormEvent) {
    event.preventDefault();
    if (!removal || removal.confirmation !== removal.confirmationPhrase || removal.reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await post({
        action: "unenroll",
        factorId: removal.factor.id,
        confirmation: removal.confirmation,
        challengeToken: removal.token,
      }, removal.reason.trim());
      setRemoval(null);
      await load();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap admin-security-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator</p>
          <h1>Owner security</h1>
          <p className="page-lede">MFA is the hard boundary around every cross-workspace write.</p>
        </div>
        <span className={`status-badge ${security?.aal === "aal2" ? "status-active" : "status-follow_required"}`}>
          {security?.aal === "aal2" ? "AAL2 verified" : "AAL1 only"}
        </span>
      </header>

      {error ? <p className="form-error admin-security-alert" role="alert">{error}</p> : null}

      <section className="panel admin-security-identity" aria-label="Owner identity">
        <span className="settings-icon"><ShieldCheck size={22} aria-hidden /></span>
        <div>
          <p className="eyebrow">Allowlisted Supabase identity</p>
          <h2>{ownerEmail}</h2>
          <p className="muted">Email is shown for recognition only. Authorization uses the exact server-side user UUID.</p>
        </div>
      </section>

      {security.aal !== "aal2" ? (
        <section className="panel admin-security-enrollment">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Required before access</p>
              <h2>MFA enrollment required</h2>
            </div>
            <LockKeyhole size={24} aria-hidden />
          </div>
          <p className="muted">Add Linkar to a TOTP authenticator, then enter one fresh six-digit code.</p>

          {!enrollment ? (
            <button className="button button-primary" type="button" disabled={busy} onClick={() => void beginEnrollment()}>
              <KeyRound size={16} aria-hidden /> Set up authenticator
            </button>
          ) : (
            <form className="admin-enrollment-grid" onSubmit={verifyEnrollment}>
              <div className="admin-qr-frame">
                {/* Supabase returns trusted enrollment SVG; encoding it prevents markup injection. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral data URI cannot use the image optimizer */}
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qrCode)}`}
                  alt="Linkar authenticator QR code"
                />
              </div>
              <div className="admin-enrollment-fields">
                <p className="muted">Can’t scan? Enter this secret manually:</p>
                <code className="admin-secret">{enrollment.secret}</code>
                <label className="field">
                  <span>Six-digit verification code</span>
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                  />
                </label>
                <button className="button button-primary" type="submit" disabled={busy || !/^\d{6}$/.test(code)}>
                  Verify and open admin
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {security.factors.length > 0 ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Authenticator inventory</p>
              <h2>Security factors</h2>
            </div>
          </div>
          <div className="admin-factor-list">
            {security.factors.map((factor) => (
              <div className="admin-factor-row" key={factor.id}>
                <span className="settings-icon"><KeyRound size={18} aria-hidden /></span>
                <div>
                  <strong>{factor.friendlyName}</strong>
                  <p>{factor.factorType.toUpperCase()} · {factor.status}</p>
                </div>
                {factor.status === "verified" && verifiedFactors.length > 1 ? (
                  <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => void prepareRemoval(factor)}>
                    <Trash2 size={15} aria-hidden /> Remove {factor.friendlyName}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {removal ? (
        <section className="panel admin-danger-panel" aria-labelledby="remove-factor-title">
          <h2 id="remove-factor-title">Remove {removal.factor.friendlyName}</h2>
          <p className="muted">This invalidates the selected recovery path. Another verified factor will remain.</p>
          <form onSubmit={removeFactor}>
            <label className="field field-wide">
              <span>Operator reason</span>
              <textarea value={removal.reason} onChange={(event) => setRemoval({ ...removal, reason: event.target.value })} />
            </label>
            <label className="field field-wide">
              <span>Type {removal.confirmationPhrase}</span>
              <input value={removal.confirmation} onChange={(event) => setRemoval({ ...removal, confirmation: event.target.value })} />
            </label>
            <div className="admin-security-actions">
              <button className="button button-secondary" type="button" onClick={() => setRemoval(null)}>Cancel</button>
              <button className="button button-primary" type="submit" disabled={busy || removal.reason.trim().length < 3 || removal.confirmation !== removal.confirmationPhrase}>
                Remove factor
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
