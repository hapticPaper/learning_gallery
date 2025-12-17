# Fix README errors and outdated info

## Overview

Make a small, reversible PR that fixes objectively wrong items in a single README. Focus on broken links/badges, incorrect commands, and stale version notes. Do not rewrite prose.

## Creates

- Artifact: Pull request
- Title pattern: "Fix README.md errors and outdated info"
- Branch: `readme-fixes-YYYYMMDD`

## Limits

- Max artifacts per run: 1 PR
- Max files changed: 1 file (exactly one `README.md`)
- Max total diff: 150 changed lines
- Allowed paths (pick one file only):
  - Any `README.md` file anywhere in the repository (e.g., `**/README.md`)
- Guardrails:
  - Only fix factual inaccuracies (commands, links, badges, version/engine notes). No wording/style rewrites.
  - Do not change license text, security policies, or contributor agreements.
  - Prefer removing broken badges over replacing them unless a current, authoritative URL is known.

## Data collection

- Candidate selection:
  - Build the list of README files matching the Allowed paths.
  - Sort by last modified time ascending (oldest first).
  - Inspect each file until you find one with clear issues (see checks below); stop after selecting the first valid candidate.

- Checks for the selected file:
  - Commands/scripts: compare examples in the README with the project’s manifest/scripts (e.g., `package.json` or equivalent). Flag renamed/removed scripts and outdated CLI flags.
  - Engines/versions: align any Node/PNPM/Bun (or other runtime/tool) version statements with the project’s declared engine/version constraints where present.
  - Links/badges: verify external links open successfully (treat 4xx/5xx as broken). For intra‑repo links, ensure the targets exist on the default branch.
  - Quickstart: ensure minimal setup steps match actual scripts (e.g., “install dependencies”, “start dev server”), or reduce to a safe subset.
  - General mistakes/inaccuracies: fix clear factual errors (e.g., wrong repository slugs, typos in commands/paths, mismatched badge labels) without changing tone or style.

## No‑op when

- No README file exhibits factual errors per the checks above, or
- Fixes would exceed any limit (files/lines), or
- The authoritative target for a broken link is unclear.

## Steps

1. Create a branch `readme-fixes-YYYYMMDD`.
2. From Candidate selection, pick the first README with clear issues; keep edits surgical.
3. Apply fixes:
   - Replace or remove broken links/badges (prefer authoritative replacements).
   - Update command snippets to match current scripts and flags.
   - Align engine/version notes with declared constraints (or remove stale notes).
   - Address other objective mistakes (see checks above).
4. Run the repository’s code formatter on the changed file(s) only.
5. Open a PR titled "Fix README.md errors and outdated info".
   - PR body should list the specific fixes (e.g., “Updated install command”, “Replaced dead link to X”) and note how links/commands were validated.

## Verify

- Updated links open successfully.
- Example commands exist in the project’s scripts/manifest and are accurate.
- Diff touches a single README and remains small.

## Rollback

- Revert the PR (single revert commit). If badges were removed, include prior URLs in the revert description for future reference.