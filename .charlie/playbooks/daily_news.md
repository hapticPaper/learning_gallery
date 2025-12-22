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

No motley fool or other less-reputable sources. 
## Steps

1. Create a branch `news-digest-YYYYMMDD` from the latest `develop`.
   - `git fetch origin && git switch develop && git pull --ff-only && git switch -c news-digest-YYYYMMDD`
   - Assumes `origin` points to the canonical repo and `develop` is the integration branch.
   - All remaining steps assume you stay on this `news-digest-YYYYMMDD` branch.
2. Ensure your working tree is clean on `news-digest-YYYYMMDD` before running the generator.
   - If `git status --porcelain` is not empty, commit/stash/discard your changes before continuing.
3. Run the generator:
   - `bun run news:fetch`
4. If there are no changes after the generator runs, stop (no-op) and do not open a PR.
   - If `git status --porcelain` is empty, stop here.
   - **If step 4 is a no-op, do not proceed to steps 5–10.**
5. For each modified/new MDX file in `content/news/` (see `git status --porcelain content/news`):
   - Write a summary 1-2 paragraphs, 150-300 words. For the YouTube summaries, just make a bulleted list.
   - Create a blurb description that's under 240 characters.
6. If `git status --porcelain` shows files outside `content/news` and `public/news/thumbnails`, pause and inspect them.
   - If they are unrelated local changes, reset them or move them to another branch before continuing.
   - If they were created by `bun run news:fetch`, treat this as a contract change: stop, do not commit/push/open a PR, and update the generator/playbook before proceeding.
   - If you are unsure, stop and check with the News owner before proceeding.
7. Confirm thumbnails exist for all new items:
   - `public/news/thumbnails/*` contains a matching downloaded thumbnail.
8. Verify:
   - `bun run typecheck`
   - `bun run lint`
9. Commit and push the changes.
   - `git add content/news public/news/thumbnails`
   - `git commit -m "News: Daily digest YYYY-MM-DD"`
   - `git push -u origin HEAD`
10. Open a PR titled "News: Daily digest YYYY-MM-DD".
   - Only do this if step 4 produced changes.
   - Assign and request review from the current News owner (currently `hapticPaper`).
   - If `gh` is unavailable, open the PR in the GitHub UI from `news-digest-YYYYMMDD` into `develop`.
     - Make sure to manually set `hapticPaper` as both assignee and reviewer.
   - `BASE_BRANCH` is the integration branch (currently `develop`).
   - `NEWS_OWNER` is the current News owner (currently `hapticPaper`).
   ```bash
   BASE_BRANCH=develop
   NEWS_OWNER=hapticPaper

   # Update BASE_BRANCH and NEWS_OWNER if these change
   gh pr create --base "$BASE_BRANCH" \
     -t "News: Daily digest YYYY-MM-DD" \
     -b "$(cat <<'PR_BODY'
   Daily news digest.

   - See `content/news/*.mdx` in the diff for story titles and links.
   PR_BODY
   )" \
     --assignee "$NEWS_OWNER" --reviewer "$NEWS_OWNER"
   ```
11. Use the `team_update.md` playbook to summarize the new content added as bullet points and notify the team over slack.
## No-op when

- No candidate stories are available, or
- Fetching thumbnails fails and a suitable replacement cannot be found.

## Verify

- If the run was a no-op (step 4), no PR should be opened.
- Before opening a PR by any method (CLI or UI), ensure you have run `bun run typecheck` and `bun run lint` on the exact commit being pushed (see step 8).
- News pages render with images for all newly-added items.

## Rollback

- Revert the PR.

## References

- Generator: `src/scripts/fetch-news.ts`
- News content: `content/news/*.mdx`

Note: `src/scripts/fetch-news.ts` is expected to only write News content under `content/news` and `public/news/thumbnails`.
If you observe writes outside these paths, follow step 6 to pause the run and update the generator/playbook before resuming.
