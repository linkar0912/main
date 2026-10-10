"use client";

export default function OperationsError({ retry }: { retry: () => void }) {
  return (
    <main className="page-wrap admin-page">
      <div className="admin-card admin-empty">
        <h1>Records could not load</h1>
        <p role="alert">The search did not finish. Nothing was changed. Try again in a moment.</p>
        <button className="button button-secondary" onClick={retry} type="button">Try again</button>
      </div>
    </main>
  );
}
