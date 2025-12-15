import Link from "next/link";

import { Tag } from "@/components/Tag";
import type { ExperimentListItem } from "@/lib/experiments";

export function ExperimentCard({ item }: { item: ExperimentListItem }) {
  return (
    <Link
      href={`/experiments/${item.slug}`}
      className="group block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="line-clamp-2 text-base font-semibold leading-6 tracking-tight text-zinc-950 dark:text-zinc-50">
            {item.meta.title}
          </div>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {formatDate(item.meta.date)}
          </div>
        </div>
        <span className="mt-1 text-zinc-400 transition group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-200">
          →
        </span>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {item.meta.summary}
      </p>

      {item.meta.tags?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.meta.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}
