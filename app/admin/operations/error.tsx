"use client";

export default function OperationsError({ retry }: { retry: () => void }) {
  return (
    <main className="page-wrap admin-resource-page">
      <div className="empty-state">
        <h1>Operations unavailable</h1>
        <p role="alert">A bounded data query failed. No action was executed.</p>
        <button className="button button-secondary" onClick={retry} type="button">Try again</button>
      </div>
    </main>
  );
}
