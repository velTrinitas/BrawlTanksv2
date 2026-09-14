import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { SpawnSystem } from '../systems/Spawn';
import type { PowerSystem } from '../systems/PowerSystem';
import { SPAWN_CONFIG } from '../config/enemies';
import { POWERS, DICE_EMOJI } from '../config/powers';
import { t as tr } from '../i18n/i18n';
import { crosshairStyle, DEFAULT_CROSSHAIR, type CrosshairId } from './crosshairs';

const GEMS_PER_SUPER_CHARGE_TRIGGER = 10;
const SUPER_TINT_HEX = '#c850ff';

/**
 * Globalna stala fontu dla wszystkich canvas-rendered HUD elements.
 * v0.27.0: Lilita One → Titan One (z polskim Latin Extended supportem).
 * Zmiana fontu w przyszlosci = 1 linia tutaj.
 */
const FONT_FAMILY = 'Titan One';
// v0.73.7 PERF (minor-GC): stala kolejnosc mocy — module-const zamiast alokacji tablicy co klatke w drawSuperPowerBar.
// (F7a: POWER_ORDER usuniety — pasek rysuje 2 sloty z powerSystem.loadout, nie stala liste 3 mocy)

/**
 * v0.46.0 HUD typography pass: jednolity rozmiar labeli pilli (HP/WYNIK/ZABICI/SUPER).
 * Bez bolda — Titan One to font jednowagowy, `bold` wymuszal faux-bold (chunky, niespojny
 * z naturalna waga liczb). Wszystkie labele = ten sam rozmiar/waga = spojny HUD.
 */
const HUD_LABEL_PX = 26;

/**
 * v0.140.0 — podpis chipu sezonowego. WLASNA stala, celowo mniejsza od HUD_LABEL_PX.
 * Chip ma 34 px wysokosci (pille HP/WYNIK/ZABICI maja 54), wiec ten sam podpis
 * co u sasiadow zjadal go w calosci i wygrywal z liczba, ktora jest tu trescia.
 */
const SEASON_LABEL_PX = 18;

interface HudNotif {
    text: string;
    color: string;
    timer: number;
    maxTimer: number;
}

/**
 * FAZA CTF F3 — dane CTF dla HUD, ustawiane per klatke przez main.ts.
 * null = scenariusz bez CTF (zero kosztu, wszystkie draw* wychodza natychmiast).
 */
export interface HudCtfInfo {
    flags: Array<{
        x: number;
        y: number;
        color: number;
        state: 'idle' | 'carried' | 'captured';
        name: string;
    }>;
    /** Srodek strefy domowej (world coords) — cel strzalki bazy. */
    hangarX: number;
    hangarY: number;
    carrying: boolean;
    carryColor: number;
    flagsCaptured: number;
    /** Transformacja world->screen dla strzalek krawedziowych. */
    cameraX: number;
    cameraY: number;
    zoom: number;
    /** v0.143.0 — ile sekund tarczy bazy zostalo (0 = tarcza nieaktywna). */
    shieldSecondsLeft: number;
}

/**
 * OBRON ZAMEK F5 — dane scenariusza Zamku dla HUD, ustawiane per klatke przez main.ts.
 * null = inny scenariusz (zero kosztu). Procenty 0..1, sekundy zaokraglone w gore.
 */
export interface HudCastleInfo {
    phase: 'tutorial' | 'intro' | 'combat' | 'build' | 'victory' | 'defeat';
    wave: number;
    wavesTotal: number;
    phaseSecondsLeft: number;
    wallPct: number;
    gatePct: number;
    gateDestroyed: boolean;
    gatesAlive: number;
    gatesTotal: number;
    wallsDestroyed: number;
    keepPct: number;
    respawnSecondsLeft: number;
    enemiesAlive: number;
    megaAlive: boolean;
    /** Aktywne lane'y (obozy, z ktorych wlasnie wyjezdzaja batche) — strzalki krawedziowe. */
    lanes: Array<{ wx: number; wy: number; label: string }>;
    /** Wylomy w murze / zniszczona brama — strzalki krawedziowe (pomaranczowe). */
    breaches: Array<{ wx: number; wy: number }>;
    /** P1: maszyny obleznicze — strzalki krawedziowe (zolte, etykieta = ikona roli). */
    machines: Array<{ wx: number; wy: number; label: string }>;
    /** P1: donzon krytyczny — czerwona winieta krawedzi. */
    keepAlarm: boolean;
    cameraX: number;
    cameraY: number;
    zoom: number;
}

/**
 * SAVE THE QUEEN Q2 — dane scenariusza Krolowej dla HUD, per klatke z main.ts.
 * null = inny scenariusz (zero kosztu). Zegar w ms, droga = sloty rozbite / 8.
 */
export interface HudQueenInfo {
    phase: 'calm' | 'siege' | 'panic' | 'rescued' | 'captured';
    remainingMs: number;
    pathBroken: number;
    pathTotal: number;
    pathFlash: boolean;
    keystoneDown: boolean;
    /** Krolowa (strzalka krawedziowa, gdy poza ekranem) */
    queen: { wx: number; wy: number };
    /** aktywne lane'y (telegraf) */
    lanes: Array<{ wx: number; wy: number; label: string }>;
    /** Q6: gracz niesie Zloty Klucz — odznaka przy zegarze */
    hasKey: boolean;
    cameraX: number;
    cameraY: number;
    zoom: number;
}

export interface MouseState {
    screenX: number;
    screenY: number;
}

export class HUD {
    private ctx: CanvasRenderingContext2D;
    public canvas: HTMLCanvasElement;
    public screenW: number;
    public screenH: number;
    private hudNotifs: HudNotif[] = [];
    
    public comboText: string = '';
    public comboTextTimer: number = 0;
    public megaBossAlertTimer: number = 0;
    public ctfEnrageTimer: number = 0; // FAZA F4.3 — baner "WROGOWIE WSCIEKLI!" (2. flaga)
    public ctfBreachTimer: number = 0; // v0.143.0 — baner "WROGOWIE WCHODZA!" (koniec tarczy bazy)

    // === v0.23.1: Mobile UI scaling + visibility flags ===
    /** Skala glownych pill HUD'a (gem, score, kills, HP). 0.7 = mobile, 1.0 = desktop. */
    public uiScale: number = 1.0;
    /** Czy rysowac crosshair (mouse cursor reticle). Set per-frame by main.ts:
     *  - Desktop: zawsze true
     *  - Mobile: true gdy aim joystick aktywny (palec na prawym sticku), false gdy puszczony
     */
    public showCrosshair: boolean = true;
    /** v0.23.1 hotfix: skala crosshair (1.5 na mobile dla lepszej czytelnosci). */
    public crosshairScale: number = 1.0;
    /**
     * SHOP-2 (v0.138.0): ktory wyglad celownika z rejestru `CROSSHAIR_STYLES`.
     * Ustawiane przy KAZDYM starcie meczu w `startGame()` z `equipped.crosshair`,
     * wiec zmiana w hubie wchodzi od nastepnego wejscia do gry.
     */
    public crosshairStyle: CrosshairId = DEFAULT_CROSSHAIR;
    /** Czy rysowac dolny SuperPowerBar (centered 3-icon bar). False na mobile (SuperButton zastepuje). */
    public showPowerBar: boolean = true;

    /**
     * SEASON KIT — licznik znajdziek sezonowych w TYM meczu, albo null gdy sezon
     * ich nie ma (Arena, roadmapa 2027). `null` znaczy "nie rysuj i nie rezerwuj
     * miejsca": chip zajmuje wiersz w prawej kolumnie, wiec gdyby zostawal przy
     * pustym sezonie, magnes i turbo byly by zepchniete bez powodu.
     */
    public seasonCount: number | null = null;

    /** FAZA CTF F3 — dane CTF (null poza scenariuszem ctf). Ustawiane per klatke z main.ts. */
    public ctfInfo: HudCtfInfo | null = null;
    /** OBRON ZAMEK F5 — dane Zamku (null poza scenariuszem castle). Ustawiane per klatke z main.ts. */
    public castleInfo: HudCastleInfo | null = null;
    /** SAVE THE QUEEN Q2 — dane Krolowej (null poza scenariuszem). Ustawiane per klatke z main.ts. */
    public queenInfo: HudQueenInfo | null = null;
    /** OBRON ZAMEK F5 — baner scenariusza (fala / wylom / brama / mega). Wzorzec ctfBreach. */
    public castleBannerTimer: number = 0;
    private castleBannerText: string = '';
    private castleBannerColor: string = '#f5a623';
    private castleBannerMax: number = 120;
    /** P0.10: kolejka banerow — "FALA ODPARTA" nie ginie pod "STAN PRZY MURZE" z tej samej klatki (max 3). */
    private castleBannerQueue: Array<{ text: string; color: string; frames: number; pulse: boolean }> = [];
    private castleBannerPulse: boolean = true;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.screenW = window.innerWidth;
        this.screenH = window.innerHeight;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    
    private resize(): void {
        this.screenW = window.innerWidth;
        this.screenH = window.innerHeight;
        this.canvas.width = this.screenW;
        this.canvas.height = this.screenH;
    }
    
    addNotif(text: string, color: string): void {
        if (this.hudNotifs.length >= 3) this.hudNotifs.shift();
        this.hudNotifs.push({ text, color, timer: 200, maxTimer: 200 });
    }
    
    triggerMegaBossAlert(): void {
        this.megaBossAlertTimer = 180;
    }

    /** FAZA F4.3 — odpal baner eskalacji CTF (2. flaga, bomby nadchodza). */
    triggerCtfEnrage(): void {
        this.ctfEnrageTimer = 150;
    }

    /**
     * v0.143.0 — tarcza bazy wygasla, wrogowie wjezdzaja do hangaru.
     * Krotszy niz enrage (120 kl.): to ostrzezenie, nie ceremonia — gracz musi zdazyc
     * zareagowac, a nie ogladac baner.
     */
    triggerCtfBreach(): void {
        this.ctfBreachTimer = 120;
    }

    /** OBRON ZAMEK F5 — glosny baner zdarzenia scenariusza (tekst + kolor + czas w klatkach). */
    triggerCastleBanner(text: string, color: string, frames: number = 120, pulse: boolean = true): void {
        if (this.castleBannerTimer > 0 && this.castleBannerText !== text) {
            if (this.castleBannerQueue.length < 3) this.castleBannerQueue.push({ text, color, frames, pulse });
            return;
        }
        this.castleBannerText = text;
        this.castleBannerColor = color;
        this.castleBannerPulse = pulse;
        this.castleBannerMax = frames;
        this.castleBannerTimer = frames;
    }

    // ── OBRON ZAMEK F5 — panele scenariusza (przestrzen skalowana uiScale) ──────

    /**
     * 3 pigulki MUR / ZAMEK / BRAMA + pigulka FALI. Kompaktowo w lewej kolumnie pod
     * pigulka SUPER (y=132) — @375px landscape z uiScale 0.7 to pas 172x66 px,
     * zajmuje slot, ktory KTB/CTF zostawiaja pusty (magnes/turbo ida prawa kolumna).
     */
    private drawCastlePanel(): void {
        const info = this.castleInfo;
        if (!info) return;
        const c = this.ctx;
        const px = 14, py = 132, PW = 186, ROW = 20, PAD = 6;
        const PH = PAD * 2 + ROW * 3;
        c.fillStyle = 'rgba(0,0,0,0.62)';
        c.beginPath(); c.roundRect(px, py, PW, PH, 12); c.fill();
        c.strokeStyle = 'rgba(224,181,60,0.55)';
        c.lineWidth = 2;
        c.beginPath(); c.roundRect(px, py, PW, PH, 12); c.stroke();

        const rows: Array<{ icon: string; label: string; pct: number; dead: boolean; critical: boolean }> = [
            // P0.7: licznik zniszczonych segmentow muru (np. MUR -2) — pasek sam tego nie pokazuje
            { icon: '🧱', label: info.wallsDestroyed > 0 ? `${tr('hud.castle.wall')} -${info.wallsDestroyed}` : tr('hud.castle.wall'), pct: info.wallPct, dead: false, critical: info.wallPct < 0.25 || info.wallsDestroyed > 0 },
            { icon: '🏰', label: tr('hud.castle.keep'), pct: info.keepPct, dead: false, critical: info.keepPct < 0.25 },
            // 4 bramy: pasek = najslabsza brama, etykieta z licznikiem calych (np. BRAMY 3/4)
            { icon: '🚪', label: `${tr('hud.castle.gate')} ${info.gatesAlive}/${info.gatesTotal}`, pct: info.gatePct, dead: info.gatesAlive === 0, critical: info.gatePct < 0.25 || info.gateDestroyed },
        ];
        const now = Date.now();
        c.textBaseline = 'middle';
        // P0.7: pasek startuje ZA najszersza etykieta (BRAMY 3/4, MUR -2) — bez nachodzenia
        c.font = `12px "${FONT_FAMILY}",cursive`;
        let labelW = 64;
        for (const r of rows) labelW = Math.max(labelW, c.measureText(`${r.icon} ${r.label}`).width);
        const bx = px + 8 + labelW + 6, bw = PW - (bx - px) - 8, bh = 9;
        rows.forEach((r, i) => {
            const y = py + PAD + i * ROW + ROW / 2;
            c.font = `12px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'left';
            c.fillStyle = '#fff';
            c.fillText(`${r.icon} ${r.label}`, px + 8, y);
            c.fillStyle = 'rgba(255,255,255,0.10)';
            c.beginPath(); c.roundRect(bx, y - bh / 2, bw, bh, bh / 2); c.fill();
            if (r.dead) {
                const pulse = 0.55 + Math.sin(now / 120) * 0.45;
                c.save(); c.globalAlpha = pulse;
                c.font = `11px "${FONT_FAMILY}",cursive`;
                c.textAlign = 'center';
                c.fillStyle = '#ff5a5a';
                c.fillText(tr('hud.castle.gateBroken'), bx + bw / 2, y + 1);
                c.restore();
            } else {
                const col = r.pct > 0.5 ? '#2ecc71' : r.pct > 0.25 ? '#f1c40f' : '#ff3b3b';
                c.save();
                if (r.critical) c.globalAlpha = 0.7 + Math.sin(now / 110) * 0.3;
                c.fillStyle = col;
                c.beginPath(); c.roundRect(bx, y - bh / 2, Math.max(2, bw * r.pct), bh, bh / 2); c.fill();
                c.restore();
            }
        });

        // Pigulka FALI — srodek gory, pod WYNIKIEM (y 66); gdy mega boss zyje jego pasek
        // siedzi na y 78, wiec pigulka schodzi nizej (112), zeby sie nie nakladaly.
        const WW = 230, WH = 30;
        const wx = Math.round((this.screenW / this.uiScale) / 2 - WW / 2);
        const wy = info.megaAlive ? 112 : 66;
        let txt = '';
        let col = '#e0b53c';
        if (info.phase === 'tutorial') { txt = tr('hud.castle.tutorial'); col = '#e0b53c'; }
        else if (info.phase === 'intro') { txt = tr('hud.castle.intro', { s: info.phaseSecondsLeft }); col = '#e0b53c'; }
        else if (info.phase === 'combat') { txt = tr('hud.castle.wave', { n: info.wave, total: info.wavesTotal, left: info.enemiesAlive }); col = '#ff5a5a'; }
        else if (info.phase === 'build') { txt = tr('hud.castle.build', { s: info.phaseSecondsLeft }); col = info.phaseSecondsLeft <= 5 ? '#ff5a5a' : '#2ecc71'; }
        else if (info.phase === 'victory') { txt = tr('hud.castle.allWaves'); col = '#e0b53c'; }
        else if (info.phase === 'defeat') { txt = tr('hud.castle.defeat'); col = '#ff3b3b'; }
        if (txt) {
            c.fillStyle = 'rgba(0,0,0,0.62)';
            c.beginPath(); c.roundRect(wx, wy, WW, WH, 10); c.fill();
            c.strokeStyle = col; c.lineWidth = 2;
            c.beginPath(); c.roundRect(wx, wy, WW, WH, 10); c.stroke();
            c.font = `15px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.strokeStyle = '#000'; c.lineWidth = 3;
            c.strokeText(txt, wx + WW / 2, wy + WH / 2 + 1);
            c.fillStyle = info.phase === 'build' && info.phaseSecondsLeft <= 5 ? '#ff8a8a' : '#fff';
            c.fillText(txt, wx + WW / 2, wy + WH / 2 + 1);
        }
    }

    // ── SAVE THE QUEEN Q2 — zegar + pasek drogi (przestrzen skalowana uiScale) ─────

    /**
     * Pigulka ZEGARA — srodek gory pod WYNIKIEM (y 66, jak pigulka FALI Zamku), 230x44,
     * cyfry 22 px Titan One (najwazniejsza liczba trybu; podloga czytelnosci 10 px).
     * Kolor: SPOKOJ bialy -> OBLEZENIE pomarancz -> PANIKA czerwony pulsujacy (ostatnie
     * 10 s "stuk" skali co sekunde). Pod nia pasek DROGI 120x8 (sloty rozbite / 8),
     * miga brazowo, gdy Budowniczy cofa (Q4). @375 landscape (uiScale 0.7): nie koliduje
     * z SCORE (y 8..62), SUPER (14,70,172,54 — lewa kolumna) ani prawa kolumna (KILLS/sezon).
     */
    private drawQueenPanel(): void {
        const info = this.queenInfo;
        if (!info) return;
        const c = this.ctx;
        const now = Date.now();
        const WW = 230, WH = 44;
        const wx = Math.round((this.screenW / this.uiScale) / 2 - WW / 2);
        const wy = 66;
        const secTotal = Math.ceil(info.remainingMs / 1000);
        const mm = Math.floor(secTotal / 60), ss = secTotal % 60;
        const txt = info.phase === 'rescued' ? tr('queen.rescued') : info.phase === 'captured' ? tr('queen.captured') : `${mm}:${ss < 10 ? '0' : ''}${ss}`;
        const col = info.phase === 'calm' ? '#ffffff' : info.phase === 'siege' ? '#ff9f1a' : info.phase === 'panic' || info.phase === 'captured' ? '#ff3b3b' : '#ff5fb0';
        let scale = 1;
        if (info.phase === 'panic') {
            scale = 1 + 0.06 * (0.5 + 0.5 * Math.sin(now / 160));
            if (secTotal <= 10) scale += 0.08 * Math.max(0, 1 - ((info.remainingMs % 1000) / 1000) * 3); // "stuk" na kazda sekunde
        }
        c.save();
        c.translate(wx + WW / 2, wy + WH / 2);
        c.scale(scale, scale);
        c.fillStyle = 'rgba(0,0,0,0.66)';
        c.beginPath(); c.roundRect(-WW / 2, -WH / 2, WW, WH, 12); c.fill();
        c.strokeStyle = col; c.lineWidth = 2.5;
        c.beginPath(); c.roundRect(-WW / 2, -WH / 2, WW, WH, 12); c.stroke();
        c.font = `22px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.strokeStyle = '#000'; c.lineWidth = 4;
        c.strokeText(`⏳ ${txt}`, 0, 1);
        c.fillStyle = col;
        c.fillText(`⏳ ${txt}`, 0, 1);
        c.restore();

        // Q6: odznaka KLUCZA (zlota pigulka po prawej od zegara, puls) — gracz WIDZI, ze ma klucz
        if (info.hasKey) {
            const KW = 108, KH = 34, kx = wx + WW + 10, ky = wy + (WH - KH) / 2;
            const kp = 1 + 0.05 * Math.sin(now / 140);
            c.save(); c.translate(kx + KW / 2, ky + KH / 2); c.scale(kp, kp);
            c.fillStyle = 'rgba(0,0,0,0.66)'; c.beginPath(); c.roundRect(-KW / 2, -KH / 2, KW, KH, 10); c.fill();
            c.strokeStyle = '#ffd54a'; c.lineWidth = 2.5; c.beginPath(); c.roundRect(-KW / 2, -KH / 2, KW, KH, 10); c.stroke();
            c.font = `16px "${FONT_FAMILY}",cursive`; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.strokeStyle = '#000'; c.lineWidth = 4; c.strokeText(`🔑 ${tr('hud.queen.key')}`, 0, 1);
            c.fillStyle = '#ffd54a'; c.fillText(`🔑 ${tr('hud.queen.key')}`, 0, 1);
            c.restore();
        }

        // pasek DROGI
        const BW = 160, BH = 8, bx = wx + WW / 2 - BW / 2, by = wy + WH + 6;
        const flash = info.pathFlash && Math.floor(now / 120) % 2 === 0;
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.beginPath(); c.roundRect(bx - 4, by - 3, BW + 8, BH + 6, 6); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.beginPath(); c.roundRect(bx, by, BW, BH, 4); c.fill();
        const seg = BW / info.pathTotal;
        for (let i = 0; i < info.pathTotal; i++) {
            const done = i < info.pathBroken;
            c.fillStyle = flash ? '#8d5a2b' : done ? (info.keystoneDown ? '#ff5fb0' : '#d97a5a') : 'rgba(255,255,255,0.08)';
            c.beginPath(); c.roundRect(bx + i * seg + 1, by + 1, seg - 2, BH - 2, 2); c.fill();
        }
        c.font = `10px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'left'; c.textBaseline = 'middle';
        c.strokeStyle = '#000'; c.lineWidth = 3;
        c.strokeText(`🧱 ${tr('hud.queen.path')}`, bx + BW + 8, by + BH / 2);
        c.fillStyle = '#fff';
        c.fillText(`🧱 ${tr('hud.queen.path')}`, bx + BW + 8, by + BH / 2);
    }

    /** Strzalki krawedziowe Krolowej: cela (magenta, pulsuje gdy Zwornik pekl) + aktywne lane'y. Nieskalowane. */
    private drawQueenEdgeArrows(): void {
        const info = this.queenInfo;
        if (!info) return;
        const targets: Array<{ wx: number; wy: number; color: number; label: string; pulse: boolean }> = [];
        targets.push({ wx: info.queen.wx, wy: info.queen.wy, color: 0xff5fb0, label: '👸', pulse: info.keystoneDown });
        for (const l of info.lanes) targets.push({ wx: l.wx, wy: l.wy, color: 0xff4d4d, label: l.label, pulse: true });
        this.drawEdgeArrowTargets(targets, info.cameraX, info.cameraY, info.zoom);
    }

    /** Licznik respawnu — srodek ekranu (nieskalowany). */
    private drawCastleRespawn(): void {
        const info = this.castleInfo;
        if (!info || info.respawnSecondsLeft <= 0) return;
        const c = this.ctx;
        c.save();
        c.translate(this.screenW / 2, this.screenH / 2 - 40);
        c.fillStyle = 'rgba(0,0,0,0.7)';
        c.beginPath(); c.roundRect(-170, -46, 340, 92, 18); c.fill();
        c.strokeStyle = '#ff6b6b'; c.lineWidth = 3;
        c.beginPath(); c.roundRect(-170, -46, 340, 92, 18); c.stroke();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `18px "${FONT_FAMILY}",cursive`;
        c.fillStyle = '#ffb3b3';
        c.fillText(tr('hud.castle.respawn'), 0, -18);
        c.font = `44px "${FONT_FAMILY}",cursive`;
        c.strokeStyle = '#000'; c.lineWidth = 6;
        c.strokeText(String(info.respawnSecondsLeft), 0, 18);
        c.fillStyle = '#fff';
        c.fillText(String(info.respawnSecondsLeft), 0, 18);
        c.restore();
    }

    /** P1: ostatnie 5 s budowy — duzy licznik na srodku (jak respawn), zeby wczesny start / koniec naprawy nie zaskakiwal. */
    private drawCastleBuildCountdown(): void {
        const info = this.castleInfo;
        if (!info || info.phase !== 'build' || info.phaseSecondsLeft > 5 || info.respawnSecondsLeft > 0) return;
        const c = this.ctx;
        c.save();
        c.translate(this.screenW / 2, this.screenH * 0.3); // nad czolgiem (srodek ekranu = gracz), pod pigulka fali
        const pulse = 1 + (1 - (Date.now() % 1000) / 1000) * 0.25;
        c.scale(pulse, pulse);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `64px "${FONT_FAMILY}",cursive`;
        c.strokeStyle = '#000'; c.lineWidth = 8;
        c.strokeText(String(info.phaseSecondsLeft), 0, 0);
        c.fillStyle = '#ff5a5a';
        c.fillText(String(info.phaseSecondsLeft), 0, 0);
        c.restore();
    }

    /** P1: donzon < 33% — czerwona ramka krawedzi (stroke, nie fill: tanio na mobile). */
    private drawCastleKeepAlarm(): void {
        const info = this.castleInfo;
        if (!info || !info.keepAlarm) return;
        const c = this.ctx;
        c.save();
        c.globalAlpha = 0.5 + Math.abs(Math.sin(Date.now() / 90)) * 0.5;
        c.strokeStyle = '#ff3366'; c.lineWidth = 22;
        c.strokeRect(0, 0, this.screenW, this.screenH);
        c.restore();
    }

    /** Baner zdarzenia (wzorzec drawCtfBreachBanner, ale tekst/kolor z triggera). */
    private drawCastleBanner(): void {
        if (this.castleBannerTimer <= 0) {
            const next = this.castleBannerQueue.shift();
            if (!next) return;
            this.castleBannerText = next.text; this.castleBannerColor = next.color; this.castleBannerPulse = next.pulse;
            this.castleBannerMax = next.frames; this.castleBannerTimer = next.frames;
        }
        const c = this.ctx;
        const t = this.castleBannerTimer;
        const max = this.castleBannerMax;
        this.castleBannerTimer--;
        const alpha = t > max - 30 ? (max - t) / 30 : t < 30 ? t / 30 : 1;
        c.save();
        c.globalAlpha = alpha;
        c.translate(this.screenW / 2, this.screenH / 2 - 110);
        // POLISH-2: puls opcjonalny — krotkie komendy (odliczanie Krolowej) pojawiaja sie i znikaja bez drgania
        const pulse = this.castleBannerPulse ? 1 + Math.sin(Date.now() / 80) * 0.07 : 1;
        c.scale(pulse, pulse);
        // F6: dlugie podpowiedzi intro — czcionka dopasowana do szerokosci ekranu (min 20 px)
        let fs = 38;
        c.font = `${fs}px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        while (fs > 20 && c.measureText(this.castleBannerText).width + 80 > this.screenW - 40) { fs -= 2; c.font = `${fs}px "${FONT_FAMILY}",cursive`; }
        const tw = Math.min(this.screenW - 40, c.measureText(this.castleBannerText).width + 80);
        c.fillStyle = 'rgba(0,0,0,0.85)';
        c.beginPath(); c.roundRect(-tw / 2, -40, tw, 80, 16); c.fill();
        c.strokeStyle = this.castleBannerColor; c.lineWidth = 4;
        c.stroke();
        c.strokeStyle = '#000'; c.lineWidth = 6;
        c.strokeText(this.castleBannerText, 0, 0);
        c.fillStyle = this.castleBannerColor;
        c.fillText(this.castleBannerText, 0, 0);
        c.restore();
    }

    /** Strzalki krawedziowe: aktywne lane'y (czerwone) + wylomy (pomaranczowe). Nieskalowane. */
    private drawCastleEdgeArrows(): void {
        const info = this.castleInfo;
        if (!info) return;
        const targets: Array<{ wx: number; wy: number; color: number; label: string; pulse: boolean }> = [];
        for (const l of info.lanes) targets.push({ wx: l.wx, wy: l.wy, color: 0xff4d4d, label: l.label, pulse: true });
        for (const b of info.breaches) targets.push({ wx: b.wx, wy: b.wy, color: 0xff9f1a, label: '💥', pulse: false });
        for (const m of info.machines) targets.push({ wx: m.wx, wy: m.wy, color: 0xf1c40f, label: m.label, pulse: true });
        this.drawEdgeArrowTargets(targets, info.cameraX, info.cameraY, info.zoom);
    }

    /** Wspolny rysownik strzalek krawedziowych (Zamek F5, Krolowa Q2): world->screen, klamra do marginesu M, trojkat + badge. */
    private drawEdgeArrowTargets(targets: Array<{ wx: number; wy: number; color: number; label: string; pulse: boolean }>, cameraX: number, cameraY: number, zoom: number): void {
        const c = this.ctx;
        const M = 34, ON_SCREEN_PAD = 20;
        for (const tgt of targets) {
            const sx = (tgt.wx - cameraX) * zoom;
            const sy = (tgt.wy - cameraY) * zoom;
            const onScreen = sx >= -ON_SCREEN_PAD && sx <= this.screenW + ON_SCREEN_PAD && sy >= -ON_SCREEN_PAD && sy <= this.screenH + ON_SCREEN_PAD;
            if (onScreen) continue;
            const cx = this.screenW / 2, cyS = this.screenH / 2;
            const dx = sx - cx, dy = sy - cyS;
            const scale = Math.min((this.screenW / 2 - M) / Math.abs(dx || 0.0001), (this.screenH / 2 - M) / Math.abs(dy || 0.0001));
            const ax = cx + dx * scale, ay = cyS + dy * scale;
            const ang = Math.atan2(dy, dx);
            const col = '#' + tgt.color.toString(16).padStart(6, '0');
            c.save();
            c.globalAlpha = tgt.pulse ? 0.7 + Math.sin(Date.now() / 130) * 0.3 : 0.85;
            c.translate(ax, ay);
            c.rotate(ang);
            c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 2.5;
            c.beginPath(); c.moveTo(16, 0); c.lineTo(-4, -10); c.lineTo(-4, 10); c.closePath(); c.fill(); c.stroke();
            c.rotate(-ang);
            const bx = -Math.cos(ang) * 22, byA = -Math.sin(ang) * 22;
            c.fillStyle = 'rgba(0,0,0,0.65)';
            c.beginPath(); c.arc(bx, byA, 15, 0, Math.PI * 2); c.fill();
            c.strokeStyle = col; c.lineWidth = 2.5; c.stroke();
            c.font = `15px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = '#fff';
            c.fillText(tgt.label, bx, byA + 1);
            c.restore();
        }
    }
    
    private drawNotifs(): void {
        if (this.hudNotifs.length === 0) return;
        const c = this.ctx;
        c.font = `15px "${FONT_FAMILY}",cursive`;
        this.hudNotifs.forEach((n, i) => {
            if (n.timer <= 0) return;
            n.timer--;
            const alpha = Math.min(1, n.timer / 30) * Math.min(1, (n.maxTimer - n.timer + 20) / 20);
            const pw = c.measureText(n.text).width + 16;
            // v0.46.0: px 222 → 252 (HP pill poszerzony do 230, notify nie moga nachodzic)
            const ph = 24, pr = 12, px = 252, py = 8 + i * 28;
            c.save();
            c.globalAlpha = alpha;
            c.fillStyle = 'rgba(0,0,0,0.55)';
            c.beginPath();
            c.roundRect(px, py, pw, ph, pr);
            c.fill();
            c.fillStyle = n.color;
            c.beginPath();
            c.roundRect(px, py, 4, ph, [pr, 0, 0, pr]);
            c.fill();
            c.textAlign = 'left';
            c.textBaseline = 'middle';
            c.strokeStyle = 'rgba(0,0,0,0.7)';
            c.lineWidth = 3;
            c.strokeText(n.text, px + 10, py + ph / 2);
            c.fillStyle = n.color;
            c.fillText(n.text, px + 10, py + ph / 2);
            c.restore();
        });
        this.hudNotifs = this.hudNotifs.filter(n => n.timer > 0);
    }
    
    private drawHPPill(player: Player, px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        const curHP = player.hp, maxHP = player.maxHp;
        const t = maxHP > 0 ? Math.max(0, Math.min(1, curHP / maxHP)) : 0;
        const rv = t >= 0.5 ? Math.round(46 + (1 - t) * 2 * (255 - 46)) : Math.round(255 + (0.5 - t) * 2 * (231 - 255));
        const gv = t >= 0.5 ? Math.round(204 + (1 - t) * 2 * (165 - 204)) : Math.round(165 + (0.5 - t) * 2 * (76 - 165));
        const bv = t >= 0.5 ? Math.round(113 + (1 - t) * 2 * (0 - 113)) : Math.round((0.5 - t) * 2 * 60);
        
        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();
        c.strokeStyle = `rgba(${rv},${gv},${bv},0.38)`;
        c.lineWidth = 0.8;
        c.stroke();
        
        const PAD = 14, GAP = 10, cy = py + PH / 2;
        // v0.46.0: label HP — HUD_LABEL_PX bez bolda (spojny z liczba, koniec faux-bold)
        const hpLabel = tr('hud.hp');
        c.fillStyle = '#ffffff';
        c.font = `${HUD_LABEL_PX}px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 3;
        c.strokeText(hpLabel, px + PAD, cy);
        c.fillText(hpLabel, px + PAD, cy);
        
        const lblW = c.measureText(hpLabel).width;
        const numStr = `${Math.ceil(curHP)}/${Math.ceil(maxHP)}`;
        // v0.46.0 HP/DMG x100: liczba 26px (3-cyfrowe "700/700" mieszcza sie w 230px pill)
        c.font = `26px "${FONT_FAMILY}",cursive`;
        const numW = c.measureText(numStr).width;
        const numX = px + PW - PAD - numW;
        c.strokeStyle = 'rgba(0,0,0,0.85)';
        c.lineWidth = 4;
        c.strokeText(numStr, numX, cy + 1);
        c.fillStyle = '#ffffff';
        c.fillText(numStr, numX, cy + 1);
        
        const BH = 12, barX = px + PAD + lblW + GAP, barW = numX - barX - GAP, barY = cy - BH / 2;
        c.fillStyle = 'rgba(255,255,255,0.07)';
        c.beginPath();
        c.roundRect(barX, barY, barW, BH, BH / 2);
        c.fill();
        if (t > 0) {
            c.fillStyle = `rgba(${rv},${gv},${bv},0.85)`;
            c.beginPath();
            c.roundRect(barX, barY, barW * t, BH, BH / 2);
            c.fill();
        }
    }
    
    /**
     * v0.46.0 — SCALONY SUPER PILL (zastapil drawGemPill + drawSuperShotPill).
     *
     * Decyzja projektowa (FAZA v0.46 HUD redesign): surowa liczba gemow byla niskowartosciowa
     * (redundancja ze score — gem = +1 pkt; gracz nie dziala na liczbie). Jedyna actionable
     * info to "ile mam superow + jak blisko nastepnego". Wzorzec Brawl Stars: charge = wizualny
     * miernik, nie licznik.
     *
     * Layout:
     * - ⚡ ikona + label "SUPER" (gora)
     * - 6-segmentowy miernik ladunkow: zapalone segmenty = player.superCharges (banked),
     *   bez liczby (decyzja Mariusza: czysto wizualnie). Batche +3 zapalaja 3 segmenty.
     * - cienki pasek ladowania (dol): gemsToNext/10 = postep do nastepnego batcha +3.
     * - gdy superCharges > 0 lub aktywny: pill swieci fioletowo (sygnal "mozesz strzelic").
     * - gdy aktywny (isSuperShotActive): pulsujace fioletowe tlo.
     *
     * gemsCollected dalej trackowany wewnetrznie w SpawnSystem (matematyka batchy) — tylko
     * DISPLAY licznika usuniety.
     */
    private drawSuperPill(player: Player, spawnSystem: SpawnSystem, px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        const charges = player.superCharges;
        const isActive = player.isSuperShotActive;
        const ready = charges > 0 || isActive;
        const MAX_PIPS = 6;
        const PAD = 12;

        // Tlo — pulsujace fioletowe gdy aktywny, ciemne gdy nie
        if (isActive) {
            const pulse = 0.85 + Math.sin(Date.now() / 80) * 0.15;
            c.save();
            c.globalAlpha = pulse;
            c.fillStyle = 'rgba(200,80,255,0.55)';
            c.beginPath();
            c.roundRect(px, py, PW, PH, r);
            c.fill();
            c.restore();
        } else {
            c.fillStyle = 'rgba(8,8,18,0.75)';
            c.beginPath();
            c.roundRect(px, py, PW, PH, r);
            c.fill();
        }

        // Border — swieci gdy gotowy do strzalu
        if (ready) {
            const pulse = 0.7 + Math.sin(Date.now() / 150) * 0.3;
            c.strokeStyle = `rgba(200,80,255,${pulse})`;
            c.lineWidth = 2.5;
        } else {
            c.strokeStyle = 'rgba(200,80,255,0.3)';
            c.lineWidth = 1;
        }
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.stroke();

        // Label "SUPER SHOT" + blyskawica na KONCU (v0.46.0).
        // Mniejszy font niz HUD_LABEL_PX bo 2-wyrazowy label nie zmiesci sie w 26px.
        const superLabel = tr('hud.superShot');
        const SUPER_LABEL_PX = 19;
        c.font = `${SUPER_LABEL_PX}px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.85)';
        c.lineWidth = 3;
        c.strokeText(superLabel, px + PAD, py + 17);
        c.fillStyle = ready ? '#d8a8ff' : 'rgba(255,255,255,0.7)';
        c.fillText(superLabel, px + PAD, py + 17);

        // Blyskawica ⚡ na koncu labela
        const superLblW = c.measureText(superLabel).width;
        c.font = `${SUPER_LABEL_PX + 2}px "${FONT_FAMILY}",cursive`;
        c.globalAlpha = ready ? 1 : 0.5;
        c.fillStyle = '#fff';
        c.fillText('⚡', px + PAD + superLblW + 5, py + 17);
        c.globalAlpha = 1;

        // 6-segmentowy miernik ladunkow (banked charges, bez liczby)
        const pipCount = Math.min(charges, MAX_PIPS);
        const PIP_W = 14, PIP_H = 8, PIP_GAP = 4;
        const pipsY = py + 30;
        let pipX = px + PAD;
        for (let i = 0; i < MAX_PIPS; i++) {
            const lit = i < pipCount;
            c.beginPath();
            c.roundRect(pipX, pipsY, PIP_W, PIP_H, 3);
            if (lit) {
                c.fillStyle = SUPER_TINT_HEX;
                c.fill();
                // subtelny highlight na zapalonym
                c.fillStyle = 'rgba(255,255,255,0.25)';
                c.beginPath();
                c.roundRect(pipX, pipsY, PIP_W, PIP_H / 2, [3, 3, 0, 0]);
                c.fill();
            } else {
                c.fillStyle = 'rgba(255,255,255,0.12)';
                c.fill();
            }
            pipX += PIP_W + PIP_GAP;
        }

        // Cienki pasek ladowania do nastepnego batcha (+3)
        const gemsToNext = spawnSystem.gemsCollected % GEMS_PER_SUPER_CHARGE_TRIGGER;
        const chargeProgress = gemsToNext / GEMS_PER_SUPER_CHARGE_TRIGGER;
        const BAR_X = px + PAD, BAR_W = PW - PAD * 2, BAR_Y = py + PH - 7, BAR_H = 3;
        c.fillStyle = 'rgba(255,255,255,0.1)';
        c.beginPath();
        c.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2);
        c.fill();
        if (chargeProgress > 0) {
            c.fillStyle = SUPER_TINT_HEX;
            c.beginPath();
            c.roundRect(BAR_X, BAR_Y, BAR_W * chargeProgress, BAR_H, BAR_H / 2);
            c.fill();
        }
    }
    
    private drawKillsPill(spawnSystem: SpawnSystem, px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        const totalKills = spawnSystem.totalKills;
        const regularKills = spawnSystem.regularKills;
        
        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();
        
        const cyMid = py + PH / 2 - 3;  // lekko w gore — miejsce na dolny pasek megabossa

        // Label "KILLS" — lewo, wycentrowane pionowo (spojny wzorzec z SCORE/HP: label lewo, wartosc prawo)
        c.font = `${HUD_LABEL_PX}px "${FONT_FAMILY}",cursive`;
        c.fillStyle = '#ffffff';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.9)';
        c.lineWidth = 4;
        const killsLabel = tr('hud.kills');
        c.strokeText(killsLabel, px + 14, cyMid);
        c.fillText(killsLabel, px + 14, cyMid);

        // Wartosc "💀 N" — prawo, wycentrowane pionowo (ta sama os co label)
        const numStr = String(totalKills);
        c.font = `32px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        const numX = px + PW - 14;
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 4;
        c.strokeText(numStr, numX, cyMid);
        c.fillStyle = '#e8dcc8';
        c.fillText(numStr, numX, cyMid);
        // Skull tuz przed liczba (right-aligned w jego pozycji)
        const numW = c.measureText(numStr).width;
        c.font = `22px "${FONT_FAMILY}",cursive`;
        c.fillText('💀', numX - numW - 8, cyMid);
        
        const BAR_H = 5;
        const BAR_X = px + 14;
        const BAR_W = PW - 28;
        const BAR_Y = py + PH - BAR_H - 4;
        
        const progress = Math.min(1, regularKills / SPAWN_CONFIG.megaBossKillThreshold);
        
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.beginPath();
        c.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2);
        c.fill();
        c.fillStyle = progress >= 1 ? '#ffdd00' : '#ff8866';
        c.beginPath();
        c.roundRect(BAR_X, BAR_Y, BAR_W * progress, BAR_H, BAR_H / 2);
        c.fill();
        
        if (regularKills >= SPAWN_CONFIG.megaBossKillThreshold && !spawnSystem.megaBossSpawned) {
            const pulse = 0.7 + Math.sin(Date.now() / 200) * 0.3;
            c.save();
            c.globalAlpha = pulse;
            c.fillStyle = '#ff0033';
            c.font = `13px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'right';
            // TYPO-P0-3: kontur. Czerwien #ff0033 na ciemnym tle mapy sama w sobie ma
            // slaby kontrast, a to jest ZACHETA do dobicia MegaBossa — musi sie czytac.
            c.strokeStyle = 'rgba(0,0,0,0.9)';
            c.lineWidth = 3;
            c.strokeText(tr('hud.killProgressTaunt'), px + PW - 4, py + PH + 18);
            c.fillText(tr('hud.killProgressTaunt'), px + PW - 4, py + PH + 18);
            c.restore();
        }
    }
    
    /**
     * Bottom-center super power bar — 3 icons (aura/megaBomb/freeze) z cooldown overlays.
     * v0.23.1: hidden on mobile via this.showPowerBar = false (zastepuje SuperButton).
     */
    private drawSuperPowerBar(powerSystem: PowerSystem): void {
        const c = this.ctx;
        const cx = this.screenW / 2;

        const ICON_SIZE = 72;
        const ICON_GAP = 14;
        const BOTTOM_MARGIN = 40;

        const iconsBaseY = this.screenH - BOTTOM_MARGIN - ICON_SIZE;
        const hintY = iconsBaseY - 18;

        // PROG-F7a: 2 SLOTY LOADOUTU zamiast 3 mocy z cyklowaniem. Kazdy slot = wlasny
        // trigger (SPACE/PPM i Q) => "wybrana moc" nie istnieje; gotowy slot = zloty puls.
        // v0.114.0: petla po slotCount — slot 2 = kostka 🎲 (bez statycznego id).
        const slotCount = powerSystem.slotCount;
        const totalW = ICON_SIZE * slotCount + ICON_GAP * (slotCount - 1);
        const startX = cx - totalW / 2;

        // v0.73.7 PERF: for-loop (bez alokacji tablicy+domkniecia co klatke).
        for (let i = 0; i < slotCount; i++) {
            const slot = i as 0 | 1 | 2;
            // Slot 2 gra jako kostka TYLKO przy Szalonych Mocach; inaczej zwykla 3. moc.
            const isDice = slot === 2 && powerSystem.diceEnabled;
            const id = isDice ? null : powerSystem.loadout[slot];
            const cooldownProgress = powerSystem.getSlotCooldownProgress(slot);
            const onCooldown = cooldownProgress > 0;
            // Kostka: roll => migajace ikony, cooldown => wylosowana moc, gotowa => 🎲.
            const emoji = id !== null ? POWERS[id].emoji : powerSystem.getDiceIcon();
            const label = id !== null
                ? tr(POWERS[id].labelKey).toUpperCase() : tr('power.dice').toUpperCase();
            const isSelected = powerSystem.selectedSlot === i;
            const ix = startX + i * (ICON_SIZE + ICON_GAP);
            // F7a fix czytelnosci (feedback Mariusza): WYBOR to inny kanal niz GOTOWOSC.
            // Gotowosc = zloty puls ramki; wybor = kafelek UNIESIONY o 8px + wskaznik nad nim
            // (pozycja+ruch zamiast koloru — czytelne mimo pulsu na obu gotowych slotach).
            const iy = iconsBaseY - (isSelected ? 8 : 0);
            const isActive = id !== null && powerSystem.activePowerId === id;
            const isReady = !isActive && !onCooldown && powerSystem.activePowerId === null;

            if (isActive) {
                c.fillStyle = 'rgba(60,40,0,0.95)';
            } else if (onCooldown) {
                c.fillStyle = 'rgba(8,8,18,0.7)';
            } else if (isReady) {
                c.fillStyle = 'rgba(40,30,8,0.85)';
            } else {
                c.fillStyle = 'rgba(8,8,18,0.75)';
            }
            c.beginPath();
            c.roundRect(ix, iy, ICON_SIZE, ICON_SIZE, 12);
            c.fill();

            if (isActive) {
                const pulse = 0.8 + Math.sin(Date.now() / 100) * 0.2;
                c.strokeStyle = `rgba(255,221,0,${pulse})`;
                c.lineWidth = 4;
                c.stroke();
            } else if (isReady) {
                const pulse = 0.7 + Math.sin(Date.now() / 150) * 0.3;
                c.strokeStyle = `rgba(255,221,0,${pulse})`;
                c.lineWidth = 3.5;
                c.stroke();
            } else if (onCooldown) {
                c.strokeStyle = 'rgba(120,120,120,0.5)';
                c.lineWidth = 2;
                c.stroke();
            } else {
                c.strokeStyle = 'rgba(255,221,0,0.3)';
                c.lineWidth = 1.5;
                c.stroke();
            }

            // v0.114.0: wyroznienie kostki — fioletowy gradient-ring z shimmerem
            // (sin-hue, spojny z CSS przycisku touch). Rysowany ZAWSZE na kaflu kostki,
            // nad stanem gotowosci/cooldownu — slot musi byc jednoznacznie "szalony".
            if (isDice) {
                const hueShift = Math.sin(Date.now() / 300) * 18;
                const grad = c.createLinearGradient(ix, iy, ix + ICON_SIZE, iy + ICON_SIZE);
                grad.addColorStop(0, `hsl(${282 + hueShift}, 62%, 64%)`);
                grad.addColorStop(0.5, `hsl(${268 + hueShift}, 55%, 42%)`);
                grad.addColorStop(1, `hsl(${292 + hueShift}, 70%, 70%)`);
                c.strokeStyle = grad;
                c.lineWidth = 3.5;
                c.beginPath();
                c.roundRect(ix - 1, iy - 1, ICON_SIZE + 2, ICON_SIZE + 2, 13);
                c.stroke();
            }

            c.font = `42px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.globalAlpha = onCooldown ? 0.4 : 1.0;
            c.fillText(emoji, ix + ICON_SIZE / 2, iy + ICON_SIZE / 2 - 6);
            c.globalAlpha = 1.0;

            if (onCooldown) {
                const secsLeft = powerSystem.getSlotCooldownSecondsLeft(slot);
                
                c.save();
                c.beginPath();
                c.moveTo(ix + ICON_SIZE / 2, iy + ICON_SIZE / 2);
                c.arc(
                    ix + ICON_SIZE / 2, iy + ICON_SIZE / 2,
                    ICON_SIZE / 2 - 4,
                    -Math.PI / 2,
                    -Math.PI / 2 + Math.PI * 2 * cooldownProgress,
                    false
                );
                c.closePath();
                c.fillStyle = 'rgba(0,0,0,0.6)';
                c.fill();
                c.restore();
                
                c.font = `22px "${FONT_FAMILY}",cursive`;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.strokeStyle = '#000';
                c.lineWidth = 4;
                c.strokeText(secsLeft.toFixed(0), ix + ICON_SIZE / 2, iy + ICON_SIZE / 2);
                c.fillStyle = '#ffaa00';
                c.fillText(secsLeft.toFixed(0), ix + ICON_SIZE / 2, iy + ICON_SIZE / 2);
            }
            
            // v0.27.0 FAZA F-fix2: 11px za maly dla Titan One → 13px + dark stroke dla kontrastu
            // F7a: etykieta z i18n (typowana zmienna labelKey) — liczona na gorze petli.
            c.font = `13px "${FONT_FAMILY}",cursive`;
            c.strokeStyle = 'rgba(0,0,0,0.85)';
            c.lineWidth = 3;
            c.strokeText(label, ix + ICON_SIZE / 2, iy + ICON_SIZE - 10);
            c.fillStyle = onCooldown ? 'rgba(140,140,140,0.7)' : (isReady ? '#ffdd00' : '#ffffff');
            c.fillText(label, ix + ICON_SIZE / 2, iy + ICON_SIZE - 10);

            // F7a: numer slotu (klawisz bezposredni) w rogu kafelka — mapowanie 1/2/3 → moc.
            c.font = `12px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'left';
            c.strokeStyle = 'rgba(0,0,0,0.85)';
            c.lineWidth = 3;
            c.strokeText(`${i + 1}`, ix + 6, iy + 12);
            c.fillStyle = 'rgba(255,255,255,0.75)';
            c.fillText(`${i + 1}`, ix + 6, iy + 12);
            c.textAlign = 'center';

            // v0.114.0: badge 🎲 w prawym-gornym rogu kafla kostki — zostaje takze gdy
            // ikona pokazuje wylosowana moc (Czytelnosc: ten slot to zawsze kostka).
            if (isDice) {
                c.font = `13px "${FONT_FAMILY}",cursive`;
                c.textAlign = 'right';
                c.fillText('🎲', ix + ICON_SIZE - 4, iy + 12);
                c.textAlign = 'center';
            }

            // Wskaznik WYBRANEGO slotu: duza strzalka POD kafelkiem celujaca W GORE,
            // podskakuje (sin), biala z czarnym konturem — inny kolor, inna pozycja
            // i ruch niz zloty puls gotowosci (nie zlewa sie; dolny margines 40px jest wolny).
            if (isSelected && !isActive) {
                const bob = Math.sin(Date.now() / 150) * 2.5;
                const axc = ix + ICON_SIZE / 2;
                const ay = iy + ICON_SIZE + 8 + bob; // czubek strzalki tuz pod kafelkiem
                c.beginPath();
                c.moveTo(axc - 12, ay + 12);
                c.lineTo(axc + 12, ay + 12);
                c.lineTo(axc, ay);
                c.closePath();
                c.fillStyle = '#ffffff';
                c.strokeStyle = 'rgba(0,0,0,0.9)';
                c.lineWidth = 3;
                c.stroke();
                c.fill();
            }
        }

        c.font = `12px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        // TYPO-P0-3: kontur. Podpowiedz jest CELOWO przygaszona (alpha 0.55), wiec bez
        // obrysu potrafila zniknac calkiem na jasnym tle — a to jedyna instrukcja, ktora
        // mowi graczowi, jak odpalic moc. Kontur tez przygaszony, zeby nie krzyczal.
        c.strokeStyle = 'rgba(0,0,0,0.55)';
        c.lineWidth = 3;
        c.strokeText(tr('hud.powerHint'), cx, hintY);
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillText(tr('hud.powerHint'), cx, hintY);
        
        if (powerSystem.activePowerId !== null) {
            const power = POWERS[powerSystem.activePowerId];
            const secsLeft = powerSystem.getActiveSecondsLeft();

            // F7b: tekst i kolory GENERYCZNIE z PowerDef (activeLabelKey + power.color) —
            // if-chain aura/freeze ubity, nowa moc czasowa = zero zmian w HUD.
            const pulse = 0.7 + Math.sin(Date.now() / 100) * 0.3;
            const powerColor = `#${power.color.toString(16).padStart(6, '0')}`;
            const activeText = power.activeLabelKey
                ? tr(power.activeLabelKey, { sec: secsLeft.toFixed(1) })
                : `${power.emoji} ${secsLeft.toFixed(1)}s`;

            c.save();
            c.globalAlpha = pulse;
            c.font = `24px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'center';
            c.strokeStyle = '#000';
            c.lineWidth = 5;
            c.strokeText(activeText, cx, hintY - 38);
            c.fillStyle = powerColor;
            c.fillText(activeText, cx, hintY - 38);
            c.restore();

            const TIME_BAR_W = 200;
            const TIME_BAR_H = 6;
            const tbX = cx - TIME_BAR_W / 2;
            const tbY = hintY - 22;

            c.fillStyle = 'rgba(0,0,0,0.7)';
            c.beginPath();
            c.roundRect(tbX - 2, tbY - 2, TIME_BAR_W + 4, TIME_BAR_H + 4, 4);
            c.fill();

            const timeProgress = powerSystem.framesLeft / power.durationFrames;
            const barColor = timeProgress > 0.3 ? powerColor : '#ff6600';
            c.fillStyle = barColor;
            c.beginPath();
            c.roundRect(tbX, tbY, TIME_BAR_W * timeProgress, TIME_BAR_H, 3);
            c.fill();
        }
    }
    
    /**
     * O ile zsunac w dol prawa kolumne (magnes, turbo), gdy chip sezonu zajmuje
     * wiersz pod KILLS. Jedno zrodlo prawdy — bez tego chip nachodzilby na magnes
     * (KILLS konczy sie na y=62, magnes startowal na y=80, chip zajmuje 68..102).
     */
    private seasonRowShift(): number {
        return this.seasonCount !== null ? 42 : 0;
    }

    /** SEASON KIT — chip "📕 N". Ten sam jezyk wizualny co pill KILLS, mniejszy. */
    /**
     * TYPO-P0-5 (v0.126.0) — dwie poprawki wzgledem pierwszej wersji:
     *
     * 1. `save`/`restore`. Metoda zostawiala w kontekscie font 22px, textAlign 'right',
     *    fillStyle zloty, lineWidth 4. Skutku nie bylo widac TYLKO dlatego, ze nastepny
     *    `drawSuperPill` nadpisuje wszystkie te pola u siebie — czyli blad byl utajony
     *    i wybuchlby przy zmianie kolejnosci rysowania. Sasiednie `drawMagnetStatus`
     *    i `drawTurboStatus` robia to poprawnie; to bylo odstepstwo od wzorca w pliku.
     *
     * 2. `measureText` + auto-shrink. Budzet poziomy to PW - 24 px dzielone miedzy
     *    podpis (26 px) i wartosc (22 px), a podpis rosnie z jezykiem ("Książki" 7 zn.
     *    vs "Books" 5 zn., +40%) i wartosc rosnie z liczba (📕 5 -> 📕 123). Bez pomiaru
     *    oba napisy po prostu wchodzily na siebie. Pozostale pille, ktore rosna z trescia
     *    (drawNotifs), mierza tekst od zawsze — ten jeden nie mierzyl.
     */
    private drawSeasonPill(px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        c.save();

        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();

        const cy = py + PH / 2;
        const PAD = 12;
        const GAP = 8;                      // minimalny odstep podpis <-> wartosc
        const budget = PW - PAD * 2 - GAP;

        // v0.139.0 (pkt 3): podpis „Książki" -> „Znajdźki". Playtest: slowo „ksiazki"
        // nic graczowi nie mowilo, bo znajdzki sezonu to nie tylko ksiazki, a nazwa
        // musialaby sie zmieniac z kazdym sezonem. „Znajdźki" jest sezono-niezalezne
        // i pokrywa sie ze slowem, ktorego uzywa juz strona sezonu (season.findThemAll).
        //
        // EMOJI USUNIETE — sama liczba. Ikonka 📕 dublowala to samo (zle) znaczenie,
        // a po jej wycieciu wartosc miesci sie bez kurczenia.
        const label = tr('hud.finds');
        const val = String(this.seasonCount ?? 0);

        // Wartosc jest wazniejsza od podpisu (podpis stoi obok ikony 📕, wiec i tak
        // sie domysli), dlatego przy ciasnocie kurczy sie NAJPIERW podpis.
        let valPx = 22;
        c.font = `${valPx}px "${FONT_FAMILY}",cursive`;
        let valW = c.measureText(val).width;
        while (valW > budget * 0.6 && valPx > 15) {
            valPx -= 1;
            c.font = `${valPx}px "${FONT_FAMILY}",cursive`;
            valW = c.measureText(val).width;
        }

        // v0.140.0: podpis startuje od WLASNEJ, mniejszej stalej, a nie od wspoldzielonego
        // HUD_LABEL_PX (26 px). Zgloszenie Mariusza: „slowo dominuje" — i slusznie, bo
        // 26 px w kafelku wysokim na 34 px zajmowalo prawie cala jego wysokosc
        // i przykrywalo to, co naprawde niesie informacje, czyli LICZBE.
        // HUD_LABEL_PX zostaje NIETKNIETY — dziela go HP / WYNIK / ZABICI.
        let labelPx = SEASON_LABEL_PX;
        c.font = `${labelPx}px "${FONT_FAMILY}",cursive`;
        while (c.measureText(label).width > budget - valW && labelPx > 12) {
            labelPx -= 1;
            c.font = `${labelPx}px "${FONT_FAMILY}",cursive`;
        }

        // Uklad jak w pillu KILLS: PODPIS po lewej, wartosc po prawej — ta sama os,
        // wiec oba pille czytaja sie jako jeden rzad, a nie dwa rozne widgety.
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.9)';
        c.lineWidth = 4;
        c.strokeText(label, px + PAD, cy);
        c.fillStyle = '#ffffff';
        c.fillText(label, px + PAD, cy);

        c.font = `${valPx}px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'right';
        c.strokeText(val, px + PW - PAD, cy + 1);
        c.fillStyle = '#f1c40f';
        c.fillText(val, px + PW - PAD, cy + 1);

        c.restore();
    }

    private drawMagnetStatus(powerSystem: PowerSystem): void {
        if (!powerSystem.magnetActive) return;
        const c = this.ctx;
        const remaining = Math.max(0, (powerSystem.magnetEndTime - Date.now()) / 1000);
        
        const px = this.screenW - 14 - 200;
        const py = 80 + this.seasonRowShift();   // SEASON KIT: ustap miejsca chipowi
        
        const pulse = 0.85 + Math.sin(Date.now() / 100) * 0.15;
        c.save();
        c.globalAlpha = pulse;
        c.fillStyle = 'rgba(231,76,60,0.85)';
        c.beginPath();
        c.roundRect(px, py, 200, 32, 10);
        c.fill();
        c.font = `16px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#fff';
        c.strokeStyle = '#000';
        c.lineWidth = 3;
        const magnetTxt = tr('hud.magnetStatus', { sec: remaining.toFixed(1) });
        c.strokeText(magnetTxt, px + 100, py + 16);
        c.fillText(magnetTxt, px + 100, py + 16);
        c.restore();
    }
    
    private drawTurboStatus(player: Player): void {
        if (!player.hasSpeedBoost) return;
        const c = this.ctx;
        const remaining = Math.max(0, (player.speedBoostEnd - Date.now()) / 1000);
        
        const px = this.screenW - 14 - 200;
        const py = 118 + this.seasonRowShift();  // SEASON KIT: ustap miejsca chipowi
        
        const pulse = 0.85 + Math.sin(Date.now() / 80) * 0.15;
        c.save();
        c.globalAlpha = pulse;
        c.fillStyle = 'rgba(255,102,0,0.85)';
        c.beginPath();
        c.roundRect(px, py, 200, 32, 10);
        c.fill();
        c.font = `16px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#fff';
        c.strokeStyle = '#000';
        c.lineWidth = 3;
        const turboTxt = tr('hud.turboStatus', { sec: remaining.toFixed(1) });
        c.strokeText(turboTxt, px + 100, py + 16);
        c.fillText(turboTxt, px + 100, py + 16);
        c.restore();
    }
    
    private drawMegaBossBar(megaBoss: Enemy): void {
        const c = this.ctx;
        const BW = 500, BH = 26;
        const bx = (this.screenW - BW) / 2;
        const by = 78;
        
        c.fillStyle = 'rgba(0,0,0,0.7)';
        c.beginPath();
        c.roundRect(bx - 4, by - 4, BW + 8, BH + 8, 10);
        c.fill();
        
        c.fillStyle = 'rgba(60,40,0,0.5)';
        c.beginPath();
        c.roundRect(bx, by, BW, BH, 6);
        c.fill();
        
        const hpPct = Math.max(0, megaBoss.hp / megaBoss.maxHp);
        c.fillStyle = '#ffdd00';
        c.beginPath();
        c.roundRect(bx, by, BW * hpPct, BH, 6);
        c.fill();
        
        c.fillStyle = 'rgba(255,255,255,0.2)';
        c.beginPath();
        c.roundRect(bx, by, BW * hpPct, BH / 2, 6);
        c.fill();
        
        c.font = `18px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = '#000';
        c.lineWidth = 4;
        const phase = megaBoss.getMegaPhase();
        const phaseTxt = phase === 'rush'
            ? tr('hud.megaBossPhaseRush')
            : phase === 'strafe'
                ? tr('hud.megaBossPhaseStrafe')
                : tr('hud.megaBossPhaseEnraged');
        const label = tr('hud.megaBossLabel', { phase: phaseTxt });
        c.strokeText(label, this.screenW / 2, by + BH / 2);
        c.fillStyle = '#fff';
        c.fillText(label, this.screenW / 2, by + BH / 2);
    }
    
    private drawMegaBossAlert(): void {
        if (this.megaBossAlertTimer <= 0) return;
        const c = this.ctx;
        const t = this.megaBossAlertTimer;
        this.megaBossAlertTimer--;
        
        const alpha = t > 150 ? (180 - t) / 30 : t < 30 ? t / 30 : 1;
        
        c.save();
        c.globalAlpha = alpha;
        c.translate(this.screenW / 2, this.screenH / 2 - 50);
        const pulse = 1 + Math.sin(Date.now() / 100) * 0.05;
        c.scale(pulse, pulse);
        
        c.fillStyle = 'rgba(0,0,0,0.85)';
        c.beginPath();
        c.roundRect(-340, -50, 680, 100, 16);
        c.fill();
        c.strokeStyle = '#ffdd00';
        c.lineWidth = 4;
        c.stroke();
        
        c.font = `52px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = '#000';
        c.lineWidth = 6;
        const incomingTxt = tr('hud.megaBossIncoming');
        c.strokeText(incomingTxt, 0, 0);
        c.fillStyle = '#ffdd00';
        c.fillText(incomingTxt, 0, 0);

        c.restore();
    }

    /**
     * FAZA F4.3 — baner eskalacji "WROGOWIE WSCIEKLI!" (2. flaga = bomby bossow).
     * Wzorzec drawMegaBossAlert: fade in/out (150 kl.), puls, motyw czerwony.
     * Nieco wyzej i mniejszy niz megaboss => czytelny ale szybko schodzi z pola.
     */
    private drawCtfEnrageBanner(): void {
        if (this.ctfEnrageTimer <= 0) return;
        const c = this.ctx;
        const t = this.ctfEnrageTimer;
        this.ctfEnrageTimer--;

        const alpha = t > 120 ? (150 - t) / 30 : t < 30 ? t / 30 : 1;

        c.save();
        c.globalAlpha = alpha;
        c.translate(this.screenW / 2, this.screenH / 2 - 110);
        const pulse = 1 + Math.sin(Date.now() / 90) * 0.06;
        c.scale(pulse, pulse);

        c.fillStyle = 'rgba(0,0,0,0.85)';
        c.beginPath();
        c.roundRect(-300, -44, 600, 88, 16);
        c.fill();
        c.strokeStyle = '#ff5533';
        c.lineWidth = 4;
        c.stroke();

        c.font = `42px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = '#000';
        c.lineWidth = 6;
        const txt = tr('ctf.enemiesEnraged');
        c.strokeText(txt, 0, 0);
        c.fillStyle = '#ff6644';
        c.fillText(txt, 0, 0);

        c.restore();
    }

    /**
     * v0.143.0 — baner konca tarczy bazy. Wzorzec drawCtfEnrageBanner (licznik klatek),
     * kolor pomaranczowy: to nie jest to samo zdarzenie co "wrogowie wsciekli", wiec nie
     * moze wygladac tak samo.
     */
    private drawCtfBreachBanner(): void {
        if (this.ctfBreachTimer <= 0) return;
        const c = this.ctx;
        const t = this.ctfBreachTimer;
        this.ctfBreachTimer--;

        const alpha = t > 90 ? (120 - t) / 30 : t < 30 ? t / 30 : 1;

        c.save();
        c.globalAlpha = alpha;
        c.translate(this.screenW / 2, this.screenH / 2 - 110);
        const pulse = 1 + Math.sin(Date.now() / 80) * 0.07;
        c.scale(pulse, pulse);

        c.fillStyle = 'rgba(0,0,0,0.85)';
        c.beginPath();
        c.roundRect(-300, -44, 600, 88, 16);
        c.fill();
        c.strokeStyle = '#e67e22';
        c.lineWidth = 4;
        c.stroke();

        c.font = `42px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = '#000';
        c.lineWidth = 6;
        const txt = tr('ctf.baseBreached');
        c.strokeText(txt, 0, 0);
        c.fillStyle = '#f5a623';
        c.fillText(txt, 0, 0);

        c.restore();
    }

    /**
     * v0.143.0 — licznik tarczy bazy nad hangarem (world->screen, jak edge arrows).
     * Bez tego wygasniecie tarczy byloby niewidzialne, a wjazd wrogow czytalby sie jako
     * "smierc znikad" — czyli dokladnie to, co ta faza naprawia (Czytelnosc > reszta).
     */
    private drawCtfShieldCountdown(): void {
        const info = this.ctfInfo;
        if (!info || info.shieldSecondsLeft <= 0) return;
        const c = this.ctx;

        const sx = (info.hangarX - info.cameraX) * info.zoom;
        const sy = (info.hangarY - info.cameraY) * info.zoom;
        // Poza ekranem => nie rysuj. Gracz i tak jest wtedy daleko od bazy, a strzalka
        // bazy (edge arrows) prowadzi go z powrotem.
        if (sx < -80 || sx > this.screenW + 80 || sy < -80 || sy > this.screenH + 80) return;

        const txt = String(info.shieldSecondsLeft);
        c.save();
        c.textAlign = 'center';
        c.textBaseline = 'middle';

        c.font = `18px "${FONT_FAMILY}",cursive`;
        c.strokeStyle = '#000';
        c.lineWidth = 5;
        const label = tr('ctf.baseShield');
        c.strokeText(label, sx, sy - 52);
        c.fillStyle = '#5dade2';
        c.fillText(label, sx, sy - 52);

        c.font = `54px "${FONT_FAMILY}",cursive`;
        c.lineWidth = 8;
        c.strokeText(txt, sx, sy - 8);
        c.fillStyle = '#ffffff';
        c.fillText(txt, sx, sy - 8);

        c.restore();
    }

    /**
     * FAZA CTF F3 — panel flag (lewa kolumna, pod SUPER pill).
     * 3 sloty A/B/C: kolo w kolorze flagi; IDLE = pelne, CARRIED = pulsujacy ring,
     * CAPTURED = pelne + ✓. Po prawej licznik n/3.
     * Pozycja (14,132,172,44) w SCALED space — zweryfikowana kolizyjnie @375px
     * landscape uiScale 0.7 (HP 8-62, SUPER 70-124, panel 132-176; notify x>=252).
     */
    private drawCtfFlagPanel(): void {
        const info = this.ctfInfo;
        if (!info) return;
        const c = this.ctx;
        const px = 14, py = 132, PW = 172, PH = 44, r = 14;

        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();
        c.strokeStyle = 'rgba(241,196,15,0.35)';
        c.lineWidth = 1;
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.stroke();

        const cy = py + PH / 2;
        let sx = px + 24;
        for (const f of info.flags) {
            const col = '#' + f.color.toString(16).padStart(6, '0');
            if (f.state === 'captured') {
                c.fillStyle = col;
                c.beginPath();
                c.arc(sx, cy, 10, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = '#fff';
                c.lineWidth = 3;
                c.beginPath();
                c.moveTo(sx - 5, cy);
                c.lineTo(sx - 1.5, cy + 4);
                c.lineTo(sx + 5, cy - 4.5);
                c.stroke();
            } else if (f.state === 'carried') {
                const pulse = 0.6 + Math.sin(Date.now() / 120) * 0.4;
                c.save();
                c.globalAlpha = pulse;
                c.strokeStyle = col;
                c.lineWidth = 3.5;
                c.beginPath();
                c.arc(sx, cy, 10, 0, Math.PI * 2);
                c.stroke();
                c.restore();
                c.fillStyle = col;
                c.beginPath();
                c.arc(sx, cy, 5, 0, Math.PI * 2);
                c.fill();
            } else {
                c.fillStyle = col;
                c.beginPath();
                c.arc(sx, cy, 10, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = 'rgba(0,0,0,0.5)';
                c.lineWidth = 1.5;
                c.stroke();
            }
            sx += 30;
        }

        // Licznik n/3 (prawo)
        const cntStr = `${info.flagsCaptured}/3`;
        c.font = `26px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.85)';
        c.lineWidth = 4;
        c.strokeText(cntStr, px + PW - 12, cy + 1);
        c.fillStyle = '#f1c40f';
        c.fillText(cntStr, px + PW - 12, cy + 1);
        // Emoji flagi przed licznikiem
        const cntW = c.measureText(cntStr).width;
        c.font = `18px "${FONT_FAMILY}",cursive`;
        c.fillText('🚩', px + PW - 12 - cntW - 6, cy);
    }

    /**
     * FAZA CTF F3 — carry banner (top-center pod SCORE, wzorzec drawMegaBossAlert:
     * puls + kolor flagi). Kompaktowy i STALY podczas niesienia (nie center-screen,
     * zeby nie zaslanial pola gry). Rysowany w SCALED space — miejsce po megaboss
     * barze (y78), ktorego w CTF nie ma.
     */
    private drawCtfCarryBanner(): void {
        const info = this.ctfInfo;
        if (!info || !info.carrying) return;
        const c = this.ctx;
        const col = '#' + info.carryColor.toString(16).padStart(6, '0');
        const cx = (this.screenW / this.uiScale) / 2;
        // y112: pod SCORE (8-62) i pod 3 wierszami notify (max y=88) — zero kolizji @375px
        const by = 112, BH = 34, BW = 320;

        const pulse = 0.85 + Math.sin(Date.now() / 140) * 0.15;
        c.save();
        c.globalAlpha = pulse;
        c.fillStyle = 'rgba(0,0,0,0.7)';
        c.beginPath();
        c.roundRect(cx - BW / 2, by, BW, BH, 12);
        c.fill();
        c.strokeStyle = col;
        c.lineWidth = 2.5;
        c.beginPath();
        c.roundRect(cx - BW / 2, by, BW, BH, 12);
        c.stroke();

        const bannerTxt = tr('ctf.carryBanner');
        c.font = `20px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.9)';
        c.lineWidth = 4;
        c.strokeText(bannerTxt, cx, by + BH / 2 + 1);
        c.fillStyle = col;
        c.fillText(bannerTxt, cx, by + BH / 2 + 1);
        c.restore();
    }

    /**
     * FAZA CTF F3 — strzalki krawedziowe do flag i bazy (WARUNEK GRYWALNOSCI:
     * przy zoom 0.6 widac ~45%x21% swiata, flagi sa 2200-2700 px od siebie).
     *
     * Rysowane UNSCALED (po c.restore() w render) — pelna przestrzen ekranu.
     * - bez flagi: strzalki do flag IDLE (kolor flagi + dystans w metrach px/10),
     * - z flaga: TYLKO pulsujaca zlota strzalka do bazy (fokus na dostawie).
     * Cel na ekranie (z marginesem) => strzalka znika (widac cel bezposrednio).
     */
    private drawCtfEdgeArrows(): void {
        const info = this.ctfInfo;
        if (!info) return;
        const c = this.ctx;
        const M = 34;             // margines krawedzi dla strzalek
        const ON_SCREEN_PAD = 20; // cel "na ekranie" gdy w tym pasie

        interface ArrowTarget { wx: number; wy: number; color: number; label: string; isBase: boolean }
        const targets: ArrowTarget[] = [];
        if (info.carrying) {
            targets.push({ wx: info.hangarX, wy: info.hangarY, color: 0xf1c40f, label: '🏠', isBase: true });
        } else {
            for (const f of info.flags) {
                if (f.state !== 'idle') continue;
                targets.push({ wx: f.x, wy: f.y, color: f.color, label: f.name[0], isBase: false });
            }
        }

        for (const tgt of targets) {
            const sx = (tgt.wx - info.cameraX) * info.zoom;
            const sy = (tgt.wy - info.cameraY) * info.zoom;
            const onScreen = sx >= -ON_SCREEN_PAD && sx <= this.screenW + ON_SCREEN_PAD
                && sy >= -ON_SCREEN_PAD && sy <= this.screenH + ON_SCREEN_PAD;
            if (onScreen) continue;

            // Kierunek od srodka ekranu do celu + clamp punktu do prostokata marginesu
            const cx = this.screenW / 2;
            const cyS = this.screenH / 2;
            const dx = sx - cx;
            const dy = sy - cyS;
            const scale = Math.min(
                (this.screenW / 2 - M) / Math.abs(dx || 0.0001),
                (this.screenH / 2 - M) / Math.abs(dy || 0.0001),
            );
            const ax = cx + dx * scale;
            const ay = cyS + dy * scale;
            const ang = Math.atan2(dy, dx);
            const col = '#' + tgt.color.toString(16).padStart(6, '0');
            const distM = Math.round(Math.hypot(dx, dy) / info.zoom / 10);

            c.save();
            if (tgt.isBase) {
                c.globalAlpha = 0.75 + Math.sin(Date.now() / 130) * 0.25;
            } else {
                c.globalAlpha = 0.85;
            }

            // Grot strzalki (trojkat wskazujacy kierunek celu)
            c.translate(ax, ay);
            c.rotate(ang);
            c.fillStyle = col;
            c.strokeStyle = 'rgba(0,0,0,0.75)';
            c.lineWidth = 2.5;
            c.beginPath();
            c.moveTo(16, 0);
            c.lineTo(-4, -10);
            c.lineTo(-4, 10);
            c.closePath();
            c.fill();
            c.stroke();
            c.rotate(-ang);

            // Kolo z etykieta (litera flagi / domek bazy) — cofniete od grotu
            const bx = -Math.cos(ang) * 22;
            const byA = -Math.sin(ang) * 22;
            c.fillStyle = 'rgba(0,0,0,0.65)';
            c.beginPath();
            c.arc(bx, byA, 15, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = col;
            c.lineWidth = 2.5;
            c.stroke();
            c.font = `15px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = tgt.isBase ? '#f1c40f' : '#fff';
            c.fillText(tgt.label, bx, byA + 1);

            // Dystans pod kolem (metry = px/10)
            const dTxt = `${distM}m`;
            c.font = `12px "${FONT_FAMILY}",cursive`;
            c.strokeStyle = 'rgba(0,0,0,0.85)';
            c.lineWidth = 3;
            c.strokeText(dTxt, bx, byA + 24);
            c.fillStyle = col;
            c.fillText(dTxt, bx, byA + 24);

            c.restore();
        }
    }

    /**
     * SHOP-2 (v0.138.0): rysowanie DELEGOWANE do rejestru `CROSSHAIR_STYLES`.
     *
     * Do v0.137.0 caly krzyz byl tu zapieczony na sztywno (czerwony, ramie 16*s).
     * Ta geometria nie zniknela — przeniosla sie 1:1 jako wpis `ch_default`, wiec
     * gracz bez zakupu widzi dokladnie to samo co wczoraj.
     *
     * `crosshairScale` (1.0 desktop / 1.5 dotyk) i OBIE sciezki wywolania zostaja
     * nietkniete — rejestr dostaje skale jako parametr, nie zna platformy.
     *
     * Czas w sekundach z `Date.now()` — idiom uzywany juz w kilkunastu miejscach
     * tego pliku (pulsy pilli), wiec zero nowej instalacji. Uzywa go WYLACZNIE
     * `ch_sigma`; pozostale warianty ignoruja parametr.
     */
    private drawCrosshair(mouse: MouseState): void {
        crosshairStyle(this.crosshairStyle).draw(
            this.ctx, mouse.screenX, mouse.screenY, this.crosshairScale, Date.now() / 1000,
        );
    }
    
    /**
     * v0.23.1: render() teraz wrappuje HUD pill rendering w c.scale(uiScale).
     * Crosshair + powerbar are conditional na flags (mobile hides them).
     * MegaBossAlert zostaje unscaled (centralna pozycja — wyglada lepiej w full size).
     *
     * v0.46.0 HUD redesign:
     * - HP pill 230px (3-cyfrowe HP)
     * - SCORE pill: label WYNIK (gora-lewo) → duza zlota liczba (34px, hero leaderboard metric)
     * - SUPER pill (scalony gem+supershot) zastapil dwa osobne pille w lewej kolumnie
     */
    render(
        player: Player,
        score: number,
        _killsLegacy: number,
        mouse: MouseState,
        spawnSystem: SpawnSystem,
        megaBoss: Enemy | null,
        powerSystem: PowerSystem
    ): void {
        const c = this.ctx;
        c.clearRect(0, 0, this.screenW, this.screenH);

        // v0.23.1: scale HUD pills (top + corners) — mobile dostaje uiScale=0.7
        c.save();
        c.scale(this.uiScale, this.uiScale);

        // HP pill 230px (3-cyfrowe "700/700" sie miesci)
        this.drawHPPill(player, 14, 8, 230, 54, 16);

        // === Centralny SCORE pill (hero leaderboard metric — zloty, prominentny) ===
        const SW = 230;
        const gx2 = Math.round((this.screenW / this.uiScale) / 2 - SW / 2);
        c.fillStyle = 'rgba(8,8,18,0.78)';
        c.beginPath();
        c.roundRect(gx2, 8, SW, 54, 16);
        c.fill();
        // zlotawy border — sygnalizuje "to sie liczy"
        c.strokeStyle = 'rgba(241,196,15,0.4)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(gx2, 8, SW, 54, 16);
        c.stroke();

        // Label "SCORE" — lewo, wycentrowane pionowo (ta sama os co liczba = wyjustowane), zlote
        // v0.46.0: label tej samej wielkosci co WARTOSC (34px) — req Mariusz
        const scoreLabel = tr('hud.score');
        const scoreCy = 8 + 54 / 2;
        c.font = `34px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.9)';
        c.lineWidth = 4;
        c.strokeText(scoreLabel, gx2 + 14, scoreCy);
        c.fillStyle = '#f1c40f';
        c.fillText(scoreLabel, gx2 + 14, scoreCy);

        // Liczba — duza zlota (34px, hero leaderboard metric), prawo, wycentrowane pionowo
        c.font = `34px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.8)';
        c.lineWidth = 5;
        c.strokeText(String(score), gx2 + SW - 14, scoreCy + 1);
        c.fillStyle = '#f1c40f';
        c.fillText(String(score), gx2 + SW - 14, scoreCy + 1);

        const kx = (this.screenW / this.uiScale) - 14 - 230;
        this.drawKillsPill(spawnSystem, kx, 8, 230, 54, 16);

        // SEASON KIT — chip licznika pod KILLS, w tej samej (prawej) kolumnie.
        // Nie tworzy nowej kolumny ani nie rozpycha gornego rzedu; zsuwa natomiast
        // magnes i turbo o swoja wysokosc (patrz seasonRowShift()).
        if (this.seasonCount !== null) {
            // 200 px zamiast 150 — chip niesie teraz PODPIS ("Książki"/"Books")
            // obok wartosci, wiec potrzebuje tyle szerokosci co pill KILLS minus zapas.
            this.drawSeasonPill(kx + 230 - 200, 68, 200, 34, 12);
        }

        // === SUPER pill (scalony gem-charge + super charges) — lewa kolumna, drugi rzad ===
        this.drawSuperPill(player, spawnSystem, 14, 70, 172, 54, 14);

        // FAZA CTF F3 — panel flag (lewa kolumna, trzeci rzad) + carry banner (top-center)
        this.drawCtfFlagPanel();
        this.drawCtfCarryBanner();
        this.drawCastlePanel(); // OBRON ZAMEK F5
        this.drawQueenPanel(); // SAVE THE QUEEN Q2

        this.drawNotifs();

        // Magnet + turbo status — right-aligned tu tez sa scaled
        this.drawMagnetStatus(powerSystem);
        this.drawTurboStatus(player);

        // SuperPowerBar (bottom-center) — hidden on mobile (zastepuje SuperButton)
        if (this.showPowerBar) {
            this.drawSuperPowerBar(powerSystem);
        }

        if (megaBoss && megaBoss.active) {
            this.drawMegaBossBar(megaBoss);
        }

        c.restore();

        // === Unscaled overlays (full screen size, niezależne od uiScale) ===

        // FAZA CTF F3 — strzalki krawedziowe (full-screen space, po restore)
        this.drawCtfEdgeArrows();
        this.drawCastleEdgeArrows(); // OBRON ZAMEK F5
        this.drawQueenEdgeArrows();  // SAVE THE QUEEN Q2
        this.drawCastleRespawn();    // OBRON ZAMEK F5
        this.drawCastleBuildCountdown(); // P1
        this.drawCastleKeepAlarm();      // P1
        // v0.143.0 — licznik tarczy bazy (world-space, ta sama projekcja co strzalki)
        this.drawCtfShieldCountdown();

        // Crosshair — hidden on mobile (no mouse, joystick zastepuje)
        if (this.showCrosshair) {
            this.drawCrosshair(mouse);
        }

        if (this.comboTextTimer > 0) {
            c.save();
            c.translate(this.screenW / 2, this.screenH / 2 - 120);
            // v0.46.0: 22px bold (faux-bold mushy) → 30px bez bolda + grubszy obrys (czytelnosc + hype)
            c.font = `30px "${FONT_FAMILY}", cursive`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.strokeStyle = '#000';
            c.lineWidth = 7;
            c.strokeText(this.comboText, 0, 0);
            c.fillStyle = '#e67e22';
            c.fillText(this.comboText, 0, 0);
            c.restore();
        }

        this.drawMegaBossAlert();
        this.drawCtfEnrageBanner();
        this.drawCtfBreachBanner();
        this.drawCastleBanner(); // OBRON ZAMEK F5
    }
    
    clear(): void {
        this.ctx.clearRect(0, 0, this.screenW, this.screenH);
    }
}