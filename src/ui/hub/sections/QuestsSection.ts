import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import { QuestService, type QuestView } from '../../../services/QuestService';
import {
    MAP_LABEL_KEY, questDisplayValue, generalLineIndex,
    QUEST_UNLOCK_TROPHIES,
} from '../../../config/quests';

/**
 * QuestsSection (ROZKAZY) — HUB-3 / PROG-F3. Deska rozkazow: Generał Pancerz + 3 rozkazy dnia
 * + pasek "komplet dnia" (glowny hak: skrzynka za 3/3) + 3 rozkazy tygodnia.
 *
 * Karta rozkazu (§17.6): duza ikona mechaniki + jedno zdanie + licznik + pasek postepu,
 * kolor ramki per tier (szary/niebieski/pomaranczowy/zloty). Zero czytania — dziecko skanuje
 * ikone i liczbe. Wszystko DOM (zero kosztu in-game).
 *
 * Ponizej 120 🏆 sekcja jest zablokowana (§5 — nie przytlaczac w 1. sesji), z jawnie
 * pokazanym progiem i dystansem do niego.
 */
export class QuestsSection implements HubSection {
    public readonly id = 'quests';
    public readonly icon = '📋';
    label(): string { return t('hub.nav.quests'); }

    /** Odebrano nagrode -> HubShell odswieza readout (srubki/skrzynki). */
    public onRewardClaimed: (() => void) | null = null;
    /**
     * v0.126.0 — nagroda ZAWIERALA SKRZYNKE. Do v0.125.0 `grantQuestReward` po cichu
     * dopisywalo `cratesEarned`, a jedynym sygnalem byla zmiana napisu na ODEBRANE —
     * stad wrazenie „kliknalem ODBIERZ i nic sie nie stalo". Teraz HubShell otwiera
     * ten sam CrateOverlay co w Garazu i sklepie: nagroda jest WIDOCZNA w momencie,
     * w ktorym ja dostajesz (Sensoryka), a nie dopiero po wejsciu do Garazu.
     */
    public onCratesGranted: (() => void) | null = null;

    private el: HTMLElement | null = null;

    render(el: HTMLElement): void {
        this.el = el;
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        const trophies = ProgressionService.getTrophies(pid);
        const board = QuestService.getBoard(pid, trophies);

        if (!board.unlocked) {
            el.innerHTML = `
                <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.quests')}</h2>
                ${this.generalHtml(board.dayKey)}
                <div class="bt-hub0-node is-future" style="margin-top:12px;">
                    <span class="mark" aria-hidden="true">🔒</span>
                    <div class="info">
                        <b>${t('hub.quests.locked', { n: QUEST_UNLOCK_TROPHIES })}</b>
                        <span class="reward">${t('hub.quests.lockedHint', { n: Math.max(0, QUEST_UNLOCK_TROPHIES - trophies) })}</span>
                    </div>
                </div>`;
            return;
        }

        const setBtn = board.dailySetClaimed
            ? `<span class="bt-hub0-q-claimed">${t('hub.quests.claimed')}</span>`
            : `<button class="bt-hub0-play" data-set="1" type="button" ${board.dailySetReady ? '' : 'disabled'}>${t('hub.quests.claim')}</button>`;
        const weekSetBtn = board.weeklySetClaimed
            ? `<span class="bt-hub0-q-claimed">${t('hub.quests.claimed')}</span>`
            : `<button class="bt-hub0-play" data-wset="1" type="button" ${board.weeklySetReady ? '' : 'disabled'}>${t('hub.quests.claim')}</button>`;

        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.quests')}</h2>
            ${this.generalHtml(board.dayKey)}

            <!-- v0.126.0 (prosba Mariusza po playtescie): DZIENNE i TYGODNIOWE OBOK SIEBIE.
                 Dotad szly jedno pod drugim, wiec tygodniowych nie bylo widac bez przewijania
                 przez caly zestaw dzienny — a to one niosa skrzynki. Dwie kolumny na desktopie,
                 jedna pod druga dopiero na waskim ekranie (CSS: .bt-hub0-qcols). -->
            <div class="bt-hub0-qcols">
                <div class="bt-hub0-qcol">
                    <div class="bt-hub0-q-head">${t('hub.quests.daily')}<small>${t('hub.quests.resetDaily')}</small></div>
                    ${board.daily.map(q => this.questCard(q)).join('')}

                    <div class="bt-hub0-cratebox bt-hub0-q-set">
                        <div class="bt-hub0-crate-art" aria-hidden="true">📦</div>
                        <div class="bt-hub0-crate-info">
                            <b>${t('hub.quests.setTitle')} ${board.dailyDone}/${board.daily.length}</b>
                            <small>${t('hub.quests.setReward', { bolts: board.setBolts })}</small>
                        </div>
                        ${setBtn}
                    </div>
                </div>

                <div class="bt-hub0-qcol">
                    <div class="bt-hub0-q-head">${t('hub.quests.weekly')}<small>${t('hub.quests.resetWeekly')}</small></div>
                    ${board.weekly.map(q => this.questCard(q)).join('')}

                    <!-- v0.126.0 — KOMPLET TYGODNIA. Kolumna tygodniowa miala pusto dokladnie
                         tam, gdzie dzienna ma swoje pudelko, wiec tydzien nie mial domkniecia. -->
                    <div class="bt-hub0-cratebox bt-hub0-q-set">
                        <div class="bt-hub0-crate-art" aria-hidden="true">📦</div>
                        <div class="bt-hub0-crate-info">
                            <b>${t('hub.quests.weekSetTitle')} ${board.weeklyDone}/${board.weekly.length}</b>
                            <small>${t('hub.quests.weekSetReward', { bolts: board.weeklySetBolts, crates: board.weeklySetCrates })}</small>
                        </div>
                        ${weekSetBtn}
                    </div>
                </div>
            </div>
        `;
        this.wire(pid, trophies);
    }

    /** Naglowek z Generalem — najtansza warstwa osobowosci w projekcie (§17.1 pkt 8). */
    private generalHtml(dayKey: string): string {
        const idx = generalLineIndex(dayKey);
        const lines = [
            'quest.general.1', 'quest.general.2', 'quest.general.3', 'quest.general.4',
            'quest.general.5', 'quest.general.6', 'quest.general.7', 'quest.general.8',
            'quest.general.9', 'quest.general.10', 'quest.general.11', 'quest.general.12',
        ] as const;
        const line = t(lines[(idx - 1) % lines.length]);
        return `
            <div class="bt-hub0-general">
                <span class="face" aria-hidden="true">🎖️</span>
                <div class="say">
                    <b>${t('hub.quests.general')}</b>
                    <span>„${line}"</span>
                </div>
            </div>`;
    }

    private questCard(q: QuestView): string {
        const mapKey = q.param ? MAP_LABEL_KEY[q.param] : undefined;
        const label = t(q.def.labelKey, {
            n: questDisplayValue(q.def.metric, q.target),
            map: mapKey ? t(mapKey) : '',
        });
        const cur = questDisplayValue(q.def.metric, q.current);
        const max = questDisplayValue(q.def.metric, q.target);
        const pct = Math.min(100, Math.round((q.current / q.target) * 100));
        // v0.115.0: waluta = Sigma (moneta; wewnetrznie pole dalej 'bolts' — display-only).
        const reward = `<img class="bt-sigma" src="${import.meta.env.BASE_URL}assets/sigma.png" alt=""> ${q.def.bolts}${q.def.crates ? ' · 📦' : ''}`;

        const action = q.claimed
            ? `<span class="bt-hub0-q-claimed">${t('hub.quests.claimed')}</span>`
            : q.done
                ? `<button class="bt-hub0-play bt-hub0-q-claim" data-quest="${q.key}" type="button">${t('hub.quests.claim')}</button>`
                : `<span class="bt-hub0-q-count">${cur}/${max}</span>`;

        return `
            <div class="bt-hub0-q bt-hub0-q--${q.def.tier}${q.done ? ' is-done' : ''}${q.claimed ? ' is-claimed' : ''}">
                <span class="qi" aria-hidden="true">${q.def.icon}</span>
                <div class="qbody">
                    <b>${label}</b>
                    <div class="qbar"><i style="width:${pct}%;"></i></div>
                    <small>${reward}</small>
                </div>
                <div class="qact">${action}</div>
            </div>`;
    }

    /**
     * v0.126.0 — JEDNA sciezka ksiegowania nagrody dla wszystkich trzech przyciskow
     * (pojedynczy rozkaz / komplet dnia / komplet tygodnia). Wczesniej kazdy mial swoja
     * kopie tych samych czterech linii, wiec dodanie feedbacku o skrzynce trzeba byloby
     * pamietac w trzech miejscach.
     */
    private applyReward(el: HTMLElement, pid: string, reward: { bolts: number; crates: number } | null): void {
        if (!reward) return;   // juz odebrane / niedokonczone — cichy no-op, jak dotad
        ProgressionService.grantQuestReward(pid, reward);
        this.render(el);
        this.onRewardClaimed?.();
        if (reward.crates > 0) this.onCratesGranted?.();
    }

    private wire(pid: string, trophies: number): void {
        const el = this.el;
        if (!el) return;

        el.querySelectorAll<HTMLElement>('[data-quest]').forEach(btn => {
            const key = btn.dataset.quest;
            if (!key) return;
            btn.addEventListener('click', () => {
                this.applyReward(el, pid, QuestService.claim(pid, key, trophies));
            });
        });

        el.querySelector<HTMLElement>('[data-set]')?.addEventListener('click', () => {
            this.applyReward(el, pid, QuestService.claimDailySet(pid, trophies));
        });
        el.querySelector<HTMLElement>('[data-wset]')?.addEventListener('click', () => {
            this.applyReward(el, pid, QuestService.claimWeeklySet(pid, trophies));
        });
    }
}
