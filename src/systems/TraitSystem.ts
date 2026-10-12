import * as PIXI from 'pixi.js';
import { simNowMs } from './SimClock';
import { checkRectCollision } from './Physics';
import { TRAIT_DEFS, TRAIT_TUNING as T, BRAWLER_TRAIT, type TraitDef, type TraitId } from '../config/traits';
import { sandbagTexture, fencePostTexture, smokePuffTexture, crownTexture, TRAIT_ART_SCALE } from '../rendering/TraitArt';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { EffectsManager } from '../rendering/Effects';
import type { ICollidable } from '../types/MapType';

/**
 * TraitSystem — v0.246.0 CECHY CZOLGOW (4. slot). Jedna instancja na gracza (wzorzec psOf/PowerSystem).
 *
 * SYMULACJA (krok logiki, zegar meczu, zero Math.random): aktywacja z PlayerInput.trait, cooldown, ruch taranu /
 * skoku / teleportu, bloki collidera barykad, ogluszenia, niewidka, dym, rozejm, naprawa.
 * WIZUAL (lokalny): sprite'y z TraitArt, wiazki plotu, pierscien koron, alpha niewidki — tworzone/usuwane tutaj,
 * ale nie wplywaja na stan.
 *
 * Swiat podaje main.ts przez TraitCtx (kolizje, wrogowie, obrazenia z kill-path, dzwieki, komunikaty).
 */

export type TraitSfx = 'trait_ready' | 'trait_denied' | 'sandbag_build' | 'ram_charge' | 'ram_impact' | 'invis_on' | 'invis_off'
    | 'teleport_out' | 'teleport_in' | 'fence_up' | 'fence_zap' | 'jump_launch' | 'jump_land' | 'smoke_puff' | 'ceasefire' | 'repair_charge';

export interface TraitCtx {
    world: PIXI.Container;
    effects: EffectsManager;
    enemies(): readonly Enemy[];
    buildings(): readonly ICollidable[];
    /** Wstaw bloczek collidera (gracz+wrogowie+pociski). null = miejsce niedozwolone. Zwraca remover. */
    addBlock(cx: number, cy: number, size: number): (() => void) | null;
    /** Czy punkt to podloga dla kadluba (poza budynkami, woda, lawa, strefami, krawedzia swiata). */
    isFloor(x: number, y: number): boolean;
    /** Obrazenia wroga z pelna sciezka zabicia (wynik, drop, questy, zwyciestwo). */
    damageEnemy(e: Enemy, dmg: number, owner: Player): void;
    /** Globalny rozejm wrogow do chwili (Enemy.ceasefireUntil). */
    setCeasefire(untilMs: number): void;
    sfx(key: TraitSfx, owner: Player): void;
    notify(owner: Player, text: 'blocked' | 'noRoom'): void;
}

interface Barrier { removers: Array<() => void>; view: PIXI.Container; until: number; fence: boolean; posts: Array<{ x: number; y: number }>; beams: PIXI.Graphics | null; nextZap: number }

export class TraitSystem {
    readonly def: TraitDef | null;
    private readonly owner: Player;
    private readonly ctx: TraitCtx;
    private cooldownUntil = 0;
    private wasReady = true;

    // stan efektow (symulacja)
    private barrier: Barrier | null = null;
    private ramStepsLeft = 0; private ramDirX = 0; private ramDirY = 0; private ramHit = new Set<Enemy>();
    private cloakUntil = 0;
    private jumpT = -1; private jumpFromX = 0; private jumpFromY = 0; private jumpToX = 0; private jumpToY = 0;
    private smoke: { x: number; y: number; until: number; view: PIXI.Container; puffs: PIXI.Sprite[] } | null = null;
    private ceasefireUntil = 0;
    private crownRing: PIXI.Container | null = null;
    private repairUntil = 0; private repairLeft = 0;
    private invulUntil = 0;
    /** v0.246.1: ile razy cecha zadzialala (karta CECHA w tutorialach). */
    public uses = 0;
    // wizual lokalny: krotkie efekty (teleport, cien skoku) prowadzone w frame()
    private fx: Array<{ obj: PIXI.Container; born: number; life: number; tick: (k: number, o: PIXI.Container) => void }> = [];
    private jumpShadow: PIXI.Graphics | null = null;
    private popUntil = 0;

    constructor(owner: Player, ctx: TraitCtx) {
        this.owner = owner;
        this.ctx = ctx;
        const id: TraitId | undefined = BRAWLER_TRAIT[owner.brawler.id];
        this.def = id ? TRAIT_DEFS[id] : null;
    }

    // ── odczyty dla HUD / main ─────────────────────────────────────────────
    get cooldownProgress(): number {
        if (!this.def) return 0;
        const left = this.cooldownUntil - simNowMs();
        return left > 0 ? Math.min(1, left / this.def.cooldownMs) : 0;
    }
    get secondsLeft(): number { return Math.max(0, (this.cooldownUntil - simNowMs()) / 1000); }
    get isActive(): boolean {
        const now = simNowMs();
        return !!this.barrier || this.ramStepsLeft > 0 || now < this.cloakUntil || this.jumpT >= 0 || !!this.smoke
            || now < this.ceasefireUntil || now < this.repairUntil;
    }
    /** Nietykalny (taran, lot skoku). PowerSystem.isInvulnerable czyta to przez main. */
    /** v0.246.3: ile ms zostalo efektu z czasem trwania (pigulka HUD jak turbo); 0 = brak / efekt natychmiastowy. */
    get activeLeftMs(): number {
        const now = simNowMs();
        const until = Math.max(this.barrier?.until ?? 0, this.cloakUntil, this.smoke?.until ?? 0, this.ceasefireUntil, this.repairUntil);
        return Math.max(0, until - now);
    }
    get isInvulnerable(): boolean { return simNowMs() < this.invulUntil || this.jumpT >= 0 || this.ramStepsLeft > 0; }
    /** Gracz w locie skoku = bez sterowania i strzalu (jak trampolina Zamku). */
    get isAirborne(): boolean { return this.jumpT >= 0; }
    /** Taran / skok prowadza pozycje — main nie stosuje wtedy ruchu z wejscia. */
    get controlsPosition(): boolean { return this.jumpT >= 0 || this.ramStepsLeft > 0; }
    get cloakActive(): boolean { return simNowMs() < this.cloakUntil; }
    /** Chmura dymu (do stealth gracza i dezorientacji wrogow w srodku). */
    smokeContains(x: number, y: number): boolean {
        return !!this.smoke && (x - this.smoke.x) ** 2 + (y - this.smoke.y) ** 2 < T.smokeRadius * T.smokeRadius;
    }

    /** Strzal gracza: niewidka gasnie po 0,5 s (strzal zdradza pozycje — jak strefy stealth). */
    onOwnerShot(): void {
        const now = simNowMs();
        if (now < this.cloakUntil) this.cloakUntil = Math.min(this.cloakUntil, now + T.cloakShotGraceMs);
    }

    // ── aktywacja (krok logiki) ────────────────────────────────────────────
    activate(dirX: number, dirY: number): boolean {
        const d = this.def;
        const p = this.owner;
        if (!d || p.hp <= 0) return false;
        const now = simNowMs();
        if (now < this.cooldownUntil || this.isActive) { this.ctx.sfx('trait_denied', p); return false; }
        let len = Math.hypot(dirX, dirY);
        const moving = len >= 0.01;
        if (len < 0.01) { dirX = Math.cos(p.turretAngle); dirY = Math.sin(p.turretAngle); len = 1; }
        const ux = dirX / len, uy = dirY / len;
        let ok = true;
        switch (d.id) {
            // v0.246.1 (Mariusz): barykada i plot powstaja ZA czolgiem — kierunek odwrocony, skrzydla obejmuja tyl.
            case 'sandbags': ok = this.buildBarrier(-ux, -uy, false); break;
            case 'fence': ok = this.buildBarrier(-ux, -uy, true); break;
            case 'ram': this.startRam(ux, uy); break;
            case 'cloak': this.cloakUntil = now + d.durationMs; this.ctx.sfx('invis_on', p); this.ctx.effects.spawnRingFx(p.x, p.y, 70, 0x9fd8ff, 18); break;
            case 'blink': ok = this.blink(ux, uy); break;
            case 'bigJump': this.startJump(ux, uy, moving); break;
            case 'smoke': this.spawnSmoke(); break;
            case 'ceasefire': this.startCeasefire(); break;
            case 'repair': this.repairUntil = now + d.durationMs; this.repairLeft = T.repairTotalHp; this.ctx.sfx('repair_charge', p); break;
        }
        if (!ok) { this.ctx.sfx('trait_denied', p); return false; }
        this.cooldownUntil = now + d.cooldownMs;
        this.wasReady = false;
        this.uses++;
        return true;
    }

    // ── krok logiki (stale tempo, wolane z runLogicStep) ───────────────────
    step(): void {
        const now = simNowMs();
        const p = this.owner;
        if (!this.def) return;
        if (!this.wasReady && now >= this.cooldownUntil && !this.isActive) { this.wasReady = true; this.ctx.sfx('trait_ready', p); }

        if (this.barrier) {
            const b = this.barrier;
            if (now >= b.until) { this.clearBarrier(); }
            else if (b.fence && now >= b.nextZap) {
                b.nextZap = now + T.fenceZapEveryMs;
                let zapped = false;
                for (const e of this.ctx.enemies()) {
                    if (!e.active) continue;
                    for (const pt of b.posts) {
                        if ((e.x - pt.x) ** 2 + (e.y - pt.y) ** 2 < (T.fenceTouchRadius + 22) ** 2) {
                            e.freeze(now + T.fenceZapStunMs);
                            this.ctx.damageEnemy(e, T.fenceZapDamage, p);
                            this.ctx.effects.spawnEnemyHitSparks(e.x, e.y, 0x6ff0ff);
                            zapped = true;
                            break;
                        }
                    }
                }
                if (zapped) this.ctx.sfx('fence_zap', p);
            }
        }
        if (this.ramStepsLeft > 0) this.stepRam();
        if (this.jumpT >= 0) this.stepJump();
        if (this.smoke && now >= this.smoke.until) this.clearSmoke();
        if (this.repairLeft > 0 && now < this.repairUntil) {
            const per = T.repairTotalHp / (this.def.durationMs / (1000 / 60));
            const h = Math.min(per, this.repairLeft);
            this.repairLeft -= h;
            p.hp = Math.min(p.maxHp, p.hp + h);
        } else if (now >= this.repairUntil) this.repairLeft = 0;
        if (this.cloakUntil > 0 && now >= this.cloakUntil) { this.cloakUntil = 0; this.ctx.sfx('invis_off', p); }
        if (this.crownRing && now >= this.ceasefireUntil) { this.crownRing.destroy({ children: true }); this.crownRing = null; }
    }

    /** Wizual co klatke (alpha niewidki, wiazki plotu, dym, korony, aura naprawy). Nie zmienia stanu gry. */
    frame(): void {
        const now = simNowMs();
        const p = this.owner;
        // Niewidka: polprzezroczysty "shimmer" (gracz WIDZI swoj czolg — czytelnosc), wrogowie go zgubili.
        if (p.container) p.container.alpha = now < this.cloakUntil ? 0.32 + Math.sin(now / 90) * 0.08 : (this.jumpT >= 0 ? 1 : p.container.alpha < 1 ? 1 : p.container.alpha);
        if (this.barrier?.beams) this.drawBeams(this.barrier, now);
        if (this.smoke) {
            const left = this.smoke.until - now;
            this.smoke.view.alpha = Math.min(1, left / 800);
            this.smoke.puffs.forEach((s, i) => { s.rotation += 0.004 * (i % 2 ? 1 : -1); s.scale.set(TRAIT_ART_SCALE * 2.2 * (1 + Math.sin(now / 700 + i) * 0.06)); });
        }
        if (this.crownRing) {
            // v0.246.1: korony wiruja szybciej, bujaja sie, zloty pierscien pulsuje (ADD), iskierki co 200 ms
            this.crownRing.position.set(p.x, p.y - 4);
            const ring = this.crownRing;
            ring.children.forEach((ch, i) => {
                if (i === 0) { ch.alpha = 0.55 + Math.sin(now / 120) * 0.25; return; } // pierscien
                const a = now / 340 + ((i - 1) / 8) * Math.PI * 2;
                ch.position.set(Math.cos(a) * 96, Math.sin(a) * 96 * 0.85 + Math.sin(now / 160 + i) * 8);
                ch.scale.set(TRAIT_ART_SCALE * 1.1 * (1 + Math.sin(now / 140 + i) * 0.14));
            });
            if (Math.floor(now / 100) !== Math.floor((now - 17) / 100)) {
                const a = now / 340;
                this.ctx.effects.spawnEnemyHitSparks(p.x + Math.cos(a) * 96, p.y + Math.sin(a) * 82, 0xffe066);
                this.ctx.effects.spawnEnemyHitSparks(p.x - Math.cos(a) * 96, p.y - Math.sin(a) * 82, 0xfff3b0);
            }
            if (Math.floor(now / 700) !== Math.floor((now - 17) / 700)) this.ctx.effects.spawnRingFx(p.x, p.y, 150, 0xf1c40f, 18); // fala co 0.7 s
        }
        // v0.246.1: czolg "wyskakuje" po teleporcie (skala 1.5 -> 1, sprezynka) — tylko wizual
        if (p.container && this.jumpT < 0) {
            if (now < this.popUntil) { const k = (this.popUntil - now) / 260; p.container.scale.set(1 + 0.5 * k * k); }
            else if (this.popUntil > 0) { p.container.scale.set(1); this.popUntil = 0; }
        }
        for (let i = this.fx.length - 1; i >= 0; i--) {
            const f = this.fx[i];
            const k = (now - f.born) / f.life;
            if (k >= 1) { f.obj.destroy({ children: true }); this.fx.splice(i, 1); continue; }
            f.tick(k, f.obj);
        }
        if (this.ramStepsLeft > 0) this.ramTrailFx(now);
        if (now < this.repairUntil && Math.floor(now / 250) !== Math.floor((now - 17) / 250)) this.ctx.effects.spawnHealPlus(p.x, p.y - 10);
    }

    destroy(): void {
        this.clearBarrier(); this.clearSmoke();
        for (const f of this.fx) f.obj.destroy({ children: true });
        this.fx = [];
        if (this.jumpShadow) { this.jumpShadow.destroy(); this.jumpShadow = null; }
        if (this.crownRing) { this.crownRing.destroy({ children: true }); this.crownRing = null; }
    }

    // ── Barykada z workow / plot elektryczny ───────────────────────────────
    /** Punkty srodkow bloczkow na lamanej: lewe skrzydlo -> front -> prawe skrzydlo (trapez bez podstawy). */
    private barrierPolyline(ux: number, uy: number): Array<{ x: number; y: number }> {
        const p = this.owner;
        const px = -uy, py = ux; // prostopadla
        const cx = p.x + ux * T.barrierAhead, cy = p.y + uy * T.barrierAhead;
        const hf = T.barrierFront / 2;
        const fl = { x: cx + px * hf, y: cy + py * hf };
        const fr = { x: cx - px * hf, y: cy - py * hf };
        const wingDx = (-ux + px) * Math.SQRT1_2, wingDy = (-uy + py) * Math.SQRT1_2;   // 45 st do tylu, na zewnatrz
        const wingDx2 = (-ux - px) * Math.SQRT1_2, wingDy2 = (-uy - py) * Math.SQRT1_2;
        const bl = { x: fl.x + wingDx * T.barrierWing, y: fl.y + wingDy * T.barrierWing };
        const br = { x: fr.x + wingDx2 * T.barrierWing, y: fr.y + wingDy2 * T.barrierWing };
        const pts: Array<{ x: number; y: number }> = [];
        const seg = (a: { x: number; y: number }, b: { x: number; y: number }, includeEnd: boolean): void => {
            const L = Math.hypot(b.x - a.x, b.y - a.y);
            const n = Math.max(1, Math.round(L / T.barrierBlock));
            for (let i = 0; i < n + (includeEnd ? 1 : 0); i++) pts.push({ x: a.x + (b.x - a.x) * (i / n), y: a.y + (b.y - a.y) * (i / n) });
        };
        seg(bl, fl, false); seg(fl, fr, false); seg(fr, br, true);
        return pts;
    }

    private buildBarrier(ux: number, uy: number, fence: boolean): boolean {
        const pts = this.barrierPolyline(ux, uy);
        const removers: Array<() => void> = [];
        const placed: Array<{ x: number; y: number }> = [];
        for (const pt of pts) {
            const r = this.ctx.addBlock(pt.x, pt.y, T.barrierBlock);
            if (r) { removers.push(r); placed.push(pt); }
        }
        if (placed.length < 3) { removers.forEach(r => r()); this.ctx.notify(this.owner, 'noRoom'); return false; }
        const view = new PIXI.Container();
        view.sortableChildren = true;
        const ang = Math.atan2(uy, ux) + Math.PI / 2;
        if (!fence) {
            // Barykada WW2: 3 warstwy workow na zakladke (jak cegly), gorna lekko przygnieciona.
            // Kazdy worek LEZY wzdluz odcinka muru (styczna z sasiadow), warstwy w gore ekranu (fake-3D wysokosci).
            // Warstwa 2 przesunieta o pol worka (na zakladke, jak cegly), gorna lekko przygnieciona i wezsza.
            placed.forEach((pt, i) => {
                const a = placed[Math.max(0, i - 1)], b2 = placed[Math.min(placed.length - 1, i + 1)];
                let tang = Math.atan2(b2.y - a.y, b2.x - a.x);
                if (tang > Math.PI / 2) tang -= Math.PI; else if (tang < -Math.PI / 2) tang += Math.PI; // gora worka zawsze u gory
                const tx = Math.cos(tang), ty = Math.sin(tang);
                for (let row = 0; row < 3; row++) {
                    const s = new PIXI.Sprite(sandbagTexture(((i + row) % 3) as 0 | 1 | 2));
                    s.anchor.set(0.5);
                    const k = TRAIT_ART_SCALE * 1.45;
                    s.scale.set(k * (row === 2 ? 0.94 : 1), k * (row === 2 ? 0.82 : 1));
                    const shift = row === 1 ? 0.5 : 0; // przesuniecie o pol worka
                    s.position.set(pt.x + tx * shift * T.barrierBlock, pt.y + ty * shift * T.barrierBlock - row * 11);
                    s.rotation = tang + (((i * 7 + row * 3) % 5) - 2) * 0.04;
                    s.zIndex = pt.y + row * 0.1;
                    view.addChild(s);
                }
            });
            void ang;
            this.ctx.effects.spawnTowerDeployDust(this.owner.x + ux * T.barrierAhead, this.owner.y + uy * T.barrierAhead);
            this.ctx.sfx('sandbag_build', this.owner);
        } else {
            for (const pt of placed) {
                const s = new PIXI.Sprite(fencePostTexture());
                s.anchor.set(0.5, 0.92);
                s.scale.set(TRAIT_ART_SCALE);
                s.position.set(pt.x, pt.y + 12);
                s.zIndex = pt.y + 12;
                view.addChild(s);
            }
            this.ctx.sfx('fence_up', this.owner);
        }
        const beams = fence ? new PIXI.Graphics() : null;
        if (beams) { beams.blendMode = PIXI.BLEND_MODES.ADD; beams.zIndex = 100000; view.addChild(beams); }
        view.zIndex = Math.max(...placed.map(p => p.y)) + 14;
        this.ctx.world.addChild(view);
        this.barrier = { removers, view, until: simNowMs() + (this.def?.durationMs ?? 10_000), fence, posts: placed, beams, nextZap: 0 };
        return true;
    }

    /**
     * Plot (v0.246.1 "bardziej elektryzujace"): kazde przeslo = lamana zygzakiem (6 punktow), ksztalt losowany
     * z czasu co ~50 ms (hash, zero Math.random), 2 przebiegi (gruby niebieski + cienki bialy), migotanie alfy,
     * co ~300 ms iskra na jednym przesle. Tylko wizual.
     */
    private drawBeams(b: Barrier, now: number): void {
        const g = b.beams!;
        g.clear();
        const fade = Math.min(1, (b.until - now) / 600);
        const tick = Math.floor(now / 50);
        const hash = (n: number): number => { const x = Math.sin(n * 12.9898 + tick * 78.233) * 43758.5453; return x - Math.floor(x); };
        const flick = 0.75 + 0.25 * hash(7);
        for (const [dy, row] of [[-26, 0], [-12, 1]] as const) {
            for (let i = 0; i < b.posts.length - 1; i++) {
                const p0 = b.posts[i], p1 = b.posts[i + 1];
                const pts: Array<[number, number]> = [];
                for (let k = 0; k <= 5; k++) {
                    const t = k / 5;
                    const off = k === 0 || k === 5 ? 0 : (hash(i * 31 + k * 7 + row * 101) - 0.5) * 12;
                    pts.push([p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t + dy + off]);
                }
                g.lineStyle(7, 0x1aa8ff, 0.28 * fade * flick);
                g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]);
                g.lineStyle(2, 0xf0ffff, 0.95 * fade * flick);
                g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]);
            }
        }
        if (Math.floor(now / 300) !== Math.floor((now - 17) / 300) && b.posts.length > 1) {
            const i = Math.floor(hash(3) * (b.posts.length - 1));
            const p0 = b.posts[i], p1 = b.posts[i + 1];
            this.ctx.effects.spawnEnemyHitSparks((p0.x + p1.x) / 2, (p0.y + p1.y) / 2 - 20, 0x9ff6ff);
        }
    }

    private clearBarrier(): void {
        if (!this.barrier) return;
        this.barrier.removers.forEach(r => r());
        const v = this.barrier.view;
        if (v.parent) v.parent.removeChild(v);
        v.destroy({ children: true });
        if (!this.barrier.fence) this.ctx.effects.spawnTowerDeployDust(this.barrier.posts[0].x, this.barrier.posts[0].y);
        this.barrier = null;
    }

    // ── Taran (Pancerny) ────────────────────────────────────────────────────
    private startRam(ux: number, uy: number): void {
        this.ramDirX = ux; this.ramDirY = uy;
        this.ramStepsLeft = Math.round(T.ramDistance / T.ramStepPx);
        this.ramHit.clear();
        this.ctx.sfx('ram_charge', this.owner);
        this.ctx.effects.shake(5, 12);
        // v0.246.2: start z "kopnieciem" — pierscien + rozblysk za rufa
        this.ctx.effects.spawnRingFx(this.owner.x, this.owner.y, 90, 0xffb347, 14);
        this.ctx.effects.spawnBlastFx(this.owner.x - ux * 30, this.owner.y - uy * 30, 46, 0xffd27a, false);
    }

    /**
     * v0.246.2 TARAN "spektakularny" (tylko wizual, co klatke w locie): ognista smuga-poswiata za rufa (ADD),
     * linie predkosci (rozrzut z hasha czasu, zero Math.random) i stozek fali przed dziobem. Kazdy slad gasnie 220 ms.
     */
    private ramTrailFx(now: number): void {
        const p = this.owner;
        const g = new PIXI.Graphics();
        g.blendMode = PIXI.BLEND_MODES.ADD;
        g.position.set(p.x, p.y);
        g.rotation = Math.atan2(this.ramDirY, this.ramDirX);
        g.beginFill(0xff6a1a, 0.4); g.drawEllipse(-34, 0, 54, 26); g.endFill();
        g.beginFill(0xffd27a, 0.55); g.drawEllipse(-18, 0, 30, 14); g.endFill();
        g.beginFill(0xfff4d0, 0.35); g.drawEllipse(30, 0, 12, 30); g.endFill(); // fala przed dziobem
        const h = (n: number): number => { const x = Math.sin(n * 12.9898 + Math.floor(now / 16) * 78.233) * 43758.5453; return x - Math.floor(x); };
        for (let i = 0; i < 4; i++) {
            const off = (h(i) - 0.5) * 56, len = 50 + h(i + 9) * 70;
            g.lineStyle(i % 2 ? 2 : 3, i % 2 ? 0xffffff : 0xffc061, 0.85);
            g.moveTo(-36, off); g.lineTo(-36 - len, off);
        }
        g.zIndex = p.y - 2;
        this.ctx.world.addChild(g);
        this.fx.push({ obj: g, born: now, life: 220, tick: (k, o) => { o.alpha = 1 - k; o.scale.set(1 + k * 0.5, 1 - k * 0.4); } });
    }

    private stepRam(): void {
        const p = this.owner;
        this.ramStepsLeft--;
        const nx = p.x + this.ramDirX * T.ramStepPx, ny = p.y + this.ramDirY * T.ramStepPx;
        for (const b of this.ctx.buildings()) {
            if (checkRectCollision(b.x, b.y, b.w, b.h, nx, ny, 20)) {
                this.ramStepsLeft = 0;
                this.ctx.effects.spawnWallImpact(p.x, p.y);
                this.ctx.effects.shake(6, 10);
                return;
            }
        }
        p.x = nx; p.y = ny;
        this.ctx.effects.spawnRocketSmoke(p.x - this.ramDirX * 30, p.y - this.ramDirY * 30);
        const r2 = T.ramHitRadius * T.ramHitRadius;
        for (const e of this.ctx.enemies()) {
            if (!e.active || this.ramHit.has(e)) continue;
            if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r2) continue;
            this.ramHit.add(e);
            e.freeze(simNowMs() + T.ramStunMs);
            this.ctx.damageEnemy(e, T.ramDamage, p);
            this.ctx.effects.spawnBlastFx(e.x, e.y, 60, 0xff8a2a, false);
            this.ctx.effects.shake(7, 10);
            this.ctx.sfx('ram_impact', p);
        }
    }

    // ── Teleport (Snajper) ─────────────────────────────────────────────────
    /** Wachlarz +-30 st, dystanse 200 -> 240 -> 160: pierwszy punkt, gdzie kadlub ma podloge (5 probek). */
    private findLanding(ux: number, uy: number, dists: number[], straight = false): { x: number; y: number } | null {
        const p = this.owner;
        const base = Math.atan2(uy, ux);
        const fan = (T.blinkFanDeg * Math.PI) / 180;
        const angles = straight ? [0] : [0, fan / 3, -fan / 3, (2 * fan) / 3, (-2 * fan) / 3, fan, -fan];
        for (const dist of dists) {
            for (const da of angles) {
                const a = base + da;
                const x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist;
                if (this.hullFits(x, y)) return { x, y };
            }
        }
        return null;
    }

    private hullFits(x: number, y: number): boolean {
        const R = 26;
        for (const [ox, oy] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) if (!this.ctx.isFloor(x + ox, y + oy)) return false;
        for (const b of this.ctx.buildings()) if (checkRectCollision(b.x, b.y, b.w, b.h, x, y, 24)) return false;
        return true;
    }

    private blink(ux: number, uy: number): boolean {
        const to = this.findLanding(ux, uy, [T.blinkDistance, T.blinkMax, T.blinkMin]);
        if (!to) { this.ctx.notify(this.owner, 'noRoom'); return false; }
        const p = this.owner;
        const fromX = p.x, fromY = p.y;
        this.ctx.sfx('teleport_out', p);
        p.x = to.x; p.y = to.y;
        this.teleportFx(fromX, fromY, to.x, to.y);
        this.ctx.sfx('teleport_in', p);
        this.invulUntil = simNowMs() + 300; // krotka laska po materializacji (czytelnosc: zero "zginalem w trakcie")
        return true;
    }

/**
     * v0.246.1 TELEPORT "spektakularny" (tylko wizual; symulacja przenosi natychmiast):
     *  A: implozja (12 drobinek sciaganych do srodka) + gasnaca sylwetka-krag;
     *  A->B: blyskawica-smuga zygzakiem (ADD, 250 ms);
     *  B: slup swiatla + podwojny pierscien + fala + iskry + "pop" czolgu + lokalny blysk + shake.
     */
    private teleportFx(ax: number, ay: number, bx: number, by: number): void {
        const now = simNowMs();
        const add = (obj: PIXI.Container, life: number, tick: (k: number, o: PIXI.Container) => void): void => {
            obj.zIndex = 900002; this.ctx.world.addChild(obj); this.fx.push({ obj, born: now, life, tick });
        };
        // A: implozja + sylwetka
        const imp = new PIXI.Graphics(); imp.blendMode = PIXI.BLEND_MODES.ADD; imp.position.set(ax, ay);
        add(imp, 220, (k, o) => {
            const g = o as PIXI.Graphics; g.clear();
            g.beginFill(0xb18cff, 0.5 * (1 - k)); g.drawCircle(0, 0, 34 * (1 - k * 0.8)); g.endFill();
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2 + k * 2;
                const rr = 70 * (1 - k);
                g.beginFill(i % 2 ? 0xffffff : 0xd6c2ff, 1 - k * 0.5); g.drawCircle(Math.cos(a) * rr, Math.sin(a) * rr, 3.2); g.endFill();
            }
        });
        // A->B: blyskawica
        const bolt = new PIXI.Graphics(); bolt.blendMode = PIXI.BLEND_MODES.ADD;
        const segs = 10, nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
        add(bolt, 260, (k, o) => {
            const g = o as PIXI.Graphics; g.clear();
            const pts: Array<[number, number]> = [];
            for (let i = 0; i <= segs; i++) {
                const t = i / segs, j = i === 0 || i === segs ? 0 : Math.sin(i * 9.1 + k * 40) * 16;
                pts.push([ax + (bx - ax) * t + (nx / nl) * j, ay + (by - ay) * t + (ny / nl) * j]);
            }
            for (const [w, col, al] of [[10, 0x8a5cff, 0.35], [3, 0xffffff, 0.95]] as const) {
                g.lineStyle(w, col, al * (1 - k)); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]);
            }
        });
        // B: slup swiatla + blysk lokalny
        const pillar = new PIXI.Graphics(); pillar.blendMode = PIXI.BLEND_MODES.ADD; pillar.position.set(bx, by);
        add(pillar, 520, (k, o) => {
            const g = o as PIXI.Graphics; g.clear();
            const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
            g.beginFill(0xb18cff, 0.35 * a); g.drawEllipse(0, -70, 26 + 10 * k, 120); g.endFill();
            g.beginFill(0xffffff, 0.55 * a); g.drawEllipse(0, -70, 9, 110); g.endFill();
            if (k < 0.12) { g.beginFill(0xffffff, 0.5 * (1 - k / 0.12)); g.drawCircle(0, 0, 90); g.endFill(); }
        });
        this.ctx.effects.spawnRingFx(bx, by, 90, 0xb18cff, 18);
        this.ctx.effects.spawnRingFx(bx, by, 60, 0xffffff, 14, 5);
        this.ctx.effects.spawnShockwaveRing(bx, by, 160, 0xb18cff);
        this.ctx.effects.spawnEnemyHitSparks(bx, by, 0xffffff);
        this.ctx.effects.spawnEnemyHitSparks(bx, by, 0xd6c2ff);
        this.ctx.effects.shake(5, 8);
        this.popUntil = now + 260;
    }

    // ── Wielki skok (Shadow) ───────────────────────────────────────────────
    /**
     * v0.246.3 (Mariusz: "musze wiedziec, gdzie spadne"): skok PROSTO w kierunku jazdy (bez wachlarza), coraz blizej,
     * gdy pod spodem przeszkoda; stoje = skok w MIEJSCU. Cel pokazuje znacznik na ziemi przez caly lot.
     */
    private startJump(ux: number, uy: number, moving: boolean): void {
        const p = this.owner;
        const to = (moving ? this.findLanding(ux, uy, [T.jumpDistance, T.jumpDistance - 50, T.jumpDistance - 100, T.jumpDistance - 150], true) : null) ?? { x: p.x, y: p.y };
        this.jumpFromX = p.x; this.jumpFromY = p.y; this.jumpToX = to.x; this.jumpToY = to.y;
        this.jumpT = 0;
        this.ctx.effects.spawnTowerDeployDust(p.x, p.y);
        this.ctx.sfx('jump_launch', p);
        // v0.246.1: cien na ziemi (jak trampolina Zamku) — zostaje na podlodze, kurczy sie i jasnieje w locie
        const sh = new PIXI.Graphics();
        sh.zIndex = 8;
        this.ctx.world.addChild(sh);
        this.jumpShadow = sh;
    }

    private stepJump(): void {
        const p = this.owner;
        const steps = T.jumpFlightMs / (1000 / 60);
        this.jumpT += 1 / steps;
        const t = Math.min(1, this.jumpT);
        p.x = this.jumpFromX + (this.jumpToX - this.jumpFromX) * t;
        p.y = this.jumpFromY + (this.jumpToY - this.jumpFromY) * t;
        // wizual lotu: skala 1 -> 1.85 -> 1 (parabola), czolg unosi sie nad cieniem — DRAMATYCZNIE, jak trampolina
        const h = Math.sin(Math.PI * t);
        if (p.container) p.container.scale.set(1 + h * (T.jumpPeakScale - 1));
        if (this.jumpShadow) {
            const g = this.jumpShadow; g.clear();
            g.beginFill(0x000000, 0.38 - h * 0.22); g.drawEllipse(p.x, p.y + 10, 34 * (1 - h * 0.45), 16 * (1 - h * 0.45)); g.endFill();
            // znacznik ladowania: pulsujacy rozowy cel + krzyz (gracz widzi miejsce od startu)
            const tx = this.jumpToX, ty = this.jumpToY + 10, pr = 1 + Math.sin(t * Math.PI * 8) * 0.08;
            g.beginFill(0xff5fa2, 0.16); g.drawEllipse(tx, ty, 46 * pr, 24 * pr); g.endFill();
            g.lineStyle(4, 0xff5fa2, 0.9); g.drawEllipse(tx, ty, 46 * pr, 24 * pr);
            g.lineStyle(2, 0xffffff, 0.9); g.drawEllipse(tx, ty, 24 * pr, 12 * pr);
            g.moveTo(tx - 14, ty); g.lineTo(tx + 14, ty); g.moveTo(tx, ty - 7); g.lineTo(tx, ty + 7);
            g.lineStyle(0);
        }
        if (t >= 1) {
            this.jumpT = -1;
            if (p.container) p.container.scale.set(1);
            if (this.jumpShadow) { this.jumpShadow.destroy(); this.jumpShadow = null; }
            this.land();
        }
    }

    private land(): void {
        const p = this.owner;
        const now = simNowMs();
        const r2 = T.jumpStunRadius * T.jumpStunRadius;
        for (const e of this.ctx.enemies()) {
            if (!e.active || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r2) continue;
            e.freeze(now + (e.isMegaBoss ? T.jumpStunMegaMs : e.isBoss ? T.jumpStunBossMs : T.jumpStunMs));
            this.ctx.effects.spawnEnemyHitSparks(e.x, e.y, 0xffe066);
        }
        this.ctx.effects.spawnShockwaveRing(p.x, p.y, T.jumpStunRadius, 0xff5fa2);
        this.ctx.effects.spawnBlastFx(p.x, p.y, 90, 0xffd27a, false);
        this.ctx.effects.shake(12, 16);
        this.ctx.sfx('jump_land', p);
        this.invulUntil = now + 250;
    }

    // ── Dym (Ogniarz) ──────────────────────────────────────────────────────
    private spawnSmoke(): void {
        const p = this.owner;
        const view = new PIXI.Container();
        view.zIndex = 900000; // nad czolgami — dym ZAKRYWA (to jest jego zadanie)
        const puffs: PIXI.Sprite[] = [];
        for (let i = 0; i < T.smokePuffs; i++) {
            const a = (i / T.smokePuffs) * Math.PI * 2;
            const r = i === 0 ? 0 : T.smokeRadius * (0.35 + ((i * 37) % 10) / 22);
            const s = new PIXI.Sprite(smokePuffTexture((i % 3) as 0 | 1 | 2));
            s.anchor.set(0.5);
            s.scale.set(TRAIT_ART_SCALE * 2.2);
            s.alpha = 0.78;
            s.position.set(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8);
            view.addChild(s);
            puffs.push(s);
        }
        this.ctx.world.addChild(view);
        this.smoke = { x: p.x, y: p.y, until: simNowMs() + (this.def?.durationMs ?? 6000), view, puffs };
        this.ctx.sfx('smoke_puff', p);
        this.ctx.effects.shake(3, 6);
    }

    private clearSmoke(): void {
        if (!this.smoke) return;
        const v = this.smoke.view;
        if (v.parent) v.parent.removeChild(v);
        v.destroy({ children: true });
        this.smoke = null;
    }

    // ── Krolewski rozejm (King) ────────────────────────────────────────────
    private startCeasefire(): void {
        const p = this.owner;
        this.ceasefireUntil = simNowMs() + (this.def?.durationMs ?? 3000);
        this.ctx.setCeasefire(this.ceasefireUntil);
        const ring = new PIXI.Container();
        ring.zIndex = 900001;
        const halo = new PIXI.Graphics();   // child 0: pulsujacy zloty pierscien (ADD)
        halo.blendMode = PIXI.BLEND_MODES.ADD;
        halo.beginFill(0xf1c40f, 0.12); halo.drawEllipse(0, 4, 100, 86); halo.endFill(); // v0.246.3: wieksza aura
        halo.lineStyle(10, 0xf1c40f, 0.45); halo.drawEllipse(0, 4, 100, 86);
        halo.lineStyle(3, 0xfff3b0, 0.95); halo.drawEllipse(0, 4, 100, 86);
        halo.lineStyle(2, 0xffe066, 0.6); halo.drawEllipse(0, 4, 70, 60);
        ring.addChild(halo);
        for (let i = 0; i < 8; i++) {
            const s = new PIXI.Sprite(crownTexture());
            s.anchor.set(0.5);
            s.scale.set(TRAIT_ART_SCALE * 0.86); // v0.246.1: mniejsze (x0.75)
            ring.addChild(s);
        }
        ring.position.set(p.x, p.y);
        this.ctx.world.addChild(ring);
        this.crownRing = ring;
        this.ctx.effects.spawnRingFx(p.x, p.y, 110, 0xf1c40f, 20);
        this.ctx.effects.spawnShockwaveRing(p.x, p.y, 420, 0xf1c40f);
        this.ctx.sfx('ceasefire', p);
    }
}
