"use client";

export default function AdminError({ retry }: { retry: () => void }) {
  return (
    <main className="page-wrap admin-page">
      <div className="admin-card admin-empty">
        <h1>This page could not load</h1>
        <p role="alert">Linkar could not reach its data just now. Nothing was changed. Try again in a moment.</p>
        <button className="button button-secondary" onClick={retry} type="button">Try again</button>
      </div>
    </main>
  );
}
