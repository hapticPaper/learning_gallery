const CHANGELOG_URL = "https://www.charlielabs.ai/changelog";

export const RECENT_CHANGELOG_WINDOW_DAYS = 15;

type ChangelogFetchCache = "force-cache" | "no-store";

const LATEST_ENTRY_REGEX =
  /<div id="([^"]+)"[^>]*>[\s\S]*?<a[^>]+href="\?entry=[^"]+"[^>]*>([^<]+)<\/a>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/;

export type CharlieChangelogEntry = {
  id: string;
  title: string;
  dateText: string;
  date: Date;
  url: string;
};

/**
* Determines "recency" using whole UTC calendar days (via `getDaysSince`).
*/
export function isChangelogEntryRecent(date: Date, now = new Date()): boolean {
  const daysSince = getDaysSince(date, now);
  return daysSince !== null && daysSince < RECENT_CHANGELOG_WINDOW_DAYS;
}

/**
* Fetches the latest entry from the public Charlie Labs changelog page.
*
* Intended for offline/scheduled snapshot generation (avoid calling in per-request code paths).
*
* `cache` defaults to `"force-cache"`. Scheduled scripts should generally run this at most once a day.
*/
export async function getLatestCharlieChangelogEntry({
  cache = "force-cache",
}: {
  cache?: ChangelogFetchCache;
} = {}): Promise<CharlieChangelogEntry | null> {
  try {
    const response = await fetch(CHANGELOG_URL, { cache });
    if (!response.ok) return null;

    const html = await response.text();
    const match = html.match(LATEST_ENTRY_REGEX);
    if (!match) return null;

    const [, idRaw, dateTextRaw, titleRaw] = match;
    const dateText = decodeHtmlEntities(dateTextRaw.trim());
    const title = decodeHtmlEntities(titleRaw.trim());
    const date = new Date(dateText);
    const url = `${CHANGELOG_URL}?entry=${idRaw}`;

    return {
      id: idRaw,
      dateText,
      title,
      date,
      url,
    };
  } catch {
    return null;
  }
}

/**
* Returns the whole-day difference between `date` and `now` using UTC day units.
*
* Negative values mean the date is in the future.
*/
export function getDaysSince(date: Date, now = new Date()): number | null {
  if (Number.isNaN(date.getTime())) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  const dateUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const deltaMs = nowUtc - dateUtc;
  return Math.floor(deltaMs / msPerDay);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return safeFromCodePoint(codePoint) ?? match;
    })
    .replace(/&#([0-9]+);/g, (match, num: string) => {
      const codePoint = Number.parseInt(num, 10);
      return safeFromCodePoint(codePoint) ?? match;
    });
}

function safeFromCodePoint(codePoint: number): string | null {
  if (!Number.isFinite(codePoint)) return null;
  if (codePoint < 0 || codePoint > 0x10ffff) return null;
  return String.fromCodePoint(codePoint);
}
