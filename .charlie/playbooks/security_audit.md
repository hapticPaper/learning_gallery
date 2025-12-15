# Audit and remediate security vulnerabilities

## Overview

Scan for dependency vulnerabilities, verify findings against authority sources (NVD, GitHub Advisories), assess code impact and breaking changes, and produce a prioritized remediation plan.

## Creates

- Artifact: Pull request (for safe updates) and/or GitHub issue (for complex remediations)
- Title pattern: "Security: Remediate <N> vulnerabilities"
- Branch: `security-audit-YYYYMMDD`
- Issue assignee: `@hapticpaper` (for critical issues requiring functionality limits)

## Limits

- Max artifacts per run: 1 PR + up to 3 issues
- Max files changed in PR: 10 (lockfiles, package manifests, minimal code patches)
- Guardrails:
  - Only apply updates that pass all existing tests
  - Do not auto-merge; require human review
  - If a critical vuln requires limiting functionality, create an issue assigned to `@hapticpaper`

## Data collection

1. **Scan for vulnerabilities:**
   - Run `npm audit --json` or `bun audit` (or equivalent for your package manager)
   - Capture: package name, installed version, vulnerable range, severity, CVE/GHSA ID

2. **Verify against authority sources:**
   - For each finding, query NVD (https://nvd.nist.gov/) and GitHub Advisory Database
   - Confirm: CVE exists, severity matches, affected versions align
   - Note any discrepancies or false positives

3. **Assess remediation complexity:**
   - **Simple update:** patch/minor bump with no breaking changes
   - **Breaking update:** major version bump; check CHANGELOG/release notes
   - **Code impact:** search codebase for usage of affected APIs; flag if deprecated/removed APIs are used
   - **No fix available:** note if vuln has no patched version yet

## No-op when

- No vulnerabilities found, or
- All findings are false positives after authority verification, or
- Fixes would exceed limits or break tests

## Steps

1. Create branch `security-audit-YYYYMMDD`.
2. Run vulnerability scan; parse and dedupe findings.
3. For each vulnerability:
   - Verify against NVD/GitHub Advisories; skip false positives.
   - Classify: simple update, breaking update, code impact, or no fix.
4. Apply simple updates first:
   - Update lockfile/manifest; run `bun install` or equivalent.
   - Run full test suite (`bun run test:all`, `bun run typecheck:all`, `bun run lint:all`).
5. For breaking updates:
   - Check release notes for migration steps.
   - Search codebase for affected API usage.
   - If code changes needed, include in PR with clear comments.
6. For critical vulns with no safe fix:
   - If functionality must be limited, apply minimal safeguard (e.g., disable feature flag).
   - Create a GitHub issue titled "Critical vuln requires attention: <CVE>" assigned to `@hapticpaper`.
7. Open PR titled "Security: Remediate <N> vulnerabilities".
   - Body includes: table of vulns addressed, authority source links, breaking change notes, and any issues created.

## Verify

- `npm audit` / `bun audit` shows reduced or zero vulnerabilities.
- All tests pass.
- Breaking changes documented in PR body.
- Issues created for unresolved critical vulns.

## Rollback

- Revert the PR. If functionality was limited, restore via the linked issue.

## References

- NVD: https://nvd.nist.gov/
- GitHub Advisory Database: https://github.com/advisories
- npm audit docs: https://docs.npmjs.com/cli/commands/npm-audit