# Multiplayer-ready — bramka COOP/MP dla KAZDEGO nowego featu

Decyzja Mariusza (2026-09-20): „nowe feature maja nie utrudniac, a mocno wspierac multiplayer".
Kierunek projektu to **koop przed PvP**, a ETAP 0 netcode'u jest juz zamkniety (seeded RNG,
`runLogicStep` + catch-up, `DamageSource`, telemetria). Kazdy feature, ktory dotyka symulacji,
albo te fundamenty wzmacnia, albo po cichu je rozbija — trzeciej opcji nie ma.

**Bramka jest w PLANIE, nie w code review.** Plan featu musi odpowiedziec na ponizsze 5 pytan
ZANIM powstanie kod. Koszt: kilka zdan. Koszt pominiecia: desync, ktorego nie da sie zdiagnozowac,
bo objawia sie dopiero u dwoch graczy naraz.

## 1. Determinizm
Czy feature uzywa `Math.random`, `Date.now`, `performance.now`?
- Losowosc: `worldRng` / `ambientRng` (`src/core/Rng.ts`, mulberry32) — nigdy `Math.random`.
- Czas: zegar meczu, nigdy systemowy. **Precedens:** `Date.now()` w zegarach Zamku nie zatrzymuje
  sie w pauzie — to ten sam blad, tylko widoczny wczesniej.

## 2. Krok logiki
Czy stan zmienia sie w krokach o STALEJ dlugosci, czy w `delta`?
Wszystko, co wplywa na symulacje (ruch, obrazenia, cooldowny, dash, spawny), musi dac sie policzyc
w `runLogicStep`. Zmiana proporcjonalna do `delta` rozjedzie klientow przy catch-upie —
a catch-up jest juz w kodzie (`?smooth=1`).

## 3. Dane z wersja
Czy liczby (balans, progi, tuning) leza w konfiguracji **z identyfikatorem wersji**, czy sa wpisane
w kod? W meczu sieciowym obie strony musza liczyc tak samo. Rozjazd wersji = **odmowa startu meczu**,
nie ciche „jakos to bedzie".
Wzorzec: `src/config/balanceRules.ts` + `balanceRulesetId()` obok `SIM_VERSION`.

## 4. Zrodlo obrazen i wlasciciel
Czy kazde obrazenie niesie sprawce (`DamageSource`, Z0.5) i czy pocisk/efekt zna swojego wlasciciela?
Bez tego w koopie nie ma kill-creditu, nie ma „kto mnie zabil" i nie ma anty-cheatu.

## 5. Stan lokalny vs wspoldzielony
Co jest TYLKO wizualne (moze zyc u klienta: czastki, ekrany, dym, UI), a co jest stanem gry
(musi przejsc przez symulacje: HP, pozycje, cooldowny, drop)? **Rozdzielic jawnie w planie** —
„to jest tylko efekt" napisane po fakcie zawsze okazuje sie nieprawda.

## Kiedy ta bramka NIE dotyczy
Zeby nie robic ceremonii tam, gdzie nic sie nie moze rozjechac:
- pieczony art (bake, tekstury, palety), CSS/DOM hubu i menu, teksty i18n, narzedzia dev.

Wtedy w planie wystarczy jedno zdanie: **„brak wplywu na symulacje"**.

## Pytanie kontrolne na koniec
Jesli ten feature mialby dzialac u DWOCH graczy naraz na dwoch urzadzeniach — co musialoby zostac
wyslane przez siec, a co policzyloby sie identycznie po obu stronach? Jesli odpowiedz brzmi
„nie wiem", feature nie jest gotowy do implementacji.
