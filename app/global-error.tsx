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

  // Follow a stored theme choice as well as the system setting.
  useEffect(() => {
    try {
      const theme = localStorage.getItem("linkar-theme");
      if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
    } catch {
      // Storage blocked: the system colour scheme still applies.
    }
  }, []);

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
          button { background: #17181d; border: 0; border-radius: 10px; color: #ffffff; cursor: pointer; font: inherit; font-weight: 600; justify-self: start; min-height: 44px; padding: 10px 18px; }
          button:focus-visible { outline: 2px solid #fa0cf7; outline-offset: 2px; }
          @media (prefers-color-scheme: dark) {
            :root:not([data-theme="light"]) body { background: #101116; color: #ececee; }
            :root:not([data-theme="light"]) p { color: #c7c8cd; }
            :root:not([data-theme="light"]) button { background: #ececee; color: #101116; }
          }
          :root[data-theme="dark"] body { background: #101116; color: #ececee; }
          :root[data-theme="dark"] p { color: #c7c8cd; }
          :root[data-theme="dark"] button { background: #ececee; color: #101116; }
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
