# KONTRAKT MAPY: MARS (K1.5 — szablon wypelniony propozycjami)

> Status: **PROPOZYCJA K1.5** (2026-08-24). Szablon = GRAMMAR §7 (gate) +
> karta budzetu COST_MODEL §3/§3b, wypelniony manifestem wg MAPKIT_COMPOSER.
> **KAZDA pozycja merytoryczna = [PROPOZYCJA — decyzja Mariusza przy starcie
> fazy Marsa].** Nic tu nie jest przesadzone; kontrakt istnieje po to, zeby
> decyzje zapadly na danych PRZED pisaniem kodu (delivery-workflow: plan +
> math przed implementacja).

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
| 6 | Strefy | [PROPOZYCJA] (a) **pola regolitu sypkiego** = slow 0.5x (wzorzec Quicksand); (b) **szczeliny/kaniony** = woda wariant A? — patrz OTWARTE ponizej; (c) **cien kopuly / ogrod hydroponiczny** = stealth | kazda strefa z gotowego rownania K3 (rect) |
| 7 | Pady | [PROPOZYCJA] themed: **Sluza medyczna** (medi; airlock z sykiem pary) + **Reaktor RTG** (power; puls pomaranczowy) — kontrakt aktywacji AABB+8 (DOCELOWY z K9, NIE radial legacy) | pierwsze pady budowane od razu wg docelowego kontraktu |
| 8 | Ambient | [PROPOZYCJA] **drony konserwacyjne** (2-3, wzorzec SkyTraffic-lite) + migoczace anteny | tanie, punktowe |
| 9 | Patrol/gwiazda | [PROPOZYCJA] **UFO-PORYWACZ** = mechanika-gwiazda (patrz §3) | SeekTarget ze SPEC (silnik wspolny z rybami/yeti) |
| P | Pogoda | [PROPOZYCJA] **Burza pylowa** — cykl bramkowany (idle 100-150s / peak ~20s, wzor Blizzard H1: klimat nie kara), particles-only | patrz §4 zIndex — MUSI wziac wolny sub-slot |
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

## 7. OTWARTE decyzje (do rozstrzygniecia z Mariuszem przy starcie fazy)

1. **Szczeliny = woda wariant A czy zwykly solid?** Wariant A (czolg stoi na
   krawedzi, pocisk przelatuje) jest ciekawszy taktycznie, ale wymaga
   zadeklarowania zachowania wroga wepchnietego przez Dziure/Babcie (§2 w.11).
2. **UFO porywa gracza?** Rekomendacja: NIE w v1 (czytelnosc/frustracja 9-12).
3. **Rozmiar bazy:** 2 czy 3 kopuly (wiecej stealth-cienia vs mniej playfieldu).
4. **CTF-ready od razu?** Rekomendacja: NIE — symetria wiaze layout; KTB first.
