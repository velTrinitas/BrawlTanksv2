# Fonty — self-hosted

## Titan One

Jedyny font wyswietlaniowy gry (`--font-display`). **Jednowagowy — ZAWSZE waga 400,
nigdy bold**; `bold` daje faux-bold, ktory jest rozmyty i nieczytelny (patrz
`HUD.ts` naglowek i `.claude/rules/design-values.md`).

| plik | zakres | rozmiar |
|---|---|---|
| `titan-one-latin.woff2` | `U+0000-00FF` + interpunkcja | 10,5 KB |
| `titan-one-latin-ext.woff2` | `U+0100-02BA` i dalej — **tu siedza polskie ogonki** | 5,9 KB |

Zrodlo: Google Fonts, Titan One **v17**, pobrane 2026-08-29 z `fonts.gstatic.com`.
Licencja: **SIL Open Font License 1.1** — pelny tekst w `OFL.txt` (OFL wymaga, zeby
licencja podrozowala razem z fontem).

### Dlaczego self-host, a nie CDN

Do v0.125.0 font szedl wylacznie przez `<link>` do Google Fonts. Trzy problemy:

1. **`PIXI.Text` rasteryzuje sie RAZ, w konstruktorze.** Jesli gracz wejdzie na mape
   zanim font dojdzie z sieci, napisy (neony Miasta, etykiety flag CTF, pady Marsa)
   zapiekaja sie krojem zastepczym i **zostaja takie do konca sesji** — przeladowanie
   mapy nie pomaga, bo tekstura juz istnieje. To psuje sie takze ONLINE, przy zimnym
   cache albo wolnym laczu.
2. **Steam / App Store / Google Play to Capacitor**, czyli aplikacja offline-first.
   Bez sieci font nie zaladowalby sie wcale i cala gra leciala by fallbackiem.
3. Zaleznosc od cudzego serwera na starcie kazdej sesji + dwa dodatkowe zapytania.

Koszt: **+16,4 KB do bundla, −2 zapytania sieciowe**. Netto korzysc, szczegolnie
dla wrapa Capacitora.

### Jak jest wpiete

- `@font-face` z `font-display: block` + `unicode-range` — w `index.html`.
  **`block`, nie `swap`**: `swap` pokazuje fallback i podmienia go po zaladowaniu,
  co dla pieczonych tekstur PIXI oznacza trwale zle napisy. `block` czeka.
- `<link rel="preload" as="font" crossorigin>` — start pobierania bez czekania na CSS.
- `PRECACHE_URLS` w `public/sw.js` — offline dla PWA.
- `await document.fonts.ready` w bootstrapie `main.ts`, **przed pierwszym renderem**.

### Aktualizacja fontu

Podbicie wersji przez Google (v17 -> v18) wymaga sciagniecia obu plikow na nowo
z URL-i podanych przez `https://fonts.googleapis.com/css2?family=Titan+One`
(z naglowkiem User-Agent nowoczesnej przegladarki — inaczej Google odda `ttf`, nie `woff2`).
