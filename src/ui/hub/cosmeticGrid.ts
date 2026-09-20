/**
 * cosmeticGrid.ts — PROFILE-1 (v0.118.0).
 *
 * Wspolny grid kosmetykow WYSIWYG — wyciagniety 1:1 z GarageSection (v0.115.0),
 * bo kolekcja przenosi sie z GARAZU na strone PROFILU (skrzynki zostaja w Garazu).
 *
 * WYSIWYG (fix Czytelnosci z v0.115.0): karta = prawdziwy podglad kosmetyku.
 * nickColor: nazwa w SWOIM kolorze/gradiencie (nickColorStyle 1:1 z readoutem huba)
 * + tlo karty z koloru. frame: kropka = mini-ring z border/glow defa. Rzadkosc
 * zostaje na kropce (nickColor) — dwa kanaly, zero konfliktu.
 */
import { t } from '../../i18n/i18n';
import { ProgressionService } from '../../services/ProgressionService';
import type { CosmeticState } from '../../services/ProgressionService';
import {
    cosmeticsByType, getCosmetic, RARITY_COLOR, nickColorStyle, frameStyle, avatarBgStyle,
    profileSkinStyle, tankSkinSwatchStyle, TANK_SKIN_CAT_ORDER,
    type CosmeticDef, type CosmeticType,
} from '../../config/cosmetics';
import { AudioSys } from '../../audio/AudioSys';
import { crosshairCanvasHtml } from './crosshairPreview'; // SHOP-2

/** Kafel kolekcji jest maly — podglad celownika dostaje bok karty, nie 64 px. */
const GRID_PREVIEW_PX = 44;

/** v0.147.0 — prefiks assetow (skiny profilu sa plikami, nie CSS-em). */
const COS_BASE = import.meta.env.BASE_URL;

/** Etykiety grup per typ (literalowe klucze i18n). */
const TYPE_LABEL_KEY = {
    nickColor: 'hub.garage.type.nickColor',
    frame: 'hub.garage.type.frame',
    title: 'hub.garage.type.title',
    horn: 'hub.garage.type.horn',
    voice: 'hub.garage.type.voice',
    // v0.138.0: 'sticker' brakowalo tu od poczatku (naklejki maja wlasny picker pod hero,
    // wiec luka nigdy nie wybuchla) — dolozone, zeby `cosmeticGroupsHtml` przyjmowalo
    // KAZDY typ z rejestru, a nie podzbior, o ktorym trzeba pamietac.
    sticker: 'hub.garage.type.sticker',
    crosshair: 'hub.garage.type.crosshair',
    avatarBg: 'hub.garage.type.avatarBg', // v0.144.0
    profileSkin: 'hub.garage.type.profileSkin', // v0.147.0
    tankSkin: 'hub.garage.type.tankSkin', // SKIN-1
} as const;

/**
 * v0.136.0 — typy, dla ktorych kropka rzadkosci nic nie mowi, bo def ma wlasne emoji
 * (klaksony 📣/📢/🔊/🎺, paczka glosowa). Kolor rzadkosci zostaje na tle karty.
 */
const EMOJI_TYPES: ReadonlySet<CosmeticType> = new Set<CosmeticType>(['horn', 'voice', 'sticker']);

/** Jedna karta kosmetyku (owned interaktywna / locked wyszarzona). */
export function cosmeticChipHtml(
    def: CosmeticDef,
    cos: Pick<CosmeticState, 'owned' | 'equipped'>,
): string {
    const owned = cos.owned.includes(def.id);
    const equipped = cos.equipped[def.type] === def.id;
    // Rzutowanie na DOWOLNY istniejacy klucz `cosmetic.*` — `t()` nie przyjmuje zmiennej,
    // a labelKey jest juz typu TranslationKey. v0.144.0: bylo 'cosmetic.nc_silver',
    // ktory zniknal razem z 13. kolorem nicku.
    const label = t(def.labelKey as 'cosmetic.nc_gold');
    const hexColor = RARITY_COLOR[def.rarity];
    const isNick = def.type === 'nickColor';
    const isFrame = def.type === 'frame';
    const cardColor = isNick && def.color && !def.gradient ? `${def.color}66` : `${hexColor}80`;
    const nmStyle = isNick && owned ? nickColorStyle(def) : '';
    const nmShimmer = isNick && owned && def.animated ? ' bt-cos-shimmer' : '';
    // v0.138.0: celownik pokazuje sie MINI-CANVASEM rysowanym ta sama funkcja, ktora
    // rysuje go w meczu. Zablokowany tez — gracz ma widziec, na co zbiera; kropka
    // rzadkosci nie powiedzialaby o nim absolutnie nic.
    // v0.147.0 (zgloszenie Mariusza: „usun te niebieska kropke") — przy kolorze nicku
    // kropka pokazywala RZADKOSC, nie kolor, wiec przy zlotym nicku swiecila na
    // niebiesko. Sama kolorowa nazwa JEST probka, a rzadkosc niesie juz tlo karty
    // (--rarity-color) — kropka tylko konkurowala z tym, po co gracz tu patrzy.
    const dot = isNick
        ? ''
        : isFrame
        ? `<span class="dot dot--frame" style="${frameStyle(def)}" aria-hidden="true"></span>`
        // v0.144.0: tlo awatara pokazuje SIEBIE — kropka rzadkosci nie powiedzialaby
        // nic o tym, jak wyglada; ta sama zasada co przy celownikach i ramkach.
        : def.type === 'avatarBg'
            ? `<span class="dot dot--frame" style="${avatarBgStyle(def)}" aria-hidden="true"></span>`
        // v0.147.0: skin profilu pokazuje SIEBIE, pelna szerokoscia kafla — ta sama
        // zasada co ramki i tla, tylko material jest plikiem, nie gradientem.
        : def.type === 'profileSkin'
            ? `<span class="dot dot--banner" style="${profileSkinStyle(def, COS_BASE)}" aria-hidden="true"></span>`
        // SKIN-1: barwy czolgu pokazuja SIEBIE probka koloru (ta sama zasada
        // co avatarBg/ramki) — kropka rzadkosci nic by nie powiedziala o palecie.
        : def.type === 'tankSkin'
            ? `<span class="dot" style="${tankSkinSwatchStyle(def)}" aria-hidden="true"></span>`
        : def.type === 'crosshair'
            ? crosshairCanvasHtml(def.id, GRID_PREVIEW_PX)
            : EMOJI_TYPES.has(def.type) && def.emoji
                ? `<span class="dot dot--emoji" aria-hidden="true">${def.emoji}</span>`
                : `<span class="dot" style="background:${hexColor};" aria-hidden="true"></span>`;
    return `
        <button class="bt-hub0-cos${owned ? '' : ' is-locked'}${equipped ? ' is-equipped' : ''}"
                style="--rarity-color:${cardColor};" title="${label}" aria-label="${label}"
                data-cos="${owned ? def.id : ''}" type="button" ${owned ? '' : 'aria-disabled="true"'}>
            ${dot}
            <span class="nm${nmShimmer}" style="${nmStyle}">${owned ? label : '🔒'}</span>
            ${equipped ? '<span class="eq" aria-hidden="true">✓</span>' : ''}
        </button>`;
}

/**
 * v0.144.0 — typy prezentowane w JEDNYM RZEDZIE (prosba Mariusza: kolory nicku i tla
 * pod zdjecie maja stac w linii, a nie zawijac sie na dwa rzedy).
 *
 * Dlaczego akurat te dwa: obie kolekcje to CZYSTE PROBKI KOLORU — kafel niesie caly
 * sens w sobie, wiec rzad czyta sie jak paleta. Klaksony czy paczki glosowe maja
 * emoji i nazwe, wiec siatka sluzy im lepiej.
 *
 * Na waskim ekranie rzad SCROLLUJE SIE W POZIOMIE zamiast sciskac kafle do
 * nieczytelnych 30 px — 12 pozycji przy 375 px nie zmiesci sie inaczej bez zlamania
 * bramki czytelnosci. Pasek nie zabiera wysokosci, bo grupa i tak jest jednorzedowa.
 */
const SINGLE_ROW_TYPES: ReadonlySet<CosmeticType> = new Set<CosmeticType>(['nickColor', 'avatarBg', 'tankSkin']); // SKIN-1: czyste probki = rzad-paleta

/**
 * v0.147.0 — typy w siatce DWUKOLUMNOWEJ. Baner 1024:167 w kaflu 44 px bylby kreska;
 * potrzebuje polowy szerokosci kolumny, zeby dalo sie rozpoznac kamuflaz od zywiolu.
 */
const WIDE_ROW_TYPES: ReadonlySet<CosmeticType> = new Set<CosmeticType>(['profileSkin']);

/** Grupy kosmetykow (naglowek typu + grid kart) dla podanych typow. */
/** SKIN-2: etykiety podgrup skinow (patternCat; undefined = palety). */
const TSKIN_CAT_LABEL = {
    palettes: 'cosmetic.tskin.cat.palettes',
    animals: 'cosmetic.tskin.cat.animals',
    games: 'cosmetic.tskin.cat.games',
    elements: 'cosmetic.tskin.cat.elements',
    military: 'cosmetic.tskin.cat.military',
    seasonal: 'cosmetic.tskin.cat.seasonal',
} as const;

export function cosmeticGroupsHtml(cos: CosmeticState, types: readonly CosmeticType[]): string {
    return types.map(type => {
        const rowCls = SINGLE_ROW_TYPES.has(type)
            ? ' bt-hub0-cos-grid--row'
            : WIDE_ROW_TYPES.has(type) ? ' bt-hub0-cos-grid--wide' : '';
        // SKIN-2: skiny czolgu w podgrupach po kategorii (42 pozycje w jednym
        // rzedzie bylyby slepym scrollem) — mini-naglowki --sub + rzad per grupa.
        if (type === 'tankSkin') {
            // v0.199.0: `cos.owned` — wycofana barwa, ktora gracz KUPIL, zostaje w jego
            // Kolekcji (znika tylko ze sprzedazy i przymierzalni).
            const defs = [...cosmeticsByType(type, cos.owned)].sort((a, b) =>
                TANK_SKIN_CAT_ORDER.indexOf(a.patternCat) - TANK_SKIN_CAT_ORDER.indexOf(b.patternCat));
            let lastCat: string | undefined = '__none';
            const inner = defs.map(def => {
                const cat = (def.patternCat ?? 'palettes') as keyof typeof TSKIN_CAT_LABEL;
                const head = cat !== lastCat
                    ? `${lastCat !== '__none' ? '</div>' : ''}
                       <div class="bt-hub0-cos-grouptitle bt-hub0-cos-grouptitle--sub">${t(TSKIN_CAT_LABEL[cat])}</div>
                       <div class="bt-hub0-cos-grid${rowCls}">`
                    : '';
                lastCat = cat;
                return head + cosmeticChipHtml(def, cos);
            }).join('') + '</div>';
            return `<div class="bt-hub0-cos-group">
                <div class="bt-hub0-cos-grouptitle">${t(TYPE_LABEL_KEY[type])}</div>
                ${inner}
            </div>`;
        }
        const items = cosmeticsByType(type, cos.owned).map(def => cosmeticChipHtml(def, cos)).join('');
        return `<div class="bt-hub0-cos-group">
            <div class="bt-hub0-cos-grouptitle">${t(TYPE_LABEL_KEY[type])}</div>
            <div class="bt-hub0-cos-grid${rowCls}">${items}</div>
        </div>`;
    }).join('');
}

/** Wiring tapniec equip na [data-cos] w obrebie `el`. onEquipped = re-render + refresh readoutu. */
export function wireCosmeticGrid(el: HTMLElement, pid: string, onEquipped: () => void): void {
    el.querySelectorAll<HTMLElement>('[data-cos]').forEach(btn => {
        const id = btn.dataset.cos;
        if (!id) return; // locked
        btn.addEventListener('click', () => {
            ProgressionService.equipCosmetic(pid, id);
            // v0.136.0: klakson MA zabrzmiec przy zalozeniu. Kolory i ramki widac od razu
            // na karcie, dzwiek nie ma jak sie pokazac — kafel bez reakcji to blad
            // Sensoryki. Tylko przy ZAKLADANIU (toggle off zostaje cichy).
            const def = getCosmetic(id);
            if (def?.type === 'horn' && def.sound
                && ProgressionService.getCosmeticState(pid).equipped.horn === id) {
                AudioSys.getInstance().playOwnedSound(def.sound);
            }
            onEquipped();
        });
    });
}
