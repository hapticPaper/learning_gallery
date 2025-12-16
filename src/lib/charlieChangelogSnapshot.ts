import rawSnapshot from "@/data/charlie-changelog.json";

export type CharlieChangelogSnapshotEntry = {
  id: string;
  title: string;
  dateText: string;
  dateIso: string | null;
  url: string;
};

export type CharlieChangelogSnapshot = {
  hasRecentChangelog: boolean;
  latestEntry: CharlieChangelogSnapshotEntry | null;
};

export function getCharlieChangelogSnapshot(): CharlieChangelogSnapshot {
  const snapshot = rawSnapshot as unknown;
  if (!snapshot || typeof snapshot !== "object") {
    return { hasRecentChangelog: false, latestEntry: null };
  }

  const record = snapshot as Record<string, unknown>;

  const hasRecentChangelog = record.hasRecentChangelog === true;
  const latestEntry = parseSnapshotEntry(record.latestEntry);

  return {
    hasRecentChangelog: hasRecentChangelog && Boolean(latestEntry),
    latestEntry,
  };
}

function parseSnapshotEntry(input: unknown): CharlieChangelogSnapshotEntry | null {
  if (!input || typeof input !== "object") return null;

  const record = input as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const title = typeof record.title === "string" ? record.title : null;
  const dateText = typeof record.dateText === "string" ? record.dateText : null;
  const url = typeof record.url === "string" ? record.url : null;
  const rawDateIso = record.dateIso;
  const dateIso =
    rawDateIso === null ||
    (typeof rawDateIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDateIso))
      ? rawDateIso
      : null;

  if (!id || !title || !dateText || !url) return null;

  return {
    id,
    title,
    dateText,
    dateIso,
    url,
  };
}
