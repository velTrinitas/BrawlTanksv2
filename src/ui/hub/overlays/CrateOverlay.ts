import { t } from '../../../i18n/i18n';
import { ProgressionService } from '../../../services/ProgressionService';
import { AudioSys } from '../../../audio/AudioSys';
import {
    getCosmetic, RARITY_COLOR, nickColorStyle, RARITY_LABEL_KEY, CATEGORY_LABEL_ONE, type Rarity,
} from '../../../config/cosmetics';
import { CRATE_RARITY_WEIGHTS, type CrateOpenResult } from '../../../config/progression';
import { cosmeticArtHtml } from '../cosmeticGrid';
import { paintCrosshairPreviews } from '../crosshairPreview';
import { countUp, reducedMotion } from '../juice';

/**
 * Art skrzynki (assety Mariusza, v0.131.0). Wieko `crate_lid_512.png` jest narysowane jako
 * samodzielny obiekt na srodku kadru — pozycje startowa na zamknietej skrzyni nadaje CSS
 * (`.bt-crx-lid`, translateY -14%, zmierzone w v0.131.0).
 */
const CRATE_ART = {
    closed: `${import.meta.env.BASE_URL}assets/items/crate_closed_512.png`,
    body: `${import.meta.env.BASE_URL}assets/items/crate_body_512.png`,
    lid: `${import.meta.env.BASE_URL}assets/items/crate_lid_512.png`,
} as const;
const SIGMA_ART = `${import.meta.env.BASE_URL}assets/sigma.png`;

/**
 * CrateOverlay — SKRZYNKA v3 (v0.232.0, uwagi Mariusza i Michala):
 *  - SCENA na cala nakladke (hangar zrzutu: reflektor, podloga, dym) zamiast szarego modala,
 *  - skrzynia NIE znika po 3. tapie (to dawalo „pusta skrzynke"): wieko odlatuje, ze srodka
 *    strzela slup swiatla w kolorze rzadkosci i WYPADA nagroda jako GRAFIKA + monety sigm,
 *  - tekst tylko jako podpis pod grafika.
 *
 * Fazy jako stan w JS (v0.203.0): klik w tlo tapuje TYLKO w `tapping`, zamyka TYLKO w `reveal`;
 * `[data-action]` zawsze wygrywa z tapem w tlo (krzyzyk nie moze otworzyc skrzynki).
 *
 * MOBILE (optymalizacja wbudowana): wylacznie CSS transform/opacity, zero `filter: blur`, zero
 * PIXI; tlo statyczne (rusza sie tylko maly stozek promieni). Twarde limity: dym <= 8, iskry
 * 14–30, monety <= 8, wszystko sprzatane po animacji. Dotyk (`pointer: coarse`) = tryb lekki
 * (mniej dymu, bez drugiej salwy). `prefers-reduced-motion` = bez dymu/lotu (CSS + JS).
 */
type CratePhase = 'dropping' | 'tapping' | 'bursting' | 'reveal';

export class CrateOverlay {
    private el: HTMLElement | null = null;
    private tapsLeft = 3;
    private onDone: (() => void) | null = null;
    private phase: CratePhase = 'dropping';
    private timers: number[] = [];
    private readonly lite = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

    /** Iskry przy otwarciu per rzadkosc (v0.137.0: rzadkosc czytana z ILOSCI, nie tylko barwy). */
    private static readonly SPARKS_BY_RARITY: Record<Rarity, number> = { c: 14, r: 18, e: 24, l: 30 };
    /** Rzadkosci z DRUGA salwa („petarda strzela, potem huk"). */
    private static readonly DOUBLE_VOLLEY: ReadonlySet<Rarity> = new Set<Rarity>(['e', 'l']);

    open(parent: HTMLElement, profileId: string, onDone: () => void): void {
        this.close();
        this.onDone = onDone;
        this.tapsLeft = 3;
        this.phase = 'dropping';

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay bt-crx-overlay';
        this.el.innerHTML = this.sceneHtml();
        parent.appendChild(this.el);
        this.wireScene(profileId);
    }

    private sceneHtml(): string {
        return `
            <div class="bt-crx-stage" role="dialog" aria-modal="true" aria-label="${t('crate.title')}">
                <div class="bt-crx-rays" aria-hidden="true"></div>
                <button class="bt-hub0-modal-close" data-action="done" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <div class="bt-crx-title">${t('crate.title')}</div>
                <button class="bt-crx-pools" data-action="pools" type="button">${t('crate.pools')}</button>
                <div class="bt-crx-table" aria-hidden="true"><i class="top"></i><i class="edge"></i><i class="shine"></i></div>
                <div class="bt-crx-anchor">
                    <div class="bt-crx-beam" aria-hidden="true"></div>
                    <button class="bt-crx-box is-dropping" data-action="tap" type="button" aria-label="${t('crate.tap')}">
                        <img src="${CRATE_ART.closed}" alt="" draggable="false">
                        <i class="bt-crx-seam" aria-hidden="true"></i>
                    </button>
                    <div class="bt-crx-fx" aria-hidden="true"></div>
                    <div class="bt-crx-coins" aria-hidden="true"></div>
                </div>
                <div class="bt-crx-reward" aria-live="polite"></div>
                <div class="bt-crx-foot">
                    <div class="bt-crx-pips" aria-hidden="true"><i></i><i></i><i></i></div>
                    <div class="bt-crx-hint">${t('crate.tapAnywhere')}</div>
                </div>
            </div>`;
    }

    private later(fn: () => void, ms: number): void {
        this.timers.push(window.setTimeout(() => { if (this.el) fn(); }, ms));
    }

    private wireScene(profileId: string): void {
        const el = this.el;
        if (!el) return;
        el.addEventListener('click', (e) => {
            const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
            if (action === 'done' || action === 'back') { this.close(); this.onDone?.(); return; }
            if (action === 'pools') { this.showPools(); return; }
            if (this.phase === 'tapping' && (action === 'tap' || !action)) { this.onTap(profileId); return; }
            if (this.phase === 'reveal' && !action && (e.target === el || (e.target as HTMLElement).classList.contains('bt-crx-stage'))) {
                this.close(); this.onDone?.();
            }
        });
        // v0.144.0: dzwiek startuje na POCZATKU lotu — huk pliku (650 ms) = keyframe ladowania.
        AudioSys.getInstance().duckMusic(6000);
        AudioSys.getInstance().playCrateDrop();

        const box = el.querySelector<HTMLElement>('.bt-crx-box');
        const land = (): void => {
            if (!this.el || this.phase !== 'dropping') return;
            box?.classList.remove('is-dropping');
            this.phase = 'tapping';
            const stage = el.querySelector<HTMLElement>('.bt-crx-stage');
            stage?.classList.add('quake');
            this.later(() => stage?.classList.remove('quake'), 260);
            this.spawnSmoke('land');
            this.spawnDust(false);
        };
        if (reducedMotion()) { land(); return; }
        box?.addEventListener('animationend', (ev) => {
            if ((ev as AnimationEvent).animationName === 'bt-crx-drop') land();
        });
    }

    /**
     * DYM (div z radial-gradient, bez blur). `land` = buchniecie w boki przy ziemi,
     * `tap` = maly oblok, `open` = slup w gore. Limity: 8 / 3 / 8 (lite: 5 / 2 / 5).
     */
    private spawnSmoke(kind: 'land' | 'tap' | 'open'): void {
        if (reducedMotion()) return;
        const fx = this.el?.querySelector<HTMLElement>('.bt-crx-fx');
        if (!fx) return;
        const n = kind === 'tap' ? (this.lite ? 2 : 3) : (this.lite ? 5 : 8);
        for (let i = 0; i < n; i++) {
            const s = document.createElement('span');
            s.className = `bt-crx-smoke is-${kind}`;
            const side = i % 2 ? 1 : -1;
            const spread = kind === 'open' ? 30 : 60 + Math.random() * 70;
            s.style.setProperty('--dx', `${side * (kind === 'open' ? Math.random() * spread : spread)}px`);
            s.style.setProperty('--dy', kind === 'open' ? `${-(90 + Math.random() * 110)}px` : `${-(6 + Math.random() * 26)}px`);
            s.style.setProperty('--s', String(kind === 'tap' ? 0.8 + Math.random() * 0.5 : 1.1 + Math.random() * 0.9));
            s.style.animationDelay = `${i * (kind === 'open' ? 50 : 20)}ms`;
            fx.appendChild(s);
            s.addEventListener('animationend', () => s.remove(), { once: true });
        }
    }

    /** Kurz/iskry (v0.131.0/v0.137.0) — przeniesione do warstwy fx sceny. */
    private spawnDust(gold: boolean, sparkColor?: string, rarity?: Rarity): void {
        if (reducedMotion()) return;
        const fx = this.el?.querySelector<HTMLElement>('.bt-crx-fx');
        if (!fx) return;
        for (let i = 0; i < (this.lite ? 6 : 10); i++) {
            const s = document.createElement('span');
            s.className = gold ? 'bt-crx-dust gold' : 'bt-crx-dust';
            const ang = Math.PI * (1 + Math.random());
            const dist = 34 + Math.random() * 56;
            s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
            s.style.setProperty('--dy', `${Math.sin(ang) * dist * 0.6}px`);
            s.style.setProperty('--s', String(0.8 + Math.random() * 1.1));
            fx.appendChild(s);
            s.addEventListener('animationend', () => s.remove(), { once: true });
        }
        if (sparkColor) {
            const rr = rarity ?? 'c';
            const count = CrateOverlay.SPARKS_BY_RARITY[rr];
            this.spawnSparkVolley(fx, sparkColor, count, 1);
            if (!this.lite && CrateOverlay.DOUBLE_VOLLEY.has(rr)) {
                this.later(() => this.spawnSparkVolley(fx, sparkColor, count, 1.45), 220);
            }
        }
    }

    private spawnSparkVolley(fx: HTMLElement, color: string, count: number, reach: number): void {
        for (let i = 0; i < count; i++) {
            const s = document.createElement('i');
            s.className = 'bt-crx-spark';
            const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
            s.style.setProperty('--rot', `${(ang * 180) / Math.PI}deg`);
            s.style.setProperty('--dist', `${(70 + Math.random() * 80) * reach}px`);
            s.style.setProperty('--rc', color);
            fx.appendChild(s);
            s.addEventListener('animationend', () => s.remove(), { once: true });
        }
    }

    /** Drzazgi przy tapie — 6 malych odpryskow drewna (CSS). */
    private spawnSplinters(): void {
        if (reducedMotion()) return;
        const fx = this.el?.querySelector<HTMLElement>('.bt-crx-fx');
        if (!fx) return;
        for (let i = 0; i < (this.lite ? 6 : 9); i++) {
            const s = document.createElement('b');
            s.className = 'bt-crx-chip';
            const ang = -Math.PI * (0.08 + Math.random() * 0.84);
            const dist = 80 + Math.random() * 90;
            s.style.setProperty('--sz', String(0.8 + Math.random() * 0.9));
            s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
            s.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
            s.style.setProperty('--r', `${Math.round(Math.random() * 540 - 270)}deg`);
            fx.appendChild(s);
            s.addEventListener('animationend', () => s.remove(), { once: true });
        }
    }

    private onTap(profileId: string): void {
        if (!this.el) return;
        this.tapsLeft -= 1;
        const step = 3 - this.tapsLeft; // 1..3
        const box = this.el.querySelector<HTMLElement>('.bt-crx-box');
        box?.classList.remove('shake'); void box?.offsetWidth; box?.classList.add('shake');
        box?.style.setProperty('--glow', String(step / 3));
        box?.style.setProperty('--tapscale', String(1 + step * 0.07));
        this.el.querySelectorAll('.bt-crx-pips i').forEach((p, i) => p.classList.toggle('on', i < step));
        AudioSys.getInstance().playCrateTap(step - 1);
        if (this.tapsLeft > 0) {
            this.spawnSplinters();
            this.spawnSmoke('tap');
            return;
        }
        this.phase = 'bursting';
        const result = ProgressionService.openCrate(profileId);
        if (!result) { this.close(); this.onDone?.(); return; }

        const color = RARITY_COLOR[result.rarity];
        const stage = this.el.querySelector<HTMLElement>('.bt-crx-stage');
        stage?.style.setProperty('--rc', color);
        stage?.setAttribute('data-rarity', result.rarity);
        stage?.classList.add('is-open');
        const foot = this.el.querySelector<HTMLElement>('.bt-crx-foot');
        if (foot) foot.style.visibility = 'hidden';

        // Wieko odlatuje, korpus ZOSTAJE (otwarta skrzynia, z ktorej wypada nagroda).
        const img = box?.querySelector('img');
        if (img) img.src = CRATE_ART.body;
        box?.classList.add('is-open');
        const anchor = this.el.querySelector<HTMLElement>('.bt-crx-anchor');
        if (anchor) {
            const lid = document.createElement('img');
            lid.className = 'bt-crx-lid';
            lid.src = CRATE_ART.lid;
            lid.alt = '';
            anchor.appendChild(lid);
            const flash = document.createElement('div');
            flash.className = 'bt-crx-flash';
            flash.dataset.rarity = result.rarity;
            anchor.appendChild(flash);
        }

        AudioSys.getInstance().playCrateOpen();
        if (result.rarity === 'l') AudioSys.getInstance().playCrateLegendary();
        this.spawnDust(true, color, result.rarity);
        this.spawnSmoke('open');
        // Nagroda wylatuje ZARAZ po wieku (bez pustej przerwy 700 ms).
        this.later(() => this.renderReveal(result), reducedMotion() ? 0 : 260);
    }

    private renderReveal(r: CrateOpenResult): void {
        if (!this.el) return;
        this.phase = 'reveal';
        const color = RARITY_COLOR[r.rarity];
        const cosDef = r.cosmeticId ? getCosmetic(r.cosmeticId) : undefined;
        const big = window.innerHeight > 560 ? 96 : 54; // v0.232.0: playtest 3 — 2x, potem -25%
        const art = cosDef
            ? cosmeticArtHtml(cosDef, big)
            : `<span class="bt-crx-dupart" style="width:${Math.round(big * 1.25)}px;height:${big}px;">
                   <img src="${SIGMA_ART}" alt=""><img src="${SIGMA_ART}" alt=""><img src="${SIGMA_ART}" alt="">
               </span>`;
        // Podpis INFORMUJE o wygranej (Mariusz): duza KATEGORIA ("RAMKA AWATARA") + nazwa.
        const caption = cosDef
            ? `<em>${t(CATEGORY_LABEL_ONE[cosDef.type])}</em><b style="${cosDef.type === 'nickColor' ? nickColorStyle(cosDef) : ''}">${t(cosDef.labelKey)}</b>`
            : `<em>${t('crate.dup')}</em>`;
        const reward = this.el.querySelector<HTMLElement>('.bt-crx-reward');
        if (!reward) return;
        reward.style.setProperty('--rc', color);
        reward.innerHTML = `
            <div class="bt-crx-rarity" data-rarity="${r.rarity}"><span>${t(RARITY_LABEL_KEY[r.rarity])}</span></div>
            <div class="bt-crx-item" data-rarity="${r.rarity}">
                <span class="bt-crx-card"><i class="shine" aria-hidden="true"></i>${art}</span>
            </div>
            <div class="bt-crx-caption">${caption}</div>
            <div class="bt-crx-bolts"><img src="${SIGMA_ART}" alt=""> +<span data-bolts>0</span> ${t('crate.bolts')}</div>
            <button class="bt-hub0-play bt-crx-done" data-action="done" type="button">${t('common.close')}</button>`;
        // Promienie ("parasol") ZA skrzynia: wstawiane do kotwicy pod korpus (Mariusz).
        const anchor = this.el.querySelector<HTMLElement>('.bt-crx-anchor');
        if (anchor && !anchor.querySelector('.bt-crx-itemrays')) {
            const rays = document.createElement('i');
            rays.className = 'bt-crx-itemrays';
            rays.style.setProperty('--rc', color);
            anchor.prepend(rays);
        }
        paintCrosshairPreviews(reward);
        this.spawnCoins(r);
        const boltsEl = reward.querySelector<HTMLElement>('[data-bolts]');
        if (boltsEl) this.later(() => countUp(boltsEl, 0, r.bolts, 900), reducedMotion() ? 0 : 500);
    }

    /**
     * MONETY SIGM wystrzelone ze skrzyni — DUZO, laduja na stole w roznych pozycjach i ZOSTAJA
     * (lezace = splaszczone scaleY). Tylko transform/opacity; sufit 22 (telefon 14).
     */
    private spawnCoins(r: CrateOpenResult): void {
        if (reducedMotion()) return;
        const fx = this.el?.querySelector<HTMLElement>('.bt-crx-coins');
        if (!fx) return;
        const bonus = { c: 0, r: 2, e: 4, l: 6 }[r.rarity];
        const n = (this.lite ? 20 : 32) + bonus * 2; // v0.232.0: 2x wiecej (Mariusz); tylko transform
        const tableHalf = (this.el?.querySelector<HTMLElement>('.bt-crx-table')?.offsetWidth ?? 500) * 0.44;
        const crateHalf = (this.el?.querySelector<HTMLElement>('.bt-crx-box')?.offsetWidth ?? 270) * 0.5;
        for (let i = 0; i < n; i++) {
            const c = document.createElement('img');
            c.className = 'bt-crx-coin';
            c.src = SIGMA_ART;
            c.alt = '';
            const side = i % 2 ? 1 : -1;
            const dx = side * (crateHalf + 8 + Math.random() * Math.max(20, tableHalf - crateHalf - 8));
            c.style.setProperty('--dx', `${dx}px`);
            c.style.setProperty('--dy', `${Math.round(-10 + Math.random() * 34)}px`);
            c.style.setProperty('--peak', `${-(150 + Math.random() * 130)}px`);
            c.style.setProperty('--rz', `${Math.round(Math.random() * 720 - 360)}deg`);
            c.style.setProperty('--sy', String(0.72 + Math.random() * 0.25)); // lekko pochylone, nie nalesniki
            c.style.animationDelay = `${60 + i * 40}ms`;
            fx.appendChild(c);
        }
    }

    private showPools(): void {
        if (!this.el) return;
        const rows = (['l', 'e', 'r', 'c'] as Rarity[]).map(rr => `
            <div class="bt-hub0-rankrow">
                <span class="pos" style="color:${RARITY_COLOR[rr]};">●</span>
                <span class="who">${t(RARITY_LABEL_KEY[rr])}</span>
                <span class="pts">${CRATE_RARITY_WEIGHTS[rr]}%</span>
            </div>`).join('');
        this.clearTimers();
        this.el.innerHTML = `
            <div class="bt-hub0-modal" role="dialog" aria-modal="true">
                <button class="bt-hub0-modal-close" data-action="back" type="button" aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-hub0-modal-title">${t('crate.pools')}</h3>
                <div class="bt-hub0-ranklist">${rows}</div>
            </div>`;
        // Bez re-wire — delegat obsluguje `data-action="back"`. Faza wychodzi z `tapping`.
        this.phase = 'reveal';
    }

    private clearTimers(): void {
        for (const id of this.timers) window.clearTimeout(id);
        this.timers = [];
    }

    close(): void {
        this.clearTimers();
        this.el?.remove();
        this.el = null;
        AudioSys.getInstance().unduckMusic(); // v0.208.0
    }
}
