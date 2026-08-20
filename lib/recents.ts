// Lightweight "recently viewed" tracker backed by localStorage.
// Records the last client/matter records the user opened, newest first.

export type RecentKind = "client" | "matter";
export type RecentItem = {
  kind: RecentKind;
  id: string;
  name: string;
  at: number;
};

const KEY = "recentRecords";
const MAX = 5;

export function pushRecent(kind: RecentKind, id: string, name: string): void {
  if (typeof window === "undefined" || !id || !name) return;
  try {
    const list = getRecents().filter((r) => !(r.kind === kind && r.id === id));
    list.unshift({ kind, id, name, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

export function getRecents(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentItem[]) : [];
  } catch {
    return [];
  }
}
