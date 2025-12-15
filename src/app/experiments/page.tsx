import type { Metadata } from "next";

import { ExperimentCard } from "@/components/ExperimentCard";
import { getAllExperiments } from "@/lib/experiments";

export const metadata: Metadata = {
  title: "Experiments",
};

export default async function ExperimentsPage() {
  const experiments = await getAllExperiments();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          One MDX file per experiment. Use the included MDX components to embed
          code, videos, charts, and interactive diagrams.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {experiments.map((item) => (
          <ExperimentCard key={item.slug} item={item} />
        ))}
      </div>
    </div>
  );
}
