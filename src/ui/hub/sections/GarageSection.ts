import { t, type TranslationKey } from '../../../i18n/i18n';
import { crateIcon } from '../gameIcons';
import type { HubSection, HubSelection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import { sessionService } from '../../../services/SessionService';
import { PITY_RARE_AT } from '../../../config/progression';
import { POWERS, POWER_ORDER, TIER3_POWERS, type PowerId, type PowerDef } from '../../../config/powers'; // F7a loadout + v0.114.0 kostka
import { BRAWLERS } from '../../../config/brawlers';
import { isChooseMode, TURN360_TANKS } from '../../../config/hubChoose'; // GARAZ-2 / GARAZ-2.5
import { isSkinsEnabled, isSkinsModeEnabled } from '../../../config/skins'; // SKIN-1 + GARAZ v2
import { isBalanceV2Enabled } from '../../../config/balanceFlag'; // BALANCE_V2 S5 — ZASIEG tylko przy v2
import { cosmeticsByType, getCosmetic, tankSkinSwatchStyle, RARITY_COLOR, type CosmeticDef } from '../../../config/cosmetics'; // SKIN-1
import { getShopItem } from '../../../config/shop'; // SKIN-1 — cena na kaflu locked
import { tankName, statRowHtml, STAT_MAX, tempoOf } from './BattleSection'; // GARAZ-2: wspolne kawalki kart
import { turntableCanvasHtml, mountTankTurntable, type TurntableHandle } from '../tankTurntable'; // GARAZ-2
import { mountTankTurn360 } from '../tankTurn360'; // GARAZ-2.5: viewer 3/4 z klatek
import { loadoutSlotTileHtml } from '../overlays/LoadoutOverlay'; // GARAZ-3: kafle slotow
import { applySkinToViewer, skinNeeds360 } from '../skinCommon'; // GARAZ v2: wspolne reguly skinow
import { playUiClick } from '../../uiSounds';

/**
 * v0.119.0 — opisy mocy do bogatych kart (odwzorowanie boxow z sigmatanks.eu).
 * Literalowa mapa (dynamiczny t(`power.${id}.desc`) nie kompiluje).
 */
const POWER_DESC_KEY: Record<PowerId, TranslationKey> = {
    aura: 'power.aura.desc',
    megaBomb: 'power.megaBomb.desc',
    freeze: 'power.freeze.desc',
    repair: 'power.repair.desc',
    tower: 'power.tower.desc',
    rockets: 'power.rockets.desc',
    ghost: 'power.ghost.desc',
    mines: 'power.mines.desc',
    build: 'power.build.desc',
    strike: 'power.strike.desc',
    hole: 'power.hole.desc',
    laser: 'power.laser.desc',
    pong: 'power.pong.desc',
    duck: 'power.duck.desc',
    locker: 'power.locker.desc',
    disco: 'power.disco.desc',
    granny: 'power.granny.desc',
    burp: 'power.burp.desc',
};

/**
 * GarageSection (GARAŻ) — HUB-2/F2a/F7a. Loadout Super Mocy + Zrzuty (skrzynki).
 * Skrzynki = srubki + KOSMETYKA (nigdy moc/staty). Otwarcie -> CrateOverlay (przez onOpenCrate).
 * PROFILE-1: kolekcja kosmetykow + teaser Rang PRZENIESIONE na strone profilu
 * (Garaz zostaje czysto "czolgowy": loadout, Szalone Moce, skrzynki).
 *
 * LOADOUT (F7a): 2 sloty + siatka mocy z rejestru. UX dla 9-12: tap slot = uzbroj go (zloty
 * ring), tap moc = wsadz do uzbrojonego slotu (duplikat w drugim slocie => swap w serwisie),
 * po przypisaniu auto-przejscie na drugi slot. Zablokowane moce wyszarzone z progiem 🏆.
 *
 * GARAZ-2 (v0.156.0, flaga ?choose=1): Garaz dostaje DWA wspol-glowne elementy —
 * WYBIERZ CZOLG (hero-row: zywa obrotnica Canvas2D + staty + POTWIERDZ) oraz
 * wywindowany loadout. Wybor commituje sie do WSPOLNEGO HubSelection (to samo pole,
 * ktore czyta GRAJ) + merge do LastSession. Interakcje loadoutu robia TARGETED
 * re-render tylko kontenera loadoutu, wiec obrotnica NIE remountuje sie na kazdy tap.
 * Flag OFF: renderLegacy() = dokladnie dzisiejszy Garaz, zero zmian.
 */
export class GarageSection implements HubSection {
    public readonly id = 'garage';
    public readonly icon = '🔧';
    label(): string { return t('hub.nav.garage'); }

    /** HubShell otwiera CrateOverlay. */
    public onOpenCrate: (() => void) | null = null;

    /** GARAZ-3: HubShell otwiera pelnoekranowy wybor mocy (LoadoutOverlay). */
    public onOpenLoadout: ((slot: 0 | 1 | 2) => void) | null = null;

    /** SKIN-1: hint preview prowadzi do sekcji SKLEP (HubShell.setActive). */
    public onOpenShop: (() => void) | null = null;

    /** GARAZ v2 / TRANSZA E: HubShell otwiera przymierzalnie (SkinsOverlay). */
    public onOpenSkins: (() => void) | null = null;

    /** SKIN-1: ULOTNY preview zablokowanego skina (znika przy zmianie czolgu/kafla/sekcji). */
    private previewSkinId: string | null = null;

    /** SKIN-2: aktywny chip filtra kategorii (nie persystowany). */
    private skinCat: 'all' | 'palettes' | 'animals' | 'games' | 'elements' | 'military' | 'seasonal' = 'all';

    /** SKIN-2: typ zamontowanego viewera (wzor wymusza remount KING: atlas->zywy). */
    private viewerIs360 = false;

    /** F7a — ktory slot loadoutu jest "uzbrojony" na przypisanie mocy (v0.114.0: 3 sloty). */
    private activeSlot: 0 | 1 | 2 = 0;

    private turntable: TurntableHandle | null = null;

    private el: HTMLElement | null = null;

    constructor(private readonly sel: HubSelection) {}

    render(el: HTMLElement): void {
        this.el = el;
        if (isChooseMode()) {
            this.renderChoose(el);
            return;
        }
        this.renderLegacy(el);
    }

    // ════════════════════════════════════════════════════════════════════════
    // GALAZ FLAG-OFF — dzisiejszy Garaz 1:1 (warunek odbioru: zero regresji)
    // ════════════════════════════════════════════════════════════════════════

    private renderLegacy(el: HTMLElement): void {
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';

        // v0.129.0 (zgloszenie Mariusza "nie wiem skad one tam sa") — SKRZYNKI NA GORZE.
        // Do v0.128.0 pudelko lezalo POD 18 kartami mocy i przelacznikiem Szalonych Mocy,
        // czyli na samym dole najdluzszej sekcji huba: gotowa skrzynka, najbardziej
        // klikalna rzecz na tym ekranie, byla niewidoczna bez przewiniecia.
        //
        // Dochodzi tez linijka ZRODEL. Skrzynki podbijaja `cratesEarned` az z szesciu
        // miejsc (rozkazy i ich komplety, milestony Szlaku, milestony Season Tracku,
        // progi punktowe sezonu, bramka roznorodnosci, sklep) i NIGDZIE w UI nie bylo
        // o tym slowa. Tekst jest dla dziecka, nie sciaga z kodu.
        //
        // PROFILE-1: kolekcja mieszka w profilu — drogowskaz stoi teraz tuz przy
        // przycisku OTWORZ, a nie kilkaset pikseli nizej.
        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.garage')}</h2>
            ${this.crateBoxHtml(pid)}
            <small class="bt-hub0-lhint">${crateIcon(15)} ${t('hub.garage.cratesFrom')}</small>
            <small class="bt-hub0-lhint">🪖 ${t('hub.garage.cosmeticsMoved')}</small>
            ${this.loadoutHtml(pid)}
        `;
        this.wireLegacy();
    }

    /** Pudelko skrzynek (wspolne dla obu galezi — v0.115.0 juice: gotowa CELEBRUJE). */
    private crateBoxHtml(pid: string): string {
        const cos = ProgressionService.getCosmeticState(pid);
        const pityLeft = PITY_RARE_AT - (cos.pityCounter % PITY_RARE_AT);
        const hasCrates = cos.crateCount > 0;
        return `
            <div class="bt-hub0-cratebox${hasCrates ? ' is-ready' : ''}">
                ${hasCrates ? '<div class="bt-hub0-crate-glow" aria-hidden="true"></div>' : ''}
                <div class="bt-hub0-crate-art" aria-hidden="true">${crateIcon(44)}${hasCrates ? '<i class="bt-hub0-dot"></i>' : ''}</div>
                <div class="bt-hub0-crate-info">
                    <b>${t('hub.garage.crates', { n: cos.crateCount })}</b>
                    <small>${t('hub.garage.pity', { n: pityLeft })}</small>
                </div>
                <button class="bt-hub0-play" data-action="open-crate" type="button" ${hasCrates ? '' : 'disabled'}>
                    ${t('hub.garage.open')}
                </button>
            </div>`;
    }

    // ════════════════════════════════════════════════════════════════════════
    // GALAZ FLAG-ON (GARAZ-2): obrotnica + WYBIERZ CZOLG + loadout wywindowany
    // ════════════════════════════════════════════════════════════════════════

    private renderChoose(el: HTMLElement): void {
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        this.previewSkinId = null; // SKIN-1: preview nie przezywa wyjscia z sekcji
        // Wrapper dostaje delegowany click PER RENDER (listener ginie z innerHTML —
        // zero duplikatow przy ponownym wejsciu do sekcji; el to trwaly .bt-hub0-main).
        // GARAZ-3 (brief Mariusza): hero FRAMELESS (czolg+nazwa+staty jedna
        // kompozycja na tle garazu, zero kart), zmiana czolgu = karuzela
        // (strzalki / flick / tap w nazwe, commit OD RAZU), jedyne ramki =
        // 3 sloty mocy (kafle record-boxa), wybor mocy w pelnoekranowym
        // LoadoutOverlay (tap slotu). Scroll TYLKO w overlayu.
        el.innerHTML = `
            <div class="bt-gr2-wrap">
                ${/* v0.199.1 (Mariusz: "znajdz inne miejsce na skrzynki — ten box lamie
                      strukture UI"): skrzynki jako CHIP w pasku tytulu. Szeroki box pod
                      mocami znika, hero + moce zostaja jedynym blokiem sekcji. */''}
                <div class="bt-gr2-titlerow">
                    <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.garage')}</h2>
                    ${this.crateChipHtml(pid)}
                </div>
                <div class="bt-gr2-hero" data-gr2-hero>${this.heroHtml(pid)}</div>
                ${isSkinsModeEnabled() ? '' : this.skinsAreaHtml(pid)}
                ${/* v0.199.1 (Mariusz): etykieta nad rzedem mocy — mala, biala. Rzad kafli sam
                      nie mowil, czym jest; jedno slowo taniej niz samouczek. */''}
                <div class="bt-gr2-slotslabel">${t('hub.garage.slotsLabel')}</div>
                <div class="bt-gr2-slots" data-gr2-slots>${this.slotsRowHtml(pid)}</div>
            </div>`;
        this.wireChoose(el);
        this.mountTurntable(el);
    }

    /**
     * GARAZ-3 v2 (minimalizacja UI): skrzynki jako JEDEN kompaktowy pasek —
     * ikona + licznik + OTWORZ. Pity i linijki zrodel zostaly w galezi legacy;
     * strefa hero ma byc czysta (brief: "czysta, piekna, estetyczna").
     */
    /**
     * v0.199.1 — SKRZYNKI JAKO CHIP przy tytule sekcji (zamiast szerokiego boxa pod mocami).
     * Bez skrzynek chip jest wygaszony i nieklikalny — zero martwego przycisku w kadrze.
     * `data-action` bez zmian, wiec wiring i CrateOverlay dzialaja jak dotad.
     */
    private crateChipHtml(pid: string): string {
        const cos = ProgressionService.getCosmeticState(pid);
        const has = cos.crateCount > 0;
        return `
            <button class="bt-gr2-cratechip${has ? ' is-ready' : ''}" data-action="open-crate"
                    type="button" ${has ? '' : 'disabled'}
                    title="${t('hub.garage.crates', { n: cos.crateCount })}">
                <span class="art" aria-hidden="true">${crateIcon(22)}${has ? '<i class="bt-hub0-dot"></i>' : ''}</span>
                <b>${cos.crateCount}</b>
                ${has ? `<span class="go">${t('hub.garage.open')}</span>` : ''}
            </button>`;
    }

    /**
     * GARAZ v2 / TRANSZA E (v0.199.0): widok glowny przestaje byc sklepem ze
     * skinami. Domyslnie stoi tu JEDEN przycisk otwierajacy przymierzalnie
     * (SkinsOverlay) — 42 kafle DOM i caly pas poziomy znikaja z hero, co ratuje
     * kompozycje przy 375 px landscape. `?skinsmode=0` wraca do starej tasmy.
     */
    private skinsAreaHtml(pid: string): string {
        if (!isSkinsEnabled()) return '';
        if (!isSkinsModeEnabled()) {
            return `<div class="bt-gr2-skins" data-gr2-skins>${this.skinsRowHtml(pid)}</div>`;
        }
        return `<div class="bt-gr2-skinbtn-wrap" data-gr2-skinbtn>${this.skinBtnHtml(pid)}</div>`;
    }

    /** Przycisk-wejscie do przymierzalni: probka + nazwa zalozonej barwy. */
    private skinBtnHtml(pid: string): string {
        const def = this.equippedSkin(pid);
        const b = BRAWLERS.find(x => x.id === this.sel.brawlerId) ?? BRAWLERS[0];
        return `
            <button class="bt-gr2-skinbtn" data-action="gr2-open-skins" type="button">
                <span class="sw" style="${def ? tankSkinSwatchStyle(def) : `background:${b.colorMain}`}" aria-hidden="true"></span>
                <span class="tx">
                    <b>${t('hub.garage.type.tankSkin')}</b>
                    <small>${def ? t(def.labelKey) : t('hub.garage.skinBase')}</small>
                </span>
                <span class="ch" aria-hidden="true">&#8250;</span>
            </button>`;
    }

    // ── SKIN-1: BARWY CZOLGU — pasek kropek pod obrotnica ───────────────────

    /** Zalozony skin (def) albo null. */
    private equippedSkin(pid: string): CosmeticDef | null {
        const id = ProgressionService.getCosmeticState(pid).equipped['tankSkin'];
        return (id ? getCosmetic(id) : undefined) ?? null;
    }

    /** Skin pokazywany na obrotnicy: ulotny preview albo zalozony. */
    private displayedSkin(pid: string): CosmeticDef | null {
        const p = this.previewSkinId ? getCosmetic(this.previewSkinId) : undefined;
        return p ?? this.equippedSkin(pid);
    }

    /** SKIN-2: chipsy filtra kategorii (42 pozycje = za duzo na jeden rzad). */
    private skinChipsHtml(): string {
        const cats = [
            ['all', t('cosmetic.tskin.cat.all')],
            ['palettes', t('cosmetic.tskin.cat.palettes')],
            ['animals', t('cosmetic.tskin.cat.animals')],
            ['games', t('cosmetic.tskin.cat.games')],
            ['elements', t('cosmetic.tskin.cat.elements')],
            ['military', t('cosmetic.tskin.cat.military')],
            ['seasonal', t('cosmetic.tskin.cat.seasonal')],
        ] as const;
        return `<div class="bt-gr2-skincats">${cats.map(([id, label]) => `
            <button class="bt-gr2-skincat${this.skinCat === id ? ' is-on' : ''}"
                    data-action="gr2-skincat" data-cat="${id}" type="button">${label}</button>`).join('')}
        </div>`;
    }

    /**
     * Pasek: chipsy kategorii + kafel BAZA (zawsze) + skiny z rejestru
     * (przefiltrowane chipem). PROSTOKATNE swatche (tankSkinSwatchStyle) z
     * ringiem rarity; locked = 🔒 + cena. Hint pod paskiem tylko przy preview.
     */
    private skinsRowHtml(pid: string): string {
        const cos = ProgressionService.getCosmeticState(pid);
        const equippedId = cos.equipped['tankSkin'] ?? null;
        const b = BRAWLERS.find(x => x.id === this.sel.brawlerId) ?? BRAWLERS[0];
        const baseDot = `
            <button class="bt-gr2-skin${!equippedId && !this.previewSkinId ? ' is-equipped' : ''}"
                    data-action="gr2-skin" data-skin="" type="button" title="${t('hub.garage.skinBase')}">
                <span class="dot" style="background:
                    radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), rgba(255,255,255,0) 55%),
                    radial-gradient(circle at 70% 75%, rgba(0,0,0,0.25), rgba(0,0,0,0) 60%),
                    ${b.colorMain};"></span>
                <small>${t('hub.garage.skinBase')}</small>
            </button>`;
        // SKIN-2: filtr chipa — palety = brak patternCat; kategorie po polu.
        const visible = cosmeticsByType('tankSkin').filter(def =>
            this.skinCat === 'all'
            || (this.skinCat === 'palettes' ? !def.patternCat : def.patternCat === this.skinCat));
        const dots = visible.map(def => {
            const owned = cos.owned.includes(def.id);
            const state = def.id === equippedId ? ' is-equipped'
                : def.id === this.previewSkinId ? ' is-preview'
                : owned ? '' : ' is-locked';
            const price = getShopItem(def.id)?.price;
            return `
            <button class="bt-gr2-skin${state}" data-action="gr2-skin" data-skin="${def.id}"
                    type="button" title="${t(def.labelKey)}"
                    style="--rar:${RARITY_COLOR[def.rarity]}">
                <span class="dot${def.animated ? ' is-anim' : ''}" style="${tankSkinSwatchStyle(def)}">${owned ? '' : '<span class="lk">🔒</span>'}</span>
                <small>${owned ? t(def.labelKey) : `${price ?? '?'} ⚙`}</small>
            </button>`;
        }).join('');
        const previewDef = this.previewSkinId ? getCosmetic(this.previewSkinId) : undefined;
        const hint = previewDef
            ? `<button class="bt-gr2-skinhint" data-action="gr2-skin-shop" type="button">
                   ${t('hub.garage.skinPreview', { n: getShopItem(previewDef.id)?.price ?? 0 })}
               </button>`
            : '';
        return `${this.skinChipsHtml()}<div class="bt-gr2-skinrow">${baseDot}${dots}</div>${hint}`;
    }

    /** Targeted refresh paska + przemalowanie obrotnicy (remount tylko gdy trzeba). */
    private refreshSkins(el: HTMLElement, pid: string): void {
        const box = el.querySelector<HTMLElement>('[data-gr2-skins]');
        if (box) box.innerHTML = this.skinsRowHtml(pid);
        // TRANSZA E: w trybie przymierzalni pasek nie istnieje — odswiezamy przycisk
        // (probka i nazwa musza isc za zmiana czolgu i za wyborem z overlaya).
        const btn = el.querySelector<HTMLElement>('[data-gr2-skinbtn]');
        if (btn) btn.innerHTML = this.skinBtnHtml(pid);
        const def = this.displayedSkin(pid);
        // SKIN-2: zmiana skina moze zmienic wymagany TYP viewera na czolgu z
        // atlasem (paleta<->wzor) — wtedy pelny remount zamiast setSkin.
        const needs360 = TURN360_TANKS.includes(this.sel.brawlerId) && !def?.pattern;
        if (needs360 !== this.viewerIs360) {
            this.mountTurntable(el);
        } else {
            this.turntable?.setSkin(def?.hex ?? null, def?.filter3d ?? null,
                def?.pattern ?? null, !!def?.animated);
        }
        // nazwa czolgu w hexie skina (feedback "to sa TWOJE barwy")
        const name = el.querySelector<HTMLElement>('.bt-gr2-name');
        const b = BRAWLERS.find(x => x.id === this.sel.brawlerId) ?? BRAWLERS[0];
        if (name) name.style.color = def?.hex ?? b.colorMain;
        // GARAZ-4: paski HP/DMG/SPEED tez w barwie skina (--tank na stage2).
        const stage = el.querySelector<HTMLElement>('[data-gr2-stage]');
        if (stage) stage.style.setProperty('--tank', def?.hex ?? b.colorMain);
    }

    /** GARAZ-3: rzad 3 slotow mocy — te same kafle co w LoadoutOverlay. */
    private slotsRowHtml(pid: string): string {
        return ([0, 1, 2] as const).map(slot => `
            <button class="bt-ld-slotbtn" data-action="gr2-slot" data-slot="${slot}" type="button">
                ${loadoutSlotTileHtml(pid, slot)}
            </button>`).join('');
    }

    /** GARAZ-3: karuzela czolgow — commit natychmiast (bez preview/potwierdz). */
    private cycleTank(el: HTMLElement, dir: 1 | -1): void {
        const idx = BRAWLERS.findIndex(b => b.id === this.sel.brawlerId);
        const next = BRAWLERS[(idx + dir + BRAWLERS.length) % BRAWLERS.length];
        if (!next) return;
        playUiClick();
        this.previewSkinId = null; // SKIN-1: preview jest ulotny — zmiana czolgu go zdejmuje
        this.sel.brawlerId = next.id;
        this.persistBrawler();
        this.updateHero(el);
        if (isSkinsEnabled()) {
            this.refreshSkins(el, ProfileService.getActiveProfile()?.id ?? 'default');
        }
    }

    private heroHtml(pid?: string): string {
        const b = BRAWLERS.find(x => x.id === this.sel.brawlerId) ?? BRAWLERS[0];
        // GARAZ-3: frameless — strzalki karuzeli po bokach czolgu, nazwa
        // (tappable = nastepny), jedna kompozycja na tle garazu.
        // GARAZ-4 (uwaga Mariusza): gablota lekko w LEWO, nazwa+staty OBOK
        // czolgu po PRAWEJ (.bt-gr2-side) — desktop i mobile tak samo.
        // --tank na wrapperze barwi paski statow; refreshSkins podmienia go
        // na hex skina (paski zmieniaja kolor razem z czolgiem).
        return `
            <div class="bt-gr2-stage2" style="--tank:${b.colorMain}" data-gr2-stage>
                <div class="bt-gr2-stagerow">
                    <button class="bt-gr2-arrow" data-action="gr2-prev" type="button"
                            aria-label="prev">&#8249;</button>
                    ${turntableCanvasHtml()}
                    <button class="bt-gr2-arrow" data-action="gr2-next" type="button"
                            aria-label="next">&#8250;</button>
                </div>
                <div class="bt-gr2-side">
                    <button class="bt-gr2-name" data-action="gr2-next" type="button"
                            style="color:${b.colorMain}">${tankName(b)}</button>
                    ${/* BALANCE_V2 (S5): TEMPO zawsze (reload byl najwieksza ukryta statystyka gry),
                          ZASIEG tylko przy rulesecie v2 — przy v1 kazdy czolg ma te same 1000 px,
                          wiec pasek zasiegu bylby po prostu klamstwem. `is-5` przelacza CSS na
                          siatke 2x3 przy niskim landscape (5 wierszy w kolumnie 150 px scisnieloby
                          paski do ~40 px i wypchnelo sloty mocy poza ekran). */''}
                    <div class="bt-gr2-stats${isBalanceV2Enabled() ? ' is-5' : ' is-4'}">
                        ${statRowHtml(t('stat.hp'), b.hp, STAT_MAX.hp)}
                        ${statRowHtml(t('stat.dmg'), b.dmg, STAT_MAX.dmg)}
                        ${statRowHtml(t('stat.speed'), b.speed, STAT_MAX.speed)}
                        ${statRowHtml(t('stat.tempo'), tempoOf(b.reload), STAT_MAX.tempo)}
                        ${isBalanceV2Enabled() && b.maxDist ? statRowHtml(t('stat.range'), b.maxDist, STAT_MAX.range) : ''}
                    </div>
                    ${/* v0.199.1 (Mariusz): podpowiedz "Przeciagnij, aby obrocic" USUNIETA —
                          "to gracz wyczuje". Klucz i18n `hub.garage.dragHint` zostaje w plikach
                          tlumaczen (uzywa go galaz legacy .bt-gr2-info). */''}
                    ${/* v0.199.1 (Mariusz): wejscie do przymierzalni siedzi POD statami,
                          w kolumnie tozsamosci — nie pod podium. Puste miejsce obok czolgu
                          bylo jedynym wolnym slotem kompozycji. */''}
                    ${pid && isSkinsModeEnabled() ? this.skinsAreaHtml(pid) : ''}
                </div>
            </div>`;
    }

    /** Re-render TYLKO hero (zmiana czolgu) + remount obrotnicy. */
    private updateHero(el: HTMLElement): void {
        const hero = el.querySelector<HTMLElement>('[data-gr2-hero]');
        if (!hero) return;
        // v0.199.1: przycisk przymierzalni zyje TERAZ w hero, wiec zmiana czolgu musi go
        // odtworzyc razem z nazwa i statami (inaczej znikalby po pierwszym przewinieciu).
        hero.innerHTML = this.heroHtml(ProfileService.getActiveProfile()?.id ?? 'default');
        this.mountTurntable(el);
    }

    /**
     * GARAZ v2 / TRANSZA F: powrot z przymierzalni. SkinsOverlay montowal WLASNA
     * obrotnice, a modul trzyma tylko JEDEN aktywny handle — nasza gablota jest
     * w tym momencie martwa (petla rAF zakonczona). Dlatego tu jest pelny remount,
     * a nie samo `setSkin`: inaczej gracz wraca do nieruchomego czolgu.
     */
    public refreshAfterSkins(): void {
        const el = this.el;
        if (!el) return;
        try {
            this.previewSkinId = null;
            this.mountTurntable(el);
            this.refreshSkins(el, ProfileService.getActiveProfile()?.id ?? 'default');
        } catch (e) {
            console.error('[GarageSection] refreshAfterSkins failed:', (e as Error).stack ?? e,
                { brawlerId: this.sel.brawlerId });
        }
    }

    /**
     * GARAZ-3: odswiez rzad slotow po powrocie z LoadoutOverlay — targeted
     * (obrotnica NIE remountuje sie przy zamknieciu overlaya).
     */
    public refreshSlots(): void {
        const box = this.el?.querySelector<HTMLElement>('[data-gr2-slots]');
        if (!box) return;
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        box.innerHTML = this.slotsRowHtml(pid);
    }

    private mountTurntable(el: HTMLElement): void {
        const cv = el.querySelector<HTMLCanvasElement>('canvas.bt-gr2-canvas');
        if (!cv) return;
        // GARAZ-2.5: singletony obu modulow sprzataja tylko SWOJE handle —
        // przy przelaczeniu renderera (turn360 <-> turntable) stary konczymy tu.
        this.turntable?.destroy();
        const id = this.sel.brawlerId;
        const flagId = ProfileService.getActiveProfile()?.flagId ?? null;
        const skinDef = isSkinsEnabled()
            ? this.displayedSkin(ProfileService.getActiveProfile()?.id ?? 'default')
            : null;
        // SKIN-2: atlas 3/4 nie umie WZOROW — wzorzysty skin zrzuca KING na zywa
        // obrotnice render2d (wzor 1:1 z meczem). Palety/filtr zostaja na atlasie.
        this.viewerIs360 = skinNeeds360(id, skinDef);
        this.turntable = this.viewerIs360
            ? mountTankTurn360(cv, id, flagId) // flagId: fallback turntable, gdy brak klatek
            : mountTankTurntable(cv, id, flagId);
        // SKIN-1/2: swiezo zamontowany viewer dostaje aktualne barwy/wzor od razu
        if (skinDef) applySkinToViewer(this.turntable, skinDef);
        this.wireFlick(el, cv);
    }

    /**
     * GARAZ-3 (decyzja z AskUserQuestion): FLICK na canvasie = zmiana czolgu.
     * Warstwa gestu zyje TUTAJ, nie w viewerach — mierzymy czas+dystans wlasnymi
     * listenerami; wolny drag dalej obraca gablote (viewer), szybki zamach
     * (<250 ms, >60 px) przelacza czolg. Canvas ginie przy updateHero, wiec
     * wiring odnawia sie przy kazdym mountTurntable (zero duplikatow).
     */
    private wireFlick(el: HTMLElement, cv: HTMLCanvasElement): void {
        let downT = 0;
        let downX = 0;
        cv.addEventListener('pointerdown', (e) => { downT = performance.now(); downX = e.clientX; });
        cv.addEventListener('pointerup', (e) => {
            if (downT === 0) return;
            const held = performance.now() - downT;
            const dx = e.clientX - downX;
            downT = 0;
            if (held > 250 || Math.abs(dx) < 60) return; // to byl obrot/tap, nie flick
            this.cycleTank(el, dx < 0 ? 1 : -1); // zamach w lewo = nastepny
        });
    }

    /**
     * Delegowany click (na wrapperze, ktory ginie z innerHTML — zero duplikatow
     * przy ponownym wejsciu): karuzela czolgow, sloty mocy, skrzynki.
     */
    private wireChoose(el: HTMLElement): void {
        const wrap = el.querySelector<HTMLElement>('.bt-gr2-wrap');
        if (!wrap) return;
        wrap.addEventListener('click', (e) => {
            const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
            const action = hit?.dataset.action;
            if (!action) return;
            switch (action) {
                case 'open-crate':
                    this.onOpenCrate?.();
                    return;
                case 'gr2-prev':
                    this.cycleTank(el, -1);
                    return;
                case 'gr2-next':
                    this.cycleTank(el, 1);
                    return;
                case 'gr2-slot': {
                    playUiClick();
                    const slot = Number(hit?.dataset.slot ?? 0) as 0 | 1 | 2;
                    this.onOpenLoadout?.(slot);
                    return;
                }
                case 'gr2-skin': {
                    // SKIN-1: posiadany = commit OD RAZU (spojnie z karuzela);
                    // zablokowany = ULOTNY preview na obrotnicy + hint sklepowy.
                    const pid = ProfileService.getActiveProfile()?.id ?? 'default';
                    const skinId = hit?.dataset.skin ?? '';
                    const cos = ProgressionService.getCosmeticState(pid);
                    playUiClick();
                    if (skinId === '') {
                        // BAZA: zdejmij skina (toggle na zalozonym id) + zdejmij preview
                        this.previewSkinId = null;
                        const eq = cos.equipped['tankSkin'];
                        if (eq) ProgressionService.equipCosmetic(pid, eq); // toggle OFF
                    } else if (cos.owned.includes(skinId)) {
                        this.previewSkinId = null;
                        ProgressionService.equipCosmetic(pid, skinId); // equip/toggle (serwis)
                    } else {
                        this.previewSkinId = this.previewSkinId === skinId ? null : skinId;
                    }
                    this.refreshSkins(el, pid);
                    return;
                }
                case 'gr2-skin-shop':
                    playUiClick();
                    this.onOpenShop?.();
                    return;
                case 'gr2-open-skins':
                    playUiClick();
                    this.onOpenSkins?.();
                    return;
                case 'gr2-skincat': {
                    playUiClick();
                    this.skinCat = (hit?.dataset.cat ?? 'all') as typeof this.skinCat;
                    const catPid = ProfileService.getActiveProfile()?.id ?? 'default';
                    const box = el.querySelector<HTMLElement>('[data-gr2-skins]');
                    if (box) box.innerHTML = this.skinsRowHtml(catPid);
                    return;
                }
            }
        });
    }

    /**
     * GARAZ-2: commit wyboru do LastSession (ISTNIEJACY klucz, zero nowych pol).
     * Merge: podmieniamy tylko brawlerId+brawlerName; gdy sesji nie ma (pierwszy
     * gracz przed pierwszym meczem) — bez zapisu, wybor zyje w HubSelection
     * i utrwali sie przy pierwszym GRAJ w startGame (jak dotad).
     */
    private persistBrawler(): void {
        try {
            const last = sessionService.getLastSession();
            if (!last) return;
            const b = BRAWLERS.find(x => x.id === this.sel.brawlerId);
            sessionService.saveLastSession({
                ...last,
                brawlerId: this.sel.brawlerId,
                brawlerName: b ? tankName(b) : this.sel.brawlerId,
            });
        } catch (e) {
            console.error('[GarageSection] persistBrawler failed:', (e as Error).stack ?? e,
                { brawlerId: this.sel.brawlerId });
        }
    }

    // ── F7a: Loadout Super Mocy (GALAZ LEGACY — flag-ON ma LoadoutOverlay) ──

    private loadoutHtml(pid: string): string {
        const ps = ProgressionService.getPowerState(pid);

        // v0.114.0: 3 sloty. Przy wlaczonych Szalonych Mocach slot 3 jest w MECZU kostka —
        // w Garazu pokazujemy go jako 🎲 (nie da sie uzbroic; wybor gracza wraca po OFF).
        const slots = ([0, 1, 2] as const).map(slot => {
            const diceSlot = slot === 2 && ps.funModeOn;
            const id = ps.loadout[slot];
            const def = id ? POWERS[id] : null;
            const armed = this.activeSlot === slot && !diceSlot;
            if (diceSlot) {
                return `
                <button class="bt-hub0-lslot is-dice" data-lslot="${slot}" type="button" aria-disabled="true">
                    <span class="num">${t('hub.garage.slot', { n: slot + 1 })}</span>
                    <span class="pi" aria-hidden="true">🎲</span>
                    <span class="pn">${t('power.dice')}</span>
                </button>`;
            }
            // v0.137.0: `is-empty` daje CSS haczyk na „to pole czeka na moc" — do v0.136.0
            // pusty i wypelniony slot wygladaly tak samo, wiec nie bylo widac, ze cokolwiek
            // trzeba zrobic (playtest Michala: nie rozpoznal, czym w ogole sa te trzy pola).
            return `
                <button class="bt-hub0-lslot${armed ? ' is-armed' : ''}${def ? '' : ' is-empty'}"
                        data-lslot="${slot}" type="button">
                    <span class="num">${t('hub.garage.slot', { n: slot + 1 })}</span>
                    <span class="pi" aria-hidden="true">${def?.emoji ?? '＋'}</span>
                    <span class="pn">${def ? t(def.labelKey) : '—'}</span>
                </button>`;
        }).join('');

        // v0.119.0: BOGATE KARTY MOCY (odwzorowanie boxow z sigmatanks.eu — decyzja
        // Mariusza): box ikony w kolorze mocy + kolorowa nazwa + opis + chipy
        // Cooldown/Od. 12 mocy loadoutu w gridzie 3x4; T3/FUN ma wlasna sekcje 3x2.
        const regularPowers = POWER_ORDER.filter(id => !TIER3_POWERS.includes(id));
        const grid = regularPowers.map(id => {
            const owned = ps.owned.includes(id);
            // Badge slotu 3 tylko gdy slot 3 realnie gra ta moca (funMode OFF) — przy
            // kostce badge "3" obok 🎲 w slocie mylilby, co faktycznie wjezdza do meczu.
            const inSlot = ps.loadout[0] === id ? 1 : ps.loadout[1] === id ? 2
                : (ps.loadout[2] === id && !ps.funModeOn) ? 3 : 0;
            return this.powerCard(POWERS[id], { owned, inSlot, fun: false });
        }).join('');
        const powersHead = `
            <div class="bt-hub0-powhead">
                <b>⚡ ${t('hub.garage.powersTitle', { n: regularPowers.length })}</b>
                <small>${t('hub.garage.powersSub', { n: regularPowers.length })}</small>
            </div>`;

        // v0.114.0: OSOBNA sekcja "Szalone Moce" — toggle + pula losowania kostki.
        // v0.119.0: pula (w tym PONG) jako te same bogate karty, pokazowe (bez tapu —
        // dostep daje kostka), fioletowy akcent. 6 kart w gridzie 3x2.
        const funOn = ps.funModeOn;
        const funCards = TIER3_POWERS.map(id =>
            this.powerCard(POWERS[id], { owned: true, inSlot: 0, fun: true })).join('');
        const crazySection = `
            <div class="bt-hub0-crazy">
                <div class="bt-hub0-funmode">
                    <span class="fm-ico" aria-hidden="true">🎲</span>
                    <span class="fm-txt">
                        <b>${t('hub.garage.funMode')} (${TIER3_POWERS.length})</b>
                        <small>${t('hub.garage.funSub', { n: TIER3_POWERS.length })}</small>
                    </span>
                    <button class="bt-hub0-fun-toggle${funOn ? ' is-on' : ''}" data-action="fun-toggle"
                            type="button" role="switch" aria-checked="${funOn}">
                        <span class="knob" aria-hidden="true"></span>
                    </button>
                </div>
                <div class="bt-hub0-powcards bt-hub0-powcards--fun">${funCards}</div>
            </div>`;

        // PROFILE-1: teaser Rang Zalog przeniesiony na strone profilu (ProfileSection).
        return `
            <div class="bt-hub0-loadout">
                <div class="bt-hub0-loadout-title">⚡ ${t('hub.garage.loadout')}</div>
                <div class="bt-hub0-lslots">${slots}</div>
                <small class="bt-hub0-lhint">${t('hub.garage.loadoutHint')}</small>
            </div>
            ${powersHead}
            <div class="bt-hub0-powcards">${grid}</div>
            ${crazySection}`;
    }

    /**
     * v0.119.0: bogata karta mocy (jezyk boxow ze strony www zmapowany na tokeny
     * huba). Interaktywna dla mocy loadoutu (tap = przypisz do uzbrojonego slotu,
     * istniejacy wiring [data-power]); pokazowa (span) dla puli FUN.
     */
    private powerCard(def: PowerDef, opts: { owned: boolean; inSlot: number; fun: boolean }): string {
        const color = '#' + def.color.toString(16).padStart(6, '0');
        const cdChip = t('power.chip.cooldown', { n: Math.round(def.cooldownMs / 1000) });
        const fromChip = def.unlockAtTrophies > 0
            ? t('power.chip.fromTrophies', { n: def.unlockAtTrophies })
            : t('power.chip.fromStart');
        const inner = `
            <span class="pc-icon" style="--pow:${color}" aria-hidden="true">
                ${def.emoji}${opts.owned ? '' : '<span class="pc-lock">🔒</span>'}
            </span>
            <span class="pc-body">
                <b class="pc-nm" style="color:${color}">${t(def.labelKey)}</b>
                <span class="pc-desc">${t(POWER_DESC_KEY[def.id])}</span>
                <span class="pc-chips">
                    <span class="pc-chip">${cdChip}</span>
                    <span class="pc-chip">${opts.fun ? `🎲 ${t('power.dice')}` : fromChip}</span>
                </span>
            </span>
            ${opts.inSlot ? `<span class="eq" aria-hidden="true">${opts.inSlot}</span>` : ''}`;
        if (opts.fun) {
            return `<span class="bt-hub0-powcard bt-hub0-powcard--fun">${inner}</span>`;
        }
        return `
            <button class="bt-hub0-powcard${opts.owned ? '' : ' is-locked'}${opts.inSlot ? ' is-equipped' : ''}"
                    data-power="${opts.owned ? def.id : ''}" type="button" ${opts.owned ? '' : 'aria-disabled="true"'}>
                ${inner}
            </button>`;
    }

    private wireLegacy(): void {
        const el = this.el;
        if (!el) return;
        el.querySelector('[data-action="open-crate"]')?.addEventListener('click', () => this.onOpenCrate?.());

        // F7a — loadout: tap slot = uzbroj; tap moc = przypisz do uzbrojonego + auto-przejscie
        // na kolejny slot (dziecko sklada zestaw tapami, bez trybow i menu). v0.114.0: 3 sloty;
        // slot-kostka (funMode ON) nie jest uzbrajalny, auto-przejscie go omija.
        const funOn = ProgressionService.getPowerState(ProfileService.getActiveProfile()?.id ?? 'default').funModeOn;
        const maxSlot = funOn ? 1 : 2; // przy kostce uzbrajalne tylko sloty 0-1
        el.querySelectorAll<HTMLElement>('[data-lslot]').forEach(btn => {
            btn.addEventListener('click', () => {
                const slot = Number(btn.dataset.lslot) as 0 | 1 | 2;
                if (slot > maxSlot) return; // slot-kostka: nie do uzbrojenia
                this.activeSlot = slot;
                this.render(el);
            });
        });
        // v0.114.0 — toggle "Szalone Moce" (slot 🎲)
        el.querySelector('[data-action="fun-toggle"]')?.addEventListener('click', () => {
            const pid = ProfileService.getActiveProfile()?.id ?? 'default';
            ProgressionService.setFunMode(pid, !ProgressionService.getPowerState(pid).funModeOn);
            if (this.activeSlot === 2) this.activeSlot = 0; // uzbrojony slot 3 wraca na 1 przy ON
            this.render(el);
        });
        el.querySelectorAll<HTMLElement>('[data-power]').forEach(btn => {
            const id = btn.dataset.power as PowerId | '';
            if (!id) return; // locked
            btn.addEventListener('click', () => {
                const pid = ProfileService.getActiveProfile()?.id ?? 'default';
                if (this.activeSlot > maxSlot) this.activeSlot = 0;
                ProgressionService.setLoadoutSlot(pid, this.activeSlot, id);
                this.activeSlot = (this.activeSlot >= maxSlot ? 0 : this.activeSlot + 1) as 0 | 1 | 2;
                this.render(el);
            });
        });
    }
}
