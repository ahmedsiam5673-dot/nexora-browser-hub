export interface Orderable { id: number; pinned: boolean }

/** Pinned tabs always sit at the left; relative order inside each group is preserved. */
export function normalizeOrder<T extends Orderable>(tabs: T[]): T[] {
  return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
}

/** Move a tab to `toIndex`, clamped into its own group (pinned vs unpinned). Returns a new array. */
export function moveTab<T extends Orderable>(tabs: T[], id: number, toIndex: number): T[] {
  const from = tabs.findIndex((t) => t.id === id);
  if (from < 0) return tabs;
  const tab = tabs[from]!;
  const pinnedCount = tabs.filter((t) => t.pinned).length;
  const [lo, hi] = tab.pinned ? [0, pinnedCount - 1] : [pinnedCount, tabs.length - 1];
  const target = Math.max(lo, Math.min(hi, Math.trunc(toIndex)));
  const next = [...tabs];
  next.splice(from, 1);
  next.splice(target, 0, tab);
  return next;
}

/** Which tab becomes active after closing `closingId` (the neighbour to the right, else left). */
export function nextActiveAfterClose<T extends Orderable>(tabs: T[], closingId: number): number | null {
  const i = tabs.findIndex((t) => t.id === closingId);
  if (i < 0) return tabs[0]?.id ?? null;
  const rest = tabs.filter((t) => t.id !== closingId);
  if (rest.length === 0) return null;
  return (rest[i] ?? rest[i - 1] ?? rest[0])!.id;
}
