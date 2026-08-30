import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";

const legalDocuments = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Data deletion", href: "/data-deletion" },
] as const;

export function PublicPage({
  title,
  intro,
  currentPath,
  children,
}: Readonly<{ title: string; intro: string; currentPath?: string; children: React.ReactNode }>) {
  const supportEmail = getServerEnv().supportEmail;
  const isPolicyPage = Boolean(currentPath);
  return (
    <div className="legal-page-root" data-header-tone="light" data-policy={currentPath?.slice(1) ?? "public"}>
      <MarketingHeader />
      <main className="legal-page">
        <section className="legal-hero" aria-labelledby="legal-title">
          <div className="legal-hero-inner">
            <p className="legal-kicker">{PRODUCT_NAME} / {isPolicyPage ? "policies" : "public information"}</p>
            <h1 id="legal-title">{title}</h1>
            <p className="legal-intro">{intro}</p>
            <div className="legal-update-line">
              <span>Effective</span>
              <strong>30 August 2026</strong>
              <span>Clear terms for Instagram and Facebook automation</span>
            </div>
          </div>
        </section>

        <div className="legal-layout">
          <aside className="legal-rail">
            {isPolicyPage ? (
              <nav className="legal-document-nav" aria-label="Legal documents">
                <p>Policy set</p>
                {legalDocuments.map((document) => (
                  <Link
                    key={document.href}
                    href={document.href}
                    aria-current={currentPath === document.href ? "page" : undefined}
                  >
                    <span>{document.label}</span>
                    <ArrowUpRight size={15} strokeWidth={1.8} />
                  </Link>
                ))}
              </nav>
            ) : null}

            <div className="legal-contact-card">
              <Mail size={19} strokeWidth={1.8} />
              <div>
                <p>Need clarification?</p>
                <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
              </div>
            </div>
          </aside>

          <article className="legal-content" aria-label={`${title} content`}>
            {children}
          </article>
        </div>
      </main>
      <MarketingFooter compact />
    </div>
  );
}
