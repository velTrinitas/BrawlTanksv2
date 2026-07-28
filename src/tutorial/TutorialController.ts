import { t } from '../i18n/i18n';

/**
 * TutorialController — silnik onboardingu nowego gracza (FAZA A).
 *
 * Wizja (docs/PROMPT_Tutorial_FAZA_A.md): gracz uczy sie BAWIAC — jeden czasownik
 * naraz, gating (gra czeka az akcja naprawde wykonana), zero sciany tekstu. Overlay
 * to DOM (nie PIXI) — menu/kontrolki i tak sa DOM, strzalka celuje w strefe joysticka
 * w screen-space (zero matematyki zoom 0.6 / uiScale 0.7).
 *
 * FAZA A: silnik + JEDEN krok "RUSZAJ" (gate = gracz ruszyl). Kolejne kroki + karty
 * celu = nastepne fazy.
 *
 * v0.78 (uwagi Mariusza): tytul+hint+badge+POMIN w JEDNEJ karcie (slate-szare tlo z
 * poswiata — nie zlewa sie z gra). POMIN wewnatrz karty (UI/UX: kontrolka nalezy do
 * widgetu samouczka, wiec NIE koliduje z HUD/joystickami/super-panelem na zadnej
 * platformie). Desktop: karta +20% (wieksze fonty/padding), wieksze emoji.
 *
 * Uwaga i18n: `t()` musi byc LITERALNE (dynamiczne t(zmienna) sie nie kompiluje).
 */

export interface TutorialOpts {
    isTouch: boolean;
    isMoving: () => boolean;
    onDone: () => void;
}

interface Step { title: string; hint: string; isDone: () => boolean; }

const GOLD = '#ffd24a';

export class TutorialController {
    private readonly opts: TutorialOpts;
    private readonly steps: Step[];
    private idx = 0;
    private finished = false;
    private rafId = 0;
    private confirmUntil = 0;

    private root!: HTMLDivElement;
    private badgeTextEl!: HTMLSpanElement;
    private titleEl!: HTMLDivElement;
    private hintEl!: HTMLDivElement;
    private ringEl!: HTMLDivElement;
    private arrowEl!: HTMLDivElement;

    constructor(opts: TutorialOpts) {
        this.opts = opts;
        this.steps = [{
            title: t('tutorial.move.title'),
            hint: opts.isTouch ? t('tutorial.move.hintTouch') : t('tutorial.move.hintDesktop'),
            isDone: () => opts.isMoving(),
        }];
        this.buildDom();
        this.showStep();
        this.tick = this.tick.bind(this);
        this.rafId = requestAnimationFrame(this.tick);
    }

    private buildDom(): void {
        if (!document.getElementById('bt-tutorial-style')) {
            const st = document.createElement('style');
            st.id = 'bt-tutorial-style';
            st.textContent =
                '@keyframes bt-tut-pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.3);opacity:1}}' +
                '@keyframes bt-tut-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(12px)}}' +
                '@keyframes bt-tut-pop{0%{transform:translateX(-50%) scale(.72);opacity:0}60%{transform:translateX(-50%) scale(1.05);opacity:1}100%{transform:translateX(-50%) scale(1);opacity:1}}' +
                '.bt-tut-skip:hover{background:rgba(255,255,255,.18)!important;border-color:rgba(255,255,255,.55)!important;color:#fff!important}';
            document.head.appendChild(st);
        }

        const desk = !this.opts.isTouch; // desktop = karta +20% (fonty/padding) + wieksze emoji

        const root = document.createElement('div');
        root.id = 'bt-tutorial-root';
        // pointer-events:none => klik/dotyk przechodzi do gry pod spodem; tylko POMIN lapie.
        root.style.cssText = 'position:fixed;inset:0;z-index:60;pointer-events:none;font-family:"Titan One",cursive;user-select:none';

        // ── KARTA: badge + tytul + hint + separator + POMIN (jeden panel, slate-szare tlo) ──
        const card = document.createElement('div');
        card.style.cssText =
            'position:absolute;left:50%;top:' + (desk ? '13%' : '15%') + ';transform:translateX(-50%);max-width:88vw;' +
            'padding:' + (desk ? '20px 46px 20px' : '13px 28px 16px') + ';border-radius:20px;' +
            'background:linear-gradient(180deg,rgba(60,64,86,.95),rgba(30,33,46,.95));' +
            'border:3px solid rgba(255,210,74,.7);' +
            'box-shadow:0 12px 36px rgba(0,0,0,.55),0 0 0 4px rgba(255,210,74,.10),inset 0 1px 0 rgba(255,255,255,.10);' +
            'text-align:center;animation:bt-tut-pop .38s cubic-bezier(.2,.9,.3,1.2)';

        // badge: [emoji wieksze] SAMOUCZEK · Krok X
        const badge = document.createElement('div');
        badge.style.cssText =
            'display:inline-flex;align-items:center;gap:7px;background:rgba(255,210,74,.16);color:' + GOLD + ';' +
            'border:1.5px solid rgba(255,210,74,.55);border-radius:999px;' +
            'padding:' + (desk ? '5px 18px' : '4px 14px') + ';font-size:' + (desk ? 'clamp(15px,1.4vw,20px)' : 'clamp(11px,2.6vw,15px)') + ';' +
            'letter-spacing:.5px;margin-bottom:' + (desk ? '12px' : '9px') + ';';
        const emoji = document.createElement('span');
        emoji.textContent = '\u{1F393}'; // 🎓
        emoji.style.cssText = 'font-size:1.55em;line-height:1';
        const badgeText = document.createElement('span');
        badge.append(emoji, badgeText);

        const title = document.createElement('div');
        title.style.cssText = 'color:' + GOLD + ';font-size:' + (desk ? 'clamp(42px,4vw,66px)' : 'clamp(28px,7vw,50px)') + ';line-height:1.05;text-shadow:0 3px 0 #000,0 0 22px rgba(255,180,40,.6)';

        const hint = document.createElement('div');
        hint.style.cssText = 'color:#e9edf8;font-size:' + (desk ? 'clamp(17px,1.6vw,24px)' : 'clamp(12px,3vw,18px)') + ';font-family:system-ui,sans-serif;font-weight:700;margin-top:' + (desk ? '10px' : '8px') + ';text-shadow:0 2px 0 rgba(0,0,0,.6)';

        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:rgba(255,255,255,.15);margin:' + (desk ? '16px -22px 12px' : '12px -14px 10px');

        const skip = document.createElement('button');
        skip.className = 'bt-tut-skip';
        skip.textContent = t('tutorial.skip') + ' ▸'; // ▸
        skip.style.cssText =
            'pointer-events:auto;background:rgba(255,255,255,.09);color:#cfd4e2;border:1.5px solid rgba(255,255,255,.3);' +
            'border-radius:10px;padding:' + (desk ? '9px 24px' : '7px 18px') + ';font-family:"Titan One",cursive;' +
            'font-size:' + (desk ? 'clamp(14px,1.4vw,18px)' : 'clamp(12px,2.6vw,16px)') + ';letter-spacing:.4px;cursor:pointer;transition:background .15s,border-color .15s,color .15s';
        skip.onclick = () => this.finish();

        card.append(badge, title, hint, sep, skip);

        // ── ring + strzalka celuja w strefe lewego floating-joysticka (tylko dotyk) ──
        const ring = document.createElement('div');
        ring.style.cssText = 'position:absolute;left:16%;top:70%;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;border:5px solid #5fe0e8;box-shadow:0 0 22px rgba(95,224,232,.7);animation:bt-tut-pulse 1s ease-in-out infinite';
        const arrow = document.createElement('div');
        arrow.textContent = '\u{1F447}'; // 👇
        arrow.style.cssText = 'position:absolute;left:16%;top:70%;margin:-118px 0 0 -22px;font-size:42px;animation:bt-tut-bob .9s ease-in-out infinite';

        root.append(card, ring, arrow);
        document.body.appendChild(root);
        this.root = root; this.badgeTextEl = badgeText; this.titleEl = title; this.hintEl = hint; this.ringEl = ring; this.arrowEl = arrow;
    }

    private showStep(): void {
        const s = this.steps[this.idx];
        this.badgeTextEl.textContent = t('tutorial.badge', { step: String(this.idx + 1) });
        this.titleEl.textContent = s.title;
        this.titleEl.style.color = GOLD;
        this.hintEl.textContent = s.hint;
        this.hintEl.style.display = '';
        const disp = this.opts.isTouch ? '' : 'none'; // cel wizualny (ring/strzalka) tylko na dotyku
        this.ringEl.style.display = disp;
        this.arrowEl.style.display = disp;
    }

    private tick(): void {
        if (this.finished) return;
        const now = performance.now();

        if (this.confirmUntil > 0) {
            if (now >= this.confirmUntil) {
                this.confirmUntil = 0;
                this.idx++;
                if (this.idx >= this.steps.length) { this.finish(); return; }
                this.showStep();
            }
            this.rafId = requestAnimationFrame(this.tick);
            return;
        }

        if (this.steps[this.idx].isDone()) {
            // confirm juice: zielone "SWIETNIE!" w karcie + krotka pauza -> nastepny krok / koniec
            this.titleEl.textContent = t('tutorial.done');
            this.titleEl.style.color = '#5effa0';
            this.hintEl.style.display = 'none';
            this.ringEl.style.display = 'none';
            this.arrowEl.style.display = 'none';
            this.confirmUntil = now + 750;
        }
        this.rafId = requestAnimationFrame(this.tick);
    }

    private finish(): void {
        if (this.finished) return;
        this.finished = true;
        cancelAnimationFrame(this.rafId);
        if (this.root.parentElement) this.root.parentElement.removeChild(this.root);
        this.opts.onDone();
    }

    /** Awaryjne sprzatniecie (np. gdy mecz konczy sie w trakcie). */
    public destroy(): void { this.finish(); }
}
