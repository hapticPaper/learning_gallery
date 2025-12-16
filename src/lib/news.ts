import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { renderMdx } from "@/lib/mdx";

const NEWS_DIR = path.join(process.cwd(), "content", "news");

export type NewsMeta = {
  title: string;
  date: string;
  source: string;
  url: string;
  blurb: string;
  thumbnail: string;
};

export type NewsListItem = {
  slug: string;
  meta: NewsMeta;
};

function compareNewsItems(a: NewsListItem, b: NewsListItem): number {
  const aTime = Date.parse(a.meta.date);
  const bTime = Date.parse(b.meta.date);

  const aOk = Number.isFinite(aTime);
  const bOk = Number.isFinite(bTime);

  // Prefer items with valid dates.
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;

  if (aOk && bOk) {
    const diff = bTime - aTime;
    if (diff !== 0) return diff;
  }

  // If both items have invalid dates (or the same timestamp), fall back to slug for
  // deterministic ordering.
  return a.slug.localeCompare(b.slug);
}

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export async function getNewsSlugs(): Promise<string[]> {
  const entries = await safeReadDir(NEWS_DIR);
  return entries
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.replace(/\.mdx$/, ""))
    .sort();
}

export async function getAllNews(): Promise<NewsListItem[]> {
  const slugs = await getNewsSlugs();
  const items = await Promise.all(
    slugs.map(async (slug) => {
      try {
        return await getNewsMeta(slug);
      } catch (error) {
        console.warn(`Skipping invalid news entry: ${slug}.mdx`, error);
        return null;
      }
    }),
  );

  return items
    .filter((item): item is NewsListItem => Boolean(item))
    .sort(compareNewsItems);
}

export async function getNewsMeta(slug: string): Promise<NewsListItem> {
  const mdxPath = path.join(NEWS_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(mdxPath, "utf8");
  const parsed = matter(raw);

  const meta = parsed.data as Partial<NewsMeta>;

  if (!meta.title || !meta.date || !meta.source || !meta.url || !meta.blurb || !meta.thumbnail) {
    throw new Error(
      "Invalid frontmatter for " +
        `${slug}.mdx. Required fields: title, date, source, url, blurb, thumbnail.`,
    );
  }

  return {
    slug,
    meta: {
      title: meta.title,
      date: meta.date,
      source: meta.source,
      url: meta.url,
      blurb: meta.blurb,
      thumbnail: meta.thumbnail,
    },
  };
}

export async function getNewsItem(slug: string) {
  const mdxPath = path.join(NEWS_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(mdxPath, "utf8");
  const { content, frontmatter } = await renderMdx(raw);

  const meta = frontmatter as Partial<NewsMeta>;
  if (!meta.title || !meta.date || !meta.source || !meta.url || !meta.blurb || !meta.thumbnail) {
    throw new Error(
      "Invalid frontmatter for " +
        `${slug}.mdx. Required fields: title, date, source, url, blurb, thumbnail.`,
    );
  }

  return {
    slug,
    meta: {
      title: meta.title,
      date: meta.date,
      source: meta.source,
      url: meta.url,
      blurb: meta.blurb,
      thumbnail: meta.thumbnail,
    },
    content,
  };
}
