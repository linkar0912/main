import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { LinkarMark } from "@/src/components/linkar-mark";

export function PublicPage({
  title,
  intro,
  children,
}: Readonly<{ title: string; intro: string; children: React.ReactNode }>) {
  const supportEmail = getServerEnv().supportEmail;
  return (
    <main className="legal-page">
      <div className="legal-top">
        <Link className="brand" href="/"><span className="brand-mark"><LinkarMark size={17} /></span><span>{PRODUCT_NAME}</span></Link>
        <Link className="back-link" href="/dashboard"><ArrowLeft size={15} /> Back to app</Link>
      </div>
      <article className="legal-content">
        <p className="eyebrow">{PRODUCT_NAME} / public policy</p>
        <h1>{title}</h1>
        <p className="legal-meta">Last updated: 30 August 2026</p>
        <p className="legal-intro">{intro}</p>
        {children}
      </article>
      <p className="legal-footer">Questions? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> <ExternalLink size={12} /></p>
    </main>
  );
}
