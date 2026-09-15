import type { SigmaSnapshot } from './SigmaTest';

/**
 * BotPolicy — heurystyczny gracz SigmaTestera (w przegladarce, nad snapshot + input API).
 *
 * Tryby:
 *  - play:    walka (cel = najblizszy zywy wrog; kite: uciekaj < 180 px, zblizaj > 320 px, inaczej strafe)
 *             + cel scenariusza (Krolowa: mur -> Zwornik superem -> klucz -> drzwi -> Krolowa; Castle/CTF: V0 = walka)
 *             + serce gdy HP < 40%.
 *  - wallhug: jedzie w jedna strone, po zablokowaniu skreca o 90 stopni (B1: przenikanie, B2: dziury).
 *  - idle:    stoi (K3 nuda / smierc "znikad", D1 wrogowie musza podjechac i strzelac).
 *  - fuzz:    losowy mash inputu + super co kilka klatek (L1 crash).
 * Decyzja co DECIDE_EVERY klatek; zero zaleznosci od PIXI. Deterministyczny przy tym samym seedzie
 * (wlasny LCG z seeda meczu — nie rusza worldRng gry).
 */

export type BotMode = 'play' | 'wallhug' | 'idle' | 'fuzz';

export interface BotIO {
    snapshot(): SigmaSnapshot;
    move(v: { x: number; y: number } | null): void;
    aimWorld(x: number, y: number, fire: boolean): void;
    super(slot: 0 | 1 | 2): void;
    release(): void;
}

const DECIDE_EVERY = 6;

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
            case 'fuzz': this.fuzz(); return;
            default: this.play(s);
        }
    }

    private wallhug(): void {
        if (this.stillFrames >= 24) { this.hugDir = (this.hugDir + 1) % 4; this.stillFrames = 0; }
        const d = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }][this.hugDir];
        this.io.move(d);
    }

    private fuzz(): void {
        const r = this.rnd();
        this.io.move(r < 0.15 ? null : { x: this.rnd() * 2 - 1, y: this.rnd() * 2 - 1 });
        const s = this.io.snapshot(); const p = s.player!;
        this.io.aimWorld(p.x + (this.rnd() - 0.5) * 800, p.y + (this.rnd() - 0.5) * 800, this.rnd() < 0.7);
        if (this.rnd() < 0.25) this.io.super((Math.floor(this.rnd() * 3)) as 0 | 1 | 2);
    }

    private play(s: SigmaSnapshot): void {
        const p = s.player!;
        // 1) cel walki: najblizszy zywy wrog
        let target: SigmaSnapshot['enemies'][number] | null = null; let td = Infinity;
        for (const e of s.enemies) { if (!e.active) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < td) { td = d; target = e; } }
        // 2) cel scenariusza (Krolowa)
        const obj = this.objective(s);
        // 3) ruch
        let mv: { x: number; y: number } | null = null;
        if (p.hp / p.maxHp < 0.4 && s.pickupPos.hearts.length) {
            const h = s.pickupPos.hearts.reduce((a, b) => Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y) ? a : b);
            mv = this.toward(p, h.x, h.y);
        } else if (target && td < 180) {
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
        // 4) ogien: wrog w zasiegu 600 ma priorytet, inaczej cel scenariusza (mur)
        if (target && td < 600) this.io.aimWorld(target.x, target.y, true);
        else if (obj && obj.fireAt) this.io.aimWorld(obj.fireAt.x, obj.fireAt.y, Math.hypot(obj.x - p.x, obj.y - p.y) <= obj.reach + 60);
        else this.io.aimWorld(p.x + 100, p.y, false);
        // 5) super: gdy naladowany i (boss blisko | Zwornik przed nami | duzo wrogow)
        const many = s.enemies.filter(e => e.active && Math.hypot(e.x - p.x, e.y - p.y) < 300).length;
        if (p.super > 0 && this.frame - this.lastSuperFrame > 120 && ((target && td < 300 && (target.kind !== 'enemy' || many >= 3)) || (obj?.wantSuper))) { this.io.super(0); this.lastSuperFrame = this.frame; }
    }

    private toward(p: { x: number; y: number }, x: number, y: number): { x: number; y: number } {
        const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d };
    }

    /** Krolowa: sekwencja celu z HUD info (QueenHudInfo). Zamek: trzymaj od srodka brame, ktora atakuja. CTF/KTB: null (V0). */
    private objective(s: SigmaSnapshot): { x: number; y: number; reach: number; fireAt?: { x: number; y: number }; wantSuper?: boolean } | null {
        if (s.config?.scenario === 'castle') return this.castleObjective(s);
        if (s.config?.scenario !== 'save_queen') return null;
        const q = s.scenario as { keystoneDown?: boolean; hasKey?: boolean; keyPos?: { x: number; y: number } | null; doorOpen?: boolean; queen?: { x: number; y: number } } | null;
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

    /**
     * Zamek (CastleMap: bramy S/N/W/E wokol donzonu 1400-1600): stanowisko 120 px za brama najblizsza
     * najblizszemu wrogowi (od strony dziedzinca), ogien w wroga. Bez wrogow: dziedziniec SW (respawn).
     */
    private castleObjective(s: SigmaSnapshot): { x: number; y: number; reach: number; fireAt?: { x: number; y: number }; wantSuper?: boolean } | null {
        const p = s.player!;
        const gates = [{ x: 1500, y: 1846 }, { x: 1500, y: 1154 }, { x: 1154, y: 1500 }, { x: 1846, y: 1500 }]; // srodki bram S,N,W,E
        let target: SigmaSnapshot['enemies'][number] | null = null; let td = Infinity;
        for (const e of s.enemies) { if (!e.active) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < td) { td = d; target = e; } }
        if (!target) return { x: 1290, y: 1700, reach: 60 };
        const g = gates.reduce((a, b) => Math.hypot(a.x - target!.x, a.y - target!.y) <= Math.hypot(b.x - target!.x, b.y - target!.y) ? a : b);
        const ix = 1500 - g.x, iy = 1500 - g.y, il = Math.hypot(ix, iy) || 1; // kierunek do srodka dziedzinca
        const post = { x: g.x + (ix / il) * 120, y: g.y + (iy / il) * 120 };
        const many = s.enemies.filter(e => e.active && Math.hypot(e.x - g.x, e.y - g.y) < 260).length;
        return { x: post.x, y: post.y, reach: 30, fireAt: { x: target.x, y: target.y }, wantSuper: many >= 3 && td < 320 };
    }
}
