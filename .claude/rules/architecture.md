# Architecture — repo layout, conventions, gotchas

Before writing code, read the real source files involved. Never guess signatures,
constants, or values. The layout below is a map, not a substitute for reading.

## Repo layout (`src/`)

```
src/
  audio/AudioSys.ts              per-map music pools, singleton
  config/                        brawlers, constants, enemies, powers, difficulty.ts
  entities/                      Bullet, EnemyBullet, Enemy, Player,
                                 pickups/{Gem,Heart,Magnet,PowerCube}
  i18n/                          i18n.ts + translations/{pl,en}.ts
  input/TouchInputManager.ts     mobile controls, auto-detect
  maps/
    CityMap.ts, DesertMap.ts, TropicsMap.ts   texture + layout configs
    HoverRepairPad.ts, PowerHoverPad.ts
    city/     SludgeReactor, AntiGravScrap, HoloTurbine, NeonBillboard, CyberpunkBorder
    desert/   Pyramid, Sphinx, RiverNile, Bridge, WaterLife, Rock, Quicksand, Oasis,
              Caravan, SandstormBorder, DesertHeartPad, DesertStormPad
    tropics/  CornField, SugarcaneField, LettuceField, PastureField, DirtRoad,
              BarnBuilding, Henhouse, Cowshed, CountryHouse, Windmill, PatrolTractor,
              Stable, Paddock, Horse, TropicalBorder, CloverMediPad, StumpPowerPad
  rendering/                     Effects, HUD, SpriteFactory, profile/ProfileSpriteCache
  services/                      ScoreService, SessionService, ProfileService,
                                 GameSession, SupabaseScoreService, profileSync
  systems/                       Physics, PowerSystem, Spawn
  types/                         Brawler, MapType (ICollidable), GameConfig, Scenario
  ui/                            MainMenu, toast, menu-styles.css
  main.ts                        entry + gameLoop (~1400 lines)
```

## Key conventions (violating these causes real bugs)

- **`ICollidable {x,y,w,h,update()}` — x/y is the TOP-LEFT of the hitbox, NOT the
  center.** This is the single most common source of placement math errors.
- **`buildings` = player/enemy collision; `solidBuildings` = bullet collision.** Two
  separate arrays. Passable props (not in `buildings`) get their own arrays + dedicated
  update loops.
- **`container.zIndex = y + offset`** for Y-sorted draw order. Floating objects (e.g.
  holograms) go on a separate always-on-top container.
- Per-feature texture caches. Brawler render paths are isolated from enemy render paths.
- **Three-layer model:** GameConfig (immutable input) -> GameSession (runtime state) ->
  frame transients in `main.ts`. Respect the direction of data flow.
- **Industrial props pattern** (SludgeReactor / AntiGravScrap / HoloTurbine):
  `update(...bullets?)` with an early-return when no bullets, to prevent double-update
  (they are hit by both `buildings.forEach` and a dedicated loop).
- All PIXI.Graphics members must be initialized in the FIRST constructor block; `drawX`
  render methods run only afterward. TypeScript will NOT catch a typed-but-uninitialized
  Graphics as undefined at runtime.

## Gotchas / environment quirks

- **Static-baked art (drawn once in the constructor) does NOT refresh through Vite HMR.**
  Re-enter the map to see baked-art changes. Do not chase a "change not applying" bug
  that is actually just HMR skipping baked textures.
- `import type` resolves circular-dependency issues between services — prefer it.
- Dynamic `t(varName)` does not compile for i18n — only literal `t('key')` calls work.
  Adding a key means editing both `pl.ts` and `en.ts` (`en: typeof pl` is enforced).
- When rotating a container that has offset content, use `pivot.set()` + `position.set()`
  with the SAME offset, or the content "flaps" disconnected from the body.
- `?.()` silent-skip in TS masks broken callback wiring — when a chain silently does
  nothing, add `console.log` at each link to find the break.

## Versioning

Bugfix -> patch, new feature -> minor, new scenario/major -> major. Version string
lives in the `id="credits"` div: `Game version: vX.X.X`. Update it across all changed
files on a completed build.
