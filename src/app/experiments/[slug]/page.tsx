import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Tag } from "@/components/Tag";
import { getExperiment, getExperimentSlugs } from "@/lib/experiments";

export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = await getExperimentSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const { slug } = params;
  const experiment = await getExperiment(slug);
  return {
    title: experiment.meta.title,
    description: experiment.meta.summary,
  };
}

export default async function ExperimentPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = params;

  try {
    const experiment = await getExperiment(slug);

    return (
      <article className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <Link
            href="/experiments"
            className="text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            ← Experiments
          </Link>

          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {experiment.meta.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
            <span>{formatDate(experiment.meta.date)}</span>
            {experiment.meta.tags?.length ? (
              <div className="flex flex-wrap gap-2">
                {experiment.meta.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="prose prose-zinc max-w-none dark:prose-invert">
          {experiment.content}
        </div>
      </article>
    );
  } catch {
    notFound();
  }
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "2-digit" });
}
