# SEASON KIT — kontrakt sezonu (szablon + zasady)

> Odpowiednik `docs/map-kit/` dla sezonów. **To nie jest fabryka** — to kontrakt,
> który wymusza decyzje przed pracą, plus strażnik, który sprawdza wynik.
>
> Strażnik: `node tools/season_check.mjs` → `PASS` albo `FAIL — N bledow`, `exit 1`.
> Nadaje się do CI i do pre-push.

---

## Dlaczego to istnieje

Brief Mariusza (25.08.2026):

> *„Chciałbym, żeby każdy sezon coś takiego miał. Coś unikalnego i customowego, co
> jest retencją. Coś, co budzi zachwyt i sprawia, że gracze chcą zobaczyć nowy sezon.
> Czego nie chcę, by to była tylko zmiana liczby z season 2 > 3 i grafiki — to ma być
> coś ekstra."*

Taka zasada nie przetrwa w code review. Przetrwa jako **bramka G0**: sezon bez
wypełnionej sekcji `## MECHANIKA` w swoim kontrakcie nie przechodzi. Wpisanie tam
„nowa grafika i numer sezonu" kończy się `FAIL: sezon = sama skorka`.

**Czego bramki NIE sprawdzą.** Kompletność, spójność i brak szkód w UI — tak.
Czy sezon budzi zachwyt — nie. Tego nie da się zmierzyć skryptem i lepiej tego nie
udawać, bo dostaniemy sezony przechodzące wszystkie bramki i nudne.

---

## Dlaczego to NIE jest jeszcze fabryka

Map Factory nie powstał przed mapami — powstał po pięciu, z `LESSONS_LEARNED.md`
spisanym z realnych potknięć. `composeMap` (K11) jest odłożony do dziś, bo jedna mapa
z kitu to za mało na abstrakcję.

Mamy jeden sezon z mechaniką i to jeszcze nienapisany. Fabryka zaprojektowana na
jednym przykładzie zafiksowałaby przypadkowe cechy „Powrotu do Szkoły" jako prawa
natury. **Decyzja Mariusza (26.08.2026): kontrakt + bramki teraz, ekstrakcja fabryki
po S4**, gdy będą dwa sezony do porównania.

---

## Warstwy sezonu

Sezon składa się z siedmiu warstw. **Brak warstwy 1 lub 2 = to nie jest sezon, tylko
skórka** — i tak potraktuje to G0.

| # | Warstwa | Rola |
|---|---|---|
| 1 | **Prop na mapie** | czynność, której wcześniej nie było; dokłada się do meczu, nie zastępuje go |
| 2 | **Licznik w meczu** | natychmiastowy feedback ze zbierania (Sensoryka) |
| 3 | **Pętla w meczu** | nagroda w ciągu minuty, nie tygodnia |
| 4 | **Meta-kolekcja** | cel na całą długość sezonu |
| 5 | **Nagroda finalna** | rzecz nie do zdobycia później — powód, by wrócić |
| 6 | **Art** | `public/seasons/<id>.jpg` |
| 7 | **Teksty** | nazwa + 3 bullety, `pl.ts` **i** `en.ts` |

Warstwy 3-5 mogą jechać jako **Akt 2** w środku sezonu — to nawet lepiej, bo środek
sezonu dostaje własny beat re-engagementu zamiast ciszy.

> **Projekt warstw 1-5 dla obecnej koncepcji: [`SEASON_ENGINE.md`](SEASON_ENGINE.md).**
> Tam są wszystkie wymiary plików, limity znaków, struktura paczki sezonu
> (`public/seasons/<id>/`) i checklista producenta. Ten dokument opisuje ZASADY kitu,
> `SEASON_ENGINE.md` opisuje KONKRETNY silnik zbudowany na tych zasadach.

---

## `id` sezonu — rzecz nietykalna

**`id` NIE jest numerem sezonu.** Numer widziany przez gracza siedzi w tekście i18n
pod `nameKey`. `id` jest kluczem zapisu stanu i ma trzy zastosowania:

| Gdzie | Po co |
|---|---|
| `ProgressionService.ts:307` | `ensureSeason` — obce id kasuje `trophies` **i** `claimed` |
| `ProgressionService.ts:571` / `:835` | kolumna `seasonId` w chmurze i warunek merge |
| `SeasonOverlay.ts:31` | nazwa pliku artu `public/seasons/<id>.jpg` |

Do tego pill w hubie renderuje `id.toUpperCase()` — gracz **widzi** „S3".

**Po starcie sezonu id się nie zmienia. Zwolnionego id nie używa się ponownie.**
Próba przenumerowania z 25.08.2026 została cofnięta, bo groziła dwoma szkodami:
reset liczników w trakcie trwającego sezonu, oraz — groźniejsze, z zapłonem dopiero
w dniu startu następnego sezonu — wlanie starego postępu z chmury do nowego sezonu
i oznaczenie progów jako odebranych bez zdobycia. Pilnują tego bramki **G2** i **G1**.

---

## Kontrakt slotów UI

Sezon **nigdy nie dostaje własnego miejsca w layoucie**. Renderuje się do slotów
o stałym rozmiarze — wtedy „zebrane artefakty coś przesuwają" jest niemożliwe
z definicji, a nie łapane po fakcie.

| Slot | Element | Limit | Bramka |
|---|---|---|---|
| Pill sezonu | `.bt-hub0-s2` (`HubShell.ts:215`) | id ≤ 4 znaki | G2 |
| Tytuł w popupie | `.so-title` | nazwa ≤ 34 znaki | G5 |
| Bullety | dokładnie 3 | ≤ 64 znaki każdy | G4, G5 |
| Hero popupu | `.so-art`, `object-fit: cover` | 2.0–2.6:1, ≤ 250 KB, szer. ≥ 900 | G3 |
| Licznik w HUD | doklejany do istniejącego rzędu | **nie tworzy nowego rzędu** | @375px ręcznie |
| Siatka kolekcji | wewnątrz scrollowanej sekcji | **nie rozpycha modala** | @375px ręcznie |

Dwa ostatnie wiersze zostają weryfikacją ręczną na 375 px — układ HUD zależy od
brawlera i mocy, więc skrypt tego uczciwie nie policzy.

---

## Kontrakt artu

- nazwa: dokładnie `<id sezonu>.jpg`
- proporcja: panorama 2.0–2.6:1 (docelowo ~2.18:1)
- szerokość ≥ 900 px, waga ≤ 250 KB, JPG progresywny
- **bez napisów w dolnym pasie** — popup nakłada tam gradient i tytuł sezonu
- brak pliku = cichy fallback (gradient akcentu + emoji), `onerror` usuwa `<img>`

---

## Przechowywanie stanu

| Rodzaj | Gdzie | Dlaczego |
|---|---|---|
| Licznik sezonowy | `st.season` | ma zginąć razem z sezonem — `ensureSeason` czyści |
| Stan trwały (gabloty, archiwum) | **POZA `st.season`** | `ensureSeason` podmienia `st.season` W CAŁOŚCI; snapshot do archiwum musi się wykonać PRZED czyszczeniem |

Pilnuje **G7**. ⚠️ Nowy pod-dokument = migracja SQL w Supabase (jak `stats` przy
PROFILE-1) — bez kolumny **cały `syncPush` progresji pada**.

---

## Bramki strażnika

| Bramka | Sprawdza |
|---|---|
| **G0** | kontrakt istnieje i ma niepustą, nie-placeholderową sekcję `## MECHANIKA` |
| **G1** | daty stykają się z sąsiadami — bez dziury i bez nakładki |
| **G2** | `id` unikalne, ≤ 4 znaki, zgodne z `nameKey` i `bulletKeys` |
| **G3** | art istnieje (dla sezonów kitowych), proporcja i waga w kontrakcie |
| **G4** | komplet kluczy i18n w `pl` **i** `en`, dokładnie 3 bullety |
| **G5** | budżety znaków nazwy i bulletów |
| **G6** | progi `SEASON_MILESTONES` rosnące, nagrody tylko w `bolts`/`crates` |
| **G7** | kontrakt nie wkłada trwałego stanu do `st.season` |

**Sezony legacy** (start przed `KIT_SINCE = 2026-09-01`, czyli `s2` Arena) są zwolnione
z G0 i z wymogu artu — powstały, zanim kit istniał. Bramki spójności obowiązują je tak
samo, bo dotyczą danych, a nie dokumentów.

Strażnik parsuje `season.ts` i pliki i18n tekstowo. **Nieudane parsowanie = FAIL**,
nigdy ciche przejście — gdyby ktoś przeformatował plik, strażnik ma krzyknąć.

---

## Jak dodać sezon — checklista

1. Wpis w `SEASONS` (`src/config/season.ts`) — **nowe, nigdy nieużyte `id`**, daty
   stykające się z sąsiadem.
2. Teksty w `pl.ts` **i** `en.ts`: `season.<id>.name` + `b1`/`b2`/`b3`.
3. `docs/season-kit/contracts/<id>.md` z szablonu — wypełniona sekcja `## MECHANIKA`.
4. Art `public/seasons/<id>.jpg` wg kontraktu.
5. `node tools/season_check.mjs` → `PASS`.
6. Weryfikacja @375px: HUD i popup (to, czego skrypt nie policzy).

---

## Szablon kontraktu

Skopiuj do `docs/season-kit/contracts/<id>.md`:

```markdown
# KONTRAKT SEZONU — `<id>` „<nazwa>"

| | |
|---|---|
| **id** | `<id>` — NIERUCHOME |
| **Okres** | DD.MM.RRRR – DD.MM.RRRR |
| **Nazwa** | „<nazwa>" (`season.<id>.name`) |
| **Emoji / akcent** | <emoji> / `#rrggbb` |
| **Art** | `public/seasons/<id>.jpg` — [DO UZUPELNIENIA] |

## MECHANIKA

Warstwa 1 — prop na mapie: [DO UZUPELNIENIA]
Warstwa 2 — licznik w meczu: [DO UZUPELNIENIA]
Warstwa 3 — pętla w meczu: [DO UZUPELNIENIA]
Warstwa 4 — meta-kolekcja: [DO UZUPELNIENIA]
Warstwa 5 — nagroda finalna: [DO UZUPELNIENIA]

## PRZECHOWYWANIE STANU

Licznik sezonowy: `st.season`. Stan trwały: POZA `st.season`, osobny pod-dokument.

## SLOTY UI

(tabela slotów — patrz SEASON_CONTRACT.md)

## KOSZT MOBILNY

Ocena S/A/B/C + uzasadnienie liczone Z GÓRY.

## OTWARTE — decyzje Mariusza

1. [PROPOZYCJA — decyzja Mariusza] ...
```

Placeholdery `[DO UZUPELNIENIA]` i `[PROPOZYCJA — decyzja Mariusza]` w sekcji
MECHANIKA są łapane przez G0 — kontrakt nie przejdzie, dopóki decyzje nie zapadną.
