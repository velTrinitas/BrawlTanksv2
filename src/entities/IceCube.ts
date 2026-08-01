import * as PIXI from 'pixi.js';
import type { ICollidable } from '../types/MapType';
import type { EffectsManager } from '../rendering/Effects';
import type { AudioSys } from '../audio/AudioSys';

/**
 * IceCube — niszczalna kostka lodu (ARC-R1 "Lodowa Arena", wzorzec: Crate 1:1).
 *
 * Mechanika (decyzje Mariusza 2026-08-01):
 *  - Solid collidable: blokuje czolgi (padded box w buildings) i pociski (solidBuildings).
 *  - Pociski niszcza przez duck-typing takeDamage w Bullet.ts (zero zmian w Bullet).
 *  - Kazde trafienie CIEMNIEJSZY GRANAT (3 stany wizualne wg HP) + mini rozbryzg.
 *  - HP=0 => "lekki wybuch lodu" (rozbryzg, ZERO obrazen) + onShatter callback
 *    (main.ts losuje ~28% szansy na gem) + respawn po 60s (mechanizm Crate).
 *
 * Wizual: izometryczny szescian 2.5D baked-once w PIXI.Graphics, paleta
 * ARCTIC_PALETTE, seed = pekniecia/jitter. Redraw TYLKO przy zmianie stanu
 * obrazen (rzadkie zdarzenie) — koszt per-frame = 0.
 * ICollidable: x/y = TOP-LEFT (layout ARCTIC_ICE_CUBES_LAYOUT podaje top-left).
 */

export const ICE_CUBE_SIZE = 56;
const ICE_HP = 250;          // twardy(100dmg)=3 hity, zwiad(80)=4, snajper(300)=1
const RESPAWN_TIME = 60;     // sekundy (jak Crate)
const ISO_RISE = 14;         // top-face przesuniety w gore (bryla 2.5D)
const SIDE_DEPTH = 10;       // widoczna sciana frontowa

/**
 * Paleta per stan obrazen: 0 = czysty lod, 1 = pekniety, 2 = granatowy (tuz przed rozpadem).
 * Feedback Mariusza (playtest R1): stage 0 przyciemniony + "brudniejsza biel" —
 * tafla ma albedo #e8f4f8, kostki musza byc wyraznie ciemniejsze zeby sie nie zlewac.
 */
const STAGE_COLORS = [
    { top: 0xccdde6, front: 0xa3c2d4, side: 0x86a9be, edge: 0xeef5f8, crack: 0x4a6fa5, crackAlpha: 0.30 },
    { top: 0xa7c6d8, front: 0x82abc4, side: 0x6690ae, edge: 0xd4e5ee, crack: 0x1b3a6b, crackAlpha: 0.55 },
    { top: 0x4a6fa5, front: 0x2c4f80, side: 0x1b3a6b, edge: 0x9fc4d8, crack: 0x15323d, crackAlpha: 0.85 },
] as const;

/** Kolor akcentow lodu (mini-rozbryzg trafienia, ring, blysk respawnu). */
const SPLASH_LIGHT = 0xbfe6f5;

function makeRng(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

export class IceCube implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    public isDestroyed: boolean = false;

    private origX: number;
    private origY: number;
    private hp: number = ICE_HP;
    private respawnTimer: number = 0;
    private seed: number;
    private stage: number = 0;

    private effects: EffectsManager;
    private audio: AudioSys;
    private onShatter: ((cx: number, cy: number) => void) | null;

    private aoContainer: PIXI.Container;
    private cubeContainer: PIXI.Container;
    private gfx: PIXI.Graphics;

    constructor(
        x: number,
        y: number,
        seed: number,
        worldContainer: PIXI.Container,
        effects: EffectsManager,
        audio: AudioSys,
        onShatter?: (cx: number, cy: number) => void,
    ) {
        this.x = x;
        this.y = y;
        this.w = ICE_CUBE_SIZE;
        this.h = ICE_CUBE_SIZE;
        this.origX = x;
        this.origY = y;
        this.seed = seed;
        this.effects = effects;
        this.audio = audio;
        this.onShatter = onShatter ?? null;

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.aoContainer = new PIXI.Container();
        this.aoContainer.zIndex = -86; // jak AO crate'ow / budynkow
        this.aoContainer.x = x;
        this.aoContainer.y = y;
        worldContainer.addChild(this.aoContainer);

        this.cubeContainer = new PIXI.Container();
        this.cubeContainer.x = x;
        this.cubeContainer.y = y;
        this.cubeContainer.zIndex = y + ICE_CUBE_SIZE; // Y-sort po dolnej krawedzi
        worldContainer.addChild(this.cubeContainer);

        this.gfx = new PIXI.Graphics();
        this.cubeContainer.addChild(this.gfx);

        this.drawAO();
        this.drawCube();
    }

    /** Miekki cien kontaktowy pod kostka (SE — slonce NW jak cala Arktyka). */
    private drawAO(): void {
        const g = new PIXI.Graphics();
        g.beginFill(0x15323d, 0.20);
        g.drawEllipse(ICE_CUBE_SIZE / 2 + 4, ICE_CUBE_SIZE * 0.92, ICE_CUBE_SIZE * 0.58, ICE_CUBE_SIZE * 0.20);
        g.endFill();
        this.aoContainer.addChild(g);
    }

    /** Izometryczny szescian lodu — redraw przy zmianie stanu obrazen. */
    private drawCube(): void {
        const g = this.gfx;
        const S = ICE_CUBE_SIZE;
        const C = STAGE_COLORS[this.stage];
        const rng = makeRng(this.seed + this.stage * 977);
        g.clear();

        // sciana frontowa (dol)
        g.beginFill(C.front);
        g.drawRect(0, S - SIDE_DEPTH, S, SIDE_DEPTH);
        g.endFill();
        // ciemniejszy pas przy ziemi
        g.beginFill(C.side);
        g.drawRect(0, S - 4, S, 4);
        g.endFill();

        // top-face (parallelogram uniesiony o ISO_RISE)
        g.beginFill(C.top);
        g.drawPolygon([0, S - SIDE_DEPTH, 0, -ISO_RISE + 6, 6, -ISO_RISE, S - 6, -ISO_RISE, S, -ISO_RISE + 6, S, S - SIDE_DEPTH]);
        g.endFill();

        // blik NW (od slonca) na gornej krawedzi
        g.beginFill(C.edge, this.stage === 0 ? 0.85 : 0.5);
        g.drawPolygon([0, -ISO_RISE + 6, 6, -ISO_RISE, S - 6, -ISO_RISE, S * 0.55, -ISO_RISE + 5, 4, -ISO_RISE + 7]);
        g.endFill();

        // wewnetrzny refleks (szklo lodu) — stonowany (brudniejsza biel)
        g.beginFill(0xffffff, this.stage === 0 ? 0.16 : 0.08);
        g.drawEllipse(S * 0.32, S * 0.30, S * 0.18, S * 0.26);
        g.endFill();

        // pekniecia (gestsze im wyzszy stan obrazen)
        const crackCount = 1 + this.stage * 2 + Math.floor(rng() * 2);
        g.lineStyle(1.5 + this.stage * 0.5, C.crack, C.crackAlpha);
        for (let i = 0; i < crackCount; i++) {
            let px = 6 + rng() * (S - 12);
            let py = -ISO_RISE + 8 + rng() * (S * 0.5);
            g.moveTo(px, py);
            const segs = 2 + Math.floor(rng() * 2);
            for (let sIdx = 0; sIdx < segs; sIdx++) {
                px += (rng() - 0.5) * S * 0.4;
                py += rng() * S * 0.3;
                g.lineTo(Math.max(2, Math.min(S - 2, px)), Math.min(S - 2, py));
            }
        }
        g.lineStyle(0);

        // zloty glint (echo tafli) — tylko czysty lod
        if (this.stage === 0) {
            g.beginFill(0xfff9e6, 0.8);
            g.drawCircle(S * 0.68 + rng() * 6, -ISO_RISE + 10 + rng() * 8, 1.6);
            g.endFill();
        }
    }

    // ── DAMAGE + RESPAWN (wzorzec Crate) ──────────────────────────────────────
    public takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.isDestroyed) return;
        this.hp -= dmg;
        if (this.hp <= 0) {
            this.shatter();
            return;
        }
        // przelicz stan wizualny (granatowienie)
        const newStage = this.hp > ICE_HP * 0.6 ? 0 : this.hp > ICE_HP * 0.25 ? 1 : 2;
        if (newStage !== this.stage) {
            this.stage = newStage;
            this.drawCube();
        }
        // mini rozbryzg + drgniecie
        this.effects.spawnEnemyHitSparks(hitX, hitY, SPLASH_LIGHT);
        const shakeAmt = 1.5;
        this.cubeContainer.x = this.origX + (Math.random() - 0.5) * shakeAmt;
        this.cubeContainer.y = this.origY + (Math.random() - 0.5) * shakeAmt;
        setTimeout(() => {
            if (this.cubeContainer && !this.isDestroyed) {
                this.cubeContainer.x = this.origX;
                this.cubeContainer.y = this.origY;
            }
        }, 80);
    }

    private shatter(): void {
        this.isDestroyed = true;
        this.respawnTimer = RESPAWN_TIME;
        this.w = 0;
        this.h = 0;
        this.cubeContainer.visible = false;
        this.aoContainer.visible = false;

        // "lekki wybuch lodu": rozbryzg odlamkow + dymek lodowy + maly ring — ZERO obrazen
        const cx = this.origX + ICE_CUBE_SIZE / 2;
        const cy = this.origY + ICE_CUBE_SIZE / 2;
        this.effects.spawnIceShatter(cx, cy);
        this.effects.spawnShockwaveRing(cx, cy, 46, SPLASH_LIGHT);
        this.audio.playCrateBreak(); // TODO: dedykowany ice-crack sfx (asset od Mariusza)

        this.onShatter?.(cx, cy); // main.ts: ~28% szansa na gem
    }

    private respawn(): void {
        this.isDestroyed = false;
        this.hp = ICE_HP;
        this.stage = 0;
        this.w = ICE_CUBE_SIZE;
        this.h = ICE_CUBE_SIZE;
        this.drawCube();
        this.cubeContainer.visible = true;
        this.aoContainer.visible = true;
        // sensoryka odrodzenia: blysk zamarzniecia
        this.effects.spawnEnemyHitSparks(this.origX + ICE_CUBE_SIZE / 2, this.origY + ICE_CUBE_SIZE / 2, SPLASH_LIGHT);
    }

    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        if (this.isDestroyed) {
            this.respawnTimer -= 1 / 60;
            if (this.respawnTimer <= 0) this.respawn();
        }
    }

    /** Padded hitbox dla PLAYER collision (wzorzec Crate v0.34.1) — do buildings[]. */
    public getExtraCollidables(): ICollidable[] {
        const self = this;
        const PAD = 8;
        return [{
            get x() { return self.isDestroyed ? -10000 : self.origX - PAD; },
            get y() { return self.isDestroyed ? -10000 : self.origY - PAD; },
            get w() { return self.isDestroyed ? 0 : ICE_CUBE_SIZE + PAD * 2; },
            get h() { return self.isDestroyed ? 0 : ICE_CUBE_SIZE + PAD * 2; },
            update: () => { /* static */ },
        }];
    }
}
