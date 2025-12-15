import Link from "next/link";

import { ExperimentCard } from "@/components/ExperimentCard";
import { getAllExperiments } from "@/lib/experiments";

export default async function Home() {
  const experiments = await getAllExperiments();
  const featured = experiments.slice(0, 3);

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              A fluid gallery for ML experiments
            </h1>
            <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-300">
              Add writeups, code snippets, videos (Isaac Sim runs, real-world robot
              clips), charts, and interactive diagrams—one MDX file per experiment.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/experiments"
              className="inline-flex items-center justify-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Browse experiments
            </Link>
            <a
              className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
              href="https://github.com/hapticPaper/learning_gallery#adding-content"
              target="_blank"
              rel="noreferrer"
            >
              Add new content
            </a>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Recent</h2>
          <Link
            href="/experiments"
            className="text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            View all →
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => (
            <ExperimentCard key={item.slug} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
