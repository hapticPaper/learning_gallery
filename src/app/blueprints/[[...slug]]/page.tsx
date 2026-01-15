import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlueprintCard } from "@/components/BlueprintCard";
import { withBasePath } from "@/lib/basePath";
import { formatBlueprintDate, getAllBlueprints, getBlueprintItem, getBlueprintSlugs } from "@/lib/blueprints";

export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = await getBlueprintSlugs();

  return [
    { slug: [] as string[] },
    ...slugs.map((slug) => ({ slug: [slug] })),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const segments = slug ?? [];

  if (segments.length === 0) {
    return {
      title: "Blueprints",
    };
  }

  if (segments.length !== 1) {
    return {
      title: "Blueprint not found",
      description: "This blueprint entry could not be loaded.",
    };
  }

  const blueprintSlug = segments[0];
  const item = await getBlueprintItem(blueprintSlug).catch((error) => {
    console.warn(`Failed to load blueprint item for metadata: ${blueprintSlug}`, error);
    return null;
  });
  if (!item) {
    return {
      title: "Blueprint not found",
      description: "This blueprint entry could not be loaded.",
    };
  }

  return {
    title: item.meta.title,
    description: item.meta.blurb,
  };
}

export default async function BlueprintsRoute({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const segments = slug ?? [];

  if (segments.length === 0) {
    const blueprints = await getAllBlueprints();

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Blueprints</h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            NVIDIA Build blueprints and workflow templates.
          </p>
          <a
            className="inline-block text-sm font-medium text-zinc-950 hover:underline dark:text-zinc-50"
            href="https://build.nvidia.com/blueprints?filters=publisher%3Anvidia"
            target="_blank"
            rel="noreferrer"
          >
            Browse the source feed →
          </a>
        </div>

        {blueprints.length ? (
          <div className="grid gap-4">
            {blueprints.map((item) => (
              <BlueprintCard key={item.slug} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">No blueprint posts yet.</p>
        )}
      </div>
    );
  }

  if (segments.length !== 1) {
    notFound();
  }

  const blueprintSlug = segments[0];
  const item = await getBlueprintItem(blueprintSlug).catch(() => null);
  if (!item) {
    notFound();
  }

  return (
    <article className="mx-auto w-full max-w-3xl">
      <div className="mb-8">
        <Link
          href="/blueprints"
          className="text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          ← Blueprints
        </Link>

        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {item.meta.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span>{item.meta.source}</span>
          <span aria-hidden="true">·</span>
          <span>{formatBlueprintDate(item.meta.date, "page")}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-xs">{item.meta.blueprintId}</span>
          <span aria-hidden="true">·</span>
          <a
            href={item.meta.url}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950 dark:text-zinc-300 dark:decoration-zinc-700 dark:hover:text-zinc-50"
          >
            View on NVIDIA Build
          </a>
        </div>
      </div>

      <img
        alt={`${item.meta.title} thumbnail`}
        className="mx-auto mb-10 aspect-[16/9] w-full max-w-2xl rounded-l border border-zinc-200 object-cover shadow-sm sm:w-11/12 dark:border-zinc-800"
        src={withBasePath(item.meta.thumbnail)}
      />

      <div className="prose prose-zinc max-w-none dark:prose-invert">{item.content}</div>
    </article>
  );
}
