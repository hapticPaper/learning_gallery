import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

type NvidiaBlueprintListingEntry = {
  blueprintId: string;
  title: string;
  url: string;
  date: string;
  blurb: string;
  thumbnailUrl?: string;
};

type ResolvedBlueprint = {
  blueprintId: string;
  title: string;
  url: string;
  date: string;
  summary: string;
  blurb: string;
  thumbnailPath: string;
  slug: string;
};

const CONTENT_DIR = path.join(process.cwd(), "content", "blueprints");
const THUMBNAILS_DIR = path.join(process.cwd(), "public", "blueprints", "thumbnails");

const SOURCE_URL = "https://build.nvidia.com/blueprints?filters=publisher%3Anvidia";
const DEFAULT_RUN_LIMIT = 5;

type DateRange = {
  start?: Date;
  endExclusive?: Date;
};

const RUN_LIMIT = parsePositiveInt(process.env.BLUEPRINTS_RUN_LIMIT) ?? DEFAULT_RUN_LIMIT;
const RUN_DATE_RANGE = parseDateRange({
  start: process.env.BLUEPRINTS_START_DATE,
  end: process.env.BLUEPRINTS_END_DATE,
});

async function main() {
  await fs.mkdir(CONTENT_DIR, { recursive: true });
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });

  const existing = await listExistingBlueprintIds();
  const candidates = await getRunCandidates({
    existingBlueprintIds: existing,
    limit: RUN_LIMIT,
    dateRange: RUN_DATE_RANGE,
  });
  if (!candidates.length) {
    console.log("No candidates found.");
    return;
  }

  const resolved = await Promise.allSettled(candidates.map(async (candidate) => resolveBlueprint(candidate)));
  const resolvedBlueprints: ResolvedBlueprint[] = [];
  const rejected: Array<{ blueprintId: string; message: string }> = [];

  for (const [index, result] of resolved.entries()) {
    if (result.status === "fulfilled") {
      if (result.value) resolvedBlueprints.push(result.value);
      continue;
    }

    const blueprintId = candidates[index]?.blueprintId ?? "<unknown>";
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    rejected.push({ blueprintId, message });
  }

  if (rejected.length > 0) {
    const preview = rejected
      .slice(0, 3)
      .map((failure) => `${failure.blueprintId}: ${failure.message}`)
      .join("; ");
    console.warn(`Failed to resolve ${rejected.length} blueprint candidate(s). ${preview}`);
  }

  if (!resolvedBlueprints.length) {
    console.log(`Resolved 0 usable blueprints out of ${candidates.length} candidate(s).`);
    return;
  }

  const created = await writeBlueprints(resolvedBlueprints);
  console.log(`Created ${created} blueprint item(s).`);
}

async function listExistingBlueprintIds(): Promise<Set<string>> {
  const blueprintIds = new Set<string>();
  const entries = await fs.readdir(CONTENT_DIR).catch(() => [] as string[]);
  const mdxFiles = entries.filter((name) => name.endsWith(".mdx"));

  for (const fileName of mdxFiles) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, fileName), "utf8").catch(() => "");
    if (!raw) continue;

    const parsed = matter(raw);
    const blueprintId = (parsed.data as Record<string, unknown>).blueprintId;
    if (typeof blueprintId === "string" && blueprintId.trim()) {
      blueprintIds.add(blueprintId.trim());
    }
  }

  return blueprintIds;
}

async function getRunCandidates({
  existingBlueprintIds,
  limit,
  dateRange,
}: {
  existingBlueprintIds: Set<string>;
  limit: number;
  dateRange: DateRange;
}): Promise<NvidiaBlueprintListingEntry[]> {
  const listings = await fetchBlueprintFeed();

  const sorted = listings
    .filter((entry) => entry.blueprintId && entry.title && entry.date && entry.url)
    .filter((entry) => !existingBlueprintIds.has(entry.blueprintId))
    .filter((entry) => dateRangeIncludesDateOnly(dateRange, entry.date))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  return sorted.slice(0, limit);
}

async function fetchBlueprintFeed(): Promise<NvidiaBlueprintListingEntry[]> {
  const html = await fetchText(SOURCE_URL);

  const entries = new Map<string, NvidiaBlueprintListingEntry>();
  const regex =
    /\\"artifactType\\":\\"ENDPOINT\\",\\"name\\":\\"([^\\"]+)\\",\\"displayName\\":\\"([^\\"]+)\\"[^]{0,20000}?\\"publisher\\":\\"([^\\"]+)\\",\\"shortDescription\\":\\"([^]{0,5000}?)\\",\\"logo\\":\\"([^\\"]+)\\"[^]{0,20000}?\\"updatedDate\\":\\"([^\\"]+)\\"/g;

  for (const match of html.matchAll(regex)) {
    const blueprintId = match[1];
    const title = match[2];
    const publisher = match[3];
    const shortDescriptionRaw = match[4];
    const thumbnailUrl = match[5];
    const date = match[6];

    const shortDescription = decodeListingText(shortDescriptionRaw ?? "");

    if (publisher !== "nvidia") continue;

    if (!blueprintId || entries.has(blueprintId)) continue;

    if (!title || !date) {
      console.warn(`Skipping blueprint with missing fields: ${blueprintId}`, {
        title: Boolean(title),
        date: Boolean(date),
      });
      continue;
    }

    const dateOnly = date.slice(0, 10);
    const parsedDate = Date.parse(dateOnly);
    if (!Number.isFinite(parsedDate)) {
      console.warn(`Skipping blueprint with invalid date: ${blueprintId}`, {
        rawDate: date,
      });
      continue;
    }

    entries.set(blueprintId, {
      blueprintId,
      title: decodeListingText(title),
      url: `https://build.nvidia.com/blueprints/${blueprintId}`,
      date: dateOnly,
      blurb: normalizeBlurb(shortDescription),
      thumbnailUrl,
    });
  }

  if (entries.size === 0) {
    throw new Error(
      "Failed to find any NVIDIA blueprint entries in the source feed. " +
        "NVIDIA may have changed their page structure: " +
        SOURCE_URL,
    );
  }

  return Array.from(entries.values());
}

function decodeListingText(value: string): string {
  try {
    return JSON.parse('"' + value.replace(/"/g, '\\"') + '"').trim();
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&")
      .trim();
  }
}

async function resolveBlueprint(candidate: NvidiaBlueprintListingEntry): Promise<ResolvedBlueprint | undefined> {
  const html = await fetchText(candidate.url);
  const tags = extractMetaTags(html);

  const title = candidate.title || tags["og:title"] || tags.title || candidate.blueprintId;
  const description =
    candidate.blurb ||
    tags["og:description"] ||
    tags["twitter:description"] ||
    tags.description ||
    "";

  const summary = buildSummary({
    blueprintId: candidate.blueprintId,
    description: normalizeText(decodeHtmlEntities(description)),
  });
  const blurb = normalizeBlurb(candidate.blurb || summary);

  const slug = await allocateSlug({ title, date: candidate.date });
  const thumbnailCandidate = candidate.thumbnailUrl || tags["og:image"] || tags["twitter:image"] || tags["og:image:url"];
  let thumbnailPath: string;
  try {
    thumbnailPath = await downloadThumbnail({
      slug,
      pageUrl: candidate.url,
      imageUrl: thumbnailCandidate,
    });
  } catch (error) {
    console.warn(`Thumbnail fetch failed for ${candidate.blueprintId}:`, error);
    return undefined;
  }

  return {
    blueprintId: candidate.blueprintId,
    title: normalizeText(stripSuffix(title)),
    url: candidate.url,
    date: candidate.date,
    summary,
    blurb,
    thumbnailPath,
    slug,
  };
}

function buildSummary({ blueprintId, description }: { blueprintId: string; description: string }): string {
  const base = description
    ? description
    : `A recently updated NVIDIA Build blueprint (${blueprintId}). Check the blueprint page for the full workflow and setup steps.`;

  const hint =
    "What to try first: skim the prerequisites on the blueprint page, then follow the provided steps end-to-end once before customizing the workflow for your own data.";

  return [base, hint].filter(Boolean).join("\n\n");
}

async function writeBlueprints(blueprints: ResolvedBlueprint[]): Promise<number> {
  let created = 0;

  for (const blueprint of blueprints) {
    const mdxPath = path.join(CONTENT_DIR, `${blueprint.slug}.mdx`);
    try {
      await fs.access(mdxPath);
      continue;
    } catch {
      // file doesn't exist
    }

    const mdx = buildMdx(blueprint);
    await fs.writeFile(mdxPath, mdx, "utf8");
    created += 1;
  }

  return created;
}

function buildMdx(blueprint: ResolvedBlueprint): string {
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(blueprint.title)}`,
    `date: ${JSON.stringify(blueprint.date)}`,
    `source: ${JSON.stringify("NVIDIA Build")}`,
    `url: ${JSON.stringify(blueprint.url)}`,
    `blueprintId: ${JSON.stringify(blueprint.blueprintId)}`,
    `blurb: ${JSON.stringify(blueprint.blurb)}`,
    `thumbnail: ${JSON.stringify(blueprint.thumbnailPath)}`,
    "---",
  ];

  return [
    ...frontmatter,
    "",
    blueprint.summary,
    "",
    `[View on NVIDIA Build](${blueprint.url})`,
    "",
    `Source listing: ${SOURCE_URL}`,
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

  return slug || "blueprint";
}

function normalizeBlurb(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return normalized.length > 240 ? normalized.slice(0, 237).trimEnd() + "…" : normalized;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripSuffix(value: string): string {
  return value
    .replace(/\s+-\s+Try NVIDIA NIM APIs\s*$/i, "")
    .replace(/\s+\|\s+Try NVIDIA NIM APIs\s*$/i, "")
    .trim();
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
  const candidate = imageUrl ? new URL(imageUrl, pageUrl).toString() : fallback;

  const response = await fetchWithTimeout(candidate, {
    headers: {
      "user-agent": "learning-gallery-blueprints-bot",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    if (candidate !== fallback) {
      return downloadThumbnail({ slug, pageUrl, imageUrl: fallback });
    }
    throw new Error(`Unable to download thumbnail: ${candidate} (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    if (candidate !== fallback) {
      return downloadThumbnail({ slug, pageUrl, imageUrl: fallback });
    }
    throw new Error(`Thumbnail is not an image: ${candidate} (${contentType || "unknown"})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength < 512) {
    if (candidate !== fallback) {
      return downloadThumbnail({ slug, pageUrl, imageUrl: fallback });
    }
    throw new Error(`Thumbnail too small to be valid: ${candidate}`);
  }

  const ext = guessImageExtension({ contentType, url: candidate });

  const fileName = `${slug}${ext}`;
  const filePath = path.join(THUMBNAILS_DIR, fileName);
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));

  return `/blueprints/thumbnails/${fileName}`;
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

async function fetchText(url: string, opts?: { accept?: string }): Promise<string> {
  const response = await fetchWithTimeout(url, {
    headers: {
      "user-agent": "learning-gallery-blueprints-bot",
      accept: opts?.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  if (!tags.title) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) tags.title = titleMatch[1].trim();
  }

  return tags;
}

type MetaAttrs = {
  name?: string;
  property?: string;
  content?: string;
};

function parseHtmlAttributes(tag: string): MetaAttrs {
  const attrs: MetaAttrs = {};
  const matches = tag.matchAll(/([\w:-]+)\s*=\s*("[^"]*"|'[^']*')/g);
  for (const match of matches) {
    const key = match[1]?.toLowerCase();
    const raw = match[2];
    if (!key || !raw) continue;
    const value = raw.slice(1, -1);
    if (key === "name") attrs.name = value;
    if (key === "property") attrs.property = value;
    if (key === "content") attrs.content = value;
  }
  return attrs;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(x?[0-9A-Fa-f]+);/g, (match, num: string) => {
      const codePoint =
        num.startsWith("x") || num.startsWith("X") ? parseInt(num.slice(1), 16) : parseInt(num, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    });
}

function dateRangeIncludesDateOnly(range: DateRange, dateOnly: string): boolean {
  if (!range.start || !range.endExclusive) return true;
  const date = parseDateOnly(dateOnly);
  if (!date) return false;
  return date >= range.start && date < range.endExclusive;
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
