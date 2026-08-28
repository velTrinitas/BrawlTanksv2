# public/seasons — grafiki sezonow

> **NOWY FORMAT (SEASON_ENGINE v2): katalog per sezon.**
> ```
> public/seasons/s3/
>   hero.jpg      576x1024 (9:16)  <=250 KB   popup sezonu
>   decor.jpg     2400x400         <=250 KB   tlo panelu gracza (FAKTURA, nie scena)
>   item1..6.png  128x128 RGBA     <=30 KB    znajdzki, wypelnienie kadru >=90%
> ```
> Pelne wytyczne + checklista producenta: `docs/season-kit/SEASON_ENGINE.md`.
> Bramka G3 w `tools/season_check.mjs` sprawdza KOMPLETNOSC paczki — polowiczna
> paczka to FAIL, bo silnik podlaczylby sezon z dziura w kolekcji.
>
> Ponizszy opis dotyczy STAREGO formatu (plaski `<id>.jpg`), ktory dziala jako
> fallback, dopoki katalog nie powstanie.

SeasonOverlay laduje `public/seasons/<id>.jpg`, gdzie `<id>` to `id` sezonu
z `src/config/season.ts` (s1, s2, s3...). Brak pliku = cichy fallback na
gradient akcentu + emoji motywu (`onerror` usuwa <img>). Zero configu.

## Kontrakt pliku

- nazwa: dokladnie `<id sezonu>.jpg` (np. `s3.jpg` = Powrot do Szkoly)
  UWAGA: `<id>` to id z season.ts, NIE numer sezonu widziany przez gracza.
  Sezon „Sezon 3 — Powrot do szkoly" ma id `s3`, ale np. „Sezon 2 — Arena" ma
  id `s2` przypadkiem — id sie nie przenumerowuje, tekst tak. Patrz komentarz
  przy polu `id` w `src/config/season.ts`.
- proporcja: panorama ~1024x469 (2.18:1) - taka ma art promo
- waga: max ~250 KB (reszta intro/ trzyma sie 165-233 KB)
- format: JPG (progressive). PNG tylko gdy naprawde potrzebna przezroczystosc.
- BEZ napisow w rogu dolnym - popup naklada tam gradient + tytul sezonu.

## Stan

- s2 Arena              - brak (fallback: gradient + emoji)
- s3 Powrot do Szkoly   - `s3.jpg` (1024x434, 165 KB) — od 01.09.2026
- s4+ reszta roadmapy   - brak (fallback)
