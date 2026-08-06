import { t } from '../i18n/i18n';

/**
 * TutorialController — silnik onboardingu nowego gracza.
 *
 * Wizja (docs/PROMPT_Tutorial_FAZA_A.md): gracz uczy sie BAWIAC — jeden czasownik naraz,
 * gating (gra czeka az akcja naprawde wykonana), zero sciany tekstu. Overlay to DOM (nie PIXI).
 *
 * FAZA A: krok RUSZAJ. FAZA B: STRZELAJ, FALA, GEMY, SUPER STRZAL, GOTOWY (wybor).
 * FAZA B3-UX (auto-minimize, market best practice — onboarding NIE zaslania pola akcji):
 * karta pokazuje sie w centrum, po EXPAND_MS ZWIJA sie do pilla (gora-srodek) odslaniajac ekran;
 * spawn/zadanie startuje DOPIERO na zwinieciu (wrog pojawia sie gdy karta znika z drogi). Tap w pill
 * = rozwin (doczytaj). Po wykonaniu polecenia karta wraca do centrum ("SWIETNIE") -> nastepny krok.
 * GOTOWY (finalny wybor) zostaje rozwiniety — to decyzja, nie zadanie w tle.
 *
 * Uwaga i18n: `t()` musi byc LITERALNE (dynamiczne t(zmienna) sie nie kompiluje).
 */

export interface TutorialOpts {
    isTouch: boolean;
    isMoving: () => boolean;
    spawnDummy: () => void;     // FAZA B: krok STRZELAJ — spawn 1 manekina
    spawnWave: () => void;      // FAZA B: krok FALA — spawn grupy
    enemiesAlive: () => number; // FAZA B: gate walki (0 = cel/fala zniszczone)
    spawnGems: () => void;      // FAZA B2: krok GEMY — spawn klastra gemow
    superEarned: () => boolean; // FAZA B2: gate GEMY (zdobyto ladunek super)
    armSuperShot: () => void;   // FAZA B2: krok SUPER SHOT — gwarantuj ladunek + cel
    superShotFired: () => boolean; // FAZA B2: gate SUPER SHOT (super odpalony)
    superPillRect: () => { x: number; y: number; w: number; h: number }; // FAZA B2: rect paska SUPER (screen-px)
    topUpGems: () => void;       // FAZA B2: watchdog GEMY — dosyp gemow gdy wygasly (anty soft-lock)
    armSuperPower: () => void;   // SUPER POWER: gwarantuj gotowosc mocy + cele
    superPowerUsed: () => boolean; // SUPER POWER: gate (moc aktywowana)
    onDone: (continuePlaying: boolean) => void; // FAZA B2: finalny wybor gracza (graj dalej / menu)
}

interface Step {
    title: string;
    hint: string;
    isDone: () => boolean;
    onEnter?: () => void;        // FAZA B: efekt wejscia w krok (spawn); FAZA B3-UX: odpalany na ZWINIECIU
    onActive?: () => void;       // watchdog: co klatke gdy krok aktywny (zwiniety, gate niezaliczony)
    showJoystickRing?: boolean;  // DOM-ring na strefie lewego joysticka (tylko RUSZAJ na dotyku)
    highlight?: () => { x: number; y: number; w: number; h: number }; // FAZA B2: podswietlany element HUD (screen-px)
    ringSelector?: string;       // SUPER POWER: ring na przycisku HUD (np. .bt-super-button) via getBoundingClientRect
    isFinalChoice?: boolean;     // FAZA B2: ostatni krok — karta wyboru (graj dalej / menu), bez gate/zwijania
    isInfo?: boolean;            // KARTA INFO: rozpoznawcza (ikona + 1 linijka + DALEJ), bez gate/zadania/zwijania
    icon?: string;               // KARTA INFO: duza ikona (emoji) nad tytulem
    badgeOverride?: string;      // nadpisz tekst badge (np. "DOBRZE WIEDZIEC" dla INFO)
}

const GOLD = '#ffd24a';
const EXPAND_MS = 3000; // FAZA B3-UX: ile pelna karta stoi w centrum, zanim zwinie sie do pilla (czas na przeczytanie)

export class TutorialController {
    private readonly opts: TutorialOpts;
    private readonly steps: Step[];
    private idx = 0;
    private finished = false;
    private rafId = 0;
    private confirmUntil = 0;
    private collapseAt = 0;      // FAZA B3-UX: kiedy auto-zwinac karte do pilla (0 = brak timera)
    private collapsed = false;   // FAZA B3-UX: czy karta jest zwinieta do pilla
    private pendingEnter: (() => void) | null = null; // onEnter odpalany DOPIERO na zwinieciu
    private taskTotal = 0;       // liczba krokow ZADANIOWYCH (do pilla "Krok X/N"; info/final nie licza sie)

    private root!: HTMLDivElement;
    private cardEl!: HTMLDivElement;
    private pillEl!: HTMLDivElement;
    private pillTextEl!: HTMLSpanElement;
    private badgeTextEl!: HTMLSpanElement;
    private titleEl!: HTMLDivElement;
    private hintEl!: HTMLDivElement;
    private ringEl!: HTMLDivElement;
    private arrowEl!: HTMLDivElement;
    private hlEl!: HTMLDivElement;
    private btnRingEl!: HTMLDivElement; // SUPER POWER: ring na przycisku HUD (getBoundingClientRect)
    private iconEl!: HTMLDivElement;    // KARTA INFO: duza ikona
    private skipEl!: HTMLButtonElement;
    private nextEl!: HTMLButtonElement; // KARTA INFO: przycisk DALEJ
    private choiceEl!: HTMLDivElement;

    constructor(opts: TutorialOpts) {
        this.opts = opts;
        this.steps = [
            {   // 1 — RUSZAJ (ruch lewym joystickiem / WASD)
                title: t('tutorial.move.title'),
                hint: opts.isTouch ? t('tutorial.move.hintTouch') : t('tutorial.move.hintDesktop'),
                isDone: () => opts.isMoving(),
                showJoystickRing: true,
            },
            {   // 2 — STRZELAJ (manekin w swiecie, ring celuje z main.ts)
                title: t('tutorial.shoot.title'),
                hint: opts.isTouch ? t('tutorial.shoot.hintTouch') : t('tutorial.shoot.hintDesktop'),
                onEnter: () => opts.spawnDummy(),
                isDone: () => opts.enemiesAlive() === 0,
            },
            {   // 3 — FALA (grupa wrogow)
                title: t('tutorial.wave.title'),
                hint: opts.isTouch ? t('tutorial.wave.hintTouch') : t('tutorial.wave.hintDesktop'),
                onEnter: () => opts.spawnWave(),
                isDone: () => opts.enemiesAlive() === 0,
            },
            {   // 4 — GEMY (highlight paska SUPER w HUD; gemy laduja super)
                title: t('tutorial.gems.title'),
                hint: opts.isTouch ? t('tutorial.gems.hintTouch') : t('tutorial.gems.hintDesktop'),
                onEnter: () => opts.spawnGems(),
                onActive: () => opts.topUpGems(), // dosyp gemow jesli wygasly zanim gracz naladowal super
                isDone: () => opts.superEarned(),
                highlight: () => opts.superPillRect(),
            },
            {   // 5 — SUPER SHOT (masz mega-strzal; zmieć cel — super auto-odpala sie przy strzale)
                title: t('tutorial.super.title'),
                hint: opts.isTouch ? t('tutorial.super.hintTouch') : t('tutorial.super.hintDesktop'),
                onEnter: () => opts.armSuperShot(),
                isDone: () => opts.superShotFired(),
            },
            {   // 6 — SUPER MOC (moc specjalna: aktywuj; przytrzymaj = zmien; ring na przycisku SUPER)
                title: t('tutorial.power.title'),
                hint: opts.isTouch ? t('tutorial.power.hintTouch') : t('tutorial.power.hintDesktop'),
                onEnter: () => opts.armSuperPower(),
                isDone: () => opts.superPowerUsed(),
                // F7a: dwa przyciski slotow — samouczek podswietla JEDNOZNACZNIE slot 1
                // (querySelector na '.bt-super-button' zlapalby pierwszy w DOM = kruche).
                ringSelector: '.bt-super-button--slot1',
            },
            // Przedmioty/strefy (serce/magnes/kostka/medi-pad/power-pad) uczone teraz JUST-IN-TIME
            // w meczu (ItemHints), nie kartami tutorialu — decyzja Mariusza + best practice.
            {   // 7 — GOTOWY (finalny wybor: graj dalej / powrot do menu; NIE zwija sie)
                title: t('tutorial.finish.title'),
                hint: t('tutorial.finish.hint'),
                isDone: () => false, // gate nieuzywany — czeka na klik wyboru
                isFinalChoice: true,
                badgeOverride: t('tutorial.finishBadge'),
            },
        ];
        this.taskTotal = this.steps.filter(s => !s.isInfo && !s.isFinalChoice).length;
        this.buildDom();
        this.tick = this.tick.bind(this);
        this.showStep();
        this.rafId = requestAnimationFrame(this.tick);
    }

    private buildDom(): void {
        if (!document.getElementById('bt-tutorial-style')) {
            const st = document.createElement('style');
            st.id = 'bt-tutorial-style';
            st.textContent =
                '@keyframes bt-tut-pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.3);opacity:1}}' +
                '@keyframes bt-tut-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(12px)}}' +
                '@keyframes bt-tut-pop{0%{opacity:0;transform:translateX(-50%) scale(.72)}60%{opacity:1;transform:translateX(-50%) scale(1.05)}100%{opacity:1;transform:translateX(-50%) scale(1)}}' +
                '@keyframes bt-tut-hl{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}' +
                // FAZA B3-UX: karta zwija/rozwija sie (transition na transform+opacity); pill pojawia sie u gory.
                '#bt-tutorial-root .bt-card{transition:opacity .3s ease,transform .32s cubic-bezier(.2,.9,.3,1.2)}' +
                '#bt-tutorial-root .bt-card.bt-min{opacity:0;transform:translateX(-50%) scale(.82) translateY(-26px);pointer-events:none}' +
                '#bt-tutorial-root .bt-pill{transition:opacity .28s ease,transform .28s cubic-bezier(.2,.9,.3,1.3);opacity:0;transform:translateX(-50%) scale(.8);pointer-events:none}' +
                '#bt-tutorial-root .bt-pill.bt-show{opacity:1;transform:translateX(-50%) scale(1);pointer-events:auto}' +
                '.bt-tut-skip:hover{background:rgba(255,255,255,.18)!important;border-color:rgba(255,255,255,.55)!important;color:#fff!important}' +
                '.bt-tut-pill:hover{border-color:rgba(255,210,74,1)!important}';
            document.head.appendChild(st);
        }

        const desk = !this.opts.isTouch; // desktop = karta +20% (fonty/padding) + wieksze emoji

        const root = document.createElement('div');
        root.id = 'bt-tutorial-root';
        // pointer-events:none => klik/dotyk przechodzi do gry pod spodem; tylko POMIN / pill / wybor lapia.
        root.style.cssText = 'position:fixed;inset:0;z-index:60;pointer-events:none;font-family:"Titan One",cursive;user-select:none';

        // ── KARTA (pelna): badge + tytul + hint + separator + POMIN/wybor (slate-szare tlo) ──
        const card = document.createElement('div');
        card.className = 'bt-card';
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

        // KARTA INFO: duza ikona (emoji) nad tytulem — ukryta domyslnie, pokazywana per krok.
        const icon = document.createElement('div');
        icon.style.cssText = 'display:none;font-size:' + (desk ? 'clamp(56px,6vw,88px)' : 'clamp(44px,11vw,72px)') + ';line-height:1;margin:2px 0 6px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))';

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
        skip.onclick = () => this.finish(true); // POMIN = wskocz od razu do gry

        // ── FAZA B2: karta finalnego wyboru (GOTOWY) — GRAJ DALEJ / MENU ──
        const choice = document.createElement('div');
        choice.style.cssText = 'display:none;gap:' + (desk ? '14px' : '10px') + ';justify-content:center;flex-wrap:wrap';
        const btnPad = desk ? '11px 30px' : '9px 22px';
        const btnFont = desk ? 'clamp(15px,1.5vw,20px)' : 'clamp(13px,2.8vw,17px)';
        const playBtn = document.createElement('button');
        playBtn.textContent = '▶ ' + t('tutorial.finish.play');
        playBtn.style.cssText =
            'pointer-events:auto;background:' + GOLD + ';color:#3a2c00;border:none;border-radius:12px;' +
            'padding:' + btnPad + ';font-family:"Titan One",cursive;font-size:' + btnFont + ';letter-spacing:.4px;' +
            'cursor:pointer;box-shadow:0 5px 0 #b8860b,0 8px 14px rgba(0,0,0,.4);transition:transform .1s';
        playBtn.onpointerdown = () => { playBtn.style.transform = 'translateY(3px)'; };
        playBtn.onpointerup = playBtn.onpointerleave = () => { playBtn.style.transform = ''; };
        playBtn.onclick = () => this.finish(true);
        const menuBtn = document.createElement('button');
        menuBtn.className = 'bt-tut-skip';
        menuBtn.textContent = '☰ ' + t('tutorial.finish.menu');
        menuBtn.style.cssText =
            'pointer-events:auto;background:rgba(255,255,255,.09);color:#cfd4e2;border:1.5px solid rgba(255,255,255,.3);' +
            'border-radius:12px;padding:' + btnPad + ';font-family:"Titan One",cursive;font-size:' + btnFont + ';' +
            'letter-spacing:.4px;cursor:pointer;transition:background .15s,border-color .15s,color .15s';
        menuBtn.onclick = () => this.finish(false);
        choice.append(playBtn, menuBtn);

        // KARTA INFO: przycisk DALEJ (przejdz do nastepnego kroku) — zlota, jak GRAJ DALEJ.
        const nextBtn = document.createElement('button');
        nextBtn.textContent = t('tutorial.next') + ' ▸';
        nextBtn.style.cssText =
            'display:none;pointer-events:auto;background:' + GOLD + ';color:#3a2c00;border:none;border-radius:12px;' +
            'padding:' + (desk ? '11px 34px' : '9px 26px') + ';font-family:"Titan One",cursive;' +
            'font-size:' + (desk ? 'clamp(15px,1.5vw,20px)' : 'clamp(13px,2.8vw,17px)') + ';letter-spacing:.4px;cursor:pointer;' +
            'box-shadow:0 5px 0 #b8860b,0 8px 14px rgba(0,0,0,.4);transition:transform .1s';
        nextBtn.onpointerdown = () => { nextBtn.style.transform = 'translateY(3px)'; };
        nextBtn.onpointerup = nextBtn.onpointerleave = () => { nextBtn.style.transform = ''; };
        nextBtn.onclick = () => this.advance();

        card.append(badge, icon, title, hint, sep, skip, choice, nextBtn);

        // ── FAZA B3-UX: PILL postepu (gora-srodek) — pokazywany po zwinieciu karty; tap = rozwin ──
        const pill = document.createElement('div');
        pill.className = 'bt-pill bt-tut-pill';
        // top obnizony o 25px (pill nie zaslania SCORE na HUD); mocny zloty kontur + poswiata = lepsza widocznosc.
        pill.style.cssText =
            'position:absolute;left:50%;top:calc(' + (desk ? '3%' : '2.5%') + ' + 35px);display:inline-flex;align-items:center;gap:9px;' +
            'pointer-events:auto;cursor:pointer;white-space:nowrap;' +
            'background:linear-gradient(180deg,rgba(52,56,78,.98),rgba(26,29,42,.98));' +
            'border:3px solid ' + GOLD + ';border-radius:999px;' +
            'padding:' + (desk ? '7px 22px 7px 9px' : '6px 16px 6px 7px') + ';' +
            'box-shadow:0 6px 20px rgba(0,0,0,.55),0 0 16px rgba(255,210,74,.45),0 0 0 4px rgba(255,210,74,.16);transition:box-shadow .15s,border-color .15s';
        const pillEmoji = document.createElement('span');
        pillEmoji.textContent = '\u{1F393}'; // 🎓 — w zlotym kolku (nie zlewa sie z ciemnym tlem pilla)
        pillEmoji.style.cssText =
            'display:flex;align-items:center;justify-content:center;width:' + (desk ? '30px' : '24px') + ';height:' + (desk ? '30px' : '24px') + ';' +
            'border-radius:50%;background:' + GOLD + ';font-size:' + (desk ? '17px' : '13px') + ';line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.45)';
        const pillText = document.createElement('span');
        pillText.style.cssText = 'color:' + GOLD + ';font-family:"Titan One",cursive;font-size:' + (desk ? 'clamp(15px,1.4vw,20px)' : 'clamp(12px,2.6vw,16px)') + ';letter-spacing:.4px;text-shadow:0 1px 2px rgba(0,0,0,.6)';
        pill.append(pillEmoji, pillText);
        pill.onclick = () => { if (this.collapsed) this.expand(); }; // tap w pill = rozwin (doczytaj)

        // ── ring + strzalka celuja w strefe lewego floating-joysticka (tylko dotyk) ──
        const ring = document.createElement('div');
        ring.style.cssText = 'position:absolute;left:16%;top:70%;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;border:5px solid #5fe0e8;box-shadow:0 0 22px rgba(95,224,232,.7);animation:bt-tut-pulse 1s ease-in-out infinite';
        const arrow = document.createElement('div');
        arrow.textContent = '\u{1F447}'; // 👇
        arrow.style.cssText = 'position:absolute;left:16%;top:70%;margin:-118px 0 0 -22px;font-size:42px;animation:bt-tut-bob .9s ease-in-out infinite';

        // ── FAZA B2: podswietlenie paska SUPER w HUD (screen-px, pulsujaca zlota ramka) ──
        const hl = document.createElement('div');
        hl.style.cssText = 'position:absolute;display:none;border-radius:14px;border:4px solid ' + GOLD + ';box-shadow:0 0 20px rgba(255,210,74,.9),inset 0 0 14px rgba(255,210,74,.5);animation:bt-tut-hl 1s ease-in-out infinite;pointer-events:none';

        // ── SUPER POWER: ring na przycisku HUD (np. SUPER) — pozycja z getBoundingClientRect ──
        const btnRing = document.createElement('div');
        btnRing.style.cssText = 'position:absolute;display:none;border-radius:50%;border:5px solid #5fe0e8;box-shadow:0 0 22px rgba(95,224,232,.75);animation:bt-tut-pulse 1s ease-in-out infinite;pointer-events:none';

        root.append(card, pill, ring, arrow, hl, btnRing);
        document.body.appendChild(root);
        this.root = root; this.cardEl = card; this.pillEl = pill; this.pillTextEl = pillText;
        this.badgeTextEl = badgeText; this.titleEl = title; this.hintEl = hint;
        this.ringEl = ring; this.arrowEl = arrow; this.hlEl = hl; this.btnRingEl = btnRing;
        this.iconEl = icon; this.skipEl = skip; this.nextEl = nextBtn; this.choiceEl = choice;
    }

    private showStep(): void {
        const s = this.steps[this.idx];
        const now = performance.now();
        const info = !!s.isInfo;
        const fin = !!s.isFinalChoice;

        this.badgeTextEl.textContent = s.badgeOverride ?? t('tutorial.badge', { step: String(this.idx + 1) });
        // duza ikona — tylko karty INFO
        if (s.icon) { this.iconEl.textContent = s.icon; this.iconEl.style.display = ''; }
        else { this.iconEl.style.display = 'none'; }
        this.titleEl.textContent = s.title;
        this.titleEl.style.color = GOLD;
        this.hintEl.textContent = s.hint;
        this.hintEl.style.display = '';
        // pill (wskaznik postepu ZADAN): "Krok X/N · SLOWO" — info/final nie pokazuja pilla.
        this.pillTextEl.textContent = t('tutorial.progress', { step: String(this.idx + 1), total: String(this.taskTotal) }) + ' · ' + s.title;

        // FAZA B3-UX: spawn/zadanie odlozone do ZWINIECIA karty; karty INFO nie maja zadania.
        this.pendingEnter = info ? null : (s.onEnter ?? null);

        // przyciski: INFO => DALEJ + POMIN; final => wybor (graj/menu); zadanie => POMIN.
        this.skipEl.style.display = fin ? 'none' : '';
        this.choiceEl.style.display = fin ? 'flex' : 'none';
        this.nextEl.style.display = info ? '' : 'none';

        // start rozwiniety; TYLKO krok zadaniowy zwinie sie po EXPAND_MS (INFO/final zostaja rozwiniete).
        this.expand();
        this.collapseAt = (fin || info) ? 0 : now + EXPAND_MS;

        // DOM ring/strzalka — tylko RUSZAJ na dotyku. STRZELAJ/FALA celuja ringiem w swiecie (main.ts).
        const showJoy = !!s.showJoystickRing && this.opts.isTouch;
        this.ringEl.style.display = showJoy ? '' : 'none';
        this.arrowEl.style.display = showJoy ? '' : 'none';
        // highlight elementu HUD (pasek SUPER) — stala pozycja w screen-px.
        const h = s.highlight?.();
        if (h) {
            this.hlEl.style.display = '';
            this.hlEl.style.left = (h.x - 5) + 'px';
            this.hlEl.style.top = (h.y - 5) + 'px';
            this.hlEl.style.width = (h.w + 10) + 'px';
            this.hlEl.style.height = (h.h + 10) + 'px';
        } else {
            this.hlEl.style.display = 'none';
        }
        // SUPER POWER: ring na przycisku HUD (np. .bt-super-button) — dokladna pozycja z rect.
        // Tylko dotyk (przyciski to kontrolki mobilne; desktop uczy sie ze SPACJI w hincie).
        const el = (s.ringSelector && this.opts.isTouch) ? document.querySelector(s.ringSelector) as HTMLElement | null : null;
        if (el) {
            const r = el.getBoundingClientRect();
            const d = Math.max(r.width, r.height) + 26; // srednica ringu (przycisk + margines)
            this.btnRingEl.style.display = '';
            this.btnRingEl.style.left = (r.left + r.width / 2 - d / 2) + 'px';
            this.btnRingEl.style.top = (r.top + r.height / 2 - d / 2) + 'px';
            this.btnRingEl.style.width = d + 'px';
            this.btnRingEl.style.height = d + 'px';
        } else {
            this.btnRingEl.style.display = 'none';
        }
    }

    /** FAZA B3-UX: zwin karte do pilla i odpal odlozone zadanie (spawn) — karta zeszla z drogi. */
    private collapse(): void {
        if (this.collapsed) return;
        this.collapsed = true;
        this.collapseAt = 0;
        this.cardEl.classList.add('bt-min');
        this.pillEl.classList.add('bt-show');
        if (this.pendingEnter) { const fn = this.pendingEnter; this.pendingEnter = null; fn(); }
    }

    /** FAZA B3-UX: rozwin karte z powrotem (tap w pill / po wykonaniu polecenia -> powrot do centrum). */
    private expand(): void {
        this.collapsed = false;
        this.cardEl.classList.remove('bt-min');
        this.pillEl.classList.remove('bt-show');
    }

    /** KARTA INFO: przejdz do nastepnego kroku (przycisk DALEJ — brak gate, brak confirm-juice). */
    private advance(): void {
        this.idx++;
        if (this.idx >= this.steps.length) { this.finish(true); return; }
        this.showStep();
    }

    private tick(): void {
        if (this.finished) return;
        const now = performance.now();

        // FAZA B3-UX: auto-zwiniecie karty do pilla po EXPAND_MS (odpala tez pendingEnter = spawn zadania).
        if (this.collapseAt && !this.collapsed && now >= this.collapseAt) this.collapse();

        if (this.confirmUntil > 0) {
            if (now >= this.confirmUntil) {
                this.confirmUntil = 0;
                this.idx++;
                if (this.idx >= this.steps.length) { this.finish(true); return; }
                this.showStep();
            }
            this.rafId = requestAnimationFrame(this.tick);
            return;
        }

        const s = this.steps[this.idx];
        // gate: finalny czeka na klik wyboru; zadaniowy dopiero gdy spawn juz sie wykonal (pendingEnter == null).
        if (!s.isFinalChoice && !this.pendingEnter) {
            if (s.isDone()) {
                // confirm juice: karta WRACA do centrum z zielonym "SWIETNIE!" -> krotka pauza -> nastepny krok
                this.expand();
                this.titleEl.textContent = t('tutorial.done');
                this.titleEl.style.color = '#5effa0';
                this.hintEl.style.display = 'none';
                this.ringEl.style.display = 'none';
                this.arrowEl.style.display = 'none';
                this.hlEl.style.display = 'none';
                this.btnRingEl.style.display = 'none';
                this.collapseAt = 0;
                this.confirmUntil = now + 750;
            } else {
                s.onActive?.(); // watchdog kroku aktywnego (np. dosyp gemow gdy wygasly w GEMY)
            }
        }
        this.rafId = requestAnimationFrame(this.tick);
    }

    private finish(continuePlaying: boolean): void {
        if (this.finished) return;
        this.finished = true;
        cancelAnimationFrame(this.rafId);
        if (this.root.parentElement) this.root.parentElement.removeChild(this.root);
        this.opts.onDone(continuePlaying);
    }

    /** Awaryjne sprzatniecie (np. gdy mecz konczy sie w trakcie) — wskocz do gry. */
    public destroy(): void { this.finish(true); }
}
