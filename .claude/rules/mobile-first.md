# Mobile-first — mandatory paradigms (apply to EVERY element)

Overriding rule: mobile is NOT an afterthought. For every new element (map, prop,
enviro, mechanic, effect, HUD panel) the mobile cost is calculated UP FRONT — nothing
is "free". The game really runs on mobile today; the goal is to keep it that way and
improve it, never to regress it with new additions.

**Source of truth for mobile state = live build + Mariusz/Michal playtests. NEVER
extrapolate mobile behavior from reading code.** Code reading yields worst-case
guesses. If unsure about mobile impact, say so and ask for a playtest — do not assert.

## 1. Readability at 375px = a hard gate

Every new HUD/panel element is checked at 375px for collisions and overwrites BEFORE
delivery. Known soft-spot: HUD scaling + super-powers panel overlap + end screens on
small displays. Design for landscape lock.

## 2. Touch control is a requirement, not an option

Everything works through TouchInputManager: floating left joystick (Brawl Stars
pattern), fixed right aim+fire stick, single super button + long-press cycle. No
mechanic may depend on scroll-wheel / hover / RMB / keyboard without a touch
equivalent. Tap targets large enough for a thumb. Control transparency
(base ~0.30 / knob ~0.70) must not hide the play field.

## 3. Fill-rate kills mobile, not object count

Avoid full-screen overdraw: god rays, large glow, screen-blend, big alpha gradients.
Defaults: pre-render statics to offscreen, viewport culling, object pooling
(`Effects.ts`). Every heavy new effect gets a quality threshold / cheaper variant so
it can be scaled down on weak hardware without breaking "runs fine".

## 4. Design for zoom 0.7 + touch imprecision

On mobile the world is zoomed to 0.7 — element sizes and readability must work at that
view. Balance accounts for a per-brawler mobile speed multiplier
(Pancerny ~x1.05 down to Scout ~x0.68) to compensate for touch imprecision.

## 5. Light bundle / Capacitor-ready

PixiJS (deliberately not Phaser) + all-programmatic art = small bundle for the store
wrap. Do not add heavy assets or dependencies that burden PWA/Capacitor.

## Working rule

When proposing any new feature, state its mobile cost immediately, and — if expensive —
offer a cheaper alternative or a quality threshold. The question is never "should we
optimize for mobile", it is "how do we do this so mobile still runs smooth".

## Active context (current phase — verify against Notion each session)

Next phase is **Flip 2.5D render to default + mobile zoom-out**. Tension to hold:
zoom-out shows more map (better UX Mariusz wants) BUT shrinks sprites (375px gate) and
renders more tiles (fill-rate rises). Mandatory: validate on real target Android
BEFORE flipping, keep it reversible via flags, measure FPS/memory. Levers:
`ENEMY_BAKE_ANGLES` 36->24, bake resolution, the zoom value itself.
