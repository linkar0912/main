"use client";

export default function SystemError({ retry }: { retry: () => void }) {
  return (
    <main className="page-wrap admin-resource-page">
      <div className="empty-state">
        <h1>System snapshot unavailable</h1>
        <p role="alert">No runtime state was changed.</p>
        <button className="button button-secondary" onClick={retry} type="button">Retry snapshot</button>
      </div>
    </main>
  );
}
