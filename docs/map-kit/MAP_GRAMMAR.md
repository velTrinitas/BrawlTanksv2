# MAP GRAMMAR — gramatyka mapy Brawl Tanks (K1.1, zweryfikowana na 5 mapach)

> Status: **K1.1** (re-audyt 2026-08-24, stan repo **v0.119.0** / commit 2fbdb80;
> pierwotnie K1 2026-08-07 @ v0.101.0). Zweryfikowane na pelnym kodzie 5 map:
> City, Desert, Tropics, Fortified Ruins, Arctic + wiring w `src/main.ts`.
> **Wynik re-audytu:** `src/maps/**` NIETKNIETE od K1 (0 commitow) — wszystkie
> kotwice map/propsow aktualne; dryf byl w main.ts (+382 linie, kotwice
> zaktualizowane ponizej) oraz w POKRYCIU: doszla warstwa 11 (transient world
> actors — moce F7b). Kazda nowa mapa MUSI dac sie opisac ta gramatyka;
> pominiecie warstwy jest dozwolone, ale SWIADOME (wpis w Kontrakcie Mapy).

---

## 1. Czym jest "mapa" w kodzie (4 luzno sprzezone czesci)

Nie istnieje klasa Map. Mapa = cztery elementy o sztywnych konwencjach:

1. **Tozsamosc/config** — `MapId` union + `MAP_CONFIGS` + `MENU_MAP_CARDS`
   (`src/types/MapType.ts:26-42, 113-158`). Nowa mapa = rozszerzenie unionu,
   obu rekordow i `getMapIdFromUrl`.
2. **Modul danych mapy** (`src/maps/XxxMap.ts` — "kotwica"): eksportuje
   `buildXxxTexture()` (bake gruntu) + stale tablice LAYOUT (pozycje/rozmiary/seedy,
   math-verified) + pozycje padow. Czyste dane, zero instancjacji.
   Nowsze kotwice (Arctic, Tropics) eksportuja tez zamrozona palete i swiatlo
   (`ARCTIC_PALETTE`, `ARCTIC_LIGHT`, `TROPICS_LIGHT`) — to standard dla nowych map.
3. **Klasy propsow** (`src/maps/<theme>/*.ts` + niszczalne w `src/entities/`):
   kazda implementuje `ICollidable {x,y,w,h,update(camX,camY,screenW,screenH)}`
   LUB eksponuje `getCollisionRects()/getCollisionRect()/getExtraCollidables()`;
   strefy dodaja `isPointInside(x,y)`; trafialne dodaja `update(..., bullets?)`
   z guardem anti-double-update.
4. **Wiring w `main.ts`** — jedyna czesc niedeklaratywna: galaz `startGame`
   (decl `main.ts:1228`; lancuch map **1335-1807**: city 1335 / desert 1466 /
   tropics 1575 / arctic 1691 / fortified 1743) instancjonuje propsy w kolejnosci
   grunt -> border -> landmarki -> strefy -> pady; niszczalne i propsy zalezne
   od efektow POWSTAJA PO utworzeniu `EffectsManager` (**1809**) — Crates
   **1920-1929**, IceCubes **1934-1943**, Yeti **1948-1972**. UWAGA v0.119:
   miedzy effects a niszczalnymi siedzi teraz caly blok `new PowerSystem`
   z callbackami swiata (**1829-1906** — patrz warstwa 11). Do tego dedykowane
   petle update w game loopie i czlonkostwo w agregacjach `spawnBlocked`/slow/
   stealth. **To jest szew, ktory MapKit zastapi manifestem (COMPOSER).**

Teardown: brak destroy mapy — `worldContainer.removeChildren()` + zerowanie
tablic modulu (`main.ts:1256-1330`). Cache tekstur PRZEZYWA restart meczu
(instancje gina, tekstury sa reuzywane) — patrz taksonomia cache w ART_TOKENS.
LUKA (v0.119): teardown zeruje ~40 tablic mapy, ale NIE zeruje `powerSystem`
(stara instancja umiera posrednio przez removeChildren; jawnego destroy brak) —
composer ma to objac lista teardownu.

---

## 2. Gramatyka — 10 warstw + pogoda + slot scenariusza

| # | Warstwa | Rola | Kolizja | City | Desert | Tropics | Fortified | Arctic |
|---|---------|------|---------|------|--------|---------|-----------|--------|
| 1 | **Border** | granica swiata + dekor | 4x AABB | CyberpunkBorder (STARA arch. 20+70+pylony) | SandstormBorder (WZORZEC 30+55) | TropicalBorder (kopia 30+55) | RuinsBorder (rdzen kolizji, wizual w bake gruntu) | ArcticBorder (kopia ~95% Sandstorm) |
| 2 | **Ground base + clutter** | tlo mapy (baked raz, 3000x3000) | passable | buildCityTexture + GroundClutter + Parking + DirtRoad-w-bake'u | buildDesertTexture | buildTropicsTexture + DirtRoad | buildFortifiedRuinsTexture + **BAKED DECOR LAYER** (60+ dekoracji w teksturze!) | buildArcticTexture (zorza/relikty/banki w bake'u) |
| 3 | **Landmark 2.5D parallax** | ikoniczna dominanta | buildings+solid | 24x CyberBuilding + 7x NeonBillboard | 3x Pyramid (apex) + Sphinx (layer-shift) | Windmill (hybryda: wieza solid, smigla zIndex 1200) | — (swiadome pominiecie; hangar to baza, nie landmark) | ArctowskiStation (body-offset + dynamiczne nogi) |
| 4 | **Solid buildings** | bryly blokujace | buildings+solid | SludgeReactor, AntiGravScrap x2, HoloTurbine x5, OldFactory, PoliceStation, AirTaxi(dual) | Rock 'large' x7+kat. | Barn, Henhouse x3, Cowshed, CountryHouse x3, Stable, Paddock(rails) | RuinBlock (wall/rock) x27, RuinsHangar | Igloo |
| 5 | **Passable/destructible fillers** | clutter/labirynt | wlasne tablice LUB solid (niszczalne) | Parking, AirTaxi(single), male dekory | Rock 'small' x35, Bridge, WaterLife | pola (Corn/Sugarcane/Lettuce/Pasture), **Crate x90** (`src/entities/Crate.ts`) | — | **IceCube x121** (`src/entities/IceCube.ts`) |
| 6 | **Strefy mechaniczne** | slow / stealth / woda / crush | zalezne od typu (sekcja 4) | SludgePool x2 (slow), NeonOasisStation x2 (stealth) | Quicksand x5 (slow), Oasis x4 (stealth), RiverNile (woda-rzeka) | Corn/Sugarcane (stealth), Lettuce (crush) | RuinsFosa (slow+most), RuinsLake x5 (woda), RuinsBush x3 (stealth) | IceHole x4 (woda punktowa) |
| 7 | **Pady** | medi + power | passable (trigger) | HoverRepairPad x3 + PowerHoverPad x2 (generic) | DesertHeartPad + DesertStormPad | CloverMediPad + StumpPowerPad | RuinsMediPad + RuinsPowerPad | generic (themed "w pozniejszej fazie") |
| 8 | **Ambient NPC / critters** | zycie + drop | passable | SkyTraffic (3 pojazdy), dron/hot-dog w NeonOasis | WaterLife (ryby/ptaki/trzciny) | Horse x3, kura/krowa/wrobel w budynkach | — | foki/morsy/ryby w IceHole |
| 9 | **Patrol NPC / boss strefowy** | ruch/zagrozenie/drop | zalezne | pursuit-event (policja) | Caravan (SILNIK ping-pong + drop) | PatrolTractor (INNY silnik: waypoint-loop), Pasture-tractor (boustrophedon one-shot) | — | PenguinColony x2 (Caravan 1:1 + drop), IglooYeti (boss z telegrafem) |
| P | **Pogoda** | klimat, NIE kara | passable | — | — | — | — | Blizzard (cykl idle 100-150s / peak 24s, zIndex 1e6) |
| 10 | **Nakladka scenariusza** | bazy/symetria CTF/MP | — | — | — | — | flagi/hangar/bariery wrogow (CtfSystem) | — |

Warstwy obowiazkowe: 1, 2, 7 (+ przynajmniej jeden element z 3/4 jako dominanta
i przynajmniej jedna strefa 6 albo filler 5 — mapa bez nich jest pusta).
Opcjonalne: 3 (Fortified nie ma), 5, 6 (poszczegolne typy), 8, 9, P, 10.

**UWAGA — warstwa 5 niszczalna zyje w `src/entities/`** (Crate, IceCube), nie w
`src/maps/` — bo wymaga `EffectsManager`/`AudioSys` (konstrukcja PO ich powstaniu,
`main.ts:1831-1854`) i duck-typingu `takeDamage` w Bullet/EnemyBullet.

---

## 3. Slownik kolizji (zweryfikowany w main.ts @ v0.119)

- `buildings: ICollidable[]` (`main.ts:367`) — kolizja RUCHU gracza+wrogow ORAZ
  generyczny per-frame pass `buildings.forEach(b => b.update(cam...))`
  (`main.ts:3100`) — to tedy landmarki dostaja kamere do parallaksy.
- `solidBuildings: ICollidable[]` (`main.ts:368`) — kolizja POCISKOW. Niszczalne
  (Crate/IceCube) sa TU (pocisk duck-type'uje `takeDamage`), a ich POWIEKSZONY
  hitbox gracza (PAD=8) idzie do `buildings` przez `getExtraCollidables()`.
- **Woda wariant A (jezioro/przerebel):** buildings TAK, solidBuildings NIE
  (czolg stoi, pocisk leci). KOREKTA K1.1: SPOSROD WOD w `spawnBlocked`
  zarejestrowane sa TYLKO `iceHoles` (`main.ts:578`; reszta wpisow to strefy
  slow/stealth :574-577); RiverNile i RuinsLake ida wylacznie
  sciezka buildings (spawn omija je przez findSafeSpawnPos vs buildings) —
  wiring IceHole `main.ts:1720-1726`, RuinsLake `main.ts:1768-1773`.
- **Woda wariant B (fosa):** czysta strefa slow 0.5x, passable, wzorzec Quicksand,
  z wycieciem mostu (`RuinsFosa`).
- **Strefy slow (0.5x):** quicksand/sludge/fosa -> `player.speedModifier`
  (`main.ts:2879`) + skan wrogow (`main.ts:2883-2897`).
- **Strefy stealth:** oasis/pola/neon/bushes -> `playerInAnyStealth`
  (`main.ts:2939`), timer 10s, `enemy.playerStealthed` (2942-2972); strzal lamie.
- **`spawnBlocked(x,y)`** (`main.ts:573-580` — line-exact) — KAZDA strefa
  nie-do-jazdy MUSI sie tu zarejestrowac (bug: "wrogowie na skalach/rzekach").
- **Bariery per-frakcja:** CTF `ctfEnemyBarriers` (enemy-only, NIE w buildings,
  `main.ts:1795-1799`) + PREKOMPUTOWANE `ctfEnemyBuildings` raz na mecz
  (`main.ts:2037-2039`, konsument 3396) — spread per-frame alokowal 40+ elementow
  co klatke => skoki GC (blizna F3). **UWAGA K1.1:** `ctfEnemyBuildings` bywa
  KOPIA (gdy sa bariery) albo ALIASEM `buildings` (gdy ich brak) — kazdy runtime
  writer (dzis: Mur, warstwa 11) MUSI testowac tozsamosc `!== buildings` przed
  push/splice, inaczej dubluje wpisy albo zostawia widmowe collidery.
- **Konwencja wspolrzednych:** ICollidable x/y = TOP-LEFT (zawsze). Strefy
  (Quicksand/SludgePool/IceHole/RuinsBush) uzywaja CENTER + isPointInside —
  dozwolone, bo nie sa ICollidable. Layouty w kotwicach bywaja center LUB
  top-left — KAZDY eksport layoutu musi to deklarowac w komentarzu
  (wzor: `ArcticMap.ts:377` "x/y = TOP-LEFT" vs `:506` "x/y = CENTER").

## 4. Sygnatury update (tabela dispatch — to bedzie schema manifestu kitu)

| Sygnatura | Kto | Uwagi |
|---|---|---|
| `update(camX, camY, viewW, viewH)` | wszystko w buildings.forEach | `viewW = hud.screenW / ZOOM` (`main.ts:2776-2778`), NIE surowe px ekranu |
| `update(cam..., bullets)` | propsy przemyslowe (dedykowana petla) | GUARD: `if (!bullets) return;` — patrz wzorzec ponizej |
| `update()` + `isPointInside(x,y)` | strefy | efekt aplikuje main.ts, nie props |
| `update(delta)` -> `{type,x,y} \| null` | patrole z dropem (Caravan/Penguin) | main.ts spawnuje gem/heart/magnet |
| `update(px, py, isMoving, hp, maxHp, time)` -> `{healed}` | medi pady | +100 HP aplikuje main.ts (petle padow `main.ts:3117-3137`) |
| `update(px, py, time)` -> `{activated, durationMs, multiplier}` | power pady | `player.applyTurboBoost(...)` |
| `update(delta, px, py)` / stan wlasny | bossy/NPC (Yeti, Horse) | early-return gdy hidden |

**Wzorzec anti-double-update (przemyslowy):** props jest w `buildings`
(pass parallaksy, BEZ bullets) ORAZ ma dedykowana petle (Z bullets). Pierwsza
linia update: `if (!bullets) return;` — inaczej animacja liczy sie 2x/klatke.
KONTRAKT: props z tym guardem MUSI miec dedykowana petle w main.ts —
"inaczej zamarznie" (`OldFactory.ts:170-177`). UWAGA: SludgeReactor to przodek
wzorca BEZ guardu (animuje przy kazdym wywolaniu) — do weryfikacji, czy nie
animuje 2x; NIE kopiowac wariantu reaktora.

## 5. Architektura zIndex (pasma — pelna mapa)

```
-100  grunt (baked sprite)
 -95  IceHole basen ("dziura W gruncie"), DirtRoad AO
 -86  AO/cienie budynkow farmy (osobny kontener)
 -50  baza Oasis, CyberpunkBorder, Effects.trackContainer (slady gasienic)
   4  male skaly (STALE, nie-Y-sort: czolg nigdy "pod kamykiem")
   5  Quicksand, RuinsFosa
  50  rzeka   52 ryby   55 flora   60 most  <- plaskie "walk-over" = STALE niskie pasma
  y+h + x*1e-4   Y-sort aktorow/propsow (kanon: CyberBuilding, ArctowskiStation)
 250  bordery (haze)
 400  wizuale mocy przy graczu (aura 285, plamka lasera 1611 — PowerSystem)  [K1.1]
 500  Effects.particleContainer   600 floating text
1100  traktor koszacy  1200 smigla wiatraka  1500 sniezki yeti
5000+ dachy/billboardy (pasmo roof — sciany <5000)   8000 hologram, SkyTraffic
99000+ dach NeonOasis   99999 particles pol
1_000_000  pasmo OVERLAY (nad calym swiatem Y-sort ~3100) — WSPOLDZIELONE [K1.1]:
           Blizzard 1e6 · cien nalotu 1e6 · kolumna lasera 1e6 · kaczka 1e6-1 ·
           paczki 1e6-2 · kula disco 1e6-3. UWAGA latent-bug: trzy wpisy na
           ROWNYM 1e6 bez tie-breaka x*1e-4 = niestabilny sort (Arktyka+Nalot/
           Laser w zamieci) — nowe wpisy MUSZA brac wolny sub-slot.
   9  pasmo DECALI GRUNTU mocy (krater nalotu 1346, cien kaczki 1751, cien
      paczki 1916, swiatla disco 1947; wzorzec BossBomb z=8) — miedzy -50 a 4,
      nieudokumentowane w K1  [K1.1]
9999 (Effects) freeze overlay; HUD = OSOBNY canvas DOM nad PIXI
```

Jedno zrodlo sortowania: `sortableChildren = false` + JEDEN manualny
`worldContainer.sortChildren()` na klatke (`main.ts:475, 3584`) — z auto-sortem
PIXI sortowal na klatkach nieparzystych, manual na parzystych => migotanie z-order.

## 6. Kamera / zoom (kontrakt dla parallaksy i cullingu)

- Desktop zoom 1.0; mobile default **0.6** (`?zoom=` clamp 0.4-1.0, `main.ts:177-185`).
- **KOREKTA K1.1 (stan faktyczny):** kod kamery (`main.ts:2780-2784`) ROBI `~~`
  w world-space, choc komentarz dwie linie wyzej twierdzi "FLOATEM (bez ~~)".
  Komentarz przeczy kodowi (nietkniete od v0.23.1). Lekcja D5 mowi, ze ~~ w
  world-space przy zoomie daje kroki 2,3,3px — do rozstrzygniecia POMIAREM na
  A54 przy sesji perf (NIE poprawiac na slowo; kamera jest playtest-sensitive).
- Landmarki licza offset SAME z `(camX, camY, viewW, viewH)`; nie ma centralnego
  helpera cullingu — kazdy props culluje sam (wzorzec latch v0.68.0 w polach Tropics).

## 6b. WARSTWA 11 — transient world actors (moce F7b; NOWA w K1.1)  [v0.102-0.119]

Moce Super stworzyly klase aktorow swiata NIEobjeta warstwami 1-10+P: powstaja
i gina W TRAKCIE meczu, na KAZDEJ mapie, poza manifestem mapy. Zrodlo:
`src/systems/PowerSystem.ts` (2182 l.) + blok callbackow `main.ts:1829-1906`.

**11a. Dynamiczne collidery (dzis JEDYNY: Mur/Builder).** Kontrakt (wzorzec
obowiazkowy dla kazdego przyszlego runtime-collidera):
- PowerSystem NIE dotyka tablic kolizji — jedyny szew = callback `wallSpawner`
  (`PowerSystem.ts:180`, wiring `main.ts:1871-1906`).
- Spawner WALIDUJE (kolizja z buildings / wrog <45px / gracz <42px) i zwraca
  `null` = segment pominiety, **budzet NIEzuzyty** (mur ciagly, nie dziurawy).
- Push TRIO: `buildings` + `solidBuildings` + `ctfEnemyBuildings` TYLKO gdy to
  osobna kopia (test tozsamosci `!== buildings`, `main.ts:1897` — load-bearing!).
- Spawner zwraca `remove()` (splice z tych samych tablic); wolane przy expiry
  **PRZED ukryciem wizualu** ("niewidzialna sciana = smiertelny grzech
  Czytelnosci", `PowerSystem.ts:1247`) oraz w `buildClear()`.
- **`clearCooldowns()` = lejek teardownu** (`PowerSystem.ts:379-397`, buildClear
  na :394 "collidery MUSZA wyjsc z tablic!") — wolany z tutorial-arm i
  resetPlayerStateForMatch (`main.ts:719, 764`).

**11b. Aktorzy bez kolizji, ale ingerujacy w swiat:**
- Wieza: wizual-only, strzela REALNYMI pociskami gracza (callback `acquireBullet`
  + `styleAsTowerTracer`) => kolizje pociskow za darmo.
- Czarna Dziura i Babcia-push MUTUJA `enemy.x/y` bezposrednio, BEZ testu
  buildings — wrog moze byc wciagniety w wode/skale. **BY DESIGN** (moc > mapa),
  ale nowa mapa z woda musi to wiedziec (wrog w wodzie != utopiony).
- Kaczka czyta granice swiata (`WORLD_W/H`, odbicia z marginesem) i leci NAD mapa.
- Disco WYLACZA `enemy.update()` na czas efektu (spin w miejscu, zero AI/kolizji).
- **Iniekcja sterowania** (5. tryb ruchu NPC, uzupelnia T6): `ghostTauntFor` /
  `grannyFearFor` zwracaja REUZYWANY punkt konsumowany raz w `main.ts:3413`
  jako target `enemy.update` — zero zmian w Enemy.
- `aoeExplode(x,y,r,dmg,quiet)` = generyczny kill-path AoE (`main.ts:1838-1870`);
  `quiet=true` (tick obrazen) NIE odpala fireballa/shake — tick != eksplozja.

**11c. Zasoby wspoldzielone z mapa (mapa musi je respektowac):**
- pasma zIndex: 9 (decale gruntu), 400 (przy graczu), 1e6−3…1e6 (overlay) —
  patrz drabina §5;
- `spawnBlocked` NIE obejmuje aktorow warstwy 11 (transienty go omijaja);
- kill-in-update: moce zabijaja wrogow WEWNATRZ powerSystem.update => petla
  wrogow MUSI miec head-guard `if (!enemy.active) splice+continue`
  (`main.ts:3397-3403`, crash-fix v0.112).

## 7. Checklist wypelnienia gramatyki dla NOWEJ mapy (gate Kontraktu)

- [ ] Kotwica `XxxMap.ts`: bake gruntu (seedowany mulberry32!) + eksport PALETY
      i LIGHT (wzor Arctic) + layouty z deklaracja konwencji center/top-left + seedy.
- [ ] Border: rdzen 4x AABB (outer 30 / COLLISION_INNER_EDGE 40, playable [40, W-40]);
      skin atmosfery opcjonalny (particles) albo wizual w bake'u gruntu (wzor Ruins).
- [ ] Kazda warstwa 1-10+P: wypelniona ALBO jawnie pominieta (z powodem).
- [ ] Kazdy props przypisany do: buildings? solidBuildings? wlasna tablica + petla?
      spawnBlocked? slow/stealth agregacja? — wiersz w tabeli dispatch.
- [ ] Niszczalne konstruowane PO effects/audio; propsy z guardem bullets maja
      dedykowana petle.
- [ ] Layouty math-verified AABB (skrypt w scratchpadzie, wynik w komentarzu).
- [ ] Warstwa pogody (jesli jest): zIndex w pasmie overlay z WOLNYM sub-slotem
      (1e6 juz wspoldzielone — patrz §5), particles-only, bramka czasowa.
- [ ] Slot scenariusza (10): pusty, chyba ze mapa jest pod CTF/MP.
- [ ] Warstwa 11 (K1.1): mapa deklaruje `transientPolicy` — czy toleruje
      dynamiczne collidery (Mur) i mutacje pozycji wrogow (Dziura/Babcia);
      strefy wody/przepasci opisuja zachowanie wroga wepchnietego do srodka.
