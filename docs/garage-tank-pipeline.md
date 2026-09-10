# PRODUKCJA CZOŁGÓW 3/4 DO GARAŻU — instrukcja krok po kroku (v1)

> **Po co ten dokument:** obrotnica 3/4 w Garażu (`?choose=1`) to największy smaczek
> huba. Ten dokument prowadzi od ilustracji czołgu do działającej obrotnicy tak, żeby
> każdy kolejny czołg wyszedł DOBRZE ZA PIERWSZYM RAZEM. Każda reguła poniżej wzięła
> się z realnego problemu na pilocie KRÓLA i TWARDEGO — nie pomijać kroków.
>
> **Stan na:** v0.158.0 (2026-09-06), pilot KRÓL zaakceptowany przez Mariusza.
> **Kod:** `src/ui/hub/tankTurn360.ts` (viewer), `src/config/hubChoose.ts`
> (`TURN360_TANKS`), `tools/turntable-cutter.html` (cięcie),
> `tools/atlas-stabilize.mjs` (stabilizacja).

## Obraz całości

```
ilustracja 3/4 (public/assets/tanks/<nazwa>.jpg)
      │  KROK 1: AI image-to-video "orbit 360°"
      ▼
wideo mp4 (lokalnie, NIE do repo)
      │  KROK 2: tools/turntable-cutter.html (Chrome, offline)
      ▼
atlas.webp (grid 6×6, klatki 512px) + meta.json
      │  KROK 3: public/assets/tanks/turn/<brawlerId>/ + wpis w TURN360_TANKS
      ▼
obrotnica w Garażu  ──(pływa oś / resztki?)──►  KROK 4: atlas-stabilize.mjs
```

---

## KROK 0 — wybór koloru tła (PRZED generowaniem!)

**Tło musi być kolorem, którego NIE MA na czołgu.** Chroma-key zdejmuje wszystko
w kolorze tła — zielone tło przy zielonym czołgu zjada kamuflaż (lekcja z Twardego).

| Czołg (id) | Dominujące kolory | Tło do generacji |
|---|---|---|
| twardy, sniper | zielony kamuflaż | **MAGENTA `#FF00FF`** |
| king, pyro, heavy, shadow, scout, plasma | purpura/czerwień/złoto/żółć/cyjan | **ZIELEŃ `#00FF00`** |

Cutter obsługuje oba (AUTO pobiera kolor z rogu wideo).

## KROK 1 — wideo AI (Mariusz, image-to-video)

Wejście: ilustracja 3/4 czołgu (`public/assets/tanks/<nazwa>.jpg`). Prompt-spec:

> Kamera orbituje płynnie 360° wokół czołgu, pełne jedno okrążenie, stała elewacja
> ~25° (jak na obrazku wejściowym), bez zoomu i najazdów. Czołg całkowicie
> nieruchomy: wieża, lufa i antena nie drgają. Oświetlenie stałe przez cały obrót.
> Jednolite tło [ZIELEŃ #00FF00 / MAGENTA #FF00FF — wg KROKU 0], bez cienia
> rzucanego na tło/podłogę. Styl identyczny z obrazkiem wejściowym: cartoon,
> gruby kontur, te same kolory.

**Dźwignia pełnej pętli:** jeśli narzędzie ma klatki kluczowe — ustaw pierwszą
I OSTATNIĄ klatkę na TEN SAM obrazek wejściowy. To domyka pętlę i wymusza pełne
okrążenie zamiast „bujania" tam i z powrotem. Sam tekst „full 360" nie wystarcza.

Checklista przed cięciem (obejrzyj wideo!):
- [ ] pełne okrążenie (widać TYŁ czołgu), nie wahadło,
- [ ] ostatnia klatka ≈ pierwsza (pętla),
- [ ] brak podłogi/cienia na tle (mała plama = ok, KROK 4 zdejmie),
- [ ] rozmiar czołgu nie „oddycha" mocno między ujęciami,
- [ ] kolory i detale zgodne z ilustracją przez cały obrót.
Nie przeszło → generuj ponownie. Cięcie złego wideo to strata czasu.

## KROK 2 — cięcie (tools/turntable-cutter.html)

1. Otwórz plik w Chrome (podwójny klik, zero servera). Przeciągnij mp4.
2. Ustawienia: **36 klatek**, **512 px** (domyślne; 512 = ostrość przy dużej
   gablocie), kolor tła przez **AUTO z rogu**, tolerancja ~34 (podbij, gdy zostają
   resztki tła; zmniejsz, gdy znika czołg), despill ON.
3. **TNIJ KLATKI** → obejrzyj **podgląd pętli 12 fps** — to jest BRAMKA:
   mruganie detali (korona, emblematy, koła) = wideo do ponownej generacji.
4. Ustaw **klatkę startową** (kanoniczne 3/4, lufa w prawo — jak na ilustracji)
   i **kierunek** (obrót „pod rękę" przy dragu w prawo → 1; pod włos → -1).
5. **EKSPORT** → pobiorą się `atlas.webp` + `meta.json`.

**ZASADA KOLORÓW (nienaruszalna):** kolory czołgu w atlasie mają być **1:1
z filmem**. Cutter dotyka wyłącznie 1-3px rampy krawędzi (despill na
półprzezroczystości) — jeśli po cięciu czołg ma inne kolory niż w wideo
(porównaj miniaturę filmu z podglądem), coś jest źle: sprawdź kolor tła
(KROK 0) i tolerancję, nie używaj takiego atlasu.

## KROK 3 — instalacja w repo

**Folder = `brawlerId` z `src/config/brawlers.ts`, NIE nazwa pliku jpg!**

| jpg | brawlerId (folder) | | jpg | brawlerId (folder) |
|---|---|---|---|---|
| krol.jpg | **king** | | tech.jpg | **plasma** |
| pancerny.jpg | **heavy** | | ogniarz.jpg | **pyro** |
| zwiadowca.jpg | **scout** | | snajper.jpg | **sniper** |
| twardy.jpg | twardy | | shadow.jpg | shadow |

1. Oba pliki do `public/assets/tanks/turn/<brawlerId>/`. (GARAZ-4, 2026-09-10: pipeline ZAPARKOWANY — `TURN360_TANKS=[]`; probka KROLA lezy w `tools/samples/tanks/turn/king/`, poza `public/`, zeby nie wchodzila do bundla. Wlaczenie = skopiowac z powrotem + dopisac id.)
2. Dopisz id do `TURN360_TANKS` w `src/config/hubChoose.ts`.
3. Odśwież `?choose=1` → Garaż. Czołg bez atlasu automatycznie wraca na starą
   obrotnicę (runtime fallback) — nic się nie psuje, gdy plików brakuje.

`meta.json` (kontrakt z viewerem): `frames`, `cols`, `frameSize`,
`startFrame` (0-35, poza startowa), `dir` (1/-1, kierunek draga). Dwa ostatnie
można stroić ręcznie w pliku — samo odświeżenie strony wystarcza.

## KROK 4 (opcjonalny) — stabilizacja: `tools/atlas-stabilize.mjs`

Kiedy: czołg „pływa"/wypada z osi talerza przy obrocie, skacze góra-dół, albo
została plama podłogi/cienia pod gąsienicami.

```
npm i --no-save sharp        (raz na maszynę; NIE zapisuje się w package.json)
node tools/atlas-stabilize.mjs <brawlerId>
node tools/atlas-stabilize.mjs king --key=green   (patrz niżej)
```

Co robi: rejestracja klatka-do-klatki (jak stabilizator wideo) + domknięcie pętli
360° → oś czołgu idealnie na środku; kotwica dołu (stały „grunt"); miękkie zdjęcie
cienia pod czołgiem; wygładzenie krawędzi. Czysta translacja — zero utraty ostrości.

- `--key=green` (czyszczenie zielonych resztek) **tylko dla czołgów BEZ zielonego
  artu**. Domyślnie wyłączone — kolory zostają 1:1 z filmem.
- Po akceptacji USUŃ `atlas.orig.webp` (backup) i `atlas.preview.png` z folderu —
  nie commitować.
- „domkniecie petli" w logu blisko 0 px = rejestracja spójna; duże wartości =
  wideo nie robi pełnego koła → wróć do KROKU 1.

## QA przed pokazaniem (checklista)

- [ ] obrót dragiem płynny, czołg NIE pływa względem talerza (patrz na widoki boczne),
- [ ] zero resztek tła i „płyt" pod gąsienicami, krawędź gładka (bez strzępów),
- [ ] kolory 1:1 z ilustracją/filmem,
- [ ] start w kanonicznym 3/4, kierunek draga „pod rękę",
- [ ] flick zmienia czołg, wolny drag obraca (dwa gesty się nie gryzą),
- [ ] atlas ≤ ~1,5 MB,
- [ ] test na telefonie (LAN: `npm run dev -- --host`), finalnie A54.

## Najczęstsze problemy

| Objaw | Przyczyna | Naprawa |
|---|---|---|
| zielone/magenta tło w grze | klucz nie trafił w kolor tła | cutter: AUTO z rogu + podbij tolerancję |
| czołg zmienił kolory | tło w kolorze czołgu (KROK 0) | wygeneruj wideo na przeciwnym tle |
| obrót „pod włos" | kierunek wideo | `meta.json`: `dir` na przeciwny |
| startuje tyłem | zła klatka startowa | `meta.json`: `startFrame` 0-35 |
| pływa oś / skacze | chybotanie kamery AI | KROK 4 (stabilizacja) |
| plama cienia pod czołgiem | podłoga zapieczona w wideo | KROK 4; NIGDY nie wycinać ręcznie po kolumnach (strzępy!) |
| strzępy na dole gąsienic | agresywne cięcie podłogi | wróć do surówki, tnij ponownie, KROK 4 |
| rozmyty czołg | klatki < 512 px | eksport ponownie na 512 |
| kręci się „tam i z powrotem" | wideo bez pełnego koła | KROK 1: keyframe pierwsza=ostatnia |

## Skąd te reguły (historia pilota, skrót)

KRÓL przeszedł 10 wersji atlasu zanim było idealnie: v1-v4 walka z tłem i zapieczoną
podłogą (nauka: despill zamiast kasowania pikseli — kasowanie robi strzępy; cięcie
podłogi po kolumnach — nigdy więcej), v5-v9 walka z osią (nauka: centrowanie po
sylwetce ZAWSZE ma błąd zależny od kąta; działa dopiero rejestracja klatka-do-klatki),
v10 finał. TWARDY dołożył regułę kolorów (globalny despill zjadł kamuflaż).
Cutter i atlas-stabilize mają te lekcje w środku — dlatego trzymamy się pipeline'u.
