"use client";

import Link from "next/link";
import { LayoutTemplate, Plus, Workflow } from "lucide-react";
import { AppShell } from "./app-shell";
import { AutomationList, useAutomations } from "./automation-list";
import { AutomationSectionNav } from "./automation-section-nav";

export function AutomationsScreen() {
  const { automations, loading, error, setStatus } = useAutomations();
  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header">
          <div><p className="eyebrow">Workspace / automation</p><h1>Automations</h1><p className="muted page-lede">Rules that turn Instagram signals into helpful, timely replies.</p></div>
          <div className="header-actions">
            <Link className="button button-secondary" href="/automations/templates"><LayoutTemplate size={17} /> Templates</Link>
            <Link className="button button-primary" href="/automations/new"><Plus size={17} /> New automation</Link>
          </div>
        </header>
        <div className="section-layout">
          <AutomationSectionNav active="my" />
          <div className="section-content">
            <div className="list-intro"><div className="list-count"><Workflow size={17} /><span>{loading ? "Loading" : `${automations.length} ${automations.length === 1 ? "automation" : "automations"}`}</span></div><span className="muted">Everything is explicit and editable.</span></div>
            <section className="panel full-list-panel">
              {error ? <p className="form-error" role="alert">{error}</p> : <AutomationList automations={automations} loading={loading} onStatusChange={setStatus} />}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
