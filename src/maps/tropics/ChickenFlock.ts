import * as PIXI from 'pixi.js';
import type { Enemy } from '../../entities/Enemy';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import { CHICKENS, type ChickenTuning } from '../../config/tropicsEvents';
import { makeAnimalShadow } from './FarmAnimals';
import { eventAnimalTexture as animalTexture } from './EventAnimals';

/**
 * TROPICS ART v2 / T6.1 — SZALONE KURCZAKI.
 *
 * Trafienie kurnika POCISKIEM GRACZA (pociski wroga tylko iskrza — wzorzec piramidy) liczy sie
 * w oknie 4 s. Od 2. trafienia telegraf ("KO-KO!" + piora + gdakanie), po N trafieniach z kurnika
 * wybiega stado i 12 s goni NAJBLIZSZEGO WROGA: oblepiony wrog -40% predkosci i traci HP od dziobow
 * (max 4 kury na wrogu). Bez wrogow w poblizu stado tylko kreci sie wokol gracza (zero obrazen).
 * KOGUT Z KORONA: trafiony pociskiem gracza = zlote jajo (gemy + punkty). Zwykle kury NIE lapia
 * pociskow (inaczej zjadalyby strzaly w oblepionego wroga — decyzja gameplayowa).
 *
 * SYMULACJA: wszystko w `step()` wolanym ze stalego kroku logiki, deterministycznie (bez losowania,
 * bez zegara systemowego). Wizual (sprite'y) aktualizowany w tym samym kroku — tylko transformy.
 */
export interface ChickenHouse { x: number; y: number; w: number; h: number; }

export interface ChickenHooks {
    getEnemies(): readonly Enemy[];
    getPlayers(): ReadonlyArray<{ x: number; y: number }>;
    /** Obrazenia wroga od dziobow; zwraca true gdy wrog zginal (kill-path robi main.ts). */
    damageEnemy(e: Enemy, dmg: number): boolean;
    goldenEgg(x: number, y: number): void;
    notify(key: 'wake' | 'egg', x: number, y: number): void;
}

interface Chicken {
    x: number; y: number;
    rooster: boolean;
    alive: boolean;
    target: Enemy | null;
    retargetT: number;
    sprite: PIXI.Sprite;
    shadow: PIXI.Sprite;
    idx: number;
}

interface HouseState {
    house: ChickenHouse;
    hits: number[];
    lastTelegraph: number;
    cooldownUntil: number;
    activeUntil: number;
    flock: Chicken[];
}

export class ChickenFlock {
    private step = 0;
    private readonly houses: HouseState[] = [];
    /** Wrogowie oblepieni w biezacym kroku (spowolnienie czyta main.ts). */
    private readonly pecked = new Set<Enemy>();
    private readonly peckers = new Map<Enemy, number>();

    constructor(
        houses: ChickenHouse[],
        private readonly world: PIXI.Container,
        private readonly effects: EffectsManager,
        private readonly audio: AudioSys,
        private readonly tune: ChickenTuning,
        private readonly hooks: ChickenHooks,
    ) {
        for (const h of houses) {
            const st: HouseState = { house: h, hits: [], lastTelegraph: -999, cooldownUntil: 0, activeUntil: 0, flock: [] };
            this.houses.push(st);
            // Hooki trafien (duck-typing jak Pyramid.enableHitHooks): gracz liczy sie do zdarzenia,
            // wrog tylko iskrzy.
            const target = h as ChickenHouse & {
                takeDamage?: (dmg: number, x: number, y: number) => void;
                takeEnemyDamage?: (dmg: number, x: number, y: number) => void;
            };
            target.takeDamage = (_d, x, y) => { this.effects.spawnWallImpact(x, y); this.onHouseHit(st, x, y); };
            target.takeEnemyDamage = (_d, x, y) => { this.effects.spawnWallImpact(x, y); };
        }
    }

    /** true gdy wrog jest teraz oblepiony kurami (main.ts: speedModifier *= slowMult). */
    isPecked(e: Enemy): boolean { return this.pecked.has(e); }

    private door(h: ChickenHouse): { x: number; y: number } { return { x: h.x + h.w / 2, y: h.y + h.h + 6 }; }

    private onHouseHit(st: HouseState, x: number, y: number): void {
        if (this.step < st.cooldownUntil || st.flock.length > 0) return;
        st.hits.push(this.step);
        st.hits = st.hits.filter(s => this.step - s <= CHICKENS.windowSteps);
        this.effects.spawnFeathers(x, y, 4);
        if (st.hits.length >= this.tune.hitsToWake) { this.wake(st); return; }
        if (st.hits.length >= CHICKENS.telegraphFromHit && this.step - st.lastTelegraph > 30) {
            st.lastTelegraph = this.step;
            const d = this.door(st.house);
            this.effects.spawnFloatingText(d.x, st.house.y - 10, 'KO-KO!', 0xfff3b0);
            this.audio.playCluck(false);
        }
    }

    private wake(st: HouseState): void {
        st.hits = [];
        st.activeUntil = this.step + CHICKENS.activeSteps;
        st.cooldownUntil = this.step + CHICKENS.activeSteps + CHICKENS.cooldownSteps;
        const d = this.door(st.house);
        const n = this.tune.flock + 1;
        for (let i = 0; i < n; i++) {
            const rooster = i === n - 1;
            const sprite = new PIXI.Sprite(animalTexture(rooster ? 'rooster' : (i % 3 === 0 ? 'hen_brown' : 'hen'), 'stand'));
            sprite.anchor.set(0.5, 0.85);
            sprite.scale.set(rooster ? 1.6 : 1.35);
            const shadow = makeAnimalShadow(rooster ? 34 : 28, 11);
            this.world.addChild(shadow);
            this.world.addChild(sprite);
            const a = (i / n) * Math.PI * 2;
            st.flock.push({ x: d.x + Math.cos(a) * 14, y: d.y + Math.sin(a) * 8, rooster, alive: true, target: null, retargetT: i % 15, sprite, shadow, idx: i });
        }
        this.effects.spawnFeathers(d.x, d.y, 14);
        this.effects.shake(3, 8);
        this.audio.playCluck(true);
        this.hooks.notify('wake', d.x, d.y);
    }

    /** Pocisk gracza vs KOGUT (zwykle kury przepuszczaja pociski). true = pocisk zuzyty. */
    hitTestBullet(x: number, y: number, r: number): boolean {
        for (const st of this.houses) {
            for (const c of st.flock) {
                if (!c.alive || !c.rooster) continue;
                const dx = c.x - x, dy = c.y - 10 - y, R = CHICKENS.hitRadius + r;
                if (dx * dx + dy * dy < R * R) {
                    c.alive = false;
                    c.sprite.visible = false; c.shadow.visible = false;
                    this.effects.spawnFeathers(c.x, c.y - 10, 16);
                    this.hooks.goldenEgg(c.x, c.y);
                    this.hooks.notify('egg', c.x, c.y);
                    return true;
                }
            }
        }
        return false;
    }

    /** Staly krok logiki (60/s). */
    update(): void {
        this.step++;
        this.pecked.clear();
        this.peckers.clear();
        const enemies = this.hooks.getEnemies();
        const players = this.hooks.getPlayers();
        for (const st of this.houses) {
            if (st.flock.length === 0) continue;
            const active = this.step < st.activeUntil;
            const d = this.door(st.house);
            for (const c of st.flock) {
                if (!c.alive) continue;
                let tx = d.x, ty = d.y;
                if (active) {
                    if (c.target && !c.target.active) c.target = null;
                    if (--c.retargetT <= 0) {
                        c.retargetT = 15;
                        let best: Enemy | null = null, bd = CHICKENS.seekRange * CHICKENS.seekRange;
                        for (const e of enemies) {
                            if (!e.active) continue;
                            const q = (e.x - c.x) ** 2 + (e.y - c.y) ** 2;
                            if (q < bd) { bd = q; best = e; }
                        }
                        c.target = best;
                    }
                    if (c.target) {
                        const a = (c.idx / 4) * Math.PI * 2; // kazda kura z innej strony wroga
                        tx = c.target.x + Math.cos(a) * 18; ty = c.target.y + Math.sin(a) * 14;
                    } else if (players.length) {
                        const p = players[0], a = (c.idx / (st.flock.length || 1)) * Math.PI * 2 + this.step * 0.02;
                        tx = p.x + Math.cos(a) * 48; ty = p.y + Math.sin(a) * 36;
                    }
                }
                const dx = tx - c.x, dy = ty - c.y, dist = Math.hypot(dx, dy);
                const sp = CHICKENS.speed;
                if (dist > sp) { c.x += (dx / dist) * sp; c.y += (dy / dist) * sp; }
                // dziobanie
                if (active && c.target && Math.hypot(c.target.x - c.x, c.target.y - c.y) < CHICKENS.peckRange + 18) {
                    const n = this.peckers.get(c.target) ?? 0;
                    if (n < CHICKENS.maxPeckersPerEnemy) {
                        this.peckers.set(c.target, n + 1);
                        this.pecked.add(c.target);
                        if ((this.step + c.idx * 3) % CHICKENS.peckEverySteps === 0) {
                            const dmg = this.tune.peckDps * CHICKENS.peckEverySteps / 60;
                            if (this.hooks.damageEnemy(c.target, dmg)) c.target = null;
                            else if (c.idx % 2 === 0) this.effects.spawnFeathers(c.x, c.y - 8, 1);
                        }
                    }
                }
                // powrot do kurnika po czasie
                if (!active && dist < 8) { c.alive = false; c.sprite.visible = false; c.shadow.visible = false; }
                // wizual (transformy)
                const moving = dist > sp;
                const pose = moving ? ((this.step >> 3) % 2 === 0 ? 'walkA' : 'walkB') : ((this.step >> 4) % 2 === 0 ? 'graze' : 'stand');
                c.sprite.texture = animalTexture(c.rooster ? 'rooster' : (c.idx % 3 === 0 ? 'hen_brown' : 'hen'), pose);
                c.sprite.x = c.x; c.sprite.y = c.y - (moving ? Math.abs(Math.sin(this.step * 0.4)) * 3 : 0);
                if (Math.abs(dx) > 0.5) c.sprite.scale.x = Math.abs(c.sprite.scale.x) * (dx > 0 ? 1 : -1);
                c.sprite.zIndex = Math.floor(c.y);
                c.shadow.x = c.x + 2; c.shadow.y = c.y + 1;
            }
            if (!active && st.flock.every(c => !c.alive)) {
                for (const c of st.flock) {
                    if (c.sprite.parent) c.sprite.parent.removeChild(c.sprite); c.sprite.destroy({ children: true });
                    if (c.shadow.parent) c.shadow.parent.removeChild(c.shadow); c.shadow.destroy();
                }
                st.flock = [];
            }
        }
    }
}
