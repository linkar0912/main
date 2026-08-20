import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

export function PublicPage({
  title,
  intro,
  children,
}: Readonly<{ title: string; intro: string; children: React.ReactNode }>) {
  return (
    <main className="legal-page">
      <div className="legal-top">
        <Link className="brand" href="/"><span className="brand-mark">D</span><span>DMSetu</span></Link>
        <Link className="back-link" href="/"><ArrowLeft size={15} /> Back to app</Link>
      </div>
      <article className="legal-content">
        <p className="eyebrow">DMSetu / public policy</p>
        <h1>{title}</h1>
        <p className="legal-meta">Last updated: 20 August 2026</p>
        <p className="legal-intro">{intro}</p>
        {children}
      </article>
      <p className="legal-footer">Questions? <a href="mailto:support@dmsetu.app">support@dmsetu.app</a> <ExternalLink size={12} /></p>
    </main>
  );
}
