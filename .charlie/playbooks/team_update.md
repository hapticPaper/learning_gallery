# Generate a team update (single‑file PR)

## Overview

Create a concise, narrative report of what the team accomplished in a fixed date window by summarizing merged/updated work across code and issues. Produce one Markdown file with clear sections and lightweight references; open a PR that changes only that file.

## Creates

- Artifact: Pull request
- Title pattern: "team update: <Month D–D, YYYY>"
- Branch: `team-update-YYYYMMDD`
- Report file (create dirs as needed): `reports/team-updates/<YYYY-MM-DD>--<YYYY-MM-DD>.md`

## Limits

- Max artifacts per run: 1 PR
- Max files changed: 1 (the new/updated report file)
- Allowed operations: add a new Markdown report for the window; update an existing report only to correct factual errors
- Guardrails:
  - No raw data dumps, exports, or screenshots in the PR—only the human‑readable report.
  - Use a single, fixed timezone for the window (UTC recommended) and treat it as a half‑open interval: `[START_DATE, END_DATE)`.
  - Attribute bot‑opened PRs to the human assignee/owner when crediting work.
  - Exclude sensitive/private data and links requiring special access.

## Data collection

- Choose window:
  - Set `START_DATE` and `END_DATE` anchored to 00:00 in a single timezone (e.g., UTC). Example: yesterday → today.
- Gather inputs (any tooling/API is fine):
  - Code: PRs merged within the window; open/draft PRs updated within the window; basic churn (files/lines) when available.
  - Issues: items updated/closed within the window; notable comments/decisions.
  - People: authors, reviewers, assignees; count unique contributors.
  - Projects/areas: group related work into themes.
- Derive metrics (keep it simple and explain in prose):
  - Merged PR count; updated‑open PR count; repos/packages touched; approximate churn (additions/deletions) if available.
  - Top contributors/reviewers (by count), noting cross‑repo impact when relevant.

## Drafting the report

Write `reports/team-updates/<YYYY-MM-DD>--<YYYY-MM-DD>.md` with:

- Header:
  - `# Team report: <Month D–D, YYYY>`
  - `Window: <START_DATE> → <END_DATE> (UTC)`
- Two lead paragraphs:
  - The narrative: what moved forward and why it matters.
  - Headline numbers woven into prose (no raw bullet scoreboard).
- Sections (in order):
  1. `## Overview` – 2–3 paragraphs linking the story to the metrics.
  2. `## By person` – short paragraph per human contributor (attribute bot PRs to the human assignee).
  3. `## By project` – one short paragraph per major effort (`###` subheadings).
  4. `## What changed in practice` – short paragraph (or up to 3 bullets) describing user/team impact.
  5. `## Focus moving forward` – ≤3 sentences with actionable next steps.
  6. `## References` – footnotes only:
     - Use `[^fn1]: <plain URL> — one‑sentence context`
     - Place markers like `[^fn1]` after sentences in the body.
     - When a PR links to an issue, put both in the same footnote (PR first, then the issue), separated by `/`.
- Style guardrails:
  - Prefer paragraphs; use lists only when needed.
  - Format numbers with thousands separators.
  - Keep all external links in footnotes; no inline raw URLs in the prose.

## No‑op when

- There is effectively no activity (e.g., 0 merged PRs and no notable issue updates), or
- Required sources are unavailable, or
- The report would require multiple files or exceed repository size constraints.

## Steps

1. Create a branch `team-update-YYYYMMDD`.
2. Pick the window (`START_DATE`, `END_DATE`); gather inputs; compute simple metrics.
3. Draft the report following "Drafting the report" above; ensure it lives at `reports/team-updates/<YYYY-MM-DD>--<YYYY-MM-DD>.md`.
4. Run your normal project checks for Markdown/docs (format/lint if applicable).
5. Open a PR titled "team update: <Month D–D, YYYY>".
   - PR body: a short summary paragraph (no footnotes) echoing the headline numbers and themes.
6. (Optional) Post a brief summary to your team channel with a link to the PR.

## Verify

- Exactly one file changed under `reports/team-updates/`.
- Footnotes render and every marker has a definition.
- Numbers in prose match the simple counts you computed.
- Links open without auth errors (or are intentionally internal and labeled as such).

## Rollback

- Revert the PR (single commit). No further cleanup required.