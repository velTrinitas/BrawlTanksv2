---
description: After a push, prepare the Notion changelog entry + mandatory housekeeping.
---

Run only AFTER a push to origin/main has completed. GitHub Actions is the source of
truth for deploy — confirm the Actions run, don't rely on fetching the live URL.

## 1. Changelog entry

Add an entry to the Notion changelog page (`38ebb3d0-8803-81ca-82c9-d1b76255e8a1`).
Columns: **Wersja | Typ | Partia | Feature | Opis | Data**.
Emoji flags the weight:
- 🚀 feature
- 🎨 visual / render
- 🔧 minor / fix
- 🐛 bugfix

## 2. Bump PROJECT CONTEXT

Update Notion PROJECT CONTEXT (`388bb3d0-8803-81e5-9db4-fc45de3ba55c`):
- new version + "Ostatnia aktualizacja" line,
- "Aktualny stan + nastepny krok" (last commit summary + the next phase).

## 3. Progress-log comment

Add a comment to the Notion progress log (`376bb3d0-8803-8175-a542-e52ad2d9f49b`)
summarizing what shipped this phase.

Notion tools: `notion-update-page` (update_content) and `notion-create-comment`
generally succeed, sometimes after one retry. Writes to the backlog DB rows may hit a
permission boundary — fall back to a paste-ready block for Mariusz if so. Reply in
Polish.
