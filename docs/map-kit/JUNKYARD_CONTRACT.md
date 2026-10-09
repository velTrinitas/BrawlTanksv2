# KONTRAKT MAPY: ZLOMOWISKO / junkyard (J0 — ZATWIERDZONY 2026-10-08)

> Status: plan J0–J6 zatwierdzony przez Mariusza 2026-10-08 (plik planu sesji + karta backlogu Notion
> „ZLOMOWISKO — mapa KTB (plan J0–J6)”). Layout math-verified J0 (`tools/junkyard_j0_layout.mjs` — PASS,
> 0 bledow, 6.4% swiata zablokowane, 9/9 sektorow z zawartoscia); `JunkyardMap.ts` kopiuje z jego outputu
> (lekcja I7). Decyzje zamkniete: prasa BEZ instakilla gracza (45% HP + odrzut); Myjnia Piany TAK; brak
> punktow za wrogow zabitych przez maszyny; Burza magnetyczna za osobna flaga pozniej; dwa „odjechane”
> na start = Lawina kolpakow + Wyprzedaz czesci. Mapa TYLKO KTB w v1. Flaga: `junkyardFlag.ts`.

## 0. Fantazja mapy (1 zdanie)
Zlomowisko w poludniowym sloncu — fabryka-plac zabaw, w ktorej maszyny pracuja same, a gracz pierwszy raz
w grze moze uzyc MAPY przeciw bossowi (zwabic go pod Wielka Prase).

## 1. Paleta (`JUNKYARD_PALETTE` / `JUNKYARD_HEX` / `JUNKYARD_LIGHT`, `src/maps/JunkyardMap.ts`)
Trzy warstwy wartosci (anty-szum, najwieksze ryzyko tej mapy):
- **Grunt:** ochra / szaro-braz, niskie nasycenie (earth, gravel, asphalt, concrete).
- **Dekor:** 6 splowialych pasteli (wreck0..5) dla wrakow, opon, kontenerow, plotu — tint z jednego atlasu.
- **Interakcja:** zolto-czarne pasy (hazardY/hazardK), czerwone koguty (beaconRed), turkus piany (foam).
Zakaz: kolory czolgow gracza, fiolet bossa, zloto (tozsamosc Enigmy); chrom = srebrno-bialy.
Swiatlo: slonce NW, cienie SE (`shX/shY 6`, alpha 0.25), gorny rant 1–2 px. Swiadomie NIE: heat-haze,
god rays, cieply filtr, bloom, ADD/SCREEN na pelnym ekranie.

## 2. Warstwy gramatyki 1–11+P
| # | Warstwa | Decyzja | Stan |
|---|---------|---------|------|
| 1 | Border | `JunkyardBorder` — plot z blachy falistej, 2 kafle 240x48 w `TilingSprite` (0.1 MB), kolizja 4 AABB jak Sandstorm | J1 |
| 2 | Grunt | `buildJunkyardTexture` 3000x3000 (34 MB, jednowpisowy cache): ziemia + grys + pasy asfaltu (ring + 4 promienie) + betonowy apron prasy + plamy oleju + slady opon + 40 kolpakow-decali | J1 |
| 3 | Landmark | **Wielka Prasa** (centrum, `GreatPress.ts`): loze 360x240 PASSABLE, 4 tloki solid; cykl idle 12 s / telegraf 3,5–2,5 s (wg trudnosci) / huk 0,3 s / podnoszenie 2,7 s na `simNowMs`; wrog zmiazdzony (bez punktow, dropy zostaja), boss 15% + stun 2 s z sufitem 45%, gracz 45% + odrzut poza loze; srubki/nakretki/pyl/shake; SFX MP3 () | **J3 DZIALA** |
| 4 | Solid | 8 stosow wrakow (`WreckStack`, 2–4 pietra), sciany opon (`TireWall`), 2 kontenery, biuro (`ScrapOffice`), 14 kupek (`ScrapPile`), wieza dzwigu, kruszarka, sciany myjni | J1 |
| 5 | Fillery/niszczalne | kostki z prasy (pchane jak bele, maks. 6) i zrzucone wraki (3 trafienia) | J3/J4 |
| 6 | Strefy | Myjnia (tunel 420x200), 2 labirynty opon (wnetrze 340x340), 2 kontenery (jedno wejscie od S) = stealth na istniejacym systemie `isPointInside` + petla `players[]` | J2 |
| 7 | Pady | 3 medi + 2 energia (standardowe z poswiata jak Agro v2) + **Pulpit dzwigu** (stoj 1.5 s) | J1 / J4 |
| 8 | Ambient | blyski chromu (maks. 6, ambientRng), kurz 8–12, golebie, pies Srubek, kot | J6 |
| 9 | Patrol/gwiazda | **Dzwig** (`Crane.ts`, J4 DZIALA): cykl ~17 s na simNowMs (idle 9 s wg trudnosci → obrot do stosu → magnes + CLANK → przeniesienie → telegraf 2,4–1,5 s: czerwony przerywany okrag + kurczacy sie cien + pipanie → zrzut: AoE r=100, wrog 250, gracz 25% HP, pyl, srubki, shake); zrzucony wrak = `DroppedWreck` (3 trafienia, maks. 6, najstarszy sie rozpada; stojacy na sladzie wypychani); **Pulpit dzwigu** (stoj 1,5 s, cooldown 20 s) → nastepny zrzut w najwieksze skupisko (boss ×3, remisy worldRng); 5 SFX MP3; **Tasma + Kruszarka**, laweta (wzor Caravan, trasa zweryfikowana V6) | **J4 DZIALA** / J5 / J6 |
| P | Zdarzenia | `JunkyardEventDirector` (worldRng, krok logiki): Lawina kolpakow, Wyprzedaz czesci | J6 |
| 10 | Scenariusz | POMINIETE (KTB) | — |
| 11 | transientPolicy | `dynamicColliders: true` (zrzucone wraki, kostki), `enemyPositionMutation: true` (tasma przesuwa) | J4/J5 |

## 3. Jezyk ostrzezen (wspolny dla WSZYSTKICH maszyn)
pasy zolto-czarne = „tu cos spadnie” → rosnacy cien = „kiedy” → czerwony kogut = „za chwile” → uderzenie.
Raz nauczony dziala na calej mapie. Telegraf prasy: Latwy 3.5 s, Koszmar 2.5 s.

## 4. Layout (FROZEN, TOP-LEFT) — `JUNKYARD_LAYOUT`
Prasa (1320,1380) 360x240; stosy 200x140: (1000,1000) (1800,1000) (1000,1860) (1800,1860) (200,1980) (2560,1760)
(2600,620) (1000,2560); dzwig (1440,440) 120x120, ramie 520, 5 zweryfikowanych punktow zrzutu; tasma (1900,1440)
700x120 + kruszarka (2600,1400) 160x200; myjnia (480,1400) 420x200 + sciany 40 px; labirynty NW (380,380) i SE
(2180,2180) 440x440 (sciany 50, 2 wejscia); kontenery (2200,400) (2500,400) 180x100; biuro (640,2380) 220x140;
pady medi (420,1120) (2540,1120) (1500,2200), energia (420,2300) (1900,2300), pulpit (1220,560);
start gracza (1500,2600) (strefa 240 px wolna + wachlarz tutorialu); laweta: ring 140/2860.

## 5. Budzet mobile (pomiar `?diag=1`, desktop 1366x768, J1)
Tekstury **73.9 MB** (REV 2 Canvas 2D; stosy pieczone w res 1.5) (Mars 44.4, Agro v2 62.0; bramka ≤ 82). 0 utrat kontekstu. Bake'i `jy_*` przezywaja
mecze na tej samej mapie (`keepPrefix`). Dzwignie: stosy 4→3 pietra, mniej decali gruntu, piana 24→12.
Bramka flipu: A54 p50 ≥ 55 FPS, < 45 FPS ≤ 10%, tekstury ≤ 82 MB, 0 utrat kontekstu / 5 meczow.

## 6. COOP/MP
Cykle maszyn i zdarzenia na `simNowMs()` / krokach logiki + `worldRng`; liczby w `src/config/junkyardRules.ts`
z `JUNKYARD_RULESET_ID`; nowe `DamageSource` kinds press/crane_drop/crusher/hubcap; stan maszyn = symulacja,
piana/blyski/kurz = wizual; maszyny za `COOP_HAZARDS_ENABLED`; pchanie kostek tylko solo.

## 7. Otwarte / z playtestu
- **REV 2 (playtest mobile 2026-10-08, uwagi Mariusza):** (a) myjnia za duza -> 300x150; (b) kupki zlomu USUNIETE (czytaly sie jak kratki, blokowaly ruch); (c) „obiekty plaskie, bez gradientu, cienie mocne kwadratowe” -> caly bake propow przeniesiony na Canvas 2D (`junkyardBake.ts`: `block/cylinder/softShadow/hazard`, gradienty NW->SE, cienie rozmyte, AO); (d) stosy wrakow REV 3: 80x56 (skala czolgu), klaster 3 stosow w slocie, 4 typy aut (sedan/van/garbus/pickup) x 3 warianty zniszczenia jako neutralne tekstury tintowane, bryla = korpus + kabina, pogniecione blachy, spekane/brak szyb, otwarta maska — CZEKA NA WERDYKT. Zasada od teraz: juice i efekt wizualny projektowane OD RAZU, nie w polishu.
- Muzyka: pula Marsa (decyzja Mariusza 2026-10-08) do czasu wlasnego utworu. SFX mapy = pliki MP3 renderowane `tools/render-junkyard-sfx.mjs` + ffmpeg (nie synteza w locie).
- Bonus „BOSS ZGNIECIONY” = decyzja o `score_version` przy flipie.
