import { t } from '../../../i18n/i18n';
import { MENU_MAP_CARDS, type MapId, type MenuMapCard } from '../../../types/MapType';
import { renderMapPreview } from '../../MapPreview';
import { playUiClick } from '../../uiSounds';

/**
 * MapPickerOverlay — WYBOR MAPY W POPUPIE (v0.127.0, zgloszenie Mariusza z playtestu).
 *
 * Do v0.126.0 szesc kart map lezalo INLINE w sekcji BITWA, pod czolgami i scenariuszami.
 * Dwa problemy, oba zmierzone:
 *  1. Dlugosc sekcji. Gracz musial przewinac przez 9 czolgow i 3 scenariusze, zeby w ogole
 *     zobaczyc mapy — a mape zmienia sie rzadziej niz czolg.
 *  2. Koszt bezczynnosci. `renderMapPreview` zwraca ANIMOWANE SVG. Szesc podgladow
 *     animowalo sie caly czas, gdy gracz wybieral cokolwiek innego. W popupie animuja
 *     sie tylko wtedy, gdy popup jest otwarty; w widoku domyslnym zostaje JEDEN podglad
 *     (wybrana mapa na kafelku-wyzwalaczu). Netto: -5 animowanych SVG w stanie spoczynku.
 *
 * KAFEL PIONOWY, nie poziomy jak `.bt-hub0-card`. Pozioma karta (media 92px z lewej +
 * tresc z prawej) potrzebuje ~230px na kolumne, czyli ~780px na trzy — na telefonie
 * w poziomie (667px) siatka zlamalaby sie do 2x3. Mariusz prosil o 3x2 i to musi byc
 * 3x2 TAKZE na telefonie, wiec kafel jest pionowy: podglad na gorze, nazwa pod nim.
 *
 * Klikniecie mapy = wybor I zamkniecie, bez kroku "potwierdz". Wybor mapy jest
 * odwracalny jednym klikniciem, wiec potwierdzenie byloby tarciem bez wartosci.
 *
 * Mapa LOCKED zostaje w siatce jako `<span>` (nieklikalny) z PELNYM podgladem i badge
 * WKROTCE — ta sama zasada co w liscie inline: gracz ma widziec, co jest w drodze,
 * zamiast pustego "???".
 */
export class MapPickerOverlay {
    private el: HTMLElement | null = null;

    /**
     * v0.143.0: `cardList` z domyslna wartoscia — KTB dostaje dokladnie to co dotad,
     * CTF podaje wlasna liste (CTF_MAP_CARDS). Jeden parametr zamiast drugiego overlaya.
     */
    open(
        parent: HTMLElement,
        selected: MapId,
        onPick: (id: MapId) => void,
        cardList: MenuMapCard[] = MENU_MAP_CARDS,
    ): void {
        this.close(); // pojedyncza instancja

        const cards = cardList.map(m => {
            const media = `<span class="mp-media">${renderMapPreview(m.previewType)}</span>`;
            const name = `<span class="mp-name">${m.emoji} ${t(m.nameKey)}</span>`;
            if (!m.available) {
                return `
                <span class="bt-mp-card is-soon" style="--tank:${m.accentColor}">
                    ${media}${name}
                    <i class="mp-badge">${t(m.comingSoonKey ?? 'common.soon')}</i>
                </span>`;
            }
            return `
            <button class="bt-mp-card${m.id === selected ? ' is-selected' : ''}"
                    data-map="${m.id}" type="button" style="--tank:${m.accentColor}">
                ${media}${name}
            </button>`;
        }).join('');

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay';
        this.el.innerHTML = `
            <div class="bt-hub0-modal bt-hub0-map-modal" role="dialog" aria-modal="true"
                 aria-label="${t('picker.mapTitle')}">
                <button class="bt-hub0-modal-close" data-action="close" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-hub0-modal-title">🗺️ ${t('picker.mapTitle')}</h3>
                <div class="bt-mp-grid">${cards}</div>
            </div>`;
        parent.appendChild(this.el);

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target === this.el || target.closest('[data-action="close"]')) {
                this.close();
                return;
            }
            const card = target.closest<HTMLElement>('[data-map]');
            if (!card) return;
            playUiClick();
            const id = card.dataset.map as MapId;
            this.close();
            onPick(id);
        });
    }

    close(): void {
        this.el?.remove();
        this.el = null;
    }
}
