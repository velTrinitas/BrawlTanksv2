import * as PIXI from 'pixi.js';
import type { Enemy } from '../../entities/Enemy';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import type { PatrolTractor } from './PatrolTractor';
import { REAPER, type ReaperTuning } from '../../config/tropicsEvents';

/**
 * TROPICS ART v2 / T6.3 — ZNIWIARKA-POTWOR (traktor patrolowy).
 *
 * N trafien traktora POCISKIEM GRACZA w oknie 6 s -> TELEGRAF 1 s (czerwone migajace swiatla,
 * wysuniete noze, syrena) -> 8 s szalu: traktor jedzie 3x szybciej po SWOJEJ trasie (drogi),
 * bez postojow, i kosi: wrog w zasiegu nozy = duze obrazenia + odrzut (raz na wroga na szal),
 * T6.3c: w szale GONI najblizszego gracza (skret ograniczony — da sie uskoczyc) i gryzie zebami hedera
 * REAPER.biteDmg co biteSteps, tylko strefa PRZED maszyna (Czytelnosc: bok/tyl kombajnu jest bezpieczny). Za traktorem leci siano. Cooldown 120 s.
 * Traktor zawsze lapie pociski gracza (wyglada na twardy — Czytelnosc), ale nadal nie blokuje jazdy.
 *
 * SYMULACJA: `update()` ze stalego kroku logiki, deterministycznie.
 */
export interface ReaperHooks {
    getEnemies(): readonly Enemy[];
    getPlayers(): ReadonlyArray<{ x: number; y: number; hp: number; maxHp: number }>;
    damageEnemy(e: Enemy, dmg: number): boolean;
    damagePlayer(index: number, amount: number): void;
    notify(key: 'reaper', x: number, y: number): void;
}

type Phase = 'idle' | 'telegraph' | 'rage';

export class ReaperTractor {
    private step = 0;
    private phase: Phase = 'idle';
    private phaseT = 0;
    private hits: number[] = [];
    private cooldownUntil = 0;
    private readonly hitSet = new Set<object>();
    /** krok ostatniego ugryzienia per gracz (T6.3c). */
    private readonly biteAt = new Map<object, number>();
    private readonly pushes: Array<{ e: Enemy; kx: number; ky: number }> = [];
    private readonly overlay: PIXI.Container;
    private readonly lights: PIXI.Graphics;
    /** bazowy mnoznik predkosci traktora (kombajn v2 = 1.2) — przywracany po szale. */
    private readonly baseSpeed: number;
    /** Faza dla wizualu kombajnu. */
    get phaseName(): 'idle' | 'telegraph' | 'rage' { return this.phase; }

    constructor(
        private readonly tractor: PatrolTractor,
        private readonly effects: EffectsManager,
        private readonly audio: AudioSys,
        private readonly tune: ReaperTuning,
        private readonly hooks: ReaperHooks,
    ) {
        this.baseSpeed = tractor.speedMult;
        // nakladka szalu w ukladzie traktora ("gora" sprite'a = przod): noze + swiatla (rysowane RAZ)
        this.overlay = new PIXI.Container();
        const blades = new PIXI.Graphics();
        blades.beginFill(0x2a2a2a); blades.drawRect(-34, -48, 68, 7); blades.endFill();
        blades.beginFill(0xd8dde2); blades.lineStyle(1, 0x5a5a5a);
        for (let i = -32; i < 32; i += 9) blades.drawPolygon([i, -48, i + 4, -58, i + 8, -48]);
        blades.endFill();
        this.overlay.addChild(blades);
        this.lights = new PIXI.Graphics();
        for (const lx of [-12, 12]) {
            this.lights.beginFill(0xff2a1a, 0.35); this.lights.drawCircle(lx, -6, 11); this.lights.endFill();
            this.lights.beginFill(0xff4a3a); this.lights.drawCircle(lx, -6, 4.5); this.lights.endFill();
        }
        this.overlay.addChild(this.lights);
        this.overlay.visible = false;
        tractor.container.addChild(this.overlay);
    }

    /** Punkt swiata -> uklad maszyny (f = do przodu, r = w prawo). */
    private toLocal(x: number, y: number): [number, number] {
        const mv = this.tractor.heading - Math.PI / 2, ux = Math.cos(mv), uy = Math.sin(mv);
        const dx = x - this.tractor.x, dy = y - this.tractor.y;
        return [dx * ux + dy * uy, -dx * uy + dy * ux];
    }

    /** Hitbox w ksztalcie kombajnu: korpus + szerszy heder z przodu, poszerzony o pad. */
    private inShape(x: number, y: number, pad: number): boolean {
        const [f, r] = this.toLocal(x, y), ar = Math.abs(r);
        if (f < REAPER.bodyBack - pad || f > REAPER.headerFront + pad) return false;
        return f <= REAPER.bodyFront ? ar <= REAPER.bodyHalfW + pad : ar <= REAPER.headerHalfW + pad;
    }

    /** Strefa zebow = sam heder (przod maszyny). */
    private inTeeth(x: number, y: number): boolean {
        const [f, r] = this.toLocal(x, y), pad = REAPER.bitePad;
        return f >= REAPER.bodyFront - pad && f <= REAPER.headerFront + pad && Math.abs(r) <= REAPER.headerHalfW + pad;
    }

    /** Pocisk gracza vs traktor. true = pocisk zuzyty. */
    hitTestBullet(x: number, y: number, r: number): boolean {
        if (!this.inShape(x, y, r)) return false;
        this.effects.spawnWallImpact(x, y);
        if (this.phase === 'idle' && this.step >= this.cooldownUntil) {
            this.hits.push(this.step);
            this.hits = this.hits.filter(s => this.step - s <= REAPER.windowSteps);
            if (this.hits.length >= this.tune.hitsToWake) this.startTelegraph();
            else if (this.hits.length >= this.tune.hitsToWake - 2) {
                this.effects.spawnFloatingText(this.tractor.x, this.tractor.y - 40, 'WRRR!', 0xff8a6a);
            }
        }
        return true;
    }

    private startTelegraph(): void {
        this.hits = [];
        this.phase = 'telegraph'; this.phaseT = REAPER.telegraphSteps;
        this.overlay.visible = true;
        this.audio.playSiren();
        this.effects.shake(5, 10);
        this.hooks.notify('reaper', this.tractor.x, this.tractor.y);
    }

    update(): void {
        this.step++;
        for (let i = this.pushes.length - 1; i >= 0; i--) {
            const p = this.pushes[i];
            if (!p.e.active) { this.pushes.splice(i, 1); continue; }
            p.e.x += p.kx; p.e.y += p.ky; p.kx *= 0.88; p.ky *= 0.88;
            if (Math.abs(p.kx) < 0.15 && Math.abs(p.ky) < 0.15) this.pushes.splice(i, 1);
        }
        if (this.phase === 'idle') return;
        this.phaseT--;
        this.lights.alpha = (this.step >> 3) % 2 ? 1 : 0.25;
        if (this.phase === 'telegraph') {
            this.tractor.speedMult = 0; // stoi i "rozgrzewa sie"
            if (this.phaseT <= 0) { this.phase = 'rage'; this.phaseT = REAPER.rageSteps; this.hitSet.clear(); }
            return;
        }
        // RAGE
        this.tractor.speedMult = REAPER.speedMult;
        this.tractor.skipPauses = true;
        if (this.step % 6 === 0) this.effects.spawnHayBits(this.tractor.x, this.tractor.y, 3, false);
        for (const e of this.hooks.getEnemies()) {
            if (!e.active || this.hitSet.has(e)) continue;
            const dx = e.x - this.tractor.x, dy = e.y - this.tractor.y;
            if (!this.inShape(e.x, e.y, REAPER.mowPad)) continue;
            this.hitSet.add(e);
            const boss = e as Enemy & { isBoss?: boolean; isMegaBoss?: boolean };
            this.effects.spawnBlastFx(e.x, e.y, 46, 0xff8a3a, false);
            this.effects.spawnHayBits(e.x, e.y, 8, true);
            if (!this.hooks.damageEnemy(e, this.tune.mowDmg * (boss.isBoss || boss.isMegaBoss ? REAPER.bossMult : 1))) {
                const d = Math.hypot(dx, dy) || 1;
                this.pushes.push({ e, kx: (dx / d) * 9, ky: (dy / d) * 9 });
            }
        }
        // T6.3c: POSCIG + ZEBY — goni najblizszego zywego gracza i gryzie przodem hedera
        const players = this.hooks.getPlayers();
        let best = -1, bestD = Infinity;
        players.forEach((p, i) => {
            if (p.hp <= 0) return;
            const d = (p.x - this.tractor.x) ** 2 + (p.y - this.tractor.y) ** 2;
            if (d < bestD) { bestD = d; best = i; }
        });
        this.tractor.chaseTarget = best >= 0 ? players[best] : null;
        this.tractor.speedMult = best >= 0 ? REAPER.chaseSpeedMult : REAPER.speedMult;
        players.forEach((p, i) => {
            if (p.hp <= 0 || !this.inTeeth(p.x, p.y)) return;
            const last = this.biteAt.get(p);
            if (last !== undefined && this.step - last < REAPER.biteSteps) return;
            this.biteAt.set(p, this.step);
            this.hooks.damagePlayer(i, REAPER.biteDmg);
            this.effects.spawnHayBits(p.x, p.y, 4, true);
            this.effects.shake(4, 6);
        });
        if (this.phaseT <= 0) {
            this.phase = 'idle';
            this.overlay.visible = false;
            this.tractor.speedMult = this.baseSpeed;
            this.tractor.skipPauses = false;
            this.tractor.chaseTarget = null;
            this.tractor.rejoinNearest();
            this.biteAt.clear();
            this.cooldownUntil = this.step + REAPER.cooldownSteps;
        }
    }
}
