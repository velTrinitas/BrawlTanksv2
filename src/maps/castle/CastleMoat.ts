import * as PIXI from 'pixi.js';
import { CASTLE_HEX } from './castlePalette';
import type { CastleRect } from '../CastleMap';
import { isCastleArtV2 } from '../../config/castleArtFlag';
import { CastleMoatV2 } from './castleMoatV2';
import { moatLoopFrom, type MoatLoop } from './castleMoatLoop';

/**
 * CastleMoat — fosa zamku (OBRON ZAMEK F2). Uogolnienie RuinsFosa na N pasow:
 * 8 prostokatnych stref slow 0.5x (passable), wyciecia na mosty NIE sa pasami
 * (most = pelna predkosc, jak deski nad rzeka). Woda jest WYPIEKANA w gruncie
 * (CastleMap.buildCastleTexture) — runtime rysuje TYLKO cienka pulsujaca ramke
 * ostrzegawcza + rzadkie zmarszczki (jedna Graphics na wszystkie pasy, klasa B-light).
 */

const PALETTE = {
    ripple: CASTLE_HEX.moatFoam,
    foam: 0xd6eef0,
    warningRim: 0x7fb3bb,
};

interface Ripple { strip: number; t: number; u: number; speed: number; phase: number; len: number }

export class CastleMoat {
    private strips: CastleRect[];
    private loop: MoatLoop;
    private container: PIXI.Container;
    private gfx: PIXI.Graphics;
    private ripples: Ripple[];
    /** CASTLE ART v2: nurt TilingSprite + piana + plusk (null = legacy Graphics co klatke). */
    private v2: CastleMoatV2 | null = null;

    constructor(strips: readonly CastleRect[], worldContainer: PIXI.Container, bridges: readonly CastleRect[] = [], lowFx = false) {
        this.strips = [...strips];
        this.loop = moatLoopFrom(strips);
        this.container = new PIXI.Container();
        this.container.zIndex = 5; // nad gruntem, pod czolgami
        worldContainer.addChild(this.container);
        this.gfx = new PIXI.Graphics();
        this.container.addChild(this.gfx);
        if (isCastleArtV2()) this.v2 = new CastleMoatV2(strips, bridges, worldContainer, lowFx);

        this.ripples = [];
        const PER_STRIP = 5;
        this.strips.forEach((_, si) => {
            for (let i = 0; i < PER_STRIP; i++) {
                this.ripples.push({
                    strip: si,
                    t: i / PER_STRIP,
                    u: 0.2 + ((i * 37 + si * 11) % 7) / 10,
                    speed: 0.18 + ((i * 13 + si) % 10) * 0.04,
                    phase: i * 0.7 + si,
                    len: 16 + ((i * 11 + si * 3) % 22),
                });
            }
        });
    }

    /** Punkt (world) w spowalniajacej wodzie? Mosty sa wyciete z pasow, wiec nie spowalniaja. */
    public isPointInside(px: number, py: number): boolean {
        let hit = false;
        for (const s of this.strips) {
            if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) { hit = true; break; }
        }
        if (!hit) return false;
        // v0.252.0 (SIM 17): rogi zewnetrzne fosy sa lukiem (woda skreca, klin rogu = laka z krzakami).
        // W kwadracie rogu slow tylko w promieniu szerokosci kanalu od wewnetrznego naroznika — strefa = to, co narysowane.
        const L = this.loop;
        const cx = px < L.i0 ? L.i0 : px > L.i1 ? L.i1 : NaN;
        const cy = py < L.i0 ? L.i0 : py > L.i1 ? L.i1 : NaN;
        if (Number.isNaN(cx) || Number.isNaN(cy)) return true;
        const r = L.half * 2;
        return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
    }

    /** tanks: czolgi do plusku/kilwatera (tylko v2; legacy ignoruje). */
    public update(tanks: readonly { x: number; y: number }[] = []): void {
        if (this.v2) { this.v2.update(tanks, (x, y) => this.isPointInside(x, y)); return; }
        const time = Date.now();
        const g = this.gfx;
        g.clear();
        const pulse = 0.22 + Math.sin(time / 700) * 0.1;
        g.lineStyle(2, PALETTE.warningRim, pulse);
        for (const s of this.strips) g.drawRect(s.x, s.y, s.w, s.h);
        g.lineStyle(0);
        for (const rp of this.ripples) {
            const s = this.strips[rp.strip];
            const horizontal = s.w > s.h;
            const along = horizontal ? s.w : s.h;
            const across = horizontal ? s.h : s.w;
            // F6 (#7): nurt w OBIEGU zgodnie z ruchem wskazowek: N -> +x, E -> +y, S -> -x, W -> -y
            const id = s.id;
            const forward = id.startsWith('moatN') || id.startsWith('moatE');
            const raw = ((rp.t * along) + time * rp.speed * 0.09) % along;
            const pos = forward ? raw : along - raw;
            const off = rp.u * across + Math.sin(time / 900 + rp.phase) * 3;
            const a = 0.28 + Math.sin(time / 500 + rp.phase) * 0.2;
            if (a <= 0.08) continue;
            const end = Math.min(pos + rp.len, along);
            g.lineStyle(1.6, PALETTE.ripple, a);
            if (horizontal) { g.moveTo(s.x + pos, s.y + off); g.lineTo(s.x + end, s.y + off); }
            else { g.moveTo(s.x + off, s.y + pos); g.lineTo(s.x + off, s.y + end); }
            g.lineStyle(1.2, PALETTE.foam, a * 0.5);
            // piana na CZOLE smugi (czolo zalezy od kierunku nurtu)
            const head = forward ? end : pos;
            if (horizontal) { g.moveTo(s.x + head - (forward ? 4 : -4), s.y + off); g.lineTo(s.x + head, s.y + off); }
            else { g.moveTo(s.x + off, s.y + head - (forward ? 4 : -4)); g.lineTo(s.x + off, s.y + head); }
        }
        g.lineStyle(0);
    }

    public destroy(): void {
        this.v2?.destroy(); this.v2 = null;
        this.container.destroy({ children: true });
    }
}
