import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { renderMdx } from "@/lib/mdx";

const BLUEPRINTS_DIR = path.join(process.cwd(), "content", "blueprints");

export const MISSING_BLUEPRINT_SLUG = "__missing__";

export function isMissingBlueprintSlug(slug: string): boolean {
  return slug === MISSING_BLUEPRINT_SLUG;
}

export type BlueprintMeta = {
  title: string;
  date: string;
  source: string;
  url: string;
  blurb: string;
  thumbnail: string;
  blueprintId: string;
};

export type BlueprintListItem = {
  slug: string;
  meta: BlueprintMeta;
};

export function formatBlueprintDate(date: string, variant: "card" | "page" = "card"): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    // If frontmatter contains a non-ISO date string, render it as-is rather than throwing.
    return date;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: variant === "page" ? "long" : "short",
    day: "2-digit",
  });
}

function normalizeBlueprintMeta(slug: string, meta: Partial<BlueprintMeta>): BlueprintMeta {
  if (
    !meta.title ||
    !meta.date ||
    !meta.source ||
    !meta.url ||
    !meta.blurb ||
    !meta.thumbnail ||
    !meta.blueprintId
  ) {
    throw new Error(
      "Invalid frontmatter for " +
        `${slug}.mdx. Required fields: title, date, source, url, blurb, thumbnail, blueprintId.`,
    );
  }

  return {
    title: meta.title,
    date: meta.date,
    source: meta.source,
    url: meta.url,
    blurb: meta.blurb,
    thumbnail: meta.thumbnail,
    blueprintId: meta.blueprintId,
  };
}

function compareBlueprintItems(a: BlueprintListItem, b: BlueprintListItem): number {
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

export async function getBlueprintSlugs(): Promise<string[]> {
  const entries = await safeReadDir(BLUEPRINTS_DIR);
  return entries
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.replace(/\.mdx$/, ""))
    .sort();
}

export async function getAllBlueprints(): Promise<BlueprintListItem[]> {
  const slugs = await getBlueprintSlugs();
  const items = await Promise.all(
    slugs.map(async (slug) => {
      try {
        return await getBlueprintMeta(slug);
      } catch (error) {
        console.warn(`Skipping invalid blueprint entry: ${slug}.mdx`, error);
        return null;
      }
    }),
  );

  return items
    .filter((item): item is BlueprintListItem => Boolean(item))
    .sort(compareBlueprintItems);
}

export async function getBlueprintMeta(slug: string): Promise<BlueprintListItem> {
  const mdxPath = path.join(BLUEPRINTS_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(mdxPath, "utf8");
  const parsed = matter(raw);

  return {
    slug,
    meta: normalizeBlueprintMeta(slug, parsed.data as Partial<BlueprintMeta>),
  };
}

export async function getBlueprintItem(slug: string) {
  const mdxPath = path.join(BLUEPRINTS_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(mdxPath, "utf8");
  const { content, frontmatter } = await renderMdx(raw);

  return {
    slug,
    meta: normalizeBlueprintMeta(slug, frontmatter as Partial<BlueprintMeta>),
    content,
  };
}
