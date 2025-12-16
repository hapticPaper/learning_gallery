const CHANGELOG_URL = "https://www.charlielabs.ai/changelog";

const LATEST_ENTRY_REGEX =
  /<div id="([^"]+)"[^>]*>[\s\S]*?<a[^>]+href="\?entry=[^"]+"[^>]*>([^<]+)<\/a>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/;

export type CharlieChangelogEntry = {
  id: string;
  title: string;
  dateText: string;
  date: Date;
  url: string;
};

export async function getLatestCharlieChangelogEntry(): Promise<CharlieChangelogEntry | null> {
  try {
    const response = await fetch(CHANGELOG_URL, { cache: "force-cache" });
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

export function getDaysSince(date: Date, now = new Date()): number | null {
  if (Number.isNaN(date.getTime())) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  const deltaMs = now.getTime() - date.getTime();
  return Math.floor(deltaMs / msPerDay);
}

export function formatDaysAgo(days: number | null): string {
  if (days === null) return "recently";
  if (days < 0) return "in the future";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
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
