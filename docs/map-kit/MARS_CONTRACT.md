# KONTRAKT MAPY: MARS (K2/M1 — ZATWIERDZONY)

> Status: **ZATWIERDZONY 2026-08-24** (decyzje Mariusza przy starcie fazy K2)
> + **layout math-verified M1** (`tools/mars_m1_layout.mjs` — PASS 0 bledow,
> layouty FROZEN w skrypcie; MarsMap.ts kopiuje z jego outputu, lekcja I7).
> Decyzje zamkniete: szczeliny = woda wariant A; UFO porywa TYLKO wrogow
> i skrzynie (gracza NIE); scenariusz TYLKO KTB w v1; **2 kopuly + tunel**
> (3. kopula: +0.38% blokady, drugi dead-zone, zero wartosci — raport V6).
> Otwarte pozostaje tylko: muzyka (assety od Mariusza, gentle-fail do czasu).

---

## 0. Fantazja mapy (1 zdanie)

[PROPOZYCJA] Opuszczona ludzka baza badawcza na Marsie, wokol ktorej krazy
UFO porywajace wszystko, co sie rusza — pustynia rdzawego regolitu, biale
kopuly, zielone slady Obcych. Klimat spojny: sci-fi kolonia, ZERO anachronizmow
(H4) — zadnych roslin, wody w stanie cieklym, zwierzat ziemskich.

## 1. Paleta (eksport PALETTE + LIGHT, wzor Arctic)

[PROPOZYCJA] Trzy rodziny wg tabeli dyferencjatorow T7:

- **Regolit (grunt):** rdzawo-ROZOWY, nie czerwony — celowo odsuniete od
  przyszlych Wulkanow (lawa = czerwien/oranz nasycone) i od piasku Desert
  (zolto-bezowy). Baza ~0xB0604A..0xC97B62, cienie fioletowawe (nie czarne).
- **Baza ludzka:** biel + cyjan-akcent — UWAGA na F1: cyjan w POLU GRY jest
  zarezerwowany (freeze/stealth); cyjan bazy tylko jako detal architektury
  (okna/lampy), nigdy jako obszar podlogi.
- **Obcy/alien:** zielen-fiolet (bioluminescencja) — jezyk "to jest obce,
  interaktywne"; NIE uzywac dekoracyjnie na propsach neutralnych (falsz
  affordance, design-values).
- LIGHT: zimne rozowawe swiatlo dzienne; ADD tylko punktowo (H5).

## 2. Warstwy gramatyki 1-11+P (kazda wypelniona albo jawnie pominieta)

| # | Warstwa | Decyzja | Uzasadnienie |
|---|---------|---------|--------------|
| 1 | Border | [PROPOZYCJA] **DuststormBorder** — kopia wzorca 30+55 z Sandstorm (95% reuse jak Arctic) w palecie regolitu | najtanszy sprawdzony wariant; skin: unoszacy sie pyl |
| 2 | Grunt | [PROPOZYCJA] bake 3000x3000: regolit + kratery (decal z=9!) + slady lazika + rozsypane panele solarne W BAKE'U (wzor Ruins BAKED DECOR) | dekor w bake = zero kosztu runtime |
| 3 | Landmark | [PROPOZYCJA] **Baza marsjanska z KOPULA** (2-3 kopuly polaczone tunelami) — parallaksa layer-shift (tryb DOMYSLNY kitu, K2) | dominanta czytelna przy zoom 0.6; kopula = duza prosta bryla, tania w bake'u |
| 4 | Solid | [PROPOZYCJA] moduly bazy (habitat, maszt komunikacyjny), skaly marsjanskie (reuse silnika Rock z Desert w nowej palecie) | Rock = najtanszy sprawdzony filler solid |
| 5 | Fillery/niszczalne | [PROPOZYCJA] **skrzynie cargo** (reuse `Crate.ts` z reskinem) x60-80 + wraki lazikow (passable dekor) | Crate ma gotowy kontrakt niszczalnosci (needsEffects=true, I3) |
| 6 | Strefy | ZBUDOWANE M4: (a) **pola sypkiego regolitu** = slow 0.5x (rect K3, pulsujacy rim); (b) **szczeliny** = woda wariant A (buildings + spawnBlocked, pociski przelatuja); (c) **2x ogrod hydroponiczny** = stealth | **ZMIANA vs propozycja: cien kopuly ODRZUCONY jako stealth** — ciemna plama tonalna jako kryjowka to dokladnie blizna F4 (konie "za mgla"); zamiast tego DRUGI ogrod. Zielen = jedyna roslinnosc na martwym swiecie = jednoznaczny sygnal (F2) |
| 7 | Pady | ZBUDOWANE M4: **Sluza medyczna** (zebatka NIE serce — F2; pasek postepu, lampa gotowosci) + **Reaktor RTG** (zebra chlodzace, luki energii, bursztyn) | **Pierwsze pady w grze z aktywacja AABB+8** = kontrakt DOCELOWY K9 (7 starszych padow zostaje na radialu, do migracji przy dotknieciu). i18n: etykieta przez `t('pad.repairing')` — nowe pady NIE powielaja dlugu hardcoded PL |
| 8 | Ambient | [PROPOZYCJA] **drony konserwacyjne** (2-3, wzorzec SkyTraffic-lite) + migoczace anteny | tanie, punktowe |
| 9 | Patrol/gwiazda | ZBUDOWANE: **lazik-Pathfinder** (M4b, ambient+drop) + **UFO-PORYWACZ** (M5, gwiazda) | UFO: faza cruise->lock->lift->carry->release; kontrakt jak Disco (`isAbducted(e)` => main.ts pomija `enemy.update`, UFO wlada containerem); kill-path w main.ts (punkty + bonus bez-strzalu); ofiara sprawdzana `active` KAZDA klatke (crash-fix v0.112) |
| P | Pogoda | ZBUDOWANE M5: **Burza pylowa** — idle 100-150 s / peak 20 s, particles-only, wrap 4-STRONNY, ruch skalowany DELTA (D4), idle = early-return | zIndex **1e6-4** = pierwszy WOLNY sub-slot (1e6 zajete przez nalot i laser, patrz T15) |
| 10 | Scenariusz | POMINIETE (Mars startuje jako mapa KTB; CTF-symetria nie jest wymogiem) | decyzja odwracalna — slot pusty w manifescie |
| 11 | transientPolicy | [PROPOZYCJA] `dynamicColliders: true` (Mur dozwolony), `enemyPositionMutation: true` + `waterPushBehavior: 'note'` — wrog wepchniety w szczeline NIE ginie, stoi w niej (jak woda wariant A) | zgodne z BY DESIGN 6b; szczeliny musza to deklarowac |

## 3. Mechanika-gwiazda: UFO-Porywacz [PROPOZYCJA]

- Silnik: **SeekTarget** (prymityw kitu K6; wspolny z WaterLife/Yeti) —
  UFO krazy po mapie, co X s wybiera cel (wrog LUB skrzynia), zawisa,
  promien traktora (telegraf! F8: ring + dzwiek OD startu), porywa i upuszcza
  w losowym miejscu po 2-3 s.
- Flex: porwany wrog ginie przy upadku = bonus punktowy + popup (flex-confirm).
- Ryzyko: UFO moze porwac TEZ gracza? [PROPOZYCJA: NIE w v1 — czytelnosc;
  ewentualnie w v2 jako rzadki event z długim telegrafem].
- Kosztowo: 1x NPC klasy B (jeden aktor, promien = pre-baked sprite + puls).

## 4. zIndex / pasma (deklaracja zBands z manifestu)

- Burza pylowa: pasmo overlay — **sub-slot 1e6-4** (pierwszy WOLNY wg tabeli
  lokatorow T15: 1e6 Blizzard/nalot/laser, -1 kaczka, -2 paczki, -3 disco).
- Kratery/slady: pasmo decali gruntu z=9 (pod wszystkim, nad bake'iem).
- Kopula bazy: pasma 2.5D wg A4 (sciany <5000, dach/attachmenty >5000).

## 5. Karta budzetu mobile (COST_MODEL §3 + §3b) [PROPOZYCJA]

```
Mapa: MARS                          Baseline: A54, zoom 0.6, antialias OFF
Klasa C (gated):  1 — burza pylowa (peak ~20s, idle ~0 przez D7)   [max 2]
Klasa B:          3 — UFO-Porywacz, drony ambient (lacznie), border-skin
                     [max 5-6; zostawione 2 sloty ZAPASU]
Klasa A:          skaly, moduly bazy, pady, skrzynie (transformy/pooling)
Klasa S:          grunt + dekor w bake'u, kratery z=9
                  ZMIERZONE: bake gruntu 75 ms desktop (Arctic ref. 26-32 ms) —
                  jednorazowo przy wejsciu na mape; faktura regolitu przez
                  2 kafle szumu (pattern) zamiast ~200k drawow. Jesli A54
                  odczuje ladowanie: zbic sparse-grit 5200 i pola fal 26.
Fill-rate:        zero pelnoekranowych blendow; burza = particles capped
                  (wzor Blizzard), promien UFO = baked sprite, nie gradient
Culling latch:    kopuly bazy, pola regolitu, wraki (wzor v0.68.0)
Warstwa mocy (K1.1): rezerwa 1 slot B uwzgledniona [x] — dlatego B=3, nie 5
```

Zasada: Mars celuje PONIZEJ sufitu Arctic (najciezsza mapa), bo warstwa mocy
18 mocy gra na kazdej mapie (COST_MODEL §3b).

## 6. Gate LESSONS (obowiazkowy przy dostarczaniu)

Pelna checklista LESSONS_LEARNED A-I odhaczana per props. Z gory znane
punkty krytyczne dla Marsa:
- B8: szczeliny + pola sypkie -> spawnBlocked (composer robi to z deklaracji);
- F1: cyjan bazy tylko w detalach architektury;
- F3: kontrast — rdzawy regolit vs rdzawe skaly: skaly MUSZA miec inna
  jasnosc/obrys (blizna "kamien-widmo" z Ruins);
- I1: layout math-verified AABB przed kodem (skrypt W REPO, lekcja I7);
- H2: Obcy = stwory fantastyczne (zielone macki OK), zero realnej przemocy.

## 7. Decyzje — ROZSTRZYGNIETE 2026-08-24 (Mariusz, start fazy K2)

1. **Szczeliny = WODA WARIANT A** (czolg stoi na krawedzi, pocisk przelatuje;
   buildings TAK / solid NIE / spawnBlocked TAK). Wrog wepchniety przez
   Dziure/Babcie STOI w szczelinie, nie ginie (transientPolicy 'note').
2. **UFO porywa TYLKO wrogow i skrzynie** — gracza NIE (czytelnosc 9-12).
3. **2 kopuly + tunel** — rozstrzygniete matematyka M1 (raport V6 skryptu:
   3. kopula = +0.38% blokady i drugi dead-zone; stealth pokrywaja
   hydroponika + cien kopuly).
4. **Tylko KTB w v1** — warstwa 10 pusta; CTF ewentualnie pozniejsza nakladka.

## 8b. Status implementacji (aktualizowany po kazdej podfazie)

| Podfaza | Zakres | Status |
|---|---|---|
| M1 | layout math-verified + kontrakt | DONE (`tools/mars_m1_layout.mjs`, PASS) |
| M2 | grunt + border + meta-wiring (9 plikow) | DONE, playtest desktop+mobile OK |
| M2b | faktura regolitu (kafle szumu + gruz + kamienie + fale) | DONE, playtest OK, bake ~64 ms |
| M3 | landmark (baza) + solidy (skaly) + fillery (cargo) | ZBUDOWANE — czeka na playtest |
| M4 | strefy + pady | ZBUDOWANE, playtest DAL FEEDBACK -> M4b |
| M4b | poprawki z playtestu (patrz nizej) | ZBUDOWANE — czeka na playtest |
| M5 | UFO-Porywacz + burza pylowa | ZBUDOWANE — czeka na playtest |
| M5b | wiata solarna przejezdna + kabel podlaczony + UFO lata wysoko | ZBUDOWANE |
| M5c | stacja tankowania + rutyna + walka + faza ostrzegawcza | ZBUDOWANE — czeka na playtest |
| M6 | gate LESSONS + composeMap + Edge Function + A54 | TODO |

**M4b — zmiany z playtestu Mariusza (2026-08-24):**
1. **SZCZELINY USUNIETE** ("wyglada jak dziwna niezidentyfikowana plama... nic nie
   daje grze"). Woda-A brzmiala dobrze na papierze, ale bez powodu do strzelania
   przez przepasc byla tylko szumem wizualnym. `Crevasse.ts` skasowany — zero
   martwego kodu.
2. **PADY: 1+1 -> 3 medi + 2 power.** Diagnoza "nie generuja sie medipady": pady
   POWSTAWALY, ale jeden na 3000x3000 jest statystycznie nie do spotkania.
   Kazda inna otwarta mapa ma 3+2 na pierscieniu ~850-1250 od srodka.
3. **FARMA SOLARNA** (nowa, warstwa 4): 4 rzedy paneli sledzacych slonce + kanal
   energii z impulsami plynacymi do bazy + falownik migajacy w rytm. "Funkcjonuje"
   = widac lancuch przyczynowy panel->kabel->baza, nie sama dekoracja.
4. **LAZIK-PATHFINDER** (nowy, warstwa 9): bezkolizyjny patrol po petli waypointow,
   maszt skanujacy, pyl spod kol, gubi gem/serce/magnes co 15 s. Silnik z
   PenguinColony (timer z DELTY nie Date.now, baked sprite, flip po dirX).
5. **SZKLARNIE nad hydroponika** ("wygladaja dziwnie podejrzanie"): odkryte grzadki
   na Marsie to fizyczny nonsens i oko to wychwytuje. Teraz: rama, przeszklenie
   z refleksem, wejscie od poludnia z szewronami. Szklo rysowane NAD czolgiem
   (zIndex y+h+60) — widzisz, ze chowasz sie POD dachem.
6. **ROZRZUT** ("wszystko skoncentrowane w srodku, na obrzezach pusto"): baza
   przeniesiona na NE, farma na SW, layout przeliczony. Skrypt ma nowa bramke
   **V7 sector coverage** (3x3) — pustka na obrzezach jest teraz bledem
   weryfikatora, nie kwestia oceny na oko.

**M5c — RUTYNA TANKOWANIA UFO (decyzje Mariusza 2026-08-24, do implementacji):**
Po pozarciu ofiary talerz leci na stacje, laduje, wysiada ufoludek i tankuje ~10 s.
Gracz moze go ostrzelac — wtedy UFO i ufoludek odpowiadaja ogniem, po 10 s odlatuja
"wciagnac inna skrzynke lub wroga". Zestrzelone UFO = solidny drop gemow, po czasie
przylatuje nastepne.

Decyzje: ufoludek **strzela z pistoletu** (decyzja Mariusza mimo mojej rekomendacji
ucieczki — wykonanie: sci-fi blaster, gruba lufa, plazma, ZERO realizmu, bo humanoid
z bronia reczna to jedyny taki przypadek w grze; precedens molotov->sniezki, H2).
Talerz strzela **pociskami plazmowymi**. UFO **zniszczalne, ale praktycznie nie**:
HP = 5x mega boss.

**REV 3 — wyglad (M5d):**
- **Bazy: kopuly -> MODULY kwadratowe z zaokraglonymi rogami.** Kopula czytala
  sie jak igloo i nie dawala miejsca na detal. Modul ma teraz plaski dach z
  **fotowoltaika**, **farme anten** (3 maszty roznej wysokosci + talerz na
  pylonie), **pasy ostrzegawcze**, **tabliczke numeru modulu**, rzad okien
  (cyjan = detal, F1), sruby narozne i wlaz. Migaja: latarnie na 4 rogach dachu
  (chase), stroboskopy na masztach, jedno okno "przymruza", talerz omiata.
- **PASAZ MIEDZY BAZAMI = WIATA** ("taki sam przejazd jak pod panelami"):
  zdjeta kolizja (`getExtraCollidables` zwraca juz tylko modul B), uniesiony
  o PASSAGE_H 17, wlasny cien przesuniety SE + slupki nosne. Gracz przejezdza pod
  spodem, a szewrony na dachu mowia "to konstrukcja, nie rura".
- **Stacja tankowania 2.5D** ("mniej jak placek"): plyta ma widoczna KRAWEDZ
  (ciemna scianka boczna pod jasnym licem), oswietlona warge od polnocy, wlasny
  cien oraz **4 pylony narozne z glowicami lamp** — struktura pionowa zamiast
  naklejki.

**REV 2 po playtescie (2026-08-24):**
- **ESKALACJA 5 TRAFIEN zamiast 1 blysku** ("gracz musi wiedziec ze
  niebezpieczenstwo narasta"): `PROVOKE_HITS = 5`, pierscien-bezpiecznik wokol
  kadluba zapala sie segment po segmencie, kolor idzie zolty->bursztyn->
  pomaranczowy->czerwony (`THREAT_COLORS`), puls przyspiesza z poziomem, a
  main.ts dokłada rosnacy shake + dzwiek + licznik na HUD (`hud.ufoWarn`).
  Poziom **spada** po 4,5 s bez trafienia (`ESCALATION_DECAY_MS`) — jak reaktor.
- UFO **+50%** skali, wysokosc lotu **+25%** (150 px, cien SHADOW_OFF 32).
- Ufoludek **+50%** i przeprojektowany na zlowrogiego: przygarbiona sylwetka,
  wieksza czaszka, **skosne szpary oczu** ze swieceniem (zielone -> czerwone gdy
  walczy), dlugie rece. Blaster: cewki, gorace jadro, antena.
- **Muzzle flash** przy kazdym strzale ufoludka: biala gwiazda 4-ramienna,
  fioletowa poswiata i puff dymu (juice, ~130 ms).
- Tankowanie **co 3 polkniecia** (`CATCHES_PER_REFUEL`), nie po kazdym.
- Stacja tankowania: **mniejsza** (pad 140x120, zbiornik 60x82) i przeniesiona
  w **lewy gorny rog** (200,480). medi1 przesuniety na (560,780) po konflikcie.

ZAIMPLEMENTOWANE wartosci: REFUEL_MS 10 000 / ALERT_MS 700 / SHOT_INTERVAL 620 ms
(plazma, dmg 90, burst 2) / ALIEN_SHOT_INTERVAL 900 ms (blaster, dmg 55) /
UFO_HP 10 000 / GEM_DROP 60 / RESPAWN_MS 25 000. Cykl: cruise -> lock -> devour
-> **toStation -> grounded (tankowanie) -> takeoff** -> cruise.
UFO jest trafialne **tylko na ladowisku** (gettery w/h = 0 w locie) — nie da sie
go zestrzelic z nieba, wiec walka jest zawsze swiadomym wyborem przy stacji.

Dane zebrane (gotowe do uzycia, zweryfikowane w kodzie):
- `ENEMY_MEGA_BOSS.hp = 2000` (x100 juz wliczone) => **UFO 10 000 HP**.
- Drop: `dropGems(x, y, n)` w main.ts; mega boss daje 20 => **UFO ~60**.
- Strzal z propa: `update()` zwraca `EnemyShotInfo` (czysty POJO: x,y,angle,speed,
  dmg,color,burstCount,burstSpread,bulletType), main.ts wola `spawnEnemyShot`.
  Dla plazmy: `bulletType: null` + `color: MARS_HEX.alienGreen` (baker ignoruje
  kolor dla nazwanych typow).
- Trafienie gracza w UFO: wystarczy `takeDamage(dmg, hitX, hitY)` + wpis w
  `solidBuildings` (duck-typing w Bullet.ts:274-287; pocisk zawsze ginie).
  UWAGA: pociski WROGOW tez trafiaja => potrzebny guard przeciw bratobojczemu.
- Ladowisko: `FuelStation.LANDING` = srodek plyty; plyta PASSABLE (unika buga
  helipada z v0.58.0, gdzie woz utykal w hitboxie stacji).
- Faza ostrzegawcza (moja rekomendacja, do decyzji): po 1. trafieniu UFO najpierw
  ALARMUJE (tarcza/miganie/dzwiek, ~1 s), dopiero potem strzela — zeby przypadkowa
  seria nie zabila gracza czyms, co uwazal za dekoracje (Czytelnosc > wszystko).

Reuse w M3 (bez refaktoru istniejacych map): `Rock` dostal OPCJONALNY parametr
palety (default = pustynia; klasa nie cache'uje tekstur, wiec zero ryzyka
zatrucia Pustyni) — Mars podaje `MARS_ROCK_PALETTE`. Skrzynia `Crate` NIE zostala
przeskinowana: drewno + rdza to anachronizm na Marsie (H4), wiec powstal
`MarsCargo` — nowy wizual, mechanika (HP 3 / respawn 60 s / proxy PAD 8 /
duck-typed takeDamage) skopiowana 1:1 ze sprawdzonej skrzyni.

## 8. Layout FROZEN (M1)

Zrodlo prawdy: `tools/mars_m1_layout.mjs` (run: `node tools/mars_m1_layout.mjs`,
PASS wymagany przed zmiana layoutu). Konwencja: x/y = TOP-LEFT wszedzie.
Baza (1180,620)-(1930,900); szczeliny C1(420,1500,520x100),
C2(1980,2050,460x110), C3(2160,520,90x480); slow R1-R4; stealth hydroponika
(1220,920,260x170) + cien kopuly (1690,920,220x160); pady airlockMedi
(820,1950) + rtgPower (2430,850); 8 duzych skal 120x120; 24 male skaly 64x64
+ 64 skrzyn 48x48 GENEROWANE seedem (mulberry32, seedy w skrypcie) — wklejane
do MarsMap.ts Z OUTPUTU skryptu, nie z reki. Blocked area 7.44% swiata.
Spawn gracza (1500,1500) czysty w promieniu 220.
