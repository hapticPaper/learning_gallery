# Daily model news

## Overview

Each day, pick up to 3 intriguing/promising newly updated models from Hugging Face’s "recently modified" feed, generate MDX summaries for them, and add them to the site’s Models section.

Source feed: https://huggingface.co/models?sort=modified

## Creates

- Artifact: Pull request
- Title pattern: "Models: Daily digest YYYY-MM-DD"
- Branch: `models-digest-YYYYMMDD`

## Limits

- Max artifacts per run: 1 PR
- Max model posts per run: 3
- Allowed paths:
  - `content/models/**`
  - `public/models/thumbnails/**`
  - `src/**` (only if required to keep the Models section working)
- Guardrails:
  - Do not modify existing experiment content.
  - Avoid repeating the same model twice (use `modelId` frontmatter).
  - Avoid producing multiple near-duplicates from the same “model family” (finetunes / clones), unless the derivative has clear traction or a novel twist.
  - Every Models card must have a thumbnail (`thumbnail` frontmatter must be a local `/models/thumbnails/...` path).

## Steps

1. Create a branch `models-digest-YYYYMMDD`.
2. Run the generator:
   - `bun run models:fetch`
3. For each newly generated MDX file in `content/models/`:
   - Rewrite the summary into 1-2 paragraphs (150-300 words) explaining:
     - what the model is for,
     - why it’s interesting (capability, speed, size/efficiency, dataset, license, etc.),
     - what to try first (a short “how to use” hint is fine).
   - Rewrite `blurb` to be under 240 characters.
   - If it’s clearly derivative, either:
     - delete it and pick another candidate, or
     - keep it but make the summary explicitly say what makes the derivative worth noting.
4. Confirm thumbnails exist for all new items:
   - `public/models/thumbnails/*` contains a matching downloaded thumbnail.
5. Open a PR titled "Models: Daily digest YYYY-MM-DD".
   - Body includes the list of added models and links.

## No-op when

- No suitable model candidates are available, or
- Fetching thumbnails fails and a suitable replacement cannot be found.

## Verify

- `bun run typecheck` passes.
- `bun run lint` passes.
- Models pages render with images for all newly-added items.

## References

- Generator: `src/scripts/fetch-models.ts`
- Models content: `content/models/*.mdx`
