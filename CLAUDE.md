# CLAUDE.md — Brawl Tanks Season 2

Persistent project memory for Claude Code. Loaded at the start of every session.
Keep this file short and stable; deep/topic-specific rules live in `.claude/rules/`
and are imported below. Running state (versions, changelog, roadmap) lives in
Notion + the live build — NOT here. This file is a behavioral contract, not a wiki.

---

## What this is

**Brawl Tanks Season 2** — commercial browser-based top-down tank brawler/survival
arena. Ships to Steam + App Store + Google Play via Capacitor/PWA. **Target players:
ages 9-12.** This is a commercial product, not a hobby. No shortcuts, no compromises
on safety, mobile readability, or type-safety.

- **Team:** Mariusz (Bielsko-Biala) — lead programmer + designer. Michal — co-creator
  (playtesting, feedback).
- **Repo:** https://github.com/velTrinitas/BrawlTanksv2
- **Live (GitHub Pages):** https://veltrinitas.github.io/BrawlTanksv2/
- **Working dir:** `C:\Projects\BrawlTanksv2\` (Windows).

## Stack

TypeScript (strict) + Vite + PixiJS v7.4.3 + Howler.js. Supabase (eu-central-1
Frankfurt, project `brawltanks-dev`) for profile sync + score submit (offline-first,
anon auth, RLS read+insert). i18n in `src/i18n/` (type-safe `t('key')` with literal
keys, `en: typeof pl` enforcement). Capacitor wrap planned. ALL art is programmatic
(PIXI.Graphics + Canvas 2D) — zero external assets (sole exception: `gem.png`
endcard). Font: Titan One (single-weight; bold = faux-bold).

---

## HARD RULES (highest priority)

1. **IMPORTANT — Session startup is mandatory. Run `/faza` (or do it manually)
   before any code analysis, planning, or coding.** Read the live version, then the
   Notion PROJECT CONTEXT, and treat those as the source of truth. The live build +
   Notion win over anything written in code, this file, or older summaries.

2. **IMPORTANT — GitHub Actions is the source of truth for deploy state, NOT a web
   fetch of the live URL.** GitHub Pages CDN is often cached/stale. If a fetched
   `id="credits"` version looks older than Notion PROJECT CONTEXT, trust Notion +
   Actions. (Verified real case: fetch showed v0.65.0 while true state was v0.67.0.)

3. **IMPORTANT — Never assess mobile behavior by reading code.** Live build +
   Mariusz/Michal playtests are the ONLY authority on mobile state. Code reading
   produces worst-case guesses, not truth. See `.claude/rules/mobile-first.md`.

4. **YOU MUST NOT commit or push unless Mariusz explicitly asks.** He requests it
   after playtesting. Never propose a commit proactively. Before any commit run
   `git status --short` and use explicit `git add <path>` — never `git add -A`.

5. **YOU MUST NOT read, print, or paste secrets** (`.env`, API keys, Supabase service
   keys, tokens) into chat, files, or commits. If a task seems to need one, stop and
   ask Mariusz to handle it himself.

6. **Recommendation before decision.** Always give a concrete expert recommendation
   plus reasoning BEFORE asking Mariusz to choose. Offer two options only when
   genuinely ambivalent, and then show the trade-offs. Communicate with Mariusz in
   **Polish** in chat; write **English (no diacritics)** in code and comments.

---

## Shell — Windows PowerShell 5.1

PowerShell 5.1 does NOT support `&&`. Chain commands with `;`.
Correct: `git add src/main.ts ; git commit -m "..." ; git push`
Wrong:   `git add src/main.ts && git commit ...`

---

## The 3 design values (the filter for every map / enviro / mechanic / NPC)

For a 9-12 year old, realism has ZERO value. Every design decision passes this filter,
in this strict priority order:

1. **Czytelnosc (readability)** — the player must never feel cheated. Always clear what
   is dangerous, safe, interactive, and where a hit came from. Hitboxes match visuals.
2. **Sensoryka (sensory feedback)** — everything must crunch, flash, react. Silence /
   no-reaction on interaction is a bug. Animations are DRAMATIC, not subtle.
3. **Flex** — the game loudly confirms epic moments (mega kill, Perfect Run, combos).

**Hierarchy on conflict: Czytelnosc > Sensoryka > Flex.** Never sacrifice readability
for a visual effect. Full detail: `.claude/rules/design-values.md`.

---

## Always-on rules (imported)

@.claude/rules/design-values.md
@.claude/rules/mobile-first.md
@.claude/rules/architecture.md
@.claude/rules/delivery-workflow.md

## On-demand workflows (slash commands — read when triggered)

- `/faza`      — start a new phase: sync live+Notion, then plan + math-verify.
- `/rice`      — score a backlog item (RICE) and produce a paste-ready row.
- `/changelog` — after a push, prepare the Notion changelog entry + housekeeping.

Canonical Notion references (do not hardcode elsewhere; these are the source of truth):
- PROJECT CONTEXT (live): `388bb3d0-8803-81e5-9db4-fc45de3ba55c`
- Changelog page:         `38ebb3d0-8803-81ca-82c9-d1b76255e8a1`
- Progress log:           `376bb3d0-8803-8175-a542-e52ad2d9f49b`
- Backlog database:       `7a78e4e4-1fa5-43cb-952b-341dbc91f080`
