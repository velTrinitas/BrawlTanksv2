import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';

/**
 * IglooYeti — obronca igloo (ARC-R2b "Lodowa Arena").
 *
 * Mechanika (pomysl Mariusza — mieszkaniec igloo mszczacy sie za ostrzal; postac
 * zmieniona na YETI po review: stwor fantastyczny zamiast realnej grupy etnicznej +
 * sniezki zamiast molotowa = zero ryzyka rating/App Store, ta sama frajda):
 *   ostrzal igloo (Igloo.takeDamage akumuluje ~3 trafienia) => onProvoked =>
 *   YETI wypada z tunelu z RYKIEM (shake+scale pulse) => przez ~9s ciska SNIEZKAMI
 *   (lot lukiem, TELEGRAF: pulsujacy ring celu + rosnacy cien — Czytelnosc #1)
 *   => wraca do igloo => cooldown 20s. Sniezka: trafienie w promieniu 46px = dmg
 *   (aplikuje main.ts przez onImpact — invulnerability/tutorial obslugiwane centralnie).
 *
 * Fairness gates: yeti angazuje sie tylko gdy gracz w zasiegu (prowokacja przez
 * wrogow z daleka nie karze gracza); podczas rzucania gracz poza zasieg => odwrot.
 * Yeti jest passable i niesmiertelne (zjawisko natury, nie wrog do zabicia).
 */

const EMERGE_MS = 500;
const ROAR_MS = 900;
const THROW_PHASE_MS = 9000;
const RETREAT_MS = 600;
const COOLDOWN_MS = 20000;
const THROW_EVERY_MS = 1050;
const SNOWBALL_FLIGHT_MS = 700;
const YETI_SCALE = 2;                    // feedback Mariusza: yeti +100% (wiekszy, grozniejszy)
const SNOWBALL_ARC_H = 62;
const ENGAGE_RANGE = 750;
const DISENGAGE_RANGE = 950;
export const SNOWBALL_HIT_RADIUS = 46;
export const SNOWBALL_DMG = 60;

type YetiState = 'hidden' | 'emerging' | 'roaring' | 'throwing' | 'retreating';

interface Snowball {
    sx: number; sy: number;   // start
    tx: number; ty: number;   // cel (telegrafowany)
    startAt: number;
}

const C = {
    // Feedback Mariusza: yeti CIEMNIEJSZY (bialy zlewal sie z tafla) — szaro-stalowe futro
    fur:      0x8fa0ad,
    furShade: 0x64747f,
    face:     0x45525c,
    eye:      0x11181e,
    mouth:    0x5a2f3a,
    snow:     0xf4f9fc,   // sniezki zostaja jasne (kontrast vs ciemny yeti)
    snowShade: 0xcfe0ea,
} as const;

export class IglooYeti {
    private homeX: number;
    private homeY: number;

    private container: PIXI.Container;
    private body: PIXI.Container;
    private armFront: PIXI.Graphics;
    private mouthGfx: PIXI.Graphics;
    private gfxFx: PIXI.Graphics;      // sniezki + telegrafy (world-space overlay)

    private effects: EffectsManager;
    private onImpact: (x: number, y: number) => void;
    private onRoar: (() => void) | null;

    private state: YetiState = 'hidden';
    private stateAt = 0;
    private cooldownUntil = 0;
    private provokePending = false;
    private lastThrowAt = 0;
    private snowballs: Snowball[] = [];
    private roarFired = false;

    constructor(
        iglooCx: number,
        iglooCy: number,
        iglooSize: number,
        worldContainer: PIXI.Container,
        effects: EffectsManager,
        onImpact: (x: number, y: number) => void,
        onRoar?: () => void,
    ) {
        // Yeti staje przed tunelem (poludnie igloo)
        this.homeX = iglooCx;
        this.homeY = iglooCy + iglooSize * 0.75;
        this.effects = effects;
        this.onImpact = onImpact;
        this.onRoar = onRoar ?? null;

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = this.homeX;
        this.container.y = this.homeY;
        this.container.zIndex = this.homeY + 20;
        this.container.visible = false;
        worldContainer.addChild(this.container);

        this.body = new PIXI.Container();
        this.container.addChild(this.body);

        const g = new PIXI.Graphics();
        this.body.addChild(g);
        this.drawYeti(g);

        this.armFront = new PIXI.Graphics();
        this.drawArm(this.armFront);
        this.armFront.x = 10;
        this.armFront.y = -14;
        this.body.addChild(this.armFront);

        this.mouthGfx = new PIXI.Graphics();
        this.mouthGfx.beginFill(C.mouth);
        this.mouthGfx.drawEllipse(0, -27, 3.4, 4.2);
        this.mouthGfx.endFill();
        this.mouthGfx.visible = false;
        this.body.addChild(this.mouthGfx);

        this.gfxFx = new PIXI.Graphics();
        this.gfxFx.zIndex = 1500; // sniezki lataja NAD wszystkim (widocznosc telegrafu)
        worldContainer.addChild(this.gfxFx);
    }

    /** Kudlate bialo-szare biped ~46px (rysowane raz; pozy przez transformy). */
    private drawYeti(g: PIXI.Graphics): void {
        // cien
        g.beginFill(0x15323d, 0.22);
        g.drawEllipse(0, 2, 14, 4.5);
        g.endFill();
        // nogi (krotkie, kudlate)
        g.beginFill(C.furShade);
        g.drawEllipse(-6, -4, 5, 7);
        g.drawEllipse(6, -4, 5, 7);
        g.endFill();
        // korpus (pekaty, futrzany — 3 nachodzace elipsy)
        g.beginFill(C.fur);
        g.drawEllipse(0, -16, 13, 13);
        g.drawEllipse(-7, -12, 7, 9);
        g.drawEllipse(7, -12, 7, 9);
        g.endFill();
        // brzuch
        g.beginFill(C.face, 0.55);
        g.drawEllipse(0, -13, 7, 8);
        g.endFill();
        // reka tylna (statyczna)
        g.beginFill(C.furShade);
        g.drawEllipse(-11, -16, 4.5, 8);
        g.endFill();
        // glowa
        g.beginFill(C.fur);
        g.drawEllipse(0, -30, 9.5, 9);
        g.endFill();
        // twarz
        g.beginFill(C.face);
        g.drawEllipse(0, -29, 6.2, 5.6);
        g.endFill();
        // gniewne oczy (brwi w dol)
        g.beginFill(C.eye);
        g.drawCircle(-2.4, -30.5, 1.3);
        g.drawCircle(2.4, -30.5, 1.3);
        g.endFill();
        g.lineStyle(1.4, C.eye, 0.9);
        g.moveTo(-4.4, -33.4); g.lineTo(-0.8, -32);
        g.moveTo(4.4, -33.4); g.lineTo(0.8, -32);
        g.lineStyle(0);
        // czubek glowy — kepka
        g.beginFill(C.furShade);
        g.drawEllipse(0, -38, 3.4, 2.2);
        g.endFill();
    }

    private drawArm(g: PIXI.Graphics): void {
        g.beginFill(C.fur);
        g.drawEllipse(4, 0, 5, 9);
        g.endFill();
        g.beginFill(C.furShade);
        g.drawCircle(5, 8, 3.4); // lapa
        g.endFill();
    }

    /** Wolanie z Igloo.onProvoked — start sekwencji (gdy idle i po cooldownie). */
    public provoke(): void {
        if (this.state !== 'hidden') return;
        if (Date.now() < this.cooldownUntil) return;
        this.provokePending = true;
    }

    /** Per-frame: maszyna stanow + lot sniezek. playerX/Y = cel rzutow. */
    public update(_delta: number, playerX: number, playerY: number): void {
        const now = Date.now();
        const playerDist = Math.hypot(playerX - this.homeX, playerY - this.homeY);

        // start sekwencji: sprowokowany + gracz w zasiegu (fairness gate)
        if (this.provokePending && this.state === 'hidden' && playerDist <= ENGAGE_RANGE) {
            this.provokePending = false;
            this.state = 'emerging';
            this.stateAt = now;
            this.roarFired = false;
            this.container.visible = true;
        }

        switch (this.state) {
            case 'emerging': {
                const p = Math.min(1, (now - this.stateAt) / EMERGE_MS);
                this.body.scale.set((0.3 + p * 0.7) * YETI_SCALE);
                this.body.y = (1 - p) * 28; // wylazi z tunelu
                if (p >= 1) { this.state = 'roaring'; this.stateAt = now; }
                break;
            }
            case 'roaring': {
                const p = Math.min(1, (now - this.stateAt) / ROAR_MS);
                if (!this.roarFired) {
                    this.roarFired = true;
                    this.effects.shake(6, 10);
                    this.mouthGfx.visible = true;
                    this.onRoar?.();
                }
                // RYK: pulsowanie + trzesienie (DRAMATYCZNE)
                this.body.scale.set((1 + Math.sin(p * Math.PI) * 0.18) * YETI_SCALE);
                this.body.rotation = Math.sin(p * Math.PI * 8) * 0.06;
                if (p >= 1) {
                    this.mouthGfx.visible = false;
                    this.body.rotation = 0;
                    this.body.scale.set(YETI_SCALE);
                    this.state = 'throwing';
                    this.stateAt = now;
                    this.lastThrowAt = 0;
                }
                break;
            }
            case 'throwing': {
                const elapsed = now - this.stateAt;
                // gracz uciekl za daleko => odwrot (fairness)
                if (elapsed >= THROW_PHASE_MS || playerDist > DISENGAGE_RANGE) {
                    this.state = 'retreating';
                    this.stateAt = now;
                    break;
                }
                if (now - this.lastThrowAt >= THROW_EVERY_MS) {
                    this.lastThrowAt = now;
                    // rzut w AKTUALNA pozycje gracza (bez predykcji — do uniku, fair)
                    this.snowballs.push({
                        sx: this.homeX + 24, sy: this.homeY - 60,
                        tx: playerX, ty: playerY,
                        startAt: now,
                    });
                    // zamach reka
                    this.armFront.rotation = -1.4;
                }
                // reka wraca po zamachu
                this.armFront.rotation *= 0.85;
                // lekkie kolysanie bojowe
                this.body.rotation = Math.sin(now / 160) * 0.04;
                break;
            }
            case 'retreating': {
                const p = Math.min(1, (now - this.stateAt) / RETREAT_MS);
                this.body.scale.set((1 - p * 0.7) * YETI_SCALE);
                this.body.y = p * 28;
                if (p >= 1) {
                    this.state = 'hidden';
                    this.container.visible = false;
                    this.body.scale.set(YETI_SCALE);
                    this.body.y = 0;
                    this.body.rotation = 0;
                    this.cooldownUntil = now + COOLDOWN_MS;
                }
                break;
            }
            case 'hidden':
                break;
        }

        // ── sniezki: lot lukiem + TELEGRAF celu + impakt ──
        const g = this.gfxFx;
        g.clear();
        for (let i = this.snowballs.length - 1; i >= 0; i--) {
            const b = this.snowballs[i];
            const p = (now - b.startAt) / SNOWBALL_FLIGHT_MS;
            if (p >= 1) {
                // ladowanie: rozbryzg + zgloszenie impaktu (main.ts liczy dmg vs gracz)
                this.effects.spawnIceShatter(b.tx, b.ty);
                this.onImpact(b.tx, b.ty);
                this.snowballs.splice(i, 1);
                continue;
            }
            const x = b.sx + (b.tx - b.sx) * p;
            const yFlat = b.sy + (b.ty - b.sy) * p;
            const y = yFlat - Math.sin(p * Math.PI) * SNOWBALL_ARC_H;

            // TELEGRAF: pulsujacy ring celu (od startu — gracz widzi gdzie spadnie)
            g.lineStyle(2, 0xffffff, 0.35 + Math.sin(now / 90) * 0.15);
            g.drawCircle(b.tx, b.ty, SNOWBALL_HIT_RADIUS * (0.75 + p * 0.25));
            g.lineStyle(0);
            // rosnacy cien ladowania
            g.beginFill(0x15323d, 0.10 + p * 0.16);
            g.drawEllipse(x, yFlat, 7 + p * 5, 3 + p * 2);
            g.endFill();
            // sniezka
            g.beginFill(C.snowShade);
            g.drawCircle(x + 1.2, y + 1.2, 5.4);
            g.endFill();
            g.beginFill(C.snow);
            g.drawCircle(x, y, 5);
            g.endFill();
            g.beginFill(0xffffff, 0.8);
            g.drawCircle(x - 1.6, y - 1.6, 1.7);
            g.endFill();
        }
    }
}
