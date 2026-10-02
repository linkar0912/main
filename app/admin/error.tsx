"use client";

export default function AdminError({ retry }: { retry: () => void }) {
  return <main className="page-wrap admin-resource-page"><h1>Admin data unavailable</h1><p role="alert">The admin request could not be completed. Try again when the service is available.</p><button className="button button-secondary" onClick={retry} type="button">Try again</button></main>;
}
