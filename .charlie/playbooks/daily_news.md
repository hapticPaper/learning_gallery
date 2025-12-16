# Daily news digest

## Overview

Each day, find up to 3 high-signal AI/ML stories (Hacker News, The AI Search on YouTube, and Google News), generate short MDX summaries for them, and add them to the site’s News section.

## Creates

- Artifact: Pull request
- Title pattern: "News: Daily digest YYYY-MM-DD"
- Branch: `news-digest-YYYYMMDD`

## Limits

- Max artifacts per run: 1 PR
- Max stories per run: 3
- Allowed paths:
  - `content/news/**`
  - `public/news/thumbnails/**`
  - `src/**` (only if required to keep the News section working)
- Guardrails:
  - Do not modify existing experiment content.
  - Every News card must have a thumbnail (`thumbnail` frontmatter must be a local `/news/thumbnails/...` path).

## Data collection

1. Hacker News: search for AI-related stories in the last 24h.
2. YouTube: latest upload from https://www.youtube.com/@theAIsearch.
3. Google News: AI-related headlines in the last 24h.

## Steps

1. Create a branch `news-digest-YYYYMMDD`.
2. Run the generator:
   - `bun run news:fetch`
3. For each newly generated MDX file in `content/news/`:
   - Write a summary 1-2 paragraphs, 150-300 words. 
   - Create a blurb description thats under 240 characters. 
4. Confirm thumbnails exist for all new items:
   - `public/news/thumbnails/*` contains a matching downloaded thumbnail.
5. Open a PR titled "News: Daily digest YYYY-MM-DD".
   - Body includes the list of added stories and links.

## No-op when

- No candidate stories are available, or
- Fetching thumbnails fails and a suitable replacement cannot be found.

## Verify

- `bun run typecheck` passes.
- `bun run lint` passes.
- News pages render with images for all newly-added items.

## Rollback

- Revert the PR.

## References

- Generator: `src/scripts/fetch-news.ts`
- News content: `content/news/*.mdx`
