"use client";
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="card space-y-3">
      <h1 className="text-lg font-semibold">We couldn&apos;t load this page</h1>
      <p className="text-sm text-muted">This is usually temporary. Check your connection and try again.</p>
      <button className="btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
