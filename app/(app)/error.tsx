"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary for every workspace screen. It renders inside the (app)
 * layout, so the sidebar stays usable and people can move to another page
 * instead of facing a blank tab. retry() re-fetches and re-renders the
 * segment, which covers the usual cause (a flaky request during render).
 */
export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-wrap workspace-error">
      <div className="empty-state" role="alert">
        <h1>This page could not load</h1>
        <p>Something went wrong while showing this page. Your automations keep running. Try again, or pick another page from the menu.</p>
        <div className="button-row">
          <button className="button button-primary" type="button" onClick={() => retry()}>Try again</button>
          <Link className="button button-secondary" href="/dashboard">Go to Home</Link>
        </div>
        {error.digest ? <p className="muted workspace-error-ref">Reference: {error.digest}</p> : null}
      </div>
    </div>
  );
}
