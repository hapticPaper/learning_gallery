import type { Metadata } from "next";

import { BlueprintCard } from "@/components/BlueprintCard";
import { getAllBlueprints } from "@/lib/blueprints";

export const metadata: Metadata = {
  title: "Blueprints",
};

export default async function BlueprintsPage() {
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
