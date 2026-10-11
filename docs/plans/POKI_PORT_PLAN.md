# PLAN: Port Brawl Tanks na Poki (faza POKI)

Stan: 2026-10-09, baza v0.243.0 (live) + v0.244.0 niezacommitowane (grunt na kafle).
Źródła: oficjalny Poki Developer Guide (developers.poki.com/guide/*, stan na 10.2026)
+ audyt kodu repo. Pozycje oznaczone **[NIEPOTWIERDZONE]** trzeba zweryfikować z Poki,
zanim zapadnie decyzja.

---

## 0. Podsumowanie dla decyzji (TL;DR)

Technicznie gra jest blisko: offline-first, fonty lokalne, zero analytics i zero
zewnętrznych linków, Supabase już za flagą `CLOUD_LIVE`. Do usunięcia są **4 blokery**
i **1 ryzyko biznesowe**:

| # | Bloker | Skala | Rozwiązanie |
|---|--------|-------|-------------|
| B1 | **Rozmiar: dist 62 MB** (sfx/muzyka 49 MB, JS 2,6 MB). Cel Poki: <8 MB startowo, ładowanie <10 s | DUŻA | Muzyka leniwie per mapa + rekompresja, start = tylko hub |
| B2 | **Supabase = zewnętrzny ruch**, domyślnie blokowany przez CSP Poki | ŚREDNIA | Build Poki startuje **offline** (`CLOUD_LIVE=false`), wniosek CSP równolegle |
| B3 | **Brak integracji SDK** (init, loading, gameplayStart/Stop, reklamy z pauzą i wyciszeniem) | ŚREDNIA | Warstwa `src/platform/` + punkty wpięcia w `main.ts` |
| B4 | **Rzeczy zakazane w buildzie Poki**: fullscreen w Intro, service worker/PWA, flagi dev (`?diag`, `?perf`, `?seed`...), wpisywany nick, strzałki przewijające stronę | MAŁA–ŚREDNIA | Profil buildu `POKI` wyłącza je centralnie |

**Ryzyko biznesowe R1 — retencja w testach Poki.** Player fit test wymaga średnio
**>3 min gry**, przy czym ≥25% sesji musi przekroczyć 3 min. Mediana naszego meczu to
~20 s (pomiar z okna testów). Liczy się czas sesji na stronie, nie długość meczu, więc
hub i „jeszcze jedna runda” są kluczowe. To trzeba zmierzyć, a nie zakładać.

**Ryzyko prawne R2 — nazwa.** Słowo „Brawl” plus wzorzec Brawl Stars może zostać uznane
za „misused IP”, a za to Poki odrzuca grę natychmiast. **Rekomendacja: na Poki
wystartować jako SIGMA TANKS** (rebrand jest już zaplanowany i tapety intro już są).

**Ryzyko umowy R3 — wyłączność webowa** (preferowana przez Poki, domyślnie 5 lat):
GitHub Pages i paczki Cloudflare to publiczny web. Do decyzji: ukrywamy je
po podpisaniu umowy (rekomendowane, bo umowa z wyłącznością daje revenue share i
marketing), albo idziemy w umowę bez wyłączności (jednorazowa opłata, zero
revenue share).

**Rekomendacja ogólna:** robimy port etapami P0–P7, wszystko za flagą buildu `POKI`.
Live na GitHub Pages zostaje nietknięty do decyzji z R3. Pierwszym kamieniem milowym
jest **build, który przechodzi Poki Inspector bez ostrzeżeń** i trafia do player fit
testu. Leaderboard i chmura NIE są warunkiem startu.

---

## 1. Fakty o Poki, na których opiera się plan

Lejek procesu: rejestracja w P4D (app.poki.dev) → Inspector → upload → moderacja →
≥10 nagranych playtestów + miniatura → **Player fit test** (500 graczy, ~5 h, pomiar
tylko czasu gry, próg: śr. >3 min i ≥25% sesji >3 min) → **Web fit test** (~10 000
graczy, 3–5 dni, nie da się przerwać, bez zarobku; CTR miniatury, czas na stronie,
konwersja do pierwszego `gameplayStart()`; skala 0–5 względem kategorii) → Final
review (1–2 tyg.) → umowa → QA (pętle zgłoś–popraw) → Soft Release (2–3 tyg., cel
≥1 reklama/DAU) → Global Release (+2–3 tyg., animowana miniatura). Od fit testu do
global release realnie **2–3 miesiące**.

Wymagania techniczne:
- SDK v2: `https://game-cdn.poki.com/scripts/v2/poki-sdk.js` (to jedyny dozwolony
  zewnętrzny skrypt).
- `PokiSDK.init()`: grę kontynuujemy w `.then` **i** w `.catch` (adblock nie może
  blokować gry).
- `gameLoadingFinished()`: raz, kiedy gra jest gotowa do interakcji.
- `gameplayStart()`: przy **pierwszym inpucie gracza**, nie przy ładowaniu.
  `gameplayStop()`: przy każdej przerwie (pauza, menu, koniec meczu). Nigdy dwa takie
  same zdarzenia pod rząd i żadnych zdarzeń w trakcie reklamy.
- `commercialBreak()`: tylko tuż przed powrotem do rozgrywki. Przed wywołaniem pauza,
  wyciszenie i odcięcie klawiatury, a przywrócenie w `.then` (bo `onStart` może nie
  wywołać się wcale).
- `rewardedBreak()` jest opcjonalny i ma surowe zasady UI (ikona 🎬, nie zielony
  przycisk, obok opcja „kontynuuj” co najmniej tej samej wielkości, nagroda nie może
  blokować postępu).
- Desktop, mobile i tablet są obowiązkowe (tablet z kontrolkami dotykowymi). Format
  16:9, skalowanie do 640×360 / 836×470 / 1031×580. Na mobile gra musi wypełniać
  ekran.
- Strzałki, spacja i kółko nie mogą przewijać strony nadrzędnej. Wymagana pauza
  pod ESC/spacją.
- Zakazane: ruch zewnętrzny bez zgody CSP (Google Analytics nigdy), splash screeny,
  wychodzące linki (tylko `openExternalLink`), czat, zewnętrzne logowanie, zbieranie
  danych osobowych, IAP i UI kupowania waluty lub „usuń reklamy”, gambling. Logo
  studia wolno pokazać tylko na ekranie ładowania.
- localStorage w try/catch, gra musi działać w trybie incognito. Postęp zapisany albo
  jasno zakomunikowany.
- Poki User Accounts: `login()` tylko na akcję gracza. localStorage synchronizuje się
  automatycznie dla zalogowanych (limit 1 MB po gzip, prefiks `poki_ignore`
  wyklucza klucz).
- Lokalizacja: `PokiSDK.getLanguage()` + przełącznik w menu. Poki sugeruje kolejność
  EN, FR, IT, DE, ES, TR.
- Miniatura: kwadrat ≥628×628, bez tekstu, pełny kadr, nie w kolorze zbliżonym do
  #83FFE7.
- Narzędzie: **Poki Inspector** (inspector.poki.dev): checklista QA, log zdarzeń
  SDK, czas ładowania, rozmiar, test mobile przez QR, ostrzeżenia o zewnętrznym
  ruchu. Jest też `poki-cli` do uploadu.

**[NIEPOTWIERDZONE] do zapytania Poki:**
1. Twardy limit rozmiaru. Aktualny guide mówi tylko „<10 s ładowania”, stara strona
   mówi „<8 MB startowo”. Przyjmujemy 8 MB jako cel.
2. Czy sklep za walutę **zdobywaną w grze** (sigmy) i skrzynki z losowymi kosmetykami
   **bez prawdziwych pieniędzy** są OK.
3. Czy Supabase (wyniki, ranking, profil) dostanie zgodę CSP.
4. Czy portrait-overlay („obróć telefon”) przy landscape-only przejdzie QA.
5. Status naszych hostingów web przy wyłączności.

---

## 2. Stan kodu vs wymagania (audyt, fakty z repo)

| Obszar | Stan | Co zrobić |
|--------|------|-----------|
| Build | `vite.config.ts:37` base `/BrawlTanksv2/`; drugi entry `lab.html` | `build:poki`: base `./`, bez `lab`, bez sw/manifest |
| Rozmiar | public 59 MB, sfx 49 MB (mars2.ogg 7,5, music_main1 5,4, ctf 4,2, Castle1 3,9, hub 3,7, tropiki.mp3 3,4 MB...), ranks 3,2 MB, assets 4,5 MB, JS 2,6 MB | B1, patrz P2 |
| Chmura | `CLOUD_LIVE` (`cloud.ts:30`) strzeże profilu, progresji, wyników, rankingu, coop-signaling; telemetria osobno `TELEMETRY_LIVE` | Poki: oba = false, ranking ukryty |
| Zapis | localStorage jest źródłem prawdy (dobrze); ~20 kluczy `bt2:*` / `brawltanks.*` | Audyt try/catch + test incognito; rozmiar <1 MB |
| Nick | Wpisywany ręcznie (`IdentityScreen`, `ProfileEditScreen`) + filtr wulgaryzmów | Poki: **tylko generator** (`nickGenerator.ts`), bez pola tekstowego |
| Pauza | Brak pauzy rozgrywki na blur/visibility, jest tylko wyciszenie audio (`AudioSys.ts:301`) | Pauza (ESC + blur + reklama) na zegarze meczu |
| Wyciszenie | `Howler.mute(...)` (`AudioSys.ts:367`) | Dodać powód „ad” do istniejącej logiki mute |
| Klawiatura | Tylko Space ma `preventDefault` (`main.ts:2186`) | Dodać strzałki, Tab, PageUp/PageDown |
| Fullscreen | `IntroScreen.ts:84,192-201` | Wyłączyć w POKI |
| Intro/splash | IntroScreen z tapetami + endcard `gem.png` | W POKI pomijamy intro i idziemy prosto do hubu; endcard do weryfikacji |
| PWA | sw.js (`index.html:230`), `PWAInstallManager` | Wyłączyć w POKI |
| Flagi dev | ~37 plików czyta `location.search` bez centralnego helpera | POKI: ignorować flagi dev (helper `devFlagsAllowed()`) |
| Wersja | `#credits` w `index.html:199` | Może zostać (mała), do decyzji |
| Sklep | Waluta tylko `sigma`, zero kodu realnych pieniędzy, crates za sigmy | Zostaje, pytanie do Poki (patrz 1.2) |
| i18n | PL + EN | Start: EN domyślnie przez `getLanguage()`, PL zostaje; kolejne języki po fit teście |

---

## 3. Fazy wykonania

Każda faza = osobny commit + Twój playtest, zgodnie z naszym workflow. Wersje minor
od v0.245.0.

### P0 — Decyzje i konto (Mariusz, 0 kodu)
- Rejestracja w P4D, akceptacja regulaminu, weryfikacja danych płatności.
- Decyzje: **nazwa** (rek. Sigma Tanks), **wyłączność** (rek. TAK, hosting
  GitHub Pages wygaszamy w dniu umowy, nie wcześniej), pytania 1–5 z sekcji 1 do
  supportu Poki.
- Kryterium wyjścia: konto aktywne, decyzje zapisane w Notion.

### P1 — Profil buildu POKI + warstwa platformy (≈1–2 dni)
- `src/config/platform.ts`: `PLATFORM = import.meta.env.VITE_PLATFORM ?? 'web'`,
  `isPoki()`. Decyzja w czasie buildu, nie z URL, więc gracz nie może jej przełączyć.
- `npm run build:poki`: `VITE_PLATFORM=poki VITE_BASE=./`, bez entry `lab`, bez
  sw.js/manifest. W POKI wymuszone `CLOUD_LIVE`, `TELEMETRY_LIVE` i coop = off.
- `src/platform/PlatformSDK.ts`: interfejs (`init`, `loadingFinished`, `gameplayStart`,
  `gameplayStop`, `commercialBreak`, `rewardedBreak`, `getLanguage`) z dwoma
  implementacjami: `NullSDK` (web, nic nie robi) i `PokiSDKAdapter`. Adapter jest
  **idempotentny**: pamięta stan i nie wysyła dwóch takich samych zdarzeń pod rząd,
  co z góry załatwia najczęstszy powód odrzucenia w QA. Każdy wyjątek logujemy ze
  stackiem, bez cichego skip.
- Skrypt SDK ładowany tylko w buildzie POKI (wstrzykiwany do `index.html` przez
  plugin Vite).
- `devFlagsAllowed()`: w POKI flagi `?diag/perf/seed/range/...` są ignorowane.
- Kryterium: build web bajt w bajt zachowuje się jak dziś, a build POKI startuje w
  Inspectorze.

### P2 — Dieta rozmiaru (B1, ≈2–3 dni, NAJWIĘKSZA PRACA)
Cel: **start ≤8 MB** (JS + CSS + hub + font + SFX rdzenia), reszta leniwie.
1. **Pomiar przed**: skrypt `tools/size-report.mjs` (lista dist wg rozmiaru +
   co ładuje się do pierwszej interakcji, z Network w Playwright).
2. **Muzyka**: rekompresja OGG do ~64–80 kbps mono/joint-stereo (ffmpeg już mamy).
   Szacunek: 49 → ~12–15 MB łącznie. Wymaga odsłuchu przez Ciebie, bo to decyzja
   „na ucho”. `tropiki.mp3` zamieniamy na ogg z fallbackiem.
3. **Leniwe ładowanie**: w preloadzie tylko muzyka hubu i SFX rdzenia; muzyka mapy
   ładuje się w trakcie LoadingScreen (już mamy minimalne 2,5 s). Howler `html5`
   streaming dla długich ścieżek.
4. `ranks` 3,2 MB / `assets` 4,5 MB / tapety: WebP + leniwie (rangi tylko na
   ekranie profilu).
5. JS 2,6 MB: `@supabase/supabase-js` przez dynamiczny `import()` (w POKI w ogóle
   się nie załaduje), dev-narzędzia (sigma bot, range, lab) poza bundlem.
- Koszt mobile: **pozytywny** (mniej pamięci audio, szybszy start na A54).
- Ryzyko: hitch przy pierwszym odtworzeniu muzyki mapy. Mitygacja: ładowanie w
  LoadingScreen, a jeśli plik się nie zdąży wczytać, start bez muzyki z fade-in.
- Kryterium: Inspector pokazuje ładowanie <10 s na profilu „mobile 4G”, start
  ≤8 MB.

### P3 — Cykl życia i reklamy (B3, ≈2 dni)
Punkty wpięcia (z audytu `main.ts`):
| Zdarzenie gry | Miejsce | Wywołanie |
|---|---|---|
| Hub gotowy po bootstrapie | koniec inicjalizacji / `menu.showHub()` pierwszy raz | `gameLoadingFinished()` (raz) |
| Pierwszy input w meczu po `gameState='PLAYING'` (`:4157`) | input handler | `gameplayStart()` |
| GAMEOVER (`:4996`), VICTORY (`:5098`), pauza, wyjście do hubu (`:2041`) | — | `gameplayStop()` |
| „Graj ponownie” / start meczu z hubu (`startGame` `:2495`) | **przed** LoadingScreen | `commercialBreak()` → pauza+mute → `.then` start |
- **Pauza rozgrywki** (nowa): ESC/P + utrata fokusu + reklama → zatrzymanie zegara
  meczu (nie `Date.now`; patrz COOP), overlay „PAUZA” z dużym przyciskiem do
  wznowienia (wygodnym na dotyku).
- Mute: nowy powód `adMuted` w `AudioSys`, łączony z istniejącym `pageHidden`.
- Klawiatura podczas reklamy: globalny `inputLocked`.
- **Rewarded (opcjonalnie, rekomendacja: PO soft release)**: np. „🎬 podwój sigmy
  z meczu”. Na start bez tego, żeby nie dokładać ryzyka QA.
- Częstotliwość reklam kontroluje Poki (ma throttling), my tylko wywołujemy
  `commercialBreak` w dozwolonych miejscach.

### P4 — Zgodność z regułami (B4, ≈1–2 dni)
- Intro: w POKI pomijamy IntroScreen + fullscreen; logo/tapeta tylko jako tło
  LoadingScreen.
- Nick: w POKI tylko generator (przycisk 🎲 „losuj nick”), bez pola tekstowego.
  Zero danych osobowych.
- Ranking globalny: ukryty w POKI (sekcja w hubie pokazuje rekordy lokalne / „Twoje
  rekordy”). Po zgodzie CSP: włączenie z linkiem do polityki prywatności.
- Klawiatura: `preventDefault` na strzałkach, spacji, Tab, PageUp/PageDown, Home,
  End w trakcie gry; kółko już jest obsłużone.
- localStorage: wrapper `safeStorage` (try/catch + pamięć RAM jako fallback);
  komunikat „postęp nie zostanie zapisany” w incognito.
- Język: `getLanguage()` → `en` domyślnie, `pl` dla `pl`, ręczny przełącznik w
  ustawieniach zostaje.
- Portrait: overlay „obróć telefon” zostaje. Jeśli QA zażąda, wtedy pełnoekranowy
  komunikat w portrecie (pytanie 4).
- Linki: żadnych (w audycie brak). `sigmatanks.eu` występuje tylko w komentarzach.

### P5 — Retencja pod fit test (R1, ≈zakres do decyzji po pomiarze)
Najpierw **pomiar**, dopiero potem ewentualne zmiany:
- Pre-test: 10 nagrań playtestów (wymóg Poki) + nasz pomiar czasu sesji w buildzie
  POKI (lokalnie, bez wysyłki).
- Dźwignie, które już mamy: rozkazy (questy), skrzynki, sklep, trofea, 6 map.
  Kluczowa jest **pętla „Graj ponownie” jednym tapnięciem** z ekranu końca meczu
  (hub→mecz bez zbędnych ekranów) oraz pierwsza sesja (tutorial, D1).
- Nie projektujemy tu nowych funkcji na zapas. Decyzja zapadnie po wyniku player fit
  testu.

### P6 — Materiały strony gry (Mariusz + art)
- Miniatura statyczna 628×628+ (kwadrat, bez tekstu, czołg + akcja): obraz od
  Ciebie (zgodnie z decyzją o arcie hubu: JPG/PNG w jakości AI).
- Animowana miniatura: dopiero w soft release.
- Opis, sterowanie, tagi i kategoria (sugestia: Tank / Arena / .io-like), tytuł.

### P7 — Weryfikacja i zgłoszenie
- Checklista Inspectora: zero ostrzeżeń (external resources, zdarzenia SDK,
  rozmiar).
- Test matrix: desktop Chrome/Firefox/Safari, A54 (QR z Inspectora), tablet (iPad
  lub Android), adblock ON, incognito.
- Playwright: smoke test buildu POKI z mockiem `window.PokiSDK` (asercja kolejności
  zdarzeń: brak duplikatów, brak zdarzeń w trakcie reklamy).
- Upload (`poki-cli` lub panel) → 10 playtestów → player fit test.

**Szacunek kodu P1–P4: ~7–10 dni roboczych.** Potem czas jest po stronie Poki (testy,
review, QA), realnie 2–3 miesiące do global release.

---

## 4. Bramka COOP/MP

1. **Determinizm**: pauza (gracz, blur, reklama) zatrzymuje **zegar meczu**, nie
   używa `Date.now`. Przy okazji naprawia znany precedens z Zamkiem.
2. **Krok logiki**: podczas pauzy `runLogicStep` nie jest wywoływany, a catch-up po
   wznowieniu jest **resetowany**. Inaczej po reklamie gra by „dogoniła” 30 s
   naraz, co jest krytycznym bugiem.
3. **Dane z wersją**: brak zmian balansu, `SIM_VERSION` bez zmian. Platforma nie
   wchodzi do symulacji.
4. **Źródło obrażeń**: bez zmian.
5. **Lokalne vs wspólne**: SDK, reklamy, rozmiar assetów, UI nicka i rankingu są
   czysto lokalne. Pauza w przyszłym koopie wymaga konsensusu obu stron, to temat
   na ETAP 1; dziś solo.

## 5. Koszt mobile

- SDK Poki: mały skrypt ładowany asynchronicznie. Reklamy wymagają pauzy renderu,
  a nie dokładają fill-rate.
- P2 **obniża** pamięć i czas startu (muzyka nie jest w całości w RAM).
- Ryzyko: leniwe dociąganie muzyki na słabym łączu. Gra startuje bez muzyki
  zamiast czekać.
- Werdykt o mobile wyda A54 i QR Inspectora, nie lektura kodu.

## 6. Ryzyka i wycofanie

| Ryzyko | Mitygacja |
|---|---|
| Zmiany Poki psują web | Wszystko za `isPoki()` w czasie buildu; build web bez zmian, `NullSDK` |
| Rekompresja psuje brzmienie | Odsłuch Mariusza, oryginały w repo, parametr w skrypcie |
| Odrzucenie przez IP („Brawl”) | Start jako Sigma Tanks |
| Sklep/skrzynki uznane za gambling | Pytanie do Poki **przed** uploadem; wariant awaryjny: w POKI skrzynki z jawną zawartością |
| Fit test < 3 min | Pomiar przed testem, P5; drugi test można zrobić po poprawkach |
| Wyłączność a GitHub Pages | Decyzja P0, wygaszenie dopiero po podpisaniu |

## 7. Decyzje, których potrzebuję od Ciebie

1. Nazwa na Poki: **Sigma Tanks** (rek.) czy Brawl Tanks?
2. Wyłączność webowa: **tak** (rek.) czy umowa bez wyłączności?
3. Start bez chmury i rankingu globalnego (rek.) z wnioskiem CSP równolegle?
4. Czy mogę zacząć od P1 + P2 (platforma + dieta rozmiaru), a Ty w tym czasie
   zakładasz konto P4D i wysyłasz pytania do Poki?
