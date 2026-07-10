# .claude/ — Claude Code configuration for Brawl Tanks v2

This folder is the control center for how Claude Code behaves in this repo. It is
committed to git so the whole team gets the same context and guardrails.

## Layout

```
CLAUDE.md                     project memory (index + hard rules), loaded every session
.claude/
  README.md                   this file
  settings.json               committed permissions (team-shared safety layer)
  settings.local.json.example template for personal, gitignored overrides
  rules/
    design-values.md          the 3-value filter (Czytelnosc > Sensoryka > Flex)
    mobile-first.md           mandatory mobile paradigms
    architecture.md           repo layout, conventions, gotchas
    delivery-workflow.md      plan/verify/git discipline
  commands/
    faza.md                   /faza — session startup + phase plan
    rice.md                   /rice — RICE scoring for backlog items
    changelog.md              /changelog — post-push Notion housekeeping
```

`CLAUDE.md` imports the four `rules/` files with `@` so they load every session
(they govern every decision). The `commands/` are on-demand ("verbs") — run them by
name (`/faza`, `/rice`, `/changelog`).

## Security model (defense-in-depth — this is a commercial product)

No single layer is trusted alone. Four layers, in order of reliability:

1. **Human gate (most important).** Mariusz approves plans and requests commits.
   Claude never commits/pushes proactively. This is a behavioral rule in CLAUDE.md
   and an `ask` rule in settings.json.
2. **Plan Mode (Shift+Tab).** Start phases in Plan Mode: Claude reads and plans but
   cannot edit/write/run mutating commands until the plan is approved.
3. **Permissions (settings.json).** Evaluated deny -> ask -> allow, first match wins.
   `deny` is the reliable list: it blocks secrets (`.env`, keys) and destructive
   commands (`rm -rf`, `git reset --hard`, `git clean`, force-push, `supabase db
   reset/push`). `ask` gates all git mutations and source edits. `allow` only frees
   read-only verify/build commands so you're not clicking Approve on `git status`.
   NOTE: `allow` for file-modifying commands is not always honored by Claude Code
   (known upstream quirk) — that's fine here, we deliberately keep edits behind `ask`.
4. **Git + .env hygiene.** Secrets live only in `.env` (denied). Supabase writes to
   the production dev project are denied at the CLI level. Keep Claude Code updated —
   several permission-bypass CVEs have been patched over time.

Do NOT switch `defaultMode` to `acceptEdits` or `bypassPermissions` in the committed
settings. If you want faster local loops once you trust a workflow, loosen prompts in
your own gitignored `.claude/settings.local.json` — never in the shared file.

## First-time setup

1. Install Claude Code (Windows native installer, PowerShell):
   `irm https://claude.ai/install.ps1 | iex`  — then open a NEW PowerShell,
   verify with `claude --version` and `claude doctor`.
2. From the repo root: `cd C:\Projects\BrawlTanksv2\ ; claude`
3. Connect MCP: Notion (workspace docs) and, optionally, Supabase read-only.
4. Add `.claude/settings.local.json` to `.gitignore` if it isn't already, then
   optionally copy the `.example` file for personal overrides.
5. Run `/faza` to confirm the session-startup sync works end to end.
