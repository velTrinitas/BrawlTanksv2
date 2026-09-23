# PLAN PO TESTACH — Brawl Tanks / Sigma Tanks

**Okres:** 23.09.2026 → ~07.10.2026 · **Stan wyjściowy:** v0.202.0 (`1061ffd`) + niezacommitowane v0.203.0
**Sporządzono:** 22.09.2026 · Dokument do druku.

---

## 0. STRESZCZENIE NA JEDNĄ MINUTĘ

- **23.09 (środa)** — ostatni dzień grania testerów. Paczka blokuje się **sama** 24.09 o 00:00.
- **24.09 (czwartek)** — **ANALIZA LICZB** (Cloudflare + Supabase). Pierwszy punkt programu, przed jakąkolwiek zmianą backendu.
- Następnie **jeden redeploy zaplecza** — 9 rzeczy czekało w kolejce za datą 23.09.
- Potem **balans + ranking scenariuszy**, na końcu **COOP / ETAP 1**.

**Kolejność ustalona przez Mariusza:** domknąć v0.203.0 → balans + ranking → coop/ETAP 1.

---

## 1. CO ROBI MARIUSZ SAM (Cloudflare — nie mam tam dostępu)

Gra wygasza się **automatycznie**: `VITE_TEST_EXPIRES=2026-09-23` jest wpieczone
w paczkę testową, a `guardTestWindow()` jest pierwszą instrukcją `main.ts`.
Build produkcyjny (GitHub Pages) tej zmiennej nie zna i **nie wygasa nigdy**.

- [ ] **24.09 — pobrać statystyki z Cloudflare** (Web Analytics / Workers metrics):
      unikalni odwiedzający, wizyty per dzień, kraje, urządzenia, krzywa przez 3 tygodnie.
- [ ] **Po analizie — skasować deployment** w panelu Cloudflare.
      Powód: tester z cofniętym zegarem w telefonie gra dalej. Warstwa daty jest
      *uprzejma, nie szczelna*. Własnej domeny/CNAME nie ma (zostaliśmy na `workers.dev`),
      więc warstwa DNS odpada.

> W repo **nie ma** `wrangler.toml` ani żadnej konfiguracji Cloudflare — deployment był
> robiony ręcznie (Direct Upload paczki z `npm run build:test`).

---

## 2. CO CZEKAŁO NA 23.09 — PEŁNA LISTA (9 pozycji)

Wszystko zweryfikowane w kodzie, plik:linia — nie z pamięci.

| ☐ | # | Rzecz | Gdzie | Dlaczego czekało |
|---|---|---|---|---|
| ☐ | 1 | `BALANCE_V2` false → true | `src/config/balanceFlag.ts:18` | zmienia sufit wyników ⇒ wymaga bumpu score_version |
| ☐ | 2 | `CURRENT_SCORE_VERSION` 4 → 5 | `src/services/SupabaseScoreService.ts:83` | stara paczka testerów uderzałaby w zmienioną formułę |
| ☐ | 3 | Edge whitelist scenariuszy/map | `supabase/functions/submit-score/index.ts:37-38` | `SCENARIOS` ma martwe `save_king`, brak `save_queen`; `MAPS` bez `castle_grounds` i `dungeon` |
| ☐ | 4 | Klient nie wysyła wyniku Zamku/Królowej | `src/main.ts:3687`, `:3787` | czeka na pkt 3 |
| ☐ | 5 | Zakładki rankingu Zamek/Królowa wyłączone | `src/services/leaderboard.ts:69,78` | czeka na pkt 3+4 |
| ☐ | 6 | **Z0.7b** — walidacja `mode`/`match_id` w Edge + filtr `mode='solo'` w RPC | `supabase/scores_mode.sql`, `leaderboard_rpc.sql` | redeploy Edge był zakazany w oknie testów |
| ☐ | 7 | **Z0.10b** — Edge `upsert-profile` + lockdown RLS na `profiles` | `src/config/nickFilter.ts:8-9` | **DZIURA BEZPIECZEŃSTWA** — dziś `WITH CHECK (true)` pozwala nadpisać CUDZY profil |
| ☐ | 8 | **LAW** — wpis o telemetrii do polityki prywatności | karta backlogu, Effort 0.5 | obowiązek prawny od v0.151.0 |
| ☐ | 9 | Telemetria → decyzja o flipie SMOOTH + decyzja o ETAPIE 1 | kryteria Z0.6: p50 ≥ 55 | czekało na dane z realnych urządzeń |

**Punkty 3, 6, 7 to JEDEN redeploy zaplecza** — tak były planowane i tak je robimy.

**Poza oknem testów, ale w drzewie:** niezacommitowane **v0.203.0** — auto-generator
nicków (`src/config/nickGenerator.ts` + przebudowany `IdentityScreen.ts`), tap w całe
tło skrzynki (`CrateOverlay.ts`, fix podwójnego `onDone()`), kosmetyk `ps_s3_school`.

---

## 3. HARMONOGRAM

### KROK 0 — 22–23.09 (dziś/jutro) · *zero ryzyka dla testerów*

Nic nie dotyka Supabase ani flag. Bezpieczne równolegle do grania testerów.

- [ ] Playtest **v0.203.0**: generator nicków + reroll, kolizja nicku (czerwona karta
      + 3 propozycje), tap w tło skrzynki, kosmetyk S3 — desktop + A54.
- [ ] `tsc --noEmit` + brace-check.
- [ ] Commit v0.203.0 — **na prośbę Mariusza**, nie proaktywnie.

### KROK 1 — 24.09 (czwartek) · **ANALIZA LICZB** · *przed zmianą backendu*

Zamknięte okno = komplet danych. Robimy to **zanim** ruszymy `score_version`, bo bump
zmienia to, co widać w rankingu.

| Źródło | Kto | Co wyciągamy |
|---|---|---|
| Cloudflare | Mariusz | unikalni, wizyty/dzień, kraje, urządzenia, retencja 3 tyg. |
| `scores` | Claude | ile wyników, ilu graczy, rozkład per scenariusz / mapa / czołg / trudność, mediana i ogon |
| `telemetry_by_device` | Claude | **p50 / p05 FPS per model urządzenia** — bramka decyzji o SMOOTH |
| `profiles` | Claude | ilu testerów faktycznie założyło profil |
| `sessions` | Claude | długość sesji, `fun_mode` |

**Wyjście:** strona w Notion „Wyniki testów 01–23.09" + **dwie decyzje**:
flip SMOOTH (tak/nie) oraz start ETAPU 1 (tak/nie).

### KROK 2 — 24–25.09 · **JEDEN REDEPLOY ZAPLECZA**

Kolejność jest istotna: **SQL → Edge → klient**. Każdy podkrok weryfikowany zrzutem
z Dashboardu, zanim ruszy następny.

- [ ] 1. RPC `leaderboard_top` + filtr `mode='solo'` (Z0.7b, część SQL)
- [ ] 2. Edge `submit-score`: `SCENARIOS` = `ktb, ctf, castle, save_queen` (usunąć martwe
         `save_king`); `MAPS` + `castle_grounds`, `dungeon`; walidacja `mode`/`match_id`;
         wstawianie `fun_mode` (dziś kolumna jest, Edge jej nie pisze)
- [ ] 3. Edge `upsert-profile` + lockdown RLS na `profiles` (Z0.10b), wzorem
         `rls_lockdown_scores.sql`, z rollbackiem w komentarzu
- [ ] 4. Klient: odblokować submit Zamku/Królowej + włączyć obie zakładki rankingu
- [ ] 5. **LAW** — wpis o telemetrii do polityki prywatności
- [ ] 6. Higiena: martwy komentarz `GameSession.ts:40`, `score_version` w
         `progression_calibration.sql` / `quest_calibration.sql`

### KROK 3 — 25–29.09 · **BALANS + RANKING**

- [ ] 1. **STRZELNICA** — narzędzie pomiarowe: stała fala wrogów, mierzony czas
         wyczyszczenia, te same ziarna.
         *Powód:* pomiar bota daje **22–82 zabicia tym samym czołgiem** — jest za tępy
         do strojenia liczb. Bez strzelnicy kolejna iteracja balansu to znowu zgadywanie.
- [ ] 2. Zmierzyć **realne dystanse walki** → przeliczyć wagi modelu → **dopiero potem**
         wartości rosteru (kolejność ustalona przy v0.200.0).
- [ ] 3. **Flip jednym commitem:** `BALANCE_V2 = true` + `CURRENT_SCORE_VERSION = 5`.
- [ ] 4. Kalibracja mnożników `castle_grounds` / `dungeon` (`progression.ts:33-34`)
         i wyniku Królowej (`queenTuning.ts:97`) — dziś prowizoryczne.
- [ ] 5. Playtest A54 + `npm run sigma -- --matrix mobile --report`.

> ⚠️ **ŚWIADOMA KONSEKWENCJA (decyzja Mariusza, 22.09):** bump 4→5 **zeruje widoczny
> ranking** — leaderboard filtruje po `score_version`. Stare wiersze zostają w bazie,
> da się wrócić, ale tablice startują od zera.

### KROK 4 — od ~30.09 · **COOP / ETAP 1**

Start **wyłącznie** jeśli telemetria z KROKU 1 na to pozwoli. Bramki są twarde:

- [ ] przegląd planu **innym modelem** (cross-model) **PRZED** wykonaniem,
- [ ] rekomendacja ze specu: **odwrócić kolejność** — ETAP 2 (koop lokalny na jednym
      ekranie) przed pełną symulacją bez ekranu,
- [ ] ETAP 1-lite S1–S5: SimClock (timery wyciekają przy zwiniętej karcie), stan zamiast
      widoku, pętle po `players[]`.

Spec: Notion „ETAP 1 — SPEC WYKONAWCZY" · `3d1bb3d0-8803-817f-b9e6-ee9a109df84c`

---

## 4. TOP RICE Z BACKLOGU (RICE = Reach × Impact × Confidence / Effort)

Stan po **porządkach ze statusami z 22.09.2026** — wszystkie pozycje poniżej są realne
i zweryfikowane w kodzie. Nieaktualne karty zostały zamknięte (patrz §4a).

| ☐ | RICE | Pozycja | Status | Komentarz |
|---|---:|---|---|---|
| ☐ | **300** | Muzyka: podmiana plików na wersje zoptymalizowane (17 MB) | In progress | zatrzymane przed testami; dotyka czasu startu gry — **najtańszy duży zysk** |
| ☐ | **240** | MP Z0.6 — SMOOTH domyślnie ON | Not started | **decyzja z KROKU 1**; kod istnieje, catch-up działa |
| ☐ | **140** | TYPO-P1-9 — faux-bold Titan One przez UA stylesheet | In progress | E=0.5 |
| ☐ | **120** | TYPO-P0-4 — HUD Canvas bez `devicePixelRatio` (rozmyty HUD na A54) | In progress | czekało na pomiar FPS na A54 |
| ☐ | **120** | TYPO-P1-3 — rozmiary poniżej 12 px w Hubie (8 px na BITWA) | In progress | grupa 9–12 lat |
| ☐ | **80** | Język startowy z przeglądarki (intro zawsze po polsku) | Not started | E=0.5 |
| ☐ | **70** | TYPO-P1-4 — trzy niezgodne polityki wagi fontu | Not started | |
| ☐ | **70** | MP Z0.10 — filtr wulgaryzmów w nickach | In progress | **a✅ shipped v0.149.0 · b (RLS) → KROK 2** |
| ☐ | **70** | Znaczniki celów zasłaniają HUD i przyciski mocy (CTF + Zamek/Królowa) | Not started | SigmaTester, zweryfikowane zrzutami |
| ☐ | **60** | Poki SDK + rewarded ads | Not started | osobna faza komercjalizacji |
| ☐ | **60** | TYPO-P0-2 — czytelność tekstu world-space na mobile (5,4–9,6 px) | In progress | czekało na pomiar A54 |
| ☐ | **60** | Sezon 3 — pełny załadunek (dekor + item + hero text) | In progress | dekor `ps_s3_school` wchodzi w v0.203.0 |
| ☐ | **52,5** | Muzeum kolekcji sezonowych (rollover kasuje znajdźki) | Not started | ⏰ **termin: przed końcem S3, 31.10.2026** |
| ☐ | **50** | LAW — polityka prywatności / telemetria | Not started | → **KROK 2**, obowiązek prawny |
| ☐ | **48** | Mobile: gra nie pauzuje w pionie | Not started | na A54 nieosiągalne (`orientation.lock`) |

### 4a. Zamknięte przy porządkach 22.09.2026 (18 kart → `Done`)

Wszystkie zweryfikowane w kodzie, nie „z pamięci":

- **ETAP 0 COOP (7):** `MP Z0.1` seeded RNG (`systems/Rng.ts`) · `Z0.2` audyt `maps/` ·
  `Z0.3` `players[]` + `localPlayer` · `Z0.4` `resolveEnemyTarget` ·
  `Z0.5` `types/DamageSource.ts` · `Z0.8` `MP_LIVE` + `SIM_VERSION` ·
  `Z0.9` `TelemetryService.ts`
- **Balans (2):** Naprawa superów skalowanych reloadem (`fairSuperProfiles`, `main.ts:381`) ·
  TEMPO jako 4. kategoria statów (`stat.tempo` + `stat.range` w i18n)
- **Skiny (2):** „Skiny czołgu (system kosmetyczny)" i duplikat „Skiny czołgów" — `SKINS_LIVE=true`
- **Zamek (3):** System Bram (`gatePcts[]`, 4 bramy) · Scenariusz Defend the Castle ·
  Muzyka Zamku (3-track pool w `AudioSys.ts:73`)
- **Typografia (3):** `TYPO-P0-1` self-host Titan One (`public/fonts/*.woff2` + `@font-face`) ·
  `TYPO-P0-3` kontur `PIXI.Text` · `TYPO-P0-5` `drawSeasonPill` z `measureText` + `save/restore`
- **Systemy (1):** System Skrzyń + Profil Gracza + Inwentarz

**Przestawione na `In progress`** (częściowo zrobione, nie zamknięte): `MP Z0.7`
(a✅ / b czeka na redeploy Edge) · `MP Z0.10` (a✅ / b = lockdown RLS) ·
„Rebalans rosteru + 5 kategorii statów" (TEMPO/ZASIĘG w UI shipped, roster za flagą `BALANCE_V2`).

> ⚠️ **Do decyzji Mariusza** — nie ruszałem, bo nie mam twardego dowodu:
> „Tutorial / Onboarding — nowości" (In progress; onboarding wygląda na feature-complete),
> „Leaderboard — dopracowanie stylu" (In progress, karta bez opisu),
> „Mechanika i logika sezonów S3" (Implementing), pusta karta bez nazwy oraz karta
> „Multiplayer" bez treści (duplikat serii `MP ETAP`).
>
> ✅ Sprawdzone i **słusznie** `Not started`: mapa #6 „Kill the Boss (poligon)" — w kodzie
> jest tylko LOCKED zapowiedź (`MapType.ts:186`), nie implementacja.

---

## 5. REZERWA — długi NIEzwiązane z oknem testów

Żadna z tych rzeczy nie czekała na 23.09; to osobna pula na luźniejszy dzień.

- Znaczniki celów zasłaniające HUD w CTF i u Królowej (J2 w każdej matrycy bota)
- **82 MB tekstur** zostaje po 5 mapach — prawdziwy teardown to najbardziej ryzykowny punkt, etapami za flagą
- `particleContainer` zIndex 500 — efekty rysują się POD czołgami na ~85% mapy
- Hazardy (lawa / gejzer / dynamit / głaz / bomba CTF) poza progiem „na hita"
- `Date.now()` w zegarach Zamku — pauza w pionie ich nie zatrzymuje
- Promień pocisku wieży w hit-teście
- **Poki:** bundle 7 MB przy limicie 8 MB + zewnętrzny ruch do Supabase
- Pauza w pionie na A54 nieosiągalna (`orientation.lock` z pierwszego meczu trzyma się do końca sesji)

---

## 6. REJESTR FLAG — stan na 22.09.2026

| Flaga | Wartość | Rollback URL |
|---|---|---|
| `SHOP_LIVE` | ✅ true | `?shop=0` |
| `SKINS_LIVE` / `SKINS_MODE_LIVE` | ✅ true | `?skins=0` / `?skinsmode=0` |
| `CASTLE_LIVE` | ✅ true | `?castle=0` |
| `QUEEN_LIVE` | ✅ true | `?queen=0` |
| `CHOOSE_LIVE` | ✅ true | `?choose=0` |
| `NICK_FILTER_LIVE` | ✅ true | `?nickfilter=0` |
| `TELEMETRY_LIVE` | ✅ true | `?telemetry=0` |
| **`BALANCE_V2`** | ❌ **false** | `?bal=1` — **flip w KROKU 3** |
| `MP_LIVE` | ❌ false | `?mp=1` — bez implementacji |
| `TURN360_TANKS` | `[]` (pusty) | — zaparkowane (kolizja ze skinami) |

---

## 7. DYSCYPLINA (przypomnienie)

- Commit/push **tylko na wyraźną prośbę Mariusza**, po playteście. Nigdy proaktywnie.
- Przed commitem: `git status --short`, jawne `git add <ścieżki>` — nigdy `git add -A`.
- PowerShell 5.1: łączenie komend przez `;`, **nigdy** `&&`.
- Po każdym pushu: `/changelog` → wpis w Changelogu → bump PROJECT CONTEXT → Progress log.
- Mobile ocenia **live build + playtest**, nigdy czytanie kodu.
