import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { renderMdx } from "@/lib/mdx";

const EXPERIMENTS_DIR = path.join(process.cwd(), "content", "experiments");

export type ExperimentMeta = {
  title: string;
  date: string;
  summary: string;
  tags?: string[];
};

export type ExperimentListItem = {
  slug: string;
  meta: ExperimentMeta;
};

export async function getExperimentSlugs(): Promise<string[]> {
  const entries = await fs.readdir(EXPERIMENTS_DIR);
  return entries
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.replace(/\.mdx$/, ""))
    .sort();
}

export async function getAllExperiments(): Promise<ExperimentListItem[]> {
  const slugs = await getExperimentSlugs();
  const items = await Promise.all(slugs.map(async (slug) => getExperimentMeta(slug)));

  return items.sort((a, b) => {
    const aTime = Date.parse(a.meta.date);
    const bTime = Date.parse(b.meta.date);
    return bTime - aTime;
  });
}

export async function getExperimentMeta(slug: string): Promise<ExperimentListItem> {
  const mdxPath = path.join(EXPERIMENTS_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(mdxPath, "utf8");
  const parsed = matter(raw);

  const meta = parsed.data as Partial<ExperimentMeta>;

  if (!meta.title || !meta.date || !meta.summary) {
    throw new Error(
      `Invalid frontmatter for ${slug}.mdx. Required fields: title, date, summary.`,
    );
  }

  return {
    slug,
    meta: {
      title: meta.title,
      date: meta.date,
      summary: meta.summary,
      tags: meta.tags,
    },
  };
}

export async function getExperiment(slug: string) {
  const mdxPath = path.join(EXPERIMENTS_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(mdxPath, "utf8");
  const { content, frontmatter } = await renderMdx(raw);

  const meta = frontmatter as Partial<ExperimentMeta>;
  if (!meta.title || !meta.date || !meta.summary) {
    throw new Error(
      `Invalid frontmatter for ${slug}.mdx. Required fields: title, date, summary.`,
    );
  }

  return {
    slug,
    meta: {
      title: meta.title,
      date: meta.date,
      summary: meta.summary,
      tags: meta.tags,
    },
    content,
  };
}
