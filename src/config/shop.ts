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
import { getCosmetic, cosmeticsByType, TANK_SKIN_CAT_ORDER, type Rarity } from './cosmetics';
import { isSkinsEnabled } from './skins'; // SKIN-1 — gate taba i SKU barw czolgu

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

/**
 * Sekcja SKLEP w nawigacji: zawsze przy SHOP_LIVE, inaczej tylko za flaga.
 * v0.198.1: `?shop=0` wylacza mimo SHOP_LIVE — wzorzec `?castle=0`/`?skins=0`, zeby wycofanie
 * nie wymagalo redeployu (przed ta zmiana flaga ON nie miala zadnej sciezki wyjscia).
 */
export function isShopEnabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('shop');
        if (q === '0') return false;
        if (SHOP_LIVE) return true;
        return q === '1';
    } catch { return SHOP_LIVE; }
}

/** Piaskownica aktywna zawsze, gdy sklep dziala spoza produkcji. */
export function isShopSandbox(): boolean {
    return !SHOP_LIVE;
}

// v0.147.0: +'profileSkins' (baner hero), +'avatars' (12 slotow placeholder).
// -'voice': paczka glosowa zdjeta ze sklepu do czasu dostarczenia plikow kwestii.
// SKIN-1 (v0.159.0): +'tankSkins' — barwy czolgu (jedyna kosmetyka na SAMYM
// czolgu w meczu). Tab i SKU wchodza tylko przy isSkinsEnabled().
export type ShopCategory = 'crates' | 'tankSkins' | 'crosshairs' | 'profileSkins' | 'stickers' | 'avatars' | 'horns' | 'soon';

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
 * v0.147.0 — SKINY PROFILU, ~1.5x stawki naklejek.
 *
 * Dlaczego miedzy naklejka a celownikiem: skin zajmuje CALY pas hero, wiec jest
 * najbardziej widoczna rzecza w profilu — ale widac go wylacznie w hubie, a nie w meczu.
 * Wycena celownikowa bylaby wiec zawyzeniem, a naklejkowa zanizeniem.
 *
 * Przy przychodzie ~400-550 sigm/dobe: pierwszy skin po ~2 dniach, komplet osmiu
 * (16 800 sigm) ~ 4-5 tygodni gry. Skiny NIE zwracaja sigm, wiec nie tworza petli.
 */
const PROFILE_SKIN_PRICE: Record<Rarity, number> = { c: 900, r: 1500, e: 2400, l: 3600 };

/**
 * SKIN-1 — BARWY CZOLGU, ~1.3x stawki celownikow: skin widac NA CZOLGU przez
 * caly mecz (najmocniejsza kosmetyka w sklepie), ale w odroznieniu od reszty
 * kategorii dropi TEZ ze skrzynek (decyzja Mariusza: dwie drogi) — sklep jest
 * skrotem, nie jedynym zrodlem, wiec cena nie moze odjechac wyzej.
 * Pierwszy common po ~2 dniach (400-550 sigm/dobe), komplet 8 (17 200) ~4-5 tyg.
 * Skiny NIE zwracaja sigm — twarda regula bez zmian.
 */
const TANK_SKIN_PRICE: Record<Rarity, number> = { c: 1000, r: 1800, e: 2800, l: 4200 };

/**
 * SKIN-2 — WZORY premium, wyzej niz palety na kazdym progu (wzor to art, paleta
 * to kolor). Legendarny animowany (Zywa Lawa/Galaktyka) = 6000 — wyrazny cel
 * dlugoterminowy (~11-14 dni przychodu), wciaz krotszy niz komplet skrzynek.
 */
const TANK_PATTERN_PRICE: Record<Rarity, number> = { c: 1500, r: 2600, e: 4000, l: 6000 };


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

/**
 * v0.147.0 — kafle skinow prosto z rejestru, wzorzec 1:1 ze `stickerSkus`.
 * Dolozenie brakujacych czterech skinow = jeden wiersz w cosmetics.ts, zero pracy tutaj.
 * `art` celowo wskazuje na `bgImage`: kafel MA pokazywac sam baner, a nie ikone obok niego.
 */
/**
 * SKIN-1 — kafle barw czolgu z rejestru (wzorzec profileSkinSkus). Bez `art`:
 * kafel rysuje probke koloru przez tankSkinSwatchStyle (ShopSection ma galaz
 * na typ, jak celowniki z zywym canvasem) — probka z prawdziwego zrodla.
 */
function tankSkinSkus(): ShopItemDef[] {
    // SKIN-2: sortowanie po kategorii (sekcje w gridzie zakladki), wzory drozsze.
    const defs = [...cosmeticsByType('tankSkin')].sort((a, b) =>
        TANK_SKIN_CAT_ORDER.indexOf(a.patternCat) - TANK_SKIN_CAT_ORDER.indexOf(b.patternCat));
    return defs.map(def => ({
        sku: def.id,
        category: 'tankSkins' as const,
        price: def.pattern ? TANK_PATTERN_PRICE[def.rarity] : TANK_SKIN_PRICE[def.rarity],
        currency: 'sigma' as const,
        rarity: def.rarity,
        nameKey: def.labelKey,
        descKey: (def.pattern ? 'shop.item.tankPattern.desc' : 'shop.item.tankSkin.desc') as TranslationKey,
        impactKey: 'shop.impact.none' as TranslationKey,
        grant: { kind: 'cosmetic' as const, id: def.id },
        emoji: '🎨',
    }));
}

function profileSkinSkus(): ShopItemDef[] {
    return cosmeticsByType('profileSkin').map(def => ({
        sku: def.id,
        category: 'profileSkins' as const,
        price: PROFILE_SKIN_PRICE[def.rarity],
        currency: 'sigma' as const,
        rarity: def.rarity,
        nameKey: def.labelKey,
        descKey: 'shop.item.profileSkin.desc' as TranslationKey,
        impactKey: 'shop.impact.none' as TranslationKey,
        grant: { kind: 'cosmetic' as const, id: def.id },
        emoji: '🖼️',
        art: def.bgImage,
    }));
}

/**
 * v0.147.0 — dwanascie zablokowanych slotow awatarow (prosba Mariusza).
 * Swiadomie NIE sa kosmetykami: brak wpisu w COSMETICS znaczy, ze nie licza sie do
 * kolekcji („STYL x/y") i nie wchodza do zadnej puli, dopoki nie ma za nimi realnego artu.
 * Wszystkie niosa ten sam `nameKey` — „Awatar ?" na dwunastu kaflach czyta sie jak
 * zagadka, a dwanascie roznych nazw obiecywaloby tresc, ktorej jeszcze nie ma.
 */
function avatarSlotSkus(): ShopItemDef[] {
    return Array.from({ length: 12 }, (_, i) => ({
        sku: `soon_av_${String(i + 1).padStart(2, '0')}`,
        category: 'avatars' as const,
        price: 0,
        currency: 'sigma' as const,
        rarity: (i < 6 ? 'c' : i < 10 ? 'r' : 'e') as Rarity,
        nameKey: 'shop.item.avatarSlot.name' as TranslationKey,
        descKey: 'shop.item.avatarSlot.desc' as TranslationKey,
        impactKey: 'shop.impact.none' as TranslationKey,
        grant: { kind: 'none' as const },
        soon: true,
        emoji: '🕵️',
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

    // ── barwy czolgu (SKIN-1) — tylko przy fladze ?skins=1 ──────────────────
    // Zakladka stoi ZARAZ ZA skrzynkami: to od SKIN-1 najmocniejszy towar
    // (jedyna kosmetyka na samym czolgu w meczu). SHOP_ITEMS buduje sie przy
    // imporcie modulu — URL jest staly w sesji, wiec jednorazowy odczyt flagi
    // wystarcza (ten sam kompromis co caly katalog).
    ...(isSkinsEnabled() ? tankSkinSkus() : []),

    // ── celowniki (SHOP-2) ──────────────────────────────────────────────────
    // Do SKIN-1 najmocniejszy towar w sklepie — nadal wysoko, zaraz za barwami.
    ...crosshairSkus(),

    // ── skiny profilu (v0.147.0) ────────────────────────────────────────────
    // Zakladka stoi ZARAZ ZA celownikami: to druga co do ceny kategoria i jedyna,
    // ktora zmienia caly wyglad strony profilu, wiec ma byc widoczna bez szukania.
    // v0.148.0: komplet 12 skinow dostarczony, wiec kafle WKROTCE z tej kategorii
    // zniknely — sklep pokazuje wylacznie towar, ktory naprawde istnieje.
    ...profileSkinSkus(),

    // ── stickery ────────────────────────────────────────────────────────────
    // Generowane z rejestru kosmetyk: 12 pozycji to bylo 12 niemal identycznych
    // blokow, w ktorych literowka w `id` jest niewidoczna dla oka (bramka
    // assertShopCatalog i tak by ja zlapala, ale lepiej nie dac jej powstac).
    // Nazwa SKU = nazwa kosmetyku ("Biceps"), bo zakladka juz mowi STICKERY —
    // prefiks "Sticker:" na kazdym kaflu tylko zjadalby miejsce.
    ...stickerSkus(),

    // ── awatary (v0.147.0) — 12 zablokowanych slotow, patrz avatarSlotSkus ──
    ...avatarSlotSkus(),

    // ── klaksony (klawisz H) — desktopOnly, patrz komentarz przy polu ───────
    ...hornSkus(),

    // ── paczka glosowa — ZDJETA ZE SKLEPU (v0.147.0, decyzja Mariusza) ──────
    // Wraca razem z czterema plikami kwestii (start/lowHp x pl/en). Do tego czasu
    // kafel „WKROTCE" za 3000 sigm tylko zajmowal zakladke obietnica bez terminu.
    //
    // WYCIETE JEST TYLKO TO: definicja `vo_commander` w cosmetics.ts, `playVoiceLine()`
    // w main.ts i grupa w Kolekcji ZOSTAJA nietkniete, wiec powrot to przywrocenie
    // tego bloku i wpisu w SHOP_TABS. Nikt nie mogl tego posiadac (pozycja byla `soon`,
    // czyli `purchase()` zawsze ja odbijal), wiec nie ma czego migrowac.

    // ── WKROTCE (placeholdery; art i systemy w osobnych fazach) ────────────
    // v0.147.0: `soon_avatar` przeniesiony do wlasnej zakladki AWATARY jako 12 slotow.
    // SKIN-1: `soon_skin` USUNIETY — obietnica zrealizowana (zakladka BARWY CZOLGU);
    // obietnica i realizacja nie moga wspolistniec w jednym buildzie.
    { sku: 'soon_part',   category: 'soon', price: 0, currency: 'sigma', rarity: 'e',
      nameKey: 'shop.item.soon_part.name',   descKey: 'shop.item.soon_part.desc',
      impactKey: 'shop.impact.boost', grant: { kind: 'none' }, soon: true,
      art: 'assets/tanks/king_turret.png' },
];

/** Kolejnosc tabow + ich etykiety (literalne klucze — dynamiczny t(var) nie kompiluje). */
export const SHOP_TABS: readonly { readonly id: ShopCategory; readonly labelKey: TranslationKey }[] = [
    { id: 'crates',       labelKey: 'shop.tab.crates' },
    // SKIN-1: tab tylko przy fladze (pusta zakladka bez SKU mylilaby graczy)
    ...(isSkinsEnabled()
        ? [{ id: 'tankSkins' as const, labelKey: 'shop.tab.tankSkins' as TranslationKey }]
        : []),
    { id: 'crosshairs',   labelKey: 'shop.tab.crosshairs' },
    { id: 'profileSkins', labelKey: 'shop.tab.profileSkins' },
    { id: 'stickers',     labelKey: 'shop.tab.stickers' },
    { id: 'avatars',      labelKey: 'shop.tab.avatars' },
    { id: 'horns',        labelKey: 'shop.tab.horns' },
    { id: 'soon',         labelKey: 'shop.tab.soon' },
];

/**
 * v0.147.0 — kategorie rysowane siatka SZEROKA (2 kafle w rzedzie zamiast auto-fill).
 * Baner skinu ma proporcje 1024:167; w kwadratowym kaflu 168 px zostalby z niego
 * pasek 27 px, czyli nierozpoznawalna kreska.
 */
export const WIDE_GRID_CATEGORIES: ReadonlySet<ShopCategory> =
    new Set<ShopCategory>(['profileSkins']);

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
