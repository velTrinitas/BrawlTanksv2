# tools/balance — narzedzia balansu rosteru

Dwa skrypty Node (bez zaleznosci, `node tools/balance/<plik>.js`). Nie wchodza do bundla gry.

| plik | co robi |
|---|---|
| `audit.js` | zdjecie STANU OBECNEGO: dps, ehp, czas ubicia, okno supera per czolg |
| `solver.js` | dopasowuje staty calego rosteru do jednego indeksu mocy (BALANCE_V2) |
| `target-v2.json` | ostatni wynik solvera (`--json`), zeby dalo sie porownac przebiegi |

## Po co solver, skoro mozna tuningowac recznie

Roster ma piec sprzezonych osi (dmg / tempo / pancerz / szybkosc / zasieg) i dwie UKRYTE:
promien pocisku (trafienie = `30 + bullet.radius`, `main.ts:4885`) oraz kat rozrzutu salwy.
Recznie projektowane archetypy wyszly **18,9%** od siebie; ten model schodzi do **~3,4%**.

Kalibracja celuje w **srednia indeksu DZISIEJSZEGO rosteru (76,4)**, nie w okragle 100 —
inaczej kazdy rebalans po cichu podnosi sufit mocy (power creep).

## Jak czytac wynik

```
node tools/balance/solver.js --json tools/balance/target-v2.json
```

- `OBECNY ROSTER` — ten sam model policzony na dzisiejszych wartosciach (kalibracja).
- `NOWY ROSTER` — propozycja; `INDEX` wszystkich powinien byc blisko TARGET.
- `rozrzut INDEX` — cel `<5%`.
- `podobienstwo PROFILU` — liczone na profilach **centrowanych**. Na surowych wektorach
  wszystko wychodzi sztucznie 0,95+ i ukrywa duplikaty (Tech byl kopia Twardego: 0,98).
- `ZMIANA vs dzis` — lista do wklejenia w plan/commit.

## Dzwignie, ktore mozna krecic

- `SHAPE` — ksztalt archetypu (0-100 per os). To jest miejsce na decyzje projektowa („Snajper ma byc
  najdalej"), a nie na tuning liczb.
- `LOCK` — staty ZAMROZONE decyzja Mariusza: `Ogniarz.reload = 220`, `Twardy.reload = 400`
  (feel karabinu i baseline cadence zostaja). Solver musi znalezc balans innymi osiami — dlatego
  Ogniarz dostal kat rozrzutu 0,34 rad i 5 pociskow zamiast 3.
- `W` / `REF` — wagi i normalizacja indeksu. **Tego nie ruszac bez ponownej walidacji botem.**

## Czego model NIE wie

Nie symuluje AI wrogow, scenariuszy, super-mocy z loadoutu ani zachowania gracza. Jest **hipoteza**,
nie dowodem. Walidacja empiryczna to SigmaTester:

```
node tools/sigma-tester/run.mjs --url http://localhost:5173/BrawlTanksv2/ --brawler <id> --seed N
```

Macierz 8 czolgow x 5 seedow, **PRZED i PO** zmianie. Model obiecuje rownosc +-5%; wiekszy rozjazd
oznacza blad w wagach modelu, a nie u gracza.

## Pochodzenie

Model powstal w rownoleglej sesji analizy balansu (2026-09-20) jako `bal.js` + `solver2/3/4.js`.
Do repo trafila wersja PRZEPISANA z czystej bazy (`solver2`) z dwiema dzwigniami dodanymi pozniej:
per-czolgowy `LOCK` i per-czolgowy kat rozrzutu w modelu trafien. Odrzucone: `solver.js` v1
(brak kalibracji -> power creep, Twardy dostawal 205 dmg) i `budget.js` (reczne archetypy, 18,9%).
