# ART TOKENS — wspolny jezyk wizualny map (K1.1, zweryfikowany na 5 mapach)

> Status: **K1.1** (re-audyt 2026-08-24 vs v0.119.0; pierwotnie K1 @ v0.101.0).
> Re-audyt: 39/41 kotwic line-exact lub +/-2 (`src/maps/**` nietkniete);
> 2 korekty tresci w T2; T15 NOWY (pasmo overlay); T4/T6/T13 rozszerzone
> o kanony z warstwy mocy (PowerSystem/Tier3Baker v0.102-0.119).
> Kazdy token = definicja + parametry + dowody z kodu + regula egzekwowania.

---

## T1 — Swiatlo globalne: slonce NW, cienie SE  [POTWIERDZONY, 5/5 map]

Slonce z lewego-gornego rogu na KAZDEJ mapie; highlight NW, cien SE.

- Parametry kanoniczne: `shX: 4, shY: 4, highlightAlpha ~0.18-0.20, shadowAlpha ~0.28-0.30`.
- Dowody: `ArcticMap.ts:52-57` (`ARCTIC_LIGHT`), `TropicsMap.ts:27-32`
  (`TROPICS_LIGHT`), `Pyramid.ts:90` ("sun from NW"), gradient sun NW->SE w bake'ach
  gruntu (Tropics/Arctic), highlight upper-left w propsach City (`AntiGravScrap.ts:47`),
  pebble NW-lit (`DirtRoad.ts:129-164`), cienie SE drzew/posagow (FortifiedRuinsMap).
- **Regula:** nowa mapa eksportuje zamrozony `XXX_LIGHT` w kotwicy (wzor Arctic) i
  KAZDY props go importuje. City i Desert nie maja eksportu (starsze) — kit ujednolica.

## T2 — Cien obiektu: dwie rodziny + prawa wlasnosci cienia  [POTWIERDZONY + ROZSZERZONY]

**Rodzina A — blob-elipsa** (NPC, organiczne, male propsy): elipsa, alpha
0.18-0.55, offset SE; duze bryly = podwojny cien (kontakt ostry + miekki
szeroki). **KOREKTA K1.1:** "kolor depth-dark mapy" trzyma sie 1-z-3 dowodow
(IceCube `P.depth`); Horse i Oasis uzywaja czystej czerni `0x000000` — regula
kitu: depth-dark PREFEROWANY, czern dopuszczalna przy niskiej alpha. Dowody:
pingwin (bake), wielblad (`Caravan.ts:107-110`), kon (podwojny,
`Horse.ts:229-237`), palma (`Oasis.ts:238`).

**Rodzina B — "Barn AO"** (budynki): DWA trapezy SE alpha 0.10/0.18;
owale przy budynkach ODRZUCONE ("v0.32.1: usuniete owale — Mariusz feedback").
Kanon: `BarnBuilding.ts:214-231`; **pas kontaktu — KOREKTA K1.1: kotwica to
`Crate.ts:135-137`** (Barn go nie ma); skopiowany do CountryHouse, Windmill,
Stable, Crate. Skalowac, nie wymyslac od nowa.

**Rodzina C — drop-in / altitude-coupled (K1.1, kanon z Wiezy MG):** obiekt
przybywajacy z nieba/lewitujacy ma cien ODSPRZEZONY na gruncie, ktory ROSNIE
i CIEMNIEJE z ladowaniem: `shadow.scale 0.55+0.45*p`, `alpha 0.35+0.65*p`
(`PowerSystem.ts:695-704`); wariant oddechu kaczki: `scale 0.9-0.12*hopN`,
`alpha 0.8-0.25*hopN` (`PowerSystem.ts:1811-1828`). Generalizacja prawa 2.

**Prawa wlasnosci cienia (3x ta sama lekcja):**
1. Cien MIESZKA NA ZIEMI, nigdy w kontenerze parallaksy (`NeonOasisStation.ts:317,410`).
2. Obiekt lewitujacy = cien ODSPRZEZONY (zostaje na ziemi, skaluje sie/blednie
   z wysokoscia) — `AntiGravScrap.ts:14-15`, `SkyTraffic.ts:253-263`.
3. Bryla kubiczna rzuca CZWOROKAT, nie elipse (`IceCube.ts:221-231`, feedback).
- Kandydaci do utili kitu: `blobShadow(size, palette)` + `trapezoidAO(w, h, scale)`.

## T3 — Parallaksa 2.5D: TRZY tryby (nie dwa)  [DOPRECYZOWANY — destylat obalony w 2 punktach]

Wspolny wzor przesuniecia (ujednolicic w kicie):
`off = (propCenter - cameraCenter) * hF`, gdzie `cameraCenter = cam + view/2`.

| Tryb | Przyklad | hF | Co sie rusza | Koszt |
|---|---|---|---|---|
| **apex-converge** | Pyramid (`Pyramid.ts:130-135`) | 0.25 | tylko apex; sciany re-lerp co klatke | pelny redraw/frame |
| **body-offset** | ArctowskiStation (`ArctowskiStation.ts:129-138`) | 0.11 | cala bryla + dynamiczne nogi (stopa static, glowa offset) | pelny redraw/frame |
| **layer-shift** | Sphinx (`Sphinx.ts:401-411`) | 0.03/0.08 | pre-narysowane warstwy przesuwane pozycja (UWAGA: znak MINUS) | **tylko transformy — najtanszy** |

+ CyberBuilding: projekcja scian z tego samego wzoru (selektywnie 2 sciany
  zwrocone do kamery + dach, atomic single-gfx — `CityMap.ts:230-362`).
+ mini-parallax 0.015 gdy statyczne podpory musza stykac sie z plywajaca warstwa
  (rozjazd sub-pikselowy, `NeonOasisStation.ts:60-62`).

**Obalone tezy destylatu:** (1) "ZAWSZE klasa C" — NIE: layer-shift Sphinxa jest
tani (transformy); to tryb domyslny kitu, pelny redraw tylko gdy geometria musi
sie deformowac (apex/nogi). (2) tie-break `x*1e-4` NIE istnieje w Desert
(Pyramid/Sphinx maja plaskie `y+10`) — to udoskonalenie ery City/Arctic; kit
stosuje wszedzie: `zIndex = y + oy + h + x*1e-4`, przeliczany co klatke Z oy.

**Reguly satelickie:** props doczepiony do plywajacej powierzchni REPLIKUJE
wzor hosta (billboard, `NeonBillboard.ts:283-288`); nie przypinac statycznych
detali do przesuwanej geometrii (wejscie piramidy "uciekalo", `Pyramid.ts:7-13`);
jeden hF na klaster (rozne hF = "rozjezdzajace sie dachy", `CityMap.ts:126-143`).

## T4 — Bake pipeline (mobile-crisp)  [POTWIERDZONY + DOPRECYZOWANY]

Renderer mobile ma **antialias OFF** => zywe PIXI.Graphics pikseluja na ukosnych
i okraglych krawedziach. Kanoniczna blizna: `PenguinColony.ts:21-24`,
`RuinsLake.ts:10-15`, `HoverRepairPad.ts:13-16`.

Wzorzec: Canvas 2D (zawsze AA) -> `PIXI.Texture.from(cv)` -> cache -> Sprite;
animacja ZOSTAJE na transformach (pozycja/scale/rotation/skew/flip/tint).

**Doprecyzowania z pelnego repo:**
- Supersampling RES 3-4 TYLKO dla malych animowanych sprite'ow (Penguin x4,
  IceHole x3, plyty padow x3); duza statyczna sztuka bake'uje 1:1 (Igloo, Hangar,
  jeziora, grunt 3000x3000).
- Krawedzie OSIOWE moga zostac wektorem nawet na mobile (RuinBlock 'wall' —
  prostokat jest ostry bez AA); CIENKIE ANIMOWANE kreski zostaja Graphics
  (beacon hangaru). Bake obowiazkowy dla ukosow/lukow.
- **Taksonomia cache (K1.1: TRZY smaki):** singleton modulu (`let _tex`) dla
  stalej geometrii; `Map<seed, tex>` dla wariantow seedowanych (ZONE_CACHE,
  ROCK_CACHE, ICE_CUBE_CACHE); `Map<string artKey, tex>` modulu, CELOWO nigdy
  nie niszczony — hero-art mocy (`Tier3Baker.ts:15`) — "zero rebake i zero
  leaku przy restarcie meczu".
- **K1.1 — bake Z GRADIENTAMI (Tier3Baker):** radial/linear gradienty masowo
  w bake'u to nowy kanon hero-artu ("pelna profeska, tanie na mobile" —
  decyzja Mariusza v0.112); platne raz, ZERO gradientow per-frame w runtime.
  Hero-art bake'uje 1:1 w finalnym rozmiarze (bez RES — uzupelnienie reguly
  "RES 3-4 tylko dla malych animowanych").
- Warianty x stany obrazen = wspoldzielone tekstury + SWAP tekstury sprite'a
  (IceCube: 5 wariantow x 3 stany = 15 tekstur; geometria per wariant identyczna).
- Kontrakt translate: kazdy bake dokumentuje `c.translate(m, m+rise)` == local(0,0)
  (`IceCube.ts:219`, `RuinsLake.ts:173`); konwersja live-draw -> bake ZACHOWUJE
  kolejnosc wywolan seedowanego RNG (`IceHole.ts:182`).
- Skalowanie wariantow: `imageSmoothingEnabled = false` (crisp nearest-neighbor).
- Drogie blendy ('lighter') DOZWOLONE w bake'u (platne raz), ZAKAZANE w runtime
  (`ArcticMap.ts:109`, `Igloo.ts:112`).
- Bake NIE odswieza sie przez Vite HMR — re-entry mapy (znany pattern, nie bug).
- ANTY-WZORZEC: budynki farmy Tropics NIE bake'uja wcale (Graphics w konstruktorze,
  generacja przed-crisp) — dzialaja, bo geometria osiowo-prosta, ale nowe budynki
  ida przez bake.

## T5 — Strefa mechaniczna: membership + jeden nazwany modyfikator  [CZESCIOWO OBALONY]

Destylat twierdzil "wszystkie strefy = rownanie elipsy". Stan faktyczny:

| Strefa | Ksztalt | Rownanie |
|---|---|---|
| Quicksand, Oasis (desert) | elipsa | `(dx/rx)^2 + (dy/ry)^2 <= 1` (`Quicksand.ts:117-123`, `Oasis.ts:378-385`) |
| WheatField (WYCOFANE) | elipsa + wizual-blob | rozjazd wizual/hitbox przyznany w kodzie — powod wycofania |
| Corn/Sugarcane, NeonOasis | prostokat | rect containment (`CornField.ts:322-325`, `NeonOasisStation.ts:1017-1020`) |
| SludgePool | prostokat (center) | AABB wokol center — "nieregularnosc TYLKO wizualna" (`SludgePool.ts:23-25`) |
| RuinsFosa | prostokat + wyciecie mostu | `RuinsFosa.ts:82-91` |
| RuinsBush | kwadrat (half-extent) | `RuinsBush.ts:103-106` |
| IceHole | elipsa (woda) | + margines 1.2 dla spawnBlocked |

**Regula kitu:** strefa = `isPointInside` + JEDEN nazwany modyfikator
(speedModifier 0.5 / detectionRange /2 / stealth flag / crush), efekt aplikuje
main.ts. Ksztalt: **prostokat rowny wizualowi jest domyslny** (kierunek ewolucji
repo — czytelnosc: hitbox == to co narysowane); elipsa dozwolona, gdy wizual
faktycznie jest elipsa (przerebel). Wysokie propsy strefy (palmy, trawa) ida
OSOBNO do worldContainer / pasm-band dla Y-sortu z czolgiem (Oasis palmy,
RuinsBush: trawa pocieta na K poziomych band = K sprite'ow z wlasnym zIndex —
ewolucja "setek zywych wektorow" w tania okluzje).

## T6 — Ruch NPC: CZTERY silniki, tylko jeden jest "PatrolPath"  [DOPRECYZOWANY — destylat obalony]

1. **Caravan-engine** (= PenguinColony 1:1, POTWIERDZONE `PenguinColony.ts:145-165`):
   polilinia -> ping-pong `period = 2 * totalPathLength` -> `getPathPosition` ->
   flip `scale.x` za kierunkiem (NIGDY rotacja "do gory nogami") -> multi-unit
   przez ujemny `pathProgress = -i * SPACING` (wejscie gesiego) -> drop co
   interval, RATES SA PARAMETREM (Caravan gem60/heart30/magnet10 vs Penguin
   gem80/heart15/magnet5). JEDYNY silnik wspierajacy konwoje — to jest klasa
   kitu `PatrolPath(config)`.
2. **Waypoint-loop chaser** (PatrolTractor): FSM driving/pausing, atan2 do celu,
   petla modulo (NIE ping-pong), pauzy per-waypoint, zero dropow. NIE jest trzecia
   instancja Caravana (destylat to zakladal — obalone, `PatrolTractor.ts`).
3. **Boustrophedon one-shot** (traktor koszacy w PastureField): pasy L->R->L,
   permanentny stop po ostatnim pasie (spec Mariusza).
4. **Stochastic wander FSM** (Horse): stany stable/paddock/wander, wspolny
   prymityw "walkToward" z (2).

Kit: `PatrolPath` ekstrahowany z Caravan/Penguin; `SeekTarget` prymityw wspolny
dla (2)/(4); (3) zostaje skinem jednorazowym.
5. **K1.1 — iniekcja celu (moce, 5. tryb):** zewnetrzny system podmienia target
   `enemy.update(delta, tx, ty, ...)` przez REUZYWANY punkt (`ghostTauntFor`
   `PowerSystem.ts:1005-1016`, `grannyFearFor` :2022-2035; konsumpcja
   `main.ts:3413`) — zero zmian w Enemy, zero alokacji. Wzorzec dla przyszlych
   NPC-manipulacji (wabiki, strach, przynenty).

## T7 — Paleta 60-30-10 + zarezerwowane kolory gameplay  [POTWIERDZONY + ROZSZERZONY]

- 60% tlo zdesaturowane / 30% elementy gameplay nasycone / 10% akcent.
  Zero czystej bieli/czerni (snieg niebiesko-zloty `ArcticMap.ts:20`, "NIE
  granatowy/czern" w wodzie `RiverNile.ts:30`, max depth = medium teal).
- **NOWE — zarezerwowany jezyk kolorow gameplay:** cyjan w polu gry = freeze/stealth
  (lekcja zlamana 3x — `IceCube.ts:18-19`); zolty pulsujacy ring = ostrzezenie
  strefy niebezpiecznej (`Quicksand.ts` warningRim); ikona pada = ikona pickupa
  1:1 (HeartPad = Heart pickup) ALE jeden symbol = jedna mechanika (serce-pickup
  vs kolo zebate-warsztat, `CloverMediPad.ts:359-361`).
- Kotwica eksportuje zamrozona palete (`ARCTIC_PALETTE` — single source of truth,
  importowana przez propsy i IceCube). Standard dla nowych map.

### Tabela dyferencjatorow palet (5 istniejacych + planowane)

| Mapa | Tlo (60) | Gameplay (30) | Akcent (10) | Temperatura |
|---|---|---|---|---|
| City | granat-czern `#1e1e2a/#09090f` | neony budynkow (cyan/zolty/fiolet) | magenta/czerwien neonow, toksyczna zielen `#39ff6a` | zimna noc |
| Desert | piaski `#e8d4a2` rodzina | kamien/woda teal `#155f7d-#2789a8` | zloto piramidionu, rubin/bursztyn padow | goracy dzien |
| Tropics | zielenie x8 `#6dba4a` | drewno karaibskie + czerwien stodoly `#de5135` | teal `#4a8a7c` / rdza `#a05a2a` / zolty traktor | cieply dzien |
| Fortified | piaskowo-kamienny `#a89066` | kamien zimny `#8c8578` + woda `#2b5f6a` | kolory flag (blue/red/yellow), pochodnie | neutralny zmierzch |
| Arctic | lod `#e8f4f8/#bcdfec` | granat glebi `#15323d`, stal yeti | zloto szampanskie `#fff9e6`, zorza cyan/fiolet | mrozny poranek |
| **Mars (plan)** | regolit rdzawo-rozowy | baza biel-cyjan | alien zielen-fiolet | suchy chlod |
| Fabryka/Zlomowisko (plan) | szaro-rdzawy — RYZYKO monotonii z Fortified/City | rozroznic akcentem (np. miedz+turkus vs neon) | — | — |
| Wulkany (plan) | bazalt ciemny — RYZYKO zlania z Mars (czerwienie) | lawa pomaranczowa (zarezerwowac!) | — | goraco |

Regula: przed kontraktem nowej mapy sprawdz kolizje palety z ta tabela
(dwie sasiednie mapy w rotacji nie moga dzielic 60% i 10% naraz).

---

## NOWE TOKENY (odkryte w K1)

## T8 — Baked Decor Layer (dekor w teksturze gruntu)

Dekor statyczny (drzewa, pochodnie, beczki, posagi, runy, ogniska, mur obwodowy,
sciezki) WPIEKANY do tekstury gruntu — zero obiektow runtime, koszt/frame = 0.
Kanon: FortifiedRuinsMap (60+ dekoracji, `FortifiedRuinsMap.ts:207-372`); takze
chodniki/parkingi w bake City, zorza/relikty/banki gazu w bake Arctic.
**Regula:** wszystko co nie ma kolizji, animacji ani interakcji IDZIE DO BAKE'U
GRUNTU. To najtanszy sposob na gestosc swiata. (Trade-off: HMR re-entry.)

## T9 — Warstwa animacji = transformy; redraw tylko maly i uzasadniony

Hierarchia technik (najlepsza -> zakazana):
1. bake + transformy (skew/rotation/scale/tint/visible) + culling latch,
2. bake raz, zero update (dekor),
3. zywe Graphics + transformy (male propsy),
4. per-frame `clear()`+redraw TYLKO dla malej geometrii (ripples, beacon),
5. ZAKAZ: masowe zywe Graphics (600 zdziebel PastureField), nielimitowany
   append do jednego Graphics (mowedTrack), pelny redraw duzych brył bez powodu.
Stan-jako-tint/visible zamiast redraw: pady Ruins (tint `0x5a6b5e` na cooldown,
`RuinsMediPad.ts:141`) — wzorzec dla wszystkich padow.

## T10 — Dyscyplina glow/blend

- Domyslnie: glow = zwykle alpha fills (stacked), ZERO blend mode.
- ADD dozwolony: male/punktowe swiatla (beacon, LED, scan-cone, hologram —
  budzet jednego hero-propsa); NIGDY area-wash: god-rays w NEON-OASIS "praly
  do bieli" i zostaly wyciete (`GroundClutter.ts:119-120` — jedyny zapis lekcji).
- SCREEN: nie wystepuje nigdzie w repo i ma tak zostac (pady Ruins jawnie:
  "NORMAL alpha, NIE SCREEN-blend jak stock").
- ADD = swiatlo; mokre/materia = normal ("to mokra fala, nie swiatlo",
  `NeonOasisStation.ts:823-825`).
- Na ciemnej mapie dekoracyjne rozjasnienia alpha <= 0.10.
- Glow centrowany PERCEPCYJNIE, nie geometrycznie (okluzja przez bryle,
  `SludgeReactor.ts:263-268`; uwaga: kod ma drift `H*1` vs komentarz — do
  weryfikacji przy kicie).

## T11 — Layout-as-data + math-verify (proces jako token)

Kotwica eksportuje layouty jako STALE tablice z seedami; pozycje wyliczone
i ZWERYFIKOWANE AABB offline (skrypt scratchpad, wynik w komentarzu — wzor:
`ArcticMap.ts:370-376`, `FortifiedRuinsMap.ts:4-25`, `GroundClutter.ts:8-11`).
Wzor przeswitu przy wycinaniu dziur w kolizji:
`clearance = polowa_propsa + promien_gracza + polowa_segmentu` (dla obroconych
propsow uzywaj DLUZSZEGO wymiaru — `RiverNile.ts:250-253`).
Deterministyczny RNG dla wszystkiego co baked/persistent: **mulberry32**
(`makeRng`, `ArcticMap.ts:62-71`). Census niespojnosci: LCG-glibc
(Corn/Wheat/DirtRoad/FarmBuildingTextures/Oasis), LCG-9301 (Sugarcane/Lettuce/
Pasture/Crate), prime-hash (Paddock/pady Tropics), `Math.random()` W BAKE'ACH
Desert i Tropics (grunt NIEdeterministyczny!). Kit: jeden util mulberry32.

## T12 — Amplituda sensoryki: pierwsze podejscie jest 2x za subtelne

Udokumentowane pasy wzmocnien: Barn "2x amplitudy dla widocznosci", Sugarcane
"2x amplitude", Horse v0.41.5 (oddech x2.5, bob x2.5, ogon "faster+bigger"),
Blizzard "gesto — ODCZUWALNA". Kontr-lekcja: po naprawie pivota amplitude
przestroic PONOWNIE (grzywa 0.12 -> 0.04 po fix pivotu — dramatycznie != zepsute).
**Regula gate'u:** animacja niewidoczna z zoom 0.6 na 375px = bug; planuj pas
wzmocnienia w pierwszej iteracji.

## T13 — Slownik animacji per material

- Organiczne: squash&stretch, sway, bob (pniak pada squashuje przy aktywacji).
- Mechaniczne: rotacja/puls, ZERO squash ("gear nie jest organic. To machinery.",
  `CloverMediPad.ts:557-558`).
- Side-view NPC na wolnych sciezkach: flip `scale.x = -1`, nigdy pelna rotacja;
  pre-flip przy wyborze celu + histereza 5px (moonwalk konia, v0.41.9).
- Rotor/wentylator: kat = animTime * k, klatko-NIEzalezny (`OldFactory.ts:182-183`);
  duchy-echa poly jako motion blur bez shaderow (`HoloTurbine.ts:335-340`).
- Emisja swiatla zsynchronizowana ze zdarzeniem emisji (rozblysk komina przy
  wyrzucie dymu); idle-FX cooldowny z jitterem (nie metronomicznie).
- Wirtualne elementy (hologram) maja fizyczna kotwice reakcji (micro-iskry
  projektora — zwiazek przyczynowy czytelny).
- **K1.1 — kontr-rotacja + przeciwfaza = dynamizm bez particles:** pierscienie
  jako OSOBNE gfx z rotacja w przeciwnych kierunkach + 2 warstwy drobin
  sawtooth w PRZECIWFAZIE ("wir nigdy nie mruga") — Czarna Dziura
  `PowerSystem.ts:1393-1461`, powtorzone w tarczy Ponga :1648-1653.

## T15 — Pasmo overlay 1e6 = przestrzen WSPOLDZIELONA (K1.1)

Od F7b pasmo `zIndex 1_000_000` nie jest wylacznoscia pogody. Obecni lokatorzy:
Blizzard 1e6 · cien nalotu 1e6 (`PowerSystem.ts:1307`) · kolumna lasera 1e6
(:1554) · kaczka 1e6-1 (:1747) · paczki 1e6-2 (:1881) · kula disco 1e6-3 (:1936).
**LATENT BUG:** trzy wpisy na ROWNYM 1e6 bez tie-breaka `x*1e-4` = niestabilny
sort (A3) — Arktyka + Nalot/Laser w zamieci moze migotac. **Regula:** kazdy nowy
wpis w pasmie bierze WOLNY sub-slot (1e6-4, 1e6-5, ...) albo dodaje tie-break;
rownolegle istnieje pasmo decali gruntu **z=9** (kratery, cienie mocy, swiatla
disco — wzorzec BossBomb z=8) miedzy stalymi pasmami -50 i 4.

## T14 — Culling latch (v0.68.0) + wyjatki symulacyjne

Wzorzec: AABB pola vs kamera z marginesem ~140; `renderable` przelaczane TYLKO
przy ZMIANIE widocznosci (latch `_cullHidden`), potem early-return omijajacy
cala animacje (`CornField.ts:279-293`). Wyjatek: obiekty niosace SYMULACJE
(traktor kosi dalej poza kadrem — stan swiata spojny). STAN FAKTYCZNY: culling
maja tylko pola Tropics; zaden props City/Desert/Arctic nie culluje mimo
otrzymywania kamery — najwieksze latwe wygrane perf (lista w MOBILE_COST_MODEL).
Kit: util `cullLatch(bounds, cam, margin)`.
