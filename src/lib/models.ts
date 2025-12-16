import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { renderMdx } from "@/lib/mdx";

const MODELS_DIR = path.join(process.cwd(), "content", "models");

export type ModelMeta = {
  title: string;
  date: string;
  source: string;
  url: string;
  blurb: string;
  thumbnail: string;
  modelId: string;
  pipelineTag?: string;
};

export type ModelListItem = {
  slug: string;
  meta: ModelMeta;
};

function normalizeModelMeta(slug: string, meta: Partial<ModelMeta>): ModelMeta {
  if (!meta.title || !meta.date || !meta.source || !meta.url || !meta.blurb || !meta.thumbnail || !meta.modelId) {
    throw new Error(
      "Invalid frontmatter for " +
        `${slug}.mdx. Required fields: title, date, source, url, blurb, thumbnail, modelId.`,
    );
  }

  return {
    title: meta.title,
    date: meta.date,
    source: meta.source,
    url: meta.url,
    blurb: meta.blurb,
    thumbnail: meta.thumbnail,
    modelId: meta.modelId,
    pipelineTag: meta.pipelineTag,
  };
}

function compareModelItems(a: ModelListItem, b: ModelListItem): number {
  const aTime = Date.parse(a.meta.date);
  const bTime = Date.parse(b.meta.date);

  const aOk = Number.isFinite(aTime);
  const bOk = Number.isFinite(bTime);

  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;

  if (aOk && bOk) {
    const diff = bTime - aTime;
    if (diff !== 0) return diff;
  }

  return a.slug.localeCompare(b.slug);
}

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export async function getModelSlugs(): Promise<string[]> {
  const entries = await safeReadDir(MODELS_DIR);
  return entries
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.replace(/\.mdx$/, ""))
    .sort();
}

export async function getAllModels(): Promise<ModelListItem[]> {
  const slugs = await getModelSlugs();
  const items = await Promise.all(
    slugs.map(async (slug) => {
      try {
        return await getModelMeta(slug);
      } catch (error) {
        console.warn(`Skipping invalid model entry: ${slug}.mdx`, error);
        return null;
      }
    }),
  );

  return items.filter((item): item is ModelListItem => Boolean(item)).sort(compareModelItems);
}

export async function getModelMeta(slug: string): Promise<ModelListItem> {
  const mdxPath = path.join(MODELS_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(mdxPath, "utf8");
  const parsed = matter(raw);

  return {
    slug,
    meta: normalizeModelMeta(slug, parsed.data as Partial<ModelMeta>),
  };
}

export async function getModelItem(slug: string) {
  const mdxPath = path.join(MODELS_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(mdxPath, "utf8");
  const { content, frontmatter } = await renderMdx(raw);

  return {
    slug,
    meta: normalizeModelMeta(slug, frontmatter as Partial<ModelMeta>),
    content,
  };
}
