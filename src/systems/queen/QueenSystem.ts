import * as PIXI from 'pixi.js';
import type { Player } from '../../entities/Player';
import type { Enemy } from '../../entities/Enemy';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import type { GameSession } from '../../services/GameSession';
import type { DifficultyModifiers } from '../../config/difficulty';
import type { ICollidable } from '../../types/MapType';
import { SRC_LAVA, SRC_GEYSER, SRC_DYNAMITE, SRC_TOWER, type DamageSource } from '../../types/DamageSource';
import { t } from '../../i18n/i18n';
import { worldRng } from '../Rng';
import { PrisonBrick, PRISON_BRICK_SIZE } from '../../entities/queen/PrisonBrick';
import { Queen } from '../../entities/queen/Queen';
import { bakeBuilder, bakeCraneOverlay } from '../../entities/queen/bakeBuilder';
import { DungeonGeyser } from '../../maps/dungeon/DungeonGeyser';
import { DungeonTower } from '../../maps/dungeon/DungeonTower';
import { KeyDoor } from '../../maps/dungeon/KeyDoor';
import { GoldenKey, KEY_COLOR } from '../../entities/queen/GoldenKey';
import {
    DUNGEON_FRONT, DUNGEON_WINGS, DUNGEON_QUEEN, DUNGEON_QUEEN_HEART_SPAWN, DUNGEON_LANES, DUNGEON_GEYSERS, DUNGEON_GEYSER_R, DUNGEON_TOWER,
    DUNGEON_KEY_SPOTS, DUNGEON_KEY_DOOR,
    isDungeonLavaPoint, type DungeonLaneId,
} from '../../maps/DungeonMap';
import { QUEEN_TUNING as T, queenPhaseFor, type QueenPhaseId } from './queenTuning';

/**
 * QueenSystem — rdzen scenariusza SAVE THE QUEEN (Q2-Q4). Wzorzec strukturalny: CastleSystem.
 *
 *  - ZEGAR: 150 s liczone z delta klatek (NIE Date.now — determinizm Z0.1), fazy
 *    SPOKOJ / OBLEZENIE / PANIKA z queenTuning (banery + kolor pigulki HUD).
 *  - WIEZIENIE (v4): front 10x14 cegiel + skrzydla N/S; cela w zelaznej klatce (kolizja
 *    DungeonBorder), jedyne wejscie = brama 2 rz zamknieta PODWOJNYM powiazanym Zwornikiem.
 *    System jest wlascicielem encji, wpycha ich collidery do buildings/solidBuildings.
 *  - WYGRANA: Zwornik rozbity I AABB czolgu ∩ AABB Krolowej (+pad) => 'rescued' =>
 *    flourish (Q2: skrot — shake + napis + fanfara; Q5 pelna sekwencja) => victory.
 *  - PRZEGRANA: zegar 0 => 'captured' (timeout) => defeat; smierc gracza => onPlayerDied
 *    => 'captured' (death) natychmiast (1 zycie — bez respawnu, CELOWO).
 *  - PASEK DROGI: 2 rzedy bramy (keyRows) przez caly front — ile z 20 slotow rozbitych.
 *  - Q4 BUDOWNICZY (targetFor + update): cel = pusty slot / najbardziej rozbita cegla frontu
 *    (preferencja: rzedy bramy = droga gracza); przy slocie kanal 1.8 s (rusztowanie + iskry
 *    mlotka = telegraf), potem slot wraca jako cegla 25% HP i "domurowuje" 8%/s. Zabity =>
 *    2 gemy + bonus. Freeze przerywa kanal. Zablokowany 6 s => zmiana celu.
 *  - Q4 DYNAMIT: 3 ukryte cegly frontu (worldRng, poza kol. bramy). Rozbicie sasiada (4-sasiedztwo)
 *    odkrywa i zapala lont 1.5 s (telegraf), potem WYBUCH: 3x3 cegiel (heavy — Zwornik tez),
 *    300 dmg wrogom r120, 100 dmg graczowi r80. Trafienie zapalonej cegly = natychmiastowy wybuch.
 *  - Q4 LAWA: kontakt = DoT co lavaTickMs (gracz I wrogowie; slow robi main.ts przez isLavaAt).
 *  - Q4 GEJZERY (PANIKA): co geyserEveryMs losowy went: telegraf 1.2 s -> erupcja 150 dmg r90.
 */

export interface QueenUpdateResult { victory: boolean; defeat: boolean }
export type QueenPhase = QueenPhaseId | 'rescued' | 'captured';
export type QueenEndReason = 'rescued' | 'timeout' | 'death';

export interface QueenHudInfo {
    phase: QueenPhase;
    remainingMs: number;
    pathBroken: number;
    pathTotal: number;
    /** Q4: Budowniczy cofa droge — pasek miga na brazowo */
    pathFlash: boolean;
    keystoneDown: boolean;
    queen: { x: number; y: number };
    activeLanes: { x: number; y: number }[];
    /** Q4.6: strzalka do klucza (po pierwszym dotknieciu zamknietych drzwi bez klucza) */
    keyArrow: { x: number; y: number } | null;
    hasKey: boolean;
}

export interface QueenSystemOpts {
    session: GameSession;
    worldContainer: PIXI.Container;
    effects: EffectsManager;
    audio: AudioSys;
    difficulty: DifficultyModifiers;
    /** tablice kolizji main.ts — system dopisuje swoje encje */
    buildings: ICollidable[];
    solidBuildings: ICollidable[];
    /** Q4: zywi wrogowie (lawa / gejzer / dynamit rania wrogow) */
    enemies: Enemy[];
    hudNotif: (text: string, cssColor: string) => void;
    banner: (text: string, cssColor: string, frames?: number) => void;
    /** gem z rozbitej cegly (main: spawnGem z poola) */
    onGemDrop: (x: number, y: number) => void;
    /** serce od Krolowej (main: new Heart) */
    onQueenHeart: (x: number, y: number) => void;
    /** Q4: obrazenia srodowiskowe — main ma kill-path (registerKill/score/drop); zwraca true gdy gracz zginal */
    hurtPlayer: (dmg: number, src: DamageSource) => boolean;
    hurtEnemy: (enemy: Enemy, dmg: number, src: DamageSource) => void;
    /** Q3: sekundy 10..1 — glos/tick */
    onCountdownTick?: (sec: number) => void;
    /** Q5: sciemnienie swiata 0..1 (PORWANA) — main: tint gruntu; brak overlayow ekranowych */
    onDim?: (k: number) => void;
    /** Q5: pochodnie — flara wszystkich (OCALONA) / zgaszenie i-tej (PORWANA) */
    onTorchFlareAll?: () => void;
    onTorchOut?: (i: number) => void;
    /** Q5: PANIKA — nietoperze zrywaja sie */
    onPanic?: () => void;
    /** Q6: szkolenie na zywej mapie (raz na urzadzenie; ?queentut=1 wymusza) */
    tutorial?: boolean;
    onTutorialDone?: () => void;
    /** Q6: krok 4 — main spawnuje Budowniczego przez dyrektora */
    spawnTutorialBuilder?: () => void;
}

interface BuilderState {
    target: PrisonBrick | null;
    /** Q4.6: punkt dojazdu = otwarta strona slotu (nie srodek cegly w glebi muru) */
    approachX: number; approachY: number;
    channelMs: number;
    stuckFrames: number;
    lastX: number; lastY: number;
    skip: PrisonBrick | null;
    scaffold: PIXI.Graphics | null;
    sparkT: number;
    rewarded: boolean;
}

interface LitDynamite { brick: PrisonBrick; fuseMs: number }

const COL_VIOLET = '#c850ff';
const COL_MAGENTA = '#ff5fb0';
const COL_SIEGE = '#ff9f1a';
const COL_PANIC = '#ff3b3b';
const COL_BUILDER = '#d9a441';
const COL_LAVA = '#ff7a1a';

export class QueenSystem {
    private readonly opts: QueenSystemOpts;
    private readonly bricks: PrisonBrick[] = [];
    private readonly queen: Queen;
    /** v3: PODWOJNY Zwornik bramy (powiazane — pekniecie jednego rozbija oba) */
    private readonly keystones: PrisonBrick[] = [];
    private keystoneBannerShown = false;
    private elapsedMs = 0;
    private phase: QueenPhase = 'calm';
    private phaseId: QueenPhaseId = 'calm';
    private endAt = -1;
    private endReason: QueenEndReason | null = null;
    private victoryFired = false;
    private defeatFired = false;
    private keystoneHintShown = false;
    private lastCountdownSec = -1;
    private nextHeartAt: number = T.queenHeartEveryMs;
    private introShown = false;
    private activeLanes: { x: number; y: number }[] = [];
    /** Q6: aura laski startowej / ochrony (widoczna, pulsujaca) */
    private readonly aura: PIXI.Graphics;
    /** Q4: kiedy Budowniczy ostatnio cofnal droge (pasek miga) */
    private pathFlashUntil = 0;
    // Q4 Budowniczy
    private readonly builders = new Map<Enemy, BuilderState>();
    private builderBannerShown = false;
    private lastRebuiltNotifAt = -1e9;
    private readonly targetScratch = { x: 0, y: 0 };
    // Q4 dynamit
    private readonly lit: LitDynamite[] = [];
    private dynamiteHintShown = false;
    /** wybuch trafia gracza w hazard-passie (explode() nie ma referencji gracza) */
    private pendingPlayerBlast: { x: number; y: number } | null = null;
    // Q4 lawa
    private lavaTickMs = 0;
    private playerLavaSparkMs = 0;
    private lavaHintShown = false;
    private playerDiedByHazard = false;
    // Q4.5 Zlowroga Wieza
    private readonly tower: DungeonTower;
    private towerBannerShown = false;
    // Q4 gejzery
    private readonly geysers: DungeonGeyser[] = [];
    private nextGeyserAt = -1;
    private geyserBannerShown = false;
    // Q4.6 klucz + drzwi
    private readonly key: GoldenKey;
    private readonly door: KeyDoor;
    private hasKey = false;
    private doorHintAt = -1e9;
    private doorTouched = false;
    // Q4.6 laska startowa (odliczanie 3-2-1)
    private lastReadySec = -1;
    // Q6 tutorial (0 = brak / zaliczony)
    private tutStep = 0;
    private tutStepMs = 0;
    private tutTunnel: PrisonBrick[] = [];
    private tutBuilderSpawned = false;
    // Q5 sekwencje konca
    private endFxT = 0;
    private torchesOut = 0;
    private endGfx: PIXI.Graphics | null = null;

    constructor(opts: QueenSystemOpts) {
        this.opts = opts;
        const hpMult = opts.difficulty.enemyHpMult;
        const F = DUNGEON_FRONT;
        const cb = {
            onBreak: (b: PrisonBrick, cx: number, cy: number) => this.onBrickBroken(b, cx, cy),
            onKeystoneClink: () => this.onKeystoneClink(),
        };
        // front 10x14 (v4; v3 = 10x10): kol keyCol = przy celi; brama = keyRows (2 Zworniki), barRows = prety klatki (bez cegly)
        const addBrick = (kind: 'brick' | 'keystone', r: number, c: number, x: number, y: number): PrisonBrick => {
            const seed = ((x * 31 + y * 17) % 997) + 1;
            const hp = Math.round((kind === 'keystone' ? T.keystoneHp : T.brickHp) * hpMult);
            const brick = new PrisonBrick(kind, r, c, x, y, seed, hp, opts.worldContainer, opts.effects, opts.audio, cb);
            this.bricks.push(brick);
            opts.solidBuildings.push(brick);
            for (const extra of brick.getExtraCollidables()) opts.buildings.push(extra);
            return brick;
        };
        for (let r = 0; r < F.rows; r++) for (let c = 0; c < F.cols; c++) {
            if (c === F.keyCol && F.barRows.includes(r)) continue;
            const isKey = c === F.keyCol && F.keyRows.includes(r);
            const brick = addBrick(isKey ? 'keystone' : 'brick', r, c, F.x0 + c * PRISON_BRICK_SIZE, F.y0 + r * PRISON_BRICK_SIZE);
            if (isKey) this.keystones.push(brick);
        }
        for (let i = 0; i < this.keystones.length; i++) this.keystones[i].linked = this.keystones[(i + 1) % this.keystones.length];
        // skrzydla N/S nad/pod cela (masa muru; row/col poza siatka frontu => -1)
        for (const wg of DUNGEON_WINGS) {
            for (let y = wg.y; y < wg.y + wg.h; y += PRISON_BRICK_SIZE) for (let x = wg.x; x < wg.x + wg.w; x += PRISON_BRICK_SIZE) addBrick('brick', -1, -1, x, y);
        }
        // Q5: kolumny dobudowy (col -1, -2) — puste sloty PRZED frontem; Budowniczowie zapelniaja je, gdy front caly
        for (let a = 1; a <= T.annexCols; a++) for (let r = 0; r < F.rows; r++) addBrick('brick', r, -a, F.x0 - a * PRISON_BRICK_SIZE, F.y0 + r * PRISON_BRICK_SIZE).vacate();
        // Q4: dynamit — losowe cegly frontu poza kolumna bramy (worldRng => ?seed=N reprodukuje)
        const pool = this.bricks.filter(b => b.row >= 0 && b.col >= 0 && b.kind === 'brick' && b.col < F.keyCol);
        for (let i = 0; i < T.dynamiteCount && pool.length > 0; i++) {
            const idx = worldRng.int(pool.length);
            pool.splice(idx, 1)[0].dynamite = 'hidden';
        }
        // Q4: gejzery na wentach (aktywne tylko w PANICE)
        for (const gz of DUNGEON_GEYSERS) this.geysers.push(new DungeonGeyser(gz.x, gz.y, DUNGEON_GEYSER_R, T.geyserTelegraphMs, opts.worldContainer));
        // Q4.5: Zlowroga Wieza w centrum kolumnady — solid + cel pociskow gracza (duck-typed takeDamage)
        const tw = DUNGEON_TOWER;
        this.tower = new DungeonTower(tw.x, tw.y, tw.w, tw.h, opts.worldContainer, opts.effects, opts.audio, {
            hp: Math.round(T.towerHp * hpMult), fireMs: T.towerFireMs, telegraphMs: T.towerTelegraphMs, range: T.towerRange,
            orbSpeed: T.towerOrbSpeed, orbDmg: Math.round(T.towerOrbDmg * opts.difficulty.enemyDmgMult), orbR: T.towerOrbR,
            onDestroyed: (cx, cy) => {
                this.opts.session.addQueenStaticBonus(T.towerScore, 'blast');
                this.opts.banner(t('queen.towerDown'), '#39ff6a', 140);
                this.opts.effects.spawnFloatingText(cx, cy - 100, t('queen.towerDown'), 0x39ff6a);
            },
            onPlayerHit: (dmg) => { if (this.opts.hurtPlayer(dmg, SRC_TOWER)) this.playerDiedByHazard = true; },
        });
        opts.buildings.push(this.tower);
        opts.solidBuildings.push(this.tower);
        // Q4.6: Zloty Klucz w losowym "samotnym" miejscu + stalowe drzwi celi (za Zwornikami)
        const ks = DUNGEON_KEY_SPOTS[worldRng.int(DUNGEON_KEY_SPOTS.length)];
        this.key = new GoldenKey(ks.x, ks.y, opts.worldContainer);
        const kd = DUNGEON_KEY_DOOR;
        this.door = new KeyDoor(kd.x, kd.y, kd.w, kd.h, opts.worldContainer);
        opts.buildings.push(this.door);
        opts.solidBuildings.push(this.door);
        this.queen = new Queen(DUNGEON_QUEEN.x, DUNGEON_QUEEN.y, opts.worldContainer);
        this.aura = new PIXI.Graphics();
        this.aura.zIndex = 12000;
        opts.worldContainer.addChild(this.aura);
        if (opts.session.queen) opts.session.queen.pathTotal = T.pathSlots;
        if (opts.tutorial) {
            this.tutStep = 1;
            this.introShown = true; // intro po szkoleniu
            opts.banner(t('queen.tut.title'), '#ffd54a', 150);
            opts.hudNotif(t('queen.tut.step1'), '#ffd54a');
        }
    }

    // ── Q6 TUTORIAL (5 krokow na zywej mapie; zegar stoi, dyrektor spi, gracz chroniony) ──

    public get inTutorial(): boolean { return this.tutStep > 0; }

    private tutAdvance(next: number, player: Player): void {
        this.tutStep = next; this.tutStepMs = 0;
        const key = next === 2 ? 'queen.tut.step2' : next === 3 ? 'queen.tut.step3' : next === 4 ? 'queen.tut.step4' : 'queen.tut.step5';
        this.opts.banner(t(key), '#ffd54a', 170);
        this.opts.hudNotif(t(key), '#ffd54a');
        this.opts.audio.playMenuClick();
        if (next === 2) {
            // tunel do Zwornika (rzedy bramy, kol 0-8) — cicho (vacate), zeby Zwornik byl w zasiegu; pelna bateria supera
            const F = DUNGEON_FRONT;
            this.tutTunnel = this.bricks.filter(b => b.row >= 0 && b.col >= 0 && b.col < F.keyCol && F.keyRows.includes(b.row) && !b.isDestroyed);
            for (const b of this.tutTunnel) b.vacate();
            player.addSuperCharge(9);
            this.opts.effects.spawnShockwaveRing(F.x0 + 4 * PRISON_BRICK_SIZE, F.y0 + (F.keyRows[0] + 1) * PRISON_BRICK_SIZE, 120, 0xd97a5a);
        }
        if (next === 3) this.doorTouched = true; // strzalka HUD do klucza od razu
        if (next === 4 && !this.tutBuilderSpawned) { this.tutBuilderSpawned = true; this.opts.spawnTutorialBuilder?.(); }
    }

    private tutFinish(): void {
        // przywroc mur (tunel + Zworniki), drzwi, klucz, liczniki — i start prawdziwego meczu
        for (const b of this.tutTunnel) b.rebuild(1);
        for (const k of this.keystones) if (k.isDestroyed) k.rebuild(1);
        this.tutTunnel = [];
        this.keystoneBannerShown = false; this.keystoneHintShown = false;
        this.hasKey = false; this.doorTouched = false; this.key.reset(); this.door.reset();
        for (const [e, st] of this.builders) { if (e.active) { e.active = false; if (e.container.parent) e.container.parent.removeChild(e.container); } st.scaffold?.destroy(); }
        this.builders.clear();
        const q = this.opts.session.queen; if (q) { q.bricks = 0; q.builders = 0; q.blasts = 0; q.pathBroken = 0; }
        this.tutStep = 0; this.elapsedMs = 0; this.introShown = false; this.lastReadySec = -1;
        this.opts.banner(t('queen.tut.done'), '#2ecc71', 170);
        this.opts.audio.playVictory();
        this.opts.onTutorialDone?.();
    }

    private updateTutorial(dtMs: number, delta: number, player: Player): void {
        this.tutStepMs += dtMs;
        for (const b of this.bricks) b.update(delta);
        this.queen.update(delta);
        this.key.update(delta);
        if (this.hasKey && !this.door.isOpen) this.key.follow(player.x, player.y);
        this.door.tick(delta);
        this.drawAura(player);
        this.tower.tick(dtMs, -1e6, -1e6, this.opts.solidBuildings); // wieza spi w szkoleniu
        const q = this.opts.session.queen;
        switch (this.tutStep) {
            case 1: if ((q?.bricks ?? 0) >= 1) this.tutAdvance(2, player); break;
            case 2:
                if (this.isKeystoneDown()) this.tutAdvance(3, player);
                else if (this.tutStepMs > 6000 && Math.floor(this.tutStepMs / 6000) !== Math.floor((this.tutStepMs - dtMs) / 6000)) player.addSuperCharge(9); // doladowanie co 6 s
                break;
            case 3: this.updateKeyAndDoor(player); if (this.hasKey) this.tutAdvance(4, player); break;
            case 4: {
                this.updateBuilders(delta, dtMs);
                if (this.hasKey) this.key.follow(player.x, player.y);
                if (this.tutStepMs > 1500 && this.builderCount === 0) this.tutAdvance(5, player);
                break;
            }
            case 5: this.updateKeyAndDoor(player); if (this.door.isOpen) this.tutFinish(); break;
        }
    }

    // ── PUBLIC API ─────────────────────────────────────────────────────────

    public get currentPhase(): QueenPhase { return this.phase; }
    public get remainingMs(): number { return Math.max(0, T.matchMs - this.elapsedMs); }
    public get remainingSec(): number { return Math.ceil(this.remainingMs / 1000); }
    public isKeystoneDown(): boolean { return this.keystones.every(k => k.isDestroyed); }
    public isSpawnInvul(): boolean { return this.elapsedMs < T.spawnInvulMs; }
    /** Q6: gracz nietykalny w lasce startowej I w flourishu OCALONA (bug: wrogowie dostrzeliwali gracza po ratunku => "PORWANA"). */
    public isPlayerProtected(): boolean { return this.isSpawnInvul() || this.phase === 'rescued' || this.tutStep > 0; }
    /** Q3: dyrektor spawnu pyta o faze */
    public get phaseDef() { return queenPhaseFor(this.remainingMs); }
    /** Q4: lawa (basen minus mosty) — main.ts: slow 0.5 dla gracza i wrogow */
    public isLavaAt(x: number, y: number): boolean { return isDungeonLavaPoint(x, y); }
    public get builderCount(): number { let n = 0; for (const [e] of this.builders) if (e.active) n++; return n; }
    public get keyPos(): { x: number; y: number } { return { x: this.key.x, y: this.key.y }; }
    public get playerHasKey(): boolean { return this.hasKey; }

    /** 1 zycie: smierc = PORWANA natychmiast (main.ts wola triggerGameOver po tym). */
    public onPlayerDied(): void {
        if (this.phase === 'rescued' || this.phase === 'captured') return;
        this.endReason = 'death';
        this.phase = 'captured';
        const q = this.opts.session.queen;
        if (q) { q.result = 'death'; q.remainingSecAtEnd = this.remainingSec; }
        this.opts.audio.playYetiRoar();
        this.opts.banner(t('queen.captured'), COL_PANIC, 140);
    }

    /** Q4: dyrektor melduje Budowniczego — rola, art, brak strzalu, stan AI. */
    public registerBuilder(enemy: Enemy): void {
        enemy.queenRole = 'builder';
        enemy.castleNoShoot = true;
        if (enemy.useBakedArchetype('builder')) enemy.attachAccessory(bakeCraneOverlay(), 0.62); // Q6: 2.5D + DZWIG obracany z kadlubem
        else enemy.useCustomSprite(bakeBuilder(), 1.0); // flat = fallback
        this.builders.set(enemy, { target: null, approachX: 0, approachY: 0, channelMs: 0, stuckFrames: 0, lastX: enemy.x, lastY: enemy.y, skip: null, scaffold: null, sparkT: 0, rewarded: false });
        if (!this.builderBannerShown) {
            this.builderBannerShown = true;
            this.opts.banner(t('queen.builder'), COL_BUILDER, 140);
            this.opts.hudNotif(t('queen.builder'), COL_BUILDER);
        }
    }

    /**
     * Q4: cel RUCHU Budowniczego (main.resolveEnemyTarget). Null = nie Budowniczy (AI KTB).
     * Zero alokacji per klatke (scratch). Brak celu => punkt przed brama (czeka na robote).
     */
    public targetFor(enemy: Enemy): { x: number; y: number } | null {
        const st = this.builders.get(enemy);
        if (!st) return null;
        if (st.target && (!this.isBuildable(st.target) || !this.openSide(st.target, st))) st.target = null;
        if (!st.target) st.target = this.pickBuildTarget(enemy, st);
        const F = DUNGEON_FRONT;
        if (!st.target) {
            this.targetScratch.x = F.x0 - 160;
            this.targetScratch.y = F.y0 + (F.keyRows[0] + 1) * PRISON_BRICK_SIZE;
            return this.targetScratch;
        }
        this.targetScratch.x = st.approachX;
        this.targetScratch.y = st.approachY;
        return this.targetScratch;
    }

    public getHudInfo(): QueenHudInfo {
        return {
            phase: this.phase,
            remainingMs: this.remainingMs,
            pathBroken: this.pathBroken(),
            pathTotal: T.pathSlots,
            pathFlash: this.elapsedMs < this.pathFlashUntil,
            keystoneDown: this.isKeystoneDown(),
            queen: { x: this.queen.x, y: this.queen.y },
            activeLanes: this.activeLanes,
            keyArrow: !this.hasKey && this.doorTouched && !this.key.taken ? { x: this.key.x, y: this.key.y } : null,
            hasKey: this.hasKey,
        };
    }

    public update(delta: number, player: Player, isInvulnerable: boolean): QueenUpdateResult {
        const dtMs = (delta / 60) * 1000;
        if (this.tutStep > 0) { this.updateTutorial(dtMs, delta, player); return { victory: false, defeat: false }; }
        for (const b of this.bricks) b.update(delta);
        this.queen.update(delta);
        for (const g of this.geysers) if (g.state !== 'idle') { if (g.update(dtMs)) this.erupt(g, player); }
        // Q4.5 wieza: strzela tylko w trwajacym meczu (po koncu — tylko dogasanie kul)
        const running = this.phase !== 'rescued' && this.phase !== 'captured';
        this.tower.tick(dtMs, running ? player.x : -1e6, running ? player.y : -1e6, this.opts.solidBuildings);
        if (running && !this.towerBannerShown && this.elapsedMs > 1500) { this.towerBannerShown = true; this.opts.hudNotif(t('queen.tower'), '#39ff6a'); }

        this.key.update(delta);
        if (this.hasKey && !this.door.isOpen) this.key.follow(player.x, player.y); // Q6: klucz leci nad czolgiem
        this.door.tick(delta);
        this.drawAura(player);

        if (this.phase === 'rescued' || this.phase === 'captured') {
            this.elapsedMs += dtMs;
            this.updateEndSequence(dtMs);
            const done = this.elapsedMs >= this.endAt;
            const victory = done && this.phase === 'rescued' && !this.victoryFired;
            const defeat = done && this.phase === 'captured' && !this.defeatFired;
            if (victory) this.victoryFired = true;
            if (defeat) this.defeatFired = true;
            return { victory, defeat };
        }

        this.elapsedMs += dtMs;
        // laska startowa: blink nietykalnosci (T12: wyrazny)
        if (this.elapsedMs < T.spawnInvulMs) player.container.alpha = 0.45 + 0.55 * Math.abs(Math.sin(this.elapsedMs / 90));
        else if (player.container.alpha !== 1 && !isInvulnerable) player.container.alpha = 1;

        if (!this.introShown) {
            this.introShown = true;
            this.opts.banner(t('queen.intro'), COL_MAGENTA, 170);
        }
        // Q4.6 laska startowa: GOTUJ SIE 3-2-1 -> RATUJ! (szpaler zamrozony w dyrektorze)
        if (this.elapsedMs < T.spawnInvulMs) {
            const rs = Math.ceil((T.spawnInvulMs - this.elapsedMs) / 1000);
            if (rs !== this.lastReadySec) { this.lastReadySec = rs; this.opts.hudNotif(`${t('queen.ready')} ${rs}`, COL_MAGENTA); this.opts.audio.playCrateTap(1); }
        } else if (this.lastReadySec !== 0) { this.lastReadySec = 0; this.opts.banner(t('queen.go'), COL_MAGENTA, 80); this.opts.audio.playShockwave(); }

        // fazy z zegara
        const pd = queenPhaseFor(this.remainingMs);
        if (pd.id !== this.phaseId) {
            this.phaseId = pd.id; this.phase = pd.id;
            if (pd.id === 'siege') { this.opts.banner(t('queen.phase.siege'), COL_SIEGE, 130); this.opts.audio.playShockwave(); }
            else if (pd.id === 'panic') {
                this.opts.banner(t('queen.phase.panic'), COL_PANIC, 130); this.opts.audio.playYetiRoar(); this.opts.effects.shake(6, 18);
                this.nextGeyserAt = this.elapsedMs + 1500;
                this.opts.onPanic?.();
            }
        }
        // odliczanie 10..1
        const sec = this.remainingSec;
        if (sec <= 10 && sec !== this.lastCountdownSec && sec > 0) {
            this.lastCountdownSec = sec;
            this.opts.audio.playCrateTap(Math.min(3, Math.max(0, 10 - sec) >> 1));
            this.opts.onCountdownTick?.(sec);
        }
        // serce od Krolowej co 30 s
        if (this.elapsedMs >= this.nextHeartAt) {
            this.nextHeartAt = this.elapsedMs + T.queenHeartEveryMs; // od TERAZ (skok zegara nie nadgania serc)
            this.queen.wave(400);
            this.opts.onQueenHeart(DUNGEON_QUEEN_HEART_SPAWN.x, DUNGEON_QUEEN_HEART_SPAWN.y);
            this.opts.effects.spawnEnemyHitSparks(this.queen.x, this.queen.y - 20, 0xff5fb0);
            this.opts.hudNotif(t('queen.heart'), COL_MAGENTA);
        }

        // Q4: Budowniczowie, dynamit, lawa, gejzery
        this.updateBuilders(delta, dtMs);
        this.updateDynamite(dtMs);
        this.updateHazards(dtMs, player, isInvulnerable);
        if (pd.id === 'panic') this.updateGeysers();
        if (this.playerDiedByHazard) { this.playerDiedByHazard = false; this.onPlayerDied(); this.defeatFired = true; return { victory: false, defeat: true }; }

        // Q4.6: klucz (pickup) + drzwi (otwarcie kluczem / hint bez klucza)
        this.updateKeyAndDoor(player);
        // wygrana: Zwornik + drzwi otwarte + dotkniecie
        if (this.isKeystoneDown() && this.door.isOpen && this.touchesQueen(player)) { this.finishRescue(); return { victory: false, defeat: false }; }
        // przegrana: zegar
        if (this.remainingMs <= 0) { this.finishCaptured('timeout'); return { victory: false, defeat: false }; }
        return { victory: false, defeat: false };
    }

    public destroy(): void {
        for (const b of this.bricks) b.destroy();
        for (const [, st] of this.builders) st.scaffold?.destroy();
        this.builders.clear();
        this.endGfx?.destroy();
        for (const g of this.geysers) g.destroy();
        this.tower.destroy();
        this.aura.destroy();
        this.key.destroy();
        this.door.destroy();
        this.queen.destroy();
    }

    // ── Q4 BUDOWNICZY ──────────────────────────────────────────────────────

    private isBuildable(b: PrisonBrick): boolean {
        return b.row >= 0 && b.kind === 'brick' && (b.isDestroyed || b.hpPct < 1);
    }

    /**
     * Q4.6: otwarta strona slotu = skad Budowniczy moze dojechac (sasiad rozbity, albo krawedz
     * frontu W/N/S). Ustawia st.approachX/Y (punkt PRZED slotem, nie w glebi muru — koniec
     * "slizgania sie" po licu). Null = slot niedostepny (otoczony cegłami) => inny cel.
     */
    private openSide(b: PrisonBrick, st: BuilderState): boolean {
        const F = DUNGEON_FRONT, S = PRISON_BRICK_SIZE;
        const at = (r: number, c: number): PrisonBrick | undefined => this.bricks.find(o => o.row === r && o.col === c);
        const free = (r: number, c: number): boolean => { const o = at(r, c); return !o || o.isDestroyed; };
        const cands: { x: number; y: number }[] = [];
        const westEdge = b.col === -T.annexCols; // najbardziej zachodnia kolumna (dobudowa) — otwarta z pola gry
        if (westEdge || free(b.row, b.col - 1)) cands.push({ x: b.centerX - (westEdge ? 74 : S), y: b.centerY });
        if (b.row === 0 || free(b.row - 1, b.col)) cands.push({ x: b.centerX, y: b.centerY - (b.row === 0 ? 74 : S) });
        if (b.row === F.rows - 1 || free(b.row + 1, b.col)) cands.push({ x: b.centerX, y: b.centerY + (b.row === F.rows - 1 ? 74 : S) });
        if (b.col < F.keyCol - 1 && free(b.row, b.col + 1)) cands.push({ x: b.centerX + S, y: b.centerY });
        if (!cands.length) return false;
        // najblizszy punkt dojazdu wzgledem aktualnej pozycji (approach juz ustawiony => trzymaj, chyba ze zniknal)
        let best = cands[0], bd = Infinity;
        for (const c of cands) { const d = (c.x - st.lastX) ** 2 + (c.y - st.lastY) ** 2; if (d < bd) { bd = d; best = c; } }
        st.approachX = best.x; st.approachY = best.y;
        return true;
    }

    /**
     * Q4.5 (decyzja Mariusza): Budowniczy buduje tam, gdzie mur jest NAJCIENSZY — rzad frontu
     * z najmniejsza suma HP cegiel (pusty slot = 0). W tym rzedzie: puste sloty najpierw, potem
     * najbardziej rozbite; tie-break = dystans. Rzedy bramy licza sie jako ciensze o 1 cegle
     * (droga gracza). Kara za slot juz zajety przez innego Budowniczego (nie tlocza sie).
     */
    private pickBuildTarget(enemy: Enemy, st: BuilderState): PrisonBrick | null {
        const skip = st.skip;
        const F = DUNGEON_FRONT;
        const rowHp = new Array<number>(F.rows).fill(0);
        for (const b of this.bricks) if (b.row >= 0 && b.col >= 0 && b.kind === 'brick') rowHp[b.row] += b.hpPct;
        for (const r of F.keyRows) rowHp[r] -= 1;
        const order = rowHp.map((hp, r) => ({ hp, r })).sort((a, b) => a.hp - b.hp);
        const taken = new Set<PrisonBrick>();
        for (const [, st] of this.builders) if (st.target) taken.add(st.target);
        for (const { r } of order) {
            let best: PrisonBrick | null = null;
            let bestScore = Infinity;
            for (const b of this.bricks) {
                if (b.row !== r || b === skip || !this.isBuildable(b) || b.dynamite === 'lit') continue;
                if (!this.openSide(b, st)) continue; // Q4.6: tylko sloty, do ktorych da sie dojechac
                let score = Math.hypot(b.centerX - enemy.x, b.centerY - enemy.y);
                if (b.isDestroyed) score -= 400; else score -= (1 - b.hpPct) * 200;
                if (taken.has(b)) score += 600;
                if (b.col < 0) score += 1500 - b.col * 400; // Q5: dobudowa dopiero gdy front caly (col -1 przed col -2)
                if (score < bestScore) { bestScore = score; best = b; }
            }
            if (best) { this.openSide(best, st); return best; }
        }
        return null;
    }

    // ── Q6 AURA LASKI (5 s start / flourish OCALONA) ───────────────────────

    private drawAura(player: Player): void {
        const g = this.aura;
        if (!this.isPlayerProtected()) { if (g.visible) { g.visible = false; g.clear(); } return; }
        g.visible = true; g.clear();
        const t = this.elapsedMs / 1000;
        const left = this.phase === 'rescued' ? 1 : Math.max(0, (T.spawnInvulMs - this.elapsedMs) / T.spawnInvulMs);
        const pulse = 0.5 + 0.5 * Math.sin(t * 9);
        const col = this.phase === 'rescued' ? 0xff5fb0 : 0xc850ff;
        g.beginFill(col, 0.10 + 0.08 * pulse); g.drawCircle(player.x, player.y, 58 + 6 * pulse); g.endFill();
        g.lineStyle(4, col, 0.85); g.drawCircle(player.x, player.y, 52 + 4 * pulse);
        g.lineStyle(2, 0xffffff, 0.5); g.drawCircle(player.x, player.y, 44 - 3 * pulse);
        g.lineStyle(0);
        // pasek czasu laski wokolo (luk maleje) — Czytelnosc: widzisz, ile ochrony zostalo
        if (this.phase !== 'rescued') { g.lineStyle(6, 0xffffff, 0.9); g.arc(player.x, player.y, 64, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); g.lineStyle(0); }
        // 6 iskierek krazacych
        g.beginFill(0xffffff, 0.9);
        for (let i = 0; i < 6; i++) { const a = t * 3 + i * 1.047; g.drawCircle(player.x + Math.cos(a) * 60, player.y + Math.sin(a) * 60, 2.5); }
        g.endFill();
    }

    // ── Q4.6 KLUCZ + DRZWI ─────────────────────────────────────────────────

    private updateKeyAndDoor(player: Player): void {
        if (!this.hasKey && !this.key.taken) {
            if ((player.x - this.key.x) ** 2 + (player.y - this.key.y) ** 2 <= T.keyPickupR * T.keyPickupR) {
                this.key.take(); this.hasKey = true;
                this.opts.effects.spawnShockwaveRing(this.key.x, this.key.y, 120, KEY_COLOR);
                this.opts.effects.spawnEnemyHitSparks(this.key.x, this.key.y, KEY_COLOR);
                this.opts.effects.spawnFloatingText(this.key.x, this.key.y - 50, '🔑', KEY_COLOR);
                this.opts.banner(t('queen.key.found'), '#ffd54a', 150);
                this.opts.hudNotif(t('queen.key.hud'), '#ffd54a');
                this.opts.audio.playVictory();
                this.queen.wave(600);
            }
        }
        if (this.door.isOpen) return;
        if (!this.door.touches(player.x, player.y, 25, T.doorTouchPad)) return;
        if (this.hasKey) {
            this.door.open();
            this.key.consume();
            this.opts.effects.spawnShockwaveRing(DUNGEON_KEY_DOOR.x, DUNGEON_KEY_DOOR.y + DUNGEON_KEY_DOOR.h / 2, 140, KEY_COLOR);
            this.opts.effects.spawnWoodSplinters(DUNGEON_KEY_DOOR.x, DUNGEON_KEY_DOOR.y + DUNGEON_KEY_DOOR.h / 2, 10);
            this.opts.banner(t('queen.door.open'), '#ffd54a', 130);
            this.opts.audio.playCrateBreak();
            this.queen.wave(1200);
        } else {
            this.doorTouched = true;
            if (this.elapsedMs - this.doorHintAt >= T.keyHintEveryMs) {
                this.doorHintAt = this.elapsedMs;
                this.opts.banner(t('queen.key.need'), '#ffd54a', 120);
                this.opts.hudNotif(t('queen.key.need'), '#ffd54a');
                this.opts.audio.playWallThunk();
            }
        }
    }

    // ── Q5 SEKWENCJE KONCA (OCALONA / PORWANA) ─────────────────────────────

    private updateEndSequence(dtMs: number): void {
        this.endFxT += dtMs;
        if (this.phase === 'rescued') {
            // konfetti serc + pierscienie co 300 ms, Krolowa macha, pochodnie plona jasniej
            if (Math.floor(this.endFxT / 300) !== Math.floor((this.endFxT - dtMs) / 300)) {
                const a = this.endFxT * 0.01;
                this.opts.effects.spawnGrannyHearts(this.queen.x + Math.cos(a) * 60, this.queen.y - 40 + Math.sin(a) * 30);
                this.opts.effects.spawnShockwaveRing(this.queen.x, this.queen.y, 90 + (this.endFxT / 300) * 25, (this.endFxT / 300) % 2 ? 0xff5fb0 : 0xc850ff);
            }
        } else {
            // PORWANA: swiat ciemnieje (tint gruntu), pochodnie gasna po jednej od W ku E
            const k = Math.min(1, this.endFxT / T.capturedSeqMs);
            this.opts.onDim?.(k * 0.75);
            const shouldOut = Math.floor(k * 16);
            while (this.torchesOut < shouldOut) { this.opts.onTorchOut?.(this.torchesOut++); }
            // sylwetki porywaczy: 3 czarne czolgi wjezdzaja do celi z gory (tween), cela gasnie
            if (!this.endGfx) { this.endGfx = new PIXI.Graphics(); this.endGfx.zIndex = 25000; this.opts.worldContainer.addChild(this.endGfx); }
            const g = this.endGfx; g.clear();
            const qx = this.queen.x, qy = this.queen.y;
            for (let i = 0; i < 3; i++) {
                const kk = Math.max(0, Math.min(1, (k - i * 0.12) / 0.6));
                const sx = qx + (i - 1) * 46, sy = -200 + (qy - 60 - (-200)) * kk;
                g.beginFill(0x07040b, 0.9); g.drawRoundedRect(sx - 20, sy - 14, 40, 28, 5); g.drawRect(sx - 3, sy - 38, 6, 26); g.endFill();
                g.beginFill(0xff3b3b, 0.8 * kk); g.drawCircle(sx - 8, sy - 4, 2); g.drawCircle(sx + 8, sy - 4, 2); g.endFill();
            }
            if (k > 0.85) { g.beginFill(0x07040b, (k - 0.85) / 0.15 * 0.85); g.drawRect(qx - 84, qy - 112, 168, 224); g.endFill(); }
        }
    }

    private updateBuilders(delta: number, dtMs: number): void {
        for (const [e, st] of this.builders) {
            if (!e.active) {
                if (!st.rewarded) {
                    st.rewarded = true;
                    const q = this.opts.session.queen; if (q) q.builders++;
                    this.opts.session.addQueenStaticBonus(T.builderScore, 'builder');
                    if (worldRng.chance(T.builderGemChance)) this.opts.onGemDrop(e.x, e.y + 10); // Q5: -95% gemow
                    this.opts.effects.spawnFloatingText(e.x, e.y - 40, t('queen.builderDown'), 0xd9a441);
                    this.opts.effects.spawnWoodSplinters(e.x, e.y, 8);
                }
                st.scaffold?.destroy(); st.scaffold = null;
                this.builders.delete(e);
                continue;
            }
            const frozen = Date.now() < e.frozenUntil;
            const tgt = st.target;
            // zablokowany? (ruch < stuckMoveMin px / s) => po stuckTeleportMs zmien cel
            const moved = Math.hypot(e.x - st.lastX, e.y - st.lastY);
            st.lastX = e.x; st.lastY = e.y;
            if (tgt && !frozen && moved < (T.stuckMoveMin / 60) * delta) st.stuckFrames += delta; else st.stuckFrames = 0;
            if (!tgt || frozen) { this.hideScaffold(st); st.channelMs = 0; continue; }
            const d = Math.hypot(e.x - tgt.centerX, e.y - tgt.centerY);
            const inReach = d <= T.contactReach || (st.stuckFrames >= T.stuckFrames && d <= T.contactReach * 2);
            if (!inReach) {
                this.hideScaffold(st); st.channelMs = 0;
                if (st.stuckFrames >= (T.stuckTeleportMs / 1000) * 60) { st.skip = tgt; st.target = null; st.stuckFrames = 0; }
                continue;
            }
            st.sparkT += dtMs;
            if (tgt.isDestroyed) {
                // kanal 1.8 s: rusztowanie nad slotem + iskry mlotka co 300 ms (telegraf)
                st.channelMs += dtMs;
                this.showScaffold(st, tgt, Math.min(1, st.channelMs / T.repairChannelMs));
                if (st.sparkT >= 300) { st.sparkT = 0; this.opts.effects.spawnEnemyHitSparks(tgt.centerX, tgt.centerY - 14, 0xd9a441); this.opts.audio.playHit('wall'); }
                if (st.channelMs >= T.repairChannelMs) {
                    st.channelMs = 0;
                    tgt.rebuild(0.25);
                    this.hideScaffold(st);
                    this.opts.effects.spawnWoodSplinters(tgt.centerX, tgt.centerY, 6);
                    this.opts.audio.playCrateBreak();
                    this.onRebuilt(tgt);
                }
            } else {
                // domurowanie 8%/s do pelna
                tgt.heal(T.repairPctPerSec * (dtMs / 1000));
                if (st.sparkT >= 500) { st.sparkT = 0; this.opts.effects.spawnEnemyHitSparks(tgt.centerX, tgt.centerY - 10, 0xc9b8a5); }
                if (tgt.hpPct >= 1) st.target = null;
            }
        }
    }

    private onRebuilt(b: PrisonBrick): void {
        if (b.col >= 0 && DUNGEON_FRONT.keyRows.includes(b.row)) {
            this.pathFlashUntil = this.elapsedMs + 2000;
            const q = this.opts.session.queen; if (q) q.pathBroken = this.pathBroken();
            if (this.elapsedMs - this.lastRebuiltNotifAt > 6000) { this.lastRebuiltNotifAt = this.elapsedMs; this.opts.hudNotif(t('queen.rebuilt'), COL_BUILDER); }
        }
    }

    private showScaffold(st: BuilderState, b: PrisonBrick, k: number): void {
        if (!st.scaffold) {
            st.scaffold = new PIXI.Graphics();
            st.scaffold.zIndex = b.y + PRISON_BRICK_SIZE + 2;
            this.opts.worldContainer.addChild(st.scaffold);
        }
        const g = st.scaffold;
        g.clear(); g.visible = true;
        const x = b.x, y = b.y, s = PRISON_BRICK_SIZE;
        // drewniane belki + krzyzak (alpha ~0.6) + pasek postepu kanalu (ochra)
        g.lineStyle(4, 0x8d5a2b, 0.7);
        g.moveTo(x + 4, y + 4); g.lineTo(x + 4, y + s - 4); g.moveTo(x + s - 4, y + 4); g.lineTo(x + s - 4, y + s - 4);
        g.moveTo(x + 4, y + 8); g.lineTo(x + s - 4, y + 8); g.moveTo(x + 4, y + s - 8); g.lineTo(x + s - 4, y + s - 8);
        g.lineStyle(3, 0xd9a441, 0.6);
        g.moveTo(x + 6, y + 10); g.lineTo(x + s - 6, y + s - 10); g.moveTo(x + s - 6, y + 10); g.lineTo(x + 6, y + s - 10);
        g.lineStyle(0);
        g.beginFill(0x000000, 0.5); g.drawRect(x + 6, y - 12, s - 12, 6); g.endFill();
        g.beginFill(0xd9a441, 0.95); g.drawRect(x + 6, y - 12, (s - 12) * k, 6); g.endFill();
    }

    private hideScaffold(st: BuilderState): void { if (st.scaffold && st.scaffold.visible) { st.scaffold.visible = false; st.scaffold.clear(); } }

    // ── Q4 DYNAMIT ─────────────────────────────────────────────────────────

    private lightDynamite(b: PrisonBrick): void {
        if (b.dynamite !== 'hidden' || b.isDestroyed) return;
        b.dynamite = 'lit';
        b.revealDynamite();
        this.lit.push({ brick: b, fuseMs: T.dynamiteFuseMs });
        this.opts.audio.playCrateTap(3);
        this.opts.effects.spawnFloatingText(b.centerX, b.centerY - 40, '🧨', 0xff3b3b);
        if (!this.dynamiteHintShown) { this.dynamiteHintShown = true; this.opts.hudNotif(t('queen.dynamite'), COL_PANIC); }
    }

    private updateDynamite(dtMs: number): void {
        for (let i = this.lit.length - 1; i >= 0; i--) {
            const ld = this.lit[i];
            if (ld.brick.dynamite !== 'lit') { this.lit.splice(i, 1); continue; }
            ld.fuseMs -= dtMs;
            if (ld.fuseMs <= 0) { this.lit.splice(i, 1); this.explode(ld.brick); }
        }
    }

    private explode(b: PrisonBrick): void {
        if (b.dynamite === 'done') return;
        b.dynamite = 'done';
        const cx = b.centerX, cy = b.centerY;
        // 3x3 cegiel frontu (heavy => Zwornik tez) — kazde rozbicie idzie przez onBreak (licznik, gemy, lancuch)
        let n = 0;
        for (const o of this.bricks) {
            if (o.isDestroyed || o.row < 0) continue;
            if (Math.abs(o.row - b.row) <= 1 && Math.abs(o.col - b.col) <= 1) {
                if (o !== b && o.dynamite === 'hidden') o.dynamite = 'done'; // sasiedni ukryty dynamit idzie z dymem (bez drugiego lontu)
                o.takeDamage(1e9, o.centerX, o.centerY, true);
                n++;
            }
        }
        // obrazenia: wrogowie r120 / gracz r80 (fair: 1.5 s lontu + ikona)
        const r2e = T.dynamiteR * T.dynamiteR;
        for (const e of this.opts.enemies) {
            if (!e.active) continue;
            if ((e.x - cx) ** 2 + (e.y - cy) ** 2 <= r2e) this.opts.hurtEnemy(e, T.dynamiteEnemyDmg, SRC_DYNAMITE);
        }
        this.pendingPlayerBlast = { x: cx, y: cy };
        // Sensoryka: flash + pierscien + czastki + shake + huk
        this.opts.effects.spawnRocketExplosion(cx, cy);
        this.opts.effects.spawnMegaBomb(cx, cy);
        this.opts.effects.spawnShockwaveRing(cx, cy, T.dynamiteR, 0xff7a1a);
        this.opts.effects.shake(9, 16);
        this.opts.audio.playExplosion();
        this.opts.effects.spawnFloatingText(cx, cy - 70, `${t('queen.blast')} +${n} 🧱`, 0xffb347);
        const q = this.opts.session.queen; if (q) q.blasts++;
        this.opts.session.addQueenStaticBonus(T.score.dynamiteChain, 'blast');
    }

    // ── Q4 LAWA + hazard gracza ────────────────────────────────────────────

    private updateHazards(dtMs: number, player: Player, isInvulnerable: boolean): void {
        // wybuch dynamitu -> gracz (odlozony, bo explode() nie ma referencji gracza)
        if (this.pendingPlayerBlast) {
            const pb = this.pendingPlayerBlast; this.pendingPlayerBlast = null;
            if ((player.x - pb.x) ** 2 + (player.y - pb.y) ** 2 <= T.dynamitePlayerR * T.dynamitePlayerR) {
                if (this.opts.hurtPlayer(T.dynamitePlayerDmg, SRC_DYNAMITE)) { this.playerDiedByHazard = true; return; }
            }
        }
        this.lavaTickMs += dtMs;
        const playerIn = isDungeonLavaPoint(player.x, player.y);
        if (playerIn) {
            this.playerLavaSparkMs += dtMs;
            if (this.playerLavaSparkMs >= T.lavaSparkMs) { this.playerLavaSparkMs = 0; this.opts.effects.spawnEnemyHitSparks(player.x + (worldRng.next() - 0.5) * 30, player.y + 10, 0xff7a1a); }
            if (!this.lavaHintShown) { this.lavaHintShown = true; this.opts.hudNotif(t('queen.lava'), COL_LAVA); }
        }
        if (this.lavaTickMs < T.lavaTickMs) return;
        this.lavaTickMs = 0;
        if (playerIn && !isInvulnerable) {
            this.opts.audio.playHit('wall');
            if (this.opts.hurtPlayer(T.lavaDmgPerTick, SRC_LAVA)) { this.playerDiedByHazard = true; return; }
        }
        for (const e of this.opts.enemies) {
            if (!e.active || !isDungeonLavaPoint(e.x, e.y)) continue;
            this.opts.effects.spawnEnemyHitSparks(e.x, e.y + 8, 0xff7a1a);
            this.opts.hurtEnemy(e, T.lavaDmgPerTick, SRC_LAVA);
        }
    }

    // ── Q4 GEJZERY (PANIKA) ────────────────────────────────────────────────

    private updateGeysers(): void {
        if (this.elapsedMs < this.nextGeyserAt) return;
        if (this.geysers.some(g => g.state !== 'idle')) return; // <=1 aktywny
        this.nextGeyserAt = this.elapsedMs + T.geyserEveryMs;
        const g = this.geysers[worldRng.int(this.geysers.length)];
        g.startTelegraph();
        this.opts.audio.playMineDrop();
        if (!this.geyserBannerShown) { this.geyserBannerShown = true; this.opts.hudNotif(t('queen.geyser'), COL_LAVA); }
    }

    private erupt(g: DungeonGeyser, player: Player): void {
        this.opts.effects.shake(5, 10);
        this.opts.audio.playExplosion();
        const r2 = T.geyserR * T.geyserR;
        for (const e of this.opts.enemies) {
            if (!e.active) continue;
            if ((e.x - g.x) ** 2 + (e.y - g.y) ** 2 <= r2) this.opts.hurtEnemy(e, T.geyserDmg, SRC_GEYSER);
        }
        if ((player.x - g.x) ** 2 + (player.y - g.y) ** 2 <= r2) {
            if (this.opts.hurtPlayer(T.geyserDmg, SRC_GEYSER)) this.playerDiedByHazard = true;
        }
    }

    // ── INTERNALS ──────────────────────────────────────────────────────────

    private touchesQueen(player: Player): boolean {
        const q = this.queen.aabb(T.queenTouchPad);
        const half = 25; // czolg ~50 px
        return player.x + half > q.x && player.x - half < q.x + q.w && player.y + half > q.y && player.y - half < q.y + q.h;
    }

    /** Droga = 2 rzedy bramy (keyRows) przez caly front (10 kol, w tym 2 Zworniki) — ile z 20 slotow rozbitych. */
    private pathBroken(): number {
        const F = DUNGEON_FRONT;
        let n = 0;
        for (const b of this.bricks) if (b.row >= 0 && b.col >= 0 && F.keyRows.includes(b.row) && b.isDestroyed) n++;
        return Math.min(T.pathSlots, n);
    }

    private onBrickBroken(b: PrisonBrick, cx: number, cy: number): void {
        const q = this.opts.session.queen;
        if (q) q.bricks++;
        this.opts.session.addQueenStaticBonus(T.score.brick, 'brick');
        if (b.kind === 'keystone') {
            if (!this.keystoneBannerShown) { // para Zwornikow peka razem — jeden baner/fanfara
                this.keystoneBannerShown = true;
                this.opts.effects.spawnFloatingText(cx, cy - 30, t('queen.keystoneBroken'), 0xc850ff);
                this.opts.banner(t('queen.keystoneBroken'), COL_VIOLET, 120);
                this.queen.wave(900);
                this.opts.audio.playVictory();
            }
        } else {
            this.opts.effects.spawnFloatingText(cx, cy - 20, '+1 🧱', 0xd97a5a);
            if (b.col === DUNGEON_FRONT.keyCol - 1) this.queen.wave(300); // ostatnia warstwa przed brama
            if (worldRng.chance(T.brickGemChance)) this.opts.onGemDrop(cx, cy);
        }
        // Q4 dynamit: zapalona cegla trafiona = natychmiastowy wybuch; sasiedzi (4-sasiedztwo) odkrywaja ukryty
        if (b.dynamite === 'lit') this.explode(b);
        if (b.row >= 0 && b.col >= 0) {
            for (const o of this.bricks) {
                if (o.dynamite !== 'hidden' || o.isDestroyed || o.row < 0) continue;
                if (Math.abs(o.row - b.row) + Math.abs(o.col - b.col) === 1) this.lightDynamite(o);
            }
        }
        if (q) q.pathBroken = this.pathBroken();
    }

    private onKeystoneClink(): void {
        if (this.keystoneHintShown) return;
        this.keystoneHintShown = true;
        this.opts.banner(t('queen.keystoneHint'), COL_VIOLET, 150);
        this.opts.hudNotif(t('queen.keystoneHint'), COL_VIOLET);
    }

    private finishRescue(): void {
        this.phase = 'rescued';
        this.endReason = 'rescued';
        this.endAt = this.elapsedMs + T.rescueFlourishMs;
        const remSec = this.remainingSec;
        const q = this.opts.session.queen;
        let bonus = T.score.rescue + remSec * T.score.timeBonusPerSec;
        let flexKey: 'queen.flex.lastSecond' | 'queen.flex.lightning' | null = null;
        if (remSec <= T.score.lastSecondSec) { bonus += T.score.lastSecond; flexKey = 'queen.flex.lastSecond'; if (q) q.flexLastSecond = true; }
        else if (remSec >= T.score.lightningSec) { bonus += T.score.lightning; flexKey = 'queen.flex.lightning'; if (q) q.flexLightning = true; }
        if (q) { q.result = 'rescued'; q.remainingSecAtEnd = remSec; q.pathBroken = this.pathBroken(); }
        this.opts.session.addQueenStaticBonus(bonus, 'rescue');
        // Q5 flourish: pochodnie flara + konfetti/pierscienie w updateEndSequence
        this.endFxT = 0;
        this.opts.onTorchFlareAll?.();
        this.queen.wave(T.rescueFlourishMs);
        this.opts.effects.shake(10, 20);
        this.opts.effects.spawnShockwaveRing(this.queen.x, this.queen.y, 160, 0xff5fb0);
        this.opts.effects.spawnFloatingText(this.queen.x, this.queen.y - 90, t('queen.rescued'), 0xff5fb0);
        this.opts.effects.spawnFloatingText(this.queen.x, this.queen.y - 60, `+${bonus}`, 0xc850ff);
        this.opts.banner(t('queen.rescued'), COL_MAGENTA, 150);
        if (flexKey) this.opts.banner(t(flexKey), COL_VIOLET, 120);
        this.opts.audio.playVictory();
    }

    private finishCaptured(reason: QueenEndReason): void {
        this.phase = 'captured';
        this.endReason = reason;
        this.endAt = this.elapsedMs + T.capturedSeqMs;
        const q = this.opts.session.queen;
        if (q) { q.result = reason; q.remainingSecAtEnd = 0; q.pathBroken = this.pathBroken(); }
        this.opts.banner(t('queen.captured'), COL_PANIC, 150);
        this.opts.audio.playYetiRoar();
        this.opts.effects.shake(8, 24);
        this.endFxT = 0; // Q5: ciemnosc (tint gruntu) + pochodnie gasna po jednej — updateEndSequence
    }

    /** Q3/Q6: dyrektor melduje swiezy punkt spawnu (flara + strzalka HUD) */
    public setActiveLanes(lanes: { x: number; y: number }[]): void { this.activeLanes = lanes; }
    public get lanes() { return DUNGEON_LANES; }
    public get endedWith(): QueenEndReason | null { return this.endReason; }
}
