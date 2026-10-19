export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-14 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-28" />)}
      </div>
    </div>
  );
}
