import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Manrope } from "next/font/google";
import { SiteAnalytics } from "@/src/components/site-analytics";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { OPEN_GRAPH_DEFAULTS, publicSiteOrigin } from "@/src/lib/site-url";
// Only the rules the public website can use. The app, owner console and
// onboarding layouts add the full app/globals.css; public.css is generated
// from it by `pnpm css:public` (scripts/build-public-css.mjs).
import "./public.css";

/* Brand type system - display carries headlines, sans carries the UI,
   mono carries IDs and handles. Self-hosted by next/font. */
const display = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", variable: "--font-display" });
const sans = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
// Mono only sets IDs, handles and small labels, never above-the-fold text on
// the public pages, so it is not preloaded: 24 KB less competing with the
// stylesheet and the hero font on every first visit.
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-mono" });

const DEFAULT_TITLE = `${PRODUCT_NAME} · Instagram and Facebook automation, made clear`;
const DEFAULT_DESCRIPTION = "Deterministic Instagram conversations and Facebook Page public comment replies for creators and businesses.";

// No title.template: the signed-in app pages already set full "X · Linkar"
// titles, and a template would double the suffix on every one of them.
export const metadata: Metadata = {
  metadataBase: new URL(publicSiteOrigin()),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  applicationName: PRODUCT_NAME,
  // Shared Open Graph basics. A page that sets its own openGraph replaces this
  // object wholesale, so pages that do (home, pricing) repeat these fields.
  // Titles are left out here so a page without its own og:title falls back
  // to its <title> rather than inheriting the homepage's.
  openGraph: OPEN_GRAPH_DEFAULTS,
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-IN"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* Apply the stored theme before first paint so dark mode never flashes. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('linkar-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}",
          }}
        />
      </head>
      <body>
        {children}
        <SiteAnalytics />
      </body>
    </html>
  );
}
