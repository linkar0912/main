"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so globals.css and the fonts are not available: styles are
 * inline and follow the system colour scheme.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Linkar</title>
        <style>{`
          :root { color-scheme: light dark; }
          body { background: #ffffff; color: #17181d; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; }
          main { box-sizing: border-box; margin: 0 auto; max-width: 520px; min-height: 100vh; display: grid; align-content: center; gap: 12px; padding: 24px 16px; }
          h1 { font-size: 1.5rem; margin: 0; }
          p { color: #44454e; line-height: 1.5; margin: 0; }
          button { background: #17181d; border: 0; border-radius: 999px; color: #ffffff; cursor: pointer; font: inherit; font-weight: 700; justify-self: start; padding: 10px 18px; }
          @media (prefers-color-scheme: dark) {
            body { background: #101116; color: #ececee; }
            p { color: #c7c8cd; }
            button { background: #ececee; color: #101116; }
          }
        `}</style>
        <main>
          <h1>Linkar could not load</h1>
          <p role="alert">Something went wrong on our side. Your automations keep running. Try again in a moment.</p>
          <button type="button" onClick={() => retry()}>Try again</button>
        </main>
      </body>
    </html>
  );
}
