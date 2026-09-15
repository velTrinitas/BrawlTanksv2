# AI Tester (SigmaTester) — CHECKLISTA ORACLES + BACKLOG

> Stan gry: **v0.178.0** (Zamek + Uratuj Królową na produkcji; KTB + CTF). Implementacja bota: **Claude Fable 5.1**. Ten plik = kontrakt: każdy check = ASERCJA + wymagany STAN z `window.__sigmaTest` (test-build only). Bot NIE zastępuje gate'u real-device Michała (A54).

## Legenda
- **Assert** = warunek, którego złamanie = zgłoszenie bugu (z seedem + scenariuszem + mapą + wersją).
- **needs** = stan/hook, który silnik musi wystawić w `__sigmaTest`, żeby check był możliwy.
- ICollidable: **x/y = TOP-LEFT** hitboxu (nie środek) — wszystkie AABB liczyć od top-left.
- Warstwy kolizji: `buildings` (czołg), `solidBuildings` (pocisk), `ctfEnemyBuildings`.

---

## A. Spawn & placement (Twoje przykłady — killer-feature)
- [ ] **A1** Żaden spawn (gracz/wróg/pickup/boss) nie koliduje AABB z `buildings`/`solidBuildings`. → needs: lista spawnów {x,y,w,h,type} + collision-mapa.
- [ ] **A2** Żaden spawn poza granicami mapy (world bounds). → needs: world w/h + spawn coords.
- [ ] **A3** Żaden spawn nie nachodzi na inną żywą encję (odstęp min). → needs: snapshot encji w chwili spawnu.
- [ ] **A4** Spawn wroga respektuje predykaty stref (quicksand/oaza/sludge/fosa/regolit) + margines. → needs: flaga strefy per punkt.
- [ ] **A5** Spawn NIE w strefie chronionej gracza (hangar CTF, donżon Castle, cela Queen). → needs: obrys stref sanktuarium.

## B. Geometria mapy / integralność kolizji
- [ ] **B1** Bot celowo wjeżdża w każdą ścianę — brak przenikania (przez klatkę). → needs: pozycja gracza + kontakt kolizji per klatkę.
- [ ] **B2** Brak „dziur" w geometrii (segmenty stykające się nie zostawiają luki przejazdowej). → needs: obrysy colliderów.
- [ ] **B3** zIndex = y+offset spójny; floating (hologram/wieża) na osobnym kontenerze — brak encji rysowanej pod terenem, po którym jeździ. → needs: zIndex + warstwa per encja.
- [ ] **B4** Brak „wyspy" niedostępnej: cel/flaga/klucz osiągalny z punktu startu (flood-fill po mapie przejezdności). → needs: grid przejezdności.

## C. Enemy AI — ruch / pathing
- [ ] **C1** Wróg w pościgu zmniejsza dystans do celu w oknie N s (nie oscyluje, nie zamarza). → needs: dystans wróg→cel w czasie.
- [ ] **C2** `Enemy.moveAvoiding` faktycznie omija przeszkody — brak utknięcia o geometrię > N s. → needs: „stuck timer" per wróg.
- [ ] **C3** Wróg nie wpada w pętlę tam-i-z-powrotem (limit zawróceń/s). → needs: heading history.
- [ ] **C4** `resolveEnemyTarget` zawsze zwraca żywy cel (nie martwy/nieistniejący). → needs: target ref + alive flag.

## D. Enemy AI — walka / strzelanie
- [ ] **D1** Wróg w zasięgu i z linią strzału realnie strzela w oknie N s (nie „niemy"). → needs: licznik pocisków per wróg + in-range flag.
- [ ] **D2** Pocisk wroga nie przechodzi przez `solidBuildings` (kolizja pocisku aktywna). → needs: trajektorie EnemyBullet + trafienia ściany.
- [ ] **D3** Telegraf ataku bossa/NPC pokrywa się z realnym hitboxem ataku (czytelność = 0 śmierci „znikąd"). → needs: obrys telegrafu vs obrys ataku.
- [ ] **D4** Boss się spawnuje w każdym meczu KTB/Castle i jest **beatowalny na Easy** (cel R3). → needs: boss spawn + HP + outcome.

## E. Pociski & fizyka walki
- [ ] **E1** Każdy pocisk umiera (trafienie/zasięg/czas) — brak leaku (licznik żywych pocisków nie rośnie w nieskończoność). → needs: live-bullet count.
- [ ] **E2** Trafienie liczone raz (brak podwójnego liczenia dmg w jednej klatce). → needs: hit events z id pocisku.
- [ ] **E3** Każde `takeDamage` niesie `DamageSource` (7 rodzajów) — kompilator wymusza, oracle weryfikuje runtime. → needs: damage events z source.
- [ ] **E4** Super/GRAD! odpala się i **rozwiązuje** (onEnd wykonane, brak zawieszonego stanu mocy). → needs: power lifecycle events.

## F. Inwarianty stanu encji
- [ ] **F1** HP nigdy < 0 ani > maxHp (po refaktorze HP/DMG ×100 — uwaga na skalę). → needs: HP snapshot per encja.
- [ ] **F2** Pozycje/prędkości nie są NaN/Infinity (żadna encja). → needs: {x,y,vx,vy} snapshot.
- [ ] **F3** Licznik encji (wrogów/pocisków/efektów) nie rośnie monotonicznie w soak (leak). → needs: counts w czasie.
- [ ] **F4** Stan „mrożenia/strachu/stealth" schodzi (brak latch — jak historyczny bug Babci/freeze). → needs: status timers.

## G. Oracles scenariuszy (reguły win/lose)
- [ ] **G1 KTB** przetrwanie + boss: mecz kończy się (win/lose), nie zawisa; wynik zgodny z formułą v2. → needs: match outcome + score inputs.
- [ ] **G2 CTF** pickup→carry→capture→return działa; flaga nie utyka; +50/flagę liczone; strefa hangaru = obrys AND tarcza (historyczny bug „flag positioning"). → needs: flag state machine + score.
- [ ] **G3 Castle** 4 bramy N/E/W/S rozsuwane/naprawialne; 6 fal; taran/katapulta/trebuchet celują w najsłabszą bramę; faza budowy; respawn w donżonie; win/lose poprawne. → needs: gate HP + wave state + machine targets.
- [ ] **G4 Queen** timer 25 s + telegraf 2 s schodzi; zasada **1 życia** egzekwowana; Złoty Klucz→stalowe drzwi celi→ratunek=OCALONA (win), timeout=PORWANA (lose); mur odrasta sam; lawa DoT rani; gejzery w PANICE. → needs: timer + lives + objective state.
- [ ] **G5** Wynik trybów bez rankingu (Castle/Queen do 23.09) NIE idzie do Supabase; KTB/CTF idzie przez Edge `submit-score`. → needs: submit call log + mode.

## H. Ekonomia & zapis (Supabase / Sigmy)
- [ ] **H1** `boltsEarned` monotoniczny; saldo = `earned − spent` nigdy < 0; brak dupe waluty. → needs: currency ledger events.
- [ ] **H2** Trofea nigdy nie maleją (design-lock). → needs: trophy value in time.
- [ ] **H3** Save/load round-trip po reloadzie = identyczny stan profilu (localStorage). → needs: profil snapshot pre/post reload.
- [ ] **H4** Repro **P0 boot-crash localStorage** w kontekście iframe/sandbox (Poki blocker). → needs: boot w trybie sandbox.
- [ ] **H5** Submit przez Edge respektuje rate-limit 20/h i bounds 0..100M (nie crashuje przy 429 — flushQueue porcjami). → needs: submit results.

## I. Performance & pamięć (mobile-critical)
- [ ] **I1** Frame-time percentyle (p50/p05) per mapa/scenariusz — flaga regresji vs poprzedni build. → needs: `?perf=1` sampler (JS time).
- [ ] **I2** **Atrybucja**: rozdziel czas JS/logika (nasz kod) od present/compositor. NIE flaguj ~33 ms/~700 ms hitchu A54 (to floor urządzenia, nie bug) — flaguj tylko gdy `script` time rośnie. → needs: long-animation-frame + split render/logika.
- [ ] **I3** Wzrost pamięci w soaku 30 min < próg (leak). → needs: memory sampling.
- [ ] **I4** Czas ładowania / payload nie regresuje (lazy music, ~5–8 MB). → needs: resource timing.

## J. MOBILE — solidnie (375px / touch / HUD / orientacja)
- [ ] **J1** Viewport landscape ~**667×375** (lock): brak scrolla, przycisk akcji/CTA zawsze widoczny (breakpoint = WYSOKOŚĆ, nie szerokość). → needs: layout metrics @375h.
- [ ] **J2** Zero kolizji/nadpisań HUD @375px: SCORE, paski, przyciski mocy, dok, licznik cooldownu, banery scenariusza. → needs: bounding-boxy elementów HUD.
- [ ] **J3** Tekst nie ucięty (wartości statów, tytuły PRZEGRANA/ZWYCIĘSTWO rozciągane do przycisku). → needs: overflow flags per label.
- [ ] **J4** Tap-targety ≥ próg pod kciuk; kontrolki (joystick 0.30 / knob 0.70) nie zasłaniają pola gry. → needs: control rects + opacity.
- [ ] **J5** Cały input przez `TouchInputManager` — brak mechaniki zależnej od hover/scroll/PPM/klawiatury bez odpowiednika dotykowego. → needs: input path audit hook.
- [ ] **J6** Bot steruje przez injection do TouchInputManager (floating joystick + aim/fire stick + super button/long-press) — nie „prawdziwy" dotyk. → needs: programmatic input API.
- [ ] **J7** Orientation-lock: portret → warning „Obróć telefon"; powrót do landscape wznawia; zmiana orientacji nie crashuje. → needs: orientation events.
- [ ] **J8** Zoom 0.7: sylwetki wrogów/pickupów/telegrafów czytelne (rozmiar na ekranie > próg). → needs: on-screen sprite size.
- [ ] **J9** Per-brawler mobile speed mult (Pancerny ×1.05 … Zwiad ×0.68) zastosowany — balans dotyku. → needs: effective speed per brawler.
- [ ] **J10** visibilitychange/pagehide: rAF usypia → muzyka PAUZOWANA (nie tylko mute), powrót wznawia; brak „ciszy po zwinięciu". → needs: audio+loop state on blur.
- [ ] **J11** Płynność `?cap=1` = równe 60 fps (PIXI maxFPS nie kapuje sam). → needs: fps series.

## K. UX / czytelność (warstwa LLM + screeny)
- [ ] **K1** LLM ocenia screeny 375px: kolizje HUD, czytelność brawlerów, jasność onboardingu — marudzenie 10-latka z dowodem wizualnym. → needs: screenshot @kluczowe momenty.
- [ ] **K2** Artefakty renderu (z-order, overdraw, złe kolory, piksoleza na mobile) — screenshot-flag (probabilistyczne, do przeglądu ludzkiego). → needs: screenshot + baseline.
- [ ] **K3** Fairness/„zabawa": raport oznacza śmierci „znikąd", nudę (brak akcji > N s), frustrację (powtarzalny zgon w tym samym miejscu). → needs: death events + activity heatmap.

## L. Stabilność / chaos / fuzz
- [ ] **L1** Fuzzing inputu (mash wszystkich przycisków, spam super, szybki tank-switch w garażu) — brak crasha/uncaught. → needs: window.onerror capture.
- [ ] **L2** Storm przejść menu↔gra↔garaż↔sklep↔ranking — brak wycieku listenerów/rAF, brak podwójnej muzyki. → needs: listener/rAF counts.
- [ ] **L3** Soak 30 min ciągłej gry — brak degradacji FPS/crasha/leaka. → needs: long-run harness.

## M. Regresja (gdy będzie seed — poz. 5 backlogu)
- [ ] **M1** Golden-run: ten sam `?seed=N` na 2 buildach → identyczny przebieg; divergencja = regresja. → needs: deterministyczny RNG (rozszerzyć Z0.1) + Date.now() z timingów.
- [ ] **M2** Screenshot-diff per mapa vs baseline (próg tolerancji). → needs: stabilny seed + fixed camera.
- [ ] **M3** Trend metryk (FPS, time-to-death, win-rate) wersja-do-wersji — alarm na skok. → needs: historia raportów.

## N. Coop / Multiplayer — patrzymy szeroko (poz. 6, future)
- [ ] **N1** Multi-agent: 2–4 boty w jednym meczu (`players[]` już istnieje — Z0.3). → needs: multi-local-player harness.
- [ ] **N2** Desync detection: 2 klienci, ten sam seed → snapshot stanu w tych samych krokach musi się zgadzać; divergencja = bug netcode/determinizmu. → needs: state-hash per tick.
- [ ] **N3** Injection latencji/jitter/packet-loss — mecz się nie rozjeżdża/nie crashuje. → needs: network sim hook.
- [ ] **N4** Join/leave mid-match + host migration (WebRTC P2P, Supabase signaling) — stan spójny. → needs: session lifecycle events.
- [ ] **N5** Coop obj/economy: sync flagi/celu; brak dupe Sigm/trofeów przy wielu graczach. → needs: shared-economy ledger.
- [ ] **N6** `resolveEnemyTarget` przy wielu graczach = poprawny wybór (najbliższy żywy) — bez migotania celu. → needs: target per enemy in time.

## O. Schemat dziennego raportu (co produkuje warstwa LLM)
- [ ] **O1** Nagłówek: ile gier, per scenariusz (KTB/CTF/Castle/Queen), per mapa (City/Desert/Tropics/Arctic/Mars), per brawler, build+seedy.
- [ ] **O2** Bugi: klastry (deduplikacja) + severity + repro-seed + screenshot; propozycja wiersza RICE.
- [ ] **O3** Balans: time-to-death, win-rate/brawler, boss-defeat-rate Easy, time-to-super.
- [ ] **O4** Głos persony (marudny 10-latek): 3–5 uwag o zabawie/czytelności/fairness, poparte danymi/screenami.
- [ ] **O5** Dostawa: komentarz na Progress log (376bb3d0…) + klastry/RICE do backlogu; opcjonalnie GitHub Issues.

---

# BACKLOG — 6 wierszy RICE (do wklejenia; baza 7a78e4e4… niewidoczna dla integracji → ręcznie/komentarz)

RICE = (Reach × Impact × Confidence) / Effort. Impact: 3=masywny 2=wysoki 1=średni. Confidence: 100/80/50%.

| # | Nazwa | Reach | Impact | Conf | Effort | RICE | Kat. |
|---|---|---|---|---|---|---|---|
| 1 | AI Tester — rdzeń V0+V1 (harness + oracles + raport) | 70 | 3 | 80% | 1.5 | **112** | Tooling/QA |
| 2 | AI Tester — suite Mobile QA (375px/touch/HUD/orient.) | 70 | 3 | 80% | 1.0 | **168** | Tooling/QA/Mobile |
| 3 | AI Tester — chaos/fuzz + soak 30 min | 40 | 1 | 80% | 0.5 | **64** | Tooling/QA |
| 4 | AI Tester — feed balansu i retencji (R0–R4) | 40 | 3 | 50% | 1.0 | **60** | Analytics/Design |
| 5 | AI Tester — seed/RNG determinizm + golden-run regresja | 40 | 3 | 50% | 3 | **20** | Tooling/MP |
| 6 | AI Tester — harness coop/multiplayer (multi-agent, desync) | 40 | 1 | 50% | 4 | **5** | Tooling/MP (future) |

**Priorytet wg RICE:** 2 (168) → 1 (112) → 3 (64) → 4 (60) → 5 (20) → 6 (5).
**Kolejność wykonania:** 1 → 2 (poz. 2 zależy od harnessu z poz. 1), dalej wg RICE.

## Opisy do pól „Opis" (skrót)
1. Playwright (desktop+375px) + heurystyczny bot (?bot=1) + oracles __sigmaTest (A/B/E/F/H) + raport-persona (Fable API) + GH Actions cron. Fundament.
2. Inkrementalnie na rdzeniu (niższy Effort): sekcja J w całości. NIE zastępuje gate'u A54 Michała.
3. Sekcja L: fuzz + soak 30 min. Tanie, łapie crashe na dziwnych sekwencjach.
4. Sekcja O3 + zasilenie telemetrii po 23.09. Narzędzie designerskie na retencję.
5. Sekcja M: rozszerzenie ?seed=N (Z0.1) na pełne repro + golden-run. Dual-purpose z lockstep MP.
6. Sekcja N: 2–4 boty, desync, latencja. Future — zależne od MP MVP + determinizmu.

---

# BRAMKI / RYZYKA (przed implementacją)
- **Seed/RNG determinizm** — ?seed=N (Z0.1) już jest; pełne repro wymaga Date.now() z timingów (dług ETAP 1). V1 startuje bez pełnego seeda.
- **Ścieżka inputu** — bot przez TouchInputManager (J6); wymaga programmatic input API. Real source: `TouchInputManager.ts`.
- **Izolacja test-build** — `__sigmaTest` i `?bot=1` odcięte od produkcji (bez pompowania bundla, per-feature isolation).
- **Fidelity mobile** — Playwright emuluje 375px, ale to NIE A54. Wspiera, nie zastępuje gate'u Michała. WebGL w headless CI może wymagać `--use-gl=swiftshader` (albo start: nocą lokalnie na Windows).
- **Present-hitch A54** — check I2 MUSI atrybuować czas do `script`, żeby nie flagować floora compositora jako bugu.

# Pierwsze źródła wejścia (kod) — zero zgadywania sygnatur
`TouchInputManager.ts`, sekcja gameLoop z `main.ts`, `systems/Rng.ts` + `GameConfig`, `GameSession.ts`, `services/GameSession`/`SupabaseScoreService.ts`, warstwa kolizji (`types/MapType` ICollidable), `resolveEnemyTarget`.
