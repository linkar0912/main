import type { Metadata } from "next";
import Link from "next/link";
import { LinkarMark } from "@/src/components/linkar-mark";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const metadata: Metadata = {
  title: `Page not found · ${PRODUCT_NAME}`,
  robots: { index: false, follow: false },
};

/**
 * The 404 for unmatched URLs and for any notFound() without a closer boundary.
 * It renders inside the root layout, so it follows the stored light/dark theme,
 * and it keeps to neutral chrome (no marketing navigation) because the app and
 * the owner console can land here too.
 */
export default function NotFound() {
  return (
    <main className="not-found-page">
      <Link className="not-found-wordmark" href="/" aria-label={`${PRODUCT_NAME} home`}>
        <LinkarMark />
        {PRODUCT_NAME}
      </Link>
      <div className="not-found-body">
        <h1>Page not found</h1>
        <p>The link may be mistyped, or the page has moved. Check the address, or head back to the start.</p>
        <div className="not-found-actions">
          <Link className="button button-primary" href="/">Go to the home page</Link>
          <Link className="button button-secondary" href="/support" prefetch={false}>Get help</Link>
        </div>
      </div>
    </main>
  );
}
