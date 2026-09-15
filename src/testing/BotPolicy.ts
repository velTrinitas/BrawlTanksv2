import type { SigmaSnapshot } from './SigmaTest';

/**
 * BotPolicy — heurystyczny gracz SigmaTestera (w przegladarce, nad snapshot + input API).
 *
 * Tryby:
 *  - play:    priorytety ruchu: unik pocisku > leczenie (serce/pad) > cel scenariusza > walka (kite/strafe).
 *             Moce po GOTOWOSCI SLOTU (snapshot.powers — cooldown per slot), nie po starym liczniku Super Shot.
 *             Cele: Krolowa (mur -> Zwornik superem -> klucz -> drzwi), Zamek (stanowisko za brama), CTF (flaga -> hangar).
 *  - wallhug: jedzie w jedna strone, po zablokowaniu skreca o 90 stopni (B1: przenikanie, B2: dziury).
 *  - idle:    stoi (K3 nuda / smierc "znikad", D1 wrogowie musza podjechac i strzelac).
 *  - fuzz:    losowy mash inputu + super co kilka klatek (L1 crash).
 * Decyzja co DECIDE_EVERY klatek; zero zaleznosci od PIXI. Deterministyczny przy tym samym seedzie
 * (wlasny LCG z seeda meczu — nie rusza worldRng gry). Bot gra PRZEWIDYWALNIE: jego wyniki = dolna granica trudnosci.
 */

export type BotMode = 'play' | 'wallhug' | 'idle' | 'fuzz';

export interface BotIO {
    snapshot(): SigmaSnapshot;
    move(v: { x: number; y: number } | null): void;
    aimWorld(x: number, y: number, fire: boolean): void;
    super(slot: 0 | 1 | 2): void;
    release(): void;
}

type Vec = { x: number; y: number };
type Enemy = SigmaSnapshot['enemies'][number];

const DECIDE_EVERY = 6;
/** Horyzont predykcji pocisku (klatki) i promien "trafi mnie" (hit test gracza w main.ts = 25 px + zapas na ruch). */
const DODGE_HORIZON = 36;
const DODGE_RADIUS = 48;
const HEAL_HP_FRAC = 0.45;
const PAD_REACH = 38; // pad leczy tylko gdy gracz STOI w zasiegu 60 px od srodka

export class BotPolicy {
    private mode: BotMode = 'play';
    private frame = 0;
    private rngState: number;
    private lastPos = { x: 0, y: 0 };
    private stillFrames = 0;
    private hugDir = 0; // 0..3 = E,S,W,N
    private strafeSign = 1;
    private lastSuperFrame = -999;

    constructor(private readonly io: BotIO, seed: number) { this.rngState = (seed >>> 0) || 1; }

    private rnd(): number { this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0; return this.rngState / 4294967296; }
    setMode(m: BotMode): void { this.mode = m; this.io.release(); }
    get currentMode(): BotMode { return this.mode; }

    /** Wolane co klatke logiki przez SigmaTest.bot.tick(); decyzja co DECIDE_EVERY klatek. */
    tick(): void {
        this.frame++;
        if (this.frame % DECIDE_EVERY !== 0) return;
        const s = this.io.snapshot();
        if (!s.player || s.gameState !== 'PLAYING') { this.io.release(); return; }
        const p = s.player;
        const moved = Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y);
        this.stillFrames = moved < 1.5 ? this.stillFrames + DECIDE_EVERY : 0;
        this.lastPos = { x: p.x, y: p.y };
        switch (this.mode) {
            case 'idle': this.io.release(); return;
            case 'wallhug': this.wallhug(); return;
            case 'fuzz': this.fuzz(s); return;
            default: this.play(s);
        }
    }

    private wallhug(): void {
        if (this.stillFrames >= 24) { this.hugDir = (this.hugDir + 1) % 4; this.stillFrames = 0; }
        const d = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }][this.hugDir];
        this.io.move(d);
    }

    private fuzz(s: SigmaSnapshot): void {
        const r = this.rnd();
        this.io.move(r < 0.15 ? null : { x: this.rnd() * 2 - 1, y: this.rnd() * 2 - 1 });
        const p = s.player!;
        this.io.aimWorld(p.x + (this.rnd() - 0.5) * 800, p.y + (this.rnd() - 0.5) * 800, this.rnd() < 0.7);
        if (this.rnd() < 0.25) this.io.super((Math.floor(this.rnd() * 3)) as 0 | 1 | 2);
    }

    private play(s: SigmaSnapshot): void {
        const p = s.player!;
        const hpFrac = p.hp / Math.max(1, p.maxHp);
        // 1) cel walki: najblizszy zywy wrog
        let target: Enemy | null = null; let td = Infinity;
        for (const e of s.enemies) { if (!e.active) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < td) { td = d; target = e; } }
        const obj = this.objective(s);

        // 2) ruch wg priorytetu: unik > leczenie > cel scenariusza > walka
        let mv: Vec | null = null;
        const dodge = this.dodgeVector(s);
        const heal = hpFrac < HEAL_HP_FRAC ? this.healTarget(s) : null;
        if (dodge) {
            mv = dodge;
        } else if (heal) {
            const d = Math.hypot(heal.x - p.x, heal.y - p.y);
            mv = heal.pad && d <= PAD_REACH ? null : this.toward(p, heal.x, heal.y); // pad: stac w zasiegu
        } else if (target && td < 180 && !(obj?.carry)) {
            mv = this.toward(p, 2 * p.x - target.x, 2 * p.y - target.y); // kite
        } else if (obj) {
            mv = Math.hypot(obj.x - p.x, obj.y - p.y) > obj.reach ? this.toward(p, obj.x, obj.y) : null;
        } else if (target && td > 320) {
            mv = this.toward(p, target.x, target.y);
        } else if (target) {
            const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy) || 1;
            if (this.rnd() < 0.05) this.strafeSign *= -1;
            mv = { x: (-dy / d) * this.strafeSign, y: (dx / d) * this.strafeSign };
        }
        // utkniecie: skrec prostopadle na chwile
        if (mv && this.stillFrames >= 30) { mv = { x: -mv.y, y: mv.x }; if (this.stillFrames > 90) this.stillFrames = 0; }
        this.io.move(mv);

        // 3) ogien: wrog w zasiegu 600 ma priorytet, inaczej cel scenariusza (mur)
        if (target && td < 600) this.io.aimWorld(target.x, target.y, true);
        else if (obj && obj.fireAt) this.io.aimWorld(obj.fireAt.x, obj.fireAt.y, Math.hypot(obj.x - p.x, obj.y - p.y) <= obj.reach + 60);
        else this.io.aimWorld(p.x + 100, p.y, false);

        // 4) moce po gotowosci slotu
        this.usePowers(s, target, td, hpFrac, obj?.wantSuper ?? false);
    }

    /**
     * Unik: dla kazdego pocisku najblizsze podejscie do gracza w horyzoncie DODGE_HORIZON klatek
     * (gracz traktowany jako stojacy). Groznie = miss < DODGE_RADIUS. Ucieczka prostopadle do toru,
     * na strone przeciwna do przewidywanego punktu trafienia. Wiele pociskow = suma wektorow.
     */
    private dodgeVector(s: SigmaSnapshot): Vec | null {
        const p = s.player!;
        let ax = 0, ay = 0, threats = 0;
        for (const b of s.bulletsNear) {
            const v2 = b.vx * b.vx + b.vy * b.vy; if (v2 < 0.01) continue;
            const rx = b.x - p.x, ry = b.y - p.y;
            const t = Math.max(0, Math.min(DODGE_HORIZON, -(rx * b.vx + ry * b.vy) / v2));
            if (t <= 0) continue; // oddala sie
            const cx = rx + b.vx * t, cy = ry + b.vy * t; // wektor gracz -> punkt najblizszego podejscia
            const miss = Math.hypot(cx, cy); if (miss >= DODGE_RADIUS) continue;
            const vl = Math.sqrt(v2);
            let nx = -b.vy / vl, ny = b.vx / vl; // prostopadla do toru
            if (nx * cx + ny * cy > 0) { nx = -nx; ny = -ny; } // uciekaj OD punktu podejscia
            const w = (DODGE_RADIUS - miss) / DODGE_RADIUS + (DODGE_HORIZON - t) / DODGE_HORIZON;
            ax += nx * w; ay += ny * w; threats++;
        }
        if (!threats) return null;
        const l = Math.hypot(ax, ay) || 1;
        return { x: ax / l, y: ay / l };
    }

    /** Leczenie: najblizsze serce albo gotowy pad (pad liczony +250 px — trzeba na nim stac). Limit 1100 px. */
    private healTarget(s: SigmaSnapshot): (Vec & { pad: boolean }) | null {
        const p = s.player!;
        let best: (Vec & { pad: boolean }) | null = null; let bd = 1100;
        for (const h of s.pickupPos.hearts) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = { x: h.x, y: h.y, pad: false }; } }
        for (const m of s.mediPads) { if (!m.ready) continue; const d = Math.hypot(m.x - p.x, m.y - p.y) + 250; if (d < bd) { bd = d; best = { x: m.x, y: m.y, pad: true }; } }
        return best;
    }

    /**
     * Moce: tylko gotowy slot (cooldown per slot, jedna aktywna moc naraz). Kostka (slot 2 z dice) = losowa moc,
     * wiec odpalana jak "cos przydatnego" przy >= 2 wrogach. Nieznane id (inny loadout) = ta sama regula.
     */
    private usePowers(s: SigmaSnapshot, target: Enemy | null, td: number, hpFrac: number, wantSuper: boolean): void {
        const pw = s.powers;
        if (!pw || pw.active || this.frame - this.lastSuperFrame < 60) return;
        const p = s.player!;
        const near = (r: number): number => s.enemies.filter(e => e.active && Math.hypot(e.x - p.x, e.y - p.y) < r).length;
        const bossNear = (r: number): boolean => s.enemies.some(e => e.active && e.kind !== 'enemy' && e.kind !== 'pursuit' && Math.hypot(e.x - p.x, e.y - p.y) < r);
        for (let slot = 0; slot < 3; slot++) {
            if (!pw.ready[slot]) continue;
            const id = pw.dice && slot === 2 ? 'dice' : pw.loadout[slot];
            let fire: boolean;
            switch (id) {
                case 'aura': fire = hpFrac < 0.5 && near(350) >= 1; break;
                case 'megaBomb': fire = near(260) >= 3 || bossNear(260) || (wantSuper && !!target && td < 400); break;
                case 'freeze': fire = bossNear(420) || near(420) >= 4; break;
                default: fire = near(320) >= 2 || bossNear(320) || wantSuper;
            }
            if (fire) { this.io.super(slot as 0 | 1 | 2); this.lastSuperFrame = this.frame; return; }
        }
    }

    private toward(p: Vec, x: number, y: number): Vec {
        const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d };
    }

    private objective(s: SigmaSnapshot): { x: number; y: number; reach: number; fireAt?: Vec; wantSuper?: boolean; carry?: boolean } | null {
        if (s.config?.scenario === 'castle') return this.castleObjective(s);
        if (s.config?.scenario === 'ctf') return this.ctfObjective(s);
        if (s.config?.scenario !== 'save_queen') return null;
        const q = s.scenario as { keystoneDown?: boolean; hasKey?: boolean; keyPos?: Vec | null; doorOpen?: boolean; queen?: Vec } | null;
        if (!q) return null;
        const gateY = 1500; // rzedy bramy (keyRows 6-7) = y ~1444..1556
        if (!q.keystoneDown) {
            // stan przed murem (x 1984) i ogien na wschod przez rzad bramy; super gdy blisko Zwornika (x ~2488)
            const p = s.player!;
            const nearWall = p.x > 1700;
            return { x: Math.min(p.x + 200, 2440), y: gateY, reach: nearWall ? 40 : 120, fireAt: { x: p.x + 400, y: gateY }, wantSuper: p.x > 2100 };
        }
        if (!q.hasKey && q.keyPos) return { x: q.keyPos.x, y: q.keyPos.y, reach: 20 };
        if (!q.doorOpen) return { x: 2500, y: gateY, reach: 24 };
        return { x: q.queen?.x ?? 2628, y: q.queen?.y ?? gateY, reach: 10 };
    }

    /** CTF: niesiesz flage -> srodek hangaru; inaczej najblizsza flaga 'idle' (pickup < 80 px). Brak = walka. */
    private ctfObjective(s: SigmaSnapshot): { x: number; y: number; reach: number; carry?: boolean } | null {
        const c = s.ctf; const p = s.player!;
        if (!c) return null;
        if (c.carrying) return { x: c.hangarX, y: c.hangarY, reach: 60, carry: true };
        let best: Vec | null = null; let bd = Infinity;
        for (const f of c.flags) { if (f.state !== 'idle') continue; const d = Math.hypot(f.x - p.x, f.y - p.y); if (d < bd) { bd = d; best = f; } }
        return best ? { x: best.x, y: best.y, reach: 40 } : null;
    }

    /**
     * Zamek (CastleMap: bramy S/N/W/E wokol donzonu 1400-1600): stanowisko 120 px za brama najblizsza
     * najblizszemu wrogowi (od strony dziedzinca), ogien w wroga. Bez wrogow: dziedziniec SW (respawn).
     */
    private castleObjective(s: SigmaSnapshot): { x: number; y: number; reach: number; fireAt?: Vec; wantSuper?: boolean } | null {
        const p = s.player!;
        const gates = [{ x: 1500, y: 1846 }, { x: 1500, y: 1154 }, { x: 1154, y: 1500 }, { x: 1846, y: 1500 }]; // srodki bram S,N,W,E
        let target: Enemy | null = null; let td = Infinity;
        for (const e of s.enemies) { if (!e.active) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < td) { td = d; target = e; } }
        if (!target) return { x: 1290, y: 1700, reach: 60 };
        // wrog daleko za murem (> 700 px) = wyjedz przez najblizsza brame na zewnatrz, zeby fala szla dalej
        const g = gates.reduce((a, b) => Math.hypot(a.x - target!.x, a.y - target!.y) <= Math.hypot(b.x - target!.x, b.y - target!.y) ? a : b);
        if (td > 700) return { x: target.x, y: target.y, reach: 320, fireAt: { x: target.x, y: target.y } };
        const ix = 1500 - g.x, iy = 1500 - g.y, il = Math.hypot(ix, iy) || 1; // kierunek do srodka dziedzinca
        const post = { x: g.x + (ix / il) * 120, y: g.y + (iy / il) * 120 };
        const many = s.enemies.filter(e => e.active && Math.hypot(e.x - g.x, e.y - g.y) < 260).length;
        return { x: post.x, y: post.y, reach: 30, fireAt: { x: target.x, y: target.y }, wantSuper: many >= 3 && td < 320 };
    }
}
