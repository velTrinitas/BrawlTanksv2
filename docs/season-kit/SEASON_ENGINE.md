# SILNIK SEZONOWY — spec produkcyjny (v2)

> **Zastępuje** `SEZONOWY_ZBIERACZ_silnik_v1.md` (v1.1, 2026-08-27). Powstał z audytu
> tamtego dokumentu względem realnego kodu na v0.122.1 + decyzji Mariusza z 28.08.
>
> **Po co ten dokument:** żeby dało się przygotować materiały na 2-3 sezony do przodu,
> wrzucić je do repo i mieć pewność, że silnik sam je podłączy. Każde pytanie
> produkcyjne („jak nazwać plik", „jakiej szerokości ma być dekor", „ile znaków ma
> bullet") ma tu odpowiedź liczbą albo nazwą — nie ogólnikiem.
>
> **Źródło prawdy:** live build + Notion PROJECT CONTEXT wygrywają, jeśli się rozjadą.

---

## 0. Co się zmieniło względem v1.1 (audyt)

| # | Było w v1.1 | Stan faktyczny w kodzie | Rozstrzygnięcie |
|---|---|---|---|
| 1 | §9: komplet daje **skin czołgu** | **Systemu skinów NIE MA.** `CosmeticType = 'nickColor' \| 'frame' \| 'title'` — wszystkie DOM-owe. Czołgi renderuje 2.5D baker | Komplet daje **zestaw 3 kosmetyk**. Skiny = osobna faza (§8) |
| 2 | §15: „Supabase monotonic, **NIE** client-side grant" | Grantów serwerowych nie ma. `st.bolts += …`, `st.cratesEarned += …` **lokalnie**, potem sync | Opis poprawiony (§9). Cel anti-exploit i tak spełniony |
| 3 | §8: „czym zasilany Szlak — decyzja FAZY 1" | Szlak jedzie z `st.season.trophies`. **Osobny licznik `st.season.collected` już istnieje** | Zamknięte (§7) |
| 4 | §5: tor ILOŚCI → „progi sezonowe" (nieokreślone) | **Sigmy nie mają ujścia** — brak sklepu i `spendBolts` | Tor ilości daje **skrzynki** (§7) |
| 5 | §7 „max 1-2 żywe" vs §12B „40. ołówek" | Sprzeczne liczby | Jeden spójny zestaw (§5) |
| 6 | brak wyceny artu | — | §11 |
| 7 | `contracts/s3.md` opisuje LEKCJE/Plan Lekcji | Bramka G0 czyta z niego MECHANIKĘ | Kontrakt przepisany |

**Utrzymane z v1.1 bez zmian:** dokładnie 6 znajdziek · silnik data-driven · kadencja
2 miesiące z auto-rolloverem · punkty NIE do rankingu · `id` sezonu nietykalne ·
gates set-based po `value` (nie po indeksie tablicy) · pity jako wymóg · juice
skalowany rzadkością · silnik NIE wchodzi na premierę sezonu.

---

## 1. Paczka sezonu — struktura katalogu

**Nowy sezon = nowy katalog o tej samej strukturze. Zero zmian w kodzie.**

```
public/seasons/s3/
  hero.jpg        popup sezonu        576 x 1024   (9:16)   <= 250 KB
  decor.jpg       tlo panelu gracza   2400 x 400            <= 250 KB
  item1.png                           128 x 128    PNG RGBA <= 30 KB
  item2.png  ...  item6.png
```

**Dlaczego katalog per sezon, a nie płaskie `s3_item1.png`:** przy ośmiu sezonach
płaska lista to 48 plików w jednym folderze. Silnik składa ścieżkę z `seasonId`, więc
nazwy plików są **zawsze te same** — nie trzeba ich nigdzie rejestrować.

**Zgodność wsteczna:** obecny `public/seasons/s3.jpg` działa jako fallback, dopóki nie
powstanie katalog. Bramka G3 sprawdza jedno albo drugie.

---

## 2. Znajdźki — plik graficzny

| Parametr | Wartość | Dlaczego |
|---|---|---|
| Wymiary | **128 × 128** | Docelowo ~51 px na mapie; przy `devicePixelRatio 2` to 102 px realnych. 100×100 jest na granicy, 128 daje zapas na ewentualne powiększenie |
| Format | PNG RGBA | przezroczystość obowiązkowa |
| Waga | ≤ 30 KB / plik | obecne książki: 12-14 KB, więc to komfortowy limit |
| Wypełnienie kadru | **≥ 90%** | zmierzone na obecnych książkach: 96-100%. Mniejsze wypełnienie = przedmiot wygląda na mniejszy mimo tej samej wartości `size` |

**Czego NIE umieszczać w pliku:**
- **cienia** — rysuje go silnik (elipsa na ziemi, nie bujająca się razem z przedmiotem);
- **poświaty** — silnik tintuje ją kolorem rzadkości z manifestu;
- **obrysu w kolorze rzadkości** — rzadkość niesie poświata, nie obrys.

**Sylwetki:** sześć przedmiotów musi być rozróżnialnych **od siebie i od czterech
istniejących pickupów** (gem, serce, magnes, PowerCube) przy zoomie 0.7 na 375 px.
To jest dziesięć sylwetek w jednym kadrze — projektować pod kontur, nie pod detal.

---

## 3. Znajdźki — styl, który nadaje SILNIK

Te wartości są już zaimplementowane i przetestowane w `src/entities/pickups/SeasonPickup.ts`.
Producent artu ich nie dotyka, ale musi je znać, bo wpływają na to, jak plik wygląda w grze.

| Zachowanie | Wartość |
|---|---|
| Rozmiar na mapie | 51 px szerokości, **jednakowy dla wszystkich sześciu** |
| Lewitacja | amplituda 2.6 px, okres ~1.6 s, faza losowa per sztuka |
| Obrót | 0.004 rad/klatkę |
| Cień | 1.40 × szerokości, 0.64 × wysokości, krycie 0.55, **nie bujа się** |
| Poświata | 2.1 × szerokości, kolor z manifestu, oddycha w kontrze do lewitacji |
| Czas życia | 25 s, ostatnie 4 s miganie |

> **Rozmiar jest jednakowy celowo.** Wcześniej rósł z rzadkością (37/46/57 px) jako
> druga wskazówka wartości — w praktyce czytało się to jako niedoróbka („czemu zielona
> jest mniejsza?"). Rzadkość niesie **kolor okładki i kolor poświaty**.

> **Cień nie bujа się razem z przedmiotem** — na tym stoi cała iluzja lewitacji.
> Gdyby bujał się z nim, przedmiot czytałby się jako leżący i drgający.

---

## 4. Sześć przedmiotów — manifest

Wartość `value` (1..6) jest **jednocześnie**: numerem przedmiotu w regułach, liczbą
punktów za sztukę i tierem celebracji. **Wszystkie progi i pity klucz-ujemy po `value`,
NIGDY po indeksie tablicy** — projekt ma udokumentowaną historię błędów off-by-one
(ostatni: skala sprite'a liczona z `texture.width`, gigantyczna książka 26.08).

**Lista dla S3 „Powrót do Szkoły" — ZATWIERDZONA przez Mariusza 28.08.2026 (dec. A):**

| `value` | Przedmiot | Plik | Rzadkość | Waga | Kolor poświaty |
|---|---|---|---|---|---|
| 1 | **Ołówek** | `item1.png` | pospolity | 40% | zielony |
| 2 | **Książka** | `item2.png` | częsty | 25% | zielony jaśniejszy |
| 3 | **Zeszyt** | `item3.png` | niezbyt częsty | 15% | niebieski |
| 4 | **Ekierka** | `item4.png` | rzadki | 10% | niebieski jaśniejszy |
| 5 | **Plecak** | `item5.png` | bardzo rzadki | 7% | **fioletowy** |
| 6 | **Globus** | `item6.png` | super rzadki | 3% | **tęczowy / czerwony** |

> ⚠️ **RYZYKO CZYTELNOŚCI — Książka (2) vs Zeszyt (3).** To jedyna para na liście
> o zbliżonej sylwetce: oba są płaskimi prostokątami, w dodatku w sąsiednich tierach,
> więc i kolory poświaty mają blisko siebie. Przy zoomie 0.7 gracz musi je rozróżnić
> **konturem**, nie kolorem. Wytyczna dla artu:
> - **Książka** — bryła 3/4 z widoczną grubością bloku kartek i grzbietem, twarda okładka;
> - **Zeszyt** — płaski, ze **spiralą** przy krawędzi i widoczną **kratką/liniaturą**
>   na okładce.
>
> Pozostała czwórka jest bezpieczna: ołówek to cienka ukośna kreska, ekierka trójkąt,
> plecak trapez ze szelkami, globus kula na stojaku. Sześć znajdziek musi być
> rozróżnialnych także od czterech istniejących pickupów (gem, serce, magnes,
> PowerCube) — to dziesięć sylwetek w jednym kadrze.

> **Złoto jest zarezerwowane dla Enigmy.** Topowe tiery świecą fioletem i czerwienią,
> nie złotem — inaczej rozmywamy tożsamość, która już coś znaczy.

---

## 5. Spawn, rzadkość i pity — JEDEN spójny zestaw liczb

v1.1 miała tu sprzeczność: §7 mówiło „max 1-2 żywe naraz", a §12B argumentowało juice
tym, że „40. ołówek ≠ pierwszy". Przy 1-2 żywych gracz nie zobaczy czterdziestu
ołówków, a szóstki przy 3% nie zobaczy **nigdy**. Liczby muszą być strojone razem.

| Parametr | Wartość startowa | Uwaga |
|---|---|---|
| Max żywych naraz | **3** | kompromis: 1-2 to za mało na poczucie obecności, 8 (obecne) zasypuje mapę |
| Próba spawnu | co 4 s | jedna próba = jedno losowanie z wag |
| Oczekiwane na mecz (~3 min) | ~18 sztuk, w tym ~1 rzadka (5-6) | przy powyższych |
| **Pity na `value: 6`** | licznik prób bez szóstki; po 40 próbach szansa rośnie o 2 pkt proc. na próbę | „nagradzamy pilność, nie szczęście" |

Spawn przez **istniejący** `spawnSystem.findSafePickupPos(playerX, playerY, buildings)`
— publiczny helper dodany przy porcie CTF, sam omija przeszkody. **Nie trzeba
generatora ani autorskiego rozmieszczenia per mapa.**

**Telegraf tylko dla `value` 5-6:** subtelny błysk przy pojawieniu. Pospolite bez —
inaczej robimy szum zamiast sygnału.

---

## 6. Dwa tory nagród

Oba chodzą z tego samego pickupu.

**Tor RÓŻNORODNOŚCI** (kompletność) — gates set-based, kolejność zdobycia bez znaczenia:

| Próg | Warunek | Nagroda |
|---|---|---|
| Trzy pospolite | zdobyte `{1,2,3}` | **Skrzynka sezonowa** |
| Środek | dodatkowo `{4,5}` | Tytuł sezonowy |
| **Komplet** | wszystkie `{1,2,3,4,5,6}` | **Zestaw 3 kosmetyk**: tytuł + ramka + kolor nicku w motywie sezonu |

**Tor ILOŚCI** (wolumen) — punkty na progach dają **skrzynki sezonowe**.

> **Dlaczego nie skin czołgu za komplet:** systemu skinów nie ma (patrz §0.1 i §8).
> Zestaw trzech kosmetyk naraz jest widoczny w hubie, rankingu i profilu — gracz nosi
> ślad sezonu, a my nie budujemy podsystemu na ścieżce krytycznej.

> **Dlaczego nie sigmy:** sigmy nie mają ujścia. Brak sklepu, brak `spendBolts` —
> `bolts` rośnie w nieskończoność jako liczba w hubie. Nagroda w sigmach byłaby
> pozorna. To osobny dług projektu, do rozstrzygnięcia poza sezonem.

---

## 7. Punkty sezonowe — gdzie żyją

**Rozstrzygnięte, zaimplementowane.** Żywy Szlak Sezonu jedzie z `st.season.trophies`
(`computeTrophies` + guard `claimed`) — wpięcie drugiego wejścia groziłoby ruszeniem
live-mechaniki. Dlatego punkty mają **osobny licznik**:

- `st.season.collected` w `ProgressionService` — monotonic, ginie razem z sezonem
  przy `ensureSeason` (i to jest poprawne: licznik sezonowy, nie dorobek życia);
- w chmurze: pole `seasonCollected` w istniejącej kolumnie **`stats` JSONB**, merge
  przez MAX przy zgodnym `seasonId`. **Bez migracji SQL.**

`CURRENT_SCORE_VERSION` i formuła rankingu — **nietknięte**.

---

## 8. Skiny czołgów — faza 2, ale projektowana teraz

Dziś nie ma systemu skinów. Opisujemy docelowy kształt, żeby art powstawał świadomie.

**Gdzie się zbierają:** zakładka **SEZON** w profilu → sekcja „Muzeum sezonów".
Trwałe, per `seasonId`, nie kasowane przy rollowerze.

**Gdzie gracz je zakłada:** wybór czołgu w `BattleSection` („PICK YOUR TANK") —
na karcie brawlera przełącznik posiadanych skinów.

**Styczeń 2027, wybór skina z S3:** gracz wchodzi w wybór czołgu → karta brawlera →
lista posiadanych skinów zawiera „S3 — Powrót do szkoły". Warunek: skin zapisany
per `seasonId`, a `seasonId` **nigdy nie jest recyklowane** — dlatego ta reguła jest
tak twarda w całym kicie.

**Koszt:** nowa ścieżka bake'u albo system przebarwień w 2.5D bakerze. To jest
**większa pozycja niż sam silnik znajdziek** — stąd faza 2.

---

## 9. Anti-exploit — jak to działa naprawdę

v1.1 pisała „Supabase monotonic, NIE client-side grant". W kodzie **nie ma grantów
serwerowych** — nagrody przyznaje `ProgressionService` lokalnie (`st.bolts += …`,
`st.cratesEarned += …`), a Edge Function pilnuje wyłącznie submitu wyników.

**Ale cel jest osiągnięty i tak**, przez istniejący wzorzec: liczniki są **monotonic
i mergowane przez MAX**. Wyczyszczenie localStorage nie pozwala farmić, bo przy
najbliższym syncu chmura przywraca wyższą wartość. Nowe liczniki sezonowe muszą trzymać
ten sam kontrakt: **monotonic, merge MAX, klucz per `seasonId`**.

---

## 10. Gdzie gracz co widzi

| Miejsce | Co pokazuje | Stan |
|---|---|---|
| HUD w meczu | chip `📕 N` + podpis „Książki"/„Books" | **jest** |
| Ekran końca meczu | chip `📕 +N` w wierszu progresji | **jest** |
| Pill sezonu na belce huba | badge z liczbą (ukryty przy zerze) | **jest** |
| Popup sezonu | **mini-siatka 3×2 + pasek do NAJBLIŻSZEGO PROGU** | ⚠️ do przebudowy |
| **Profil → zakładka SEZON** | grid 3×2, **suma punktów**, progi z nagrodami, muzeum | do zbudowania |

### Pasek w popupie — dlaczego obecny jest prowizorką

Dziś popup pokazuje `📕 TEXTBOOKS 32 / 60`. **Sześćdziesiąt to liczba wymyślona jako
wartość startowa, przy której nie stoi żadna nagroda** — pasek dojdzie do `60/60`
i nie stanie się nic. To jest obietnica bez pokrycia, czyli dokładnie ten błąd,
którego cały ten dokument ma uniknąć.

W nowym modelu jeden pasek nie opisuje dobrze żadnego z dwóch torów, więc rozdzielamy:

- **Tor różnorodności** → **mini-siatka 3×2**: sześć kafelków, zdobyte odkryte,
  niezdobyte jako „?". Gracz widzi nie „ile", tylko **czego mu brakuje** — to jest
  silniejszy hak niż licznik, i to jest „luka ciekawości" z v1.1.
- **Tor ilości** → pasek **do najbliższego progu z nagrodą**, np. `32 / 40 → 📦`,
  nigdy do abstrakcyjnego celu. Pasek ma mówić, co dostaniesz i za ile.

**Podział miejsc:** popup = wersja skrócona (mini-siatka + najbliższy próg), bo to
ekran-zajawka. Zakładka SEZON = pełny widok (cała siatka, suma punktów, wszystkie
progi, muzeum).

**Zakładka SEZON — akceptacja propozycji Mariusza z zastrzeżeniem.** Zakładki mają dziś
100 + 92 + 106 px, pas ma `flex-wrap: wrap`. Czwarta (~95 px) daje ~410 px przy ~343 px
dostępnych na 375 px → **pas przełamie się do drugiego rzędu i zje ~44 px wysokości**.
Akceptowalne, ale świadomie. Alternatywa: skrócić etykiety do „Ogólne / Rekordy /
Kolekcja / Sezon".

**Skrzynka sezonowa wyróżniona** — `CrateOverlay` używa emoji `📦` i klucza
`t('crate.title')`, więc wariant sezonowy to podmiana ikony, koloru ramki i tytułu
na „SKRZYNKA SEZONOWA". Tanie, a gracz musi widzieć, że to nagroda z sezonu.

---

## 11. Dekor panelu gracza — 2400 × 400, ale jako FAKTURA

Panel `.bt-hub0-phero` ma **1185 × 150 px na desktopie** (cap ~1200), `min-height: 132px`,
`border-radius: 14px`, a jego zawartość ma `flex-wrap` — więc **na telefonie zawija się
do ~343 px szerokości i rośnie w pionie**.

To oznacza rozpiętość proporcji od **7.9:1 do ~1.5:1**. Przy takiej rozpiętości
`object-fit: cover` przytnie scenę w sposób nieprzewidywalny.

**Dlatego dekor ma być fakturą, nie sceną:** kratka zeszytu, tekstura tablicy,
powtarzalny wzór. Tolerancyjny na dowolne kadrowanie. Jeśli motyw musi być — tylko
w **lewych 340 px** (ta część jest widoczna zawsze) i powtarzalny w prawo.

---

## 12. Tekst na popup — dokładne wytyczne

Limity są **egzekwowane przez bramkę G5** strażnika, nie przez dobre chęci.

| Element | Limit | Uwaga |
|---|---|---|
| `id` sezonu | **≤ 4 znaki** | pill renderuje go graczowi jako „S3" |
| Nazwa sezonu | **≤ 34 znaki** | np. „Sezon 3 — Powrót do szkoły" (28) |
| Bullety | **dokładnie 3**, każdy **≤ 64 znaki** | popup ma stały slot |

**Pojemność bez scrolla — zmierzona:** 7 bulletów na typowym telefonie w poziomie
(844 × 390), ale **tylko 4 na najmniejszym realnym (667 × 375)**. Pisząc treść,
celować w **4**; piąty zaczyna scrollować na małych ekranach.

**Ton:** jeden bullet = jedno konkretne obiecane doświadczenie. Bez marketingu,
bez „więcej niespodzianek wkrótce" (to placeholder, nie treść).

**Grafika popupu:** `hero.jpg`, **576 × 1024 (9:16)**, ≤ 250 KB. Pion jest preferowany —
w poziomej orientacji gry wysokość jest zasobem rzadkim, więc art idzie w lewą kolumnę
na pełną wysokość, a tekst w prawą. Bramka G3 dopuszcza też panoramę 2.00-2.60, ale
to format zastany. **Napisy tylko w górnej części kadru.**

---

## 13. Guide in-game — jak gracz dowiaduje się, co to jest

Trzy warstwy, wszystkie na **istniejącym** techu:

1. **Pierwszy kontakt** — jednorazowa podpowiedź `ItemHints` (ten sam mechanizm, co
   `heart`/`magnet`/`cube` z tutorialu; `ItemHintId` rozszerzamy o `seasonItem`).
   Pokazuje się raz na profil, gdy gracz pierwszy raz zbliży się do znajdźki.
2. **Pierwsze zdobycie danego typu** — reveal „NOWY W KOLEKCJI!" + kafel w gridzie
   odkrywa się z połyskiem. Flaga per przedmiot/sezon.
3. **Wspólny „tell" wizualny** — wszystkie sześć ma ten sam subtelny ring bazowy, więc
   gracz najpierw czyta „to znajdźka sezonowa", a dopiero potem „która".

Celebracja skalowana rzadkością (`value` 1-2: mały pop; 3-4: iskry + puls; 5: floating
text + fanfara; 6: hit-stop + konfetti + baner) reużywa `Effects.ts`, `hitStopFrames`
z `main.ts` i konfetti z ekranu zwycięstwa. **Koszt mobilny ~0** — value-change only.

Audio: wpiąć `safePlayVaried` (jitter pitch/głośności, już używany w `playShoot`/
`playHit`), żeby czterdziesty ołówek nie walił tym samym samplem.

---

## 14. Checklista producenta — co przygotować na nowy sezon

| # | Element | Format / limit |
|---|---|---|
| 1 | `hero.jpg` | 576 × 1024, ≤ 250 KB, napisy tylko u góry |
| 2 | `decor.jpg` | 2400 × 400, **faktura** nie scena, ≤ 250 KB |
| 3 | `item1..6.png` | 128 × 128 RGBA, ≤ 30 KB, wypełnienie ≥ 90%, bez cienia i poświaty |
| 4 | Nazwa sezonu | ≤ 34 znaki |
| 5 | 3 bullety | ≤ 64 znaki każdy |
| 6 | 6 nazw przedmiotów | player-facing, PL + EN |
| 7 | 6 kolorów poświaty | hex, zielony → fiolet/czerwień; **złoto zakazane** |
| 8 | Daty start/koniec | stykają się z sąsiadem, bez dziury i nakładki |
| 9 | `id` sezonu | ≤ 4 znaki, **nigdy nieużyty wcześniej** |

Strażnik `node tools/season_check.mjs` sprawdza pozycje 1-3, 4-5, 8-9 automatycznie.

---

## 15. Koszt artu i kadencja — wąskie gardło

Silnik zdejmuje koszt **kodu**, nie **artu**. Każdy sezon to 6 sprite'ów + hero + dekor,
czyli osiem plików graficznych co dwa miesiące. Przy jednoosobowym zespole to jest
realne wąskie gardło całego przedsięwzięcia — nie inżynieria.

Konsekwencja dla planowania: **materiały na 2-3 sezony do przodu** (dokładnie to, co
Mariusz chce robić) są nie tyle wygodą, ile warunkiem utrzymania kadencji. Zawór
bezpieczeństwa przy poślizgu: **przedłużenie trwającego sezonu** przez zmianę daty
końca — **nigdy dziura między sezonami** (bramka G1 to wyłapie).

---

## 16. Definition of Done

- [ ] Manifest czytany z katalogu; nowy sezon = katalog + wpis, zero nowego kodu
- [ ] 6 znajdziek, wagi, max 3 żywe, pity na `value: 6` działa
- [ ] Gates set-based po `value`; komplet daje zestaw 3 kosmetyk
- [ ] Tor ilości → skrzynki sezonowe na progach punktowych
- [ ] Punkty w `st.season.collected`, `CURRENT_SCORE_VERSION` nietknięty
- [ ] Zakładka SEZON: grid 3×2 + suma punktów + progi + muzeum
- [ ] Skrzynka sezonowa wizualnie odróżniona
- [ ] Guide: `ItemHints` + „NOWY W KOLEKCJI!" + wspólny tell
- [ ] Celebracja skalowana rzadkością + `safePlayVaried`
- [ ] Bramka G3 waliduje kompletność paczki (6 itemów + hero + dekor)
- [ ] Czytelność @375px landscape zoom 0.7: 6 znajdziek rozróżnialnych od siebie
      i od 4 istniejących pickupów
- [ ] `tsc` czysty, build przechodzi, `season_check` PASS
- [ ] **Playtest A54 (Michał) = brama shipu**

---

## 17. Otwarte decyzje

| # | Decyzja | Stan |
|---|---|---|
| A | Finalna lista 6 przedmiotów S3 | ✅ **ZAMKNIĘTE 28.08** — ołówek · książka · zeszyt · ekierka · plecak · globus (§4) |
| B | Nazewnictwo etapów treści w sezonie | ✅ **ZAMKNIĘTE 28.08** — nie dzielimy sezonu na etapy, więc słowo niepotrzebne (niżej) |
| C | Etykiety zakładek profilu | ✅ **ZAMKNIĘTE 28.08** — zostają pełne, przyjmujemy drugi rząd (niżej) |

### B — dlaczego nie dzielimy sezonu na etapy

„Odsłona" miała nazywać etapy treści W OBRĘBIE sezonu (np. znajdźki na starcie, druga
porcja po trzech tygodniach). Przy paczce z sześcioma gotowymi plikami naturalne jest
wydanie całości pierwszego dnia — więc **etapów nie ma i słowo jest zbędne**.

Gdyby kiedyś wróciły: nazywamy je **„Odsłona 1/2"**, nigdy „Faza" — w projekcie „faza"
znaczy już trzy rzeczy (tryb pracy agenta, harmonogram wdrożenia, rozdziały Szlaku
Trofeów `ACT_II_MILESTONES`) i czwarte znaczenie zrobiłoby bałagan.

### C — zakładki profilu zostają pełne, akceptujemy drugi rząd

Zmierzone w realnym stylu zakładki, przy 343 px dostępnych na ekranie 375 px:

| Wariant | Suma | Mieści się |
|---|---|---|
| Przegląd · Rekordy · Kolekcja · Sezon | 362 px | nie (o 19 px) |
| Ogólne · Rekordy · Kolekcja · Sezon | 351 px | nie (o 8 px) |
| Ogólne · Rekordy · **Zbiory** · Sezon | 335 px | tak, zapas 8 px |
| angielskie (Overview…Season) | 386 px | nie |

Skracanie odrzucone: 8 px zapasu zje pierwsza różnica w renderowaniu czcionki,
angielska wersja i tak się nie mieści, a „Zbiory" jest gorszym słowem dla
dziewięciolatka niż „Kolekcja". **Drugi rząd kosztuje 44 px raz, na ekranie, który
i tak się przewija** — i to jest tańsze niż pogorszenie nazw w obu językach.

**Poza ścieżką krytyczną, do świadomego zaplanowania:** sigmy bez ujścia (sklep) oraz
system skinów czołgu. Oba są długami, które lepiej zaplanować niż odkryć w trakcie.
