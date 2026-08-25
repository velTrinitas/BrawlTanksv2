# PROMPT — Port scenariusza CAPTURE THE FLAG (legacy `ctf.html` → obecna architektura)

> **STAN (2026-08-25):** F1–F4 DOSTARCZONE (v0.74.0–v0.76.0). Otwarte zostaje **F5** —
> polish, weryfikacja @375px, FPS/pamięć na realnym Androidzie, tuning balansu.
> Kontekst startowy z §0 pochodzi z epoki v0.69.0 i częściowo się zestarzał (m.in.
> mobile world zoom); obowiązuje zasada projektu „live + Notion wygrywają". Wartości
> liczbowe w §3 (spec z `legacy/ctf.html`) pozostają aktualne.

> **TRYB: PLAN MODE.** Najpierw plan + weryfikacja matematyczna. **Nie pisz kodu**, dopóki plan nie zostanie zatwierdzony przez Mariusza. To jest port produkcyjny do komercyjnej gry, nie prototyp — zero shortcutów.

---

## 0. Kontekst startowy (zrób NAJPIERW, przed jakąkolwiek analizą)

1. Odnieś się do live builda: https://veltrinitas.github.io/BrawlTanksv2/ — sprawdź `id="credits"`. Aktualna wersja bazowa to **v0.69.0**.
2. Odnieś się do Notion „PROJECT CONTEXT (live)" (`388bb3d0-8803-81e5-9db4-fc45de3ba55c`). Ta strona + live **wygrywają** z każdym starszym opisem/pamięcią.
3. Kluczowe fakty stanu, które MUSISZ uwzględnić:
   - **Mobile world zoom = 0.6** (v0.69.0, było 0.7). Override `?zoom=` (clamp 0.4..1.0). Desktop = 1.0. Projektuj czytelność pod **0.6 na 375px landscape**.
   - Render **2.5D baker jest domyślny** (od v0.68.0) dla gracza/wrogów/pocisków (`BAKER_ENABLED`, rollback `?baker=0`). Nowy scenariusz ma być z tym spójny — reużyj istniejącego pipeline'u, nie rób osobnego renderu czołgów.
   - Super powers Aura / MegaBomb / Freeze **już istnieją** w `systems/PowerSystem.ts` — reużyj, nie pisz od nowa.
   - Sterowanie mobilne przez `input/TouchInputManager.ts` (floating left joystick + prawy aim/fire stick + super button + long-press cycle). **Żadnej mechaniki zależnej od myszy/klawiatury/hover/PPM bez odpowiednika dotykowego.**
   - PL player-facing stringi **mogą** używać diakrytyków (Titan One, od v0.27.0). **Kod i komentarze: EN, bez diakrytyków.**

**Źródło prawdy o LOGICE scenariusza: plik `legacy/ctf.html`** (legacy Canvas 2D). Traktuj go jako behavioralną specyfikację — odtwarzasz *zachowanie*, nie kopiujesz Canvas 2D.

> **UWAGA — plik może jeszcze nie istnieć w repo.** Zanim ruszysz z analizą, sprawdź obecność `ctf.html` (np. `legacy/ctf.html`, ewentualnie inne miejsce w working dir). **Jeśli go NIE MA — NIE zgaduj logiki i NIE analizuj z pamięci.** Zatrzymaj się i poproś Mariusza, żeby wrzucił plik do `C:\Projects\BrawlTanksv2\legacy\ctf.html` (Mariusz doda go na Twoją prośbę). Dopiero po potwierdzeniu, że plik jest na dysku, przeczytaj go i kontynuuj. Ta wartość liczb z sekcji 3 pochodzi z tego pliku — bez niego port będzie niewierny.

---

## 1. Cel

Przeportować scenariusz **Capture the Flag** z `ctf.html` do obecnej architektury produkcyjnej (TS strict + PixiJS v7.4.3 + AudioSys/Howler + moduły `entities/systems/rendering/maps` + GameConfig→GameSession→transients + TouchInputManager + 2.5D baker), z:

- **(A) pełnym, wiernym (1:1) odtworzeniem logiki** wg sekcji 3,
- **(B) usprawnieniami wizualnymi/sensoryki + mobile-first** wg sekcji 4 (wyraźnie oddzielone od logiki, żeby nie zmieniać po cichu core mechanik).

---

## 2. ZANIM zaproponujesz plan — inwentaryzacja repo (zero zgadywania)

**Nie zgaduj sygnatur, nazw plików ani wartości.** Najpierw przeczytaj realne źródła i zmapuj legacy → obecne moduły. Minimalny zakres do przeczytania (dostosuj do faktycznej struktury repo):

- `src/main.ts` (gameLoop, frame transients, camera, zoom, shake)
- `src/types/` — `GameConfig`, `Scenario`, `MapType`/`ICollidable`, `Brawler`
- `src/services/GameSession.ts` (+ `ScoreService`, `SessionService`, `SupabaseScoreService`, `profileSync`)
- `src/systems/` — `Spawn.ts`, `PowerSystem.ts`, `Physics.ts`
- `src/entities/` — `Enemy.ts`, `Player.ts`, `Bullet.ts`, `EnemyBullet.ts`, `pickups/*`
- `src/config/` — `enemies.ts`, `brawlers.ts`, `difficulty.ts`, `constants.ts`, `powers.ts`
- `src/rendering/` — `Effects.ts`, `HUD.ts`, `SpriteFactory.ts`, `EnemySpriteBaker.ts`, `TankSpriteBaker.ts`
- `src/input/TouchInputManager.ts`
- `src/audio/AudioSys.ts`
- `src/maps/` — `CityMap.ts`, `DesertMap.ts`, `TropicsMap.ts` + podkatalogi propsów (`city/`, `desert/`, `tropics/`) jako **wzorzec** dla nowej mapy `fortified_ruins`; zwróć uwagę na `HoverRepairPad.ts`, `PowerHoverPad.ts`
- `src/ui/MainMenu.ts` + `src/ui/menu-styles.css` (scenario picker — CTF trzeba udostępnić)
- `legacy/ctf.html` (spec logiki) — jeśli nieobecny w working dir, poproś Mariusza o wrzucenie do `legacy/ctf.html` PRZED dalszą pracą (patrz uwaga w sekcji 0); nie kontynuuj bez tego pliku

W planie podaj **tabelę mapowania legacy → moduł docelowy** (co gdzie ląduje).

**Konwencje z Konstytucji, których pilnujesz:**
- `ICollidable {x,y,w,h,update()}` — `x/y = TOP-LEFT` hitboxu (NIE center).
- `buildings` (kolizja player/enemy) vs `solidBuildings` (kolizja pocisków).
- Per-feature texture caches; brawler renderpaths izolowane od enemy.
- Static-baked art (rysowany raz w konstruktorze) NIE odświeża się przez Vite HMR — wymaga re-entry mapy.
- All programmatic art — **zero external SVG/PNG**.
- Three-layer: GameConfig (immutable) → GameSession (runtime) → frame transients w `main.ts`.

---

## 3. LOGIKA DO ODTWORZENIA 1:1 (z `ctf.html`) — wartości dosłowne

> To jest kontrakt behawioralny. Jeśli którakolwiek wartość zderza się z obecnym configiem/balansem — **NIE zmieniaj po cichu**, zgłoś w planie jako konflikt z rekomendacją.

**Świat / kamera**
- `WORLD_W = 3000`, `WORLD_H = 3000`.
- Mega-boss survivalowy WYŁĄCZONY w CTF (`megaBossSpawned=megaBossKilled=true`, `regularKills` nieaktywne).

**Flagi (3 sztuki), stany `IDLE | CARRIED | CAPTURED`:**
| id | nazwa   | pozycja startowa (x,y) | kolor      |
|----|---------|------------------------|------------|
| 0  | ALFA    | (520, 350)             | `#3498db` (niebieski) |
| 1  | BRAVO   | (2750, 400)            | `#e74c3c` (czerwony)  |
| 2  | CHARLIE | (1500, 2780)           | `#f1c40f` (żółty)     |

- `pickupRadius = 80` (odległość gracz↔flaga IDLE do podniesienia).
- CARRIED: flaga podąża za graczem w punkcie `player.pos + wektor(player.angle + π) * 34px` (za czołgiem).
- Drop po śmierci: flaga → `IDLE`, pozycja = pozycja gracza, `dropTimer = now + 10000ms`. Po upływie timera bez podniesienia → reset do `startX/startY`.
- Podniesienie flagi: ustaw wszystkim strażnikom tej flagi (`guardFlagId === f.id`) stan `ALERT`.

**Hangar / baza domowa (strefa dostawy + strefa bezpieczna):**
- Prostokąt: `x=30`, `y=WORLD_H/2 - 250 = 1250`, `w=500`, `h=500` → obszar `x∈[30,530], y∈[1250,1750]`.
- Dostawa: gdy gracz NIESIE flagę i jest wewnątrz hangaru → flaga `CAPTURED`, `playerCarryingFlag=null`, `flagsCaptured++`, **HP gracza → max**, shake=20, eksplozja koloru flagi. Jeśli `flagsCaptured >= 3` → **VICTORY**.
- Strefa bezpieczna (w legacy hardkod, **do zamiany na strefę powiązaną z hangarem** — patrz sekcja 4): pociski wroga giną w strefie domowej; wrogowie nie wchodzą (zatrzymują się na granicy); strażnik w CHASE wraca do PATROL, gdy gracz jest w strefie domowej.

**Kara za niesienie flagi (carry penalty):**
- `speedMult = 1 - 0.10 - escalation*0.05` gdy niesie flagę.
- Czyli: escalation 0 → **×0.90**; escalation 1 → **×0.85**; escalation 2 → **×0.80**.

**Eskalacja (`escalation = min(2, flagsCaptured)`):**
- Detekcja strażnika: `detRadius = 200 + escalation*75`.
- Prędkość strażnika: `2.2 + escalation*0.4`.
- Fire rate strażnika: `2200 - escalation*300` ms.
- `escalation >= 2`: (quirk legacy — patrz sekcja 5) mnożnik prędkości **×1.20** w gałęzi strażników; bossy dostają **atak bombą co 5000ms** (`BossBomb` w kierunku `player.pos + rand(±80)` + gwizd/whistle SFX).

**Strażnicy (2 zwykłe czołgi na flagę, `isGuard`, `guardFlagId`), stany PATROL | CHASE | ALERT:**
- PATROL: krążą wokół flagi po okręgu `R=160`, `patrolAngle += 0.008`, ruch `×0.7 * speed`.
- CHASE: prą do gracza; strzelają gdy `dist < 500`; zatrzymują się przy granicy strefy domowej (`x≈535`, i nie wchodzą gdy gracz też przy granicy).
- ALERT (flaga niesiona): pościg z `×1.25 speed`.
- Powrót do PATROL: gdy gracz w strefie domowej (`player.x < 450`) LUB gracz opuścił `detRadius + 80`.
- Clamp: `x >= 535` (nie wchodzą do strefy domowej), oraz świat `[30, WORLD-30]`.

**Super-bossy (3, jeden „pilnujący" na flagę):**
- Spawn przy fladze (`flagPos + (180, 30)`).
- Po zabiciu: `ctfBossKilled[i]=true`, **respawn po 60000ms** (`ctfBossRespawnDuration`), floating text „⚠️ BOSS RESPAWN!".
- (Quirk legacy: pozycje respawnu są INNE niż spawnu, zahardkodowane — patrz sekcja 5.)

**Reszta spawnu na start:**
- 10 zwykłych roamerów (`new Enemy()`), 12 gemów.

**Warunek zwycięstwa i wynik:**
- 3 flagi zdobyte → VICTORY.
- Trophy (legacy `calcTrophyChangeCTF`): za 3 flagi `base=9` + bonusy (`gameTime<180s → +2`, `kills>=10 → +2`, `hp >= maxHp*0.5 → +2`) × mnożnik trudności (`easy 0.5 / normal 1.0 / hard 1.5 / nightmare 2.5`), `max(1, ceil(...))`. Za 2 flagi = +3, za 1 = +1, za 0 = przegrana.
- Śmierć gracza = natychmiastowy GAME OVER (single-life). Przy śmierci z flagą — najpierw drop flagi (patrz wyżej), potem game over.

**Współistniejące mechaniki (reużyj istniejących systemów, nie przepisuj):**
- Super powers: MegaBomb (R=230, cd 20s, shake), Freeze (5s, cd 25s, zamraża wrogów i ich pociski), Aura (deflect).
- Krzaki = stealth (wrogowie nie widzą; **strzał odkrywa**).
- Hangar naprawczy / repair pad: stój nieruchomo 3s → +1 HP, cd 60s.
- PowerCube (czerwony +5% siły strzału / niebieski +HP), Heart (+1 HP), Magnet, gemy (10 = +3 super charges).

---

## 4. USPRAWNIENIA (wyraźnie oddzielone od logiki z sekcji 3)

> Oznaczenie: **[MUST]** = wymagane by przejść mobile/Konstytucję; **[REC]** = rekomendowane, do potwierdzenia.

**Architektura / integracja**
- **[MUST]** Logika CTF w dedykowanym module scenariusza (np. `systems/ctf/CtfSystem.ts` lub `scenarios/CaptureTheFlag.ts`), sterowana przez `GameSession`, ze stanem flag/eskalacji trzymanym w GameSession, a nie w globalach `main.ts`. `Flag` i `Hangar` jako propsy/encje mapy z `ICollidable` gdzie zasadne (x/y = TOP-LEFT).
- **[MUST]** Nowa mapa **`fortified_ruins`** jako moduł programmatic-art wg wzorca `CityMap/DesertMap/TropicsMap` (texture + layout config, border-forteca, kilka propsów, 3 „sanktuaria" flag, centralny hangar). Klimat spójny (ruiny/forteca — **żadnych anachronizmów**).
- **[MUST]** Wpiąć CTF w scenario picker (`MainMenu` + `menu-styles.css`); `SCENARIO_FIXED_MAPS: ctf='fortified_ruins'`.
- **[MUST]** Render czołgów/pocisków przez istniejący **2.5D baker** (spójność z resztą gry). Flaga + hangar = custom programmatic props.
- **[MUST]** Audio przez `AudioSys` (Howler), nie surowe podmiany `.ogg`. Stany muzyki: eksploracja → niesienie flagi (tension) → capture (fanfara). Zmapuj do istniejącego API AudioSys.
- **[MUST]** Strefa domowa: zamień hardkod `x<450 / x≥535` na **strefę powiązaną z prostokątem hangaru** (czytelna granica), zachowując zachowanie (pociski wroga giną w strefie, wrogowie nie wchodzą, CHASE→PATROL w strefie).

**Mobile-first (375px gate + zoom 0.6 + fill-rate)**
- **[MUST]** **Wskaźniki krawędziowe off-screen** dla 3 flag + hangaru (kolor drużyny + dystans w px/m). Przy zoom 0.6 i świecie 3000×3000 to warunek grywalności.
- **[MUST]** **Panel postępu flag** (3 ikony, stan IDLE/CARRIED/CAPTURED) — sprawdź kolizje/nadpisania z istniejącym HUD (super power panel, score, timer) na **375px landscape** PRZED dostarczeniem. To znany soft-spot.
- **[MUST]** Kara za niesienie flagi **czytelna**: widoczne spowolnienie + wskaźnik „SPOWOLNIENIE"/ikona; flaga ciągnie się za czołgiem ze smugą w kolorze drużyny.
- **[MUST]** Telegraph dostawy: gdy gracz niesie flagę → pulsująca strzałka/beacon w stronę hangaru + prompt „DOSTARCZ FLAGĘ"; przy wejściu w strefę mocny błysk.
- **[MUST]** Fill-rate: pre-render statycznej mapy do offscreen; viewport culling flag/strażników/bossów/roamerów; pooling kraterów bomb i eksplozji (`Effects.ts`). **Bez pełnoekranowego overdraw** (god rays, wielkie glow/gradienty alpha, screen-blend). Glow flag/hangaru w małym promieniu lub zbakowany.
- **[REC]** Próg jakości mobile: roamery **10→7** na mobile (potwierdź). Lewary do strojenia bez rebuilda: liczba roamerów, `ENEMY_BAKE_ANGLES`, promień glow.

**Sensoryka / Flex (Czytelność > Sensoryka > Flex)**
- **[MUST]** Telegraph stanu strażnika: PATROL (spokojny, orbituje) vs ALERT/CHASE (czerwony wykrzyknik, agresywna poza). Konstytucja: telegraph przed atakiem NPC.
- **[MUST]** Telegraph bomby bossa: **cień/marker na ziemi PRZED uderzeniem** (fairness = brak „śmierci nie wiadomo skąd").
- **[REC]** Flex przy capture: flash ekranu, konfetti (pooled), duży popup score/trophy, iskry przy hp-restore, fanfara.
- **[REC]** Flex przy eskalacji (2. flaga): puls ekranu + banner „WROGOWIE WŚCIEKLI!" + tania winieta + wzrost intensywności muzyki.
- **[REC]** Telegraph respawnu bossa: warning text + efekt portalu spawnu.

---

## 5. Quirki legacy — świadome decyzje (NIE kopiować bezmyślnie)

1. **Eskalacja „+20% wszystkim wrogom":** w kodzie legacy `this.speed *= 1.20` działa **tylko w gałęzi strażników**, mimo komentarza „all enemies". Rekomendacja: odtworzyć **zachowanie obserwowalne** (tylko strażnicy) + wystawić flagę `CTF_ESCALATION_GLOBAL_SPEED` (domyślnie false = legacy). Zgłoś jako decyzję.
2. **Pozycje respawnu bossów ≠ pozycje spawnu** (respawn zahardkodowany na inne współrzędne). Rekomendacja: ujednolicić do pozycji flagi. Zgłoś jako decyzję.
3. **Strefa domowa na magicznych współrzędnych** — patrz [MUST] w sekcji 4 (powiązać z hangarem).

---

## 6. DO POTWIERDZENIA W PLANIE (nie zgaduj — zapytaj Mariusza)

1. **Scoring/Supabase dla CTF:** rekomendacja — MVP bez wpinania leaderboardu Supabase (nie ruszać `score_version`), tylko lokalne staty (flagi/czas/kille). Potwierdź.
2. **Single-life vs revive:** rekomendacja — zostać przy single-life (jak legacy); revive = faza Poki/rewarded-video. Potwierdź.
3. **Zakres mapy `fortified_ruins`:** rekomendacja — MVP: funkcjonalna arena ruin (podłoże + mur-border + kilka propsów + 3 sanktuaria flag + hangar), nie pełne zapropsowanie jak City. Potwierdź.
4. **Próg jakości mobile:** roamery 10→7 na mobile. Potwierdź.
5. Quirki z sekcji 5 (globalna eskalacja, pozycje respawnu). Potwierdź kierunek.

---

## 7. Weryfikacja matematyczna (AABB) — WYMAGANA w planie, przed kodem

Policz i pokaż w planie (np. skryptem Python), że przy świecie 3000×3000:
- Prostokąty **flag** (z hitboxem podniesienia R=80) NIE nachodzą na hangar ani na siebie.
- **Hangar** `[30..530] × [1250..1750]` nie koliduje z żadnym propsem mapy ani ze spawnami bossów/strażników.
- Spawny **super-bossów** (`flagPos + 180,30`) i **strażników** (`flagPos ± 80,60`) mieszczą się w świecie i nie wpadają w strefę domową ani w bordery.
- Orbita PATROL strażnika (R=160 wokół flagi) nie wychodzi poza świat i nie przecina hangaru.
- Ścieżki dostawy z każdej flagi do hangaru są przejezdne (brak zamknięcia propsami).
- Czytelność elementów przy **zoom 0.6 na 375px**: rozmiary flag/wskaźników/HUD przeliczone do px ekranowych.

---

## 8. Format planu (output plan mode)

Zwróć plan zawierający, w tej kolejności:
1. Potwierdzenie stanu bazowego (live `id="credits"` + zoom 0.6 + baker default).
2. Tabela mapowania legacy → moduły docelowe (sekcja 2).
3. Lista realnie przeczytanych plików źródłowych (dowód „zero zgadywania").
4. Odtworzenie logiki 1:1 — potwierdzenie wszystkich wartości z sekcji 3 + zgłoszone konflikty z obecnym configiem.
5. Usprawnienia [MUST]/[REC] z sekcji 4 — jak dokładnie.
6. Decyzje do potwierdzenia (sekcja 6) + kierunek na quirki (sekcja 5).
7. **Weryfikacja AABB** (sekcja 7) z liczbami.
8. **Koszt mobile** całości (enemy count/fill-rate/nowa mapa) + progi jakości/lewary.
9. Ryzyka: 375px HUD collision, fill-rate przy 3000×3000, czytelność przy 0.6.
10. Podział na fazy implementacji (numerowane, z explicit approval gate między fazami). Sugerowana kolejność: (F1) mapa `fortified_ruins` + wpięcie scenariusza + GameConfig/GameSession → (F2) rdzeń logiki CTF 1:1 (flagi/hangar/eskalacja/strażnicy/bossy/win) → (F3) mobile UX (off-screen indicators, HUD flag panel, carry telegraph) → (F4) sensoryka/flex + audio → (F5) polish + weryfikacja 375px/perf.

**STOP po planie. Czekaj na akceptację Mariusza przed pisaniem jakiegokolwiek kodu.**

---

## 9. Reguły dostarczania kodu (gdy plan zatwierdzony)

- COMPLETE FILE REPLACEMENTS (wyjątek: bardzo duże pliki `main.ts`/`menu-styles.css`/`index.html` → targeted edits). Nigdy kod inline.
- Esbuild syntax check + brace-balance przed dostarczeniem `.ts`.
- `git status --short` przed commitem. `git add <path>` explicite (NIE `git add -A`).
- **Nie proponuj commita proaktywnie** — Mariusz prosi po teście.
- Przy >2 iteracjach bez progresu na buga wizualnego/crash — poproś o screenshot F12 Console przed 3. próbą.
- Silent `try/catch` zakazany — loguj `error.stack` + kontekst encji.
- PL z diakrytykami w player-facing stringach; EN bez diakrytyków w kodzie/komentarzach.
