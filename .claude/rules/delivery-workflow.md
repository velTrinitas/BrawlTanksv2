# Delivery workflow — planning, verification, git discipline

These gates protect a commercial product. Speed comes from removing mechanical
friction, never from skipping a gate.

## New phase = plan + math BEFORE implementation

1. Sync live + Notion first (see `/faza`).
2. Read the real source files involved — no guessing signatures/constants/values.
3. Produce a plan. For any prop/object placement, math-verify AABB against existing
   objects (a Python/AABB check) BEFORE writing placement code. Measure, don't guess.
4. State the mobile cost of anything new up front (see mobile-first rule).
5. Give a recommendation + reasoning, then wait for Mariusz's decision.

Prefer Plan Mode (Shift+Tab) for this stage: read + plan with no edits until the plan
is approved.

## Delivering code

- **Complete file replacements**, not inline diffs. Exception: very large files
  (`main.ts`, `menu-styles.css`, `index.html`) get targeted edits.
- Never dump code inline in chat — deliver as a file/artifact so Mariusz doesn't
  scroll. (In Claude Code: edit the real file in the repo.)
- Before delivering any file: run a brace-balance check and an esbuild/`tsc --noEmit`
  syntax pass. Don't hand over code that doesn't parse/type-check.
- Defensive `try/catch` is fine, but ALWAYS log `error.stack` + entity context. Never
  swallow errors silently.

## Debugging

- On a visual bug or crash: if 2 iterations pass with no progress, STOP and ask
  Mariusz for an F12 Console screenshot BEFORE a third attempt. A stack trace finds the
  root cause in seconds that blind iteration never will.

## Git discipline (strict)

- **Never propose a commit proactively. Mariusz asks after playtesting.**
- Before committing: `git status --short` (catches untracked new files).
- Use explicit paths: `git add src/foo.ts src/bar.ts` — never `git add -A`.
- PowerShell 5.1: chain with `;`, never `&&`. Deliver commit + push in one block:
  `git add <paths> ; git commit -m "<msg>" ; git push`
- After a push completes, run the post-commit housekeeping via `/changelog`.

## Post-commit housekeeping (mandatory after every push)

In order:
1. Add the Changelog entry (Notion changelog page).
2. Bump PROJECT CONTEXT (Notion) — version + current state + next step.
3. Add a Progress-log comment (Notion progress page).

See `/changelog` for the exact fields and emoji flags.
