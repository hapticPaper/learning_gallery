import type { Metadata } from "next";

import { NewsCard } from "@/components/NewsCard";
import { getAllNews } from "@/lib/news";

export const metadata: Metadata = {
  title: "News",
};

export default async function NewsPage() {
  const news = await getAllNews();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Daily AI-ish links and short summaries assembled by Charlie.
        </p>
      </div>

      {news.length ? (
        <div className="grid gap-4">
          {news.map((item) => (
            <NewsCard key={item.slug} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No stories yet.
        </p>
      )}
    </div>
  );
}
