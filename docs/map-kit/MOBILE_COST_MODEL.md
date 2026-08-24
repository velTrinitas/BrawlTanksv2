# MOBILE COST MODEL — klasy S/A/B/C skalibrowane na 5 mapach (K1.1)

> Status: **K1.1** (re-audyt 2026-08-24 vs v0.119.0; pierwotnie K1 @ v0.101.0).
> Re-audyt: wszystkie klasy §2 i 12/12 grzechow §4 AKTUALNE (src/maps nietkniete;
> nic nie naprawiono). NOWE: §3b warstwa mocy (map-independent overhead).
> Klasyfikacja z REALNEGO kodu update() kazdego propsa (nie z pamieci).
> Baseline: Samsung A54, zoom 0.6, antialias OFF, fill-rate > liczba obiektow.
> Zrodlo prawdy o realnym FPS = playtest — model sluzy do PROJEKTOWANIA budzetu.

## 1. Definicje klas (doprecyzowane po audycie)

| Klasa | Definicja | Sygnal w kodzie |
|---|---|---|
| **S** | statyczny/baked, per-frame ~0 | update no-op / brak update / idle early-return aktywny |
| **A** | baked wizual + petla transformow (+drobne particle) | tylko zapisy .x/.rotation/.skew/.alpha/.tint, zero clear() |
| **B** | maly per-frame redraw Graphics (ograniczony obszar) LUB ciezsza petla transformow (~100+ zapisow) | clear()+redraw malej geometrii; brak duzych powierzchni alpha |
| **C** | drogi per-frame: pelny redraw wektorowy bryly, duze obszary alpha/ADD, masowe zywe Graphics | pelny drawX co klatke; area-wash; setki obiektow Graphics |

Elementy "gated" (bramka czasowa/warunkowa) liczymy wg stanu DOMINUJACEGO
z adnotacja peak: Blizzard = S(idle)/B(peak), Yeti = S(hidden)/B(active).

## 2. Klasyfikacja pelna (per mapa)

### Arctic (najnowsza — KALIBRACJA SUFITU; realnie chodzi na A54)
| Props | Klasa | Dowod |
|---|---|---|
| tafla (bake 3000x3000) | S | bake raz, ~26-32ms na starcie |
| IceCube x121 | S/A | update = tylko tick respawnu; trafienie = swap tekstury |
| Igloo | S | update no-op |
| ArcticBorder | B | 40 sprite'ow + 16 kresek redraw/frame, bez cullingu |
| IceHole x4 | B-light | 1 maly gfx redraw + transformy fok |
| PenguinColony x2 | A | czyste transformy baked sprite'ow |
| Blizzard | S idle / B peak | early-return hidden; peak 130 platkow + 9 smug |
| IglooYeti | S hidden / B active | visible=false + pusty loop gdy hidden |
| ArctowskiStation | **C** | pelny redraw wektorowy ~150 prymitywow/frame |
| pady generic x5 | A | baked plyty on/off, transformy |
**Bilans: 1xC + ~3xB (+2xB za bramka) — potwierdza sufit "2xC (z bramka), 5-6xB".**
Uwaga: destylat mowil "kostki x41" — w kodzie sa **122** wpisy layoutu (K1.1;
komentarz `ArcticMap.ts:374` "41 kostek" nadal stale-owy); nie zmienia klasy (S/A).

### Fortified Ruins (najtansza mapa w repo — wzor generacji)
| Props | Klasa | Dowod |
|---|---|---|
| grunt + BAKED DECOR (60+ dekoracji) | S | wszystko w teksturze |
| RuinsBorder | **S** | zero per-frame ("interfejs spojny, brak animacji — fill-rate") |
| RuinBlock x27 | S | statyczne; rock baked per-seed cache |
| RuinsLake x5 | B-light | 2 ringi + 6 glintow/frame |
| RuinsFosa | B-light | rim puls + 24 kreski, pas ograniczony |
| RuinsBush x3 | S/A | K band-sprite'ow, skew only |
| RuinsHangar | S + B-light beacon | bake singleton; beacon 1-3 cienkie okregi |
| pady Ruins x4 | S cooldown / B-light active | stan przez tint/visible, NIE redraw |
**Bilans: 0xC, ~3xB-light. Mozna byc mapa "ponizej budzetu".**

### Tropics (mieszana generacja)
| Props | Klasa | Dowod |
|---|---|---|
| Corn/Sugarcane/Lettuce | A | baked sprite stamping + skew + CULLING LATCH (zloty wzorzec) |
| PastureField | **C** | ~600 zywych Graphics zdziebel + append-only mowedTrack + churn dymu |
| Barn/Henhouse/CountryHouse/Windmill | A | transformy (Barn: +1 malenki redraw liny) |
| Cowshed | B | 3 male redrawy/frame (ripples/hay) + 8 systemow animacji |
| Stable | B | 4 BEZWARUNKOWE clear()+redraw co klatke |
| Paddock | A-light | 4 sparkle transformy |
| DirtRoad | S | konstruktor-only |
| Crate x90 | S | statyczne po narysowaniu; tick respawnu |
| PatrolTractor | A/B | transformy + churn dymu bez pool/cull |
| Horse x3 | B | redraw ogona co klatke per kon |
| TropicalBorder | B | jak Sandstorm |
| CloverMediPad / StumpPowerPad | B | drawVisuals co klatke + Text churn / capped sparks |
**Bilans: 1xC (Pasture — do naprawy kiedys) + ~6xB. Na granicy budzetu.**

### Desert (stara generacja — bez bake'u propsow, bez cullingu)
| Props | Klasa | Dowod |
|---|---|---|
| Pyramid x3 | B (kazda) | ~50 draw ops redraw/frame/sztuka, bez cullingu |
| Sphinx | A | layer-shift: transformy + male oczy-redraw |
| RiverNile | B/C | statyczna baza + ADD flow + do 25 mist sprite'ow + reflexy/ripples |
| WaterLife | B | ~130 rotacji trzcin + 6 ryb i 3 ptaki redraw |
| Rock (large/small) | S | update no-op |
| Bridge x8 | S | brak update |
| Quicksand x5 | B-light | rim/swirl/bubbles male redrawy |
| Oasis x4 | A/B-light | statyczne + 2 ringi ripples |
| Caravan | A | czyste transformy (wzorcowy NPC) |
| SandstormBorder | B | 40 sprite'ow + 16 kresek, 4 krawedzie zawsze |
| DesertHeartPad/StormPad | B | PELNY redraw plyty co klatke + 260px ADD glow |
**Bilans: ~7-8xB + 1 na granicy C (rzeka). Ponad budzet — dziala, bo mapa
powstala przed modelem; NIE wzorowac sie.**

### City (najstarsza i najciezsza — "grandfathered")
| Props | Klasa | Dowod |
|---|---|---|
| 24x CyberBuilding | ~C zbiorczo | maly redraw x24 co klatke (system parallaksy = 1 slot C) |
| NeonBillboard x7 | A | transformy/alpha; rebuild tekstu raz na 8s |
| SludgeReactor | B/C | pelny redraw sludge+glass co klatke, BEZ guardu bullets (podejrzenie 2x anim — zweryfikowac) |
| AntiGravScrap x2 | A | baked + probabilistyczne luki |
| HoloTurbine x5 | B (x5!) | 24 poly smigiel + hologram + 3 warstwy ADD, co klatke |
| OldFactory | B/C | najwiekszy staly animator: pasy okien + neon + 24 poly fanow + dym + 2xADD |
| PoliceStation/AirTaxi | A | male transformy |
| SkyTraffic | A | 3 pojazdy, transformy + cien |
| NeonOasisStation x2 | B/C | mgla ADD ~14-30 kol/frame + kurtyny + Tier3 |
| SludgePool x2 | B | ~5 sciezek 48-pkt/frame |
| Parking x2 / GroundClutter | A / S-A | diody / 1-3 kolka pary |
| CyberpunkBorder | B | redraw pylonow co klatke, caly obwod |
**Bilans: ~3 sloty C-owate + ~8xB. Najciezsza mapa w repo; to tu perf bolal
najbardziej. Sluzy jako ostrzezenie, nie wzor.**

## 3. Budzet dla NOWEJ mapy (karta-wzor)

Kalibracja: Arctic (dziala na A54) = 1xC staly + 2x "C za bramka" + ~5xB.
Fortified pokazuje, ze da sie zejsc do 0xC. City/Desert pokazuja, gdzie boli.

**Budzet nowej mapy (twardy):**
- **C: max 2, w tym max 1 STALY** (drugi tylko za bramka czasowa/warunkowa,
  wzor Blizzard/Yeti). Kazdy C ma wpisany tanszy wariant awaryjny.
- **B: 5-6** (border liczy sie jako 1xB, jesli animowany; wybierz border S jak
  Ruins = odzyskujesz slot).
- **A/S: bez limitu**, ale kazdy nowy A z particle-churn dostaje pool albo cap.
- Kazdy props animowany: culling latch (T14) LUB uzasadnienie na pismie
  ("niesie symulacje" / "zawsze w kadrze").
- Pady: stan przez tint/visible (wzor Ruins), NIGDY pelny redraw (anty-wzor Desert).
- ADD: budzet 1 hero-props na mape + swiatla punktowe; zero area-wash.
- Particles: twarde capy (Effects MAX_PARTICLES=200, round-robin — nie podnosic
  bez pomiaru; blizna: 525 particles = 17 FPS).

## 3b. WARSTWA MOCY — staly narzut niezalezny od mapy (K1.1; PowerSystem F7b)

18 mocy renderuje sie NA KAZDEJ mapie, PONAD jej budzetem. Klasyfikacja
(`src/systems/PowerSystem.ts`, dispatch :499-513 — 14 sub-updateow, kazdy
z early-return idle => koszt spoczynkowy ~14 porownan/klatke, wzorzec D7):

| Efekt mocy | Klasa | Uwagi |
|---|---|---|
| Aura/kanal gracza | B-light | 1 gfx maly redraw (:537-561), jeden naraz |
| **Pong shield** | **B** | pelny ring + 6 kontr-lukow + 3 paletki + wiazki REDRAW/frame (:1626-1682), 5s gated |
| Wieza MG | A | draw-once + transformy; dust pooled |
| Salwa / Miny / Mur | A | POOLED wizuale (acquire-pattern :823/:1074/:1180), transformy |
| Nalot | A/B | do 5 maszyn + 8 bomb, destroy na koncu |
| Czarna Dziura | A | 4 pre-drawn gfx, tylko rotacje |
| **Laser** | A + **fill-rate** | kolumna 26x560 alpha na zIndex 1e6 — najwiekszy pojedynczy obszar |
| Kaczka/Paczkomat/Disco/Babcia | A | sprite'y Tier3Baker, transformy |
| Mur — collider churn | — | do 20x push/splice buildings+solid+ctf per aktywacja |

**Wniosek do karty budzetu:** worst-case = mapa u sufitu (Arctic: 1xC+2xC-gated+
5xB) + Pong (B) + Laser (fill-rate) JEST POZA pierwotna kalibracja. Nowa mapa
projektowana "pod sufit" musi zostawic 1 slot B wolny na warstwe mocy.

**Karta budzetu do Kontraktu Mapy (wypelnic PRZED implementacja):**
```
Mapa: ________   Swiat: 3000x3000   Zoom mobile: 0.6
C staly:   [0-1]  co? ______________  wariant awaryjny: ______________
C gated:   [0-1]  co? ______________  bramka: ______________
B:         [max 6] lista: ____________________________________________
Border:    S (bake w gruncie) / B (particles)  <- wybor swiadomy
ADD hero:  ______________   Particles nowe: cap = ____
Culling:   ktore propsy maja latch: ___________________________________
Warstwa mocy (K1.1): rezerwa 1 slot B (Pong/Laser nad mapa) — uwzgledniona? [ ]
```

## 4. Lista "grzechow fill-rate/perf" (NIE naprawiac w K1 — udokumentowane do pozniejszej naprawy)

Priorytet wg zysku:
1. **PastureField**: ~600 zywych Graphics zdziebel -> bake do tuft-tekstur jak
   corn; `mowedTrackGfx` append-only (re-tesselacja rosnie bez konca); dym bez poolingu.
2. **City bez cullingu**: OldFactory / SludgeReactor / NeonOasis fog animuja
   poza kadrem — trzy najwieksze wygrane po dodaniu latcha.
3. **SludgeReactor bez guardu bullets** — podejrzenie podwojnego update animacji
   (buildings.forEach + dedykowana petla); zweryfikowac i dodac guard jak w
   AntiGravScrap. Plus drift komentarz/kod halo center (`H*1` vs dokumentowane 0.42).
4. **Pady Desert**: pelny redraw plyty co klatke + 2x 260px ADD glow — przepisac
   na wzorzec Ruins (baked + tint/visible).
5. **RiverNile**: ADD flow na dlugiej diagonali + do 25 mist sprite'ow bez cappingu
   jakosciowego — dodac prog jakosci (mniej mist na slabym sprzecie).
6. **Bordery animowane** (Sandstorm/Tropical/Arctic/Cyberpunk): update wszystkich
   4 krawedzi niezaleznie od kamery; pylony City redraw co klatke.
7. **Stable**: 4 bezwarunkowe clear()+redraw co klatke (plomien/okna/siano/vane)
   -> zamienic na transformy/tint; usunac `(this as any)` przemyt stanu.
8. **Horse**: redraw ogona co klatke x3 konie -> baked klatki albo skew.
9. **CloverMediPad**: PIXI.Text cooldown churn co sekunde + drawVisuals co klatke.
10. **Lettuce**: sprite'y splatow wylaczone z cull-toggle (drobne).
11. **Oasis**: `rippleTime += 1/60` (frame-rate dependent — jedyny taki timer;
    na 120Hz plynie 2x szybciej).
12. Drobne: martwe pola/przemyt `as any` (Stable/Pasture/Horse), duplikaty
    helperow dachow (4 kopie), Barn nie uzywa FarmBuildingTextures.

## 5. Zasady fill-rate (bez zmian, potwierdzone w kodzie)

Zakaz god-rays (wyciete raz — "pral do bieli"), duzych glow, screen-blend,
wielkich gradientow per-frame. Preferuj pre-render/culling/pooling. Glow =
normal-alpha. Drogi efekt za bramka czasowa (Blizzard: hidden + return-early) = OK.
