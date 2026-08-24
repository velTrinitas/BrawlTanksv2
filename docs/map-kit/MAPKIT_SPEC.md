# MAPKIT SPEC — specyfikacja klas bazowych (K1.1: SPEC, NIE implementacja)

> Status: **K1.1** (re-audyt 2026-08-24 vs v0.119.0; pierwotnie K1 2026-08-07
> @ v0.101.0). RE-AUDYT: `src/maps/**` nietkniete od K1 — WSZYSTKIE zrodla
> ekstrakcji ponizej zweryfikowane jako aktualne (line-exact lub +/-2). ZERO
> kodu w K1 — klasy powstana metoda **extract-when-used PODCZAS budowy Marsa**.
> Projekt manifestu K11 rozwiniety w OSOBNYM dokumencie: `MAPKIT_COMPOSER.md`.

## Zasada split engine/content (przypomnienie)

Do kitu idzie PLUMBING (bake pipeline, kolizje, culling, logika stref, patrol,
cooldowny, cache). Skin rysunkowy (funkcje drawX / bake-content) zostaje PER-MAPA.
Nie abstrahujemy sztuki — abstrahujemy infrastrukture.

---

## U1. `makeRng(seed)` — util (wszedzie)

```ts
function makeRng(seed: number): () => number  // mulberry32
```
- Zrodlo: `ArcticMap.ts:62-71` (identyczne kopie: FortifiedRuinsMap, IceHole,
  RuinsLake, RuinsBush, RuinBlock, IceCube).
- Zastepuje 5 flawor RNG w repo (mulberry32 / LCG-glibc / LCG-9301 / prime-hash /
  Math.random). Regula: wszystko baked/persistent = seeded mulberry32;
  `Math.random()` tylko dla ulotnego ambientu (iskry, jitter).
- NAPRAWIA przy okazji: bake gruntu Desert i Tropics uzywa dzis `Math.random()`
  = niedeterministyczna tekstura przy kazdym wejsciu.

## U2. `bakeSprite(draw, opts)` — util bake pipeline (T4)

```ts
interface BakeOpts { w: number; h: number; res?: 1|2|3|4; margin?: number;
                     cacheKey?: string | number; cache?: Map<any, PIXI.Texture>; }
function bakeSprite(draw: (c: CanvasRenderingContext2D, rng: () => number) => void,
                    opts: BakeOpts): PIXI.Sprite
```
- Zrodla ekstrakcji: `PenguinColony.ts` (RES 4 + PENGUIN_BOX), `IceHole.ts`
  (RES 3, zachowanie kolejnosci rng), `IceCube.ts` (Map<variant*10+stage>),
  `RuinsBush.ts`/`RuinBlock.ts` (Map<seed> anti-leak), `HoverRepairPad.ts`
  (warianty on/off + wspolny cien).
- Wymusza: kontrakt translate (canvas(m, m+rise) == local(0,0)), taksonomie
  cache (singleton vs Map<seed>), `imageSmoothingEnabled=false` przy skalowaniu
  wariantow, scale 1/RES na sprite.
- Regula decyzji: ukosy/luki = bake; osiowe prostokaty moga zostac Graphics;
  cienkie animowane kreski zostaja Graphics.
- **K1.1 — DRUGI punkt odniesienia: `src/rendering/Tier3Baker.ts`** (v0.112,
  samozwanczy potomek wzorca "pady/pingwiny"). Roznice vs spec bakeSprite:
  zwraca Texture (nie Sprite), BRAK RES (hero-art bake'owany 1:1 w finalnym
  rozmiarze), brak marginesu/kontraktu translate (per-draw), brak rng (art
  deterministyczny reczny), cache = TRZECI smak: `Map<string artKey, Texture>`
  na poziomie modulu, CELOWO nigdy nie niszczony; defensywne `Texture.WHITE`
  przy braku 2D contextu. GRADIENTY radial/linear masowo w bake'u (T4 to
  dopuszcza — platne raz). `bakeSoftShadow()` = zaimplementowany `blobShadow`
  z U3. Kit przy ekstrakcji U2 ma pogodzic oba warianty (RES opcjonalny,
  zwrot Sprite LUB Texture, 3 smaki cache w taksonomii).

## U3. `blobShadow(size, palette)` + `trapezoidAO(w, h, scale)` — utile (T2)

- Zrodla: elipsa — bake pingwina/Caravan/Horse; trapez — `BarnBuilding.ts:215-230`
  (kanon "Barn AO", kopiowany 4x recznie).
- Warianty: podwojny cien (kontakt+soft), czworokat dla bryl kubicznych (IceCube),
  cien odsprzezony dla lewitujacych (AntiGravScrap/SkyTraffic — parametr altitude).

## U4. `cullLatch(bounds, margin)` — util (T14)

```ts
class CullLatch { update(camX, camY, viewW, viewH): boolean /* visible */ }
```
- Zrodlo: `CornField.ts:279-293` (latch `_cullHidden`, toggle renderable tylko
  przy zmianie, margin 140).
- Parametr `simulationExempt` — obiekty niosace symulacje updatuja logike dalej
  (traktor kosi poza kadrem), ukrywaja tylko render.

## K1. `BakedBorder(palette, opts)` — warstwa 1

```ts
interface BorderOpts { atmosphere: 'particles' | 'none';  // 'none' = wizual w bake gruntu
                       particleTint?: [number, number]; }
class BakedBorder { getCollisionRects(): ICollidable[]; update(): void }
```
- **Korekta tezy destylatu:** "SandstormBorder = ArcticBorder" potwierdzone
  (~95% kopia), ALE RuinsBorder pokazuje, ze REUZYWALNY RDZEN to tylko
  matematyka kolizji: 4x AABB, outer 30 / COLLISION_INNER_EDGE 40, rects
  wystaja poza swiat, margines wizualny gracza ~10px (`40 + 20 - 50 = 10`,
  `SandstormBorder.ts:98`). Atmosfera (gradient 3-pass + 40 particles + ripples)
  to OPCJONALNY skin.
- Zrodla: `SandstormBorder.ts` (wzorzec), `ArcticBorder.ts` (kopia), 
  `RuinsBorder.ts` (wariant 'none' — zero kosztu), `TropicalBorder.ts`.
- Cyberpunk (20+70+pylony) = legacy, NIE ekstrahujemy.

## K2. `ParallaxLandmark(mode, hF)` — warstwa 3

```ts
type ParallaxMode = 'layer-shift' | 'body-offset' | 'apex-converge';
abstract class ParallaxLandmark implements ICollidable {
  // wspolny wzor: off = (propCenter - camCenter) * hF; zIndex = y + oy + h + x*1e-4
}
```
- **Domyslny tryb: `layer-shift`** (Sphinx — pre-narysowane warstwy, przesuwane
  pozycja, koszt A). `body-offset` (Station, hF 0.11 + dynamiczne nogi) i
  `apex-converge` (Pyramid, hF 0.25) placa pelnym redraw = slot C; wymagaja
  uzasadnienia w karcie budzetu.
- Kit ujednolica: wzor offsetu (Sphinx ma dzis odwrotny znak!), tie-break
  `x*1e-4` (brak w Desert), hitbox = wizual + padding ~100 (T2/L5), dual-coord
  (visualX/Y center dla parallaksy, x/y top-left dla kolizji — `Pyramid.ts:37-65`).
- Reguly satelickie: attachment replikuje wzor hosta (billboard); jeden hF na
  klaster; statyczne podpory ↔ plywajaca bryla przez dynamiczne nogi (Station)
  albo mini-parallax <=0.015 (NeonOasis).

## K3. `Zone(shape, effect)` — warstwa 6

```ts
type ZoneShape  = { kind: 'rect', x, y, w, h } | { kind: 'ellipse', cx, cy, rx, ry };
type ZoneEffect = 'slow' | 'stealth' | 'water' | 'crush';
class Zone { isPointInside(px, py): boolean; update(): void;
             onTankEnter?(x, y): void;  getCollisionRect?(): ICollidable /* tylko water */ }
```
- Domyslny ksztalt: RECT rowny wizualowi (kierunek ewolucji repo; elipsa gdy
  wizual jest elipsa). Efekt aplikuje main.ts/manifest, strefa tylko odpowiada
  na membership (wzorzec potwierdzony wszedzie).
- water: buildings TAK / solidBuildings NIE + rejestracja w spawnBlocked;
  wariant fosa = slow+cutout mostu (`RuinsFosa.ts:48, 82-91`).
- stealth: wysokie propsy jako band-sprite'y do Y-sortu (RuinsBush K-bands —
  ekstrahowac jako opcje `tallCover`).
- Zrodla: Quicksand/Oasis (elipsa), SludgePool/NeonOasis (rect + API zgodne
  z poprzednikami), RuinsFosa/RuinsBush, IceHole (woda punktowa + wildlife).

## K4. `PatrolPath(config)` — warstwy 8/9 (TYLKO silnik Caravan-class)

```ts
interface PatrolConfig { path: {x,y}[]; unitCount: number; speed: number;
  spacing: number; dropIntervalMs?: number;
  dropRates?: { gem: number; heart: number; magnet: number };  // PARAMETR
  buildUnitSprite: (i: number) => PIXI.Container; }             // skin per-mapa
class PatrolPath { update(delta): {type, x, y} | null }
```
- Zrodla: `Caravan.ts:400-425` + `PenguinColony.ts:145-165` (potwierdzone 1:1):
  segmenty prekomputowane, ping-pong `period = 2 * totalLength`, stagger przez
  ujemny progress, flip scale.x (nigdy rotacja), drop-eligibility `progress > 0`.
- **NIE pokrywa** PatrolTractor (waypoint-loop), Pasture (boustrophedon),
  Horse (wander FSM). Dla nich osobny prymityw:

## K5. `SeekTarget` — prymityw ruchu FSM (warstwy 8/9)

```ts
function walkToward(pos, target, speed): void  // + lerpHeading 6-8%/frame z wrap
```
- Zrodla: `PatrolTractor.ts` (arrival 4px, pauzy, modulo-loop),
  `Horse.ts` (stany, wander cap 8s).
- Wbudowane lekcje: pre-flip facing przy WYBORZE celu, histereza 5px, gwarancja
  min X-delta celu (moonwalk v0.41.9).

## K6. `IndustrialProp` — szablon warstwy 4 (wzorzec pod Fabryke/Zlomowisko)

Ekstrakcja: SludgeReactor (przodek), **AntiGravScrap (kanon guardu)**,
HoloTurbine (dual hitbox + ADD budzet), OldFactory (skala landmark).

1. Kontrakt: ICollidable top-left, buildings+solidBuildings, niezniszczalny,
   `container.zIndex = y + h`.
2. **Guard obowiazkowy:** `update(cam..., bullets?)`; pierwsza linia
   `if (!bullets) return;` + DEDYKOWANA petla w main.ts ("inaczej zamarznie").
3. Stos warstw: cien baked -> bryla baked (gradient 3-pasmowy L->R, bolty
   3-way, rdza) -> animowane sub-gfx (maly redraw) -> opcjonalny ADD glow
   (baked bialy, recolor przez .tint) -> particles zIndex 100-250 -> Text 300.
4. Sloty sub-animacji (2-4): rotor/fan (animTime*k, echa-duchy), bulgotanie
   (2 warstwy + pop-ring z flaga edge), rdzen emisji (flash przy zdarzeniu),
   flicker okien/neonow, venty/dust (cooldown z jitterem).
5. Maszyna stanow: IDLE -> EXCITED (`setPlayerNear`, dist^2 < 200^2) -> HIT
   (shake+flash+iskry, timer ~30 klatek) -> CRITICAL (latch raz, `onCritical()`).
6. Pociski: AABB + `WeakSet<Bullet>` (anty multi-trigger w tym samym ticku);
   opcjonalny drugi WIRTUALNY hitbox nie-solid (hologram) z fizyczna kotwica reakcji.
7. Przepisy particles: vy+=g, vx*=friction, size rosnie z lifeT, alpha=1-lifeT,
   rampy kolorow hot->cool.

## K7. `DestructibleFiller` — warstwa 5 niszczalna

Ekstrakcja: `IceCube.ts` (nowoczesny) + `Crate.ts` (wzorzec mechaniki).
- Warianty x stany obrazen = wspoldzielone baked tekstury (Map<variant*10+stage>),
  trafienie = SWAP tekstury (geometria per wariant identyczna miedzy stanami).
- Podwojny hitbox: pocisk = wizual 1:1 (solidBuildings), gracz = +PAD 8
  (`getExtraCollidables()` -> buildings; dynamiczne gettery zeruja po zniszczeniu).
- takeDamage duck-typed przez Bullet/EnemyBullet; shatter = efekt + onShatter
  callback (drop w main.ts, np. ~28% gem); respawn 60s.
- Konstrukcja PO effects/audio (kontrakt wiringu).

## K8. `PathFeature` — archetyp rzeki (ODREBNY od Zone — teza destylatu rozstrzygnieta)

```ts
interface PathFeatureConfig { path: {x,y}[]; width: number;
  paletteStops: [t: number, color: string][];  crossings?: number;
  collisionStep?: number;  /* 40 */  hitboxPad?: number; /* width+60 */ }
```
- Zrodlo: `RiverNile.ts`. Rzeka to NIE parametr strefy: (1) polilinia-spina
  z arc-length `getPointAt/getTangentAt`, (2) render "gradient tube" = N przejsc
  stroke o malejacej szerokosci po 11 stopach palety (`RIVER_PALETTE_STOPS`
  :22-33), (3) kolizja = LANCUCH AABB probkowany co 40px (buildings only),
  (4) mosty z tangentow spiny + dziury dystansowe (`clearance = deckLength/2
  + 80` — komentarz :253, formula :257),
  (5) zycie satelickie (WaterLife) reuzywa spine (dzis DUPLIKUJE kod — kit
  ekstrahuje `PathSpine` util).
- IceHole/RuinsLake to Zone(water) — punktowe; fosa to Zone(slow) prostokatna.

## K9. `PadKit` — warstwa 7

- Kontrakt mechaniki (JUZ jednolity w repo, `main.ts:282-283, 2988-3007`):
  medi `{healed}` (stoj 2250ms, cooldown 60s, +100HP w main.ts);
  power `{activated, durationMs 5000, multiplier 2.0}` (instant, cooldown 20s).
- Render wg WZORCA RUINS (nie Desert!): baked plyta on/off + wspolny cien
  + baked glow NORMAL-alpha; stan przez tint/visible; particles tylko active.
- Aktywacja — **KOREKTA K1.1 (stan faktyczny):** AABB 100x100 + pad 8 ma TYLKO
  CloverMediPad (1-z-8!); pozostale 7 padow (Ruins/Hover/PowerHover/Desert/Stump)
  uzywa RADIALNEGO checku r=50-60. Lekcja Clover v0.38.2 nigdy nie zostala
  spropagowana. **Decyzja kitu:** AABB pelnego footprintu + pad 8 = kontrakt
  DOCELOWY (hitbox == wizual, B5); radial = legacy do migracji przy dotknieciu.
- Ikonografia: ikona = jezyk pickupa, ale 1 symbol = 1 mechanika (gear vs heart).
- Zrodla: `RuinsMediPad.ts`/`RuinsPowerPad.ts` (architektura), `HoverRepairPad.ts`
  (warianty on/off + wspolny cien), lekcje z padow Desert/Tropics.

## K10. `GradientTexCache` — util (proto-kit JUZ ISTNIEJE)

- Zrodlo: `FarmBuildingTextures.ts` — modulowy cache 1px gradientow
  (`getVerticalGradientTexture`, `fillGradientPolygon`, klucz "v-top-bot-h").
  Powstal v0.31.0 przeciw memory-leak; ADOPCJA NIEKOMPLETNA (Barn ma prywatny
  duplikat 1:1). Kit generalizuje i wymusza adopcje w nowych propsach.

## K11. Manifest mapy (zastepuje galaz w main.ts — najwiekszy zysk kitu)

Deklaratywny opis tego, co dzis jest recznym wiringiem (`main.ts:1323-1795`
+ petle + agregacje):
```ts
interface MapManifest {
  id: MapId;  bakeGround: () => PIXI.Texture;  palette: object;  light: object;
  border: BorderSpec;
  props: Array<{ factory: (...) => Prop;
    arrays: ('buildings'|'solidBuildings'|'own')[];
    loop: 'forEach' | 'dedicated-bullets' | 'dedicated-delta' | 'zone' | 'pad';
    spawnBlocked?: boolean;  slow?: boolean;  stealth?: boolean;
    afterEffects?: boolean;  /* niszczalne/FX-zalezne */ }>;
  weather?: WeatherSpec;  scenarioSlot?: unknown;  // pusty do MP MVP
}
```
Tabela dispatch z MAP_GRAMMAR sekcja 4 = schema tego manifestu.
**K1.5:** pelny projekt interfejsu manifestu + composeMap + plan wpiecia =
`MAPKIT_COMPOSER.md` (interfejs ZAMROZONY przed Marsem; implementacja dalej
extract-when-used na koncu Marsa). Manifest rozszerzony o warstwe 11
(transientPolicy), deklaracje pasm zIndex (zBands) i karte budzetu.

---

## Kolejnosc ekstrakcji podczas Marsa (extract-when-used)

1. U1 makeRng + U2 bakeSprite (potrzebne od pierwszego propsa).
2. K1 BakedBorder (pierwszy widoczny element mapy).
3. U3 cienie + K3 Zone (pierwsze strefy).
4. K2 ParallaxLandmark (landmark Marsa — start od layer-shift).
5. K4/K5 wg mechaniki-gwiazdy (UFO-Porywacz = prawdopodobnie SeekTarget).
6. K6/K7/K8/K9/K10 gdy Mars ich zazada; K11 manifest NA KONCU Marsa
   (gdy widac pelna liste przypadkow), wpiecie od mapy nr 2.

Kazda klasa przy ekstrakcji przechodzi checkliste LESSONS_LEARNED.
