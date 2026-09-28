/**
 * GuestWorld.ts — COOP LAN-3a: swiat hosta narysowany u goscia z migawek (bez symulacji).
 *
 * Interpolacja po TICKU hosta (nie po czasie odbioru — odporna na jitter Wi-Fi): gosc rysuje
 * chwile `renderTick` ~6 krokow (100 ms) za najnowsza migawka, miedzy dwiema migawkami, ktore
 * ja otaczaja. Brak nowszej migawki => ekstrapolacja najwyzej 3 kroki (50 ms), potem stop.
 * Wartosci z przegladu cross-model (bufor 100 ms, ekstrapolacja <= 50 ms).
 *
 * Obiekty to ISTNIEJACE klasy gry (Enemy / Player / Bullet / EnemyBullet) sterowane wylacznie
 * przez setPose — zero AI, kolizji i RNG symulacji. Nowy netId => nowy obiekt; netId, ktorego
 * nie ma w migawce => obiekt zdjety (eksplozje i dzwieki = LAN-3b, strumien zdarzen).
 */
import * as PIXI from 'pixi.js';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { Bullet } from '../entities/Bullet';
import { EnemyBullet } from '../entities/EnemyBullet';
import { ENEMY_NORMAL, ENEMY_BOSS, ENEMY_MEGA_BOSS, ENEMY_PURSUIT } from '../config/enemies';
import { BRAWLERS } from '../config/brawlers';
import { EnemyKind, type Snapshot } from './Snapshot';

const DELAY_TICKS = 6;        // 100 ms przy 60 Hz
const MAX_EXTRAP_TICKS = 3;   // 50 ms
const TAU = Math.PI * 2;

function lerpAngle(a: number, b: number, t: number): number {
    let d = ((b - a) % TAU + TAU) % TAU;
    if (d > Math.PI) d -= TAU;
    return a + d * t;
}

export class GuestWorld {
    private snaps: Snapshot[] = [];
    private renderTick = -1;
    private readonly enemies = new Map<number, Enemy>();
    private readonly players = new Map<number, Player>();
    private readonly pbullets = new Map<number, Bullet>();
    private readonly ebullets = new Map<number, EnemyBullet>();
    private readonly ebPool: EnemyBullet[] = [];
    /** Pozycja kamery goscia (czolg hosta, idx 0) — czytana przez main.ts. */
    public focusX = 0;
    public focusY = 0;
    public hasFocus = false;
    /** HUD podgladu: HP i wynik hosta. */
    public hostHp = 0;
    public hostMaxHp = 1;
    public score = 0;

    constructor(private readonly world: PIXI.Container) {}

    /** Diagnoza / testy: ile obiektow narysowanych. */
    get counts(): { enemies: number; pbullets: number; ebullets: number; players: number } {
        return { enemies: this.enemies.size, pbullets: this.pbullets.size, ebullets: this.ebullets.size, players: this.players.size };
    }

    push(s: Snapshot): void {
        const last = this.snaps[this.snaps.length - 1];
        if (last && s.tick <= last.tick) return; // stara/zdublowana (kanal nieuporzadkowany)
        this.snaps.push(s);
        if (this.snaps.length > 8) this.snaps.shift();
        if (this.renderTick < 0) this.renderTick = s.tick - DELAY_TICKS;
    }

    /** Wolane raz na klatke u goscia. `delta` = klatki 60 Hz od poprzedniego wywolania. */
    update(delta: number): void {
        if (this.snaps.length === 0) return;
        const newest = this.snaps[this.snaps.length - 1].tick;
        this.renderTick += delta;
        // Utrzymuj opoznienie w widelkach — po przycince sieci nie goni sie w nieskonczonosc.
        const target = newest - DELAY_TICKS;
        if (this.renderTick < target - DELAY_TICKS || this.renderTick > newest + MAX_EXTRAP_TICKS) this.renderTick = target;
        else if (this.renderTick < target - 1) this.renderTick += 0.1 * delta; // lekkie doganianie

        let a = this.snaps[0], b = this.snaps[0];
        for (let i = 0; i < this.snaps.length; i++) {
            if (this.snaps[i].tick <= this.renderTick) a = this.snaps[i];
            if (this.snaps[i].tick >= this.renderTick) { b = this.snaps[i]; break; }
            b = this.snaps[i];
        }
        const span = b.tick - a.tick;
        let t = span > 0 ? (this.renderTick - a.tick) / span : 0;
        t = Math.max(0, Math.min(1 + MAX_EXTRAP_TICKS / Math.max(1, span), t));
        this.apply(a, b, t);
    }

    private apply(a: Snapshot, b: Snapshot, t: number): void {
        this.score = b.score;
        const lerp = (x0: number, x1: number): number => x0 + (x1 - x0) * t;

        // ── gracze
        const seenP = new Set<number>();
        for (const pb of b.players) {
            seenP.add(pb.idx);
            const pa = a.players.find(p => p.idx === pb.idx) ?? pb;
            let pl = this.players.get(pb.idx);
            if (!pl) {
                const brawler = BRAWLERS[pb.brawlerIdx] ?? BRAWLERS[0];
                pl = new Player(brawler, this.world, null);
                this.players.set(pb.idx, pl);
            }
            const x = lerp(pa.x, pb.x), y = lerp(pa.y, pb.y);
            pl.setPose(x, y, lerpAngle(pa.moveA, pb.moveA, t), lerpAngle(pa.turA, pb.turA, t),
                pb.hp, pb.maxHp, pb.moving, pb.superShot, pb.turbo);
            if (pb.idx === 0) { this.focusX = x; this.focusY = y; this.hasFocus = true; this.hostHp = pb.hp; this.hostMaxHp = pb.maxHp; }
        }
        for (const [idx, pl] of this.players) if (!seenP.has(idx)) { pl.container.visible = false; }

        // ── wrogowie
        const seenE = new Set<number>();
        for (const eb of b.enemies) {
            seenE.add(eb.id);
            const ea = a.enemies.find(e => e.id === eb.id) ?? eb;
            let en = this.enemies.get(eb.id);
            if (!en) {
                const cfg = eb.kind === EnemyKind.Mega ? ENEMY_MEGA_BOSS : eb.kind === EnemyKind.Boss ? ENEMY_BOSS
                    : eb.kind === EnemyKind.Pursuit ? ENEMY_PURSUIT : ENEMY_NORMAL;
                en = new Enemy(eb.x, eb.y, cfg, eb.kind === EnemyKind.Boss || eb.kind === EnemyKind.Mega, this.world,
                    eb.kind === EnemyKind.Mega, eb.kind === EnemyKind.Pursuit);
                en.maxHp = eb.maxHp;
                this.enemies.set(eb.id, en);
            }
            en.maxHp = eb.maxHp;
            en.setPose(lerp(ea.x, eb.x), lerp(ea.y, eb.y), lerpAngle(ea.a, eb.a, t), eb.hp, eb.frozen);
        }
        for (const [id, en] of this.enemies) if (!seenE.has(id)) { en.destroyView(); this.enemies.delete(id); }

        // ── pociski gracza
        const seenB = new Set<number>();
        for (const bb of b.pbullets) {
            seenB.add(bb.id);
            const ba = a.pbullets.find(q => q.id === bb.id) ?? bb;
            let bu = this.pbullets.get(bb.id);
            if (!bu) {
                const brawler = BRAWLERS[bb.brawlerIdx] ?? BRAWLERS[0];
                bu = new Bullet(bb.x, bb.y, bb.a, brawler, this.world, bb.superShot);
                if (bb.tower) bu.styleAsTowerTracer();
                this.pbullets.set(bb.id, bu);
            }
            bu.setPose(lerp(ba.x, bb.x), lerp(ba.y, bb.y), bb.a);
        }
        for (const [id, bu] of this.pbullets) if (!seenB.has(id)) { bu.destroy(); this.pbullets.delete(id); }

        // ── pociski wroga (pula — sa liczne i krotkie)
        const seenEb = new Set<number>();
        for (const qb of b.ebullets) {
            seenEb.add(qb.id);
            const qa = a.ebullets.find(q => q.id === qb.id) ?? qb;
            let eb = this.ebullets.get(qb.id);
            if (!eb) {
                eb = this.ebPool.pop();
                if (eb) eb.reset(qb.x, qb.y, qb.a, 0, 0, qb.color, qb.type);
                else eb = new EnemyBullet(qb.x, qb.y, qb.a, 0, 0, qb.color, this.world, qb.type);
                this.ebullets.set(qb.id, eb);
            }
            eb.setPose(lerp(qa.x, qb.x), lerp(qa.y, qb.y));
        }
        for (const [id, eb] of this.ebullets) if (!seenEb.has(id)) { eb.deactivate(); this.ebPool.push(eb); this.ebullets.delete(id); }
    }

    /** Koniec meczu / rozlaczenie: wszystko zdjete (worldContainer i tak czysci startGame). */
    clear(): void {
        for (const en of this.enemies.values()) en.destroyView();
        for (const bu of this.pbullets.values()) bu.destroy();
        for (const eb of this.ebullets.values()) eb.destroy();
        for (const eb of this.ebPool) eb.destroy();
        for (const pl of this.players.values()) pl.container.destroy({ children: true });
        this.enemies.clear(); this.pbullets.clear(); this.ebullets.clear(); this.players.clear();
        this.ebPool.length = 0;
        this.snaps = [];
        this.renderTick = -1;
        this.hasFocus = false;
    }
}
