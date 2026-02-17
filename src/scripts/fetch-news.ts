import fs from "node:fs/promises";
import path from "node:path";

type StoryDraft = {
  title: string;
  url: string;
  source: string;
  date: string;
  seedText?: string;
  thumbnailUrl?: string;
  publisherName?: string;
  publisherUrl?: string;
  score?: number;
};

type ResolvedStory = {
  title: string;
  url: string;
  source: string;
  date: string;
  summary: string;
  blurb: string;
  thumbnailPath: string;
  slug: string;
};

const CONTENT_DIR = path.join(process.cwd(), "content", "news");
const THUMBNAILS_DIR = path.join(process.cwd(), "public", "news", "thumbnails");

const YOUTUBE_CHANNEL_ID = "UCIgnGlGkVRhd4qNFcEwLL4A";
const DEFAULT_RUN_LIMIT = 3;

type DateRange = {
  start?: Date;
  endExclusive?: Date;
};

const RUN_LIMIT = parsePositiveInt(process.env.NEWS_RUN_LIMIT) ?? DEFAULT_RUN_LIMIT;
const RUN_DATE_RANGE = parseDateRange({
  start: process.env.NEWS_START_DATE,
  end: process.env.NEWS_END_DATE,
});

// Comma-separated, case-insensitive substrings matched against Google News publisher names.
// Use `NEWS_DEBUG_FILTERS=1` to log details when items are filtered.
const BLOCKED_GOOGLE_NEWS_PUBLISHER_SUBSTRINGS = (process.env.NEWS_BLOCKED_PUBLISHERS ?? "motley fool")
  .split(",")
  .map((value) => normalizePublisherMatchText(value))
  .filter(Boolean);

const NEWS_DEBUG_FILTERS =
  process.env.NEWS_DEBUG_FILTERS === "1" && (process.env.NODE_ENV ?? "") !== "production";

function isBlockedGoogleNewsPublisher(publisherName: string): boolean {
  const normalized = ` ${normalizePublisherMatchText(publisherName)} `;
  return BLOCKED_GOOGLE_NEWS_PUBLISHER_SUBSTRINGS.some((blocked) => normalized.includes(` ${blocked} `));
}

function normalizePublisherMatchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  await fs.mkdir(CONTENT_DIR, { recursive: true });
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });

  if (NEWS_DEBUG_FILTERS) {
    console.log(
      JSON.stringify({
        event: "news_filter_config",
        source: "google_news",
        blockedPublisherCount: BLOCKED_GOOGLE_NEWS_PUBLISHER_SUBSTRINGS.length,
      }),
    );
  }

  const existingUrls = await listExistingUrls();
  const candidates = await getRunCandidates(RUN_DATE_RANGE);
  if (!candidates.length) {
    console.log("No candidates found.");
    return;
  }

  const nextStories: ResolvedStory[] = [];
  const batchSize = 4;

  for (let i = 0; i < candidates.length && nextStories.length < RUN_LIMIT; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(async (story) => resolveStory(story, existingUrls)));

    for (let j = 0; j < results.length && nextStories.length < RUN_LIMIT; j += 1) {
      const story = batch[j];
      const result = results[j];

      if (result?.status === "rejected") {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.warn(`Skipping candidate ${story?.url}: ${message}`);
        continue;
      }

      const resolved = result?.value;
      if (!resolved) continue;
      const dedupeUrl = normalizeUrlForDedup(resolved.url);
      if (existingUrls.has(dedupeUrl)) continue;
      existingUrls.add(dedupeUrl);
      nextStories.push(resolved);
    }
  }

  const created = await writeStories(nextStories);

  console.log(`Created ${created} news item(s).`);
}

async function getRunCandidates(dateRange: DateRange): Promise<StoryDraft[]> {
  const [hn, yt, google] = await Promise.all([
    getHackerNewsCandidates(dateRange),
    getYouTubeCandidates(dateRange),
    getGoogleNewsCandidates(dateRange),
  ]);

  const interleaved = interleaveCandidates([hn, yt, google]);
  if (!dateRange.start || !dateRange.endExclusive) return interleaved;

  const sorted = interleaved.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return spreadCandidatesAcrossRange(sorted, Math.min(sorted.length, RUN_LIMIT * 10));
}

async function getHackerNewsCandidates(dateRange: DateRange): Promise<StoryDraft[]> {
  type HackerNewsHit = {
    title: string;
    url: string | null;
    created_at_i: number;
    points: number;
    num_comments: number;
  };

  const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
  url.searchParams.set("query", "AI");
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", "100");
  url.searchParams.set("numericFilters", buildHackerNewsNumericFilters(dateRange));
  url.searchParams.set("restrictSearchableAttributes", "title");

  const firstPage = await fetchJson<{ hits: HackerNewsHit[]; nbPages?: number }>(url.toString());
  const nbPages = Math.min(firstPage.nbPages ?? 1, 30);

  const pages: HackerNewsHit[][] = [firstPage.hits];
  for (let page = 1; page < nbPages; page++) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("page", String(page));
    const response = await fetchJson<{ hits: HackerNewsHit[] }>(pageUrl.toString());
    pages.push(response.hits);
  }

  const seen = new Set<string>();
  const candidates: StoryDraft[] = [];

  for (const hit of pages.flat()) {
    if (!hit.url || !hit.title) continue;
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);

    candidates.push({
      title: hit.title,
      url: hit.url,
      source: "Hacker News",
      date: formatDateFromUnixSeconds(hit.created_at_i),
      score: hit.points + hit.num_comments,
    });
  }

  const keepCount = dateRange.start && dateRange.endExclusive ? Math.max(RUN_LIMIT * 50, 500) : Math.max(RUN_LIMIT * 20, 200);
  return candidates
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, keepCount)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

async function getYouTubeCandidates(dateRange: DateRange): Promise<StoryDraft[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
  const xml = await fetchText(feedUrl);

  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const picked: StoryDraft[] = [];
  const seen = new Set<string>();

  for (const entry of entries.slice(0, 25)) {
    const title = getXmlTag(entry, "title");
    const videoId = getXmlTag(entry, "yt:videoId");
    const published = getXmlTag(entry, "published");
    const description = getXmlTag(entry, "media:description");

    if (!title || !videoId || !published) continue;
    if (seen.has(videoId)) continue;
    seen.add(videoId);

    const publishedDate = published.slice(0, 10);
    if (!dateRangeIncludesDateOnly(dateRange, publishedDate)) continue;

    picked.push({
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      source: "The AI Search (YouTube)",
      date: publishedDate,
      seedText: normalizeText(description ?? ""),
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  }

  return picked;
}

async function getGoogleNewsCandidates(dateRange: DateRange): Promise<StoryDraft[]> {
  const rssUrl = buildGoogleNewsRssUrl(dateRange);
  const xml = await fetchText(rssUrl);

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const picked: StoryDraft[] = [];
  const seen = new Set<string>();

  for (const item of items.slice(0, 25)) {
    const rawTitle = decodeXmlEntities(stripCdata(getXmlTag(item, "title") ?? ""));
    const link = stripCdata(getXmlTag(item, "link") ?? "");
    const pubDateRaw = stripCdata(getXmlTag(item, "pubDate") ?? "");

    if (link.startsWith("https://news.google.com/rss/articles/")) continue;

    const { publisherName, publisherUrl } = parseGoogleNewsSource(item);

    if (publisherName && isBlockedGoogleNewsPublisher(publisherName)) {
      const baseUrl = link.split("?")[0];
      const host = (() => {
        try {
          return new URL(baseUrl).hostname;
        } catch {
          return null;
        }
      })();

      if (NEWS_DEBUG_FILTERS) {
        console.log(
          JSON.stringify({
            event: "filtered_google_news_item",
            source: "google_news",
            publisher: publisherName,
            host,
            baseUrl,
          }),
        );
      }
      continue;
    }

    const title = publisherName
      ? rawTitle.replace(new RegExp(`\\s+-\\s+${escapeRegExp(publisherName)}$`), "")
      : rawTitle;

    if (!title || !link) continue;
    if (seen.has(link)) continue;
    seen.add(link);

    const pubDate = pubDateRaw ? new Date(pubDateRaw) : new Date();
    const date = pubDate.toISOString().slice(0, 10);

    const source = publisherName ? `${publisherName} (via Google News)` : "Google News";

    picked.push({
      title,
      url: link,
      source,
      date,
      seedText: title,
      publisherName,
      publisherUrl,
      thumbnailUrl: publisherUrl
        ? `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(publisherUrl)}`
        : undefined,
    });
  }

  return picked;
}

function buildGoogleNewsRssUrl(dateRange: DateRange): string {
  const base = new URL("https://news.google.com/rss/search");
  const query = (() => {
    if (!dateRange.start || !dateRange.endExclusive) return "artificial intelligence when:1d";

    const start = formatDateOnly(dateRange.start);
    const endExclusive = formatDateOnly(dateRange.endExclusive);
    return `artificial intelligence after:${start} before:${endExclusive}`;
  })();

  base.searchParams.set("q", query);
  base.searchParams.set("hl", "en-US");
  base.searchParams.set("gl", "US");
  base.searchParams.set("ceid", "US:en");
  return base.toString();
}

function buildHackerNewsNumericFilters(dateRange: DateRange): string {
  const fallbackStart = Math.floor(Date.now() / 1000 - 60 * 60 * 24);
  if (!dateRange.start || !dateRange.endExclusive) {
    return `created_at_i>${fallbackStart}`;
  }

  const startSeconds = Math.floor(dateRange.start.getTime() / 1000);
  const endSeconds = Math.floor(dateRange.endExclusive.getTime() / 1000);
  return `created_at_i>=${startSeconds},created_at_i<${endSeconds}`;
}

function dateRangeIncludesDateOnly(range: DateRange, dateOnly: string): boolean {
  if (!range.start || !range.endExclusive) return true;
  const date = parseDateOnly(dateOnly);
  if (!date) return false;
  return date >= range.start && date < range.endExclusive;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateRange({ start, end }: { start?: string; end?: string }): DateRange {
  const parsedStart = parseDateOnly(start);
  const parsedEnd = parseDateOnly(end);

  if (!parsedStart && !parsedEnd) return {};

  const startDate = parsedStart ?? parsedEnd;
  const endDate = parsedEnd ?? parsedStart;
  if (!startDate || !endDate) return {};
  if (startDate > endDate) return {};

  return {
    start: startDate,
    endExclusive: new Date(endDate.getTime() + 24 * 60 * 60 * 1000),
  };
}

function parseDateOnly(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return parsed;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed <= 0) return undefined;
  return parsed;
}

function spreadCandidatesAcrossRange(candidates: StoryDraft[], bucketCount: number): StoryDraft[] {
  if (bucketCount <= 1 || candidates.length <= 1) return candidates;
  if (bucketCount >= candidates.length) return candidates;

  const pickedIndices = new Set<number>();
  const spread: StoryDraft[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const idx = Math.round((bucket * (candidates.length - 1)) / (bucketCount - 1));
    if (pickedIndices.has(idx)) continue;
    pickedIndices.add(idx);
    spread.push(candidates[idx]);
  }

  const remainder = candidates.filter((_, idx) => !pickedIndices.has(idx));
  return [...spread, ...remainder];
}

function interleaveCandidates(groups: StoryDraft[][]): StoryDraft[] {
  const maxLen = Math.max(...groups.map((group) => group.length), 0);
  const interleaved: StoryDraft[] = [];

  for (let i = 0; i < maxLen; i += 1) {
    for (const group of groups) {
      const item = group[i];
      if (item) interleaved.push(item);
    }
  }

  return interleaved;
}

async function resolveStory(
  story: StoryDraft,
  existingUrls: Set<string>,
): Promise<ResolvedStory | undefined> {
  const finalUrl = await resolveFinalUrl(story.url);
  const dedupeUrl = normalizeUrlForDedup(finalUrl);
  if (existingUrls.has(dedupeUrl)) return undefined;

  const resolvedSeedText = story.seedText?.trim() ? story.seedText : await getPageDescription(finalUrl);
  const summary = normalizeSummaryBody(resolvedSeedText || story.title);
  const blurb = normalizeBlurb(summary || story.title);

  const slug = await allocateSlug({ title: story.title, date: story.date });
  const thumbnailCandidate = story.thumbnailUrl ?? (await getPageThumbnailUrl(finalUrl));
  const thumbnailPath = await downloadThumbnail({
    slug,
    pageUrl: story.publisherUrl ?? finalUrl,
    imageUrl: thumbnailCandidate,
  });

  return {
    title: story.title,
    url: finalUrl,
    source: story.source,
    date: story.date,
    summary,
    blurb,
    thumbnailPath,
    slug,
  };
}

async function listExistingUrls(): Promise<Set<string>> {
  const urls = new Set<string>();
  const entries = await fs.readdir(CONTENT_DIR).catch(() => [] as string[]);
  const mdxFiles = entries.filter((name) => name.endsWith(".mdx"));

  for (const fileName of mdxFiles) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, fileName), "utf8").catch(() => "");
    const match = raw.match(/^url:\s*(.+)\s*$/m);
    const value = match?.[1]?.trim();
    if (!value) continue;

    const normalized = normalizeFrontmatterString(value);
    if (normalized) urls.add(normalizeUrlForDedup(normalized));
  }

  return urls;
}

function normalizeFrontmatterString(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }

  return value.replace(/^['"]|['"]$/g, "");
}

function normalizeUrlForDedup(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";

    const trackingKeys = new Set([
      "fbclid",
      "gclid",
      "igshid",
      "mc_cid",
      "mc_eid",
      "ref",
      "ref_src",
      "utm_campaign",
      "utm_content",
      "utm_id",
      "utm_medium",
      "utm_name",
      "utm_source",
      "utm_term",
      "yclid",
    ]);

    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith("utm_") || trackingKeys.has(key)) {
        url.searchParams.delete(key);
      }
    }

    const sortedParams = Array.from(url.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, val] of sortedParams) {
      url.searchParams.append(key, val);
    }

    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return trimmed;
  }
}

async function writeStories(stories: ResolvedStory[]): Promise<number> {
  let created = 0;

  for (const story of stories) {
    const mdxPath = path.join(CONTENT_DIR, `${story.slug}.mdx`);
    try {
      await fs.access(mdxPath);
      continue;
    } catch {
      // file doesn't exist
    }

    const mdx = buildMdx(story);
    await fs.writeFile(mdxPath, mdx, "utf8");
    created += 1;
  }

  return created;
}

function buildMdx(story: ResolvedStory): string {
  return [
    "---",
    `title: ${JSON.stringify(story.title)}`,
    `date: ${JSON.stringify(story.date)}`,
    `source: ${JSON.stringify(story.source)}`,
    `url: ${JSON.stringify(story.url)}`,
    `blurb: ${JSON.stringify(story.blurb)}`,
    `thumbnail: ${JSON.stringify(story.thumbnailPath)}`,
    "---",
    "",
    story.summary,
    "",
    `[Read the original](${story.url})`,
    "",
  ].join("\n");
}

async function allocateSlug({ title, date }: { title: string; date: string }): Promise<string> {
  const base = `${date}--${slugify(title)}`;
  const existing = new Set(await listExistingSlugs());

  if (!existing.has(base)) return base;

  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }

  throw new Error(`Unable to allocate slug for ${title}`);
}

async function listExistingSlugs(): Promise<string[]> {
  const entries = await fs.readdir(CONTENT_DIR).catch(() => [] as string[]);
  return entries.filter((name) => name.endsWith(".mdx")).map((name) => name.replace(/\.mdx$/, ""));
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return slug || "story";
}

function normalizeBlurb(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return normalized.length > 240 ? normalized.slice(0, 237).trimEnd() + "…" : normalized;
}

function normalizeSummaryBody(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= 260) return normalized;
  return words.slice(0, 260).join(" ").trimEnd() + "…";
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function getPageDescription(url: string): Promise<string | undefined> {
  let html: string;
  try {
    html = await fetchText(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to fetch HTML for description from ${url}: ${message}`);
    return undefined;
  }

  const tags = extractMetaTags(html);
  const desc =
    tags["og:description"] ||
    tags["twitter:description"] ||
    tags.description ||
    tags["parsely-description"];

  return desc ? normalizeText(decodeHtmlEntities(desc)) : undefined;
}

async function getPageThumbnailUrl(url: string): Promise<string | undefined> {
  let html: string;
  try {
    html = await fetchText(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to fetch HTML for thumbnail from ${url}: ${message}`);
    return undefined;
  }

  const tags = extractMetaTags(html);
  const image = tags["og:image"] || tags["twitter:image"] || tags["og:image:url"];
  if (image) return new URL(image, url).toString();

  const iconHref = findLinkHref(html, "icon") ?? findLinkHref(html, "shortcut icon");
  if (iconHref) return new URL(iconHref, url).toString();

  return undefined;
}

async function downloadThumbnail({
  slug,
  pageUrl,
  imageUrl,
}: {
  slug: string;
  pageUrl: string;
  imageUrl?: string;
}): Promise<string> {
  const fallback = `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(pageUrl)}`;
  const candidate = imageUrl ?? fallback;

  const response = await fetchWithTimeout(candidate, {
    headers: {
      "user-agent": "learning-gallery-news-bot",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    if (candidate !== fallback) {
      return downloadThumbnail({ slug, pageUrl, imageUrl: fallback });
    }
    throw new Error(`Unable to download thumbnail: ${candidate} (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "";
  const ext = guessImageExtension({ contentType, url: candidate });

  const fileName = `${slug}${ext}`;
  const filePath = path.join(THUMBNAILS_DIR, fileName);
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));

  return `/news/thumbnails/${fileName}`;
}

function guessImageExtension({ contentType, url }: { contentType: string; url: string }): string {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("svg")) return ".svg";

  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    if (ext && ext.length <= 6) return ext;
  } catch {
    // ignore
  }

  return ".jpg";
}

async function resolveFinalUrl(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, {
    redirect: "follow",
    headers: { "user-agent": "learning-gallery-news-bot" },
  });

  return response.url || url;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url, { headers: { "user-agent": "learning-gallery-news-bot" } });
  if (!response.ok) {
    throw new Error(`Request failed: ${url} (${response.status})`);
  }

  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const { hostname, pathname } = new URL(url);
  const isYouTubeRssFeed = hostname === "www.youtube.com" && pathname.startsWith("/feeds/");

  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...(isYouTubeRssFeed ? {} : { "user-agent": "learning-gallery-news-bot" }),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${url} (${response.status})`);
  }

  return await response.text();
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const attrs = parseHtmlAttributes(tag);
    const key = attrs.property || attrs.name;
    const content = attrs.content;
    if (!key || !content) continue;
    if (!(key in tags)) tags[key] = content;
  }

  return tags;
}

function findLinkHref(html: string, relValue: string): string | undefined {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const attrs = parseHtmlAttributes(tag);
    const rel = attrs.rel?.toLowerCase();
    if (!rel) continue;
    if (!rel.split(/\s+/).includes(relValue)) continue;
    const href = attrs.href;
    if (href) return href;
  }
  return undefined;
}

function parseHtmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const matches = tag.matchAll(/([\w:-]+)\s*=\s*("[^"]*"|'[^']*')/g);
  for (const match of matches) {
    const key = match[1]?.toLowerCase();
    const raw = match[2];
    if (!key || !raw) continue;
    attrs[key] = raw.slice(1, -1);
  }
  return attrs;
}

function parseGoogleNewsSource(xml: string): { publisherName?: string; publisherUrl?: string } {
  const match = xml.match(/<source\b[^>]*url=("[^"]+"|'[^']+')[^>]*>([\s\S]*?)<\/source>/i);
  if (!match) return {};

  const publisherUrl = match[1] ? match[1].slice(1, -1) : undefined;
  const publisherName = match[2] ? decodeXmlEntities(stripCdata(match[2]).trim()) : undefined;
  return { publisherName, publisherUrl };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getXmlTag(xml: string, tagName: string): string | undefined {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i");
  const match = xml.match(regex);
  if (!match?.[1]) return undefined;
  return decodeXmlEntities(stripCdata(match[1]).trim());
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function decodeHtmlEntities(value: string): string {
  return decodeXmlEntities(value).replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/");
}

function formatDateFromUnixSeconds(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().slice(0, 10);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
