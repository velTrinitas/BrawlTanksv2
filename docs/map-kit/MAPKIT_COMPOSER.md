# MAPKIT COMPOSER — projekt manifestu i composeMap() (K1.5)

> Status: **PROJEKT ZAMROZONY K1.5** (2026-08-24, vs v0.119.0). To jest K11
> ze SPEC potraktowane na serio: pelny interfejs manifestu + funkcja skladajaca.
> **Timing bez zmian (extract-when-used):** implementacja powstaje NA KONCU fazy
> Marsa, ale INTERFEJS zamrazamy teraz — Kontrakt Marsa (`MARS_CONTRACT.md`)
> wypelnia juz ten manifest, wiec Mars jest pierwsza mapa budowana "pod composer".
> Zrodla: MAP_GRAMMAR §2-§7 (K1.1), MAPKIT_SPEC K1-K11, MOBILE_COST_MODEL §3/§3b,
> LESSONS_LEARNED (gate).

---

## 1. Problem, ktory composer rozwiazuje

Dzis "mapa" to galaz w `startGame` (`main.ts:1335-1807`): ~470 linii recznego
wiringu per mapa — konstrukcja propsow, push do wlasciwych tablic, rejestracje
w agregacjach, kolejnosc wzgledem effects/audio, teardown. Kazdy z tych krokow
ma udokumentowana blizne w LESSONS (I2 props-bez-petli zamarza, I3 niszczalne
przed effects = crash, B8 brak spawnBlocked = wrogowie na skalach, B13 alias
ctfEnemyBuildings). Composer zamienia recznie utrzymywana kolejnosc na DANE
(manifest) + JEDNA funkcje egzekwujaca kolejnosc i agregacje.

## 2. Interfejs manifestu (ZAMROZONY)

```ts
// src/maps/kit/manifest.ts (powstanie przy ekstrakcji; typ zamrozony w K1.5)

/** Jak props jest wpiety w game loop — 1:1 wiersze tabeli dispatch (GRAMMAR §4). */
export type LoopKind =
  | 'buildings-pass'   // update(camX,camY,viewW,viewH) przez buildings.forEach
  | 'industrial'       // update(cam...,bullets) + guard `if(!bullets)return` + DEDYKOWANA petla
  | 'zone'             // update() + isPointInside(x,y); efekt aplikuje main.ts
  | 'patrol-drop'      // update(delta) -> {type,x,y}|null; main spawnuje pickup
  | 'medi-pad'         // update(px,py,isMoving,hp,maxHp,time) -> {healed}
  | 'power-pad'        // update(px,py,time) -> {activated,durationMs,multiplier}
  | 'npc';             // update(delta,px,py) / stan wlasny; early-return gdy hidden

/** Czlonkostwo kolizyjne — GRAMMAR §3. Kazdy props deklaruje JAWNIE. */
export interface CollisionMembership {
  buildings: boolean;        // kolizja ruchu + generyczny pass parallaksy
  solidBuildings: boolean;   // kolizja pociskow
  spawnBlocked: boolean;     // rejestracja strefy nie-do-jazdy (B8!)
  slowZone: boolean;         // agregacja slow 0.5x
  stealthZone: boolean;      // agregacja stealth
}

/** Jeden wpis manifestu = jeden props/system mapy. */
export interface ManifestEntry {
  id: string;                          // np. 'riverNile', 'crates'
  layer: 1|2|3|4|5|6|7|8|9|10|11|'P'; // warstwa gramatyki (GRAMMAR §2)
  make: (ctx: ComposeCtx) => unknown;  // fabryka; ctx daje rng/effects/audio/world
  loop: LoopKind;
  collision: CollisionMembership;
  needsEffects: boolean;   // true => konstrukcja DOPIERO w fazie post-effects (I3)
  zBand?: number;          // deklarowane pasmo, jesli poza Y-sortem (GRAMMAR §5)
  teardown?: 'destroy' | 'none';  // co robi composeMap przy koncu meczu
}

/** Polityka warstwy 11 — GRAMMAR §6b (co mapa toleruje od mocy). */
export interface TransientPolicy {
  dynamicColliders: boolean;      // Mur moze stawiac segmenty? (false = allowedPowers bez Mura)
  enemyPositionMutation: boolean; // Dziura/Babcia moga wepchnac wroga w strefy?
  waterPushBehavior?: 'none' | 'visual-splash' | 'note';  // co sie dzieje z wrogiem w wodzie
}

export interface MapManifest {
  id: MapType;
  worldW: number; worldH: number;          // 3000x3000 standard
  palette: Record<string, number>;          // eksport PALETY + LIGHT (wzor Arctic)
  groundBake: (rng: Rng) => PIXI.Texture;   // warstwa 2, seedowany mulberry32 (U1)
  border: BorderSpec;                       // warstwa 1: outer 30 / inner edge 40
  entries: ManifestEntry[];                 // warstwy 3-9 + P
  scenarioSlot?: 'ctf' | null;              // warstwa 10
  transientPolicy: TransientPolicy;         // warstwa 11 (NOWE w K1.5)
  zBands: { overlaySubSlot?: number };      // zajety sub-slot pasma 1e6 (T15/A15)
  budgetCard: BudgetCard;                   // karta S/A/B/C z COST_MODEL §3+§3b — W MANIFESCIE
}
```

Zasada: **manifest jest kompletny albo mapa nie istnieje.** Kazde pole, ktore
dzis jest "wiedza plemienna w main.ts", jest tu wymuszone typem: czlonkostwo
kolizji (I2/B8), needsEffects (I3), zBand (A15), transientPolicy (6b),
budgetCard (mobile-first: budzet liczony PRZED implementacja).

## 3. composeMap(manifest) — kolejnosc ZAMROZONA

```
composeMap(manifest, ctx):
  1. grunt        groundBake(rng) -> sprite tla (bake raz, C2/C3)
  2. border       4x AABB + skin (GRAMMAR §7)
  3. entries      wszystkie z needsEffects=false, w kolejnosci warstw 3->9:
                    make() -> push wg collision.* -> rejestr wg loop
  4. [zewnatrz]   main.ts tworzy effects + audio (bez zmian — poza composerem)
  5. entries-post wszystkie z needsEffects=true (niszczalne, FX-zalezne) — I3
  6. agregacje    zbuduj spawnBlocked / slowZones / stealthZones z deklaracji
                  collision.* (JEDNO zrodlo prawdy, koniec recznych rejestrow)
  7. dispatch     zwroc RunLoops: pogrupowane listy per LoopKind — game loop
                  iteruje grupy zamiast recznych petli per-props (I2)
  8. teardown     zwroc liste teardown (destroy + clearCooldowns powerSystemu —
                  luka z GRAMMAR §1.4: dzis powerSystem nie jest nullowany)
```

Kontrakty egzekwowane W composerze (nie w glowach):
- props `loop:'industrial'` bez wpisu w grupie dispatch = **blad w konsoli**
  przy starcie (koniec cichego "zamarzniecia", I2/D6);
- `collision.spawnBlocked` generuje wpis automatycznie (koniec bugu B8);
- push do `ctfEnemyBuildings` zawsze przez helper z testem tozsamosci (B13);
- entry z `zBand` w pasmie 1e6 MUSI podac `zBands.overlaySubSlot` wolny
  wzgledem tabeli lokatorow T15.

## 4. Plan wpiecia (rollout)

1. **Mars = pierwsza mapa composera.** Kontrakt Marsa wypelnia MapManifest;
   implementacja composera powstaje na koncu fazy Marsa z realnych potrzeb
   (extract-when-used — zero speculative generality). Mars NIE dostaje galezi
   w startGame.
2. **Migracja legacy po jednej mapie**, zaczynajac od **Fortified Ruins**
   (najprostsza: brak landmarku, brak NPC patrolu, dekor w bake'u) — kazda
   migracja = osobny commit + pelny playtest (regresja wiringu jest cicha).
3. City migruje OSTATNIE (najwiecej legacy: stara architektura bordera,
   pursuit-event, SkyTraffic).
4. Galaz startGame znika dopiero, gdy 5/5 map przejdzie przez composeMap.

## 5. Poza zakresem composera (swiadomie)

- Effects/AudioSys/HUD — pozostaja w main.ts (composer dostaje je w ctx).
- PowerSystem — warstwa 11 jest map-independent; composer tylko DEKLARUJE
  polityke (transientPolicy) i konsumuje teardown.
- Scenariusze (CtfSystem) — slot 10 jest wskaznikiem, nie implementacja.
