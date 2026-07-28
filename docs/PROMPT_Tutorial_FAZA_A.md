# Tutorial / Przewodnik dla nowych graczy — wizja + FAZA A (odtworzone z sesji 63398140, 2026-07-28)

> Trwały zapis ustaleń (sesja urwała się przed zapisaniem). Źródło prawdy dla implementacji.
> Zasada z Konstytucji: PLAN + math (AABB) przed kodem; overlay/HUD @375px landscape = twardy gate.

## Cel produktowy
Nowy gracz (9–12 lat) po wyborze czołgu **uczy się bawiąc** — jeden czasownik naraz, gating (gra
czeka aż naprawdę wykona akcję), zero ściany tekstu. Sterowanie uczone RAZ (wspólne dla wszystkich
trybów); każdy tryb daje tylko krótką **kartę celu**.

## Architektura (ustalona, oparta o realny kod)
- **Tutorial = osobny TRYB, NIE nowy `ScenarioId`** (dodanie do ScenarioId przeciągnęłoby go przez
  picker+difficulty+GameConfig — nie chcemy). Przechwyt w `onGameRequested` (main.ts:433).
- **Overlay = DOM, nie PIXI** (FAZA A). Menu/toast/kontrolki już są DOM; strzałka do joysticka celuje
  w element DOM w screen-space → zero matematyki zoom 0.6 / uiScale 0.7. PIXI world-ring dopiero FAZA B
  (cele w świecie: dummy/gemy).
- **`src/tutorial/TutorialController.ts`** — rejestr kroków `{ id, promptKey, target, gateCheck, onEnter,
  onComplete }`, silnik gatingu (czeka aż `gateCheck()`→true), warstwa overlay (tekst+strzałka+ring),
  `onExit` (mecz vs hub). Input-aware: na dotyku celuje w joystick, na desktopie „WASD" bez ringu.
- **Flaga one-time:** `bt2:tutorialCoreDone` (konwencja `bt2:` = urządzenie/gracz; musi działać PRZED
  założeniem nicku — Profile może nie istnieć). Karta celu: osobna flaga per tryb.
- **DWA układy współrzędnych:** kontrolki = DOM `position:fixed` w realnych px (nie ruszane zoomem);
  encje świata (dummy/gem) = world-space (jadą z kamerą). Rejestr kroków rozróżnia `target:{type:'control'}`
  vs `{type:'world'}`.
- **Korekty względem pierwotnego promptu:** (1) persistent highlight = NET-NEW (ringi w Effects.ts są
  one-shot ~0.3s; brak trwałego ringu/strzałki) — mały tani render path w `src/tutorial/`. (2) Krok GEMY
  highlightuje **pasek SUPER w HUD** (HUD.ts:202 — gem count to 6 pipów w pasku SUPER, nie osobna liczba)
  → gracz widzi związek gem→super.

## Seamy w kodzie (gotowe)
- `menu.onGameRequested` (main.ts:433) — przekazanie sterowania DOM-menu → PIXI = miejsce przechwytu 1. uruchomienia.
- `onHowToPlayRequested` (MainMenu.ts:89) podpięte do przycisku w hubie; stub w main.ts:467 („FAZA 8c") =
  gotowe miejsce na „Jak grać" / replay (powrót do huba).

## Sekwencja CORE (7 kroków, gating, skip zawsze)
1. **RUSZAJ** — lewy joystick (mobile) / WASD (desktop).
2. **STRZELAJ** — 1 manekin (dummy, world-space, pulsujący ring), strzał prawym stickiem aż zniknie.
3. **FALA** — kilku wrogów, wyczyść.
4. **GEMY** — zniszczeni zostawiają gemy; highlight na PASEK SUPER w HUD („ładuje się!").
5. **SUPER SHOT** — naładowane → użyj super-strzału.
6. **SUPER POWER** — długie przytrzymanie super = zmiana mocy (Aura/MegaBomb/Freeze).
7. **GOTOWY!** — wielki błysk, „umiesz grać!" → wpuszczenie do prawdziwego meczu.
Każdy krok: akcja → BŁYSK + dźwięk + ✓ → następny. Przycisk **POMIŃ** w rogu przez cały czas.

## Karta celu (per tryb, one-time, FAZA C)
Lekka karta (nie tutorial — sterowanie już znasz):
- 🎯 **Kill the Boss:** „Przetrwaj fale wrogów i pokonaj BOSSA!" → [GRAM!]
- 🚩 **Capture the Flag:** „Zdobądź flagę wroga i przynieś ją do bazy!" → [GRAM!]

## Przepływ
```
WYBÓR CZOŁGU → Pierwszy raz? --TAK--> TUTORIAL (7 kroków) --[koniec/POMIŃ]--> ┐
                    │NIE                                                       │
                    └──────────────────────────────────────────────────────────┤
                                                                                ▼
                              Pierwszy raz w TYM trybie? --TAK--> KARTA CELU --[GRAM!]--> MECZ
                                        │NIE ────────────────────────────────────────────▲
```
Wspólny tutorial = flaga `bt2:tutorialCoreDone` (raz). Karta celu = osobna flaga per tryb. Wszystko
pomijalne; replay z huba przez „Jak grać".

## FAZA A — konkretny zakres (skeleton + dowód silnika na 1 kroku)
- `src/tutorial/TutorialController.ts` (+ typy kroków + warstwa overlay DOM) — izolowany moduł.
- Przechwyt w main.ts:433 + implementacja stubu main.ts:467 (replay).
- Sandbox = reuse `startGame` z flagą tutorialu, która **wyłącza spawn** (kamera/ruch/dotyk/świat za darmo).
- **Krok 1 RUSZAJ:** strzałka + pulsujący ring na home joysticka (~środek (85,290) @667×375), tekst w
  wolnej strefie centrum `x[171,496] × y[45,225]` — **AABB potwierdzone: zero kolizji z HUD (górny pas)
  ani z prawymi stickami**.
- Skip button (róg), flaga `bt2:tutorialCoreDone`, i18n `tutorial.*` w pl+en (literal keys, `en: typeof pl`).
- **Koszt mobilny FAZA A: ~0** (1 tekst + 1 strzałka + 1 ring DOM; spawn wyłączony = lżej niż mecz).

## DECYZJE (zatwierdzone przez Mariusza 2026-07-28)
1. **Lejek po tutorialu = PROSTO W MECZ tym czołgiem** (płynnie, wzorzec Supercell). Replay z huba = powrót do huba.
2. **Scena sandboxa = REALNA MAPA scenariusza, spawn OFF** (reuse `startGame` z flagą tutorialu wyłączającą spawn).

Makiety ASCII (KROK 1 RUSZAJ, STRZELAJ, GEMY, karty celu) — w transkrypcie sesji 63398140; do przeniesienia
tutaj przy finalizacji planu jeśli potrzebne.
