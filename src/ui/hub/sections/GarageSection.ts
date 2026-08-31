import { t, type TranslationKey } from '../../../i18n/i18n';
import { crateIcon } from '../gameIcons';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import { PITY_RARE_AT } from '../../../config/progression';
import { POWERS, POWER_ORDER, TIER3_POWERS, type PowerId, type PowerDef } from '../../../config/powers'; // F7a loadout + v0.114.0 kostka

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
 */
export class GarageSection implements HubSection {
    public readonly id = 'garage';
    public readonly icon = '🔧';
    label(): string { return t('hub.nav.garage'); }

    /** HubShell otwiera CrateOverlay. */
    public onOpenCrate: (() => void) | null = null;

    /** F7a — ktory slot loadoutu jest "uzbrojony" na przypisanie mocy (v0.114.0: 3 sloty). */
    private activeSlot: 0 | 1 | 2 = 0;

    private el: HTMLElement | null = null;

    render(el: HTMLElement): void {
        this.el = el;
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        const cos = ProgressionService.getCosmeticState(pid);
        const pityLeft = PITY_RARE_AT - (cos.pityCounter % PITY_RARE_AT);

        // v0.115.0 juice: gotowa skrzynka CELEBRUJE (zloty glow + lewitacja) — skrzynki
        // to glowny hak petli, maja krzyczec "otworz mnie" (Sensoryka). is-ready tylko
        // tutaj (Rozkazy reuzywaja .bt-hub0-cratebox, ale nigdy nie dostaja tej klasy).
        const hasCrates = cos.crateCount > 0;
        const crateBox = `
            <div class="bt-hub0-cratebox${hasCrates ? ' is-ready' : ''}">
                ${hasCrates ? '<div class="bt-hub0-crate-glow" aria-hidden="true"></div>' : ''}
                <div class="bt-hub0-crate-art" aria-hidden="true">${crateIcon(44)}</div>
                <div class="bt-hub0-crate-info">
                    <b>${t('hub.garage.crates', { n: cos.crateCount })}</b>
                    <small>${t('hub.garage.pity', { n: pityLeft })}</small>
                </div>
                <button class="bt-hub0-play" data-action="open-crate" type="button" ${hasCrates ? '' : 'disabled'}>
                    ${t('hub.garage.open')}
                </button>
            </div>`;

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
            ${crateBox}
            <small class="bt-hub0-lhint">${crateIcon(15)} ${t('hub.garage.cratesFrom')}</small>
            <small class="bt-hub0-lhint">🪖 ${t('hub.garage.cosmeticsMoved')}</small>
            ${this.loadoutHtml(pid)}
        `;
        this.wire();
    }

    // ── F7a: Loadout Super Mocy ─────────────────────────────────────────────

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
            return `
                <button class="bt-hub0-lslot${armed ? ' is-armed' : ''}" data-lslot="${slot}" type="button">
                    <span class="num">${t('hub.garage.slot', { n: slot + 1 })}</span>
                    <span class="pi" aria-hidden="true">${def?.emoji ?? '❔'}</span>
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
                <div class="bt-hub0-cos-grouptitle">⚡ ${t('hub.garage.loadout')}</div>
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

    private wire(): void {
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
