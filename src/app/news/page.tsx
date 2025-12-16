import type { Metadata } from "next";

import { NewsCard } from "@/components/NewsCard";
import { getCharlieChangelogSnapshot } from "@/lib/charlieChangelogSnapshot";
import { getAllNews } from "@/lib/news";

export const metadata: Metadata = {
  title: "News",
};

export default async function NewsPage() {
  const news = await getAllNews();
  const { latestEntry: latestChangelogEntry, hasRecentChangelog, windowDays } =
    getCharlieChangelogSnapshot();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Daily AI-ish links and short summaries assembled by Charlie.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight">Charlie news</h2>

          {hasRecentChangelog && latestChangelogEntry ? (
            <>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Charlie Labs shipped an update recently.
              </p>

              <a
                className="block text-sm font-semibold leading-6 text-zinc-950 hover:underline dark:text-zinc-50"
                href={latestChangelogEntry.url}
                target="_blank"
                rel="noreferrer"
              >
                {latestChangelogEntry.title}
              </a>

              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {latestChangelogEntry.dateText}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                This site stays live because Charlie can run proactive playbooks on a daily cadence—opening PRs
                to add fresh links, fix broken embeds, and keep the gallery tidy.
              </p>

              {!latestChangelogEntry ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  (Couldn&#39;t load the Charlie Labs changelog right now.)
                </p>
              ) : null}

              {latestChangelogEntry && !hasRecentChangelog ? (
                <>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    (No Charlie Labs changelog updates in the last {windowDays} days.)
                  </p>

                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    Latest changelog entry:{" "}
                    <a
                      className="font-medium text-zinc-950 hover:underline dark:text-zinc-50"
                      href={latestChangelogEntry.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {latestChangelogEntry.title}
                    </a>
                  </p>
                </>
              ) : null}

              <a
                className="text-sm font-medium text-zinc-950 hover:underline dark:text-zinc-50"
                href="https://docs.charlielabs.ai/customization/proactive"
                target="_blank"
                rel="noreferrer"
              >
                How proactive playbooks work →
              </a>
            </>
          )}
        </div>
      </section>

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
