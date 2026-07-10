---
description: Start a new phase — sync live + Notion, then plan + math-verify before any code.
---

Run the mandatory session startup, then set up the phase. Do NOT write or edit code
until this is done and the plan is approved.

## 1. Sync the source of truth

- Read the live build version: fetch https://veltrinitas.github.io/BrawlTanksv2/ and
  check `id="credits"`. NOTE: the GitHub Pages CDN is often stale — treat this as a
  hint, not truth.
- Read Notion PROJECT CONTEXT (`388bb3d0-8803-81e5-9db4-fc45de3ba55c`). This +
  GitHub Actions deploy state WIN over the fetched version and over any older text.
- If the fetched version disagrees with PROJECT CONTEXT, trust PROJECT CONTEXT and say
  so explicitly to Mariusz.

## 2. Establish the phase

- Restate, in one or two lines, the current version and the "next step" from
  PROJECT CONTEXT so Mariusz can confirm we're aligned.
- Identify the real source files this phase touches. Ask for / open them. No guessing.

## 3. Plan before implementation

- Produce a concrete plan.
- For any placement/geometry, math-verify AABB against existing objects BEFORE code.
- State the mobile cost of anything new; if expensive, offer a cheaper variant / a
  quality threshold. Remember mobile state comes from playtests, not code reading.
- Give a recommendation + reasoning, then wait for Mariusz's decision.

Prefer Plan Mode (Shift+Tab) for this whole command: read + plan, no edits, until the
plan is approved. Reply to Mariusz in Polish.
