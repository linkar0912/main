import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Manrope } from "next/font/google";
import { SiteAnalytics } from "@/src/components/site-analytics";
import { getAnalyticsMeasurementId } from "@/src/lib/env";
import "./globals.css";

/* Brand type system - display carries headlines, sans carries the UI,
   mono carries IDs and handles. Self-hosted by next/font. */
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const sans = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Linkar - Instagram and Facebook automation, made clear",
  description: "Deterministic Instagram conversations and Facebook Page public comment replies for creators and businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const gaMeasurementId = getAnalyticsMeasurementId();

  return (
    <html
      lang="en"
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
        <SiteAnalytics measurementId={gaMeasurementId} />
      </body>
    </html>
  );
}
