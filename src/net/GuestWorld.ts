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
import { EnemyKind, PickupKind, type Snapshot, type SnapPlayer } from './Snapshot';
import { Gem } from '../entities/pickups/Gem';
import { Heart } from '../entities/pickups/Heart';
import { Magnet } from '../entities/pickups/Magnet';
import { PowerCube } from '../entities/pickups/PowerCube';
import { SeasonPickup } from '../entities/pickups/SeasonPickup';
import { getSeasonContent, getItemByValue } from '../config/seasonContent';
import { getCurrentSeason } from '../config/season';

/** LAN-3b: pickup narysowany u goscia (wspolny interfejs widoku pieciu klas). */
type ViewPickup = { setViewPos(x: number, y: number): void; destroy(): void; tick(delta: number): void };

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
    /** LAN-3b (lagi u goscia): pula pociskow gracza per czolg — bez new/destroy przy kazdym strzale (GC = szarpniecia). */
    private readonly pbPool = new Map<string, Bullet[]>();
    private readonly pickups = new Map<number, ViewPickup>();
    /** LAN-3b: stany niszczalnych i padow z najnowszej migawki — main.ts naklada je na swiat goscia. */
    public latestDestr: number[] = [];
    public latestPads: number[] = [];
    /** Pozycja kamery goscia (czolg hosta, idx 0) — czytana przez main.ts. */
    public focusX = 0;
    public focusY = 0;
    public hasFocus = false;
    /** HUD podgladu: HP i wynik hosta. */
    public hostHp = 0;
    public hostMaxHp = 1;
    public score = 0;

    /** LAN-2a: dane WLASNEGO czolgu goscia z najnowszej migawki (HP, cooldowny, czy zyje). */
    public own: SnapPlayer | null = null;

    /** @param focusIdx indeks gracza, za ktorym idzie kamera (gosc = 1, wlasny czolg). */
    constructor(private readonly world: PIXI.Container, private readonly focusIdx = 0) {}

    /** Diagnoza / testy: ile obiektow narysowanych. */
    get counts(): { enemies: number; pbullets: number; ebullets: number; players: number; pickups: number } {
        return { enemies: this.enemies.size, pbullets: this.pbullets.size, ebullets: this.ebullets.size, players: this.players.size, pickups: this.pickups.size };
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
        this.latestDestr = b.destr;
        this.latestPads = b.pads;
        this.applyPickups(a, b, t);
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
            pl.container.visible = pb.alive; // LAN-2a: lezacy gracz znika do odrodzenia
            pl.setPose(x, y, lerpAngle(pa.moveA, pb.moveA, t), lerpAngle(pa.turA, pb.turA, t),
                pb.hp, pb.maxHp, pb.moving, pb.superShot, pb.turbo);
            if (pb.idx === 0) { this.hostHp = pb.hp; this.hostMaxHp = pb.maxHp; }
            if (pb.idx === this.focusIdx) { this.focusX = x; this.focusY = y; this.hasFocus = true; this.own = pb; }
        }
        for (const [idx, pl] of this.players) if (!seenP.has(idx)) { pl.container.visible = false; }

        // ── wrogowie
        const seenE = new Set<number>();
        for (const eb of b.enemies) {
            seenE.add(eb.id);
            const ea = this.prevIndex(a).en.get(eb.id) ?? eb;
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
            const ba = this.prevIndex(a).pb.get(bb.id) ?? bb;
            let bu = this.pbullets.get(bb.id);
            if (!bu) {
                const brawler = BRAWLERS[bb.brawlerIdx] ?? BRAWLERS[0];
                bu = this.pbPool.get(brawler.id)?.pop();
                if (bu) bu.reset(bb.x, bb.y, bb.a, bb.superShot);
                else bu = new Bullet(bb.x, bb.y, bb.a, brawler, this.world, bb.superShot);
                if (bb.tower) bu.styleAsTowerTracer();
                this.pbullets.set(bb.id, bu);
            }
            bu.setPose(lerp(ba.x, bb.x), lerp(ba.y, bb.y), bb.a);
        }
        for (const [id, bu] of this.pbullets) {
            if (seenB.has(id)) continue;
            bu.deactivate();
            let pool = this.pbPool.get(bu.brawlerId);
            if (!pool) { pool = []; this.pbPool.set(bu.brawlerId, pool); }
            pool.push(bu);
            this.pbullets.delete(id);
        }

        // ── pociski wroga (pula — sa liczne i krotkie)
        const seenEb = new Set<number>();
        for (const qb of b.ebullets) {
            seenEb.add(qb.id);
            const qa = this.prevIndex(a).eb.get(qb.id) ?? qb;
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

    /** Indeks poprzedniej migawki po netId — budowany RAZ na migawke, nie przy kazdym obiekcie co klatke. */
    private idxFor: Snapshot | null = null;
    private idx = { en: new Map<number, Snapshot['enemies'][number]>(), pb: new Map<number, Snapshot['pbullets'][number]>(), eb: new Map<number, Snapshot['ebullets'][number]>() };
    private prevIndex(a: Snapshot): GuestWorld['idx'] {
        if (this.idxFor !== a) {
            this.idxFor = a;
            this.idx.en.clear(); this.idx.pb.clear(); this.idx.eb.clear();
            for (const e of a.enemies) this.idx.en.set(e.id, e);
            for (const q of a.pbullets) this.idx.pb.set(q.id, q);
            for (const q of a.ebullets) this.idx.eb.set(q.id, q);
        }
        return this.idx;
    }

    private makePickup(kind: PickupKind, value: number, x: number, y: number): ViewPickup | null {
        switch (kind) {
            case PickupKind.Gem: { const g = new Gem(x, y, this.world); return { setViewPos: (px, py) => g.setViewPos(px, py), destroy: () => g.destroy(), tick: (d) => g.update(d, -99999, -99999) }; }
            case PickupKind.Heart: { const h = new Heart(x, y, this.world); return { setViewPos: (px, py) => h.setViewPos(px, py), destroy: () => h.destroy(), tick: (d) => h.update(d) }; }
            case PickupKind.Magnet: { const m = new Magnet(x, y, this.world); return { setViewPos: (px, py) => m.setViewPos(px, py), destroy: () => m.destroy(), tick: (d) => m.update(d) }; }
            case PickupKind.CubeDmg:
            case PickupKind.CubeHp: { const c = new PowerCube(x, y, this.world, kind === PickupKind.CubeDmg ? 'dmg' : 'hp'); return { setViewPos: (px, py) => c.setViewPos(px, py), destroy: () => c.destroy(), tick: (d) => c.update(d) }; }
            case PickupKind.Season: {
                const content = getSeasonContent(getCurrentSeason().id);
                const item = content ? getItemByValue(content, value) : null;
                if (!content || !item) return null;
                const sp = new SeasonPickup(x, y, item, content, this.world);
                return { setViewPos: (px, py) => sp.setViewPos(px, py), destroy: () => sp.destroy(), tick: (d) => sp.update(d, -99999, -99999) };
            }
            default: return null;
        }
    }

    private applyPickups(a: Snapshot, b: Snapshot, t: number): void {
        const seen = new Set<number>();
        for (const kb of b.pickups) {
            seen.add(kb.id);
            let v = this.pickups.get(kb.id);
            if (!v) {
                const made = this.makePickup(kb.kind, kb.value, kb.x, kb.y);
                if (!made) continue;
                v = made;
                this.pickups.set(kb.id, v);
            }
            const ka = a.pickups.find(q => q.id === kb.id) ?? kb;
            v.setViewPos(ka.x + (kb.x - ka.x) * t, ka.y + (kb.y - ka.y) * t);
        }
        for (const [id, v] of this.pickups) if (!seen.has(id)) { v.destroy(); this.pickups.delete(id); }
    }

    /** Animacje pickupow (puls/bob) — co klatke u goscia. */
    tickPickups(delta: number): void {
        for (const v of this.pickups.values()) v.tick(delta);
    }

    /** Koniec meczu / rozlaczenie: wszystko zdjete (worldContainer i tak czysci startGame). */
    clear(): void {
        for (const en of this.enemies.values()) en.destroyView();
        for (const bu of this.pbullets.values()) bu.destroy();
        for (const pool of this.pbPool.values()) for (const bu of pool) bu.destroy();
        this.pbPool.clear();
        for (const eb of this.ebullets.values()) eb.destroy();
        for (const eb of this.ebPool) eb.destroy();
        for (const pl of this.players.values()) pl.container.destroy({ children: true });
        for (const v of this.pickups.values()) v.destroy();
        this.pickups.clear();
        this.enemies.clear(); this.pbullets.clear(); this.ebullets.clear(); this.players.clear();
        this.ebPool.length = 0;
        this.snaps = [];
        this.renderTick = -1;
        this.hasFocus = false;
    }
}
