# LESSONS LEARNED — blizny w kodzie 5 map (K1.1) = GATE nowego propsa

> Status: **K1.1** (re-audyt 2026-08-24 vs v0.119.0; pierwotnie K1 @ v0.101.0).
> Re-audyt: wszystkie lekcje A-I AKTUALNE; 6 kotwic main.ts przesuniete
> (poprawione ponizej, `src/maps/**` nietkniete); NOWE lekcje z warstwy mocy
> F7b oznaczone (K1.1). Wydobyte ARCHEOLOGIA KODU (komentarze
> FIX/BUG/fix2/feedback/HITBOX/mobile-crisp/v0.x/decyzja) ze wszystkich 5 map,
> propsow, encji niszczalnych i main.ts — nie z pamieci.
>
> UZYCIE JAKO GATE: przed dostarczeniem KAZDEGO nowego propsa/mapy przejdz
> liste i odhacz kazda regule (albo wpisz "n/d + powod"). Format lekcji:
> **[ ] REGULA** — objaw -> przyczyna (zrodlo).
>
> Lekcje L1-L8 z destylatu: WSZYSTKIE potwierdzone w kodzie; tu wchlonieta
> ich tresc + ~35 nowych.

---

## A. RENDER / Z-INDEX / PARALLAKSA

- [ ] **A1 (=L1). Warstwa pogody/overlay: zIndex PONAD caly zakres Y-sort (1e6).**
  Polowa mapy przykrywala snieg -> swiat Y-sortuje `zIndex=y+h` do ~3100,
  pogoda na 2000 byla w srodku zakresu (`Blizzard.ts:53-55`).
- [ ] **A2. Jedno zrodlo sortowania: `sortableChildren=false` + JEDEN manualny
  sort/klatke.** Migotanie z-order skrzyn/budynkow -> PIXI auto-sortowal na
  klatkach nieparzystych, manual na parzystych = dwie kolejnosci (`main.ts:470-475`).
- [ ] **A3. Tie-break zIndex `+ x*1e-4` przy rownych y+h.** Drganie kolejnosci
  frame-to-frame -> unstable sort PIXI dla rownych zIndex (`CityMap.ts:239-247`).
- [ ] **A4. 2.5D budynki: pasma zIndex (sciany <5000, dach/attachmenty >5000).**
  "Dalszy ciemny" mur zaslanial blizszy billboard -> jedno pasmo mieszalo
  sciany i dodatki dachowe (`NeonBillboard.ts:148-154`).
- [ ] **A5. Plaskie powierzchnie przejezdne = STALE niskie pasma zIndex, nie Y-sort.**
  Czolg renderowal sie "pod" kamykiem/mostem -> dekor gruntu w Y-sort
  (`Rock.ts:71-74` male skaly z=4; `Bridge.ts:53-55` rzeka 50 < most 60 << aktorzy).
- [ ] **A6. Jeden budynek = jeden atomic Graphics (sciany+dach razem).**
  Puste/znikajace sciany -> batcher PIXI 7 gubil poligony przy 8+ przejsciach
  stanu na 2 gfx (`CityMap.ts:183-200`, rollback fix #10).
- [ ] **A7. Uszczelniaj szwy AA: outline 0.5px TYM SAMYM kolorem co fill;
  sasiadujace poligony zachodza o epsilon; pelny backdrop za wieloczesciowa fasada.**
  "Dziury"/przeswit trawy miedzy scianami -> subpikselowe szczeliny AA i luki
  miedzy czesciami (`CityMap.ts:269-281` fix #11; `ArctowskiStation.ts:272`
  `corn*0.999`; `Cowshed.ts:316-318`).
- [ ] **A8. Walec 2.5D: rozdziel baze na tyl (z=0) + "przednia warge" (z=4).**
  Plaski rect szkla ucinal elipse podstawy idealna linia = koniec iluzji 2.5D
  (`SludgeReactor.ts:162-164`).
- [ ] **A9. Cien mieszka NA ZIEMI, nigdy w kontenerze parallaksy; lewitujace =
  cien odsprzezony.** Cien dachu plywal z parallaksa -> przeniesiony do gruntu
  (`NeonOasisStation.ts:317,410`); iluzja floatu = przerwa zlom/cien
  (`AntiGravScrap.ts:14-15`, `SkyTraffic.ts:253-263`).
- [ ] **A10. Parallaksa: jeden hF na klaster; attachment replikuje wzor hosta;
  statycznych detali nie przypinac do przesuwanej geometrii.** Dachy "rozjezdzaly
  sie" (rozne hF, `CityMap.ts:126-143` fix #15); billboard "poza budynkiem"
  (`NeonBillboard.ts:283-288`); wejscie piramidy "uciekalo" (`Pyramid.ts:7-13`).
- [ ] **A11. Statyczne podpory + plywajaca bryla: dynamiczne nogi (stopa static,
  glowa offset) ALBO parallaksa <=0.015 (rozjazd subpikselowy).**
  (`ArctowskiStation.ts:102-125`; `NeonOasisStation.ts:60-62`).
- [ ] **A12. PIXI.mask kapryzny na kontenerach z sortableChildren — inner-shadow
  przez evenodd double-path.** (`SludgePool.ts:343-353`).
- [ ] **A13. Dach rysowany z widoku 3/4 z gory, nie z boku.** Zabkowany dach
  "z boku" czytal sie zle w top-down (`OldFactory.ts:282-285`).
- [ ] **A14. Zadnych wielkich wedrujacych animacji na granicy areny.** Przelatujacy
  scanline "razil podczas grania" -> border anim tylko lokalny puls
  (`CyberpunkBorder.ts:19`, fix #22).
- [ ] **A15 (K1.1). Pasmo 1e6 = przestrzen WSPOLDZIELONA: nowy wpis bierze wolny
  sub-slot albo tie-break `x*1e-4`.** LATENT BUG dzis w kodzie: Blizzard,
  cien nalotu (`PowerSystem.ts:1307`) i kolumna lasera (:1554) siedza na ROWNYM
  1e6 bez tie-breaka = niestabilny sort (patrz A3); kaczka 1e6-1, paczki 1e6-2,
  disco 1e6-3 juz robia to dobrze. Pelna tabela lokatorow: ART_TOKENS T15.

## B. KOLIZJA / HITBOX

- [ ] **B1 (=L3). ICollidable x/y = TOP-LEFT; konstruktor z center PRZELICZA;
  parallaksa trzyma osobne visualX/Y.** Kolizja dzialala tylko od poludnia ->
  x/y trzymane jako center (`Pyramid.ts:7-13` HITBOX FIX).
- [ ] **B2 (=L5). Hitbox duzych bryl = wizual + padding kompensujacy czolg:
  landmark kwadratowy +100, okragla skala +60, budynki/skrzynie pad 8-10.**
  Czolg wjezdzal ~30px w piramide -> wizual czolgu ~100px vs promien kolizji 20
  (`Pyramid.ts:58-63` v0.14.4; matematyka pad: `Henhouse.ts:1088-1090`).
- [ ] **B3. Glebia iso W hitboxie: w+RIGHT_DEPTH; dojrzala forma = 3 boxy
  (rdzen+pad, parallelogram E, pas overhangu N).** "Moge wjechac w dom" ->
  hitbox nie obejmowal wystajacej sciany iso (`BarnBuilding.ts:131-136`;
  `Cowshed.ts:2049-2052`).
- [ ] **B4. Lewitacja jest kosmetyczna: hitbox = rzut na grunt.** (decyzja
  balansowa, `AntiGravScrap.ts:25-28`).
- [ ] **B5. Hitbox == narysowany ksztalt (strefy i pady tez).** Aktywacja pada
  kolem r=60 w kwadracie 100x100 -> AABB pelnego footprintu
  (`CloverMediPad.ts:497-498`; OTWARTE: StumpPowerPad nadal ma kolo r=50;
  WheatField z rozjazdem elipsa/wizual zostal wycofany).
- [ ] **B6. Woda wariant A: buildings TAK, solidBuildings NIE, isPointInside ->
  spawnBlocked. Woda wariant B (fosa): passable slow + wyciecie mostu.**
  (`RuinsLake.ts:7-9`; `main.ts:1768-1773`; `RuinsFosa.ts:82-91`).
- [ ] **B7. Dziury w kolizji: clearance = pol-propsa + promien gracza +
  pol-segmentu; dla obroconych propsow DLUZSZY wymiar.** Gracz blokowany NA
  moscie -> skip liczony z deckWidth zamiast deckLength (`RiverNile.ts:250-253`).
- [ ] **B8. KAZDA strefa nie-do-jazdy rejestruje sie w spawnBlocked.**
  "Wrogowie na skalach/rzekach" (`main.ts:566-580`).
- [ ] **B9. Punkty spawnu NPC poza wszystkimi AABB.** Woz policyjny utykal w
  scianie -> helipad w SRODKU hitboxa stacji; spawn ponizej y+h+35
  (`main.ts:3039-3042`, v0.58.0).
- [ ] **B10. Czlonkostwo w kolizji decyduje miejsce spawnu (main.ts/manifest),
  nie klasa; props niekolizyjny WCIAZ potrzebuje drivera update.**
  (`AirTaxiStation.ts:17-19`).
- [ ] **B11. Wskazowki glebi nie moga zmieniac hitboxa** ("BEZ DEPTH lamiacego
  hitbox", `OldFactory.ts:239-241`).
- [ ] **B12. Prekomputuj tablice kolizji; zero spreadow per-frame.** Skoki GC =
  szarpanie na mobile -> `[...buildings, ...barriers]` alokowal 40+ elementow
  co klatke (`main.ts:312-315`).
- [ ] **B13 (K1.1). Alias vs kopia tablic kolizji: TEST TOZSAMOSCI
  (`arr !== buildings`) przed kazdym push/splice do "drugiej" tablicy.**
  `ctfEnemyBuildings` to KOPIA tylko w CTF; w pozostalych scenariuszach
  `else` ALIASUJE buildings (`main.ts:2037-2039`) — slepy push zdublowalby
  collider. Wzorzec-kanon: guard Mura `main.ts:1897-1898` + symetryczny
  splice w remove() :1899-1902.
- [ ] **B14 (K1.1). Budzet obiektow dynamicznych = LACZNY na aktywacje, nie
  "rownoczesny"; walidacja-null NIE zuzywa ladunku.** Miny max 14
  (`powers.ts:161-163`), segmenty Mura max 20 (:177); egzekwowanie przy
  spawnie `PowerSystem.ts:1060/:1163/:1230`; oplata dopiero po udanym
  placement (charge-on-success :1221-1224). Kazdy przyszly spawner
  (wieze, bariery, pulapki map) kopiuje ten kontrakt.

## C. MOBILE-CRISP / BAKE

- [ ] **C1 (=L4). Mobile ma antialias OFF: ukosy/luki = bake Canvas 2D -> Sprite;
  RES 3-4 dla malych animowanych; osiowe prostokaty moga zostac Graphics;
  cienkie animowane kreski zostaja Graphics.** Pikseloza zywych wektorow
  (`PenguinColony.ts:21-24`, `RuinsLake.ts:10-15`, `RuinBlock.ts:7-13`,
  `RuinsHangar.ts:15-22`, `HoverRepairPad.ts:13-16`).
- [ ] **C2. Cache tekstur: singleton dla stalej geometrii, Map<seed> dla
  wariantow — "zero rebake / zero leaku przy restarcie meczu".**
  Memory leak gradientow per-instancja (`FarmBuildingTextures.ts:6-8`;
  `RuinsBush.ts:16-18`).
- [ ] **C3. Konwersja live-draw -> bake ZACHOWUJE kolejnosc wywolan seedowanego
  RNG; kazdy bake dokumentuje kontrakt translate.** Inaczej layout sie
  przesuwa (`IceHole.ts:182`; `RuinsLake.ts:173`).
- [ ] **C4. Skalujesz baked art = skalujesz canvas.** Silk kukurydzy ucinany ->
  wieksze rosliny, stary rozmiar canvasu (`CornField.ts:374-383`, v0.27.6).
- [ ] **C5. Drogie blendy ('lighter') tylko W BAKE'U; runtime zero.**
  (`ArcticMap.ts:109`, `Igloo.ts:112`).
- [ ] **C6. Bake nie odswieza sie przez HMR — re-entry mapy, nie "bug".**
- [ ] **C7. Teksty budowane w konstruktorze lapia jezyk z momentu utworzenia —
  OK tylko bo jezyk ustawiany przed gra.** (`SludgeReactor.ts:42-45`).
- [ ] **C8. Warianty skalowane nearest-neighbor (`imageSmoothingEnabled=false`).**
  (`SugarcaneField.ts:500-510`).

## D. PARTICLES / CULLING / PERF / TIMING

- [ ] **D1 (=L2). Particle-field w viewport-space: wrap 4-STRONNY.** Jazda na
  W/S opro zniala viewport z platkow -> recykling tylko 2-stronny
  (`Blizzard.ts:138-141`).
- [ ] **D2. Culling latch: renderable przelaczane tylko przy ZMIANIE widocznosci;
  wyjatek dla obiektow niosacych symulacje.** (`CornField.ts:279-293`;
  `PastureField.ts:757-758` traktor kosi poza kadrem).
- [ ] **D3. Twarde capy particles + round-robin pool.** 525 particles = 17 FPS
  overdraw na mobile -> MAX_PARTICLES 200 (`Effects.ts:132,194-206`).
- [ ] **D4. Throttle spawnu FX licznikiem KLATEK (nie random, nie Date.now) =
  parytet 60/144Hz; animTime staly increment = klatko-niezalezna rotacja.**
  (`SludgePool.ts:366-384`; `OldFactory.ts:182-183`; ANTY-PRZYKLAD: Oasis
  `rippleTime += 1/60` — frame-rate dependent, `Oasis.ts:364`).
- [ ] **D5. Kamera plynie FLOATEM; snap tylko w screen-space.** Skokowe
  przewijanie swiata mimo gladkiej jazdy -> `~~` w world-space przy zoomie
  dawal kroki 2,3,3px. **KOREKTA K1.1 — stan faktyczny:** kod DZIS robi `~~`
  w world-space (`main.ts:2780-2784`), a komentarz nad nim twierdzi
  odwrotnie — komentarz przeczy kodowi. NIE "naprawiac" na slepo: rozstrzyga
  wylacznie pomiar plynnosci na A54 (patrz drift ledger).
- [ ] **D6. Props z guardem `if (!bullets) return` MUSI miec dedykowana petle —
  "inaczej zamarznie"; bez guardu animacja liczy sie 2x.** (`OldFactory.ts:170-177`,
  `AntiGravScrap.ts:489-495`; SludgeReactor = przodek bez guardu, do weryfikacji).
- [ ] **D7. Idle early-return dla bramkowanych (hidden = koszt ~0).**
  (`Blizzard.ts:105`, `IglooYeti` visible=false).
- [ ] **D8. Zadnego append-bez-konca do jednego Graphics; zadnych setek zywych
  Graphics; pooluj churn dymu/iskier.** (anty-wzorce: `PastureField` 600 zdziebel
  + mowedTrack; smoke bez poolingu w traktorach).
- [ ] **D9 (K1.1). System zabijajacy wrogow WEWNATRZ petli po wrogach = HEAD-GUARD
  `if (!enemy.active) { splice; continue; }` na poczatku iteracji, nie tylko
  tail-sweep.**
  Crash: `powerSystem.update` (`main.ts:3382`) zabija wroga mid-frame, a petla
  wrogow nizej dalej go update'owala — tail-sweep na :3567 byl ZA POZNO;
  fix = head-guard `main.ts:3397-3403` (v0.112). Kazda przyszla petla po
  encjach mutowanych przez inny system kopiuje ten guard.

## E. KONSTRUKTOR / INIT / TYPESCRIPT

- [ ] **E1 (=L6). WSZYSTKIE PIXI.Graphics inicjalizowane w PIERWSZYM bloku
  konstruktora, PRZED metodami drawX (takze wywolaniami krzyzowymi).**
  Crash: drawHead wolal drawMane zanim maneGfx istnial (`Horse.ts:208-209`,
  v0.41.8; konwencja powtorzona w 10+ plikach).
- [ ] **E2. Rotacja tresci z offsetem: pivot.set + position.set z TYM SAMYM
  offsetem.** "Grzywa lata" oderwana od szyi -> rotacja wokol (0,0)
  (`Horse.ts:211-214` v0.41.9; `DesertStormPad.ts:93-94`).
- [ ] **E3. Zero przemytu stanu przez `(this as any)`.** (anty-wzorce:
  `Stable.ts:655-669`, `PastureField.ts:413`, `Horse.ts:503`).
- [ ] **E4. Importuj wspolny ICollidable, nie deklaruj lokalnie.**
  (`CyberpunkBorder.ts:20-21`, fix #23).
- [ ] **E5. Callbacki krytyczne = WYMAGANY parametr konstruktora, nie wstrzykniecie
  po fakcie (`?.()` = cichy skip).** (`main.ts:1825-1829`; wzorzec-kanon K1.1:
  PowerSystem bierze callbacki jako WYMAGANE parametry z komentarzem "WYMAGANY
  parametr" `PowerSystem.ts:258-262,270-271`; martwy hook onCanCrushed wpinany
  do pustej tablicy `main.ts:1313-1320` — NADAL martwy w v0.119).
- [ ] **E6. WeakSet<Bullet> przeciw multi-triggerowi w tym samym ticku;
  flagi edge (wasNear*) przeciw multi-triggerowi progu.**
  (`SludgeReactor.ts:136-137,539`; `OldFactory.ts:872-874`).

## F. CZYTELNOSC (gate 375px / zoom 0.6)

- [ ] **F1. Zarezerwowany jezyk kolorow: cyjan w polu gry = freeze/stealth —
  nie uzywac dekoracyjnie.** Zlamane 3x zanim stalo sie regula (`IceCube.ts:18-19`).
- [ ] **F2. Jeden symbol = jedna mechanika; ikona pada = jezyk pickupa, ale
  stacja != pickup.** Serce na padzie mylilo sie z pickupem serca -> gear
  (`CloverMediPad.ts:359-361`; spojnosc ikon: `DesertHeartPad.ts:221-222`).
- [ ] **F3. Kontrast vs albedo tla: bialy yeti na lodzie niewidoczny, biale
  platki znikaly, granatowa woda = "void", kamien zlewal sie z piaskiem.**
  (`IglooYeti.ts:44,50`; `Blizzard.ts:172`; `IceHole.ts:24-25`;
  `FortifiedRuinsMap.ts:121-124` "kamien-widmo").
- [ ] **F4. Zadnych ciemnych plam tonalnych pod strefami aktywnosci NPC ani
  "fake shadow" pod budynkami.** Konie "za mgla" (`Paddock.ts:160-161`);
  dirt patches jak zepsuty cien (`CountryHouse.ts:267-268`).
- [ ] **F5. Strefa niebezpieczna = pulsujacy ostrzegawczy rim.** (`Quicksand.ts`
  warningRim; `RuinsFosa.ts:96-101`).
- [ ] **F6. Malo a WYRAZNIE: 3 czytelne kryjowki > 15 slabych; skala elementow
  pod zoom 0.6 (ptaki +50%, ikony +50-100%, yeti +100%).**
  (`FortifiedRuinsMap.ts:177-183` F4.1; `WaterLife.ts:592`; `IglooYeti.ts:28`).
- [ ] **F7 (=L7). Border = zadymka, nie sciana: outer 30 / inner 55 /
  COLLISION_INNER_EDGE 40 (margines wizualny ~10px); pierwsze liczby intensywnosci
  DZIEL NA POL.** Sandstorm -70% szerokosci po feedbacku; GlacialBorder T=130
  zjadal playfield; RaspberryBush "zbyt masywne" -> koncept tonalny
  (`SandstormBorder.ts:7-8,98`; `ArcticBorder.ts:8-9`; `TropicalBorder.ts:15-17`).
- [ ] **F8. Boss/zagrozenie telegrafuje: ring celu OD startu pocisku, cel =
  pozycja obecna (bez predykcji), fairness-gate zasiegu prowokacji.**
  (`IglooYeti.ts:195,242,292`).
- [ ] **F9. Latajace/stojace propsy maja kontakt z gruntem (cien + linia
  kontaktu + osadzenie w trawie).** "Siano lewituje", drzwi wisialy w powietrzu
  (`BarnBuilding.ts:1072-1137`; `CountryHouse.ts:722-724`; `RuinBlock.ts:215`).
- [ ] **F10. Granica kolizji widoczna ("tu jest sciana" — linia na krawedzi
  bordera).** (`CyberpunkBorder.ts:166-168`).
- [ ] **F11. Rzeczy, ktore maja ladowac na sciezce, renderuj i pozycjonuj
  z TEJ SAMEJ reprezentacji (polilinia).** Mosty nie trafialy w wode ->
  bezier-wizual vs analityczne pozycje (`RiverNile.ts:7-12`).

## G. SENSORYKA

- [ ] **G1 (=T12). Pierwsza amplituda animacji jest ~2x za subtelna — planuj pas
  wzmocnienia; po naprawie pivota strojenie POWTORZ.** (Barn "2x amplitudy";
  `Horse.ts:647-665` wzmocnienia, potem grzywa 0.12->0.04 po fix pivota).
- [ ] **G2. Cisza przy interakcji = bug: nawet najcichszy filler reaguje na
  dotyk (alarm diody aut).** (`Parking.ts:306-330`).
- [ ] **G3. Flash emitera zsynchronizowany ze zdarzeniem emisji.**
  (`OldFactory.ts:522-523,826` rozblysk komina przy wyrzucie dymu).
- [ ] **G4. Idle-FX cooldowny z jitterem — nie metronomicznie.**
  (`SludgeReactor.ts:919-922`).
- [ ] **G5. Wirtualny element (hologram) ma fizyczna kotwice reakcji
  (micro-iskry projektora) — przyczynowosc czytelna.** (`HoloTurbine.ts:466-468`).
- [ ] **G6. Slownik animacji per material: organiczne squash&stretch, mechaniczne
  rotacja/puls; side-view NPC flip zamiast rotacji + pre-flip przy wyborze celu
  + histereza 5px + min X-delta celu.** ("To machinery", `CloverMediPad.ts:557-558`;
  moonwalk konia `Horse.ts:626-633,801-811`; wielblad `Caravan.ts:435-437`).
- [ ] **G7 (K1.1). Powtarzalny tick obrazen != eksplozja: flaga `quiet` na
  aoeExplode.** Miny/Nalot tykaly PELNYM zestawem flash+shake+SFX co tick =
  sensoryczny spam; fix = parametr quiet (`PowerSystem.ts:133`, konsument
  `main.ts:1838-1848`): tick cichy (:1512/:1587), JEDNORAZOWE zdarzenie
  glosne (:928/:1038/:1148/:1797). Sensoryka jest dla ZDARZEN, nie dla tickow.
- [ ] **G8 (K1.1). Howler: rate/volume ustawiane globalnie na sprite'cie
  przenosza sie na WSZYSTKIE instancje — jitter anti-fatigue MUSI byc
  per-sound-id.** (`AudioSys.ts:322-341`, per-id :336-338; zastosowane
  w playShoot/playHit :487/:491 — TYLKO tam).

## H. KLIMAT / CONTENT-SAFETY (target 9-12 + store)

- [ ] **H1 (=L8). Efekt srodowiskowy = KLIMAT, nie kara; zero pelnoekranowej
  mgly/winiety ograniczajacej widocznosc; drogi efekt za bramka czasowa.**
  (`Blizzard.ts:5-11`).
- [ ] **H2. Rating store: stwory fantastyczne zamiast realnych grup etnicznych;
  sniezki zamiast realistycznej broni (molotov).** (`IglooYeti.ts:7-9`).
- [ ] **H3. Flicker/strobo: limit WCAG (nasz wzor: 1 epizod ~11s, max 100ms).**
  (`NeonBillboard.ts:32-36`).
- [ ] **H4. Zero anachronizmow (cyberpunkowe wyladowania na egipskim padzie —
  usuniete).** (`DesertStormPad.ts:6-12`).
- [ ] **H5. ADD = swiatlo punktowe; nigdy area-wash ("god-rays praly do bieli");
  mokre/materia = normal blend; dekoracje na ciemnej mapie alpha <=0.10;
  SCREEN-blend zakazany.** (`GroundClutter.ts:106,119-120`;
  `NeonOasisStation.ts:823-825`; `RuinsMediPad.ts:12-14`).

## I. PROCES / DOSTARCZANIE

- [ ] **I1 (=T11). Layout = zamrozone dane + math-verify AABB offline PRZED kodem;
  wynik i clearance w komentarzu; scatter przeliczony przeciw WSZYSTKIM AABB.**
  (`ArcticMap.ts:370-376`; `FortifiedRuinsMap.ts:4-25`; `GroundClutter.ts:8-11`;
  `Windmill.ts:8-10` — swept-radius smigiel!).
- [ ] **I2. Wiring petli update jest CZESCIA kontraktu propsa (tabela dispatch
  w MAP_GRAMMAR §4) — props bez petli "zamarza" cicho.**
- [ ] **I3. Niszczalne i FX-zalezne konstruowane PO effects/audio.**
  (effects `main.ts:1809`; Crates :1920-1929, IceCubes :1934-1943).
- [ ] **I4. i18n: literalne t('key') — zadnych hardcoded stringow graczo-widocznych.**
  (dlug: `CloverMediPad.ts:146` 'NAPRAWA', `RuinsMediPad.ts:76` 'NAPRAWIAM...',
  `IFarmField.ts:26-29` stealth labels).
- [ ] **I5. Strojenie stalych = aktualizacja komentarzy (drift ledger ponizej);
  feedback z jednego propsa staje sie regula RODZINY (Henhouse cytuje lekcje
  Barna).** (`Henhouse.ts:185`).
- [ ] **I6. Playtest Michala na realnym telefonie = obowiazkowa sekcja Review
  mapy (zrodlo prawdy mobile != czytanie kodu).**
- [ ] **I7 (K1.1). Asset generowany skryptem = generator TRACKOWANY w repo,
  a asset nazywa swoj generator.** 19 plikow SFX w `public/sfx/` powstalo ze
  skryptow w scratchpadzie, ktory juz nie istnieje — regeneracja/strojenie
  niemozliwe. Konwencja docelowa jak `ctf_f1_aabb.js` (skrypt w repo +
  odniesienie w komentarzu przy wyniku).

---

## Niespojnosci do ujednolicenia (kit prostuje u zrodla — NIE naprawiac w K1)

1. **RNG x5**: mulberry32 / LCG-glibc / LCG-9301 / prime-hash / Math.random
   (w tym NIEdeterministyczne bake'y gruntu Desert i Tropics). Kit: U1.
2. **Border x2 architektury**: 30+55 (standard, 3 mapy + wariant zero-cost Ruins)
   vs Cyberpunk 20+70+pylony (legacy).
3. **Parallaksa x3 wzory + znaki**: Pyramid (+, apex), Sphinx (-, layer), Station
   (+, body); tie-break x*1e-4 tylko City/Arctic. Kit: K2 jeden wzor.
4. **Rownania stref**: elipsa (Desert) vs rect (nowsze). Kit: K3, rect domyslny.
5. **Aktywacja padow**: AABB (Clover po fixie) vs kolo w kwadracie (Stump — OTWARTE).
6. **Stable**: `getCollisionRect()` zamiast rodziny `getExtraCollidables()`.
7. **Timing**: Date.now() vs delta vs liczniki klatek vs `+=1/60` (Oasis).
8. **Proto-kit nieadoptowany**: FarmBuildingTextures (Barn ma duplikat);
   helpery dachow w 4 kopiach; PathSpine zduplikowany (RiverNile/WaterLife).
9. **Konwencje wspolrzednych layoutow**: center vs top-left per eksport —
   wymagana deklaracja w komentarzu.

## Drift ledger (komentarz != kod — poprawic przy najblizszym dotknieciu pliku)

Re-audyt K1.1 (2026-08-24): WSZYSTKIE pozycje ponizej potwierdzone jako NADAL
niepoprawione w v0.119.0.

- `SludgeReactor.ts:263-268` halo center: komentarz 0.42/0.50, kod `H*1`.
- `Windmill.ts:138` "nad player zIndex ~3000 max" vs blades zIndex=1200.
- `Blizzard.ts` header "6 smug" vs `STREAK_COUNT=9`; `RuinsFosa.ts` "14 krech"
  vs `RIPPLE_COUNT=24`; `ArcticMap.ts:374` "41 kostek" vs 122 wpisy.
- `CornField.ts:216-219` komentarz "+1000" vs kod `floor(py)`;
  `Paddock.ts:12` "4 rects" vs 5.
- `OldFactory.ts` header "brak dedykowanej petli" vs guard wymagajacy petli
  (doc przy update() jest autorytatywny).
- Martwy kod: porch CountryHouse, sparrow Windmill, `makeStaticCollidable`
  nieuzywany, `ACTIVATE_RANGE` Clover, `wasActive` Stump, podwojne przypisanie
  legFrom w SkyTraffic, hook onCanCrushed na pustej tablicy (main.ts:1313-1320).

Nowe pozycje K1.1 (utajone bugi — NIE ruszane w sesji docs, decyzja osobno):

- **Kamera `~~` world-space** (`main.ts:2780-2784`): komentarz twierdzi
  "screen-space snap", kod robi world-space floor — sprzecznosc wewnetrzna.
  Playtest-sensitive: rozstrzygnac POMIAREM na A54, nie czytaniem kodu (D5).
- **Pasmo 1e6 bez tie-breaka** (`Blizzard` x `PowerSystem.ts:1307/:1554`):
  trzy lokatory na rownym zIndex = niestabilny sort (A15/T15). Fix = 3 linie
  sub-slotow, bezpieczny — do osobnego commita kodu.
