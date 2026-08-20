"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, CheckCircle2, Plus, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { AppShell } from "./app-shell";
import { AutomationList, useAutomations } from "./automation-list";
import { MetricCard } from "./metric-card";
import { PRODUCT_NAME } from "@/src/lib/branding";

export function DashboardScreen() {
  const { automations, loading, error, setStatus } = useAutomations();
  const [demoMode, setDemoMode] = useState(false);
  const activeCount = automations.filter((automation) => automation.status === "ACTIVE").length;

  useEffect(() => {
    void fetch("/api/health")
      .then((response) => response.json())
      .then((health: { mode?: string }) => setDemoMode(health.mode === "demo"))
      .catch(() => setDemoMode(false));
  }, []);

  return (
    <AppShell>
      <div className="page-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Control room / overview</p>
            <h1>Make every signal useful.</h1>
            <p className="muted page-lede">Build predictable comment and DM replies for your Instagram audience.</p>
          </div>
          <Link className="button button-primary" href="/automations/new"><Plus size={17} /> New automation</Link>
        </header>

        {demoMode ? <div className="demo-banner">
          <span className="signal-dot" />
          <div><strong>You’re in demo mode.</strong><span>Explore the builder with sample data. Connect Instagram in Settings when you’re ready to test delivery.</span></div>
          <Link href="/settings">Connect account <ArrowUpRight size={15} /></Link>
        </div> : null}

        <section className="metrics-grid" aria-label="Workspace summary">
          <MetricCard label="Active flows" value={loading ? "—" : String(activeCount)} note="Ready to listen" icon={Activity} tone="saffron" />
          <MetricCard label="Total automations" value={loading ? "—" : String(automations.length)} note="Across your workspace" icon={Workflow} tone="mint" />
          <MetricCard label="AI assistant" value="Off" note="Deterministic rules only" icon={ShieldCheck} tone="lavender" />
        </section>

        <div className="dashboard-grid">
          <section className="panel automations-panel">
            <div className="panel-heading"><div><p className="eyebrow">Your systems</p><h2>Automations</h2></div><Link className="text-link" href="/automations">Manage all <ArrowUpRight size={15} /></Link></div>
            {error ? <p className="form-error" role="alert">{error}</p> : <AutomationList automations={automations} loading={loading} compact onStatusChange={setStatus} />}
          </section>

          <aside className="panel way-panel">
            <div className="way-icon"><Sparkles size={20} /></div>
            <p className="eyebrow">The {PRODUCT_NAME} way</p>
            <h2>Simple rules. Clear outcomes.</h2>
            <div className="way-steps">
              <div><span>01</span><p><strong>Listen</strong><small>Comment or DM arrives.</small></p></div>
              <div><span>02</span><p><strong>Check</strong><small>Your keywords and conditions run.</small></p></div>
              <div><span>03</span><p><strong>Reply</strong><small>The exact message you wrote is sent.</small></p></div>
            </div>
            <div className="way-foot"><CheckCircle2 size={16} /> No scraping. No surprise replies.</div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
