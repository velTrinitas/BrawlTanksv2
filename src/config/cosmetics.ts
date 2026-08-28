/**
 * cosmetics.ts — rejestr kosmetykow profilowych (F2a).
 *
 * Design: BT_Progression_System_Design_v1.md §4/§7. ZASADA: skrzynki dropia
 * KOSMETYKE (flex), NIGDY moc/staty (moce -> Szlak §18, staty nietykalne §7).
 * F2a = kosmetyki PROFILOWE czysto CSS/DOM (kolory nicku / ramki avatara / tytuly)
 * aplikowane w readoucie hubu — ZERO dotykania silnika gry / bakera. Flagi + skiny
 * czolgu (dotykaja FlagId/bakera) = pozniejsza pula.
 *
 * i18n: labelKey literal (nie dynamiczny t(var)); tytuly wyswietlaja t(labelKey).
 */

import type { TranslationKey } from '../i18n/i18n';

export type CosmeticType = 'nickColor' | 'frame' | 'title' | 'sticker' | 'horn' | 'voice';
export type Rarity = 'c' | 'r' | 'e' | 'l';

/**
 * SHOP-1: typy, ktore NIE wypadaja ze skrzynek — towar wylacznie sklepowy.
 * Zasada podzialu: skrzynki daja kosmetyke profilowa, sklep sprzedaje kategorie,
 * ktorych skrzynki nie daja. Zero kanibalizacji, zero rotacji dobowej.
 * 'title' bylo tu juz wczesniej (kolizja z Rangami Zalog, v0.118.0) — ODWRACALNE.
 */
export const SHOP_ONLY_TYPES: ReadonlySet<CosmeticType> =
    new Set<CosmeticType>(['title', 'sticker', 'horn', 'voice']);

export interface CosmeticDef {
    readonly id: string;
    readonly type: CosmeticType;
    readonly rarity: Rarity;
    readonly labelKey: TranslationKey;      // etykieta w GARAZU; dla 'title' = tekst tytulu (literal t())
    /** nickColor: kolor/gradient tekstu nicku. */
    readonly color?: string;
    /** nickColor: traktuj `color` jako gradient (background-clip:text). */
    readonly gradient?: boolean;
    /** nickColor: animowany shimmer (klasa CSS bt-cos-shimmer). */
    readonly animated?: boolean;
    /** frame: border shorthand ringu avatara. */
    readonly border?: string;
    /** frame: box-shadow glow. */
    readonly glow?: string;
    /** sticker: sciezka obrazka wzgledem BASE_URL (kulka na profilu + kafel sklepu). */
    readonly asset?: string;
    /**
     * sticker: emoji zamiast pliku. Zero assetow, zero wagi bundla, dziala od razu
     * w obu jezykach — dla naklejek to lepszy material niz PNG, bo caly zestaw da sie
     * rozszerzyc jednym wierszem. Renderowane gdy brak `asset`.
     */
    readonly emoji?: string;
    /** horn: nazwa pliku w public/sfx/ (ladowany LENIWIE, patrz AudioSys.registerOwnedSound). */
    readonly sound?: string;
    /**
     * voice: pliki kwestii, `{lang}` podmieniane na aktywny jezyk ('pl' | 'en').
     * Dwie kwestie na paczke: start meczu + spadek ponizej 50% HP.
     */
    readonly voice?: { readonly start: string; readonly lowHp: string };
}

/** Kolor rzadkosci (obwodki reveal / kropki w gridzie). */
export const RARITY_COLOR: Record<Rarity, string> = {
    c: '#8ba3b6', r: '#3aa0e0', e: '#9b59b6', l: '#f1c40f',
};
export const RARITY_LABEL_KEY: Record<Rarity, TranslationKey> = {
    c: 'crate.rarity.c', r: 'crate.rarity.r', e: 'crate.rarity.e', l: 'crate.rarity.l',
};

// ── Rejestr (F2a: ~14 kosmetykow profilowych CSS) ────────────────────────────
export const COSMETICS: readonly CosmeticDef[] = [
    // kolory nicku
    { id: 'nc_silver',  type: 'nickColor', rarity: 'c', labelKey: 'cosmetic.nc_silver',  color: '#c8cfda' },
    { id: 'nc_gold',    type: 'nickColor', rarity: 'r', labelKey: 'cosmetic.nc_gold',    color: '#f1c40f' },
    { id: 'nc_lime',    type: 'nickColor', rarity: 'r', labelKey: 'cosmetic.nc_lime',    color: '#a3e635' },
    { id: 'nc_fire',    type: 'nickColor', rarity: 'e', labelKey: 'cosmetic.nc_fire',    color: 'linear-gradient(90deg,#ff6b35,#f7c948)', gradient: true },
    { id: 'nc_ocean',   type: 'nickColor', rarity: 'e', labelKey: 'cosmetic.nc_ocean',   color: 'linear-gradient(90deg,#37a0e0,#7ef0a8)', gradient: true },
    { id: 'nc_shimmer', type: 'nickColor', rarity: 'l', labelKey: 'cosmetic.nc_shimmer', color: 'linear-gradient(90deg,#ffe066,#f1c40f,#fff6c2,#f1c40f)', gradient: true, animated: true },
    // ramki avatara
    { id: 'fr_steel',   type: 'frame', rarity: 'c', labelKey: 'cosmetic.fr_steel',  border: '2px solid #64748b' },
    { id: 'fr_blue',    type: 'frame', rarity: 'r', labelKey: 'cosmetic.fr_blue',   border: '2px solid #3aa0e0' },
    { id: 'fr_purple',  type: 'frame', rarity: 'e', labelKey: 'cosmetic.fr_purple', border: '2px solid #9b59b6', glow: '0 0 10px rgba(155,89,182,0.7)' },
    { id: 'fr_gold',    type: 'frame', rarity: 'l', labelKey: 'cosmetic.fr_gold',   border: '2px solid #f1c40f', glow: '0 0 12px rgba(241,196,15,0.8)' },
    // tytuly (tekst = t(labelKey))
    { id: 'ti_recruit', type: 'title', rarity: 'r', labelKey: 'cosmetic.ti_recruit' },
    { id: 'ti_gunner',  type: 'title', rarity: 'r', labelKey: 'cosmetic.ti_gunner' },
    { id: 'ti_ace',     type: 'title', rarity: 'e', labelKey: 'cosmetic.ti_ace' },
    { id: 'ti_legend',  type: 'title', rarity: 'l', labelKey: 'cosmetic.ti_legend' },

    // ── F2c (v0.110.0): +18 pozycji => pula 32. Nacisk na c/r (wagi c60/r28 —
    //    2 commony z F2a robily dublet-city od pierwszych skrzynek). Nowe id
    //    dolaczaja do puli bez migracji (owned=union, losowanie po rarity). ──
    // kolory nicku (+7)
    { id: 'nc_mint',    type: 'nickColor', rarity: 'c', labelKey: 'cosmetic.nc_mint',    color: '#7ef0c8' },
    { id: 'nc_rose',    type: 'nickColor', rarity: 'c', labelKey: 'cosmetic.nc_rose',    color: '#ff8fa3' },
    { id: 'nc_sky',     type: 'nickColor', rarity: 'c', labelKey: 'cosmetic.nc_sky',     color: '#7ec8f7' },
    { id: 'nc_crimson', type: 'nickColor', rarity: 'r', labelKey: 'cosmetic.nc_crimson', color: '#e74c3c' },
    { id: 'nc_violet',  type: 'nickColor', rarity: 'r', labelKey: 'cosmetic.nc_violet',  color: '#b07ef7' },
    { id: 'nc_toxic',   type: 'nickColor', rarity: 'e', labelKey: 'cosmetic.nc_toxic',   color: 'linear-gradient(90deg,#a3e635,#2edcb0)', gradient: true },
    { id: 'nc_rainbow', type: 'nickColor', rarity: 'l', labelKey: 'cosmetic.nc_rainbow', color: 'linear-gradient(90deg,#ff6b6b,#f7c948,#7ef0a8,#37a0e0,#b07ef7)', gradient: true, animated: true },
    // ramki avatara (+5)
    { id: 'fr_bronze',  type: 'frame', rarity: 'c', labelKey: 'cosmetic.fr_bronze', border: '2px solid #cd7f32' },
    { id: 'fr_forest',  type: 'frame', rarity: 'c', labelKey: 'cosmetic.fr_forest', border: '2px solid #2ecc71' },
    { id: 'fr_red',     type: 'frame', rarity: 'r', labelKey: 'cosmetic.fr_red',    border: '2px solid #e74c3c' },
    { id: 'fr_teal',    type: 'frame', rarity: 'e', labelKey: 'cosmetic.fr_teal',   border: '2px solid #4dd7c8', glow: '0 0 10px rgba(77,215,200,0.7)' },
    { id: 'fr_neon',    type: 'frame', rarity: 'l', labelKey: 'cosmetic.fr_neon',   border: '2px solid #fff6c2', glow: '0 0 14px rgba(255,246,194,0.9), 0 0 6px rgba(241,196,15,0.8)' },
    // tytuly (+6; commony NOWOSC — tytul tez moze byc czesty)
    { id: 'ti_driver',   type: 'title', rarity: 'c', labelKey: 'cosmetic.ti_driver' },
    { id: 'ti_scout',    type: 'title', rarity: 'c', labelKey: 'cosmetic.ti_scout' },
    { id: 'ti_sapper',   type: 'title', rarity: 'r', labelKey: 'cosmetic.ti_sapper' },
    { id: 'ti_builder',  type: 'title', rarity: 'r', labelKey: 'cosmetic.ti_builder' },
    { id: 'ti_bossbane', type: 'title', rarity: 'e', labelKey: 'cosmetic.ti_bossbane' },
    { id: 'ti_immortal', type: 'title', rarity: 'l', labelKey: 'cosmetic.ti_immortal' },

    // ── SHOP-1 (v0.124.0): towar WYLACZNIE sklepowy (SHOP_ONLY_TYPES). ──────────
    // ⚠️ ASSETY TYMCZASOWE — wskazuja na pliki, ktore juz sa w repo, zeby mechanika
    //    byla testowalna przed dostarczeniem artu. Podmiana = jeden string na pozycje.
    //    Docelowe wymiary i formaty: docs/shop-kit/SHOP_ASSETS.md
    // stickery — kulka na portrecie profilu. Zestaw wg wyboru Mariusza (28.08):
    // dwie grupy tematyczne, SILA/CIALO i MILITARIA. Emoji, nie pliki — zestaw
    // rozszerza sie jednym wierszem i nie wazy nic w bundlu.
    { id: 'st_biceps',  type: 'sticker', rarity: 'c', labelKey: 'cosmetic.st_biceps',  emoji: '💪' },
    { id: 'st_fist',    type: 'sticker', rarity: 'c', labelKey: 'cosmetic.st_fist',    emoji: '✊' },
    { id: 'st_punch',   type: 'sticker', rarity: 'r', labelKey: 'cosmetic.st_punch',   emoji: '👊' },
    { id: 'st_glove',   type: 'sticker', rarity: 'r', labelKey: 'cosmetic.st_glove',   emoji: '🥊' },
    { id: 'st_arm',     type: 'sticker', rarity: 'e', labelKey: 'cosmetic.st_arm',     emoji: '🦾' },
    { id: 'st_leg',     type: 'sticker', rarity: 'e', labelKey: 'cosmetic.st_leg',     emoji: '🦿' },
    { id: 'st_helmet',  type: 'sticker', rarity: 'c', labelKey: 'cosmetic.st_helmet',  emoji: '🪖' },
    { id: 'st_shield',  type: 'sticker', rarity: 'r', labelKey: 'cosmetic.st_shield',  emoji: '🛡️' },
    { id: 'st_swords',  type: 'sticker', rarity: 'r', labelKey: 'cosmetic.st_swords',  emoji: '⚔️' },
    { id: 'st_target',  type: 'sticker', rarity: 'e', labelKey: 'cosmetic.st_target',  emoji: '🎯' },
    { id: 'st_medal',   type: 'sticker', rarity: 'l', labelKey: 'cosmetic.st_medal',   emoji: '🎖️' },
    { id: 'st_bolt',    type: 'sticker', rarity: 'l', labelKey: 'cosmetic.st_bolt',    emoji: '🔩' },
    // klaksony — klawisz H (desktop; kafle ukryte na dotyku, patrz shop.ts desktopOnly).
    // Pliki Mariusza z public/sfx/honks/. Ladowane LENIWIE (AudioSys.ownedSounds), wiec
    // gracz sciaga tylko to, co kupil — te szesc nie jest w SOUND_LIST.
    { id: 'hn_1', type: 'horn', rarity: 'c', labelKey: 'cosmetic.hn_1', sound: 'honks/honk1.mp3', emoji: '📣' },
    { id: 'hn_2', type: 'horn', rarity: 'c', labelKey: 'cosmetic.hn_2', sound: 'honks/honk2.mp3', emoji: '📣' },
    { id: 'hn_3', type: 'horn', rarity: 'r', labelKey: 'cosmetic.hn_3', sound: 'honks/honk3.mp3', emoji: '📢' },
    { id: 'hn_4', type: 'horn', rarity: 'r', labelKey: 'cosmetic.hn_4', sound: 'honks/honk4.mp3', emoji: '📢' },
    { id: 'hn_5', type: 'horn', rarity: 'e', labelKey: 'cosmetic.hn_5', sound: 'honks/honk5.mp3', emoji: '🔊' },
    { id: 'hn_6', type: 'horn', rarity: 'l', labelKey: 'cosmetic.hn_6', sound: 'honks/honk6.mp3', emoji: '🎺' },
    // paczka glosowa — jedna, PL+EN (decyzja Mariusza: caly system na jednej paczce).
    // Docelowo 'voice/cmdr_{lang}_start.ogg' — AudioSys podmienia {lang} na aktywny jezyk.
    { id: 'vo_commander', type: 'voice', rarity: 'e', labelKey: 'cosmetic.vo_commander',
      voice: { start: 'rank_fanfare.wav', lowHp: 'yeti.mp3' } },
];

const _BY_ID: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map(c => [c.id, c]));

export function getCosmetic(id: string): CosmeticDef | undefined { return _BY_ID[id]; }

export function cosmeticsByType(type: CosmeticType): CosmeticDef[] {
    return COSMETICS.filter(c => c.type === type);
}

/**
 * Ids kosmetykow danej rzadkosci (do losowania w skrzynce).
 * PROFILE-1 (v0.118.0): TYTULY WYCIETE z puli losowania (kolidowaly z planowanymi
 * Rangami Zalog — docs/crew-ranks-v1.md). Defy ti_* ZOSTAJA w rejestrze (mergeCosmetics
 * waliduje id po rejestrze — juz posiadane tytuly przezywaja sync bez szkody).
 * SHOP-1 (v0.124.0): filtr uogolniony na SHOP_ONLY_TYPES — stickery/klaksony/glosy
 * kupuje sie w sklepie i NIE moga wypasc ze skrzynki (inaczej sklep kanibalizuje sam
 * siebie i gracz placi za cos, co i tak dostanie za darmo).
 * ODWRACALNE: usun typ z SHOP_ONLY_TYPES, wraca do dropu.
 * Pule po filtrze: c=7 / r=6 / e=5 / l=4 — zadna pusta; wyczerpana pula i tak
 * konwertuje na srubki (CRATE_DUP_BOLTS), pity 10/30 dziala bez zmian.
 */
export function cosmeticIdsOfRarity(rarity: Rarity): string[] {
    return COSMETICS.filter(c => c.rarity === rarity && !SHOP_ONLY_TYPES.has(c.type)).map(c => c.id);
}

/**
 * SHOP-1: plik kwestii glosowej dla aktywnego jezyka. `{lang}` w definicji jest
 * podmieniane na 'pl'/'en', wiec docelowa paczka to cztery pliki i ZERO kodu.
 * Placeholdery bez `{lang}` przechodza bez zmian (ten sam plik w obu jezykach).
 */
export function voiceFile(
    def: CosmeticDef | undefined,
    line: 'start' | 'lowHp',
    lang: string,
): string | undefined {
    if (!def || def.type !== 'voice' || !def.voice) return undefined;
    return def.voice[line].replace('{lang}', lang === 'pl' ? 'pl' : 'en');
}

/** Inline-style dla nicku wg equipped nickColor (helper dla readout + preview). */
export function nickColorStyle(def: CosmeticDef | undefined): string {
    if (!def || def.type !== 'nickColor' || !def.color) return '';
    if (def.gradient) {
        return `background:${def.color};-webkit-background-clip:text;background-clip:text;color:transparent;`;
    }
    return `color:${def.color};`;
}

/** Inline-style dla ramki avatara wg equipped frame. */
export function frameStyle(def: CosmeticDef | undefined): string {
    if (!def || def.type !== 'frame') return '';
    const b = def.border ? `border:${def.border};` : '';
    const g = def.glow ? `box-shadow:${def.glow},inset 0 0 0 2px rgba(255,255,255,0.15);` : '';
    return b + g;
}
