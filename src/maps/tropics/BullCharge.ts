import * as PIXI from 'pixi.js';
import type { Enemy } from '../../entities/Enemy';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import type { ICollidable } from '../../types/MapType';
import { BULL, type BullTuning } from '../../config/tropicsEvents';
import { makeAnimalShadow } from './FarmAnimals';
import { eventAnimalTexture as animalTexture } from './EventAnimals';

/**
 * TROPICS ART v2 / T6.2 — SZARZA BYKA (obora).
 *
 * N trafien obory POCISKIEM GRACZA w oknie 4 s -> brama, byk parska, a na ziemi CZERWONA STRZALKA
 * pokazuje tor szarzy przez 1 s (Czytelnosc #1: gracz ma czas zjechac z linii). Potem byk pedzi
 * prosto przez max 900 px w strone NAJWIEKSZEGO SKUPISKA WROGOW: wrog na linii = duze obrazenia
 * + odrzut (boss ulamek), bele siana na trasie peka, budynek/granica zatrzymuje byka. Gracz na
 * linii: male obrazenia, nigdy wiecej niz 25% maxHp (pelne HP nie zginie). Powrot truchtem.
 *
 * SYMULACJA: `update()` ze stalego kroku logiki, deterministycznie (wybor kierunku = najwieksze
 * skupisko liczone z pozycji wrogow, bez losowania). Odrzut = lista pchniec gasnacych jak Bek.
 */
export interface BullHooks {
    getEnemies(): readonly Enemy[];
    getPlayers(): ReadonlyArray<{ x: number; y: number; maxHp: number }>;
    getObstacles(): readonly ICollidable[];
    /** Bele siana (i inne niszczalne) na trasie — rozbijane. */
    getBreakables(): ReadonlyArray<{ x: number; y: number; w: number; h: number; isDestroyed?: boolean; takeDamage(d: number, x: number, y: number): void }>;
    damageEnemy(e: Enemy, dmg: number): boolean;
    damagePlayer(index: number, amount: number): void;
    notify(key: 'bull' | 'bullHit', x: number, y: number): void;
}

type Phase = 'idle' | 'telegraph' | 'charge' | 'turn' | 'return';

export class BullCharge {
    private step = 0;
    private phase: Phase = 'idle';
    private phaseT = 0;
    private hits: number[] = [];
    private lastWarn = -999;
    private cooldownUntil = 0;
    private x = 0; private y = 0;
    private dirX = 1; private dirY = 0;
    private travelled = 0;
    /** Ile odcinkow szarzy zostalo po biezacym (Mariusz: 2-3 dluzsze proste). */
    private legsLeft = 0;
    private readonly hitSet = new Set<object>();
    private readonly pushes: Array<{ e: Enemy; kx: number; ky: number }> = [];
    private readonly sprite: PIXI.Sprite;
    private readonly shadow: PIXI.Sprite;
    private readonly arrow: PIXI.Graphics;
    private readonly door: { x: number; y: number };

    constructor(
        private readonly house: { x: number; y: number; w: number; h: number },
        world: PIXI.Container,
        private readonly effects: EffectsManager,
        private readonly audio: AudioSys,
        private readonly tune: BullTuning,
        private readonly hooks: BullHooks,
    ) {
        this.door = { x: house.x + house.w / 2, y: house.y + house.h + 10 };
        this.sprite = new PIXI.Sprite(animalTexture('bull', 'stand'));
        this.sprite.anchor.set(0.5, 0.85); this.sprite.scale.set(1.45); this.sprite.visible = false;
        this.shadow = makeAnimalShadow(100, 30); this.shadow.visible = false;
        world.addChild(this.shadow);
        world.addChild(this.sprite);
        // telegraf: przerywana linia toru + grot (rysowane RAZ, obracane; alpha pulsuje)
        const g = new PIXI.Graphics();
        g.beginFill(0xff2a1a, 0.18); g.drawRect(0, -BULL.width, BULL.maxDistance, BULL.width * 2); g.endFill();
        g.lineStyle(4, 0xff3a2a, 0.9);
        for (let d = 0; d < BULL.maxDistance - 60; d += 46) { g.moveTo(d, 0); g.lineTo(d + 26, 0); }
        g.lineStyle(0); g.beginFill(0xff3a2a, 0.95);
        g.drawPolygon([BULL.maxDistance - 60, -26, BULL.maxDistance, 0, BULL.maxDistance - 60, 26]); g.endFill();
        g.zIndex = -70; g.visible = false;
        world.addChild(g);
        this.arrow = g;
        const target = house as typeof house & {
            takeDamage?: (d: number, x: number, y: number) => void;
            takeEnemyDamage?: (d: number, x: number, y: number) => void;
        };
        target.takeDamage = (_d, x, y) => { this.effects.spawnWallImpact(x, y); this.onHit(x, y); };
        target.takeEnemyDamage = (_d, x, y) => { this.effects.spawnWallImpact(x, y); };
    }

    private onHit(x: number, y: number): void {
        if (this.phase !== 'idle' || this.step < this.cooldownUntil) return;
        this.hits.push(this.step);
        this.hits = this.hits.filter(s => this.step - s <= BULL.windowSteps);
        this.effects.spawnHayBits(x, y, 3, false);
        if (this.hits.length >= this.tune.hitsToWake) { this.startTelegraph(); return; }
        if (this.step - this.lastWarn > 30) {
            this.lastWarn = this.step;
            this.effects.spawnFloatingText(this.door.x, this.house.y - 10, 'MUUU!', 0xffb0a0);
            this.audio.playBullSnort();
        }
    }

    /** Kierunek = skupisko wrogow (wrog z najwieksza liczba sasiadow w 200 px), w zasiegu 1100 px. */
    private pickDirection(firstLeg = true): void {
        let best: Enemy | null = null, bestN = -1;
        const es = this.hooks.getEnemies();
        for (const e of es) {
            // tylko wrogowie PRZED obora (front S) — szarza w tyl wbijalaby byka we wlasny budynek
            if (!e.active) continue;
            if (firstLeg && e.y < this.door.y + 20) continue;
            const d0 = Math.hypot(e.x - this.x, e.y - this.y);
            if (d0 > 1100 || d0 < 60) continue;
            let n = 0;
            for (const o of es) if (o.active && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 200 * 200) n++;
            if (n > bestN) { bestN = n; best = e; }
        }
        // brak wrogow: 1. odcinek prosto w dol, kolejne — skret o ~100 st. (zygzak zamiast zawracania)
        let tx: number, ty: number;
        if (best) { tx = best.x; ty = best.y; }
        else if (firstLeg) { tx = this.x; ty = this.y + 400; }
        else { const a = Math.atan2(this.dirY, this.dirX) + (this.legsLeft % 2 ? 1.75 : -1.75); tx = this.x + Math.cos(a) * 400; ty = this.y + Math.sin(a) * 400; }
        const L = Math.hypot(tx - this.x, ty - this.y) || 1;
        this.dirX = (tx - this.x) / L; this.dirY = (ty - this.y) / L;
    }

    private startTelegraph(): void {
        this.hits = [];
        this.phase = 'telegraph'; this.phaseT = BULL.telegraphSteps;
        this.x = this.door.x; this.y = this.door.y;
        this.pickDirection();
        this.arrow.x = this.x; this.arrow.y = this.y; this.arrow.rotation = Math.atan2(this.dirY, this.dirX);
        this.arrow.visible = true;
        this.sprite.visible = true; this.shadow.visible = true;
        this.effects.spawnWoodSplinters(this.door.x, this.door.y - 10, 16); // brama wylatuje
        this.effects.shake(6, 10);
        this.audio.playBullSnort();
        this.hooks.notify('bull', this.door.x, this.door.y);
    }

    private blocked(x: number, y: number): boolean {
        if (x < 40 || y < 40 || x > 2960 || y > 2960) return true;
        for (const b of this.hooks.getObstacles()) {
            if (b.w <= 0) continue;
            // obora (dom byka) nie blokuje startu
            if (b === (this.house as unknown as ICollidable)) continue;
            if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
        }
        return false;
    }

    update(): void {
        this.step++;
        // odrzut wrogow (gasnacy, wzorzec Beku)
        for (let i = this.pushes.length - 1; i >= 0; i--) {
            const p = this.pushes[i];
            if (!p.e.active) { this.pushes.splice(i, 1); continue; }
            p.e.x += p.kx; p.e.y += p.ky; p.kx *= 0.88; p.ky *= 0.88;
            if (Math.abs(p.kx) < 0.15 && Math.abs(p.ky) < 0.15) this.pushes.splice(i, 1);
        }
        if (this.phase === 'idle') return;
        this.phaseT--;
        if (this.phase === 'telegraph') {
            this.arrow.alpha = 0.55 + 0.45 * Math.abs(Math.sin(this.step * 0.25));
            this.sprite.texture = animalTexture('bull', (this.step >> 3) % 2 ? 'graze' : 'stand'); // grzebie kopytem
            if (this.step % 8 === 0) this.effects.spawnSandKick(this.x, this.y, Math.atan2(this.dirY, this.dirX), 1.4);
            if (this.phaseT <= 0) { this.phase = 'charge'; this.travelled = 0; this.legsLeft = BULL.legs - 1; this.hitSet.clear(); this.arrow.visible = false; this.audio.playBullSnort(); }
        } else if (this.phase === 'turn') {
            // krotki zakret: byk hamuje, grzebie kopytem, strzalka nowego toru (czytelnosc)
            this.sprite.texture = animalTexture('bull', (this.step >> 2) % 2 ? 'graze' : 'stand');
            this.arrow.alpha = 0.55 + 0.45 * Math.abs(Math.sin(this.step * 0.4));
            if (this.step % 6 === 0) this.effects.spawnSandKick(this.x, this.y, Math.atan2(this.dirY, this.dirX), 1.2);
            if (this.phaseT <= 0) { this.phase = 'charge'; this.travelled = 0; this.hitSet.clear(); this.arrow.visible = false; this.audio.playBullSnort(); }
        } else if (this.phase === 'charge') {
            const nx = this.x + this.dirX * BULL.speed, ny = this.y + this.dirY * BULL.speed;
            if (this.travelled > 60 && this.blocked(nx, ny)) {
                this.effects.spawnWallImpact(this.x, this.y); this.effects.shake(8, 10);
                this.nextLegOrReturn();
            } else {
                this.x = nx; this.y = ny; this.travelled += BULL.speed;
                if (this.step % 3 === 0) this.effects.spawnSandKick(this.x, this.y, Math.atan2(this.dirY, this.dirX), 1.6);
                this.ram();
                if (this.travelled >= BULL.maxDistance) this.nextLegOrReturn();
            }
        } else if (this.phase === 'return') {
            const dx = this.door.x - this.x, dy = this.door.y - this.y, d = Math.hypot(dx, dy);
            if (d < 6) {
                this.phase = 'idle'; this.sprite.visible = false; this.shadow.visible = false;
                this.cooldownUntil = this.step + BULL.cooldownSteps;
            } else { this.x += (dx / d) * BULL.returnSpeed; this.y += (dy / d) * BULL.returnSpeed; }
        }
        // wizual
        const moving = this.phase !== 'telegraph' && this.phase !== 'turn';
        if (moving) this.sprite.texture = animalTexture('bull', this.phase === 'charge' ? ((this.step >> 2) % 2 ? 'walkA' : 'walkB') : ((this.step >> 3) % 2 ? 'walkA' : 'walkB'));
        const vx = this.phase === 'return' ? this.door.x - this.x : this.dirX;
        this.sprite.scale.x = 1.45 * (vx >= 0 ? 1 : -1);
        this.sprite.x = this.x; this.sprite.y = this.y - (this.phase === 'charge' ? Math.abs(Math.sin(this.step * 0.5)) * 4 : 0);
        this.sprite.zIndex = Math.floor(this.y);
        this.shadow.x = this.x + 4; this.shadow.y = this.y + 2;
    }

    private startReturn(): void { this.phase = 'return'; }

    /** Koniec prostej: kolejny odcinek (zakret z telegrafem) albo powrot do stodoly. */
    private nextLegOrReturn(): void {
        if (this.legsLeft <= 0) { this.startReturn(); return; }
        this.legsLeft--;
        this.pickDirection(false);
        this.phase = 'turn'; this.phaseT = BULL.turnSteps;
        this.arrow.x = this.x; this.arrow.y = this.y; this.arrow.rotation = Math.atan2(this.dirY, this.dirX);
        this.arrow.visible = true;
        this.audio.playBullSnort();
    }

    /** Taranowanie w biezacym kroku szarzy. */
    private ram(): void {
        const R = BULL.width;
        for (const e of this.hooks.getEnemies()) {
            if (!e.active || this.hitSet.has(e)) continue;
            if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 > R * R * 1.6) continue;
            this.hitSet.add(e);
            const boss = (e as Enemy & { isBoss?: boolean; isMegaBoss?: boolean });
            const dmg = this.tune.ramDmg * (boss.isBoss || boss.isMegaBoss ? BULL.bossMult : 1);
            this.effects.spawnBlastFx(e.x, e.y, 50, 0xffb070, false);
            const killed = this.hooks.damageEnemy(e, dmg);
            if (!killed) {
                // odrzut: w bok od toru + do przodu
                const side = (e.x - this.x) * -this.dirY + (e.y - this.y) * this.dirX >= 0 ? 1 : -1;
                this.pushes.push({ e, kx: (-this.dirY * side * 7 + this.dirX * 4), ky: (this.dirX * side * 7 + this.dirY * 4) });
            }
            this.hooks.notify('bullHit', e.x, e.y);
        }
        this.hooks.getPlayers().forEach((p, i) => {
            if (this.hitSet.has(p) || (p.x - this.x) ** 2 + (p.y - this.y) ** 2 > R * R * 1.6) return;
            this.hitSet.add(p);
            this.hooks.damagePlayer(i, Math.min(this.tune.playerDmg, p.maxHp * 0.25));
            this.effects.shake(10, 12);
        });
        for (const b of this.hooks.getBreakables()) {
            if (b.isDestroyed || b.w <= 0) continue;
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            if ((cx - this.x) ** 2 + (cy - this.y) ** 2 < (R + 20) ** 2) b.takeDamage(999, cx, cy);
        }
    }
}
