import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withBasePath } from "@/lib/basePath";
import { getNewsItem, getNewsSlugs } from "@/lib/news";

export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = await getNewsSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getNewsItem(slug);
  return {
    title: item.meta.title,
    description: item.meta.summary,
  };
}

export default async function NewsItemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const item = await getNewsItem(slug).catch(() => null);
  if (!item) {
    notFound();
  }

  return (
    <article className="mx-auto w-full max-w-3xl">
      <div className="mb-8">
        <Link
          href="/news"
          className="text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          ← News
        </Link>

        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {item.meta.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span>{item.meta.source}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDate(item.meta.date)}</span>
          <span aria-hidden="true">·</span>
          <a
            href={item.meta.url}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950 dark:text-zinc-300 dark:decoration-zinc-700 dark:hover:text-zinc-50"
          >
            Original link
          </a>
        </div>
      </div>

      <img
        alt=""
        className="mb-6 aspect-[16/9] w-full rounded-2xl border border-zinc-200 object-cover shadow-sm dark:border-zinc-800"
        src={withBasePath(item.meta.thumbnail)}
      />

      <div className="prose prose-zinc max-w-none dark:prose-invert">{item.content}</div>
    </article>
  );
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "2-digit" });
}
