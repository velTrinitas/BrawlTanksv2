---
description: Score a backlog item with RICE and produce a paste-ready row.
argument-hint: [feature to score]
---

Score this backlog item with RICE: **$ARGUMENTS**

The project backlog lives in Notion (database `7a78e4e4-1fa5-43cb-952b-341dbc91f080`)
and is prioritized strictly by descending RICE — priority is the highest RICE, not
"what's most fun".

## Formula

**RICE = (Reach x Impact x Confidence) / Effort**

- **Reach** — how many players / how often the change touches them (relative scale or
  count). Common anchors used in this project: 100 / 70 / 40 / 10.
- **Impact** — strength of effect on the player: 3 = massive, 2 = high, 1 = medium,
  0.5 = low, 0.25 = minimal.
- **Confidence** — certainty of the estimates: 100% / 80% / 50%.
- **Effort** — work required (hours or relative scale; lower is better).

## Output

1. Score each of the four dimensions with a one-line justification.
2. Compute the RICE score.
3. Give a paste-ready backlog row. The backlog schema uses Polish field names:
   Nazwa | Reach in game | Impact | Confidence | Effort | Atrakcyjnosc | Kategoria |
   Mapa/Scenariusz | Status | Wersja | Opis.
   RICE Score is a read-only computed column — populate only the four component fields.

Note: `notion-create-pages` into the backlog DB sometimes hits a connector permission
boundary ("No approval received"). If it fails, hand Mariusz the ready row to paste
manually, or record it in PROJECT CONTEXT as a fallback. Reply in Polish.
