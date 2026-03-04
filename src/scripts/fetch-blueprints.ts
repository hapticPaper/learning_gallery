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
// The NVIDIA blueprints listing page currently embeds BLUEPRINT data as JSON objects inside
// an escaped string (effectively JSON-within-JSON). We don't have an official API contract,
// so this script relies on a best-effort scraper that is designed to fail loudly when the
// upstream schema drifts.
const DEFAULT_MAX_BLUEPRINT_OBJECT_CHARS = 6000;
const MAX_BLUEPRINT_BLURB_LENGTH = 240;
const BLUEPRINT_OBJECT_REGEX_CHARS = 8000;
const MAX_BLUEPRINT_OBJECT_CHARS = (() => {
  const configured = parsePositiveInt(process.env.BLUEPRINTS_MAX_OBJECT_CHARS);
  const value = configured ?? DEFAULT_MAX_BLUEPRINT_OBJECT_CHARS;
  const min = 1000;
  const max = 20000;

  if (value < min || value > max) {
    const message =
      `BLUEPRINTS_MAX_OBJECT_CHARS=${value} is out of allowed range [${min}, ${max}]. ` +
      `Unset it to use the default (${DEFAULT_MAX_BLUEPRINT_OBJECT_CHARS}).`;

    if (process.env.BLUEPRINTS_STRICT_SCHEMA === "1") {
      throw new Error(message);
    }

    console.warn(message);
    return DEFAULT_MAX_BLUEPRINT_OBJECT_CHARS;
  }

  return value;
})();

let oversizeBlueprintJsonBlobCount = 0;
let warnedBlueprintBlurbTruncation = false;

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

  oversizeBlueprintJsonBlobCount = 0;

  const entries = new Map<string, NvidiaBlueprintListingEntry>();
  const blueprintObjectRegex = new RegExp(
    String.raw`\{[^]{0,${BLUEPRINT_OBJECT_REGEX_CHARS}}?\\\"orgName\\\":\\\"[^\\\\\"]+\\\"[^]{0,${BLUEPRINT_OBJECT_REGEX_CHARS}}?\\\"resourceType\\\":\\\"BLUEPRINT\\\"[^]{0,${BLUEPRINT_OBJECT_REGEX_CHARS}}?\\\"guestAccess\\\":(?:true|false)\}`,
    "g",
  );

  const debug = process.env.BLUEPRINTS_DEBUG === "1";
  const strictSchema = process.env.BLUEPRINTS_STRICT_SCHEMA === "1";
  let warnedBlueprintPublisherMissing = false;
  let warnedBlueprintObjectNearCap = false;
  let warnedBlueprintMissingLogo = false;
  let blueprintMatchCount = 0;
  let blueprintParseFailureCount = 0;
  let modernEntriesAdded = 0;
  let firstParseFailureSample: string | null = null;
  let sawNearCap = false;

  for (const match of html.matchAll(blueprintObjectRegex)) {
    if (!warnedBlueprintObjectNearCap && match[0].length >= BLUEPRINT_OBJECT_REGEX_CHARS - 10) {
      warnedBlueprintObjectNearCap = true;
      sawNearCap = true;
      console.warn(
        `A BLUEPRINT JSON blob match is near the ${BLUEPRINT_OBJECT_REGEX_CHARS}-char regex cap. NVIDIA schema may have expanded.`,
      );
    }

    blueprintMatchCount += 1;

    const parsed = parseNextEscapedJsonObject(match[0]);
    if (!parsed || typeof parsed !== "object") {
      blueprintParseFailureCount += 1;

      if (!firstParseFailureSample) {
        firstParseFailureSample = match[0].slice(0, 250);
      }

      continue;
    }

    const data = parsed as Record<string, unknown>;
    const publisher = getPublisherFromBlueprintData(data);
    if (!publisher) {
      if (debug && !warnedBlueprintPublisherMissing) {
        warnedBlueprintPublisherMissing = true;
        console.warn(
          "Skipping BLUEPRINT entries without a detectable publisher label (labels.publisher). " +
            "NVIDIA may have changed their listing schema.",
        );
      }

      continue;
    }

    if (publisher !== "nvidia") continue;

    const blueprintId = typeof data.name === "string" ? data.name : null;
    const title = typeof data.displayName === "string" ? data.displayName : null;
    const dateModified = typeof data.dateModified === "string" ? data.dateModified : null;
    const description = typeof data.description === "string" ? data.description : "";
    const thumbnailUrl = getAttributeValue({ attributes: data.attributes, key: "logo" });

    if (!thumbnailUrl) {
      if (!warnedBlueprintMissingLogo) {
        warnedBlueprintMissingLogo = true;
        console.warn("Skipping BLUEPRINT entries without a listing logo (attributes.logo).");
      }

      if (debug) {
        console.warn(`Skipping blueprint without listing logo: ${blueprintId}`);
      }

      continue;
    }

    if (
      insertBlueprintEntryIfValid({
        entries,
        blueprintId,
        title,
        rawDate: dateModified,
        rawBlurb: description,
        thumbnailUrl,
      })
    ) {
      modernEntriesAdded += 1;
    }
  }

  if (blueprintMatchCount > 0 && modernEntriesAdded === 0) {
    console.warn(
      `Matched ${blueprintMatchCount} BLUEPRINT JSON blob(s), but none could be parsed into usable entries.`,
    );
  }

  if (blueprintParseFailureCount > 0 && blueprintMatchCount > 0) {
    const failureRate = blueprintParseFailureCount / blueprintMatchCount;

    if (debug || blueprintMatchCount <= 10 || blueprintParseFailureCount >= 20 || failureRate >= 0.25) {
      console.warn(
        `Failed to parse ${blueprintParseFailureCount}/${blueprintMatchCount} BLUEPRINT JSON blob(s) from NVIDIA listing.`,
        firstParseFailureSample ? { sample: firstParseFailureSample } : undefined,
      );
    }
  }

  if (oversizeBlueprintJsonBlobCount > 0) {
    console.warn(
      `Skipped ${oversizeBlueprintJsonBlobCount} oversize BLUEPRINT JSON blob(s) (cap=${MAX_BLUEPRINT_OBJECT_CHARS}).`,
    );
  }

  if (strictSchema && sawNearCap) {
    throw new Error(
      `NVIDIA listing schema appears to have expanded (near ${BLUEPRINT_OBJECT_REGEX_CHARS}-char regex cap). Aborting due to BLUEPRINTS_STRICT_SCHEMA=1.`,
    );
  }

  if (strictSchema && oversizeBlueprintJsonBlobCount > 0) {
    throw new Error(
      `NVIDIA listing contained ${oversizeBlueprintJsonBlobCount} BLUEPRINT JSON blob(s) over the ${MAX_BLUEPRINT_OBJECT_CHARS}-char cap. Aborting due to BLUEPRINTS_STRICT_SCHEMA=1.`,
    );
  }

  const legacyStartSize = entries.size;

  const legacyRegex =
    /\\"artifactType\\":\\"ENDPOINT\\",\\"name\\":\\"([^\\"]+)\\",\\"displayName\\":\\"([^\\"]+)\\"[^]{0,20000}?\\"publisher\\":\\"([^\\"]+)\\",\\"shortDescription\\":\\"([^]{0,5000}?)\\",\\"logo\\":\\"([^\\"]+)\\"[^]{0,20000}?\\"updatedDate\\":\\"([^\\"]+)\\"/g;

  for (const match of html.matchAll(legacyRegex)) {
    const blueprintId = match[1];
    const title = match[2];
    const publisher = match[3];
    const shortDescriptionRaw = match[4];
    const thumbnailUrl = match[5];
    const date = match[6];

    if (!thumbnailUrl) continue;

    if (publisher !== "nvidia") continue;

    insertBlueprintEntryIfValid({
      entries,
      blueprintId,
      title,
      rawDate: date,
      rawBlurb: shortDescriptionRaw ?? "",
      thumbnailUrl,
    });
  }

  if (debug && entries.size > legacyStartSize) {
    console.warn(`Added ${entries.size - legacyStartSize} blueprint(s) via legacy parser.`);
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

let warnedNextEscapedJsonParseFailed = false;
let warnedOversizeBlueprintJsonBlob = false;

function parseNextEscapedJsonObject(raw: string): unknown {
  if (raw.length > MAX_BLUEPRINT_OBJECT_CHARS) {
    oversizeBlueprintJsonBlobCount += 1;

    if (process.env.BLUEPRINTS_STRICT_SCHEMA === "1") {
      throw new Error(
        `BLUEPRINT JSON blob exceeded MAX_BLUEPRINT_OBJECT_CHARS=${MAX_BLUEPRINT_OBJECT_CHARS}.`,
      );
    }

    if (process.env.BLUEPRINTS_DEBUG === "1" && !warnedOversizeBlueprintJsonBlob) {
      warnedOversizeBlueprintJsonBlob = true;
      console.warn(
        `Skipping BLUEPRINT JSON blob larger than MAX_BLUEPRINT_OBJECT_CHARS=${MAX_BLUEPRINT_OBJECT_CHARS}.`,
        { length: raw.length },
      );
    }

    return null;
  }

  try {
    return JSON.parse(raw.replace(/\\"/g, '"'));
  } catch {
    // ignore
  }

  try {
    // Fallback: interpret `raw` as an escaped JSON string, decode it once, then parse.
    // Example (simplified):
    //   raw: {\\"resourceType\\":\\"BLUEPRINT\\",\\"name\\":\\"example\\"}
    // After one unescape pass, it becomes normal JSON and can be parsed.
    const unescaped = JSON.parse(
      `"${raw.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"")}"`,
    ) as string;
    return JSON.parse(unescaped);
  } catch {
    if (process.env.BLUEPRINTS_DEBUG === "1" && !warnedNextEscapedJsonParseFailed) {
      warnedNextEscapedJsonParseFailed = true;
      console.warn(
        "Failed to parse an escaped BLUEPRINT JSON blob from the NVIDIA listing page. " +
          "NVIDIA may have changed their page structure.",
      );
    }

    return null;
  }
}

function getPublisherFromBlueprintData(data: Record<string, unknown>): string | null {
  const labelPublisher = getLabelValues({ labels: data.labels, key: "publisher" })?.[0];
  if (labelPublisher) return labelPublisher;

  if (typeof data.publisher === "string") {
    if (process.env.BLUEPRINTS_DEBUG === "1") {
      console.warn("Using legacy BLUEPRINT publisher field (data.publisher).", {
        publisher: data.publisher,
      });
    }

    return data.publisher;
  }

  return null;
}

function getLabelValues({ labels, key }: { labels: unknown; key: string }): string[] | null {
  if (!Array.isArray(labels)) return null;

  for (const label of labels) {
    if (!label || typeof label !== "object") continue;
    const data = label as Record<string, unknown>;
    if (typeof data.key !== "string") continue;
    if (data.key !== key) continue;
    if (!Array.isArray(data.values)) continue;

    const values = data.values.filter((value) => typeof value === "string") as string[];
    if (values.length) return values;
  }

  return null;
}

function getAttributeValue({ attributes, key }: { attributes: unknown; key: string }): string | undefined {
  if (!Array.isArray(attributes)) return undefined;

  for (const attribute of attributes) {
    if (!attribute || typeof attribute !== "object") continue;
    const data = attribute as Record<string, unknown>;
    if (typeof data.key !== "string") continue;
    if (data.key !== key) continue;

    if (typeof data.value === "string") return data.value;

    if (process.env.BLUEPRINTS_DEBUG === "1") {
      console.warn("Unexpected BLUEPRINT attribute value type.", {
        key,
        valueType: typeof data.value,
      });
    }
  }

  return undefined;
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

function stripHtmlTags(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!/<[a-zA-Z]/.test(normalized)) return normalized;

  const withSpacing = normalized
    .replace(/<\s*br\s*\/?\s*>/gi, " ")
    .replace(/<\s*\/\s*(?:p|li)\s*>/gi, " ");

  return withSpacing.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Best-effort conversion from listing descriptions to a short blurb. This is not a general
// purpose HTML sanitizer; it exists to make NVIDIA's sometimes-HTML-ish listing strings
// render as readable plain text.
function buildBlueprintBlurb(raw: string): string {
  const blurb = normalizeBlurb(stripHtmlTags(decodeListingText(raw)));

  if (blurb.length <= MAX_BLUEPRINT_BLURB_LENGTH) return blurb;

  if (process.env.BLUEPRINTS_DEBUG === "1" && !warnedBlueprintBlurbTruncation) {
    warnedBlueprintBlurbTruncation = true;
    console.warn("Truncating BLUEPRINT blurb to fit UI limit.", { length: blurb.length });
  }

  const sliced = blurb.slice(0, MAX_BLUEPRINT_BLURB_LENGTH - 1).trimEnd();
  const lastSpace = sliced.lastIndexOf(" ");
  const truncated = lastSpace > 0 ? sliced.slice(0, lastSpace).trimEnd() : sliced;

  return truncated + "…";
}

function safeParseBlueprintDateOnly({ blueprintId, rawDate }: { blueprintId: string; rawDate: string }): string | null {
  const dateOnly = rawDate.slice(0, 10);
  const parsedDate = Date.parse(dateOnly);

  if (!Number.isFinite(parsedDate)) {
    if (process.env.BLUEPRINTS_DEBUG === "1") {
      console.warn("Invalid BLUEPRINT date.", { blueprintId, rawDate });
    }

    return null;
  }

  return dateOnly;
}

function insertBlueprintEntryIfValid({
  entries,
  blueprintId,
  title,
  rawDate,
  rawBlurb,
  thumbnailUrl,
}: {
  entries: Map<string, NvidiaBlueprintListingEntry>;
  blueprintId: string | null;
  title: string | null;
  rawDate: string | null;
  rawBlurb: string;
  thumbnailUrl: string;
}): boolean {
  if (!blueprintId || entries.has(blueprintId)) return false;

  if (!title || !rawDate) {
    console.warn(`Skipping blueprint with missing fields: ${blueprintId}`, {
      title: Boolean(title),
      date: Boolean(rawDate),
    });
    return false;
  }

  const dateOnly = safeParseBlueprintDateOnly({ blueprintId, rawDate });
  if (!dateOnly) {
    console.warn(`Skipping blueprint with invalid date: ${blueprintId}`, {
      rawDate,
    });
    return false;
  }

  entries.set(blueprintId, {
    blueprintId,
    title: decodeListingText(title),
    url: `https://build.nvidia.com/blueprints/${blueprintId}`,
    date: dateOnly,
    blurb: buildBlueprintBlurb(rawBlurb),
    thumbnailUrl,
  });

  return true;
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
  const hasStart = Boolean(start);
  const hasEnd = Boolean(end);
  if (!hasStart && !hasEnd) return {};

  if (!hasStart || !hasEnd) {
    throw new Error(
      "BLUEPRINTS_START_DATE and BLUEPRINTS_END_DATE must both be set as YYYY-MM-DD when using date range filtering.",
    );
  }

  const parsedStart = parseDateOnly(start);
  const parsedEnd = parseDateOnly(end);
  if (!parsedStart || !parsedEnd || parsedStart > parsedEnd) {
    throw new Error("Invalid blueprint date range: ensure dates are valid YYYY-MM-DD and start <= end.");
  }

  return {
    start: parsedStart,
    endExclusive: new Date(parsedEnd.getTime() + 24 * 60 * 60 * 1000),
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
