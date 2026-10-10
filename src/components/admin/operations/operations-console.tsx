"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, RefreshCcw } from "lucide-react";

import type { AdminOperationDetail, AdminOperationItem, AdminOperationKind, AdminOperationPage } from "@/src/lib/admin/operations/types";
import { adminOperationKinds, adminOperationStatuses } from "@/src/lib/admin/operations/types";
import { adminErrorMessage, adminQuery } from "../shared/admin-request";
import { AdminPagination } from "../shared/admin-pagination";
import { CursorTable } from "../shared/cursor-table";
import { FilterBar } from "../shared/filter-bar";
import { OperationDetailDrawer } from "./operation-detail-drawer";

const REFRESH_INTERVAL_MS = 20_000;
// Tracked links are not bound to a provider; a provider filter would always return nothing.
const kindsWithoutProvider: readonly AdminOperationKind[] = ["tracked_link"];
// The free-text filter searches a different field for each resource kind.
const textFilters: Record<AdminOperationKind, { label: string; placeholder: string }> = {
  automation: { label: "Name", placeholder: "Automation name" },
  sequence: { label: "Name", placeholder: "Sequence name" },
  broadcast: { label: "Name", placeholder: "Broadcast name" },
  contact: { label: "Contact", placeholder: "Email, @handle, or Instagram user ID" },
  tracked_link: { label: "Slug", placeholder: "Link slug" },
  delivery: { label: "Delivery kind", placeholder: "AUTOMATION_DM" },
  webhook: { label: "Event type", placeholder: "comment.created" },
};

export function OperationsConsole({ kind, page, filters, cursor = null, history = [] }: { kind: AdminOperationKind; page: AdminOperationPage; filters: Record<string, string>; cursor?: string | null; history?: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<AdminOperationDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => detailAbortRef.current?.abort(), []);

  const navigate = useCallback((next: Record<string, string>) => {
    const params = new URLSearchParams({ ...filters, ...next });
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    router.push(`/admin/operations?${params}`);
  }, [filters, router]);

  function switchKind(next: AdminOperationKind) {
    // Statuses differ per resource kind, so a carried-over status would be rejected.
    navigate({ kind: next, cursor: "", status: "", ...(kindsWithoutProvider.includes(next) ? { provider: "" } : {}) });
  }

  async function open(item: AdminOperationItem, button: HTMLButtonElement) {
    returnFocus.current = button;
    setDrawerOpen(true);
    setLoading(true);
    setSelected(null);
    setError(null);
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    try {
      const detail = await adminQuery<AdminOperationDetail>(`/api/admin/operations/${item.kind}/${item.id}`, { signal: controller.signal, fallback: "operation_unavailable" });
      if (controller.signal.aborted) return;
      setSelected(detail);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(adminErrorMessage(cause, "Operation unavailable"));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function closeDrawer() {
    detailAbortRef.current?.abort();
    setDrawerOpen(false);
    setSelected(null);
    setTimeout(() => returnFocus.current?.focus(), 0);
  }

  function close() {
    // A confirmation dialog owns dismissal while it is open.
    if (document.querySelector("[data-admin-confirmation]")) return;
    closeDrawer();
  }

  function complete(message: string) {
    setNotice(message);
    closeDrawer();
    router.refresh();
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !drawerOpen) router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [drawerOpen, router]);

  return (
    <main className="page-wrap admin-resource-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator / cross-tenant work</p>
          <h1>Operations</h1>
          <p className="muted page-lede">Inspect and recover application resources without exposing message bodies or provider payloads.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => router.refresh()}><RefreshCcw size={16} /> Refresh</button>
      </header>

      <nav className="admin-section-tabs" aria-label="Operation types">
        {adminOperationKinds.map((item) => (
          <button className={item === kind ? "is-active" : ""} aria-current={item === kind ? "page" : undefined} type="button" key={item} onClick={() => switchKind(item)}>
            {item.replaceAll("_", " ")}
          </button>
        ))}
      </nav>

      <FilterBar
        key={JSON.stringify(filters)}
        initial={filters}
        statuses={adminOperationStatuses[kind]}
        showProvider={!kindsWithoutProvider.includes(kind)}
        textLabel={textFilters[kind].label}
        textPlaceholder={textFilters[kind].placeholder}
        onApply={(next) => navigate({ ...next, cursor: "" })}
      />

      {notice
        ? <div className="form-success" role="status">{notice}</div>
        : <span className="sr-only" aria-live="polite">{page.items.length} results</span>}

      <section className="panel admin-table-panel" aria-label={`${kind.replaceAll("_", " ")} operations`}>
        <CursorTable items={page.items} onOpen={open} />
      </section>

      <AdminPagination
        basePath="/admin/operations"
        params={{ ...filters, kind }}
        cursor={cursor}
        history={history}
        nextCursor={page.nextCursor}
        label="Operation pagination"
        summary={<><Activity size={14} /> {page.items.length} results on this page</>}
      />

      {drawerOpen ? (
        <>
          <button className="admin-drawer-scrim" type="button" aria-label="Close operation detail" onClick={close} />
          <OperationDetailDrawer detail={selected} loading={loading} error={error} onClose={close} onComplete={complete} />
        </>
      ) : null}
    </main>
  );
}
