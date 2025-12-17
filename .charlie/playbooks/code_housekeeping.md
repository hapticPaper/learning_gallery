# Delete dead/dormant code (single‑file PR)

## Overview

Remove code that is clearly unused or obsolete. Keep the change small, limited to one file, and fully reversible. Require multiple independent signals before deleting anything.

## Creates

- Artifact: Pull request
- Title pattern: "Delete dead/dormant code in <path>"
- Branch: `dead-code-cleanup-YYYYMMDD`

## Limits

- Max artifacts per run: 1 PR
- Max files changed: 1 (the single modified file)
- Allowed operations: delete one entire file OR delete specific symbols (functions, types, constants, classes) within one file
- Allowed paths: source files only (e.g., `src/**`). Exclude tests, mocks, examples, fixtures, docs, generated code, build outputs, and migrations.
- Guardrails:
  - Require at least two strong signals the target is unused (see Data collection).
  - Do not delete anything that is part of a public API or SDK surface.
  - Avoid targets re‑exported by “barrel” index modules or listed in package/module export maps.
  - Do not pick a target that would force edits to other files.

## Data collection

- Candidate selection:
  - Prefer leaf modules or helpers that appear isolated.
  - Favor code untouched for a long period while nearby code changed.
  - Look for deprecated/legacy comments or logic behind a permanently disabled flag.

- Signals to justify deletion (use at least two):
  - Zero imports (or dynamic imports) of the file anywhere in the repository.
  - For symbol‑level deletions: zero references to the symbol outside the file; within the file, only the definition remains.
  - Not re‑exported from an index/barrel file in the same folder or any ancestor.
  - Not exposed via public exports, routing tables, command registries, or plugin discovery.
  - Dormant history: unchanged for a long period (e.g., 6–12 months) while adjacent modules evolved.
  - Registration gap: route/command/job/tool code exists but is not wired into any runtime registry.

## No‑op when

- You cannot produce two independent signals.
- Deletion would break a public API surface or require edits outside the single file.
- Usage may be dynamic/reflection‑based and you cannot confidently rule it out.

## Steps

1. Create a branch `dead-code-cleanup-YYYYMMDD`.
2. Choose one safe target based on the signals above.
3. Delete the file, or remove the specific unused symbols within it. Keep other exports intact.
4. Run your project’s standard checks:
   - Format the changed file.
   - Build/compile (or type‑check) the project.
   - Run unit tests and linting if available.
   - If anything fails due to unresolved imports/exports, revert this deletion and pick a different target.
5. Open a PR titled "Delete dead/dormant code in <path>".
   - In the PR body, cite the two strongest signals and confirm all checks passed. Note that only one file changed and the change is reversible.

## Verify

- Code search shows no imports/usages of the deleted path/symbols.
- Build/tests/lint succeed with the deletion.
- Public API, barrels, and export maps remain unaffected.

## Rollback

- Revert the PR (single commit). No follow‑up actions required.

> Note: This playbook applies to any language. Map “barrels/exports/registries” to your ecosystem’s equivalent (e.g., module index files, public headers, service/route registries).