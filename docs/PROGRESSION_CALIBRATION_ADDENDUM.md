# BRAWL TANKS S2 — DODATEK KALIBRACYJNY do Systemu Progresji

**2026-08-02** · Stan gry: v0.90.1 (live) · Autor: Claude · Filtr: Czytelnosc > Sensoryka > Flex

> **Czym jest ten plik:** DODATEK do kanonicznego design doc gracza
> (`BT_Progression_System_Design_v1.md` / `v1_2.pdf`, §0-18 — obowiazuje w calosci). Ten dodatek robi
> JEDNO: bierze **realne dane z produkcji** (476 wynikow) i **kalibruje liczby**, ktore w §3.1 kanonu
> byly zgadniete (TROPHY_DIVISOR=400 dawal +1 trofeum na kazda realna gre, bo max score = 748) — plus
> wprowadza **normalizacje per mapa** (decyzja Mariusza 2026-08-02). ZASTEPUJE liczby w §3.1/§3.2 kanonu;
> reszta kanonu (waluty, Zrzuty, Rozkazy §17, Super Moce §18, Sezon, Mastery, Medale) bez zmian.

---

## A. Migawka kalibracji (realne dane, 2026-08-02)

Zrodlo: `supabase/progression_calibration.sql` (Q1-Q6, `score_version = 2`).

- **Rozmiar proby:** 476 wynikow, **18 graczy**, 451 sesji, 2026-06-21 → 08-02. Wszystko KTB (CTF 0, Castle 0).
- **UWAGA KRYTYCZNA:** proba mala i **dev-owa** (produkcja dostala Supabase dopiero 31.07 / v0.88.1 — gros
  danych to sesje developerskie Mariusz/Michal). 99% gier = `normal`. Desert n=14. → Dane ustawiaja **rzad
  wielkosci i ksztalt**, nie beton. Progi = wzgledne + margines + **re-kalibracja po realnym ruchu store/POKI**.

**Rozklad wyniku per mapa (Q2) — rdzen kalibracji:**

| Mapa | n | median | p75 | **p90** | p95 | p99 | max |
|---|---|---|---|---|---|---|---|
| city | 214 | 0 | 10 | **55** | 84 | 137 | 174 |
| arctic | 187 | 20 | 89 | **264** | 451 | 694 | 748 |
| tropics | 61 | 16 | 43 | **90** | 236 | — | 643 |
| desert | 14* | 12 | 34 | **62** | 69 | — | 69 |

\* desert n=14 = niska pewnosc.

**Wniosek nr 1 — podloga szumu:** ≥25% gier ma wynik **0** (bounce: natychmiastowa smierc/wyjscie).
"Gra na serio" zaczyna sie ~40. **Wniosek nr 2 — 5x rozjazd skali miedzy mapami** (arctic p90=264 vs
city p90=55): surowy score NIEporownywalny → normalizacja per mapa obowiazkowa.

**Reszta (Q3-Q6):**
- Trudnosc (Q3): 455/476 = `normal`. **Difficulty nie da sie skalibrowac** — os zaparkowana.
- Gry/gracz (Q4): mediana **4 mecze**, p90 29, max 329 (dev). Pierwsze odblokowania musza wpadac w ~2-4 gry.
- Rekord zyciowy (Q5): pb_p25 **42**, pb_median **80**, pb_p75 **171**, pb_p90 **253**. "Najlepsza gra
  przecietnego gracza" ≈ 80.
- Brawlery (Q6): king 33.6% (domyslny, median 0 = bounce nowicjuszy); twardy/plasma/shadow sufit (p90 231-268).

---

## B. RECALIBROWANY WZOR TROFEOW (zastepuje §3.1 v1.1)

### Problem v1.1
v1.1: `trophies = clamp(1, floor(score / 400) + bonusy, 40)`, komentarz "score 4000 → 10 trofeow".
**Realny max score = 748.** Przy dzielniku 400 nawet swietna gra na arctic (264) = `floor(264/400) = 0` →
**+1 trofeum**. Kazda gra dawalaby podloge. Wzor byl zgadniety, dane go obalaja.

### Rozwiazanie v1.2 — dzielnik PER MAPA (normalizacja)
Kazda mapa ma **wlasny dzielnik**, ustawiony z JEJ p90 tak, by **"swietna gra" (≈p90) dawala ~50 trofeow
na KAZDEJ mapie**. Nagradzamy wynik *wzgledem tego, co mapa oferuje*, nie surowa liczbe.

```
MAP_DIVISOR[map] = MAP_P90[map] / TARGET_TROPHIES_AT_P90     // TARGET = 50
run_rating       = score / MAP_DIVISOR[map]
trophies         = clamp(1, floor(run_rating) + bonusy, TROPHY_CAP_PER_RUN)
```

**Dzielniki z kalibracji** (TARGET_TROPHIES_AT_P90 = 50):

| Mapa | p90 | **MAP_DIVISOR** |
|---|---|---|
| city | 55 | **1.1** |
| arctic | 264 | **5.3** |
| tropics | 90 | **1.8** |
| desert | 62 | **1.25** (low-conf, tuning) |

**Bonusy (bez zmian z v1.1):** Perfect Run +5 · pierwszy run dnia +5 · nowy rekord osobisty +10.
**TROPHY_CAP_PER_RUN = 75** (anty-farm; p90≈50, wybitna gra dobija ~75, p99 sciete).

### Sprawdzenie na realnych danych (trofea = floor(score/divisor), przed bonusami/capem)

| Sytuacja | score | mapa | trofea |
|---|---|---|---|
| bounce (cwierc gier!) | 0 | dowolna | **1** (podloga — pasek zawsze drga) |
| przecietny run | 10 | city (p75) | **9** |
| dobry run | 89 | arctic (p75) | **16** |
| swietny run | 55 / 264 / 90 | city / arctic / tropics (p90) | **~50** (rowno!) |
| epicki run | 748 | arctic (max) | 141 → **75** (cap) |

To jest sedno normalizacji: **p90 na kazdej mapie = ~50 trofeow.** Zadna mapa nie jest "farma XP".

---

## C. Szlak Trofeow — pogodzona struktura (dostraja §3.2 v1.1)

Trofea/run: bounce ~1, przecietny ~9-16, swietny ~50, cap 75 (+bonusy +5..+20). Engaged sesja (2-3 gry,
jedna dobra) ≈ **40-90 trofeow**. To zmienia progi Aktow — v1.1 mial Akt I = 0-1000 (przy zgadnietym
wzorze). v1.2 obniza i zageszcza start, bo **priorytet = regula D1 (§11): 2 milestony w pierwszych 15 min.**

**Kadencja milestone (v1.2):**
- Pierwsze 2 milestony: **30, 70** trofeow → wpadaja w run 1-3 (regula D1 spelniona).
- Akt I "Rekrut" (dzien 1-3): **0 → 750**, milestony 30/70/120/180/250/330/430/560/750 (~9 nagrod,
  kadencja rozszerza sie). Zawartosc bez zmian (2./3. brawler, Desert, 1. Zrzut, 1. czesc konfiguratora,
  Rozkazy Dnia po ~150).
- Akt II "Weteran" (tydzien 1-3): **750 → 3500**, milestone co 250-450. Zawartosc: brawlery 4-6, Tropics,
  **CTF (odblokowanie — decyzja Mariusza: koniec Aktu I / wczesny Akt II)**, Zrzuty Bojowe, sloty konfiguratora.
- Akt III "Legenda" (miesiac 1-3): **3500 → 10000**, milestone co 500-900. **Castle = crown jewel** (klodka
  z licznikiem od dnia 1). Zrzut Legendarny, ramki prestizowe.
- Po 10000: Szlak Nieskonczony (co 500 = maly Zrzut).

> Finalna drabina milestone dostrajana w PROG-F1 na playtescie — proba za mala na beton. Regula stala:
> **pierwsze 2 milestony w 1. sesji, kadencja rozszerza sie z aktem.**

---

## D. CTF w progresji (rozstrzyga diagnoze 0-wynikow)

**Diagnoza (2026-08-02): CTF ma 0 wynikow bo submit jest CELOWO pominiety** — `main.ts` `triggerGameOver`
(~2279) i `triggerVictory` (~2331), skip `if scenario==='ctf'` z czasu CTF F1 (D10, lokalny endcard MVP).
`GameSession.score` **akumuluje sie tez w CTF** (kille straznikow/bossow + combo + gemy); `ctf.flagsCaptured`
liczone osobno.

**Decyzja v1.2 — podlaczyc CTF przez score (rekomendacja):**
- Usunac 2 skipy → CTF submituje `score` jak KTB (zero zmian schematu, jedna formula dla wszystkich scenariuszy).
- Tablica "Flag" rankuje po **score** (spojne z KTB). `flagsCaptured` zostaje bonusem do trofeow, NIE osia rankingu.
- **Bonus za flagi do trofeow:** kazda flaga = +X do score-ekwiwalentu PRZED normalizacja. v1.1 proponowal
  1500/flaga — **przeskalowac** (realny max KTB = 748, 1500/flaga zmiazdzyloby skale). v1.2 provisional:
  **flaga = +40 do run_score-ekwiwalentu** (≈ dobry run), dzielnik CTF (`fortified_ruins`) **do kalibracji po
  pierwszych realnych danych CTF** — provisional MAP_DIVISOR = 1.8 (jak tropics, podobna mapa).
- Kolejnosc: najpierw wlaczyc submit CTF (zbiera dane) → po ~50+ wynikach CTF re-kalibrowac dzielnik + bonus flagi.

---

## E. Rozstrzygniete otwarte decyzje (§16 v1.1)

1. **Gemy in-run vs meta** → czysto in-run (bez zmian). ✅
2. **Spadanie trofeow** → nigdy w PvE; ranked osobno przy multiplayer. ✅
3. **Dlugosc sezonu** → 6 tygodni. ✅
4. **Castle** → nagroda Aktu III (~3500+ trofeow, crown jewel D30). ✅
5. **Konwersja legacy** → TAK, jednorazowy grant startowych trofeow z historii score (fair dla wczesnych
   graczy). **v1.2 dolicza:** grant liczyc **znormalizowanym wzorem per mapa** (nie surowym score, inaczej
   arctic-farmerzy dostana 5x). Skrypt: suma `floor(best_per_map / MAP_DIVISOR)` per gracz, cap rozsadny.
6. **NOWA (v1.2) — normalizacja per mapa** → **TAK, per mapa** (decyzja Mariusza 2026-08-02). §B.
7. **NOWA (v1.2) — CTF do leaderboardu** → **TAK, submit przez score**; flagi = bonus, nie os rankingu. §D.

---

## F. Stale do `src/config/progression.ts` (gotowe pod PROG-F1)

```ts
// Kalibrowane na danych prod 2026-08-02 (476 wynikow, 18 graczy). RE-KALIBROWAC po ruchu store/POKI.
export const TROPHY_TARGET_AT_P90 = 50;   // "swietna gra" (p90) daje ~50 trofeow na kazdej mapie
export const TROPHY_CAP_PER_RUN   = 75;   // anty-farm gorny
export const TROPHY_FLOOR_PER_RUN = 1;    // pasek ZAWSZE drga (nawet bounce)

// Dzielnik per mapa = p90(mapy) / TARGET_AT_P90. Normalizacja: nagroda wzgledem skali mapy.
export const MAP_TROPHY_DIVISOR: Record<MapId, number> = {
  city:    1.1,   // p90=55
  arctic:  5.3,   // p90=264
  tropics: 1.8,   // p90=90
  desert:  1.25,  // p90=62 (n=14 low-conf — dostroic)
  // fortified_ruins (CTF): 1.8 provisional (jak tropics) — kalibrowac po 1. danych CTF
};

export const TROPHY_BONUS = { perfectRun: 5, firstRunOfDay: 5, newPersonalBest: 10 };
export const CTF_FLAG_SCORE_EQUIV = 40;   // kazda flaga += 40 do score-ekwiwalentu przed normalizacja

// Szlak — progi Aktow (milestony dostrajane w playtescie; pierwsze 2 stale male)
export const ACT_BOUNDS = { actI: [0, 750], actII: [750, 3500], actIII: [3500, 10000] };
export const FIRST_MILESTONES = [30, 70, 120, 180, 250, 330, 430, 560, 750]; // Akt I
```

---

## G. Zastrzezenia i wyzwalacz re-kalibracji

- Proba **18 graczy, dev-owa, 99% normal, desert n=14**. Liczby v1.2 = **kierunek + rzad wielkosci**, nie
  finalne wartosci. Wszystko w JEDNYM pliku (`progression.ts`) = jeden tuning pass.
- **Re-kalibracja OBOWIAZKOWA** gdy: (a) uzbiera sie ≥200 wynikow z REALNYCH graczy (nie dev), lub (b)
  wystartuje CTF (dzielnik `fortified_ruins` + bonus flagi), lub (c) wejdzie 2. poziom trudnosci masowo.
- Ponowne odpalenie `progression_calibration.sql` + korekta `MAP_TROPHY_DIVISOR` = caly re-tuning.

---

## H. Nastepny krok

Doc v1.2 zamyka bramke (dane + decyzje). Kod dopiero teraz. Kolejnosc wg §15 v1.1:
**PROG-F1** = rubki + Trofea + Szlak Aktu I + zapis/sync + (pre-task: nowe liczniki metryk ramming/stealth/
boss-no-damage dla przyszlych Rozkazow). To spine — wszystko inne sie na nim wiesza. Rekomendacja: zaczac
od PROG-F1 po akceptacji tego dokumentu.
