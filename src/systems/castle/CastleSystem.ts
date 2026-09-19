import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { EffectsManager } from '../../rendering/Effects';
import type { GameSession } from '../../services/GameSession';
import type { DifficultyModifiers } from '../../config/difficulty';
import type { AudioSys } from '../../audio/AudioSys';
import { t } from '../../i18n/i18n';
import { worldRng } from '../Rng';
import { CastlePart, type CastleDamageSource } from '../../maps/castle/CastlePart';
import {
    CASTLE_LANES, CASTLE_RING, CASTLE_BRIDGE_CENTERS, CASTLE_ATTACK, CASTLE_RESPAWN,
    CASTLE_SANCTUARY, CASTLE_SIEGE_POS, type CastleLaneId, type CastlePoint,
} from '../../maps/CastleMap';
import { CASTLE_TUNING as T, CASTLE_WAVES_TOTAL, type CastleRole } from './castleWaves';
import { WaveDirector } from './WaveDirector';
import { CatapultStone } from '../../entities/castle/CatapultStone'; // F4
import { SRC_CATAPULT } from '../../types/DamageSource'; // F4
import { CastleDebris } from '../../maps/castle/CastleDebris'; // F6
import * as PIXI from 'pixi.js';

/**
 * CastleSystem — rdzen scenariusza OBRON ZAMEK (F3). Wzorzec strukturalny: CtfSystem.
 *
 *  - FAZY: intro (6 s) -> combat (fala N) -> build (15 s, naprawa, wczesny start) ->
 *    combat ... -> victory (fala 6 odparta LUB mega boss zabity) / defeat (donzon 0 HP).
 *  - CELOWANIE (targetFor): wrogowie z castleRole ida WAYPOINTAMI, bez pathfindingu:
 *    lane -> pierscien (krotsza strona) -> most strony celu -> punkt ataku. Cel per
 *    wrog = najblizszy WYLOM (zniszczony segment/brama) albo BRAMA; brama/wylom otwarte
 *    -> donzon. Re-ewaluacja co 500 ms. Anti-grind: ruch < 8 px przez 1.5 s -> snap
 *    do nastepnego wezla. Pierscien i mosty sa WYPIEKANE w gruncie => gracz czyta trase.
 *  - OBRAZENIA STRUKTUR (damagePart): jeden seam dla kontaktu (po dojezdzie, cooldown
 *    per atakujacy), pociskow wroga (proxy), taranu i katapult (F4). Pociski/moce
 *    gracza NIE rania zamku (proxy bez takeDamage).
 *  - SMIERC GRACZA: respawn na apronie donzonu po 5 s + 3 s nietykalnosci; jedyna
 *    przegrana = donzon 0 HP. Sanktuarium (apron): pociski wroga gina, kontakt OFF.
 *  - Stan przezywalny (fala, smierci, naprawy, bonusy) zyje w GameSession.castle.
 */

export interface CastleUpdateResult {
    victory: boolean;
    defeat: boolean;
}

export type CastlePhase = 'tutorial' | 'intro' | 'combat' | 'build' | 'victory' | 'defeat';

export interface CastleHudInfo {
    phase: CastlePhase;
    wave: number;
    wavesTotal: number;
    /** sekundy do konca fazy build / intro (0 w combat) */
    phaseSecondsLeft: number;
    wallPct: number;
    gatePct: number;
    gateDestroyed: boolean;
    /** v0.194.0 — HP kazdej bramy osobno (0 = zniszczona), dla segmentow paska HP Zamku. */
    gatePcts: number[];
    gatesAlive: number;
    gatesTotal: number;
    keepPct: number;
    respawnSecondsLeft: number;
    enemiesAlive: number;
    /** aktywne lane'y (ostatni batch) do strzalek krawedziowych */
    activeLanes: CastleLaneId[];
    breaches: CastlePoint[];
    megaAlive: boolean;
    /** F4: glazy w locie (debug/HUD). */
    stonesInFlight: number;
    /** P0.7: zniszczone segmenty muru (licznik w pigulce MUR). */
    wallsDestroyed: number;
    /** P1: maszyny obleznicze (strzalki krawedziowe — "strzela znikad" = bug czytelnosci). */
    machines: Array<{ x: number; y: number; role: CastleRole }>;
    /** P1: donzon < 33% — czerwona winieta krawedzi przez ~1 s. */
    keepAlarm: boolean;
}

export interface CastleSystemOpts {
    session: GameSession;
    worldContainer: PIXI.Container;
    enemies: Enemy[];
    effects: EffectsManager;
    audio: AudioSys;
    difficulty: DifficultyModifiers;
    parts: CastlePart[];
    hudNotif: (text: string, cssColor: string) => void;
    /** F5: glosny baner (HUD.triggerCastleBanner) — fale, wylomy, brama, mega, trebuchet. */
    banner: (text: string, cssColor: string, frames?: number) => void;
    onEnemySpawned: (enemy: Enemy) => void;
    onWaveStart: (wave: number) => void;
    onWaveCleared: (wave: number, bonus: number) => void;
    onBuildPhase: (seconds: number) => void;
    onMegaSpawned: (enemy: Enemy) => void;
    onPlayerRespawn: () => void;
    onCastleDestroyed: () => void;
    onLaneBatch: (lane: CastleLaneId) => void;
    /** TUTORIAL: true = zacznij od szkolenia (4 kroki) zamiast intro. */
    tutorial: boolean;
    /** TUTORIAL zaliczony/pominiety — main zapisuje flage per urzadzenie. */
    onTutorialDone: () => void;
}

interface RouteNode extends CastlePoint { attack?: boolean }
interface Objective {
    id: string;
    side: CastleLaneId;
    /** czesc, ktora obrywa kontakt po dojezdzie */
    part: CastlePart;
    /** wezly od mostu strony celu do punktu ataku */
    tail: RouteNode[];
}

const RING_INDEX: Record<CastleLaneId, number> = { N: 0, E: 2, S: 4, W: 6 };

export class CastleSystem {
    private readonly opts: CastleSystemOpts;
    private readonly director: WaveDirector;
    private phase: CastlePhase = 'intro';
    private phaseUntil = 0;
    private wave = 0;
    private objectives: Objective[] = [];
    private objectivesDirty = true;
    private lastRetargetAt = 0;
    private routeCache = new Map<string, RouteNode[]>();
    private playerDead = false;
    private respawnAt = 0;
    private invulUntil = 0;
    private lastRepairFxAt = 0;
    private rebuildCap = new Map<CastlePart, number>();
    private activeLanes: CastleLaneId[] = [];
    private lastLaneAt = 0;
    private readonly gates: CastlePart[];
    private playerX = 1500;
    private playerY = 1500;
    private readonly keep: CastlePart;
    private readonly walls: CastlePart[];
    private victoryFired = false;
    private defeatFired = false;
    /** F4: lecace glazy katapult/trebuchetow (cap w tuningu). */
    private stones: CatapultStone[] = [];
    /** F4: wrogowie fali sledzeni do zliczania killi maszyn (active -> !active). */
    private tracked = new Set<Enemy>();
    /** F6: markery naprawy (pulsujace obrysy uszkodzonych czesci + pasek postepu) — 1 Graphics. */
    private repairGfx: PIXI.Graphics;
    /** F6: odlatujace wrota. */
    private debris: CastleDebris;
    /** P1: markery taktyczne — linia szarzy taranu + czerwony pierscien na bramie z >=2 commitami. 1 Graphics. */
    private machineGfx: PIXI.Graphics;
    private machineGfxEmpty = true;
    /** P1: kiedy czesc padla — strzalka wylomu gasnie po breachArrowMs. */
    private destroyedAt = new Map<CastlePart, number>();
    private lastBuildTick = -1;
    private lastStopHintAt = 0;
    private keepAlarmUntil = 0;
    /** F6: podpowiedzi intro (3 banery po kolei). */
    private hintIdx = 0;
    private nextHintAt = 0;
    /** DEBUG (F12 castleOnlyMachines): struktury obrywaja TYLKO od maszyn — test taranu/katapult bez obrony. */
    public debugOnlyMachines = false;

    constructor(opts: CastleSystemOpts) {
        this.opts = opts;
        this.gates = opts.parts.filter(p => p.kind === 'gate');
        this.keep = opts.parts.find(p => p.kind === 'keep')!;
        this.walls = opts.parts.filter(p => p.kind === 'wall');
        for (const p of opts.parts) {
            p.onDamage = (part, dmg, hx, hy, src) => this.damagePart(part, dmg, hx, hy, src);
            p.onTierChanged = (part, from, to) => this.onTierChanged(part, from, to);
        }
        this.director = new WaveDirector({
            worldContainer: opts.worldContainer,
            enemies: opts.enemies,
            difficulty: opts.difficulty,
            onSpawn: (e) => { this.tracked.add(e); opts.onEnemySpawned(e); },
            onMegaSpawned: (e) => { opts.onMegaSpawned(e); opts.banner(t('castle.mega'), '#ff3366', 150); opts.audio.playYetiRoar(); },
            onLaneBatch: (lane) => { this.noteLane(lane); opts.onLaneBatch(lane); },
        });
        this.repairGfx = new PIXI.Graphics();
        this.repairGfx.zIndex = 5300;
        opts.worldContainer.addChild(this.repairGfx);
        this.machineGfx = new PIXI.Graphics();
        this.machineGfx.zIndex = 5290;
        opts.worldContainer.addChild(this.machineGfx);
        this.debris = new CastleDebris(opts.worldContainer);
        const now = Date.now();
        if (opts.session.castle) opts.session.castle.wave = 0;
        if (opts.tutorial) {
            // TUTORIAL (decyzja Mariusza): 4 kroki na zywej mapie, bez fal, potem normalne intro.
            this.phase = 'tutorial';
            this.tutStep = 1;
            this.tutStepAt = now;
            opts.banner(t('castle.tut.title'), '#e0b53c', 150);
            opts.hudNotif(t('castle.tut.step1'), '#e0b53c');
        } else {
            this.phase = 'intro';
            this.phaseUntil = now + T.firstWaveDelayMs;
            this.nextHintAt = now + 1200;
            opts.hudNotif(t('castle.intro'), '#e0b53c');
        }
    }

    // ── TUTORIAL ───────────────────────────────────────────────────────────
    private tutStep = 0;
    private tutStepAt = 0;
    private tutWentOut = false;
    private tutWall: CastlePart | null = null;

    private tutAdvance(next: number, now: number): void {
        this.tutStep = next;
        this.tutStepAt = now;
        this.opts.audio.playMenuClick();
        const key = next === 2 ? 'castle.tut.step2' : next === 3 ? 'castle.tut.step3' : 'castle.tut.step4';
        // v0.191.0: bylo baner + notif z TYM SAMYM tekstem w jednej klatce. Zostaje baner.
        this.opts.banner(t(key), '#e0b53c', 170);
        if (next === 3) {
            this.director.spawnScouts(3, 'S');
            this.noteLane('S');
            this.opts.onLaneBatch('S');
        }
        if (next === 4) {
            const w = this.walls.find(x => x.id === 'wallS_W') ?? this.walls[0];
            this.tutWall = w;
            w.applyDamage(Math.round(w.maxHp * 0.55));
            this.opts.effects.spawnShockwaveRing(w.centerX, w.centerY, 90, 0xc9ccd0);
            this.opts.effects.shake(8, 12);
            this.opts.banner(t('castle.repairHint'), '#2ecc71', 150);
        }
    }

    /** Koniec szkolenia (zaliczone lub pominiete) -> normalne intro z podpowiedziami. */
    private tutFinish(now: number, skipped: boolean): void {
        for (const e of this.opts.enemies) {
            if (!e.active || !e.castleRole) continue;
            e.active = false;
            if (e.container.parent) e.container.parent.removeChild(e.container);
            e.container.destroy({ children: true });
        }
        if (this.tutWall) this.tutWall.repair(this.tutWall.maxHp);
        this.phase = 'intro';
        this.phaseUntil = now + T.firstWaveDelayMs;
        this.nextHintAt = now + 1200;
        if (!skipped) this.opts.banner(t('castle.tut.done'), '#2ecc71', 150);
        this.opts.onTutorialDone();
    }

    private updateTutorial(player: Player, now: number): void {
        const gate = this.gates.find(g => g.side === 'S') ?? this.gates[0];
        switch (this.tutStep) {
            case 1:
                if ((player.x - gate.centerX) ** 2 + (player.y - gate.centerY) ** 2 < 150 * 150 && now - this.tutStepAt > 800) this.tutAdvance(2, now);
                break;
            case 2:
                if (!this.tutWentOut && player.y > gate.y + 120) { this.tutWentOut = true; this.opts.hudNotif(t('castle.tut.step2'), '#2ecc71'); }
                if (this.tutWentOut && player.y < gate.y - 40) this.tutAdvance(3, now);
                break;
            case 3:
                if (now - this.tutStepAt > 1500 && this.director.aliveCount() === 0) this.tutAdvance(4, now);
                break;
            case 4:
                if (this.tutWall && this.tutWall.hpPct >= 0.9) this.tutFinish(now, false);
                break;
        }
    }

    // ── PUBLIC API ─────────────────────────────────────────────────────────

    public get currentPhase(): CastlePhase { return this.phase; }
    public get currentWave(): number { return this.wave; }
    public isPlayerDead(): boolean { return this.playerDead; }
    public isSpawnInvul(): boolean { return Date.now() < this.invulUntil; }
    public isBuildPhase(): boolean { return this.phase === 'build'; }

    public isInSanctuary(px: number, py: number): boolean {
        const s = CASTLE_SANCTUARY;
        return px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h;
    }

    /** Wczesny start nastepnej fali (przycisk/N). Zwraca sekundy, ktore zostaly (bonus). */
    public startNextWaveNow(): number {
        const now = Date.now();
        if (this.phase === 'tutorial') { this.tutFinish(now, true); return 0; } // przycisk = "Pomin szkolenie"
        if (this.phase !== 'build' && this.phase !== 'intro') return 0;
        // v0.191.0: bonus za wczesny start SKASOWANY razem z przyciskiem (decyzja Mariusza).
        // Bez przycisku nie da sie go zdobyc, wiec sufit wyniku spada jednakowo dla wszystkich.
        const secLeft = Math.max(0, Math.floor((this.phaseUntil - now) / 1000));
        this.beginWave(this.wave + 1, now);
        return secLeft;
    }

    /** Smierc gracza: NIE game over — respawn po 5 s (jedyna przegrana = donzon). */
    public onPlayerDied(player: Player): void {
        if (this.playerDead) return;
        this.playerDead = true;
        this.respawnAt = Date.now() + T.respawnMs;
        const c = this.opts.session.castle;
        if (c) c.deaths++;
        this.opts.effects.spawnExplosionAndWreck(player.x, player.y, 0xff4444);
        this.opts.effects.shake(10, 14);
        this.opts.audio.playExplosion();
        player.container.visible = false;
        // v0.191.0: notif WYCIETY — ten sam odliczany czas pokazuje juz wielki licznik respawnu
        // na srodku ekranu (HUD.drawCastleRespawn). Dwa razy to samo = szum.
    }

    /** Moc NAPRAWA (PowerSystem.onRepairActivated): +30% najblizszej uszkodzonej czesci w 160 px. */
    public onRepairPower(x: number, y: number): void {
        const part = this.nearestDamagedPart(x, y, T.powerRepairRange);
        if (!part) return;
        const added = part.repair(Math.round(part.maxHp * T.powerRepairPct));
        if (added > 0) {
            this.opts.audio.playHeartPickup();
            const c = this.opts.session.castle;
            if (c) c.repairsDone++;
            this.opts.effects.spawnFloatingText(part.centerX, part.y - 20, `+${Math.round(added / 100)} 🔧`, 0x2ecc71);
            this.opts.effects.spawnEnemyHitSparks(part.centerX, part.y, 0x2ecc71);
        }
    }

    public getHudInfo(): CastleHudInfo {
        const now = Date.now();
        let wallHp = 0, wallMax = 0;
        for (const w of this.walls) { wallHp += w.hp; wallMax += w.maxHp; }
        const breaches: CastlePoint[] = [];
        // P1: strzalka wylomu gasnie po 20 s (wieczna = szum; sam wylom zostaje na mapie)
        const fresh = (p: CastlePart): boolean => p.isDestroyed && now - (this.destroyedAt.get(p) ?? 0) < T.breachArrowMs;
        for (const w of this.walls) if (fresh(w)) breaches.push({ x: w.centerX, y: w.centerY });
        for (const g of this.gates) if (fresh(g)) breaches.push({ x: g.centerX, y: g.centerY });
        const machines: CastleHudInfo['machines'] = [];
        for (const e of this.opts.enemies) if (e.active && e.castleRole && CastleSystem.isMachine(e.castleRole)) machines.push({ x: e.x, y: e.y, role: e.castleRole });
        // P0.7: pasek = najslabsza ZYWA brama (zniszczona ma licznik, nie pasek 0%)
        let gateMin = 1, gatesAlive = 0, wallsDestroyed = 0;
        for (const g of this.gates) { if (!g.isDestroyed) { gatesAlive++; if (g.hpPct < gateMin) gateMin = g.hpPct; } }
        if (gatesAlive === 0) gateMin = 0;
        for (const w of this.walls) if (w.isDestroyed) wallsDestroyed++;
        const mega = this.director.megaSpawned;
        return {
            phase: this.phase,
            wave: this.wave,
            wavesTotal: CASTLE_WAVES_TOTAL,
            phaseSecondsLeft: (this.phase === 'build' || this.phase === 'intro') ? Math.max(0, Math.ceil((this.phaseUntil - now) / 1000)) : 0,
            wallPct: wallMax > 0 ? wallHp / wallMax : 1,
            gatePct: gateMin,
            gateDestroyed: gatesAlive < this.gates.length,
            gatePcts: this.gates.map(g => g.isDestroyed ? 0 : g.hpPct),
            gatesAlive,
            gatesTotal: this.gates.length,
            keepPct: this.keep.hpPct,
            respawnSecondsLeft: this.playerDead ? Math.max(0, Math.ceil((this.respawnAt - now) / 1000)) : 0,
            enemiesAlive: this.director.aliveCount(),
            activeLanes: now - this.lastLaneAt < 6000 ? this.activeLanes : [],
            breaches,
            megaAlive: !!(mega && mega.active),
            stonesInFlight: this.stones.length,
            wallsDestroyed,
            machines,
            keepAlarm: now < this.keepAlarmUntil,
        };
    }

    // ── UPDATE ─────────────────────────────────────────────────────────────

    public update(delta: number, player: Player, isInvulnerable: boolean): CastleUpdateResult {

        this.playerX = player.x; this.playerY = player.y;
        const now = Date.now();
        const dtSec = delta / 60;

        // respawn
        if (this.playerDead && now >= this.respawnAt) {
            this.playerDead = false;
            player.x = CASTLE_RESPAWN.x; player.y = CASTLE_RESPAWN.y;
            player.hp = player.maxHp;
            player.container.visible = true;
            this.invulUntil = now + T.spawnInvulMs;
            this.opts.effects.spawnShockwaveRing(player.x, player.y, 90, 0xe0b53c);
            this.opts.hudNotif(t('castle.respawned'), '#e0b53c');
            this.opts.onPlayerRespawn();
        }
        // blink nietykalnosci po respawnie (T12: wyrazny)
        if (!this.playerDead) {
            if (now < this.invulUntil) player.container.alpha = 0.45 + 0.55 * Math.abs(Math.sin(now / 90));
            else if (player.container.alpha !== 1) player.container.alpha = 1;
        }

        // F6 (#6): 3 podpowiedzi intro po kolei (droga->brama, furtki/brama, naprawa)
        // v0.191.0: bylo 3 podpowiedzi co 3.3 s — za duzo tekstu na starcie. Zostaje pierwsza.
        if (this.phase === 'intro' && this.hintIdx < 1 && now >= this.nextHintAt) {
            const keys = ['castle.hint1', 'castle.hint2', 'castle.hint3'] as const;
            this.opts.banner(t(keys[this.hintIdx]), '#e0b53c', 170);
            this.hintIdx++;
            this.nextHintAt = now + 3300;
        }
        // F6 (#3): brama otwiera sie, gdy gracz podjezdza i nie ma wrogow w poblizu
        this.updateGate(player);
        this.debris.update(delta);
        this.drawRepairMarkers(player, now);
        this.drawTacticalMarkers(now);
        // fazy
        if (this.phase === 'tutorial') {
            this.updateTutorial(player, now);
            if (this.tutStep >= 4 && !this.playerDead) this.proximityRepair(player, dtSec, now);
            if (this.tutStep === 3) this.contactDamage(now);
        } else if (this.phase === 'intro' || this.phase === 'build') {
            if (this.phase === 'build' && !this.playerDead) this.proximityRepair(player, dtSec, now);
            // P1: ostatnie 5 s budowy — tik na kazda sekunde (HUD rysuje duzy licznik)
            if (this.phase === 'build') {
                const sl = Math.ceil((this.phaseUntil - now) / 1000);
                if (sl <= 5 && sl !== this.lastBuildTick) { this.lastBuildTick = sl; if (sl > 0) this.opts.audio.playCrateTap(Math.max(0, 3 - sl)); } // pitch rosnie ku zeru
            }
            if (now >= this.phaseUntil) this.beginWave(this.wave + 1, now);
        } else if (this.phase === 'combat') {
            this.director.update(now);
            // mega boss zabity => natychmiastowe zwyciestwo (Flex: reszta wybucha)
            const mega = this.director.megaSpawned;
            if (mega && !mega.active) {
                const c = this.opts.session.castle;
                if (c) { c.megaKilled = true; c.wavesCleared = Math.max(c.wavesCleared, this.wave); }
                this.finishVictory();
            } else if (this.director.quotaDone && this.director.aliveCount() === 0) {
                this.onWaveCleared(now);
            }
        }

        // cele: re-ewaluacja co retargetMs (wylomy moga sie zmienic)
        if (this.objectivesDirty || now - this.lastRetargetAt >= T.retargetMs) {
            this.rebuildObjectives();
            this.lastRetargetAt = now;
        }

        // kontakt oblegajacych po dojezdzie
        if (this.phase === 'combat') this.contactDamage(now);
        // F4: maszyny (taran FSM, loby katapult/trebuchetow), glazy w locie, kille
        if (this.phase === 'combat') this.updateMachines(now);
        this.updateStones(delta, player, isInvulnerable);
        this.trackKills();

        const defeat = this.phase === 'defeat' && !this.defeatFired;
        const victory = this.phase === 'victory' && !this.victoryFired;
        if (defeat) this.defeatFired = true;
        if (victory) this.victoryFired = true;
        return { victory, defeat };
    }

    // ── WAVES ──────────────────────────────────────────────────────────────

    private beginWave(idx: number, now: number): void {
        if (idx > CASTLE_WAVES_TOTAL) { this.finishVictory(); return; }
        this.wave = idx;
        this.phase = 'combat';
        this.rebuildCap.clear();
        const c = this.opts.session.castle;
        if (c) c.wave = idx;
        this.director.startWave(idx, now);
        this.opts.banner(t('castle.waveStart', { n: String(idx), total: String(CASTLE_WAVES_TOTAL) }), '#ff5a5a', 110);
        this.opts.onWaveStart(idx);
    }

    private onWaveCleared(now: number): void {
        const c = this.opts.session.castle;
        const bonus = T.waveBonus[this.wave - 1] ?? 0;
        if (c) c.wavesCleared = this.wave;
        this.opts.session.addCastleStaticBonus(bonus, 'wave');
        this.opts.banner(t('castle.waveCleared', { n: String(this.wave) }), '#2ecc71', 110);
        this.opts.onWaveCleared(this.wave, bonus);
        if (this.wave >= CASTLE_WAVES_TOTAL) { this.finishVictory(); return; }
        this.phase = 'build';
        this.phaseUntil = now + T.buildPhaseMs;
        this.lastBuildTick = -1;
        // P1: start budowy musi byc SLYSZALNY i widoczny (zielony pierscien na graczu)
        this.opts.audio.playShockwave();
        this.opts.effects.spawnShockwaveRing(this.playerX, this.playerY, 160, 0x2ecc71);
        // v0.191.0: notif castle.buildPhase WYCIETY — pigulka fazy w HUD pokazuje ten sam
        // odliczany czas przez cala faze. Zostaje wylacznie baner o naprawie i TYLKO gdy jest
        // co naprawiac (wczesniej leecialy oba naraz, w tej samej klatce).
        if (this.opts.parts.some(p => p.destructible && p.hp < p.maxHp)) this.opts.banner(t('castle.repairHint'), '#2ecc71', 150);
        this.opts.onBuildPhase(Math.round(T.buildPhaseMs / 1000));
    }

    private finishVictory(): void {
        if (this.phase === 'victory' || this.phase === 'defeat') return;
        this.phase = 'victory';
        const c = this.opts.session.castle;
        if (c) {
            c.gateIntact = this.gates.every(g => !g.isDestroyed);
            let wallHp = 0, wallMax = 0;
            for (const w of this.walls) { wallHp += w.hp; wallMax += w.maxHp; }
            c.wallPctAtEnd = wallMax > 0 ? wallHp / wallMax : 1;
            c.keepPctAtEnd = this.keep.hpPct;
            this.opts.session.addCastleEndBonuses();
        }
        // Flex: reszta wrogow wybucha zlotem
        for (const e of this.opts.enemies) {
            if (!e.active || !e.castleRole) continue;
            this.opts.effects.spawnExplosionAndWreck(e.x, e.y, 0xe0b53c);
            e.active = false;
            // sprzatanie sprite'a jak przy killu taranem w main.ts (petla wrogow tylko splice'uje trupy)
            if (e.container.parent) e.container.parent.removeChild(e.container);
            e.container.destroy({ children: true });
        }
        this.opts.effects.shake(8, 20);
    }

    // ── OBJECTIVES + ROUTING ───────────────────────────────────────────────

    private rebuildObjectives(): void {
        this.objectivesDirty = false;
        const objs: Objective[] = [];
        const keepAttack = (side: CastleLaneId): RouteNode =>
            ({ ...(side === 'N' ? CASTLE_ATTACK.keepN : side === 'S' ? CASTLE_ATTACK.keepS : side === 'W' ? CASTLE_ATTACK.keepW : CASTLE_ATTACK.keepE), attack: true });
        // 4 BRAMY: cala -> atak bramy; zniszczona -> przez brame do donzonu (od tej strony)
        for (const g of this.gates) {
            const s = (g.side ?? 'S') as CastleLaneId;
            const atk = s === 'S' ? CASTLE_ATTACK.gateS : s === 'N' ? CASTLE_ATTACK.gateN : s === 'W' ? CASTLE_ATTACK.gateW : CASTLE_ATTACK.gateE;
            if (!g.isDestroyed) {
                objs.push({ id: `gate${s}`, side: s, part: g, tail: [{ ...atk, attack: true }] });
            } else {
                const cx = g.centerX, cy = g.centerY;
                const outer: RouteNode = s === 'N' ? { x: cx, y: cy - 60 } : s === 'S' ? { x: cx, y: cy + 60 } : s === 'W' ? { x: cx - 60, y: cy } : { x: cx + 60, y: cy };
                const inner: RouteNode = s === 'N' ? { x: cx, y: cy + 60 } : s === 'S' ? { x: cx, y: cy - 60 } : s === 'W' ? { x: cx + 60, y: cy } : { x: cx - 60, y: cy };
                objs.push({ id: `gateOpen${s}`, side: s, part: this.keep, tail: [outer, inner, keepAttack(s)] });
            }
        }
        // wylomy w murach: most strony -> punkt przed wylomem -> punkt za wylomem -> donzon
        for (const w of this.walls) {
            if (!w.isDestroyed || !w.side) continue;
            const s = w.side;
            const cx = w.centerX, cy = w.centerY;
            const outer: RouteNode = s === 'N' ? { x: cx, y: cy - 60 } : s === 'S' ? { x: cx, y: cy + 60 } : s === 'W' ? { x: cx - 60, y: cy } : { x: cx + 60, y: cy };
            const inner: RouteNode = s === 'N' ? { x: cx, y: cy + 60 } : s === 'S' ? { x: cx, y: cy - 60 } : s === 'W' ? { x: cx + 60, y: cy } : { x: cx - 60, y: cy };
            objs.push({ id: `breach:${w.id}`, side: s, part: this.keep, tail: [outer, inner, keepAttack(s)] });
        }
        const prevIds = this.objectives.map(o => o.id).join('|');
        this.objectives = objs;
        if (prevIds !== objs.map(o => o.id).join('|')) this.routeCache.clear();
    }

    private ringSteps(a: number, b: number): number {
        const d = Math.abs(a - b) % 8;
        return Math.min(d, 8 - d);
    }

    private ringPath(from: number, to: number): CastlePoint[] {
        const out: CastlePoint[] = [];
        if (from === to) return out;
        const cw = (to - from + 8) % 8, ccw = (from - to + 8) % 8;
        const dir = cw <= ccw ? 1 : -1;
        let i = from;
        while (i !== to) { i = (i + dir + 8) % 8; out.push(CASTLE_RING[i]); }
        return out;
    }

    /**
     * AI OBLEZENIA (decyzja Mariusza: wrogowie reaguja na taktyke gracza):
     *  score = dystans po pierscieniu (blizej lepiej) + HP celu (slabsza brama lepiej)
     *          + kara za GRACZA broniacego tej strony (flankowanie: ida tam, gdzie Cie nie ma)
     *          - premia za otwarty wylom (droga do donzonu).
     * Wrog trzyma sie decyzji przez objectiveCommitMs (zero drgania), potem przelicza —
     * gdy przeniesiesz sie pod inna brame, po kilku sekundach fala sie PRZEGRUPOWUJE.
     */
    private pickObjective(lane: CastleLaneId, enemy?: Enemy): Objective {
        const now = Date.now();
        if (enemy && enemy.castleObjId && now - enemy.castleObjAt < T.objectiveCommitMs) {
            const keep = this.objectives.find(o => o.id === enemy.castleObjId);
            if (keep) return keep;
        }
        let best = this.objectives[0];
        let bestScore = Infinity;
        for (const o of this.objectives) {
            const steps = this.ringSteps(RING_INDEX[lane], RING_INDEX[o.side]);
            const breach = o.id.startsWith('gateOpen') || o.id.startsWith('breach');
            const hp = breach ? 0 : o.part.hpPct;
            const ap = o.tail[o.tail.length - 1];
            const playerNear = (this.playerX - ap.x) ** 2 + (this.playerY - ap.y) ** 2 < T.defendedRadius ** 2;
            const score = steps * 1.0 + hp * 1.6 + (playerNear ? T.flankPenalty : 0) - (breach ? 3 : 0);
            if (score < bestScore) { best = o; bestScore = score; }
        }
        if (enemy) { enemy.castleObjId = best.id; enemy.castleObjAt = now; }
        return best;
    }

    private routeFor(lane: CastleLaneId, obj: Objective): RouteNode[] {
        const key = `${lane}>${obj.id}`;
        const hit = this.routeCache.get(key);
        if (hit) return hit;
        const laneDef = CASTLE_LANES.find(l => l.id === lane)!;
        const ringA = RING_INDEX[lane], ringB = RING_INDEX[obj.side];
        const nodes: RouteNode[] = [
            { x: laneDef.x, y: laneDef.y },
            CASTLE_RING[ringA],
            ...this.ringPath(ringA, ringB),
            CASTLE_BRIDGE_CENTERS[obj.side],
            ...obj.tail,
        ];
        this.routeCache.set(key, nodes);
        return nodes;
    }

    /** F4: katapulta/trebuchet zatrzymuja sie na WEZLE PIERSCIENIA strony celu (stanowisko ~240 px od muru). */
    private routeForMachine(lane: CastleLaneId, obj: Objective): RouteNode[] {
        const key = `M:${lane}>${obj.side}`;
        const hit = this.routeCache.get(key);
        if (hit) return hit;
        const laneDef = CASTLE_LANES.find(l => l.id === lane)!;
        // Stanowisko = 820 px od srodka na osi strony celu (poza fosa i pierscieniem — uwaga
        // Mariusza: maszyny dalej od zamku, NIE w wodzie). Z innej strony: lane -> pierscien
        // -> wyjazd na stanowisko tej strony.
        const ringA = RING_INDEX[lane], ringB = RING_INDEX[obj.side];
        const siege = CASTLE_SIEGE_POS[obj.side];
        const nodes: RouteNode[] = lane === obj.side
            ? [{ x: laneDef.x, y: laneDef.y }, { x: siege.x, y: siege.y, attack: true }]
            : [{ x: laneDef.x, y: laneDef.y }, CASTLE_RING[ringA], ...this.ringPath(ringA, ringB), { x: siege.x, y: siege.y, attack: true }];
        this.routeCache.set(key, nodes);
        return nodes;
    }

    /**
     * JEDYNY seam celowania (main.resolveEnemyTarget, PO nadpisaniach mocy).
     * Zwraca punkt trasy (zero alokacji: wezly sa stale, punkt ataku = scratch per wrog).
     */
    public targetFor(enemy: Enemy, player: Player, delta: number = 1): CastlePoint | null {
        const role = enemy.castleRole;
        if (!role) return null;
        if (role === 'raider' && !this.playerDead) { enemy.castleAim = null; return null; } // zwykle AI (goni gracza)
        if (this.objectives.length === 0) this.rebuildObjectives();
        const lane = enemy.castleLane ?? 'S';
        const obj = this.pickObjective(lane, enemy);
        const lobber = role === 'katapulta' || role === 'trebuchet';
        const route = lobber ? this.routeForMachine(lane, obj) : this.routeFor(lane, obj);
        const routeId = lobber ? `M:${obj.side}` : obj.id;
        if (enemy.castleRouteId !== routeId) {
            // nowy cel: snap do najblizszego wezla (nie cofaj na lane, jesli jestesmy dalej)
            enemy.castleRouteId = routeId;
            let bi = 0, bd = Infinity;
            for (let i = 0; i < route.length; i++) {
                const d = (route[i].x - enemy.x) ** 2 + (route[i].y - enemy.y) ** 2;
                if (d < bd) { bd = d; bi = i; }
            }
            enemy.castleNode = bi;
            enemy.castleArrived = false;
            enemy.castleTargetPart = null;
            if (enemy.castleJx === 0 && enemy.castleJy === 0) {
                const j = lobber ? 70 : 28;
                enemy.castleJx = worldRng.range(-j, j);
                enemy.castleJy = worldRng.range(-j * 0.5, j * 0.5);
            }
        }
        const now = Date.now();
        let node = route[Math.min(enemy.castleNode, route.length - 1)];
        const last = enemy.castleNode >= route.length - 1;
        // punkt ataku z jitterem per wrog (nie stoja w jednym pikselu)
        const tx = last ? node.x + enemy.castleJx : node.x;
        const ty = last ? node.y + enemy.castleJy : node.y;
        const dx = tx - enemy.x, dy = ty - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist < T.nodeReach) {
            if (!last) { enemy.castleNode++; node = route[enemy.castleNode]; }
            else if (!enemy.castleArrived) { enemy.castleArrived = true; enemy.castleTargetPart = obj.part; enemy.castleContactAt = 0; } // P1: pierwsze uderzenie OD RAZU (nie 3 s ciszy)
        }
        // anti-grind: brak ruchu > stuckMs => snap do nastepnego wezla
        // (liczone w KLATKACH, nie ms — hitch/throttle karty nie moze "przeskakiwac" wezlow)
        const moved = Math.hypot(enemy.x - enemy.castleLastX, enemy.y - enemy.castleLastY);
        if (moved > T.stuckMoveMin) { enemy.castleLastX = enemy.x; enemy.castleLastY = enemy.y; enemy.castleStuckFrames = 0; }
        else if (!enemy.castleArrived && (enemy.castleStuckFrames += delta) > T.stuckFrames) {
            enemy.castleStuckFrames = 0;
            if (!last) enemy.castleNode = Math.min(route.length - 1, enemy.castleNode + 1);
        }
        // AIM: dojechal -> cel = czesc; sieger z graczem blisko -> gracz; inaczej wprost (null)
        if (enemy.castleArrived && enemy.castleTargetPart) {
            enemy.castleAim = enemy.castleAimScratch;
            enemy.castleAimScratch.x = enemy.castleTargetPart.centerX;
            enemy.castleAimScratch.y = enemy.castleTargetPart.centerY;
        } else if (role === 'sieger' && !this.playerDead && (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2 < T.siegerAimPlayerRange ** 2) {
            enemy.castleAim = enemy.castleAimScratch;
            enemy.castleAimScratch.x = player.x;
            enemy.castleAimScratch.y = player.y;
        } else {
            enemy.castleAim = null;
        }
        const out = enemy.castleTargetScratch;
        out.x = last ? node.x + enemy.castleJx : node.x;
        out.y = last ? node.y + enemy.castleJy : node.y;
        // F4 taran w szarzy: cel ruchu = srodek czesci (jedzie prosto w mur)
        if (role === 'taran' && enemy.taranState === 'charge' && enemy.castleTargetPart) {
            out.x = enemy.castleTargetPart.centerX; out.y = enemy.castleTargetPart.centerY;
        }
        return out;
    }

    // ── DAMAGE ─────────────────────────────────────────────────────────────

    /** JEDYNY seam obrazen struktur. */
    public damagePart(part: CastlePart, dmg: number, hitX: number, hitY: number, src: CastleDamageSource): void {
        if (!part.destructible || part.isDestroyed) return;
        if (this.phase === 'victory' || this.phase === 'defeat') return;
        if (this.debugOnlyMachines && src !== 'taran' && src !== 'katapulta' && src !== 'debug') return;
        // pociski wroga niosa swoj dmg (100-200 vs gracz) — struktury dostaja stala z tuningu
        if (src === 'enemy_bullet') dmg = T.enemyBulletDmg;
        part.applyDamage(dmg);
        this.rebuildCap.delete(part);
        if (src !== 'enemy_bullet') this.opts.effects.spawnEnemyHitSparks(hitX, hitY, 0xc9ccd0);
        if (part.kind === 'keep' && part.hpPct < 0.33 && !this.keepCriticalWarned) {
            this.keepCriticalWarned = true;
            this.opts.banner(t('castle.keepCritical'), '#ff3366', 120);
            this.opts.effects.shake(6, 12);
            this.opts.audio.playYetiRoar();
            this.keepAlarmUntil = Date.now() + 1200;
        }
        if (part.isDestroyed) {
            this.objectivesDirty = true;
            this.destroyedAt.set(part, Date.now());
            if (part.kind === 'keep') {
                this.phase = 'defeat';
                this.opts.effects.spawnShockwaveRing(part.centerX, part.centerY, 260, 0xff3366);
                this.opts.effects.shake(20, 30);
                this.opts.audio.playExplosion();
                this.opts.onCastleDestroyed();
            }
        }
    }
    private keepCriticalWarned = false;

    private onTierChanged(part: CastlePart, from: number, to: number): void {
        if (to > from) {
            this.opts.effects.spawnWoodSplinters(part.centerX, part.centerY, 8);
            this.opts.audio.playHit('wall');
            if (to === 3) {
                this.opts.effects.spawnShockwaveRing(part.centerX, part.centerY, 140, 0xc9ccd0);
                this.opts.effects.shake(12, 16);
                this.opts.audio.playExplosion();
                this.opts.banner(part.kind === 'gate' ? t('castle.gateDestroyed') : t('castle.wallBreached'), '#ff5a5a', 110);
                if (part.kind === 'gate') this.debris.burstDoors(part.centerX, part.centerY + 6); // F6: wrota odlatuja
            }
        }
    }

    private contactDamage(now: number): void {
        for (const e of this.opts.enemies) {
            if (!e.active || !e.castleArrived || !e.castleTargetPart) continue;
            if (now < e.frozenUntil) continue; // P0.3: mroz = zero kontaktu
            const p = e.castleTargetPart;
            if (p.isDestroyed) { e.castleArrived = false; e.castleTargetPart = null; e.castleRouteId = ''; continue; }
            const cd = e.isBoss || e.isMegaBoss ? T.bossContactCooldownMs : T.contactCooldownMs;
            if (now - e.castleContactAt < cd) continue;
            // odleglosc srodka wroga od AABB czesci
            const nx = Math.max(p.x, Math.min(e.x, p.x + p.w));
            const ny = Math.max(p.y, Math.min(e.y, p.y + p.h));
            if (Math.hypot(nx - e.x, ny - e.y) > T.contactReach) continue;
            e.castleContactAt = now;
            const dmg = e.isBoss || e.isMegaBoss ? T.bossContactDmg : T.contactDmg;
            this.damagePart(p, dmg, nx, ny, 'contact');
            this.opts.effects.spawnFloatingText(nx, ny - 16, `-${Math.round(dmg / 100)}`, 0xff8c69);
        }
    }

    // ── REPAIR (faza budowy) ───────────────────────────────────────────────

    private nearestDamagedPart(x: number, y: number, range: number): CastlePart | null {
        let best: CastlePart | null = null, bd = range;
        for (const p of this.opts.parts) {
            if (!p.destructible || p.hp >= p.maxHp) continue;
            const nx = Math.max(p.x, Math.min(x, p.x + p.w));
            const ny = Math.max(p.y, Math.min(y, p.y + p.h));
            const d = Math.hypot(nx - x, ny - y);
            if (d < bd) { bd = d; best = p; }
        }
        return best;
    }

    private proximityRepair(player: Player, dtSec: number, now: number): void {
        if (player.isMoving) return;
        const part = this.nearestDamagedPart(player.x, player.y, T.repairRange);
        if (!part) return;
        // zniszczona czesc odbudowuje sie tylko do rebuildCapPct w tej fazie
        let cap = part.maxHp;
        if (part.isDestroyed) { cap = Math.round(part.maxHp * T.rebuildCapPct); this.rebuildCap.set(part, cap); }
        else if (this.rebuildCap.has(part)) cap = this.rebuildCap.get(part)!;
        if (part.hp >= cap) return;
        const heal = Math.min(cap - part.hp, part.maxHp * T.repairPctPerSec * dtSec);
        const added = part.repair(heal);
        if (added <= 0) return;
        const c = this.opts.session.castle;
        if (c) c.repairHp += added;
        if (now - this.lastRepairFxAt > 500) {
            this.lastRepairFxAt = now;
            const nx = Math.max(part.x, Math.min(player.x, part.x + part.w));
            const ny = Math.max(part.y, Math.min(player.y, part.y + part.h));
            this.opts.effects.spawnEnemyHitSparks(nx, ny, 0xe0b53c);
            this.opts.effects.spawnFloatingText(nx, ny - 18, `+${Math.max(1, Math.round((part.maxHp * T.repairPctPerSec * 0.5) / 100))} 🔨`, 0x2ecc71);
            this.opts.audio.playCrateTap(1); // P1: leczenie != dzwiek obrazen (metaliczny klik zamiast playHit)
            if (c && (c.repairHp - c.repairCounted) >= part.maxHp * 0.25) { c.repairCounted = c.repairHp; c.repairsDone++; }
        }
    }

    // ── F4: MASZYNY OBLEZNICZE ─────────────────────────────────────────────

    private static isMachine(role: CastleRole | null): boolean {
        return role === 'taran' || role === 'katapulta' || role === 'trebuchet';
    }

    /** Cel lobu: czesc celu wroga (brama / donzon) — srodek AABB + jitter. */
    private lobTargetFor(enemy: Enemy): { x: number; y: number; part: CastlePart } | null {
        const lane = enemy.castleLane ?? 'S';
        const obj = this.pickObjective(lane, enemy);
        const p = obj.part;
        return { x: p.centerX + worldRng.range(-p.w * 0.35, p.w * 0.35), y: p.centerY + worldRng.range(-p.h * 0.35, p.h * 0.35), part: p };
    }

    private updateMachines(now: number): void {
        for (const e of this.opts.enemies) {
            if (!e.active || !CastleSystem.isMachine(e.castleRole)) continue;
            if (now < e.frozenUntil) continue; // P0.3: zamrozona maszyna nie strzela i nie taranuje
            if (e.castleRole === 'taran') this.updateTaran(e, now);
            else this.updateLobber(e, now);
        }
    }

    /**
     * TARAN: travel (trasa jak sieger) -> po dojezdzie WINDUP 1.2 s (stoi, telegraf) ->
     * CHARGE x2.5 prosto w czesc -> IMPACT (400) -> RECOIL 3 s (stoi, x2 obrazen = Flex) -> windup...
     */
    private updateTaran(e: Enemy, now: number): void {
        const part = e.castleTargetPart;
        if (!e.castleArrived || !part || part.isDestroyed) {
            if (e.taranState !== 'travel') { e.taranState = 'travel'; e.castleSpeedMult = 1; e.damageTakenMult = 1; }
            return;
        }
        const nx = Math.max(part.x, Math.min(e.x, part.x + part.w));
        const ny = Math.max(part.y, Math.min(e.y, part.y + part.h));
        const dist = Math.hypot(nx - e.x, ny - e.y);
        switch (e.taranState) {
            case 'travel':
                e.taranState = 'windup'; e.taranStateAt = now; e.castleSpeedMult = 0; e.damageTakenMult = 1;
                this.opts.effects.spawnFloatingText(e.x, e.y - 40, '⚠', 0xf1c40f);
                this.opts.audio.playRocketLaunch(); // P1: telegraf szarzy slyszalny
                break;
            case 'windup':
                if (now - e.taranStateAt >= 1200) { e.taranState = 'charge'; e.taranStateAt = now; e.castleSpeedMult = 2.5; }
                break;
            case 'charge':
                if (dist <= 34 || now - e.taranStateAt > 2500) {
                    e.taranState = 'recoil'; e.taranStateAt = now; e.castleSpeedMult = 0; e.damageTakenMult = 2;
                    if (dist <= 60) {
                        this.damagePart(part, T.taranDmg, nx, ny, 'taran');
                        this.opts.effects.spawnShockwaveRing(nx, ny, 70, 0xc9ccd0);
                        this.opts.effects.shake(9, 12);
                        this.opts.audio.playHit('wall');
                        this.opts.effects.spawnFloatingText(nx, ny - 20, `-${Math.round(T.taranDmg / 100)} 🪵`, 0xff8c69);
                    }
                }
                break;
            case 'recoil':
                if (now - e.taranStateAt >= 3000) { e.taranState = 'windup'; e.taranStateAt = now; e.damageTakenMult = 1; this.opts.audio.playRocketLaunch(); }
                break;
        }
        // cel ruchu podczas szarzy = srodek czesci (targetFor zwraca punkt ataku — nadpisujemy scratch)
        if (e.taranState === 'charge') { e.castleTargetScratch.x = part.centerX; e.castleTargetScratch.y = part.centerY; }
    }

    /** KATAPULTA / TREBUCHET: na stanowisku (wezel pierscienia) lobuja glazy co interwal. */
    private updateLobber(e: Enemy, now: number): void {
        if (!e.castleArrived) return;
        e.castleSpeedMult = 0;
        const interval = e.shootInterval;
        if (e.lastLobAt === 0) e.lastLobAt = now - interval + 2500; // pierwszy lob po 2.5 s od zajecia stanowiska
        if (now - e.lastLobAt < interval) return;
        if (this.stones.length >= 12) return;
        e.lastLobAt = now;
        const tgt = this.lobTargetFor(e);
        if (!tgt) return;
        const trebuchet = e.castleRole === 'trebuchet';
        const count = trebuchet ? 3 + worldRng.int(3) : 1;
        const spread = trebuchet ? 140 : 0;
        const flight = trebuchet ? 120 : 84; // klatki (2.0 s / 1.4 s)
        for (let i = 0; i < count; i++) {
            const tx = tgt.x + (spread ? worldRng.range(-spread, spread) : 0);
            const ty = tgt.y + (spread ? worldRng.range(-spread * 0.6, spread * 0.6) : 0);
            this.stones.push(new CatapultStone(e.x, e.y, tx, ty, T.katapultaSplashR, flight, this.opts.worldContainer, i * 8));
        }
        this.opts.effects.spawnEnemyHitSparks(e.x, e.y, 0xc9b88a);
        this.opts.audio.playWallThunk();
        if (trebuchet) this.opts.hudNotif(t('castle.salvo'), '#f1c40f');
    }

    private updateStones(delta: number, player: Player, isInvulnerable: boolean): void {
        for (let i = this.stones.length - 1; i >= 0; i--) {
            const s = this.stones[i];
            const impact = s.update(delta);
            if (!s.active) { s.destroy(); this.stones.splice(i, 1); continue; }
            if (!impact) continue;
            // struktury w promieniu (odleglosc AABB)
            for (const p of this.opts.parts) {
                if (!p.destructible || p.isDestroyed) continue;
                const nx = Math.max(p.x, Math.min(impact.x, p.x + p.w));
                const ny = Math.max(p.y, Math.min(impact.y, p.y + p.h));
                if (Math.hypot(nx - impact.x, ny - impact.y) <= T.katapultaSplashR) {
                    this.damagePart(p, T.katapultaDmg, nx, ny, 'katapulta');
                    this.opts.effects.spawnFloatingText(nx, ny - 20, `-${Math.round(T.katapultaDmg / 100)} 🪨`, 0xff8c69);
                }
            }
            // gracz pod glazem
            const protectedNow = isInvulnerable || this.playerDead || this.isSpawnInvul() || this.isInSanctuary(player.x, player.y)
                || this.phase === 'victory' || this.phase === 'defeat'; // P0.4: po koncu meczu glazy nie rania
            if (Math.hypot(player.x - impact.x, player.y - impact.y) <= T.katapultaSplashR) {
                const died = player.takeDamage(T.katapultaPlayerDmg, protectedNow, SRC_CATAPULT);
                if (!protectedNow) {
                    this.opts.session.markDamageTaken();
                    this.opts.effects.spawnEnemyHitSparks(player.x, player.y, 0xff0000);
                    this.opts.audio.playHit('player');
                }
                if (died) this.onPlayerDied(player);
            }
            this.opts.effects.spawnShockwaveRing(impact.x, impact.y, T.katapultaSplashR, 0xc9ccd0);
            this.opts.effects.spawnWoodSplinters(impact.x, impact.y, 6);
            this.opts.effects.shake(7, 10);
            this.opts.audio.playExplosion();
        }
    }

    /** Kille maszyn/wrogow fali: wrog active -> !active. Bonus za trebuchet (Flex). */
    private trackKills(): void {
        const c = this.opts.session.castle;
        for (const e of this.tracked) {
            if (e.active) continue;
            this.tracked.delete(e);
            if (!c) continue;
            if (e.castleRole === 'taran') c.taranKills++;
            else if (e.castleRole === 'katapulta') c.katapultaKills++;
            else if (e.castleRole === 'trebuchet') {
                c.trebuchetKills++;
                this.opts.session.addCastleStaticBonus(T.trebuchetKillBonus, 'machine');
                this.opts.banner(t('castle.trebuchetDown', { n: String(T.trebuchetKillBonus) }), '#e0b53c', 100);
                this.opts.effects.spawnShockwaveRing(e.x, e.y, 120, 0xe0b53c);
                this.opts.audio.playRocketBoom();
            }
        }
    }

    /** F6 (#3): brama otwarta gdy gracz w 150 px od jej srodka i ZADEN wrog w 240 px. */
    private updateGate(player: Player): void {
        for (const g of this.gates) {
            if (g.isDestroyed) continue;
            const gx = g.centerX, gy = g.centerY;
            const dPlayer = (player.x - gx) ** 2 + (player.y - gy) ** 2;
            let open = !this.playerDead && dPlayer < 150 * 150;
            // P0.5 "WPUSC MNIE": blisko bramy (< 90 px) wystarczy, ze zaden wrog nie jest w 120 px —
            // inaczej obronca wypchniety za mur podczas fali nie wraca do srodka (240 px = zawsze ktos jest).
            const enemyRadius = dPlayer < 90 * 90 ? 120 : 240;
            if (open) for (const e of this.opts.enemies) { if (e.active && (e.x - gx) ** 2 + (e.y - gy) ** 2 < enemyRadius * enemyRadius) { open = false; break; } }
            // ANTY-ZAMUROWANIE (zgloszenie Mariusza): wrota NIGDY nie zamykaja sie na graczu —
            // dopoki czolg (r~30) nachodzi na AABB bramy, brama zostaje otwarta mimo wrogow.
            const PAD = 34;
            const inside = player.x > g.x - PAD && player.x < g.x + g.w + PAD && player.y > g.y - PAD && player.y < g.y + g.h + PAD;
            if (inside && !this.playerDead) open = true;
            if (open !== g.gateOpen) {
                // P1 (Sensoryka): wrota slychac i widac — tepe uderzenie + pyl
                this.opts.audio.playWallThunk();
                this.opts.effects.spawnEnemyHitSparks(gx, gy, 0xc9ccd0);
            }
            g.setGateOpen(open);
        }
    }

    /** F6 (#5): w fazie budowy — pulsujacy zloty obrys + ikona 🔨 nad KAZDA uszkodzona czescia, pasek postepu przy naprawianej. */
    private drawRepairMarkers(player: Player, now: number): void {
        const g = this.repairGfx;
        g.clear();
        if (this.phase !== 'build' && !(this.phase === 'tutorial' && this.tutStep >= 4)) return;
        const pulse = 0.55 + Math.sin(now / 220) * 0.35;
        const active = this.nearestDamagedPart(player.x, player.y, T.repairRange);
        // P1 (Czytelnosc): zasieg naprawy widoczny — okrag wokol gracza; w zasiegu a jedzie => "STOJ"
        if (!this.playerDead) {
            g.lineStyle(2, active ? 0x2ecc71 : 0xe0b53c, active ? 0.55 : 0.3);
            g.drawCircle(player.x, player.y, T.repairRange);
            g.lineStyle(0);
            if (active && player.isMoving && now - this.lastStopHintAt > 1500) {
                this.lastStopHintAt = now;
                this.opts.effects.spawnFloatingText(player.x, player.y - 46, t('castle.stopHint'), 0xe0b53c);
            }
        }
        for (const p of this.opts.parts) {
            if (!p.destructible || p.hp >= p.maxHp) continue;
            const isActive = p === active;
            g.lineStyle(isActive ? 4 : 3, isActive ? 0x2ecc71 : 0xe0b53c, isActive ? 0.95 : pulse);
            g.drawRoundedRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12, 8);
            g.lineStyle(0);
            // pasek HP czesci nad nia (zawsze w budowie — gracz widzi, co naprawiac)
            const bw = Math.max(60, Math.min(160, p.w)), bx = p.centerX - bw / 2, by = p.y - 22;
            g.beginFill(0x000000, 0.6); g.drawRoundedRect(bx - 2, by - 2, bw + 4, 10, 5); g.endFill();
            const col = p.hpPct > 0.5 ? 0x2ecc71 : p.hpPct > 0.25 ? 0xf1c40f : 0xff3b3b;
            g.beginFill(col, 0.95); g.drawRoundedRect(bx, by, Math.max(2, bw * p.hpPct), 6, 3); g.endFill();
            if (isActive && !player.isMoving) {
                // iskra postepu: obrys zielony + "lecace" +HP juz robi proximityRepair
                g.lineStyle(2, 0xffffff, 0.8); g.drawCircle(p.centerX, p.centerY, 10 + Math.sin(now / 90) * 3); g.lineStyle(0);
            }
        }
    }

    /** P1 (Czytelnosc): linia szarzy taranu (windup/charge) + pulsujacy czerwony pierscien na czesci,
     *  do ktorej commit ma >= 2 wrogow (gracz widzi CEL fali, nie tylko wrogow). */
    private drawTacticalMarkers(now: number): void {
        const g = this.machineGfx;
        if (this.phase !== 'combat' && !(this.phase === 'tutorial' && this.tutStep === 3)) {
            if (!this.machineGfxEmpty) { g.clear(); this.machineGfxEmpty = true; }
            return;
        }
        g.clear();
        this.machineGfxEmpty = true;
        const commits = new Map<string, number>();
        for (const e of this.opts.enemies) {
            if (!e.active || !e.castleRole) continue;
            if (e.castleObjId) commits.set(e.castleObjId, (commits.get(e.castleObjId) ?? 0) + 1);
            if (e.castleRole === 'taran' && e.castleTargetPart && (e.taranState === 'windup' || e.taranState === 'charge')) {
                const p = e.castleTargetPart;
                const a = e.taranState === 'charge' ? 0.9 : 0.35 + Math.abs(Math.sin(now / 90)) * 0.5;
                g.lineStyle(e.taranState === 'charge' ? 6 : 4, 0xff3b3b, a);
                g.moveTo(e.x, e.y); g.lineTo(p.centerX, p.centerY);
                g.lineStyle(0);
                this.machineGfxEmpty = false;
            }
        }
        const pulse = 0.45 + Math.abs(Math.sin(now / 160)) * 0.5;
        for (const o of this.objectives) {
            if ((commits.get(o.id) ?? 0) < 2 || o.part.isDestroyed) continue;
            const p = o.part;
            g.lineStyle(5, 0xff3b3b, pulse);
            g.drawRoundedRect(p.x - 10, p.y - 10, p.w + 20, p.h + 20, 10);
            g.lineStyle(0);
            this.machineGfxEmpty = false;
        }
    }

    private noteLane(lane: CastleLaneId): void {
        this.lastLaneAt = Date.now();
        if (!this.activeLanes.includes(lane)) this.activeLanes.push(lane);
        if (this.activeLanes.length > 4) this.activeLanes.shift();
    }

    /** Rola wroga (do HUD/ikon) — helper. */
    public static roleOf(enemy: Enemy): CastleRole | null { return enemy.castleRole; }

    public destroy(): void {
        for (const s of this.stones) s.destroy();
        this.stones = [];
        this.repairGfx.destroy();
        this.machineGfx.destroy();
        this.debris.destroy();
        this.tracked.clear();
        this.director.reset();
        this.routeCache.clear();
        for (const p of this.opts.parts) { p.onDamage = null; p.onTierChanged = null; }
    }
}

// keep unused-import guard for CASTLE_KEEP (uzywane przez atak donzonu w F4 katapult)

