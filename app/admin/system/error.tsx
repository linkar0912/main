"use client";

export default function SystemError({ retry }: { retry: () => void }) {
  return (
    <main className="page-wrap admin-page">
      <div className="admin-card admin-empty">
        <h1>Service health could not load</h1>
        <p role="alert">The health check did not finish. Nothing was changed.</p>
        <button className="button button-secondary" onClick={retry} type="button">Try again</button>
      </div>
    </main>
  );
}
