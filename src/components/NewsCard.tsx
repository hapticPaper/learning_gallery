import Link from "next/link";

import { withBasePath } from "@/lib/basePath";
import type { NewsListItem } from "@/lib/news";

export function NewsCard({ item }: { item: NewsListItem }) {
  return (
    <Link
      href={`/news/${item.slug}`}
      className="group flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
    >
      <img
        alt=""
        className="h-20 w-20 flex-none rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
        src={withBasePath(item.meta.thumbnail)}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="line-clamp-2 text-base font-semibold leading-6 tracking-tight text-zinc-950 dark:text-zinc-50">
              {item.meta.title}
            </div>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {item.meta.source} · {formatDate(item.meta.date)}
            </div>
          </div>
          <span className="mt-1 text-zinc-400 transition group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-200">
            →
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {item.meta.summary}
        </p>
      </div>
    </Link>
  );
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}
