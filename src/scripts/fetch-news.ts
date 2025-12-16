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
const RUN_LIMIT = 3;

async function main() {
  await fs.mkdir(CONTENT_DIR, { recursive: true });
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });

  const existingUrls = await listExistingUrls();
  const candidates = await getRunCandidates();
  if (!candidates.length) {
    console.log("No candidates found.");
    return;
  }

  const nextStories: ResolvedStory[] = [];
  for (const story of candidates) {
    if (nextStories.length >= RUN_LIMIT) break;

    const resolved = await resolveStory(story, existingUrls);
    if (!resolved) continue;
    existingUrls.add(resolved.url);
    nextStories.push(resolved);
  }

  const created = await writeStories(nextStories);

  console.log(`Created ${created} news item(s).`);
}

async function getRunCandidates(): Promise<StoryDraft[]> {
  const [hn, yt, google] = await Promise.all([
    getHackerNewsCandidates(),
    getYouTubeCandidates(),
    getGoogleNewsCandidates(),
  ]);

  return interleaveCandidates([hn, yt, google]);
}

async function getHackerNewsCandidates(): Promise<StoryDraft[]> {
  const oneDayAgo = Math.floor(Date.now() / 1000 - 60 * 60 * 24);
  const url = new URL("https://hn.algolia.com/api/v1/search");
  url.searchParams.set("query", "AI");
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", "25");
  url.searchParams.set("numericFilters", `created_at_i>${oneDayAgo}`);
  url.searchParams.set("restrictSearchableAttributes", "title");

  const data = await fetchJson<{ hits: Array<{ title: string; url: string | null; created_at_i: number }> }>(
    url.toString(),
  );

  const seen = new Set<string>();
  const picked: StoryDraft[] = [];

  for (const hit of data.hits) {
    if (!hit.url || !hit.title) continue;
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);

    picked.push({
      title: hit.title,
      url: hit.url,
      source: "Hacker News",
      date: formatDateFromUnixSeconds(hit.created_at_i),
    });
  }

  return picked;
}

async function getYouTubeCandidates(): Promise<StoryDraft[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
  const xml = await fetchText(feedUrl);

  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const picked: StoryDraft[] = [];
  const seen = new Set<string>();

  for (const entry of entries.slice(0, 10)) {
    const title = getXmlTag(entry, "title");
    const videoId = getXmlTag(entry, "yt:videoId");
    const published = getXmlTag(entry, "published");
    const description = getXmlTag(entry, "media:description");

    if (!title || !videoId || !published) continue;
    if (seen.has(videoId)) continue;
    seen.add(videoId);

    const publishedDate = published.slice(0, 10);

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

async function getGoogleNewsCandidates(): Promise<StoryDraft[]> {
  const rssUrl =
    "https://news.google.com/rss/search?q=artificial%20intelligence%20when:1d&hl=en-US&gl=US&ceid=US:en";
  const xml = await fetchText(rssUrl);

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const picked: StoryDraft[] = [];
  const seen = new Set<string>();

  for (const item of items.slice(0, 25)) {
    const rawTitle = decodeXmlEntities(stripCdata(getXmlTag(item, "title") ?? ""));
    const link = stripCdata(getXmlTag(item, "link") ?? "");
    const pubDateRaw = stripCdata(getXmlTag(item, "pubDate") ?? "");

    const { publisherName, publisherUrl } = parseGoogleNewsSource(item);
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
  const resolvedUrl = await resolveFinalUrl(story.url);
  if (existingUrls.has(resolvedUrl)) return undefined;

  const resolvedSeedText = story.seedText?.trim() ? story.seedText : await getPageDescription(resolvedUrl);
  const summary = normalizeSummaryBody(resolvedSeedText || story.title);
  const blurb = normalizeBlurb(summary || story.title);

  const slug = await allocateSlug({ title: story.title, date: story.date });
  const thumbnailCandidate = story.thumbnailUrl ?? (await getPageThumbnailUrl(resolvedUrl));
  const thumbnailPath = await downloadThumbnail({
    slug,
    pageUrl: story.publisherUrl ?? resolvedUrl,
    imageUrl: thumbnailCandidate,
  });

  return {
    title: story.title,
    url: resolvedUrl,
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
    if (normalized) urls.add(normalized);
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
  const html = await fetchText(url);
  const tags = extractMetaTags(html);
  const desc =
    tags["og:description"] ||
    tags["twitter:description"] ||
    tags.description ||
    tags["parsely-description"];

  return desc ? normalizeText(decodeHtmlEntities(desc)) : undefined;
}

async function getPageThumbnailUrl(url: string): Promise<string | undefined> {
  const html = await fetchText(url);
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
  const response = await fetchWithTimeout(url, {
    headers: {
      "user-agent": "learning-gallery-news-bot",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
