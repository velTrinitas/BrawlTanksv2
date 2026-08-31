# SHOP-2 — Celowniki (6 sztuk, towar wyłącznie sklepowy)

Spec produkcyjny. Decyzja Mariusza z 2026-08-31: **wszystkie 6 celowników ląduje w
SKLEPIE, zero w skrzynkach.**

Źródło wyglądu (kanoniczne): `docs/prototypes/BT_Crosshairs_v1.html`.
Funkcje `draw()` z prototypu idą 1:1 do `src/rendering/crosshairs.ts`. Prototyp jest
specem WYGLĄDU, nie wzorcem architektury — nie kopiuj z niego struktury (globalne
tablice, własny rAF).

---

## 1. Dlaczego sklep, a nie skrzynki

`SHOP_ONLY_TYPES` w [`src/config/cosmetics.ts`](../../src/config/cosmetics.ts) i nagłówek
[`src/config/shop.ts`](../../src/config/shop.ts) niosą twardą regułę: *skrzynki dają
kosmetykę profilową, sklep sprzedaje wyłącznie kategorie, których skrzynki nie dają.*
Celowniki dochodzą do `SHOP_ONLY_TYPES` i reguła zostaje nienaruszona — zero
kanibalizacji, zero „kupiłem za 2200, tydzień później wypadło ze skrzynki".

Dodatkowy powód: **celownik to jedyna kosmetyka widoczna W GRZE.** Wszystkie 32
istniejące pozycje widać wyłącznie w hubie; klakson działa tylko na desktopie
(`desktopOnly`). Celownik rysuje się na desktopie przez cały mecz
([`main.ts:641`](../../src/main.ts#L641)) i na mobile przy każdym celowaniu w skali 1.5
([`main.ts:3146`](../../src/main.ts#L3146)). To najbardziej pożądany towar w grze,
więc trafia za deterministyczny zakup, nie za losowanie — czysto także pod PEGI.

Zamyka to zapisany dług projektu „sigmy bez ujścia".

---

## 2. Cennik

```ts
const CROSSHAIR_PRICE: Record<Rarity, number> = { c: 800, r: 1400, e: 2200, l: 3200 };
```

| id | nazwa PL | nazwa EN | rzadkość | cena | ~dni gry |
|---|---|---|---|---|---|
| `ch_sniper`   | Snajper   | Sniper   | c | 800  | ~2 |
| `ch_brackets` | Nawiasy   | Brackets | c | 800  | ~2 |
| `ch_ring`     | Pierścień | Ring     | r | 1400 | ~3 |
| `ch_fangs`    | Kły       | Fangs    | r | 1400 | ~3 |
| `ch_laser`    | Laser     | Laser    | e | 2200 | ~5 |
| `ch_sigma`    | Sigma     | Sigma    | l | 3200 | ~7 |

**Cały komplet = 9800 σ.**

Uzasadnienie wysokości (realny przychód ~400–550 σ/dobę wg komentarza cenowego w
`shop.ts`; skrzynka 800 σ ≈ 2 dni gry):

- Stawka jest **~1.33× naklejek i klaksonów** (600/1000/1600/2400). Naklejka to ozdoba
  profilu, klakson działa tylko na komputerze — celownik widać w akcji na obu
  platformach. Wycena naklejkowa byłaby zaniżeniem najbardziej pożądanej kategorii.
- Pierwszy celownik jest osiągalny po ~2 dniach grania i są dwa takie — kategoria nie
  zaczyna się od ściany.
- Komplet ≈ 3 tygodnie gry, czyli kolekcja starcza na sezon i realnie zjada sigmy.
- Bezpieczne wobec twardej reguły z `shop.ts` (cena skrzynki musi przewyższać jej
  zwrot w sigmach) — celowniki nie zwracają nic, więc nie tworzą perpetuum mobile.

Do zweryfikowania playtestem: jeśli po obniżeniu celów rozkazów dzienny przychód
wyraźnie wzrósł, cały wiersz cen podnosimy jednym tuningiem (jeden `Record`, jedna
zmiana).

---

## 3. Wygląd — kontrakt wspólny (bramka Czytelności)

Każdy z sześciu wariantów, bez wyjątku:

1. **Dwa przebiegi:** ciemny kontur `#111` (grubszy) pod kolorem. To jedyne, co
   gwarantuje kontrast na piasku Pustyni, śniegu Arktyki, neonach City i rdzy Marsa.
2. **Wolna przerwa w środku** — cel nigdy nie zakryty. Wypełniona wyłącznie kropką
   celu.
3. **Koperta rozmiaru ≤ 20·s promienia** (dziś ramię to 16·s). Warianty różnią się
   sylwetką i kolorem, **nie wielkością**.
4. **Kropka celu obecna zawsze.** Punkt trafienia musi być jednoznaczny.
5. `lineCap: 'round'`, `lineJoin: 'round'` — spójnie z istniejącym `drawCrosshair()`.

Bramką jest kolumna **s=1.5** w prototypie (mobile, zoom 0.7), nie desktop.

### Budżet mobilny — klasa S

- ZAKAZ `shadowBlur` (zabójca fill-rate na A54) i gradientów tworzonych per-frame.
- ZAKAZ `Math.random()` w rysowaniu.
- Maksymalnie **jeden** element animowany w całym zestawie — `ch_sigma`, jeden
  `ctx.rotate` o 12°/s. Koszt zerowy.
- Każdy wariant ≤ ~20 operacji ścieżki na klatkę, czyli tyle co dziś.

### Sylwetki

| id | opis | kolor |
|---|---|---|
| `ch_sniper`   | cienki, długi krzyż (ramię 20·s), szeroka przerwa 8·s, mikro-kropka | `#eaf2f8` |
| `ch_brackets` | 4 narożne klamry w rogach ±12·s, środek zupełnie czysty | `#f1c40f` |
| `ch_ring`     | okrąg r=10·s + 4 znaczniki 13→17·s na osiach | `#3aa0e0` |
| `ch_fangs`    | 4 ostrza po skosach, wierzchołki 8·s od środka, wskazują cel | `#ff6b35` |
| `ch_laser`    | ciasny pierścień r=5.5·s + przerywany krąg r=13·s + 2 belki poziome | `#ff2d2d` |
| `ch_sigma`    | obracający się trójkąt r=13·s + statyczny mikro-krzyż + **złota** kropka | `#b07ef7` / `#f1c40f` |

Dokładna geometria: rejestr `CROSSHAIRS` w prototypie.

---

## 4. Implementacja

### Zero migracji SQL

Sprawdzone: `equipped` w bazie to `Record<string, string>`
([`supabase/types.ts:137`](../../src/services/supabase/types.ts#L137)), a `owned` to
płaska tablica id. Nowy typ kosmetyku dochodzi sam przez `progression.cosmetics`
(JSONB) — **żadnego SQL-a, żadnego bumpa `SCORE_VERSION`** (celownik nie dotyka sufitu
wyniku).

### Pliki i kolejność

1. **`src/rendering/crosshairs.ts`** (NOWY) — rejestr
   `CROSSHAIR_STYLES: Record<CrosshairId, { color: string; draw(c, x, y, s, t): void }>`
   + `DEFAULT_CROSSHAIR`. Wzorzec rejestru jak przy mocach: zero `if (id === ...)`.
   Helpery `twoPass()` / `centerDot()` prosto z prototypu.
2. **`src/config/cosmetics.ts`** — `'crosshair'` do `CosmeticType` i do
   `SHOP_ONLY_TYPES`; 6 wierszy w `COSMETICS` z `labelKey` i `crosshair: <id>`.
3. **`src/config/shop.ts`** — `'crosshairs'` do `ShopCategory`, `CROSSHAIR_PRICE`,
   `crosshairSkus()` (kopia `hornSkus()`, bez `desktopOnly`), `...crosshairSkus()` w
   `SHOP_ITEMS`, zakładka w `SHOP_TABS` **za `crates`, przed `stickers`** — to
   najmocniejszy towar, ma być widoczny od razu.
4. **`src/rendering/HUD.ts`** — pole `crosshairStyle: CrosshairId`;
   `drawCrosshair()` deleguje do rejestru zamiast rysować na sztywno.
   Zachować `crosshairScale` i obie ścieżki wywołania bez zmian.
5. **`src/main.ts`** — dwie celowane edycje: ustawienie `hud.crosshairStyle` z
   `ProgressionService` przy starcie meczu (obok `showCrosshair`/`crosshairScale` w
   okolicy [linii 641](../../src/main.ts#L641)) + fallback na `DEFAULT_CROSSHAIR`, gdy nic
   nie założone.
6. **`src/ui/hub/cosmeticGrid.ts`** — podgląd WYSIWYG: kropka karty to **mini-canvas
   rysowany prawdziwą funkcją** z rejestru (nie emoji, nie kolorowe kółko). Przy okazji
   `TYPE_LABEL_KEY` nie ma dziś wpisu dla `sticker` — dołożyć `sticker` i `crosshair`.
7. **`src/ui/hub/overlays/ShopOverlay.ts`** — kafel/modal produktu ma pokazywać
   ten sam podgląd canvasowy (kupujący musi widzieć, co kupuje).
8. **`src/i18n/translations/pl.ts` + `en.ts`** — 6 × `cosmetic.ch_*`,
   `shop.tab.crosshairs`, `shop.item.crosshair.desc`, `hub.garage.type.crosshair`.
   Klucze literalne, PL z diakrytykami, EN bez.

### Bramki przed oddaniem

- `tsc --noEmit` czysto.
- `assertShopCatalog()` bez błędów w konsoli (łapie literówkę w id i brak zakładki).
- Podgląd @375px: zakładka SKLEP z 5 kategoriami nie zawija się w kaszę.
- Playtest na A54: FPS bez regresji, celownik czytelny na Arktyce i w City.

### Czego NIE robić

- Nie dodawać celowników do puli skrzynek. Zweryfikowane: `cosmeticIdsOfRarity()`
  ([`cosmetics.ts:167`](../../src/config/cosmetics.ts#L167)) sam odfiltrowuje
  `SHOP_ONLY_TYPES`, więc **jedyne, co trzeba zrobić, to dopisać `'crosshair'` do tego
  setu** — pula skrzynek zostanie nietknięta automatycznie.
- Nie ruszać `CURRENT_SCORE_VERSION`.
- Nie wprowadzać wariantu, który łamie którykolwiek z 5 punktów kontraktu z §3.
