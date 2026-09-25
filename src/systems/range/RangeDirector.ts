import type * as PIXI from 'pixi.js';
import { Enemy } from '../../entities/Enemy';
import { ENEMY_NORMAL, ENEMY_BOSS, type EnemyConfig } from '../../config/enemies';
import type { DifficultyModifiers } from '../../config/difficulty';
import { sigmaEmit, SIGMA_BOT } from '../../testing/sigmaFlag';
import { RANGE_TUNING as T, RANGE_LAYOUT_ID, rangePointXY, type RangeSpawnPoint, type RangeStationDef } from './rangeTuning';

/**
 * RangeDirector — rezyser STRZELNICY (v0.209.0). Wzorzec QueenDirector.spawnAt, ale zamiast
 * zegara/fal: maszyna stanow stanowisk S1 -> S2 -> S3 z rangeTuning.ts.
 *
 * Mierzy PER STANOWISKO: kroki logiki do wyczyszczenia, strzaly/trafienia, obrazenia zadane i
 * otrzymane (roznica licznikow GameSession miedzy startem a koncem stanowiska) oraz DYSTANS
 * kazdego zabicia (pozycja wroga vs gracza w chwili registerKill) — to sa dane, ktorych model
 * balansu nigdy nie mial (solver ZAKLADAL 150/300/500 px).
 *
 * Determinizm: zero Date.now / Math.random; predkosc wrogow z worldRng (Enemy ctor) — ten sam
 * seed = ten sam run pod ?bot=1. Brak wplywu na inne scenariusze (gałąź po config.scenario).
 */

export interface RangeStats { shotsFired: number; shotsHit: number; damageDealt: number; damageTaken: number }

export interface RangeStationReport {
    id: string;
    kind: RangeStationDef['kind'];
    /** kroki logiki (60 Hz) od startu stanowiska do wyczyszczenia / timeoutu */
    steps: number;
    seconds: number;
    shotsFired: number;
    shotsHit: number;
    /** 0..100 (%); null gdy zero strzalow */
    accuracy: number | null;
    dmgDealt: number;
    dmgTaken: number;
    /** obrazenia zadane na sekunde stanowiska */
    dps: number;
    kills: number;
    /** dystans gracz -> wrog [px] w chwili kazdego zabicia (tylko wrogowie tego stanowiska) */
    killDistances: number[];
    /** ile razy gracz zostal „uratowany" (HP < RESCUE_HP_FRAC -> pelne HP) — presja bez urywania pomiaru */
    rescues: number;
    timedOut: boolean;
}

/** Prog ratunku: 0.7 — boss bije 200, wiec od 70% nawet Shadow (300 HP) przezyje jedno trafienie przed kolejnym sprawdzeniem. */
const RESCUE_HP_FRAC = 0.7;
/**
 * Standoff napastnikow pod ?bot=1: bot stoi, wiec wrog, ktory dojedzie, taranuje CO KLATKE
 * (zmierzone: boss 150 600 dmg / 502 ratunkow w 12 s, Snajper zginal). Zatrzymujemy ich na
 * 150 px — pomiar zostaje o sile ognia; dystanse zabic ponizej 150 znikaja (swiadomie).
 */
const BOT_STANDOFF_PX = 150;

export interface RangeReport {
    layout: string;
    done: boolean;
    totalSteps: number;
    stations: RangeStationReport[];
}

export interface RangeDirectorOpts {
    worldContainer: PIXI.Container;
    enemies: Enemy[];
    difficulty: DifficultyModifiers;
    /** po KAZDYM spawnie (main: attachEnemyCubeStolenCallback + freeze-on-spawn) */
    onSpawn: (enemy: Enemy) => void;
    /** biezace liczniki GameSession (roznica = wynik stanowiska) */
    stats: () => RangeStats;
    /** pelne HP gracza (miedzy stanowiskami + ratunek) */
    healPlayer: () => void;
    /** hp/maxHp gracza (0..1) — ratunek przy < RESCUE_HP_FRAC */
    playerHpFrac: () => number;
    /** pozycja gracza — standoff napastnikow pod ?bot=1 */
    playerPos: () => { x: number; y: number };
    /** usun wroga po timeoucie stanowiska (main: applyHazardDamageToEnemy z duzym dmg) */
    cull: (enemy: Enemy) => void;
}

export class RangeDirector {
    private readonly opts: RangeDirectorOpts;
    private stationIdx = -1;
    private stepsInStation = 0;
    private totalSteps = 0;
    private waveIdx = 0;
    private spawned: Enemy[] = [];
    private baseline: RangeStats = { shotsFired: 0, shotsHit: 0, damageDealt: 0, damageTaken: 0 };
    private killDistances: number[] = [];
    private rescues = 0;
    private readonly finished: RangeStationReport[] = [];
    private done = false;

    constructor(opts: RangeDirectorOpts) { this.opts = opts; }

    /** Wolane co krok logiki z main.runLogicStep. victory = wszystkie stanowiska zamkniete. */
    update(delta: number): { victory: boolean } {
        if (this.done) return { victory: true };
        if (this.stationIdx < 0) this.startStation(0);
        this.stepsInStation += delta;
        this.totalSteps += delta;
        // Ratunek: pomiar nie moze sie urwac smiercia (bot stoi w miejscu — nie unika). Obrazenia
        // otrzymane sa juz policzone w GameSession.damageTaken, wiec presja zostaje w raporcie.
        if (this.opts.playerHpFrac() < RESCUE_HP_FRAC) { this.opts.healPlayer(); this.rescues++; }

        const st = T.stations[this.stationIdx];
        if (SIGMA_BOT && st.kind !== 'static') {
            const p = this.opts.playerPos();
            for (const e of this.spawned) {
                if (!e.active) continue;
                e.castleSpeedMult = Math.hypot(e.x - p.x, e.y - p.y) <= BOT_STANDOFF_PX ? 0 : 1;
            }
        }
        const alive = this.aliveCount();
        if (st.kind === 'approach' && alive === 0 && this.waveIdx < st.waves.length) {
            this.spawnWave(st.waves[this.waveIdx++]);
            return { victory: false };
        }
        const cleared = alive === 0 && (st.kind !== 'approach' || this.waveIdx >= st.waves.length);
        const timedOut = !cleared && this.stepsInStation >= T.stationTimeoutSteps;
        if (cleared || timedOut) {
            this.finishStation(timedOut);
            if (this.stationIdx + 1 < T.stations.length) {
                this.startStation(this.stationIdx + 1);
            } else {
                this.done = true;
                const rep = this.report();
                sigmaEmit({ t: 'range', report: rep });
                // Czlowiek na desktopie widzi wynik od razu w F12 (endcard ma skrocona wersje).
                console.table(rep.stations.map(s => ({ station: s.id, sec: s.seconds, acc: s.accuracy, dps: s.dps, dmgTaken: s.dmgTaken, rescues: s.rescues, kills: s.kills, timeout: s.timedOut })));
                return { victory: true };
            }
        }
        return { victory: false };
    }

    /** main: w KAZDYM z wywolan spawnSystem.registerKill (pocisk / taran / AoE). */
    onKill(enemy: Enemy, playerX: number, playerY: number): void {
        if (!this.spawned.includes(enemy)) return;
        this.killDistances.push(Math.round(Math.hypot(enemy.x - playerX, enemy.y - playerY)));
    }

    report(): RangeReport {
        const stations = [...this.finished];
        if (!this.done && this.stationIdx >= 0) stations.push(this.snapshotStation(false, T.stations[this.stationIdx]));
        return { layout: RANGE_LAYOUT_ID, done: this.done, totalSteps: Math.round(this.totalSteps), stations };
    }

    get currentStationId(): string | null { return this.stationIdx >= 0 && !this.done ? T.stations[this.stationIdx].id : null; }

    // ── prywatne ──────────────────────────────────────────────────────────────

    private startStation(idx: number): void {
        this.stationIdx = idx;
        this.stepsInStation = 0;
        this.waveIdx = 0;
        this.spawned = [];
        this.killDistances = [];
        this.rescues = 0;
        this.baseline = { ...this.opts.stats() };
        if (T.healBetweenStations) this.opts.healPlayer();
        const st = T.stations[idx];
        if (st.kind === 'static') {
            for (const p of st.points) this.spawnAt(p, false, true);
        } else if (st.kind === 'approach') {
            this.spawnWave(st.waves[this.waveIdx++]);
        } else {
            this.spawnAt(st.point, true, false);
        }
    }

    private finishStation(timedOut: boolean): void {
        const st = T.stations[this.stationIdx];
        this.finished.push(this.snapshotStation(timedOut, st));
        if (timedOut) {
            // Najpierw odciac liste (onKill ma ignorowac sprzatanie), potem zdjac niedobitki.
            const leftovers = this.spawned.filter(e => e.active);
            this.spawned = [];
            for (const e of leftovers) this.opts.cull(e);
        }
    }

    private snapshotStation(timedOut: boolean, st: RangeStationDef): RangeStationReport {
        const now = this.opts.stats();
        const steps = Math.round(this.stepsInStation);
        const seconds = Math.round((steps / 60) * 100) / 100;
        const shotsFired = now.shotsFired - this.baseline.shotsFired;
        const shotsHit = now.shotsHit - this.baseline.shotsHit;
        const dmgDealt = Math.round(now.damageDealt - this.baseline.damageDealt);
        return {
            id: st.id, kind: st.kind, steps, seconds,
            shotsFired, shotsHit,
            accuracy: shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 1000) / 10 : null,
            dmgDealt,
            dmgTaken: Math.round(now.damageTaken - this.baseline.damageTaken),
            dps: seconds > 0 ? Math.round(dmgDealt / seconds) : 0,
            kills: this.killDistances.length,
            killDistances: [...this.killDistances],
            rescues: this.rescues,
            timedOut,
        };
    }

    private spawnWave(points: readonly RangeSpawnPoint[]): void {
        for (const p of points) this.spawnAt(p, false, false);
    }

    private aliveCount(): number {
        let n = 0;
        for (const e of this.spawned) if (e.active) n++;
        return n;
    }

    private scaleConfig(base: EnemyConfig): EnemyConfig {
        const m = this.opts.difficulty;
        return {
            ...base,
            hp: Math.round(base.hp * m.enemyHpMult),
            dmg: Math.round(base.dmg * m.enemyDmgMult),
            bulletDmg: Math.round(base.bulletDmg * m.enemyDmgMult),
            speedMin: base.speedMin * m.enemySpeedMult,
            speedMax: base.speedMax * m.enemySpeedMult,
        };
    }

    /** Spawn w punkcie stanowiska. Statyk: stoi i nie strzela (tarcza), ale przyjmuje obrazenia i ginie normalnie. */
    private spawnAt(p: RangeSpawnPoint, boss: boolean, isStatic: boolean): Enemy {
        const { x, y } = rangePointXY(p);
        const enemy = new Enemy(x, y, this.scaleConfig(boss ? ENEMY_BOSS : ENEMY_NORMAL), boss, this.opts.worldContainer);
        if (isStatic) {
            // castleSpeedMult, NIE speedModifier: main.ts:4209 nadpisuje speedModifier co klatke
            // (strefy spowolnienia) — pierwsza wersja tarcz „podjezdzala" do gracza na 60 px.
            enemy.castleSpeedMult = 0;    // zero ruchu (Enemy.update: speed * speedModifier * castleSpeedMult)
            enemy.castleNoShoot = true;   // zero strzalow (ten sam seam co maszyny oblezenia Zamku)
        } else {
            // BOT stoi w miejscu i nie unika — 4 pociski = smierc w 2 s (zmierzone). Pod ?bot=1 wrogowie
            // TYLKO podjezdzaja i taranuja (czysta sila ognia); czlowiek dostaje pelna walke.
            enemy.castleNoShoot = SIGMA_BOT;
        }
        this.opts.enemies.push(enemy);
        this.spawned.push(enemy);
        this.opts.onSpawn(enemy);
        return enemy;
    }
}
