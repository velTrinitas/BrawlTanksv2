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
import { isSkinsEnabled } from './skins'; // SKIN-1 — gating puli skrzynek (location w try/catch)

// v0.144.0: 'avatarBg' — TLO POD ZDJECIEM czolgisty (prosba z playtestu). Awatary to
// PNG RGBA z ~45% pikseli w pelni przezroczystych i ~34% miekkich krawedzi (zmierzone
// na Ash_200/Jack_200), wiec warstwa pod nimi jest realnie widoczna.
// v0.147.0: 'profileSkin' — BANER pod calym paskiem hero na stronie PROFIL (1024x167).
// To pierwszy kosmetyk oparty na PLIKU, a nie na CSS: kamuflazu ani zywiolu nie da sie
// zapisac gradientem, a proba skonczylaby sie karykatura moro w trzech kolorach.
// SKIN-1 (v0.159.0): 'tankSkin' — BARWY CZOLGU. Pierwszy kosmetyk przecinajacy
// granice "zero silnika": recolor przez render2d.derive(hex) wpieczony w bake
// (TankSpriteBaker) + zywy spread na obrotnicach Garazu. GLOBALNY (1 slot barwi
// aktualny czolg). Def niesie tylko gole stringi (hex/filter3d) — ten plik dalej
// NIE importuje render2d ani import.meta.env.
export type CosmeticType = 'nickColor' | 'frame' | 'title' | 'sticker' | 'horn' | 'voice' | 'crosshair' | 'avatarBg' | 'profileSkin' | 'tankSkin';
export type Rarity = 'c' | 'r' | 'e' | 'l';

/**
 * SHOP-1: typy, ktore NIE wypadaja ze skrzynek — towar wylacznie sklepowy.
 * Zasada podzialu: skrzynki daja kosmetyke profilowa, sklep sprzedaje kategorie,
 * ktorych skrzynki nie daja. Zero kanibalizacji, zero rotacji dobowej.
 * 'title' bylo tu juz wczesniej (kolizja z Rangami Zalog, v0.118.0) — ODWRACALNE.
 */
export const SHOP_ONLY_TYPES: ReadonlySet<CosmeticType> =
    // v0.147.0: 'profileSkin' MUSI tu byc. Ten zbior jest jedynym filtrem puli skrzynek
    // (patrz cosmeticIdsOfRarity) — bez wpisu skiny wypadalyby ze skrzynek i jednoczesnie
    // stalyby na sprzedaz, czyli sklep kanibalizowalby sam siebie, a pula losowania
    // rozjechalaby sie o 8 pozycji.
    // SKIN-1: 'tankSkin' ŚWIADOMIE POZA tym zbiorem (decyzja Mariusza: drop ze
    // skrzynek + sklep ROWNOLEGLE). Kanibalizacja jest tu mechanicznie bezpieczna:
    // kupiony skin => skrzynkowy duplikat konwertuje na srubki (CRATE_DUP_BOLTS),
    // a sklepowy kafel posiadanego pokazuje "posiadane" (ShopSection).
    new Set<CosmeticType>(['title', 'sticker', 'horn', 'voice', 'crosshair', 'profileSkin']);

export interface CosmeticDef {
    readonly id: string;
    readonly type: CosmeticType;
    readonly rarity: Rarity;
    readonly labelKey: TranslationKey;      // etykieta w GARAZU; dla 'title' = tekst tytulu (literal t())
    /** nickColor: kolor/gradient tekstu nicku. */
    readonly color?: string;
    /** nickColor: traktuj `color` jako gradient (background-clip:text). */
    readonly gradient?: boolean;
    /**
     * nickColor: animowany shimmer (klasa CSS bt-cos-shimmer).
     * tankSkin (SKIN-2): wzor ANIMOWANY — pelna animacja na obrotnicy w Garazu
     * (_skinPhase) + tani puls ADD w meczu (pulseTint). Trzy istniejace
     * call-site'y shimmer sa gated na nickColor — bezpieczne wspoldzielenie.
     */
    readonly animated?: boolean;
    /** frame: border shorthand ringu avatara. */
    readonly border?: string;
    /** frame: box-shadow glow. */
    readonly glow?: string;
    /**
     * avatarBg (v0.144.0): skrot CSS `background` pod awatarem. Gradient/wzor, zero
     * assetow — ta sama zasada co przy ramkach, tylko warstwa nizej.
     */
    readonly bg?: string;
    /** sticker: sciezka obrazka wzgledem BASE_URL (kulka na profilu + kafel sklepu). */
    readonly asset?: string;
    /**
     * profileSkin (v0.147.0): sciezka baneru wzgledem BASE_URL. Osobne pole od `asset`,
     * bo `asset` jest artem KAFLA w sklepie, a to jest tresc samego kosmetyku — te dwie
     * rzeczy tylko przypadkiem sa dzis tym samym plikiem.
     */
    readonly bgImage?: string;
    /**
     * sticker: emoji zamiast pliku. Zero assetow, zero wagi bundla, dziala od razu
     * w obu jezykach — dla naklejek to lepszy material niz PNG, bo caly zestaw da sie
     * rozszerzyc jednym wierszem. Renderowane gdy brak `asset`.
     */
    readonly emoji?: string;
    /** horn: nazwa pliku w public/sfx/ (ladowany LENIWIE, patrz AudioSys.registerOwnedSound). */
    readonly sound?: string;
    /**
     * tankSkin (SKIN-1): kolor bazowy palety. Konsument (baker/obrotnica) liczy
     * z niego pelna palete przez render2d.derive(hex) — tu tylko goly string.
     */
    readonly hex?: string;
    /**
     * tankSkin (SKIN-1): filtr Canvas2D (`ctx.filter`) dla obrotnicy 3/4 z ATLASU
     * klatek (KING) — atlas nie przemaluje sie kodem, wiec skin wchodzi filtrem
     * hue-rotate/saturate/brightness. Tuningowany per skin NA atlasie KINGA.
     * Pusty/brak = obrotnica 3/4 zostaje w barwach bazowych (recolor tylko w meczu).
     * WZORY (SKIN-2) maja filter3d ZAWSZE pusty — KING z wzorem spada na zywa
     * obrotnice render2d (wzor 1:1), patrz GarageSection.mountTurntable.
     */
    readonly filter3d?: string;
    /**
     * tankSkin (SKIN-2): id WZORU = klucz rejestru SKIN_PATTERNS
     * (src/experimental/tank25d/skinPatterns.ts). undefined = czysta paleta
     * (sciezka SKIN-1 bez zmian). Konwencja id defow: tp_* wzory, ts_* palety.
     */
    readonly pattern?: string;
    /**
     * tankSkin (SKIN-2): aproksymacja wzoru w CSS (background shorthand) do
     * PROSTOKATNEGO swatcha w pasku Garazu/kolekcji/sklepie. Zajawka, nie
     * wiernosc — prawdziwy wzor gracz widzi na obrotnicy. Zero canvasow w gridzie.
     */
    readonly swatchCss?: string;
    /** tankSkin (SKIN-2): kategoria wzoru do chipsow/grup UI (palety = undefined). */
    readonly patternCat?: 'animals' | 'games' | 'elements' | 'military' | 'seasonal';
    /**
     * tankSkin (SKIN-2, tylko animated): kolor akcentu meczowego PULSU
     * (overlay ADD na kadlubie — pelna animacja zyje tylko w Garazu).
     */
    readonly pulseTint?: string;
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
    { id: 'nc_gold',    type: 'nickColor', rarity: 'r', labelKey: 'cosmetic.nc_gold',    color: '#ffcc00' },
    { id: 'nc_lime',    type: 'nickColor', rarity: 'r', labelKey: 'cosmetic.nc_lime',    color: '#a7f320' },
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
    { id: 'nc_mint',    type: 'nickColor', rarity: 'c', labelKey: 'cosmetic.nc_mint',    color: '#5ff5c8' },
    { id: 'nc_rose',    type: 'nickColor', rarity: 'c', labelKey: 'cosmetic.nc_rose',    color: '#ff7591' },
    { id: 'nc_sky',     type: 'nickColor', rarity: 'c', labelKey: 'cosmetic.nc_sky',     color: '#5cbcff' },
    { id: 'nc_crimson', type: 'nickColor', rarity: 'r', labelKey: 'cosmetic.nc_crimson', color: '#ff4b39' },
    { id: 'nc_violet',  type: 'nickColor', rarity: 'r', labelKey: 'cosmetic.nc_violet',  color: '#b96bff' },
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
    // v0.147.0 — paczka MINY CZOLGISTY (6 szt., propozycja Mariusza z 04.09). Pierwszy
    // zestaw naklejek, ktory niesie EMOCJE, a nie przedmiot: dziesiec z dwunastu
    // dotychczasowych to biceps/pieszc/helm/tarcza. Rzadkosci wprost z opisow w zgloszeniu.
    { id: 'st_cool',      type: 'sticker', rarity: 'c', labelKey: 'cosmetic.st_cool',      emoji: '😎' },
    { id: 'st_steam',     type: 'sticker', rarity: 'c', labelKey: 'cosmetic.st_steam',     emoji: '😤' },
    { id: 'st_devil',     type: 'sticker', rarity: 'r', labelKey: 'cosmetic.st_devil',     emoji: '😈' },
    { id: 'st_party',     type: 'sticker', rarity: 'r', labelKey: 'cosmetic.st_party',     emoji: '🥳' },
    { id: 'st_rage',      type: 'sticker', rarity: 'e', labelKey: 'cosmetic.st_rage',      emoji: '😡' },
    { id: 'st_mindblown', type: 'sticker', rarity: 'l', labelKey: 'cosmetic.st_mindblown', emoji: '🤯' },
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
    // SHOP-2 (v0.138.0) — CELOWNIKI. Jedyna kosmetyka widoczna W GRZE: pozostale 32
    // pozycje widac wylacznie w hubie, a klakson dziala tylko z klawiatura. Dlatego
    // ida za deterministyczny zakup, nie za losowanie (takze czysciej pod PEGI).
    // Wyglad NIE jest opisany tutaj — `id` JEST kluczem rejestru CROSSHAIR_STYLES
    // (rendering/crosshairs.ts). Osobne pole dublowaloby te sama prawde w dwoch miejscach.
    { id: 'ch_sniper',   type: 'crosshair', rarity: 'c', labelKey: 'cosmetic.ch_sniper' },
    { id: 'ch_brackets', type: 'crosshair', rarity: 'c', labelKey: 'cosmetic.ch_brackets' },
    { id: 'ch_ring',     type: 'crosshair', rarity: 'r', labelKey: 'cosmetic.ch_ring' },
    { id: 'ch_fangs',    type: 'crosshair', rarity: 'r', labelKey: 'cosmetic.ch_fangs' },
    { id: 'ch_laser',    type: 'crosshair', rarity: 'e', labelKey: 'cosmetic.ch_laser' },
    { id: 'ch_sigma',    type: 'crosshair', rarity: 'l', labelKey: 'cosmetic.ch_sigma' },

    // ── v0.144.0: TLA POD ZDJECIEM czolgisty (12 szt.) ───────────────────────
    // Prosba z playtestu. Wchodza do PULI SKRZYNEK (nie ma ich w SHOP_ONLY_TYPES),
    // co przy okazji podnosi pule losowalna z 22 do 34 pozycji — skrzynki dluzej maja
    // co dawac. Odwracalne jedna linia, gdyby mialy byc towarem sklepowym.
    //
    // Zasada doboru: awatar jest ciemny i kontrastowy, wiec tla sa STONOWANE i ciemniejsze
    // od postaci. Czytelnosc sylwetki > efektowność tla (wartosc #1). Legendarne moga
    // byc mocniejsze, bo sa rzadkie i swiadomie zakladane.
    { id: 'bg_steel',    type: 'avatarBg', rarity: 'c', labelKey: 'cosmetic.bg_steel',    bg: 'linear-gradient(160deg, #4a5b6b 0%, #2b3946 100%)' },
    { id: 'bg_sand',     type: 'avatarBg', rarity: 'c', labelKey: 'cosmetic.bg_sand',     bg: 'linear-gradient(160deg, #c9a45c 0%, #7a5c2c 100%)' },
    { id: 'bg_forest',   type: 'avatarBg', rarity: 'c', labelKey: 'cosmetic.bg_forest',   bg: 'linear-gradient(160deg, #3f7a4d 0%, #1c3a26 100%)' },
    { id: 'bg_night',    type: 'avatarBg', rarity: 'c', labelKey: 'cosmetic.bg_night',    bg: 'linear-gradient(160deg, #2a3550 0%, #11162a 100%)' },

    { id: 'bg_sunset',   type: 'avatarBg', rarity: 'r', labelKey: 'cosmetic.bg_sunset',   bg: 'linear-gradient(160deg, #e07a3f 0%, #a13b62 55%, #3d1f3f 100%)' },
    { id: 'bg_ice',      type: 'avatarBg', rarity: 'r', labelKey: 'cosmetic.bg_ice',      bg: 'linear-gradient(160deg, #8fc7e8 0%, #35719c 60%, #17364d 100%)' },
    { id: 'bg_neon',     type: 'avatarBg', rarity: 'r', labelKey: 'cosmetic.bg_neon',     bg: 'linear-gradient(160deg, #6b2a8a 0%, #2a1f4a 55%, #0f1024 100%)' },
    { id: 'bg_camo',     type: 'avatarBg', rarity: 'r', labelKey: 'cosmetic.bg_camo',     bg: 'repeating-linear-gradient(135deg, #55663e 0 14px, #39422c 14px 28px, #6b5a38 28px 40px)' },

    { id: 'bg_mars',     type: 'avatarBg', rarity: 'e', labelKey: 'cosmetic.bg_mars',     bg: 'radial-gradient(circle at 50% 22%, #e0997f 0%, #a34a3a 45%, #4a2028 100%)' },
    { id: 'bg_rays',     type: 'avatarBg', rarity: 'e', labelKey: 'cosmetic.bg_rays',     bg: 'repeating-conic-gradient(from 0deg at 50% 45%, rgba(241,196,15,0.35) 0deg 9deg, rgba(20,26,34,0.95) 9deg 22deg)' },

    { id: 'bg_gold',     type: 'avatarBg', rarity: 'l', labelKey: 'cosmetic.bg_gold',     bg: 'linear-gradient(150deg, #f7e08a 0%, #e0a92c 38%, #8a5f12 72%, #3a2a08 100%)' },
    { id: 'bg_holo',     type: 'avatarBg', rarity: 'l', labelKey: 'cosmetic.bg_holo',     bg: 'conic-gradient(from 200deg at 50% 40%, #ff5f6d, #ffc371, #47e5bc, #4d7cff, #b06ab3, #ff5f6d)' },

    // ── v0.147.0: SKINY PROFILU (8 z docelowych 12) ──────────────────────────
    // Baner 1024x167 pod calym paskiem hero na stronie PROFIL. Towar WYLACZNIE sklepowy
    // (SHOP_ONLY_TYPES) — patrz komentarz przy tym zbiorze.
    //
    // Zasada doboru rzadkosci: kamuflaze nizej, zywioly wyzej. Cztery moro to warianty
    // tego samego pomyslu (gracz kupi jeden i ma temat zalatwiony), a ogien czy glebina
    // zmieniaja caly klimat profilu i to one maja byc celem zbierania.
    //
    // Brakujace cztery pozycje stoja w sklepie jako kafle WKROTCE (shop.ts). Dolozenie
    // pliku = jeden wiersz TUTAJ; sklep podlapie go sam przez profileSkinSkus().
    { id: 'ps_pixel',  type: 'profileSkin', rarity: 'c', labelKey: 'cosmetic.ps_pixel',  bgImage: 'profileBG/CADPAT_mini.jpg' },
    { id: 'ps_angles', type: 'profileSkin', rarity: 'c', labelKey: 'cosmetic.ps_angles', bgImage: 'profileBG/M90_mini.jpg' },
    { id: 'ps_jackal', type: 'profileSkin', rarity: 'r', labelKey: 'cosmetic.ps_jackal', bgImage: 'profileBG/Jackali_mini.jpg' },
    { id: 'ps_mirage', type: 'profileSkin', rarity: 'r', labelKey: 'cosmetic.ps_mirage', bgImage: 'profileBG/Mirage_mini.jpg' },
    { id: 'ps_gale',   type: 'profileSkin', rarity: 'e', labelKey: 'cosmetic.ps_gale',   bgImage: 'profileBG/AIr_mini.jpg' },
    { id: 'ps_stones', type: 'profileSkin', rarity: 'e', labelKey: 'cosmetic.ps_stones', bgImage: 'profileBG/Earth_mini.jpg' },
    { id: 'ps_deep',   type: 'profileSkin', rarity: 'l', labelKey: 'cosmetic.ps_deep',   bgImage: 'profileBG/Water_mini.jpg' },
    { id: 'ps_blaze',  type: 'profileSkin', rarity: 'l', labelKey: 'cosmetic.ps_blaze',  bgImage: 'profileBG/Fire_mini.jpg' },
    // v0.148.0 — komplet 12. Cztery mozaiki pikselowe (Mariusz, 04.09). Rzadkosci
    // rozlozone tak, zeby kazdy prog miec po trzy skiny: nowa czworka to jeden common,
    // dwa rare i jeden epic — inaczej caly tani prog bylby kamuflazem, a caly drogi
    // zywiolem, czyli gracz nie mialby wyboru KLIMATU, tylko wybor ceny.
    { id: 'ps_moss',   type: 'profileSkin', rarity: 'c', labelKey: 'cosmetic.ps_moss',   bgImage: 'profileBG/G-Square_mini.jpg' },
    { id: 'ps_amber',  type: 'profileSkin', rarity: 'r', labelKey: 'cosmetic.ps_amber',  bgImage: 'profileBG/Y-Square_mini.jpg' },
    { id: 'ps_plum',   type: 'profileSkin', rarity: 'r', labelKey: 'cosmetic.ps_plum',   bgImage: 'profileBG/V-Square_mini.jpg' },
    { id: 'ps_lava',   type: 'profileSkin', rarity: 'e', labelKey: 'cosmetic.ps_lava',   bgImage: 'profileBG/R-Square_mini.jpg' },

    // ── SKIN-1 (v0.159.0): BARWY CZOLGU (8 palet, c2/r3/e2/l1) ───────────────
    // hex CELOWO omija 8 barw bazowych czolgow (#27ae60/#8e44ad/#f1c40f/#3498db/
    // #71B7F2/#b04a35/#5E587A/#E02948) — skin ma byc widoczna ZMIANA, nie odcien.
    // filter3d: punkt startowy, tuning na zywym atlasie KINGA (krok 4 planu).
    // Legendarny "Zloty Sigma" gra z waluta gry — czytelny cel zbierania.
    { id: 'ts_desert',    type: 'tankSkin', rarity: 'c', labelKey: 'cosmetic.ts_desert',    hex: '#c9a35a', filter3d: 'sepia(0.5) hue-rotate(15deg) saturate(0.9) brightness(1.08)' },
    { id: 'ts_snow',      type: 'tankSkin', rarity: 'c', labelKey: 'cosmetic.ts_snow',      hex: '#c3ced8', filter3d: 'saturate(0.15) brightness(1.32)' },
    { id: 'ts_bubblegum', type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.ts_bubblegum', hex: '#ff5fa2', filter3d: 'hue-rotate(330deg) saturate(1.15) brightness(1.1)' },
    { id: 'ts_toxic',     type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.ts_toxic',     hex: '#a7f320', filter3d: 'hue-rotate(110deg) saturate(1.2)' },
    { id: 'ts_wave',      type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.ts_wave',      hex: '#17b8a6', filter3d: 'hue-rotate(185deg) saturate(1.05)' },
    { id: 'ts_lava',      type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.ts_lava',      hex: '#ff6b35', filter3d: 'hue-rotate(20deg) saturate(1.35) brightness(1.05)' },
    { id: 'ts_night',     type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.ts_night',     hex: '#2f3d55', filter3d: 'hue-rotate(230deg) saturate(0.5) brightness(0.8)' },
    { id: 'ts_sigma',     type: 'tankSkin', rarity: 'l', labelKey: 'cosmetic.ts_sigma',     hex: '#f4c842', filter3d: 'hue-rotate(55deg) saturate(1.3) brightness(1.12)' },

    // ── SKIN-2 (v0.160.0): WZORY PREMIUM (tp_*) + nowe palety ────────────────
    // pattern = klucz SKIN_PATTERNS (skinPatterns.ts); hex = paleta bazowa POD
    // wzorem (derive) + kolor nazwy; swatchCss = prostokatna zajawka w UI
    // (aproksymacja — prawda na obrotnicy); filter3d wzorow ZAWSZE pusty
    // (KING -> zywa obrotnica). pulseTint = akcent pulsu ADD w meczu (animated).

    // ZWIERZETA
    { id: 'tp_tiger', type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.tp_tiger',
      hex: '#e8862a', pattern: 'tp_tiger', patternCat: 'animals',
      swatchCss: 'background:repeating-linear-gradient(105deg,#e8862a 0 9px,#1a1208 9px 15px,#e8862a 15px 22px,#1a1208 22px 26px);' },
    { id: 'tp_cow', type: 'tankSkin', rarity: 'c', labelKey: 'cosmetic.tp_cow',
      hex: '#e8e4da', pattern: 'tp_cow', patternCat: 'animals',
      swatchCss: 'background:radial-gradient(ellipse 14px 10px at 22% 30%,#17130f 60%,transparent 61%),radial-gradient(ellipse 12px 9px at 72% 65%,#17130f 60%,transparent 61%),#f4f1ea;' },
    { id: 'tp_shark', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_shark',
      hex: '#5d707f', pattern: 'tp_shark', patternCat: 'animals',
      swatchCss: 'background:linear-gradient(180deg,#5d707f 0 55%,#dfe7ec 55%);' },
    { id: 'tp_dino', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_dino',
      hex: '#3f7d3a', pattern: 'tp_dino', patternCat: 'animals',
      swatchCss: 'background:radial-gradient(circle 6px at 8px 12px,#25511f 5px,transparent 6px),radial-gradient(circle 6px at 20px 12px,#25511f 5px,transparent 6px),radial-gradient(circle 6px at 14px 22px,#25511f 5px,transparent 6px),#3f7d3a;' },
    { id: 'tp_panda', type: 'tankSkin', rarity: 'c', labelKey: 'cosmetic.tp_panda',
      hex: '#d8d4cc', pattern: 'tp_panda', patternCat: 'animals',
      swatchCss: 'background:linear-gradient(90deg,#191512 0 26%,#f2efe9 26% 74%,#191512 74%);' },
    { id: 'tp_cobra', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_cobra',
      hex: '#4a5d33', pattern: 'tp_cobra', patternCat: 'animals', animated: true, pulseTint: '#d9e8a0',
      swatchCss: 'background:repeating-linear-gradient(45deg,#4a5d33 0 6px,#2b3a1c 6px 8px),repeating-linear-gradient(-45deg,transparent 0 6px,rgba(91,115,64,0.6) 6px 8px);' },

    // GRY (nazwy wlasne — zero marek)
    { id: 'tp_woxel', type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.tp_woxel',
      hex: '#5d9a3c', pattern: 'tp_woxel', patternCat: 'games',
      swatchCss: 'background:conic-gradient(#5d9a3c 0 25%,#4d8032 0 50%,#7ab54e 0 75%,#6b4f35 0) 0 0/12px 12px;' },
    { id: 'tp_bricks', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_bricks',
      hex: '#c9352b', pattern: 'tp_bricks', patternCat: 'games',
      swatchCss: 'background:radial-gradient(circle 5px at 10px 10px,#e0453a 4px,transparent 5px),radial-gradient(circle 5px at 26px 10px,#e0453a 4px,transparent 5px),radial-gradient(circle 5px at 18px 24px,#e0453a 4px,transparent 5px),#a02620;' },
    { id: 'tp_retro', type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.tp_retro',
      hex: '#5a3a80', pattern: 'tp_retro', patternCat: 'games',
      swatchCss: 'background:repeating-linear-gradient(180deg,rgba(0,0,0,0.3) 0 2px,transparent 2px 5px),conic-gradient(#3d2a56 0 25%,#5a3a80 0 50%,#2a1c3d 0 75%,#7a52a8 0) 0 0/10px 10px;' },
    { id: 'tp_glitch', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_glitch',
      hex: '#2bd8c8', pattern: 'tp_glitch', patternCat: 'games', animated: true, pulseTint: '#2bd8c8',
      swatchCss: 'background:linear-gradient(180deg,#101418 0 30%,rgba(255,40,90,0.75) 30% 42%,#101418 42% 55%,rgba(40,255,220,0.7) 55% 68%,#101418 68% 80%,#e8ecf2 80% 86%,#101418 86%);' },
    { id: 'tp_neongrid', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_neongrid',
      hex: '#00d4ff', pattern: 'tp_neongrid', patternCat: 'games', animated: true, pulseTint: '#00d4ff',
      swatchCss: 'background:repeating-linear-gradient(0deg,rgba(0,220,255,0.8) 0 1.5px,transparent 1.5px 9px),repeating-linear-gradient(90deg,rgba(0,220,255,0.8) 0 1.5px,transparent 1.5px 9px),#0a1020;' },
    { id: 'tp_lowpoly', type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.tp_lowpoly',
      hex: '#3aa0e0', pattern: 'tp_lowpoly', patternCat: 'games',
      swatchCss: 'background:conic-gradient(from 45deg,#7ec8f0 0 25%,#3aa0e0 0 50%,#1e6a9c 0 75%,#3aa0e0 0) 0 0/16px 16px;' },

    // ZYWIOLY (rdzen premium — wszystkie animowane)
    { id: 'tp_lava', type: 'tankSkin', rarity: 'l', labelKey: 'cosmetic.tp_lava',
      hex: '#ff6b35', pattern: 'tp_lava', patternCat: 'elements', animated: true, pulseTint: '#ff9a3d',
      swatchCss: 'background:linear-gradient(115deg,transparent 0 40%,rgba(255,140,20,0.9) 40% 46%,transparent 46% 60%,rgba(255,170,30,0.85) 60% 65%,transparent 65%),#211410;' },
    { id: 'tp_ice', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_ice',
      hex: '#8fd0e8', pattern: 'tp_ice', patternCat: 'elements', animated: true, pulseTint: '#e8fbff',
      swatchCss: 'background:linear-gradient(60deg,transparent 0 45%,rgba(70,140,180,0.6) 45% 48%,transparent 48%),linear-gradient(150deg,transparent 0 60%,rgba(70,140,180,0.5) 60% 63%,transparent 63%),#bfe3f2;' },
    { id: 'tp_ocean', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_ocean',
      hex: '#17b8a6', pattern: 'tp_ocean', patternCat: 'elements', animated: true, pulseTint: '#8ce6ff',
      swatchCss: 'background:radial-gradient(circle 8px at 8px 0px,transparent 6px,rgba(140,230,255,0.55) 7px,transparent 8px) 0 6px/16px 12px repeat,#0f5e7e;' },
    { id: 'tp_storm', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_storm',
      hex: '#96d2ff', pattern: 'tp_storm', patternCat: 'elements', animated: true, pulseTint: '#96d2ff',
      swatchCss: 'background:linear-gradient(115deg,transparent 0 44%,rgba(150,210,255,0.95) 44% 48%,transparent 48% 58%,rgba(150,210,255,0.7) 58% 61%,transparent 61%),#1b2340;' },
    { id: 'tp_galaxy', type: 'tankSkin', rarity: 'l', labelKey: 'cosmetic.tp_galaxy',
      hex: '#8a5adf', pattern: 'tp_galaxy', patternCat: 'elements', animated: true, pulseTint: '#c9a0ff',
      swatchCss: 'background:radial-gradient(circle 2px at 20% 30%,#fff 1.2px,transparent 2px),radial-gradient(circle 2px at 70% 60%,#fff 1px,transparent 2px),radial-gradient(circle 2px at 45% 80%,#fff 1px,transparent 2px),radial-gradient(ellipse 26px 16px at 35% 40%,rgba(160,80,220,0.55),transparent 70%),#12102e;' },
    { id: 'tp_slime', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_slime',
      hex: '#59c542', pattern: 'tp_slime', patternCat: 'elements', animated: true, pulseTint: '#c8ffb0',
      swatchCss: 'background:radial-gradient(circle 5px at 25% 35%,#59c542 4px,transparent 5px),radial-gradient(circle 4px at 65% 60%,#59c542 3px,transparent 4px),linear-gradient(180deg,rgba(230,255,210,0.35) 0 22%,transparent 40%),#3f9e2f;' },

    // WOJSKOWE
    { id: 'tp_desert', type: 'tankSkin', rarity: 'c', labelKey: 'cosmetic.tp_desert',
      hex: '#c8a86a', pattern: 'tp_desert', patternCat: 'military',
      swatchCss: 'background:radial-gradient(ellipse 12px 8px at 28% 35%,#8a6b40 60%,transparent 61%),radial-gradient(ellipse 10px 7px at 70% 62%,#5f4a2c 60%,transparent 61%),#c8a86a;' },
    { id: 'tp_cadpat', type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.tp_cadpat',
      hex: '#3d5a33', pattern: 'tp_cadpat', patternCat: 'military',
      swatchCss: 'background:conic-gradient(#3d5a33 0 25%,#243c1e 0 50%,#5a7548 0 75%,#141d10 0) 0 0/8px 8px;' },
    { id: 'tp_m90', type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.tp_m90',
      hex: '#4a5d3a', pattern: 'tp_m90', patternCat: 'military',
      swatchCss: 'background:linear-gradient(70deg,#2c3b22 0 30%,transparent 30%),linear-gradient(250deg,#75683f 0 26%,transparent 26%),linear-gradient(160deg,#1d2618 0 20%,transparent 20%),#4a5d3a;' },
    { id: 'tp_woodland', type: 'tankSkin', rarity: 'c', labelKey: 'cosmetic.tp_woodland',
      hex: '#4f6636', pattern: 'tp_woodland', patternCat: 'military',
      swatchCss: 'background:radial-gradient(ellipse 13px 9px at 30% 40%,#33491f 60%,transparent 61%),radial-gradient(ellipse 11px 8px at 72% 60%,#6b5a38 60%,transparent 61%),#4f6636;' },
    { id: 'tp_winter', type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.tp_winter',
      hex: '#c9d2da', pattern: 'tp_winter', patternCat: 'military',
      swatchCss: 'background:radial-gradient(ellipse 12px 8px at 30% 38%,#b9c2cc 60%,transparent 61%),radial-gradient(ellipse 10px 7px at 70% 64%,#8b98a6 60%,transparent 61%),#eef1f4;' },
    { id: 'tp_navy', type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.tp_navy',
      hex: '#33507a', pattern: 'tp_navy', patternCat: 'military',
      swatchCss: 'background:radial-gradient(ellipse 12px 8px at 30% 38%,#1e3050 60%,transparent 61%),radial-gradient(ellipse 10px 7px at 70% 62%,#5a7aa5 60%,transparent 61%),#33507a;' },

    // SEZONOWE (s3-s8; sezonowosc = klimat/nazwa, zero mechaniki sezonow)
    { id: 'tp_s3_notebook', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_s3_notebook',
      hex: '#3aa0e0', pattern: 'tp_s3_notebook', patternCat: 'seasonal',
      swatchCss: 'background:repeating-linear-gradient(0deg,rgba(58,160,224,0.5) 0 1px,transparent 1px 8px),repeating-linear-gradient(90deg,rgba(58,160,224,0.5) 0 1px,transparent 1px 8px),linear-gradient(90deg,transparent 0 9px,#d4213d 9px 11px,transparent 11px),#f6f1e2;' },
    { id: 'tp_s4_sweater', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_s4_sweater',
      hex: '#2ecc71', pattern: 'tp_s4_sweater', patternCat: 'seasonal',
      swatchCss: 'background:linear-gradient(180deg,#b8352c 0 25%,#efe9dc 25% 50%,#2e6b3a 50% 75%,#efe9dc 75%);' },
    { id: 'tp_s5_penguin', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_s5_penguin',
      hex: '#4dd7c8', pattern: 'tp_s5_penguin', patternCat: 'seasonal',
      swatchCss: 'background:radial-gradient(ellipse 16px 12px at 50% 55%,#f2f4f6 60%,transparent 61%),#16181d;' },
    { id: 'tp_s6_hatchling', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_s6_hatchling',
      hex: '#a3e635', pattern: 'tp_s6_hatchling', patternCat: 'seasonal',
      swatchCss: 'background:linear-gradient(102deg,#f3e9cf 0 46%,#ffd23f 46% 62%,#f3e9cf 62%),radial-gradient(circle 3px at 24% 30%,#d9c79a 2.4px,transparent 3px),radial-gradient(circle 3px at 78% 66%,#d9c79a 2.4px,transparent 3px);' },
    { id: 'tp_s7_grill', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_s7_grill',
      hex: '#ff9f43', pattern: 'tp_s7_grill', patternCat: 'seasonal',
      swatchCss: 'background:repeating-linear-gradient(65deg,transparent 0 8px,rgba(60,25,8,0.75) 8px 12px),#e0862f;' },
    { id: 'tp_s8_aloha', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.tp_s8_aloha',
      hex: '#37a0e0', pattern: 'tp_s8_aloha', patternCat: 'seasonal',
      swatchCss: 'background:radial-gradient(circle 6px at 30% 40%,#ff5f7a 5px,transparent 6px),radial-gradient(circle 4px at 30% 40%,#ffd23f 3px,transparent 4px),radial-gradient(ellipse 12px 9px at 72% 62%,#0e6b52 60%,transparent 61%),#1fa3b8;' },

    // NOWE PALETY (4 — omijaja 8 istniejacych ts_* i barwy bazowe czolgow)
    { id: 'ts_mint',    type: 'tankSkin', rarity: 'c', labelKey: 'cosmetic.ts_mint',    hex: '#8fe3c0', filter3d: 'hue-rotate(150deg) saturate(0.7) brightness(1.22)' },
    { id: 'ts_choco',   type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.ts_choco',   hex: '#7b4b2a', filter3d: 'sepia(0.6) hue-rotate(-10deg) saturate(1.1) brightness(0.9)' },
    { id: 'ts_indigo',  type: 'tankSkin', rarity: 'r', labelKey: 'cosmetic.ts_indigo',  hex: '#4b2ea8', filter3d: 'hue-rotate(255deg) saturate(1.15) brightness(0.92)' },
    { id: 'ts_fuchsia', type: 'tankSkin', rarity: 'e', labelKey: 'cosmetic.ts_fuchsia', hex: '#c026d3', filter3d: 'hue-rotate(300deg) saturate(1.35) brightness(1.05)' },
];

/**
 * v0.147.0 — etykiety kategorii w LICZBIE POJEDYNCZEJ.
 *
 * Zgloszenie Mariusza: popup skrzynki pisal „Nowy kosmetyk: Piasek", co nie mowilo,
 * CZY to tlo, ramka, czy kolor. Nagroda potrzebuje prefiksu kategorii.
 *
 * Dlaczego osobna mapa, a nie TYPE_LABEL_KEY z cosmeticGrid.ts: tamta jest w liczbie
 * MNOGIEJ, bo sluzy naglowkom grup („Tla pod zdjecie"). Jako prefiks nagrody czytaloby
 * sie to bledem. Dwa rozne zastosowania, nie duplikat.
 */
export const CATEGORY_LABEL_ONE: Record<CosmeticType, TranslationKey> = {
    nickColor: 'cosmetic.cat.nickColor',
    frame: 'cosmetic.cat.frame',
    title: 'cosmetic.cat.title',
    sticker: 'cosmetic.cat.sticker',
    horn: 'cosmetic.cat.horn',
    voice: 'cosmetic.cat.voice',
    crosshair: 'cosmetic.cat.crosshair',
    avatarBg: 'cosmetic.cat.avatarBg',
    profileSkin: 'cosmetic.cat.profileSkin',
    tankSkin: 'cosmetic.cat.tankSkin',
};

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
    // SKIN-1: przy fladze OFF skiny czolgu NIE dropia (skrzynka nie moze dac
    // "niewidzialnego" kosmetyku, ktorego zaden ekran nie pokaze).
    return COSMETICS.filter(c => c.rarity === rarity
        && !SHOP_ONLY_TYPES.has(c.type)
        && (c.type !== 'tankSkin' || isSkinsEnabled())).map(c => c.id);
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

/**
 * v0.144.0 — inline-style TLA pod awatarem wg equipped avatarBg.
 * Gdy nic nie zalozone, zwraca pusty string i zostaje domyslne tlo z CSS
 * (`.bt-hub0-avatar` / `.ph-portrait`) — czyli wyglad sprzed tej zmiany.
 */
export function avatarBgStyle(def: CosmeticDef | undefined): string {
    if (!def || def.type !== 'avatarBg' || !def.bg) return '';
    return `background:${def.bg};`;
}

/**
 * v0.147.0 — inline-style BANERU hero wg equipped profileSkin.
 *
 * Welon (ciemny gradient nad obrazem) nie jest ozdoba, tylko warunkiem czytelnosci:
 * pas hero niesie nick, pigulki i range, a nick na moro przestaje byc czytelny.
 * Dlatego gradient i obraz ida w JEDNEJ deklaracji `background-image` — nie da sie
 * wtedy zalozyc skinu bez welonu.
 *
 * Prefiks BASE_URL wchodzi parametrem, bo ten plik jest configiem i nie ma prawa
 * czytac `import.meta.env` (jest importowany takze poza kontekstem Vite w narzedziach).
 */
export function profileSkinStyle(def: CosmeticDef | undefined, base: string): string {
    if (!def || def.type !== 'profileSkin' || !def.bgImage) return '';
    // Welon ma DWIE osie i obie sa potrzebne — sprawdzone na zywym hero:
    //  - poziomo: najciemniej po lewej, gdzie stoi nick i pigulki (uklad szeroki),
    //  - pionowo: dociemnienie ku dolowi, bo przy waskim ekranie hero ZAWIJA SIE
    //    i ranga z przyciskiem EDYTUJ ladują w drugim/trzecim rzedzie, czyli tam,
    //    gdzie sam gradient poziomy juz nie chroni.
    // Prawy gorny rog zostaje najjasniejszy — tam nie ma zadnej tresci, wiec to
    // jedyne miejsce, gdzie skin moze byc soba w pelni.
    const veil = 'linear-gradient(180deg,rgba(12,16,22,0) 0%,rgba(12,16,22,0.10) 45%,rgba(12,16,22,0.45) 100%),'
        + 'linear-gradient(90deg,rgba(12,16,22,0.92) 0%,rgba(12,16,22,0.74) 45%,rgba(12,16,22,0.58) 100%)';
    return `background-image:${veil},url('${base}${def.bgImage}');`
        + 'background-size:cover;background-position:center;';
}

/**
 * SKIN-1/2 — inline-style PROBKI skina (PROSTOKAT — decyzja Mariusza: kulkowy
 * selektor nie pasowal do UI; prostokat czyta sie jak plyta pancerza).
 * Wzor (SKIN-2): gotowy swatchCss z defa (aproksymacja — prawda jest na
 * obrotnicy). Paleta: poziomy gradient "lakierowanej blachy" na hexie.
 */
/** SKIN-2 — porzadek kategorii skinow (sklep + kolekcja); undefined = palety. */
export const TANK_SKIN_CAT_ORDER: readonly (string | undefined)[] =
    [undefined, 'animals', 'games', 'elements', 'military', 'seasonal'];

export function tankSkinSwatchStyle(def: CosmeticDef | undefined): string {
    if (!def || def.type !== 'tankSkin') return '';
    if (def.swatchCss) return def.swatchCss;
    if (!def.hex) return '';
    return 'background:'
        + `linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.05) 35%,`
        + ` rgba(0,0,0,0) 60%, rgba(0,0,0,0.28) 100%),`
        + `${def.hex};`;
}

/** Inline-style dla ramki avatara wg equipped frame. */
export function frameStyle(def: CosmeticDef | undefined): string {
    if (!def || def.type !== 'frame') return '';
    const b = def.border ? `border:${def.border};` : '';
    const g = def.glow ? `box-shadow:${def.glow},inset 0 0 0 2px rgba(255,255,255,0.15);` : '';
    return b + g;
}
