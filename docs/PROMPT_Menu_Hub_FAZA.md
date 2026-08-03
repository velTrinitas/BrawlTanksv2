# PROMPT — Menu Hub Progresji (Brawl Tanks S2)
**Dla:** agent Claude Code (VS Code, model Fable) · **Tryb:** Plan Mode PRZED każdą implementacją
**Referencja wizualna/UX (źródło prawdy o layoucie):** `BrawlTanks_Menu_Sim_v1.html` (interaktywna makieta, desktop + mobile). Otwórz ją i traktuj jako **kontrakt wyglądu i przepływów** — NIE jako źródło danych/nazw/wartości.

> Ten dokument opisuje CO i JAK zbudować. Nie zaczynasz kodu, dopóki nie wykonasz groundingu (§1), nie przeczytasz realnych źródeł (§2) i nie przedstawisz planu do akceptacji (§11). Mariusz zatwierdza fazy po playteście — **nigdy nie proponujesz commita proaktywnie**.

---

## 1. NAJPIERW — grounding (obowiązkowe, przed jakąkolwiek analizą)
Wykonaj w tej kolejności (two-step session grounding):
1. **Live build** → `https://veltrinitas.github.io/BrawlTanksv2/`, sprawdź `id="credits"` = aktualna wersja. To źródło prawdy o stanie.
2. **Notion PROJECT CONTEXT (live)** → `388bb3d0-8803-81e5-9db4-fc45de3ba55c`. Jeśli instrukcje Projektu i ta strona się różnią — **strona + live wygrywają**.
3. **Notion — Progression Design Doc v1.2** (Trophy Road, Zrzuty, Rozkazy, Ranga Załogi, sezony, ekonomia). To **źródło prawdy o ekonomii/balansie**. Jeśli nie znajdziesz — zapytaj Mariusza o ID/link ZANIM wymyślisz jakiekolwiek wartości.

Hierarchia źródeł: **Notion PROJECT CONTEXT + Design Doc + realne pliki `.ts` > live web fetch (CDN lag) > pamięć**. `web_fetch` live buildu = tylko sygnał powierzchniowy, nie autorytet wersji. GitHub Actions = autorytet deployu.

Jeśli masz komendę `/faza` — użyj jej do groundingu.

---

## 2. Przeczytaj realne źródła PRZED kodem (zero zgadywania sygnatur/wartości)
Otwórz i przeczytaj faktyczną zawartość (nie ekstrapoluj z makiety ani z pamięci):
- `src/ui/MainMenu.ts` — obecny menu/hub, wzorzec, punkty wejścia (`onGameRequested`, `startGame(...)`, `onHowToPlayClick`, hub buttons, `tutorialMode`).
- `src/ui/menu-styles.css` — istniejące tokeny/klasy (duży plik → **targeted edits**, nie replace).
- `src/ui/` — `LeaderboardScreen`, `HowToPlayScreen`, `GoalCard`, `toast` — **wzorzec DOM-overlay ekranu** (tapeta MainHub, landscape @375px, zakładki). Nowe ekrany hubu naśladują ten wzorzec 1:1.
- `index.html` — hooki DOM, meta viewport, feature-flag pattern (`END_V2_ENABLED`, `?flag=`), `body.bt-desktop` detekcja.
- `src/config/brawlers.ts` — **REALNY roster brawlerów** (nazwy, role, `mobileSpeedMult`). Makieta ma placeholdery (Pancerz/Zwiad/…) — użyj prawdziwych.
- `src/config/powers.ts` — **REALNY roster super-mocy** i tiery. Makieta pokazuje 20 mocy w 3 tierach jako layout — dane bierzesz stąd.
- `src/config/constants.ts`, `src/config/difficulty.ts` — stałe, zoom mobilny (`MOBILE_WORLD_ZOOM`).
- `src/services/ProfileService.ts`, `SupabaseScoreService.ts`, `profileSync.ts`, `GameSession.ts` — jak trzymamy profil/statystyki/stan; **`CURRENT_SCORE_VERSION`**; offline-first + kolejność FK (profil do chmury PRZED scores).
- `src/i18n/i18n.ts` + `translations/pl.ts` + `en.ts` — mechanizm `t('key')`, `en: typeof pl` parity.
- `src/input/TouchInputManager.ts` — dotyk (nawigacja hubu musi działać dotykiem).

**Zasada:** jeśli potrzebujesz sygnatury/wartości, której nie widzisz w pliku — **przeczytaj plik**, nie zgaduj. Błędne sygnatury już powodowały krytyczne bugi (`scoreValue`, `updateProfile`).

---

## 3. Architektura docelowa
- **DOM overlay, NIE PixiJS.** Hub to warstwa DOM/CSS nad canvasem gry (jak `LeaderboardScreen`/`HowToPlayScreen`). Powód: menu nie rywalizuje o fill-rate z WebGL; tylko transform/opacity, GPU-composited. Makieta jest już HTML/CSS/JS = mapuje się 1:1 na tę warstwę.
- **Nowe pliki (propozycja, do potwierdzenia w planie):**
  - `src/ui/hub/HubShell.ts` — górny readout (profil+waluty+⚙️) + nawigacja (rail desktop / dolny dock mobile) + routing sekcji.
  - `src/ui/hub/BattleSection.ts` (BITWA/home), `GarageSection.ts` (GARAŻ), `QuestsSection.ts` (ROZKAZY), `TrophyRoadSection.ts` (TROFEA + sezon), `RankSection.ts` (RANKING).
  - `src/ui/hub/overlays/StatsOverlay.ts`, `LoadoutPicker.ts`, `CrateOpen.ts`.
  - `src/ui/hub/hub-styles.css` **lub** rozszerzenie `menu-styles.css` (decyzja w planie; jeśli osobny plik — spójne tokeny z istniejącymi).
  - `src/config/progression.ts` — **wszystkie stałe ekonomii** (waluty startowe, progi Trophy Road, tabele Zrzutów z pity, definicje Rozkazów, sezon). Zero magic-numberów rozsianych po UI.
  - `src/services/ProgressionService.ts` — stan progresji (offline-first localStorage mirror + sync Supabase), API czytania/zapisu walut, ownership kosmetyków, equipped loadout, progres questów, odebrane nody, track sezonu.
- **State flow (trzymaj warstwy):** `progression.ts` (immutable config) → `ProgressionService` (runtime state + persistence) → sekcje UI (render + input). Sekcje NIE trzymają własnej prawdy o ekonomii.
- **Feature flag default-OFF.** Cały hub za flagą (wzorzec `SUPER_V2_DEFAULT`/`END_V2_ENABLED`, np. `HUB_V2_ENABLED` + `?hub=1`). Domyślnie OFF = gracze na produkcji bez zmian, dopóki hub nie jest gotowy. Diagnostyka/rollback jak w Twoich fazach.

---

## 4. Twarde zasady (guardrails — łamanie = odrzucenie fazy)
1. **Mobile-first, nie afterthought.** Każdy panel/overlay sprawdzasz pod **375px landscape** (kolizje HUD, nadpisania, brak scrolla przy kluczowych CTA) PRZED dostarczeniem. Dock kciukowy, tap-targety ≥44px, kontrolki nie zasłaniają treści. To twardy gate.
2. **All-programmatic art.** Menu = CSS + emoji/kształty. **Zero external SVG/PNG.** Ikony brawlerów/mocy = te same reprezentacje co w grze (docelowo baked PIXI → jeśli menu potrzebuje podglądu brawlera, użyj istniejącego `ProfileSpriteCache`/`SpriteFactory`, nie nowego assetu).
3. **Fill-rate/perf overlaya.** Żadnego full-screen overdraw (duże blury, screen-blend, wielkie gradienty animowane co klatkę). Juice skrzynki/claimów = krótkie transform/opacity, pooled/`animate()` z auto-cleanup, respekt `prefers-reduced-motion`. Każdy nowy ciężki efekt → podaj koszt mobile + tańszy wariant.
4. **Etyczna monetyzacja (Poki-only, zero IAP).** Nigdzie nie sprzedajesz mocy ani losowości. Waluty: 🏆 Trofea (progresja, **nie spadają**), 🔩 Złom (tylko kosmetyka), 🔑 Klucze (**tylko zdobywane**). Zrzuty: **jawne pule + pity counter** widoczny dla gracza. Positive-only (nic nie resetuje się boleśnie). Kosmetyczne unlocki mogą iść przez rewarded video (Poki), nie przez zakup.
5. **Bezpieczeństwo 9–12.** Żadnych ciemnych wzorców (fałszywa pilność, znikające oferty, mylące CTA). Nazwy/awatary graczy w rankingu przez istniejący `sanitizeDisplayName`.
6. **i18n type-safe.** Wszystkie player-facing stringi przez `t('key')` z **literalnym** kluczem (nie `t(varName)`). Dodajesz klucze do `pl.ts` (diakrytyki OK od v0.27.0) **i** `en.ts` — parity wymuszone `en: typeof pl`. Namespace np. `hub.*`, `garage.*`, `quests.*`, `road.*`, `season.*`, `currency.*`.
7. **TypeScript strict.** Konstruktor: wszystkie PIXI/DOM membery inicjalizowane w pierwszym bloku przed metodami render. `?.()` to cichy skip — nie maskuj przerwanych wire'ów; loguj każdy link łańcucha przy diagnozie.
8. **Offline-first.** Nigdy nie blokuj przepływu menu/startu gry brakiem sieci. Zapis progresji: localStorage natychmiast, sync Supabase best-effort w tle, kolejność FK profil→scores zachowana.
9. **Complete file replacement** dla nowych plików; **targeted edits** dla dużych (`main.ts`, `menu-styles.css`, `index.html`).
10. **Przed dostarczeniem kodu:** brace-balance check + esbuild syntax verify. Flaguj ryzyka (perf, layout 375px, kolizje) w opisie fazy.
11. **PowerShell 5.1:** łańcuch komend przez `;` (NIE `&&`). Nigdy `git add -A` — zawsze jawne ścieżki. `git status --short` przed commitem. **Commit dopiero gdy Mariusz poprosi po teście** — commit+push w jednym bloku przez `;`.
12. **Notion po każdej committed fazie** (proaktywnie): Progress log `376bb3d0-8803-8175-a542-e52ad2d9f49b` + wiersz Changelog `38ebb3d0-8803-81ca-82c9-d1b76255e8a1` (Wersja|Typ|Partia|Feature|Opis|Data, emoji: 🚀 feature / 🎨 visual / 🔧 minor / 🐛 bugfix) + update PROJECT CONTEXT.
13. **Versioning (Opcja B):** nowy feature → minor bump we wszystkich zmienionych plikach + `id="credits"`.

---

## 5. Model danych (uzgodnij kształt w planie; wartości z Design Doc v1.2 / od Mariusza)
Nie wymyślaj liczb — pobierz z Design Doc; gdzie brak, **zaproponuj + zapytaj**, nie zgaduj.

```ts
// src/config/progression.ts  (kształt referencyjny — dostosuj do Design Doc v1.2)
export type Currency = 'trophies' | 'scrap' | 'keys';

export interface TrophyNode {
  id: string; threshold: number;            // próg trofeów
  reward: { kind: 'scrap'|'keys'|'skin'|'power'|'brawler'|'crate'; amount?: number; ref?: string };
  act: 1 | 2 | 3;                           // D1 / D7 / D30
}
export interface Quest {
  id: string; scope: 'daily'|'weekly'|'monthly';
  metric: string;                          // MUSI mapować na realny licznik w GameSession (patrz §8)
  target: number;
  reward: { currency?: Currency; amount?: number; cosmetic?: string };
}
export interface CratePool {
  id: string;
  entries: { ref: string; rarity: 'c'|'r'|'e'|'l'; weight: number }[]; // jawne, sumują się
  pityRareAt: number;                      // gwarantowany rzadki+ co N otwarć
}
export interface Season {
  id: string; nameKey: string;             // i18n key, nie literał
  startsAt: number; endsAt: number;        // countdown liczony z endsAt
  freeTrack: TrophyNode[];                 // free-only (etyczne)
}
```
Persistence (`ProgressionService` state, mirror lokalny + Supabase): `trophies`, `scrap`, `keys`, `ownedCosmetics[]`, `equippedLoadout[perBrawler]`, `questProgress{}`, `claimedNodes[]`, `crazyModeOn`, `pityCounter`, `seasonTrackClaimed[]`, per-brawler `crewRank`/`crewXp` (Ranga Załogi — **0 bonusów do statów**, tylko prestiż/kosmetyka).

> **Schema Supabase = osobna decyzja z bramką.** Zanim utworzysz tabele/kolumny na progresję, przedstaw propozycję schematu + RLS Mariuszowi do akceptu (jak przy anti-cheat/scores). Nie twórz cicho tabel.

---

## 6. Mapowanie symulacja → implementacja (sekcja po sekcji)
Otwórz makietę i odwzoruj przepływy. Dla każdej sekcji: dane z realnych źródeł, nie z makiety.

| Sekcja w makiecie | Real implementacja | Dane z | Zależności |
|---|---|---|---|
| Górny readout (profil, 3 waluty, ⚙️, S2 tab) | `HubShell` top bar | `ProfileService` (nick/lvl/avatar), `ProgressionService` (waluty), Season config | — |
| Nawigacja rail(desktop)/dock(mobile), 5 sekcji | `HubShell` router; jeden content, dwie chrome-warianty | — | — |
| BITWA: baner sezonu + countdown | `BattleSection` | `Season` z config (endsAt) | — |
| BITWA: 4 tryby + chipy map + GRAJ | `BattleSection` → istniejące `startGame(...)` | scenariusze/mapy z configu; **Pojedynek 🔒 = MP, wkrótce** | startGame API |
| BITWA: toggle Szalone Moce | wepnij w **istniejący** settings flag (sprawdź czy już jest!) → dodaje 4. slot 🎲 | Settings/`ProgressionService.crazyModeOn` | powers Tier 3 |
| GARAŻ: karuzela 8 brawlerów + Ranga Załogi | `GarageSection` | **`brawlers.ts` (realne nazwy)**, crewRank z ProgressionService | — |
| GARAŻ: 2 sloty loadoutu + picker (3 tiery) | `LoadoutPicker` → equipped loadout | **`powers.ts` (realny roster/tiery)** | **§18 loadout backend** (patrz §8) |
| GARAŻ: skiny (za Złom) | ownership + spend Złom | cosmetics config | — |
| GARAŻ: Zrzut + pity | `CrateOpen` | `CratePool` (jawne pule) | — |
| ROZKAZY: Dnia/Tygodnia/Miesiąca + Generał | `QuestsSection` | quest config + **realne liczniki** | **stat counters** (§8) |
| TROFEA: Trophy Road + akty D1/D7/D30 | `TrophyRoadSection` | `TrophyNode[]`, aktualne trofea | — |
| TROFEA: Season track | ta sama sekcja, free-only | `Season.freeTrack` | — |
| STATYSTYKI (tap awatara) | `StatsOverlay` | `ProfileService` + statystyki (Supabase/local) | stat counters |
| RANKING: mini-board + „TY" | `RankSection` → reuse istniejący `LeaderboardScreen` data | RPC `leaderboard_top` / `leaderboard_my_rank` | — |

---

## 7. Roadmapa faz (izolowane, math/layout-verified, twarde bramki)
Każda faza: **plan + weryfikacja layoutu @375px PRZED implementacją** → kod → esbuild verify → playtest Mariusza → dopiero next. Nowa duża faza = nowy czat (phase isolation).

- **HUB-0 — Fundament (shell + config skeleton, flag OFF).** `HubShell` (readout + nav + routing pustych sekcji), `progression.ts` skeleton, `ProgressionService` (localStorage mirror, bez Supabase jeszcze), namespace i18n `hub.*`. DoD: przełącza sekcje desktop+mobile @375px, flag `?hub=1`, zero wpływu na produkcję. **Gate:** layout nav OK na 375px landscape.
- **HUB-1 — BITWA (grywalny MVP).** Baner sezonu+countdown, tryby, mapy, GRAJ→`startGame`, toggle Szalonych Mocy wpięty w realny settings. DoD: z hubu odpalasz realny mecz każdym trybem/mapą. **Gate:** start gry działa, brak regresji istniejącego flow.
- **HUB-2 — GARAŻ (bez backendu loadoutu).** Selektor brawlerów (realne), Ranga Załogi (read-only), skiny (ownership+Złom), wejście do Zrzutu. Loadout UI **tylko jeśli §18 gotowe** — inaczej picker za sub-flagą/stub (patrz §8). **Gate:** czytelność karuzeli + slotów @375px.
- **HUB-3 — ROZKAZY.** Quest config + progress z realnych liczników. **Blokada:** wymaga stat counters (§8) — jeśli brak, faza czeka albo dowozi liczniki najpierw. **Gate:** progress rośnie z realnej rozgrywki.
- **HUB-4 — TROFEA + Season track.** Nody, claim flow (dolewa waluty przez ProgressionService), akty, sezon. **Gate:** claim persistuje (localStorage) + nie da się odebrać dwa razy.
- **HUB-5 — STATYSTYKI overlay.** Grid + per-brawler z ProfileService/Supabase. **Gate:** @375px bez scrolla kluczowych statów.
- **HUB-6 — RANKING integracja.** Mini-board reuse `LeaderboardScreen` (RPC), przypięty „TY", deep-link do pełnego ekranu. **Gate:** dane produkcyjne widoczne.
- **HUB-7 — Zrzut (crate open).** Pity + jawne pule + reveal juice (koszt mobile policzony, `prefers-reduced-motion`). **Gate:** pity działa deterministycznie, brak overdraw.
- **HUB-8 — Persistence Supabase + polish + walidacja mobile.** Sync progresji (po akcepcie schematu §5), EN parity, audyt @375px na realnym A54 (FPS/pamięć), a11y (focus, reduced-motion). **Gate:** playtest A54 + Michał.

Kolejność MVP: **HUB-0 → HUB-1** to najkrótsza droga do „hub odpala grę". Reszta gated danymi.

---

## 8. Zależności / bramki (UI nie może wyprzedzić swoich backendów)
- **Loadout (§18):** picker UI można zbudować, ale by moc realnie działała w meczu, musi istnieć w silniku. Pre-task **PROG-F1** (`targetRef` w AI wroga) jest wymagany przez Widmo/Hack/Granny. Sprawdź stan `powers.ts` + PowerSystem: które moce działają, które są UI-only-until-implemented. Oznacz jawnie; nie udawaj, że nieistniejąca moc działa.
- **Rozkazy/Statystyki:** wymagają **liczników statów w GameSession** (kill-rate, gemy, bossowie, score/time — powiązane z anti-cheat **L2b**). Jeśli brak — albo dowieź liczniki jako pierwsze, albo trzymaj quest progress za stubem i flaguj.
- **Persistence:** schema Supabase progresji = **osobny akcept** (§5). Do tego czasu wszystko działa offline-first na localStorage.
- **Damage-source distinction** (pre-task współdzielony z minami/ramming/questami) — sprawdź czy potrzebne dla metryk questów.

Na starcie każdej fazy zależnej: **zweryfikuj dostępność backendu w realnym kodzie i zaraportuj** przed pisaniem UI.

---

## 9. Czego NIE robić
- ❌ Nie zgaduj nazw brawlerów/mocy/wartości z makiety — makieta ma placeholdery. Dane = realne `.ts` + Design Doc.
- ❌ Nie renderuj hubu w PixiJS ani nie mieszaj z pętlą gry — to DOM overlay.
- ❌ Nie twórz tabel/kolumn Supabase bez akceptu schematu.
- ❌ Nie blokuj startu gry/menu brakiem sieci.
- ❌ Nie dodawaj sprzedaży mocy/losowości, ukrytych pul, spadających trofeów, ciemnych wzorców.
- ❌ Nie wprowadzaj full-screen overdraw dla juice; nie ignoruj `prefers-reduced-motion`.
- ❌ Nie `git add -A`, nie proponuj commita proaktywnie, nie łącz komend przez `&&`.
- ❌ Nie dostarczaj kodu bez brace-balance + esbuild verify i sprawdzenia @375px.
- ❌ Nie duplikuj istniejącego toggle Szalonych Mocy / ekranów — najpierw sprawdź, co już jest.

---

## 10. Pierwsze akcje agenta (dokładna sekwencja)
1. Grounding §1 (live `id="credits"` → PROJECT CONTEXT → Design Doc v1.2).
2. Otwórz `BrawlTanks_Menu_Sim_v1.html` — przejdź desktop+mobile, zanotuj przepływy do odwzorowania.
3. Przeczytaj realne źródła §2 (MainMenu, menu-styles, LeaderboardScreen/HowToPlayScreen, index.html, brawlers.ts, powers.ts, i18n, ProfileService, GameSession).
4. Zaraportuj **rozbieżności** makieta↔realny kod (nazwy, dostępne moce, istniejące toggle/ekrany, punkty wejścia startGame) i **stan zależności** §8.
5. Wejdź w **Plan Mode** i przedstaw plan HUB-0 (+ zarys HUB-1) w formacie §11. **Czekaj na akcept Mariusza. Nie pisz kodu wcześniej.**

---

## 11. Format outputu Plan Mode (przed każdą fazą)
Przedstaw zwięźle:
1. **Cel fazy** (1–2 zdania) + która to faza (HUB-N).
2. **Pliki** do utworzenia (complete replacement) i do edycji (targeted) — jawne ścieżki.
3. **Weryfikacja layoutu @375px landscape** — jak sprawdzisz kolizje/scroll/tap-targety (opis, nie kod).
4. **Zależności** — co w realnym kodzie musi istnieć; co jest stub/flag.
5. **Dane** — jakie stałe z `progression.ts`/Design Doc; czego brak → **rekomendacja + pytanie** (nie zgadywanie).
6. **Ryzyka** — perf/fill-rate, i18n parity, regresja istniejącego flow.
7. **DoD + gate** — co musi zadziałać, by faza była „done".
8. **Rekomendacja** — jedna konkretna, z uzasadnieniem, PRZED pytaniem o decyzję. Dwie opcje tylko przy realnej ambiwalencji (z trade-offami).

Po akcepcie: implementacja → esbuild/brace verify → oddajesz do playtestu. Po commit+push (na prośbę Mariusza): Notion Progress log + Changelog + PROJECT CONTEXT (§4.12).
