/**
 * shop.ts — katalog SKLEPU (SHOP-1, v0.124.0). JEDEN plik = jeden tuning pass.
 *
 * ZASADA PODZIALU: skrzynki daja kosmetyke profilowa (jak dzis), sklep sprzedaje
 * WYLACZNIE kategorie, ktorych skrzynki nie daja (SHOP_ONLY_TYPES w cosmetics.ts).
 * Zero kanibalizacji, zero rotacji dobowej, zero contentu do produkowania co dobe.
 *
 * ⚠️ PEGI / monetyzacja (czerwiec 2026): gra sprzedajaca LOSOWY towar za PRAWDZIWE
 * pieniadze dostaje minimum PEGI 16, czyli wypada z grupy docelowej 9-12. Dlatego
 * `currency` istnieje od pierwszego dnia i jest dzis zawsze 'sigma' (waluta WYLACZNIE
 * zarabiana). Gdy kiedys wejda realne platnosci: towar losowy (skrzynki) NIE MOZE byc
 * osiagalny za waluta realna — ani wprost, ani przez kupowanie sigm. Rozdzielenie
 * teraz kosztuje jedno pole; rozdzielanie po fakcie to przebudowa pod presja ratingu.
 */

import type { TranslationKey } from '../i18n/i18n';
import { getCosmetic, cosmeticsByType, type Rarity } from './cosmetics';

/**
 * SHOP_LIVE steruje DWIEMA rzeczami naraz i warto o tym pamietac przy przelaczaniu:
 *  - widocznoscia sekcji SKLEP w nawigacji,
 *  - trybem zakupow (`isShopSandbox` to doslownie `!SHOP_LIVE`).
 *
 * `false` => sklep tylko za `?shop=1`, a zakupy ida do PIASKOWNICY: biora migawke stanu,
 * `syncPush` jest odciety, a start bez flagi cofa wszystko sam.
 * `true`  => sklep zawsze widoczny, zakupy PRAWDZIWE, synchronizacja normalna.
 *
 * v0.126.0 (decyzja Mariusza po playtescie desktopowym): WLACZONY.
 * Ledger `boltsSpent` dzialal na serio w obu trybach, wiec piaskownica testowala
 * prawdziwa sciezke kodu — przejscie na zywo nie zmienia logiki, tylko trwalosc.
 */
export const SHOP_LIVE = true;

/** Sekcja SKLEP w nawigacji: zawsze przy SHOP_LIVE, inaczej tylko za flaga. */
export function isShopEnabled(): boolean {
    try {
        if (SHOP_LIVE) return true;
        return new URLSearchParams(location.search).get('shop') === '1';
    } catch { return false; }
}

/** Piaskownica aktywna zawsze, gdy sklep dziala spoza produkcji. */
export function isShopSandbox(): boolean {
    return !SHOP_LIVE;
}

export type ShopCategory = 'crates' | 'crosshairs' | 'stickers' | 'horns' | 'voice' | 'soon';

/** Dzis wylacznie 'sigma'. 'real' zarezerwowane — patrz naglowek pliku (PEGI). */
export type ShopCurrency = 'sigma';

export type ShopGrant =
    | { readonly kind: 'crates'; readonly count: number }
    | { readonly kind: 'cosmetic'; readonly id: string }
    | { readonly kind: 'none' };            // pozycje WKROTCE

export interface ShopItemDef {
    readonly sku: string;
    readonly category: ShopCategory;
    readonly price: number;
    readonly currency: ShopCurrency;
    readonly nameKey: TranslationKey;
    readonly descKey: TranslationKey;
    /**
     * Deklaracja wplywu na rozgrywke — POKAZYWANA NA KAZDYM PRODUKCIE.
     * Dzis wszystko mowi "0 wplywu na gre"; gdy dojdzie drzewko czesci, te kafle
     * powiedza "+3% obrazen". Roznica ma byc widoczna, nie domyslana (Czytelnosc).
     */
    readonly impactKey: TranslationKey;
    readonly grant: ShopGrant;
    readonly rarity: Rarity;
    /** Obrazek kafla wzgledem BASE_URL. Brak => emoji. */
    readonly art?: string;
    readonly emoji?: string;
    /** Klakson jest bezuzyteczny bez klawiatury => kafel ukryty na dotyku. */
    readonly desktopOnly?: boolean;
    /** WKROTCE: widoczny, nieklikalny, bez ceny. */
    readonly soon?: boolean;
}

/**
 * Cena wg rzadkosci — jeden cennik zamiast kilkunastu recznych liczb.
 * TUNING 2026-08-28 (decyzja Mariusza): wszystkie ceny w sklepie x2.
 */
const STICKER_PRICE: Record<Rarity, number> = { c: 600, r: 1000, e: 1600, l: 2400 };
const HORN_PRICE: Record<Rarity, number> = { c: 600, r: 1000, e: 1600, l: 2400 };
/**
 * SHOP-2 — celowniki, ~1.33x stawki naklejek i klaksonow. Powod roznicy: naklejka
 * zdobi profil, klakson dziala tylko na komputerze, a CELOWNIK WIDAC W AKCJI na obu
 * platformach przez caly mecz. Wycena naklejkowa bylaby zanizeniem najbardziej
 * pozadanej kategorii w sklepie.
 *
 * Przy przychodzie ~400-550 sigm/dobe: pierwszy celownik po ~2 dniach (i sa dwa takie,
 * wiec kategoria nie zaczyna sie od sciany), komplet 9800 sigm ~ 3 tygodnie gry.
 * Celowniki NIE zwracaja sigm, wiec nie tworza perpetuum mobile — twarda regula
 * z komentarza przy SHOP_ITEMS ich nie dotyczy.
 */
const CROSSHAIR_PRICE: Record<Rarity, number> = { c: 800, r: 1400, e: 2200, l: 3200 };

/**
 * Kafle naklejek i klaksonow prosto z rejestru kosmetyk. Nowa pozycja = jeden wiersz
 * w `COSMETICS` i tyle — sklep podlapie ja sam, bez dotykania tego pliku.
 */
function stickerSkus(): ShopItemDef[] {
    return cosmeticsByType('sticker').map(def => ({
        sku: def.id,
        category: 'stickers' as const,
        price: STICKER_PRICE[def.rarity],
        currency: 'sigma' as const,
        rarity: def.rarity,
        nameKey: def.labelKey,
        descKey: 'shop.item.sticker.desc' as TranslationKey,
        impactKey: 'shop.impact.none' as TranslationKey,
        grant: { kind: 'cosmetic' as const, id: def.id },
        emoji: def.emoji,
        art: def.asset,
    }));
}

function hornSkus(): ShopItemDef[] {
    return cosmeticsByType('horn').map(def => ({
        sku: def.id,
        category: 'horns' as const,
        price: HORN_PRICE[def.rarity],
        currency: 'sigma' as const,
        rarity: def.rarity,
        nameKey: def.labelKey,
        descKey: 'shop.item.horn.desc' as TranslationKey,
        impactKey: 'shop.impact.none' as TranslationKey,
        grant: { kind: 'cosmetic' as const, id: def.id },
        emoji: def.emoji ?? '📣',
        desktopOnly: true,
    }));
}

/**
 * SHOP-2. Kopia `hornSkus()` BEZ `desktopOnly` — celownik dziala tez na dotyku
 * (main.ts rysuje go przy kazdym celowaniu w skali 1.5), wiec plakietka „PC" byla
 * by klamstwem.
 *
 * Brak `emoji` i `art` jest ZAMIERZONY: kafel rysuje podglad na canvasie prawdziwa
 * funkcja z rejestru (ShopSection). Emoji-zastepnik przy szesciu wariantach
 * wygladalby identycznie dla kazdego z nich — czyli gracz nie widzialby, co kupuje.
 */
function crosshairSkus(): ShopItemDef[] {
    return cosmeticsByType('crosshair').map(def => ({
        sku: def.id,
        category: 'crosshairs' as const,
        price: CROSSHAIR_PRICE[def.rarity],
        currency: 'sigma' as const,
        rarity: def.rarity,
        nameKey: def.labelKey,
        descKey: 'shop.item.crosshair.desc' as TranslationKey,
        impactKey: 'shop.impact.none' as TranslationKey,
        grant: { kind: 'cosmetic' as const, id: def.id },
    }));
}

/**
 * CENY — po tuningu x2 z 2026-08-28. Realny przychod to ~400-550 sigm/dobe (mecze ~50
 * przy p90, rozkazy 135, skrzynka dzienna), wiec teraz skrzynka ~ 2 dni gry, a paczka
 * glosowa ~ 6 dni. UWAGA: obnizenie celow rozkazow (quests.ts, ten sam dzien) podnosi
 * dzienny przychod, wiec realne "ile dni" bedzie krotsze — do sprawdzenia playtestem.
 *
 * ⚠️ TWARDA REGULA: cena skrzynki MUSI przewyzszac jej zwrot w sigmach, inaczej
 * powstaje perpetuum mobile. EV = 66 sigm przy niepelnej kolekcji, 132 przy pelnej
 * (CRATE_BOLT_RANGE + CRATE_DUP_BOLTS w progression.ts). 800 daje duzy zapas.
 */
export const SHOP_ITEMS: readonly ShopItemDef[] = [
    // ── skrzynki (rabat rosnie z paczka) ────────────────────────────────────
    { sku: 'crate_1',  category: 'crates', price: 800,  currency: 'sigma', rarity: 'c',
      nameKey: 'shop.item.crate1.name',  descKey: 'shop.item.crate1.desc',
      impactKey: 'shop.impact.none', grant: { kind: 'crates', count: 1 },  emoji: '📦' },
    { sku: 'crate_3',  category: 'crates', price: 2160, currency: 'sigma', rarity: 'r',
      nameKey: 'shop.item.crate3.name',  descKey: 'shop.item.crate3.desc',
      impactKey: 'shop.impact.none', grant: { kind: 'crates', count: 3 },  emoji: '📦' },
    { sku: 'crate_10', category: 'crates', price: 6400, currency: 'sigma', rarity: 'e',
      nameKey: 'shop.item.crate10.name', descKey: 'shop.item.crate10.desc',
      impactKey: 'shop.impact.none', grant: { kind: 'crates', count: 10 }, emoji: '📦' },

    // ── celowniki (SHOP-2) ──────────────────────────────────────────────────
    // Zakladka stoi ZARAZ ZA skrzynkami, przed naklejkami: to najmocniejszy towar
    // w sklepie (jedyna kosmetyka widoczna w meczu), wiec ma byc widoczny od razu,
    // a nie po przewinieciu do trzeciej kategorii.
    ...crosshairSkus(),

    // ── stickery ────────────────────────────────────────────────────────────
    // Generowane z rejestru kosmetyk: 12 pozycji to bylo 12 niemal identycznych
    // blokow, w ktorych literowka w `id` jest niewidoczna dla oka (bramka
    // assertShopCatalog i tak by ja zlapala, ale lepiej nie dac jej powstac).
    // Nazwa SKU = nazwa kosmetyku ("Biceps"), bo zakladka juz mowi STICKERY —
    // prefiks "Sticker:" na kazdym kaflu tylko zjadalby miejsce.
    ...stickerSkus(),

    // ── klaksony (klawisz H) — desktopOnly, patrz komentarz przy polu ───────
    ...hornSkus(),

    // ── paczka glosowa ─────────────────────────────────────────────────────
    // WKROTCE, a nie na sprzedaz — SWIADOMA decyzja przy wlaczaniu SHOP_LIVE.
    // Pliki kwestii NIE ISTNIEJA; definicja w cosmetics.ts wskazuje tymczasowo na
    // `rank_fanfare.wav` i `yeti.mp3`. Sprzedawanie za 3000 sigm czegos, co odgrywa
    // ryk yeti, byloby klamstwem o zawartosci — a chip „0 wplywu na gre" na kazdym
    // produkcie ma znaczyc, ze opis produktu jest prawdziwy.
    //
    // PRZYWROCENIE po dostarczeniu 4 plikow (start/lowHp x pl/en):
    //   1. usun `soon: true`
    //   2. grant: { kind: 'cosmetic', id: 'vo_commander' }
    //   3. podmien sciezki w cosmetics.ts na 'voice/cmdr_{lang}_start.ogg' itd.
    { sku: 'vo_commander', category: 'voice', price: 3000, currency: 'sigma', rarity: 'e',
      nameKey: 'shop.item.vo_commander.name', descKey: 'shop.item.vo_commander.desc',
      impactKey: 'shop.impact.none', grant: { kind: 'none' }, soon: true,
      emoji: '🗣️' },

    // ── WKROTCE (placeholdery; art i systemy w osobnych fazach) ────────────
    { sku: 'soon_avatar', category: 'soon', price: 2400, currency: 'sigma', rarity: 'r',
      nameKey: 'shop.item.soon_avatar.name', descKey: 'shop.item.soon_avatar.desc',
      impactKey: 'shop.impact.none', grant: { kind: 'none' }, soon: true,
      art: 'profile/avatars/Ash_200.png' },
    { sku: 'soon_skin',   category: 'soon', price: 8000, currency: 'sigma', rarity: 'l',
      nameKey: 'shop.item.soon_skin.name',   descKey: 'shop.item.soon_skin.desc',
      impactKey: 'shop.impact.none', grant: { kind: 'none' }, soon: true,
      art: 'assets/tanks/king_hull.png' },
    { sku: 'soon_part',   category: 'soon', price: 0, currency: 'sigma', rarity: 'e',
      nameKey: 'shop.item.soon_part.name',   descKey: 'shop.item.soon_part.desc',
      impactKey: 'shop.impact.boost', grant: { kind: 'none' }, soon: true,
      art: 'assets/tanks/king_turret.png' },
];

/** Kolejnosc tabow + ich etykiety (literalne klucze — dynamiczny t(var) nie kompiluje). */
export const SHOP_TABS: readonly { readonly id: ShopCategory; readonly labelKey: TranslationKey }[] = [
    { id: 'crates',     labelKey: 'shop.tab.crates' },
    { id: 'crosshairs', labelKey: 'shop.tab.crosshairs' },
    { id: 'stickers', labelKey: 'shop.tab.stickers' },
    { id: 'horns',    labelKey: 'shop.tab.horns' },
    { id: 'voice',    labelKey: 'shop.tab.voice' },
    { id: 'soon',     labelKey: 'shop.tab.soon' },
];

const _BY_SKU: Record<string, ShopItemDef> = Object.fromEntries(SHOP_ITEMS.map(i => [i.sku, i]));

export function getShopItem(sku: string): ShopItemDef | undefined { return _BY_SKU[sku]; }

/**
 * Pozycje danej kategorii.
 *
 * v0.126.0 (decyzja Mariusza): towar `desktopOnly` jest widoczny i kupowalny TAKZE
 * na dotyku — wczesniej byl tam ukryty. Warunek jest jeden i twardy: kafel MUSI
 * wtedy niesc informacje, ze dziala tylko na komputerze (badge na kaflu + zdanie
 * w modalu). Ukrywanie chronilo przed kupnem martwego towaru, ale odbieralo tez
 * mozliwosc zobaczenia calej kategorii — informacja robi to samo bez chowania.
 */
export function shopItemsOf(category: ShopCategory): ShopItemDef[] {
    return SHOP_ITEMS.filter(i => i.category === category);
}

/**
 * Walidacja katalogu na starcie — wzorzec assertSeasonContent (SEASON KIT).
 * Lepiej glosny blad w konsoli niz cichy sklep z martwym kaflem, ktory znajdzie gracz.
 * Nie rzuca — sklep ma sie nie wywalic przez literowke w jednym SKU.
 */
export function assertShopCatalog(): boolean {
    const errors: string[] = [];
    const seen = new Set<string>();

    for (const item of SHOP_ITEMS) {
        if (seen.has(item.sku)) errors.push(`zduplikowane SKU: ${item.sku}`);
        seen.add(item.sku);

        if (item.soon) {
            if (item.grant.kind !== 'none') errors.push(`${item.sku}: WKROTCE nie moze nic dawac`);
        } else {
            if (item.price <= 0) errors.push(`${item.sku}: cena musi byc dodatnia`);
            if (item.grant.kind === 'none') errors.push(`${item.sku}: kupowalny SKU bez nagrody`);
        }

        if (item.grant.kind === 'cosmetic' && !getCosmetic(item.grant.id)) {
            errors.push(`${item.sku}: wskazuje na nieistniejacy kosmetyk "${item.grant.id}"`);
        }
        if (item.grant.kind === 'crates' && item.grant.count <= 0) {
            errors.push(`${item.sku}: liczba skrzynek musi byc dodatnia`);
        }
        if (!SHOP_TABS.some(t => t.id === item.category)) {
            errors.push(`${item.sku}: kategoria "${item.category}" nie ma zakladki`);
        }
    }

    if (errors.length) {
        console.error('[shop] KATALOG NIEPOPRAWNY:\n  - ' + errors.join('\n  - '));
        return false;
    }
    return true;
}
