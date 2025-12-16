import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

type HfModelEntry = {
  modelId: string;
  lastModified: string;
  likes?: number;
  downloads?: number;
  pipeline_tag?: string | null;
  tags?: string[];
};

type ModelDraft = {
  modelId: string;
  url: string;
  date: string;
  likes: number;
  downloads: number;
  pipelineTag?: string;
};

type ResolvedModel = {
  title: string;
  modelId: string;
  url: string;
  source: string;
  date: string;
  summary: string;
  blurb: string;
  thumbnailPath: string;
  slug: string;
  pipelineTag?: string;
};

const CONTENT_DIR = path.join(process.cwd(), "content", "models");
const THUMBNAILS_DIR = path.join(process.cwd(), "public", "models", "thumbnails");

const SOURCE_URL = "https://huggingface.co/models?sort=modified";
const DAILY_LIMIT = 3;
const CANDIDATE_MULTIPLIER = 8;

// Grab enough recently-modified models to find 3 high-signal candidates without having to
// crawl deeply into the feed.
const API_FETCH_LIMIT = 120;

async function main() {
  await fs.mkdir(CONTENT_DIR, { recursive: true });
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });

  const existing = await listExistingModelInfo();

  const today = new Date().toISOString().slice(0, 10);
  const existingTodayCount = await countExistingPostsForDate(today);
  const remainingToday = Math.max(0, DAILY_LIMIT - existingTodayCount);
  if (!remainingToday) {
    console.log(`Already have ${DAILY_LIMIT} model post(s) for ${today}.`);
    return;
  }
  const candidates = await getDailyCandidates({
    existingModelIds: existing.modelIds,
    existingFamilyKeys: existing.familyKeys,
  });
  if (!candidates.length) {
    console.log("No candidates found.");
    return;
  }

  const resolved = await Promise.all(candidates.map(async (model) => resolveModel(model)));
  const resolvedModels = resolved.filter((item): item is ResolvedModel => Boolean(item));
  const nextModels = pickTopModels(resolvedModels, remainingToday);
  const created = await writeModels(nextModels);

  console.log(`Created ${created} model item(s).`);
}

async function countExistingPostsForDate(date: string): Promise<number> {
  const entries = await fs.readdir(CONTENT_DIR).catch(() => [] as string[]);
  return entries.filter((name) => name.startsWith(`${date}--`) && name.endsWith(".mdx")).length;
}

function pickTopModels(models: ResolvedModel[], limit: number): ResolvedModel[] {
  const picked: ResolvedModel[] = [];
  const seenFamilies = new Set<string>();

  for (const model of models) {
    if (picked.length >= limit) break;
    const family = getFamilyKeyFromModelId(model.modelId);
    if (seenFamilies.has(family)) continue;
    seenFamilies.add(family);
    picked.push(model);
  }

  if (picked.length < limit) {
    for (const model of models) {
      if (picked.length >= limit) break;
      if (picked.some((item) => item.modelId === model.modelId)) continue;
      picked.push(model);
    }
  }

  return picked.slice(0, limit);
}

function getFamilyKeyFromModelId(modelId: string): string {
  const [owner, rawName] = modelId.split("/");
  const name = rawName ?? modelId;

  const trimmed = name.replace(/-(Dev|dev|Edit|edit|Preview|preview|Experimental|experimental)$/, "");
  const gensyn = trimmed.split(/-Gensyn-Swarm-?/)[0];

  return owner ? `${owner}/${gensyn}` : gensyn;
}

async function getDailyCandidates({
  existingModelIds,
  existingFamilyKeys,
}: {
  existingModelIds: Set<string>;
  existingFamilyKeys: Set<string>;
}): Promise<ModelDraft[]> {
  const url = new URL("https://huggingface.co/api/models");
  url.searchParams.set("sort", "lastModified");
  url.searchParams.set("direction", "-1");
  url.searchParams.set("limit", String(API_FETCH_LIMIT));

  const data = await fetchJson<HfModelEntry[]>(url.toString());

  const candidates = data
    .filter((model) => model.modelId && model.lastModified)
    .filter((model) => !existingModelIds.has(model.modelId))
    .filter((model) => {
      const familyKey = getFamilyKeyFromModelId(model.modelId);
      if (!existingFamilyKeys.has(familyKey)) return true;
      return isParticularlyInterestingDerivative(model);
    })
    .filter((model) => isInterestingCandidate(model))
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  const picked: ModelDraft[] = [];
  const familyCounts = new Map<string, number>();
  const targetCount = DAILY_LIMIT * CANDIDATE_MULTIPLIER;

  for (const candidate of candidates) {
    if (picked.length >= targetCount) break;

    const familyKey = getFamilyKey(candidate);
    const count = familyCounts.get(familyKey) ?? 0;
    const duplicate = count > 0;

    if (duplicate) {
      continue;
    }

    familyCounts.set(familyKey, count + 1);

    picked.push({
      modelId: candidate.modelId,
      url: `https://huggingface.co/${candidate.modelId}`,
      date: candidate.lastModified.slice(0, 10),
      likes: candidate.likes ?? 0,
      downloads: candidate.downloads ?? 0,
      pipelineTag: candidate.pipeline_tag ?? undefined,
    });
  }

  // If the feed is dominated by one model family, allow duplicates to pad the candidate list.
  if (picked.length < targetCount) {
    for (const candidate of candidates) {
      if (picked.length >= targetCount) break;
      if (picked.some((item) => item.modelId === candidate.modelId)) continue;

      picked.push({
        modelId: candidate.modelId,
        url: `https://huggingface.co/${candidate.modelId}`,
        date: candidate.lastModified.slice(0, 10),
        likes: candidate.likes ?? 0,
        downloads: candidate.downloads ?? 0,
        pipelineTag: candidate.pipeline_tag ?? undefined,
      });
    }
  }

  return picked.slice(0, targetCount);
}

function isInterestingCandidate(candidate: HfModelEntry): boolean {
  const likes = candidate.likes ?? 0;
  const downloads = candidate.downloads ?? 0;
  const pipelineTag = candidate.pipeline_tag ?? null;
  const tags = candidate.tags ?? [];

  const idLower = candidate.modelId.toLowerCase();
  const isTestModel = /(^|[\W_])test([\W_]|$)/.test(idLower);
  if (isTestModel && likes < 50 && downloads < 100_000) {
    return false;
  }

  const isSwarmDerivative = tags.some((tag) =>
    tag === "gensyn" || tag === "genrl-swarm" || tag === "rl-swarm" || tag === "grpo",
  );
  if (isSwarmDerivative && likes < 20 && downloads < 5_000) {
    return false;
  }

  const isTrainerGenerated = tags.includes("generated_from_trainer") || tags.includes("autotrain");
  if (isTrainerGenerated && likes < 20 && downloads < 5_000) {
    return false;
  }

  const hasPipeline = Boolean(pipelineTag);
  const hasNonRegionalTag = tags.some((tag) => !tag.startsWith("region:"));

  const qualifies = hasPipeline
    ? likes >= 1 || downloads >= 200
    : likes >= 5 || downloads >= 2_000;

  return qualifies && hasNonRegionalTag;
}

function scoreCandidate(candidate: HfModelEntry): number {
  const likes = candidate.likes ?? 0;
  const downloads = candidate.downloads ?? 0;
  const pipelineBoost = candidate.pipeline_tag ? 5 : 0;

  return likes * 5 + Math.log10(downloads + 1) * 10 + pipelineBoost;
}

function isParticularlyInterestingDerivative(candidate: HfModelEntry): boolean {
  const likes = candidate.likes ?? 0;
  const downloads = candidate.downloads ?? 0;

  return likes >= 100 || downloads >= 100_000;
}

function getFamilyKey(candidate: HfModelEntry): string {
  const tags = candidate.tags ?? [];
  const baseTag = tags.find((tag) => tag.startsWith("base_model:"));
  if (baseTag) return baseTag.slice("base_model:".length);

  const [owner, rawName] = candidate.modelId.split("/");
  const name = rawName ?? candidate.modelId;

  const dev = name.replace(/-(Dev|dev|Edit|edit|Preview|preview|Experimental|experimental)$/, "");
  if (dev && dev !== name) return owner ? `${owner}/${dev}` : dev;

  const gensyn = name.split(/-Gensyn-Swarm-?/)[0];
  if (gensyn && gensyn !== name) return owner ? `${owner}/${gensyn}` : gensyn;

  return candidate.modelId;
}

async function resolveModel(model: ModelDraft): Promise<ResolvedModel | undefined> {
  const html = await fetchText(model.url);
  const tags = extractMetaTags(html);

  const description =
    tags["og:description"] || tags["twitter:description"] || tags.description || tags["parsely-description"];

  const normalizedDescription = description ? normalizeText(decodeHtmlEntities(description)) : "";
  const card = await fetchModelCard(model.modelId);

  const ogTitle = stripHuggingFaceSuffix(tags["og:title"] ?? tags.title ?? model.modelId);
  const title = card?.title && !isBadTitle(card.title) ? card.title : ogTitle;
  const seedText =
    card?.summary && (isGenericHfDescription(normalizedDescription) || !isGenericHfDescription(card.summary))
      ? card.summary
      : normalizedDescription;

  if (isGenericHfDescription(seedText) && !model.pipelineTag && model.likes < 5 && model.downloads < 10_000) {
    return undefined;
  }

  if (isBoilerplateModelCard(seedText) && model.likes < 10 && model.downloads < 10_000) {
    return undefined;
  }

  const summary = buildSummary({
    description: seedText,
    pipelineTag: model.pipelineTag,
    modelId: model.modelId,
    likes: model.likes,
    downloads: model.downloads,
  });

  const blurb = normalizeBlurb(seedText || summary);

  const slug = await allocateSlug({ title, date: model.date });
  const thumbnailCandidate = tags["og:image"] || tags["twitter:image"] || tags["og:image:url"];
  let thumbnailPath: string;
  try {
    thumbnailPath = await downloadThumbnail({
      slug,
      pageUrl: model.url,
      imageUrl: thumbnailCandidate,
    });
  } catch (error) {
    console.warn(`Thumbnail fetch failed for ${model.modelId}:`, error);
    return undefined;
  }

  return {
    title,
    modelId: model.modelId,
    url: model.url,
    source: "Hugging Face",
    date: model.date,
    summary,
    blurb,
    thumbnailPath,
    slug,
    pipelineTag: model.pipelineTag,
  };
}

async function fetchModelCard(modelId: string): Promise<{ title: string; summary: string } | undefined> {
  const url = `https://huggingface.co/${modelId}/raw/main/README.md`;
  const raw = await fetchText(url, { accept: "text/plain" }).catch(() => "");
  if (!raw) return undefined;

  const stripped = stripMarkdownFrontmatter(raw);
  const title = extractMarkdownTitle(stripped) ?? modelId;
  const summary = extractMarkdownSummary(stripped);
  if (!summary) return undefined;

  return { title, summary };
}

function stripMarkdownFrontmatter(value: string): string {
  if (!value.startsWith("---")) return value;

  const match = value.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  if (!match) return value;
  return value.slice(match[0].length);
}

function extractMarkdownTitle(value: string): string | undefined {
  const match = value.match(/^#\s+(.+)$/m);
  if (!match?.[1]) return undefined;
  return normalizeText(stripMarkdownInline(match[1]));
}

function extractMarkdownSummary(value: string): string {
  const withoutCode = value.replace(/```[\s\S]*?```/g, "");
  const blocks = withoutCode.split(/\n\s*\n/).map((block) => block.trim());

  const candidates = blocks
    .map((block) => stripMarkdownInline(block))
    .map((block) => normalizeText(block))
    .filter((block) => Boolean(block))
    .filter((block) => !block.startsWith("#"))
    .filter((block) => !block.startsWith("["))
    .filter((block) => !block.startsWith("<"))
    .filter((block) => !/provide a (quick|longer) summary/i.test(block))
    .filter((block) => !block.includes("img.shields.io"))
    .filter((block) => block.length >= 40);

  const picked: string[] = [];

  for (const block of candidates) {
    if (picked.length === 0) {
      picked.push(block);
      continue;
    }

    if (picked.length === 1 && shouldIncludeSecondParagraph(block)) {
      picked.push(block);
      break;
    }
  }

  return picked.join("\n\n");
}

function shouldIncludeSecondParagraph(value: string): boolean {
  const normalized = value.toLowerCase();
  return !(
    normalized.includes("bibtex") ||
    normalized.includes("citation") ||
    normalized.includes("@misc") ||
    normalized.includes("@article")
  );
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]+\]\([^)]*\)/g, (match) => {
      const inner = match.match(/^\[([^\]]+)\]/);
      return inner?.[1] ?? match;
    })
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadTitle(value: string): boolean {
  const normalized = value.toLowerCase();
  if (!normalized.trim()) return true;

  return (
    normalized.includes("model card for model id") ||
    normalized.startsWith("create ") ||
    normalized.startsWith("install ") ||
    normalized.includes("conda environment")
  );
}

function isGenericHfDescription(value: string): boolean {
  return /journey to advance and democratize artificial intelligence/i.test(value);
}

function isBoilerplateModelCard(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("this is the model card") ||
    normalized.includes("automatically generated") ||
    normalized.includes("more information needed")
  );
}

function buildSummary({
  description,
  pipelineTag,
  modelId,
  likes,
  downloads,
}: {
  description: string;
  pipelineTag?: string;
  modelId: string;
  likes: number;
  downloads: number;
}): string {
  const parts: string[] = [];

  if (description) {
    parts.push(description);
  } else {
    parts.push(
      `A recently updated model on Hugging Face (${modelId}). If the card is sparse, check the README for details on what it does and how to run it.`,
    );
  }

  const statsBits = [
    pipelineTag ? `pipeline: ${pipelineTag}` : null,
    likes ? `${likes} like${likes === 1 ? "" : "s"}` : null,
    downloads ? `${downloads} download${downloads === 1 ? "" : "s"}` : null,
  ].filter((bit): bit is string => Boolean(bit));

  if (statsBits.length) {
    parts.push(`Quick stats from the listing feed: ${statsBits.join(" · ")}.`);
  }

  return parts.join("\n\n");
}

async function listExistingModelInfo(): Promise<{ modelIds: Set<string>; familyKeys: Set<string> }> {
  const modelIds = new Set<string>();
  const familyKeys = new Set<string>();
  const entries = await fs.readdir(CONTENT_DIR).catch(() => [] as string[]);
  const mdxFiles = entries.filter((name) => name.endsWith(".mdx"));

  for (const fileName of mdxFiles) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, fileName), "utf8").catch(() => "");
    if (!raw) continue;

    const parsed = matter(raw);
    const modelId = (parsed.data as Record<string, unknown>).modelId;
    if (typeof modelId === "string" && modelId.trim()) {
      const normalized = modelId.trim();
      modelIds.add(normalized);
      familyKeys.add(getFamilyKeyFromModelId(normalized));
    }
  }

  return { modelIds, familyKeys };
}

async function writeModels(models: ResolvedModel[]): Promise<number> {
  let created = 0;

  for (const model of models) {
    const mdxPath = path.join(CONTENT_DIR, `${model.slug}.mdx`);
    try {
      await fs.access(mdxPath);
      continue;
    } catch {
      // file doesn't exist
    }

    const mdx = buildMdx(model);
    await fs.writeFile(mdxPath, mdx, "utf8");
    created += 1;
  }

  return created;
}

function buildMdx(model: ResolvedModel): string {
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(model.title)}`,
    `date: ${JSON.stringify(model.date)}`,
    `source: ${JSON.stringify(model.source)}`,
    `url: ${JSON.stringify(model.url)}`,
    `modelId: ${JSON.stringify(model.modelId)}`,
    model.pipelineTag ? `pipelineTag: ${JSON.stringify(model.pipelineTag)}` : null,
    `blurb: ${JSON.stringify(model.blurb)}`,
    `thumbnail: ${JSON.stringify(model.thumbnailPath)}`,
    "---",
  ].filter((line): line is string => Boolean(line));

  return [
    ...frontmatter,
    "",
    model.summary,
    "",
    `[View on Hugging Face](${model.url})`,
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

  return slug || "model";
}

function normalizeBlurb(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return normalized.length > 240 ? normalized.slice(0, 237).trimEnd() + "…" : normalized;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHuggingFaceSuffix(value: string): string {
  return value
    .replace(/\s+-\s+Hugging Face\s*$/i, "")
    .replace(/\s+·\s+Hugging Face\s*$/i, "")
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
      "user-agent": "learning-gallery-models-bot",
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

  return `/models/thumbnails/${fileName}`;
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url, { headers: { "user-agent": "learning-gallery-models-bot" } });
  if (!response.ok) {
    throw new Error(`Request failed: ${url} (${response.status})`);
  }

  return (await response.json()) as T;
}

async function fetchText(url: string, opts?: { accept?: string }): Promise<string> {
  const response = await fetchWithTimeout(url, {
    headers: {
      "user-agent": "learning-gallery-models-bot",
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
