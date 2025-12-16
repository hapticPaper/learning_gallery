import type { Metadata } from "next";

import { ModelCard } from "@/components/ModelCard";
import { getAllModels } from "@/lib/models";

export const metadata: Metadata = {
  title: "Models",
};

export default async function ModelsPage() {
  const models = await getAllModels();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Fresh model releases and updates pulled from Hugging Face.
        </p>
        <a
          className="inline-block text-sm font-medium text-zinc-950 hover:underline dark:text-zinc-50"
          href="https://huggingface.co/models?sort=modified"
          target="_blank"
          rel="noreferrer"
        >
          Browse the source feed →
        </a>
      </div>

      {models.length ? (
        <div className="grid gap-4">
          {models.map((item) => (
            <ModelCard key={item.slug} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">No model posts yet.</p>
      )}
    </div>
  );
}
