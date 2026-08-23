import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import { PITY_RARE_AT } from '../../../config/progression';
import { POWERS, POWER_ORDER, TIER3_POWERS, type PowerId } from '../../../config/powers'; // F7a loadout + v0.114.0 kostka

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
                <div class="bt-hub0-crate-art" aria-hidden="true">📦</div>
                <div class="bt-hub0-crate-info">
                    <b>${t('hub.garage.crates', { n: cos.crateCount })}</b>
                    <small>${t('hub.garage.pity', { n: pityLeft })}</small>
                </div>
                <button class="bt-hub0-play" data-action="open-crate" type="button" ${hasCrates ? '' : 'disabled'}>
                    ${t('hub.garage.open')}
                </button>
            </div>`;

        // PROFILE-1: kolekcja przeniesiona do profilu — jednoliniowy drogowskaz
        // pod skrzynka (gracz otwiera zrzut tutaj, zaklada zdobycz w profilu).
        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.garage')}</h2>
            ${this.loadoutHtml(pid)}
            ${crateBox}
            <small class="bt-hub0-lhint">🪖 ${t('hub.garage.cosmeticsMoved')}</small>
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

        // v0.114.0: Tier 3 NIE jest wybieralny do loadoutu (dostep tylko przez kostke) —
        // szalone moce maja wlasna sekcje ponizej, z pula losowania.
        const grid = POWER_ORDER.filter(id => !TIER3_POWERS.includes(id)).map(id => {
            const def = POWERS[id];
            const owned = ps.owned.includes(id);
            // Badge slotu 3 tylko gdy slot 3 realnie gra ta moca (funMode OFF) — przy
            // kostce badge "3" obok 🎲 w slocie mylilby, co faktycznie wjezdza do meczu.
            const inSlot = ps.loadout[0] === id ? 1 : ps.loadout[1] === id ? 2
                : (ps.loadout[2] === id && !ps.funModeOn) ? 3 : 0;
            return `
                <button class="bt-hub0-pow${owned ? '' : ' is-locked'}${inSlot ? ' is-equipped' : ''}"
                        data-power="${owned ? id : ''}" type="button" ${owned ? '' : 'aria-disabled="true"'}>
                    <span class="pi" aria-hidden="true">${owned ? def.emoji : '🔒'}</span>
                    <span class="pn">${owned ? t(def.labelKey) : t('hub.garage.powerLocked', { n: def.unlockAtTrophies })}</span>
                    ${inSlot ? `<span class="eq" aria-hidden="true">${inSlot}</span>` : ''}
                </button>`;
        }).join('');

        // v0.114.0: OSOBNA sekcja "Szalone Moce" (decyzja Mariusza) — toggle + pula
        // losowania kostki. T3 nie wchodzi do loadoutu, wiec chipy sa pokazowe
        // (bez lockow i progow — dostep daje sama kostka).
        const funOn = ps.funModeOn;
        // v0.115.0: pula kostki w tej samej "gramatyce" co kafle mocy (spojnosc);
        // span nie button — pokazowe, dostep daje kostka, nie tap.
        const diceChips = TIER3_POWERS.map(id => {
            const def = POWERS[id];
            return `<span class="bt-hub0-dicechip"><span class="pi" aria-hidden="true">${def.emoji}</span><span class="pn">${t(def.labelKey)}</span></span>`;
        }).join('');
        const crazySection = `
            <div class="bt-hub0-crazy">
                <div class="bt-hub0-funmode">
                    <span class="fm-ico" aria-hidden="true">🎲</span>
                    <span class="fm-txt">
                        <b>${t('hub.garage.funMode')}</b>
                        <small>${t('hub.garage.funModeHint')}</small>
                    </span>
                    <button class="bt-hub0-fun-toggle${funOn ? ' is-on' : ''}" data-action="fun-toggle"
                            type="button" role="switch" aria-checked="${funOn}">
                        <span class="knob" aria-hidden="true"></span>
                    </button>
                </div>
                <div class="bt-hub0-dicepool">${diceChips}</div>
            </div>`;

        // PROFILE-1: teaser Rang Zalog przeniesiony na strone profilu (ProfileSection).
        return `
            <div class="bt-hub0-loadout">
                <div class="bt-hub0-cos-grouptitle">⚡ ${t('hub.garage.loadout')}</div>
                <div class="bt-hub0-lslots">${slots}</div>
                <div class="bt-hub0-pow-grid">${grid}</div>
                <small class="bt-hub0-lhint">${t('hub.garage.loadoutHint')}</small>
            </div>
            ${crazySection}`;
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
