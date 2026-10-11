import Link from "next/link";
import { getServerEnv } from "@/src/lib/env";
import { LEGAL_ENTITY } from "@/src/lib/legal-entity";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";

const legalDocuments = [
  { label: "Terms of service", href: "/terms" },
  { label: "Refund and cancellation", href: "/refund-policy" },
  { label: "Acceptable use policy", href: "/acceptable-use" },
  { label: "Privacy policy", href: "/privacy" },
  { label: "Cookies statement", href: "/cookies" },
  { label: "Data processing addendum", href: "/data-processing" },
  { label: "Service providers", href: "/service-providers" },
  { label: "Data deletion", href: "/data-deletion" },
] as const;

const DEFAULT_EFFECTIVE_DATE = LEGAL_ENTITY.effectiveDate;

/**
 * Legal document layout: an index of the policy set on the left, the document
 * itself on the right, opening on its effective date. The document leads with
 * its own title rather than a separate hero band, so the page reads as one
 * continuous piece of paper the way a contract does. On phones the document
 * comes first and the index follows it.
 *
 * Only policy pages (those passing currentPath) carry an effective date; the
 * support, contact and status pages are not dated documents.
 */
export function PublicPage({
  title,
  intro,
  currentPath,
  effectiveDate = DEFAULT_EFFECTIVE_DATE,
  children,
}: Readonly<{
  title: string;
  intro: string;
  currentPath?: string;
  effectiveDate?: string;
  children: React.ReactNode;
}>) {
  const supportEmail = getServerEnv().supportEmail;
  const isPolicyPage = Boolean(currentPath);

  return (
    <div className="legal-page-root" data-header-tone="light" data-policy={currentPath?.slice(1) ?? "public"}>
      <MarketingHeader forceSurface="solid" />
      <main className="legal-page">
        <div className="legal-layout">
          <aside className="legal-rail">
            {isPolicyPage ? (
              <nav className="legal-document-nav" aria-label="Legal documents">
                <p className="legal-document-nav-title" aria-hidden="true">All legal documents</p>
                {legalDocuments.map((document) => (
                  <Link
                    key={document.href}
                    href={document.href}
                    aria-current={currentPath === document.href ? "page" : undefined}
                  >
                    {document.label}
                  </Link>
                ))}
              </nav>
            ) : null}

            <div className="legal-contact-card">
              <p>{isPolicyPage ? "Questions about this document?" : "Need a hand? Email us"}</p>
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
            </div>
          </aside>

          <article className="legal-content" aria-label={`${title} content`}>
            {isPolicyPage ? (
              <div className="legal-meta">
                <p>Effective date: {effectiveDate}</p>
              </div>
            ) : null}
            <h1 id="legal-title">{title}</h1>
            <p className="legal-intro">{intro}</p>
            {children}
          </article>
        </div>
      </main>
      <MarketingFooter compact />
    </div>
  );
}
