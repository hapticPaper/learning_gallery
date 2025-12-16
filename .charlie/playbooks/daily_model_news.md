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

1. Create a branch `models-digest-YYYYMMDD` from the latest `develop`.
   - `git fetch origin && git switch develop && git pull --ff-only && git switch -c models-digest-YYYYMMDD`
   - Assumes `origin` points to the canonical repo and `develop` is the integration branch.
   - All remaining steps assume you stay on this `models-digest-YYYYMMDD` branch.
2. Ensure your working tree is clean on `models-digest-YYYYMMDD` before running the generator.
   - If `git status --porcelain` is not empty, commit/stash/discard your changes before continuing.
3. Run the generator:
   - `bun run models:fetch`
4. If there are no changes after the generator runs, stop (no-op) and do not open a PR.
   - If `git status --porcelain` is empty, stop here (no manual edits, no PR).
5. For each modified/new MDX file in `content/models/` (see `git status --porcelain content/models`):
   - Rewrite the summary into 1-2 paragraphs (150-300 words) explaining:
     - what the model is for,
     - why it’s interesting (capability, speed, size/efficiency, dataset, license, etc.),
     - what to try first (a short “how to use” hint is fine).
   - Rewrite `blurb` to be under 240 characters.
   - If it’s clearly derivative, either:
     - delete it and pick another candidate, or
     - keep it but make the summary explicitly say what makes the derivative worth noting.
6. If `git status --porcelain` shows files outside `content/models` and `public/models/thumbnails`, pause and inspect them.
   - If they are unrelated local changes, reset them or move them to another branch before continuing.
   - If they were created by `bun run models:fetch`, treat this as a contract change: stop, do not commit/push/open a PR, and coordinate with the Models owner to update the generator/playbook before proceeding.
   - If you are unsure, stop and check with the Models owner before proceeding.
7. Confirm thumbnails exist for all new items:
   - `public/models/thumbnails/*` contains a matching downloaded thumbnail.
8. Verify:
   - `bun run typecheck`
   - `bun run lint`
   - If either check fails, do not commit/push/open a PR for this run.
9. Commit and push the changes.
   - `git add content/models public/models/thumbnails`
   - `git commit -m "Models: Daily digest YYYY-MM-DD"`
   - `git push -u origin HEAD`
10. If you continued past step 4 (i.e., the run was **not** a no-op), open a PR titled "Models: Daily digest YYYY-MM-DD".
   - Only open a PR if all of the following are true:
     - After running the generator, `git status --porcelain` shows at least one modified or new file.
     - All changes are confined to `content/models` and `public/models/thumbnails` (step 6).
     - `bun run typecheck` and `bun run lint` both pass on the commit you are pushing (step 8).
   - Assign and request review from the current Models owner (currently `hapticPaper`).
   - If `gh` is unavailable, open the PR in the GitHub UI from `models-digest-YYYYMMDD` into `develop`.
     - Make sure to manually set `hapticPaper` as both assignee and reviewer.
   - `BASE_BRANCH` is the integration branch (currently `develop`).
   - `MODELS_OWNER` is the current Models owner (currently `hapticPaper`).
   ```bash
   BASE_BRANCH=develop
   MODELS_OWNER=hapticPaper

   # Update BASE_BRANCH and MODELS_OWNER if these change
   gh pr create --base "$BASE_BRANCH" \
     -t "Models: Daily digest YYYY-MM-DD" \
     -b "$(cat <<'PR_BODY'
   Daily model digest.

   - See `content/models/*.mdx` in the diff for model titles and links.
   PR_BODY
   )" \
     --assignee "$MODELS_OWNER" --reviewer "$MODELS_OWNER"
   ```

## No-op when

- No suitable model candidates are available, or
- Fetching thumbnails fails and a suitable replacement cannot be found.

## Verify

- If the run was a no-op (step 4), no PR should be opened.
- Before opening a PR by any method (CLI or UI), ensure you have run `bun run typecheck` and `bun run lint` on the exact commit being pushed (see step 8).
- Models pages render with images for all newly-added items.

## References

- Generator: `src/scripts/fetch-models.ts`
- Models content: `content/models/*.mdx`
