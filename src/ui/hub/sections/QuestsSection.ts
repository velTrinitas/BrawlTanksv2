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

        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.quests')}</h2>
            ${this.generalHtml(board.dayKey)}

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

            <div class="bt-hub0-q-head">${t('hub.quests.weekly')}<small>${t('hub.quests.resetWeekly')}</small></div>
            ${board.weekly.map(q => this.questCard(q)).join('')}
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

    private wire(pid: string, trophies: number): void {
        const el = this.el;
        if (!el) return;

        el.querySelectorAll<HTMLElement>('[data-quest]').forEach(btn => {
            const key = btn.dataset.quest;
            if (!key) return;
            btn.addEventListener('click', () => {
                const reward = QuestService.claim(pid, key, trophies);
                if (!reward) return; // juz odebrane / niedokonczone — cichy no-op
                ProgressionService.grantQuestReward(pid, reward);
                this.render(el);
                this.onRewardClaimed?.();
            });
        });

        el.querySelector<HTMLElement>('[data-set]')?.addEventListener('click', () => {
            const reward = QuestService.claimDailySet(pid, trophies);
            if (!reward) return;
            ProgressionService.grantQuestReward(pid, reward);
            this.render(el);
            this.onRewardClaimed?.();
        });
    }
}
