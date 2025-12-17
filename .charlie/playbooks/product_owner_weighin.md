# Product owner weigh-in

## Overview

Identify assumption misalignment, interpretation drift, and gaps between stated intent and implementation that present real risk to future productivity. This playbook surfaces only findings that matter: where the human's assumption may be incorrect, where the agent may have misunderstood intent, or where a constraint was overlooked. It does not produce reports for process sake—only to focus human attention on what could derail the next phase of work. Output is a triage summary (not a comprehensive review), with focus on catch-now-or-pay-later risks.

## Creates

- Artifact: Review report (GitHub issue or PR comment)
- Title pattern: "Review: <Work area> approach & forward implications"
- Non-blocking; advisory only

## Limits

- This playbook is **not** a code review for correctness or performance.
- It does **not** produce comprehensive critique; it highlights 0–2 high-risk gaps or none if alignment is clear.
- It stops immediately when all findings are either already acknowledged or clearly non-blocking.
- It runs **after** a feature or refactor has made usable progress and context is retrievable.
- It does **not** block PR merge, but findings must be explicitly acknowledged or mitigated before integration if they present real risk.

## Invocation triggers

Call this playbook when:

- Starting a large refactor (e.g., consolidating utilities, reorganizing patterns) or completing one.
- Adding a new major feature or subsystem (e.g., new content type, data pipeline, caching layer).
- Making an architectural choice that trades simplicity for flexibility (or vice versa).
- Discovering misalignment between implementation approach and stated product goals.
- Wrapping up work on something cross-cutting (scripts, loaders, config patterns).

## Assessment framework

For each area of change, ask:

1. **Does the implementation match stated intent?** Reread the original prompt, issue, or brief. Does the code do what was asked, or did the agent extrapolate, assume, or pivot without checking? Mark as risk if there's plausible interpretation mismatch.

2. **Is there an assumption baked in that contradicts the roadmap or past direction?** Does this code assume linear growth, single-user, static data, or a constraint that's likely to change? Pull historical context (past PRs, comments, roadmap). If the assumption is wrong, does it force a rewrite?

3. **Did the human intend something different but didn't say it clearly, and the agent made a reasonable but risky guess?** This is where ambivalence hides. Look for: "we need X" → agent built exactly X but with narrow scope that won't scale to the *real* need, or agent added abstraction that buys nothing for the use case. Probable if human skipped a detail or agent defaulted to "safe" patterns.

4. **Is there a decision that locks out a likely future need?** Not "might lock out," but "the next person will have to unpick this if we want Y." Examples: data format only works for current schema; script assumes synchronous execution; component API is too rigid to support planned variants.

5. **Where did the agent make a unilateral call on something that should have been explicit?** (E.g., "we'll fetch at build time" when the brief never said "build time only"; "this runs on the client" when deployment strategy wasn't specified.) Risk is false consensus.

## Steps

1. **Retrieve context fast**:
   - Read the original prompt, issue, or Slack that triggered the work. (This is essential; skip and risk missing the misalignment entirely.)
   - Scan the PR/branch diff for the *key decisions*, not every line.
   - Note: roadmap direction, any constraints mentioned, and what "success" looked like.

2. **Identify the 1–2 highest-risk decisions**:
   - What did the agent choose that could be interpreted differently?
   - What assumption did they bake in that wasn't explicitly confirmed?
   - What pattern did they use that only works *if* something stays true?
   - Do not enumerate all decisions; focus only on ones that could cause real friction later.

3. **Check for misalignment**:
   - Does the implementation match the prompt, or did the agent pivot? If unclear, this is a finding.
   - Is there an assumption that contradicts past work or roadmap? If yes, this is a risk.
   - Would the next person (or phase) hit this and have to backtrack? If yes, surface it now.

4. **Decide: report or no-op**:
   - If you find a real gap (assumption is likely wrong, intent misunderstood, or future work is now harder), write 1–2 sentences per finding.
   - If findings are already documented in the PR, already mitigated in code, or obviously minor, **do not** write a report.
   - If alignment is clear and no assumptions are at risk, **no-op**: say nothing.

5. **Post only if needed**:
   - If reporting: post as a comment or issue *specifically* flagging the misalignment risk and why it matters to next steps.
   - Tone: "I noticed X might mean Y; should we confirm before integrating?" Not "You should have done Z."
   - Suggest a minimal clarification or next check, not a redo.

## Example assessment

**Work**: Consolidating model fetching logic into a single `fetch-models.ts` script.

**Original brief**: "Create a script to fetch model metadata and add it to the site."

**Implementation**: Fetch runs at build time only; fetched data is static MDX files in `content/models/`.

**Assessment**:
1. *Intent match?* Brief didn't specify build vs. runtime. Agent chose build-time (safer assumption). But if the human later wants to show "live trending models" or refresh without rebuilding, this will require unpicking the whole approach.
2. *Assumption risk?* Agent assumed "fetch once, embed in content" is the model. But if the product direction goes toward dynamic content or user-submitted models, this becomes a blocker. Worth confirming.
3. *Next phase friction?* If trends/live updates become a goal, we'd have to separate fetch logic from static generation. Not a deal-breaker now, but blocks that path unless undone.

**Report**: "Confirm that build-time-only fetch aligns with product direction. If live updates or user submissions are planned, we should chat about whether fetch should be refactorable to runtime before this merges."

## No-op when

- The original brief was detailed and explicitly covered the decisions made; alignment is clear and documented.
- Any ambiguity is already flagged in PR comments or acknowledged by the team.
- The work is low-stakes (e.g., adding a component variant) and future changes won't cascade.
- You've scanned the brief, diff, and code and found no misalignment or assumptions at risk.

## Verify

- Report is posted and linked to the relevant PR or branch.
- Findings are clear enough that another team member could act on them in a follow-up.
- Tone is constructive and does not prescribe specific rewrites.

## Anti-patterns to avoid

- **Generating reports because it's a process step**: If you have nothing real to flag, say nothing. Empty reports waste attention.
- **Extrapolating future needs that aren't on the map**: "What if we need X someday?" Focus only on: Is there ambiguity in the brief? Is there a decision that contradicts known direction?
- **Being vague**: Don't say "this might cause issues." Say "If [concrete scenario] happens, then [specific friction]."
- **Prescribing rewrites or design changes**: You're not redesigning; you're catching misalignment. Suggest clarification or next-step validation, not rework.
- **Assuming intent without checking the original brief**: This is the most common failure mode. Reread the prompt. If you don't have it, ask for it. Guessing at intent is worse than not reviewing at all.
- **Tone policing or second-guessing reasonable choices**: If the agent's decision was defensible given the brief, don't flag it as a risk. Focus on *actual misalignment*, not "style."
