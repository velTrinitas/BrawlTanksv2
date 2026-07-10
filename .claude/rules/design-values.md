# Design values — the filter for maps / enviro / mechanics / NPCs

Philosophy (Mariusz): for a 9-12 year old player, "realism" is worth ZERO. Three
things matter. Every decision about a map, environment, mechanic, or NPC must pass
this filter, in strict priority order.

## 1. Czytelnosc (readability) — highest priority

The player hates the feeling of injustice. At all times it must be obvious what is
dangerous, what is safe, and what is interactive, and where a hit came from.

- Hitboxes match what is drawn. No invisible collision, no "died from nowhere".
- Zones (stealth / slow / heal) are unambiguously readable visually.
- Bosses/NPCs telegraph before attacking.
- False affordance is a real risk for this age group: glints/sparkles near edges read
  as pickups. Avoid accidental "come here" signals on non-interactive props.

## 2. Sensoryka (sensory feedback)

Everything must crunch, flash, and react. Every interaction returns feedback:

- Hit → hit-stop + sparks + flash. Kill → explosion + floating text + combo.
- Entering a zone → background/sound change. Hovering a prop → alarm/glitch/motion.
- Animations are DRAMATIC, not "realistically subtle" (NOT +/-5% scale, +/-3px bob —
  push harder). Silence or no reaction on interaction = a bug to fix.

## 3. Flex — lowest priority

The player did something epic and the game confirms it, loudly. Mega kill, Perfect
Run, multi-kill with a bomb, frozen kill, ramming — all rewarded with score popups,
bonuses, combo escalation, screen effects. Maps create flex opportunities (enemy
clusters, risk/reward zones). Success must be VISIBLE and rewarded, never quiet.

## Conflict resolution

**Czytelnosc > Sensoryka > Flex.** Never sacrifice readability for a visual effect.
If a Flex effect hurts readability on mobile at 375px, the effect loses.

## Style constraints (non-negotiable)

- ALL programmatic art: PIXI.Graphics + Canvas 2D. Zero external SVG/PNG (sole
  exception: `gem.png` endcard). This keeps the bundle small for Capacitor/PWA.
- Cartoon high-detail, not photoreal.
- Map climate must stay internally consistent — no anachronisms (cyberpunk City,
  Egyptian Desert, Caribbean-farm Tropics).
- Per-feature isolation: dedicated texture caches and render paths, so one feature
  can be tuned or cut without touching others.
