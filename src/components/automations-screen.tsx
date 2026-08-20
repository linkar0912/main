"use client";

import Link from "next/link";
import { Plus, Workflow } from "lucide-react";
import { AppShell } from "./app-shell";
import { AutomationList, useAutomations } from "./automation-list";

export function AutomationsScreen() {
  const { automations, loading, error, setStatus } = useAutomations();
  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header">
          <div><p className="eyebrow">Workspace / automations</p><h1>Automations</h1><p className="muted page-lede">Rules that turn Instagram signals into helpful, timely replies.</p></div>
          <Link className="button button-primary" href="/automations/new"><Plus size={17} /> New automation</Link>
        </header>
        <div className="list-intro"><div className="list-count"><Workflow size={17} /><span>{loading ? "Loading" : `${automations.length} ${automations.length === 1 ? "automation" : "automations"}`}</span></div><span className="muted">Everything is explicit and editable.</span></div>
        <section className="panel full-list-panel">
          {error ? <p className="form-error" role="alert">{error}</p> : <AutomationList automations={automations} loading={loading} onStatusChange={setStatus} />}
        </section>
      </div>
    </AppShell>
  );
}
