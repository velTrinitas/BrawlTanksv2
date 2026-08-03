# RULE: Implementacja Super Mocy (PROG-F7)

> Umiesc ten plik w repo jako `.claude/rules/super-powers.md`.
> Prototyp referencyjny: `docs/prototypes/BT_SuperPowers_Sim_v6.html`.

## CZYM JEST, A CZYM NIE JEST SYMULATOR

Plik `BT_SuperPowers_Sim_v6.html` to **spec FEELINGU i WYGLADU**, NIE wzorzec architektury.

- UZYWAJ go jako zrodla: logiki kazdej mocy, wartosci (cooldown, duration, promienie, predkosci), efektow wizualnych, kolorow.
- NIE kopiuj jego struktury: to Canvas 2D + globalne tablice + `requestAnimationFrame`. Gra to **PixiJS v7.4.3 + TypeScript strict + GameSession**. Przepisanie Canvas 1:1 do gry jest BLEDEM.

## ZASADY PROJEKTU (nienaruszalne)

1. **Registry pattern, NIE if-chain.** Kazda moc to `PowerDef { id, iconId, i18nKey, cooldown, duration, onActivate, onTick?, onEnd? }` w rejestrze. PowerSystem wykonuje definicje. ZERO `if(selectedPower===0/1/2)`.
2. **All programmatic art.** Zero external assetow (Architectural Constitution §10). Sprite'y mocy (Wieza, Widmo, Kaczka, Paczkomat, Babcia) przez **2.5D baker** (jak czolgi) — baked raz, NIE per-frame PIXI.Graphics (lekcja F4.1).
3. **TypeScript strict.** Wszystkie PIXI Graphics members inicjalizowane w pierwszym bloku konstruktora, PRZED metodami renderujacymi.
4. **i18n.** Wszystkie player-facing stringi przez `t('key')` (literal, nie dynamiczny). PL z diakrytykami (Titan One), EN bez diakrytykow. Kod i komentarze EN.
5. **Mobile-first.** Kazda moc ma policzony koszt (S/A/B/C). Twarde limity particles (Rockets/Nalot). Zero screen-blend, god-rays, wielkich glow. HUD: loadout = 2 przyciski + opcjonalny slot 🎲 (weryfikacja @375px przed dostarczeniem).
6. **Defensywny try/catch OK, ale ZAWSZE log `error.stack` + kontekst encji.** Nigdy silent skip. Uwaga na `?.()` — null callback = cichy skip (diagnoza: console.log na kazdym ogniwie).

## PRE-TASKI (zrobic PRZED mocami, w PROG-F1)

Te trzy rzeczy dotykaja kodu gry i sa wspoldzielone — zrobic RAZ, z pelnym logowaniem:

1. **`targetRef` abstrakcja w AI wrogow.** Dzis wrogowie celuja w referencje gracza. Widmo / Przejecie / Babcia wymagaja przekierowania celu (wabik / swoi / ucieczka). Dotyka WSZYSTKICH typow wrogow — osobny commit + test.
2. **Rozroznienie zrodla obrazen w Physics.** Miny / taran / questy potrzebuja wiedziec "kto zadal obrazenia". Wspoldzielone z metrykami questowymi (§17.7).
3. **Owner-ref pociskow wroga.** Ping-Pong odsyla pocisk do NADAWCY — pocisk musi znac swoje zrodlo. Gdy nadawca martwy: dumb-fire (leci prosto), ZERO retargetu.

## KOLEJNOSC PRAC

1. Refactor PowerSystem na **registry + 2 sloty** przy 3 OBECNYCH mocach (Aura/Bomba/Freeze). Czysty refactor, testowalny 1:1 ze stanem legacy.
2. Adopcja mocy scenariuszowych: **Wieza** (z CTF/Castle), **Naprawa** (z Castle) do globalnej puli.
3. Nowe moce POJEDYNCZO — kazda osobny commit + test na A54 (Samsung SM-A546B). Kolejnosc wg harmonogramu odblokowan Szlaku.

## WARTOSCI STARTOWE

Wszystkie liczby w symulatorze (cd, duration, promienie, %) to **propozycje do tuningu** — cooldowny w symulatorze SA SKROCONE do demo (8–20s). Produkcyjne wartosci ustalic playtestem. Wszystkie stale w `src/config/progression.ts` (jeden plik = jeden tuning pass).

## REAL SOURCE FIRST (krytyczne)

PRZED pisaniem jakiegokolwiek kodu wczytaj AKTUALNE pliki (nie zgaduj sygnatur — to juz powodowalo krytyczne bugi: `scoreValue` mismatch, zly `updateProfile`):
- `src/systems/PowerSystem.ts` (lub aktualna sciezka) — jak dzis dziala aktywacja/cooldown/wybor
- `src/core/GameSession.ts` — stan runtime, liczniki
- `src/main.ts` — petla, punkt wpiecia (targeted edits, plik 1400+ linii)
- `src/systems/Physics.ts` — kolizje, zrodlo obrazen
- Enemy AI (aktualna sciezka) — jak wrogowie celuja (dla targetRef)

## ZALEZNOSCI

- **CURRENT_SCORE_VERSION bump** razem z refactorem HP/DMG ×100 (loadout zmienia sufit wynikow — leaderboard nie moze mieszac formul). Jedna migracja, nie dwie.
- **Macierz `allowedPowers` per scenariusz** (config): KTB pelny loadout; CTF Faza 1 zawezona; Castle mapuje istniejacy roster.
- **`funMode` boolean w tabeli sessions** od pierwszego dnia (slot 🎲 zmienia sufit wyniku — dane do decyzji o rozdzieleniu leaderboardu po 2 tyg).

## TIERY (dystrybucja, nie wszystko naraz)

- **Tier 1 (10 mocy):** loadout, odblokowania na Szlaku Trofeow. TO JEST PROG-F7 CORE.
- **Tier 2 (4 premium):** Nalot / Czarna Dziura / Laser / Tytan — dostarczane transzami sezonowymi, POZA tym effortem.
- **Tier 3 (6 szalonych):** slot 🎲 z toggle "Szalone Moce". Pula losowania rosnie z eventow. Dostarczane osobno.

Nie implementuj Tier 2/3 w PROG-F7 core. Najpierw dzialajacy loadout Tier 1.
