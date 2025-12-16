# Daily Charlie changelog check

## Overview

Each day, check https://www.charlielabs.ai/changelog and update the News page “Charlie news” widget when the latest entry becomes recent (within the last 15 days) or no longer recent.

This playbook is intended to run once per day via Charlie’s proactive scheduler.

## Creates

- Artifact: Pull request
- Title pattern: "Charlie: Changelog check YYYY-MM-DD"
- Branch: `charlie-changelog-YYYYMMDD`

## Limits

- Max artifacts per run: 1 PR
- Allowed paths:
  - `src/data/charlie-changelog.json`
  - `src/scripts/fetch-charlie-changelog.ts`
  - `src/lib/charlieChangelog.ts`
  - `src/app/news/page.tsx`

## Steps

1. Create a branch `charlie-changelog-YYYYMMDD` from the latest `develop`.
   - `git fetch origin && git switch develop && git pull --ff-only && git switch -c charlie-changelog-YYYYMMDD`
2. Ensure your working tree is clean on `charlie-changelog-YYYYMMDD`.
   - If `git status --porcelain` is not empty, commit/stash/discard your changes before continuing.
3. Run the generator:
   - `bun run changelog:fetch`
4. If there are no changes after the generator runs, stop (no-op) and do not open a PR.
   - If `git status --porcelain` is empty, stop here.
5. Verify:
   - `bun run typecheck`
   - `bun run lint`
6. Commit and push the changes.
   - `git add src/data/charlie-changelog.json`
   - `git commit -m "Charlie: Changelog check YYYY-MM-DD"`
   - `git push -u origin HEAD`
7. Open a PR titled "Charlie: Changelog check YYYY-MM-DD".
   - Only open a PR if step 4 produced changes.
   - Assign and request review from `hapticPaper`.
   ```bash
   BASE_BRANCH=develop
   OWNER=hapticPaper

   gh pr create --base "$BASE_BRANCH" \
     -t "Charlie: Changelog check YYYY-MM-DD" \
     -b "$(cat <<'PR_BODY'
   Updates `src/data/charlie-changelog.json` based on the latest entry in https://www.charlielabs.ai/changelog.
   PR_BODY
   )" \
     --assignee "$OWNER" --reviewer "$OWNER"
   ```

## No-op when

- The snapshot is already up to date (no diff in `src/data/charlie-changelog.json`).
- The changelog can’t be fetched (avoid opening noisy PRs).

## References

- Generator: `src/scripts/fetch-charlie-changelog.ts`
- Snapshot: `src/data/charlie-changelog.json`
- News widget: `src/app/news/page.tsx`
