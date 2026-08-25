# Tutorial / Onboarding — notatka robocza + plan FAZA A (WIP)

> **STAN (2026-08-25):** FAZA A dostarczona (v0.82.0–v0.83.0: 7 kroków, ItemHints,
> GoalCard, ekran „Jak grać"). Dokument zachowany jako ZAPIS ROZPOZNANIA KODU —
> wartościowy jest §7, czyli trzy miejsca, w których pierwotny prompt rozjeżdżał się
> z rzeczywistą implementacją. Nie jest to już plan do wykonania.

> Punkt zaczepienia do wznowienia pracy nad tutorialem. Spisane po sesji planowania
> (rozpoznanie realnego kodu + wizja + makiety). Bazuje na `BUILD_PROMPT_Tutorial_FAZA_A.md`,
> ale **koryguje 3 miejsca**, gdzie prompt rozjeżdża się z rzeczywistym kodem (patrz §7).
>
> Jak wznowić w terminalu: `claude --resume` → sesja projektu → *„czytaj
> docs/PROMPT_Tutorial_FAZA_A_wip.md i dokończ plan FAZA A"*.

---

## 1. Kontekst i cel

Nowi gracze nie wiedzą co robić — brak onboardingu to gate na D0 retention i na launch
(Poki/store). Budujemy **System Onboardingu — model 3-warstwowy** (RICE 30.0, najwyższy
w backlogu). Target: 9–12 lat, web-first, wzorzec Supercell/Brawl Stars (learn-by-doing,
jeden czasownik naraz, gating, skippable).

Live: **v0.70.0**. Jedyny live scenariusz = **KTB (survival)**. CTF (`fortified_ruins`)
i Castle (`castle_grounds`) mają `available:false` — NIE budujemy pod nie contentu teraz,
tylko zostawiamy miejsce w architektu rze.

**Scope MVP:**
- Warstwa 1 — Core Onboarding: jeden sandbox przy 1. uruchomieniu, uczy uniwersalnych
  czasowników (wspólnych dla wszystkich scenariuszy).
- Warstwa 2 — Scenario Intro Card: lekka karta celu przy 1. wejściu w scenariusz
  (na razie tylko KTB copy; rejestr pod CTF/Castle bez copy).
- **POZA scope:** Warstwa 3 — JIT hints (osobny wiersz backlogu, przyszła faza);
  CTF/Castle intro copy.

---

## 2. Model 3-warstwowy — dlaczego tak (LOCKED)

Sterowanie jest **wspólne dla wszystkich scenariuszy**. Pełny tutorial per scenariusz =
3× duplikacja nauki joysticka. Scenariusze różni tylko **cel** = 1 karta (Warstwa 2).

- **Raz w życiu:** wspólny tutorial sterowania (flaga `bt2:tutorialCoreDone`).
- **Raz na każdy tryb:** karta celu (osobna flaga per-scenario).
- Wszystko **pomijalne**; replay z huba przez „Jak grać".

---

## 3. Findings z REALNEGO kodu (nie zgadywać — to jest zweryfikowane)

### Seamy wpięcia (gotowe, czekają)
- `onHowToPlayRequested` — **już zadeklarowany i podpięty** do przycisku w hubie
  (`hub.onHowToPlayClick`, `MainMenu.ts:245`), deklaracja `MainMenu.ts:89`. W main.ts
  czeka pusty stub: `main.ts:467-469` („FAZA 8c will implement"). **To jest gotowe
  miejsce na replay „Jak grać" — ZERO nowego ScreenId.**
- `menu.onGameRequested` — `main.ts:433-442` — moment przekazania sterowania z DOM-menu
  do PIXI (`menu.hide(); void startGame(config)`). **Najczystsze miejsce na przechwyt
  1. uruchomienia.**
- Brawler wybrany w `BrawlerPicker.onPlay` (`MainMenu.ts:304-321`), config zbudowany
  `GameConfigBuilder().…build()` (`MainMenu.ts:310-316`), potem `onGameRequested(config)`
  (`MainMenu.ts:320`). Seam rozdziału: menu-internal = `this.show()`; wszystko dotykające
  PIXI/lifecycle = callback do main.ts.

### Boot meczu
- `startGame(config)` — `main.ts:822`. Sekwencja: `new GameSession(config)` (827) → reset
  świata/encji (846-913) → world zoom (915) → per-map build (`config.map`, od 918) →
  `new EffectsManager` (1353), `new SpawnSystem` (1357), `new PowerSystem` (1361) →
  `new Player(...)` (1386) → **`gameState = 'PLAYING'` (1406)** → `touchManager.show()`
  (1411) → `audio.startMusic` (1445).
- Pętla: `app.ticker.add(...)` (`main.ts:1883`), **gate: `if (gameState !== 'PLAYING'
  || !player || !effects || !spawnSystem || !powerSystem || !currentSession) return;`
  (`main.ts:1930`)**. Tutorial musi być admitowany przez ten gate (nowy stan `'TUTORIAL'`
  albo flaga na sesji przy `gameState==='PLAYING'`).
- `gameState: 'MENU' | 'PLAYING' | 'VICTORY' | 'GAMEOVER'` (`main.ts:251`).
  `currentSession: GameSession | null` (`main.ts:254`).
- `returnToMenuFromEnd()` (`main.ts:528`) — wzór powrotu do huba (`menu.reshow();
  menu.show('hub')`).

### Config / scenariusz
- `ScenarioId = 'ktb' | 'ctf' | 'castle' | 'save_king'` (`Scenario.ts:22`) — **brak
  'tutorial'**. `GameConfig` wszystko `readonly` (`GameConfig.ts:33-42`), budowany
  `GameConfigBuilder` (`GameConfig.ts:105-178`), `build()` waliduje + `Object.freeze`.
- **DECYZJA:** tutorial NIE jako `ScenarioId` (przeciągnęłoby przez picker + difficulty +
  GameConfig). Tutorial = osobny tryb sterowany `TutorialController` nad sandboxem.

### i18n
- Płaskie, kropkowane klucze, bez zagnieżdżeń (`pl.ts` jeden literał, grupowany banerami).
  Parity: `en.ts` = `export const en: typeof pl = {…}` (`en.ts:9`) — brak klucza w en =
  compile error. Param `{name}` przez `t(key, params)` (`i18n.ts:100-123`).
- `i18n.hasKey(key)` istnieje (`i18n.ts:140`) i doc **wprost wymienia „tutorial steps
  which may be unavailable"** jako use-case → użyć do miękkiego fallbacku brakującego copy.
- Wzór do skopiowania dla stringów tutoriala: grupa `profile.onboarding.*`
  (`pl.ts:176-186` / `en.ts:166-176`). Dodać baner `tutorial.*`.

### Effects / toast / highlight
- **Brak persistent ringu i strzałki.** Wszystkie ringi w `Effects.ts` są ONE-SHOT,
  samoniszczące ~0.3s (`spawnShockwaveRing` :460, `spawnMegaBomb` :403). Sine-pulse jest
  w `spawnFreezeOverlay` (:505). `spawnFloatingText` (:579) = pooled world-space pill.
  → **Persistent highlight (strzałka + pulsujący ring) = NET-NEW** w `src/tutorial/`,
  a NIE reuse. Effects dopiero do confirm-juice po kroku (FAZA B).
- `toast.ts`: `showToast(message, durationMs=2500)` (`toast.ts:20`), DOM/HUD-space, brak
  stackowania (single active).
- **Highlight ma DWA układy współrzędnych:**
  - Kontrolki (joystick/aim/super) = **DOM `position:fixed`, realne px, NIE ruszane
    zoomem** (`#bt-touch-root`, z-index 60).
  - Encje świata (dummy, gem) = **world-space, jeżdżą z kamerą**.
  - Rejestr kroków od początku musi rozróżniać `target: {type:'control'}` vs `{type:'world'}`.

### localStorage — konwencje
- Dwie żywe: `brawltanks.<x>.v1` (i18n/scores/session) oraz `bt2:<x>` (profiles/audio/
  forceTouch). **Brak jakiejkolwiek flagi „tutorial done" / „hasSeenX".** Onboarding jest
  WYLICZANY (`ProfileService.needsOnboarding()` :39), nie zapisywany; `Profile`
  (`Profile.ts:52-62`) nie ma pola „seen".
- **DECYZJA:** `bt2:tutorialCoreDone` (osobny klucz, konwencja `bt2:`). Powód: musi działać
  **przed założeniem nicku** (offline-first) — Profile może nie istnieć, więc pole w Profile
  odpada.

---

## 4. Pozycje ekranu (AABB, landscape 667×375, uiScale 0.7, zoom 0.6, non-CTF)

**ZAJĘTE (nie stawiać highlightów):**
- Górny pas y≈[0,45]: HP pill x[10,171] (top-left), SCORE ~161px centered (top-center),
  KILLS x[496,657] (top-right).
- Lewa 2. linia y≈[49,87]: SUPER pill x[10,130].
- Dół-lewo: home joysticka x[20,150] y[225,355], środek ≈(85,290). **Cała lewa ~40%
  (x[0,267], pełna wysokość) to strefa floating-touch.**
- Dół-prawo: aim/fire stick (fixed) x[517,647] y[225,355], środek ≈(582,290).
- Prawo: super button x[555,627] y[133,205], środek ≈(591,169). Long-press ≥500ms = cycle.

**WOLNE (bezpieczne na highlight/tekst):**
- **Środek: x[171,496] × y[45,225]** — największy czysty prostokąt (tu ląduje tekst kroku).
- Dolny-środek strip x[267,517] × y[205,375] (SuperPowerBar hidden na mobile; centralne 20%
  = bufor no-touch).

Uwaga: kontrolki są DOM w realnych px; HUD to canvas w design-space ×0.7. Nie mieszać.
Small-viewport override `@media (max-width:375px)` (width ≤375) zmniejsza kontrolki —
przeliczyć AABB, jeśli literalnie 375px szerokości.

---

## 5. Sekwencja Core (LOCKED) + uwaga

Każdy krok = akcja + gating (czeka aż gracz realnie wykona). Tekst krótki, duża czcionka,
ideał: ikona + czasownik. Input-aware (dotyk: joystick / desktop: WASD, bez ringu).

1. **RUSZAJ** — joystick / WASD (gate: przejechane X px)
2. **CELUJ + STRZELAJ** — 1 statyczny dummy (gate: dummy zniszczony)
3. **FALA** — kilka dummy (gate: fala wyczyszczona) — uczy pętli survival
4. **GEMY** — zbierz gemy (gate: zebrane N) — **highlight celuje w PASEK SUPER w HUD**
   (`HUD.ts:202`, gem count wtopiony w 6 pipów), nie w abstrakcyjny licznik → gracz widzi
   związek gem → charge
5. **SUPER SHOT** — masz naładowany, użyj (gate: super shot oddany)
6. **SUPER POWER** — long-press cycle + aktywacja (gate: power użyty) — **własny krok**
   (najbardziej mylący control)
7. **HEART / heal** (opcjonalnie) — heart pickup → heal
8. **„GOTOWY!"** — flex moment (błysk + dźwięk + combo) → drop do gry/menu

Dummy = scripted, niegroźni. Sandbox = kontrolowana scena, nie realna fala.

---

## 6. Makiety (co gdzie na ekranie)

### KROK 1 — „RUSZAJ" (FAZA A)
```
 ┌──────────────────────────────────────────────────────────────┐
 │ ❤️[HP ▓▓▓▓░ 80]      ⭐[ SCORE 0 ]        [ 💀 0/10 ]  KILLS │  ← HUD
 │ ⚡[SUPER ○○○○○○]                                              │
 │                    ┌───────────────────┐                     │
 │                    │      RUSZAJ!       │  ← duże słowo       │
 │                    └───────────────────┘   (wolna strefa)    │
 │                            │                                 │
 │                            ▼                                 │
 │        ╭─────╮                                               │
 │       ( (◉)  )  ← pulsujące kółko na joysticku          [POMIŃ]│
 │        ╰─────╯                                                │
 │      🕹️ RUSZAJ                              🕹️ CELUJ+STRZELAJ │
 └──────────────────────────────────────────────────────────────┘
```

### KROK 2 — „STRZELAJ" (FAZA B)
```
 ┌──────────────────────────────────────────────────────────────┐
 │ ❤️[HP ▓▓▓▓▓]     ⭐[ SCORE 0 ]        [ 💀 0/10 ]            │
 │                    ┌───────────────────┐                     │
 │                    │     STRZELAJ!     │                     │
 │                    └───────────────────┘             [POMIŃ]│
 │              ╭───╮                                           │
 │             ( 🎯 ) ← manekin (world-space ring)      ╭─────╮ │
 │              ╰───╯      ▲ strzałka od prawego sticka (super) │
 │      🕹️                                          🕹️ ← trzymaj│
 └──────────────────────────────────────────────────────────────┘
```

### KROK „GEMY" — związek gem → super (FAZA B)
```
 ┌──────────────────────────────────────────────────────────────┐
 │ ❤️[HP ▓▓▓▓▓]   ⭐[ SCORE 40 ]    ┌─────────────────┐         │
 │ ⚡[SUPER ●●●○○○]◄────────────────│ ZBIERAJ GEMY!   │         │
 │        ▲ ładuje się! (strzałka na pasek SUPER)               │
 │            💎  💎   ← gemy w świecie (pulsują)        [POMIŃ]│
 │        🚗                                                    │
 │      🕹️                                          🕹️     🔵   │
 └──────────────────────────────────────────────────────────────┘
```

### KARTA CELU — 1. wejście w tryb (FAZA C)
```
   🎯 KILL THE BOSS                    🚩 CAPTURE THE FLAG
   ╔══════════════════════╗           ╔══════════════════════╗
   ║         🎯           ║           ║         🚩           ║
   ║  Przetrwaj fale      ║           ║  Zdobądź flagę wroga ║
   ║  i pokonaj BOSSA!    ║           ║  i przynieś do bazy! ║
   ║      [ GRAM! ]       ║           ║      [ GRAM! ]       ║
   ╚══════════════════════╝           ╚══════════════════════╝
```

### Cały przepływ
```
  WYBÓR CZOŁGU
       │
       ▼
  Pierwszy raz? ──TAK──►  TUTORIAL (7 kroków, Twoim czołgiem)
       │                        │
       │NIE               [koniec / POMIŃ]
       └──────────┬─────────────┘
                  ▼
  1. raz w TYM trybie? ──TAK──►  KARTA CELU (🎯 / 🚩)
                  │                     │
                  │NIE               [GRAM!]
                  ▼                     │
                MECZ  ◄─────────────────┘
```

---

## 7. Rozjazdy z oryginalnym BUILD_PROMPT — 3 korekty

1. **„Reuse Effects.ts do highlightu" — tylko częściowo.** Ringi w Effects są one-shot.
   Persistent strzałka + pulsujący ring = net-new render path w `src/tutorial/` (tani,
   ale to nie reuse). Effects dopiero do confirm-juice.
2. **Flaga `bt_tutorial_core_done` nie pasuje do konwencji repo** → `bt2:tutorialCoreDone`
   (musi działać przed nickiem).
3. **Overlay = DOM, nie PIXI.** Menu/toast/kontrolki już są DOM; strzałka do joysticka
   celuje w element DOM w screen-space (zero matematyki zoom/uiScale); FAZA A zostaje mała.
   Cienki PIXI world-ring dorzucamy dopiero w FAZA B (cele w świecie: dummy/gemy).

---

## 8. OTWARTE DECYZJE (zadać Mariuszowi przed kodem)

**D1 — Lejek po tutorialu:**
- (rekomendacja) **Prosto w mecz** — tutorial płynnie → prawdziwy mecz tym samym czołgiem/
  scenariuszem. Najlepszy lejek D0, skip też prosto w mecz.
- Alt: **Powrót do huba** — gracz sam startuje mecz (bezpieczniej, ale +1 krok i ryzyko
  porzucenia).

**D2 — Scena sandboxa Core:**
- (rekomendacja) **Realna mapa gracza** — reuse `startGame` na wybranej mapie ze spawnem
  wyłączonym (zero nowego artu, kontekstowe, min. ingerencja w main.ts).
- Alt: **Dedykowana neutralna arena** — czyściej pedagogicznie, ale nowa scena =
  więcej kodu + osobny koszt mobilny.

---

## 9. FAZA A — scope + Definition of Done

**Bump:** v0.70.0 → **v0.71.0** (nowy feature = minor).

Skeleton + dowód silnika na jednym kroku:
- `src/tutorial/TutorialController.ts` (+ typy kroków, warstwa overlay DOM) — izolowany moduł.
  Rejestr `{ id, promptKey, target:{type:'control'|'world',…}, gateCheck, onEnter,
  onComplete }`, silnik gatingu, overlay (tekst + strzałka + ring), `onExit` callback
  (mecz vs hub), analytics hook (cienki callback start/complete/skip — miejsce, NIE
  implementacja Supabase).
- Przechwyt w `main.ts:433` (1. uruchomienie: flaga? → tutorial → startGame) + implementacja
  stubu `main.ts:467` (replay z huba, ostatni brawler).
- Sandbox = reuse `startGame` z flagą tutorialu wyłączającą spawn (kamera/ruch/dotyk/świat
  za darmo). Admisja przez gate `main.ts:1930`.
- Krok 1 RUSZAJ: strzałka + pulsujący ring na home joysticka (~(85,290)), tekst w wolnej
  strefie x[171,496] × y[45,225]. Input-aware (desktop: WASD, bez ringu).
- Skip button (róg), flaga `bt2:tutorialCoreDone`, i18n `tutorial.*` w pl+en.

**DoD:**
- [ ] `src/tutorial/` z `TutorialController` (rejestr + gating + overlay tekst/strzałka/ring).
- [ ] Trigger po wyborze brawlera otwiera scenę tutoriala wybranym `brawlerId`.
- [ ] Krok 1 (RUSZAJ) działa: gating ruchu, ukończenie → confirm juice.
- [ ] Skip button działa i wychodzi (mecz/menu wg D1).
- [ ] „Jak grać" w hubie odpala replay (`onHowToPlayRequested`).
- [ ] Flaga `bt2:tutorialCoreDone` — auto-trigger tylko za 1. razem.
- [ ] Overlay NIE koliduje z HUD/kontrolkami na 375px landscape (AABB potwierdzone).
- [ ] Bez full-screen dim. Bez nowych ciężkich efektów.
- [ ] i18n `typeof pl` parity trzyma się; PL player-facing z diakrytykami OK.
- [ ] Esbuild + brace-balance clean.
- [ ] BEZ proponowania commita — czekamy na Mariusza.

**Koszt mobilny FAZA A: ~0** (1 tekst + 1 strzałka + 1 ring DOM nad sceną, spawn off = lżej
niż mecz).

---

## 10. Plan faz (całość — po jednej)

- **FAZA A (ta):** skeleton + krok 1 + wpięcie (trigger/replay/flaga/skip).
- **FAZA B:** pełna sekwencja Core (kroki 2–8, scripted dummy, dropy gemów, confirm juice,
  world-space ring w PIXI, `EffectsManager`/`HUD`/`Player`/`Spawn`/pickupy — czytać przy B).
- **FAZA C:** Scenario Intro Card (KTB copy + rejestr pod CTF/Castle, per-scenario flaga).
- **FAZA D:** JIT hints (deferred, osobny wiersz backlogu).

---

## 11. Real source do przeczytania na start FAZA A (nie zgadywać sygnatur)
1. `src/ui/MainMenu.ts` — trigger po wyborze brawlera + „Jak grać"; pattern show()/factory.
2. `src/main.ts` — boot meczu + gameLoop hook (targeted; ~1400 linii).
3. `src/input/TouchInputManager.ts` — realne pozycje joysticka/aim/super (placement).
4. `src/types/Scenario.ts` + `src/types/GameConfig.ts` — kształt configu + flow.
5. `src/i18n/translations/pl.ts` + `en.ts` — type-safe stringi (`typeof pl` parity).

Pliki pod FAZA B (`Enemy`/`Spawn`, `Player`, pickupy, `Effects.ts`, `HUD.ts`) — NIE czytać
teraz (unikamy signature drift).