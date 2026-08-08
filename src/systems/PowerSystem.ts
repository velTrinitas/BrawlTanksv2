import * as PIXI from 'pixi.js';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EffectsManager } from '../rendering/Effects';
import {
    POWERS, POWER_ORDER, TOWER_CONFIG, ROCKETS_CONFIG, GHOST_CONFIG, MINES_CONFIG,
    BUILDER_CONFIG, STRIKE_CONFIG, HOLE_CONFIG, LASER_CONFIG, PONG_CONFIG, getPowerDef,
    type PowerId, type LoadoutPair, type PowerActivationCtx, type ActivationResult,
} from '../config/powers';
import { AudioSys } from '../audio/AudioSys'; // F7b-3: tuk-tuk wystrzalow (precedens: Bullet.ts)
import { getBrawlerTextures } from '../rendering/SpriteFactory'; // F7b-4: kopia czolgu gracza

export type { ActivationResult } from '../config/powers';

// ── F7b-2: stale WIZUALNE wiezy (balans zyje w TOWER_CONFIG — tu tylko wyglad/animacja) ──
const TOWER_TOP_LIFT = 36;      // px — wysokosc platformy lufy nad gruntem (2.5D bryla)
const TOWER_TILT_Y = 0.8;       // scale.y wrapa lufy — obrot zatacza elipse (perspektywa)
const TOWER_DROP_FRAMES = 11;   // ~0.18s spadania (sync z whoosh w super_tower.wav)
const TOWER_DROP_HEIGHT = 110;  // px — z jakiej wysokosci bryla spada
const TOWER_SQUASH_FRAMES = 6;  // przysiad po ladowaniu (squash & stretch)

/**
 * Super power system — PROG-F7a: WYKONAWCA REJESTRU (zero if-chain po id mocy).
 *
 * Zachowanie mocy zyje w PowerDef (config/powers.ts): onActivate/onTick/onEnd.
 * Ten plik trzyma tylko stan wspolny: loadout (2 sloty), cooldowny per-moc,
 * aktywny efekt czasowy, wizual aury, magnes.
 *
 * KONTRAKT PUBLICZNY (petla gry na tym stoi — semantyka 1:1 z legacy):
 *  isInvulnerable / isFreezeActive / freezeUntil / magnetActive / activePowerId /
 *  framesLeft / getCooldownProgress / getCooldownSecondsLeft / getActiveSecondsLeft.
 *
 * Loadout wstrzykiwany w konstruktorze (system powstaje od nowa per mecz w startGame;
 * reset() nie istnieje — nie byl nigdzie wolany).
 */
export class PowerSystem {
    /** 2 sloty z GARAZU, rozwiazane pod scenariusz (resolveLoadoutForMatch w startGame). */
    public readonly loadout: readonly [PowerId, PowerId];

    /** Date.now() timestamps gdy cooldown wygasa per moc (klucze z rejestru). */
    public powerCooldowns: Record<PowerId, number>;

    /**
     * DESKTOP: slot wybrany scrollem — SPACJA/PPM odpala ten slot (feedback Mariusza:
     * scroll+PPM to pamiec miesniowa z legacy). Widoczny w HUD (strzalka), wiec NIE jest
     * ukrytym stanem — pasek HUD rysuje sie tylko na desktopie. Touch tego nie uzywa
     * (kazdy slot ma wlasny przycisk). Po kazdej aktywacji przeskakuje na uzyty slot.
     */
    public selectedSlot: 0 | 1 = 0;

    /** Aktualnie aktywny efekt czasowy (lub null). */
    public activePowerId: PowerId | null = null;
    public framesLeft: number = 0;
    /** Absolutny timestamp konca freeze — mrozenie wrogow spawnowanych PODCZAS (fix v0.87.1). */
    public freezeUntil: number = 0;

    // Aura shield visual
    private auraGfx: PIXI.Graphics;

    // Magnet (osobna mechanika od super powers)
    public magnetActive: boolean = false;
    public magnetEndTime: number = 0;

    // ── F7b-2: WIEZA MG — fire-and-forget, wzorzec magnesu (wlasny timer, NIE activePowerId).
    // Grafika tworzona leniwie przy towerSpawn i NISZCZONA w towerDespawn (przeglad F7b-2:
    // clear-only wyciekaloby geometrie WebGL per mecz). Nullable + guardy = zgodne z regula
    // "Graphics w pierwszym bloku konstruktora" (wzorzec Bullet.gfx).
    // Wizual 2.5D (feedback Mariusza): cien na gruncie + wysoka bryla + lufa na szczycie
    // w kontenerze ze scale.y=TILT (elipsa obrotu = tania perspektywa) + zrzut z nieba
    // z przysiadem, kurzem i wstrzasem w klatce LADOWANIA.
    private towerShadow: PIXI.Graphics | null = null;
    private towerBody: PIXI.Graphics | null = null;
    private towerTurretWrap: PIXI.Container | null = null;
    private towerTurret: PIXI.Graphics | null = null;
    private towerX = 0;
    private towerY = 0;
    private towerAngle = 0;
    private towerFramesLeft = 0;
    private towerTarget: Enemy | null = null;
    private towerScanT = 0;
    private towerFireT = 0;
    private towerHeat = 0;
    private towerDropLeft = 0;    // klatki spadania (>0 = jeszcze w powietrzu, nie strzela)
    private towerSquashLeft = 0;  // klatki przysiadu po ladowaniu

    // ── F7b-3: SALWA RAKIET — fire-and-forget jak wieza (wlasny stan, NIE activePowerId).
    // Wizuale = pula count kontenerow (kadlub+plomien, rysowane RAZ, reuzywane miedzy
    // salwami przez visible on/off); logika = tablica aktywnych rakiet + kolejka startow.
    private rocketVisuals: Array<{ c: PIXI.Container; flame: PIXI.Graphics }> = [];
    private rocketsActive: Array<{
        vi: number;                // indeks wizualu w puli
        x: number; y: number;
        ang: number;
        life: number;
        smokeT: number;
        target: Enemy | null;      // cel martwy => dumb-fire (zero retargetu, design §18.2)
    }> = [];
    private rocketQueue: Array<Enemy | null> = []; // cele czekajace na start (stagger)
    private rocketLaunchT = 0;
    private rocketOriginX = 0;
    private rocketOriginY = 0;
    private rocketBaseAng = 0;
    /**
     * Generyczna eksplozja AoE mocy (rakiety, Widmo, bomby Nalotu, crush Dziury, tick
     * Lasera) — kill-path (dmg/score/drop/victory) zyje w main.ts, jak mega bomba.
     * quiet=true (Tier 2): bez fireballa/dzwieku/shake — tick obrazen, nie eksplozja.
     */
    private readonly aoeExplode: (x: number, y: number, radius: number, dmg: number, quiet?: boolean) => void;

    // ── F7b-4: CZOLG WIDMO — wabik (fire-and-forget; wlasny timer jak wieza/rakiety).
    // Wizual = baked tekstury AKTUALNEGO brawlera (SpriteFactory reuse, zero nowego artu,
    // design: "NAJTANSZA wizualnie") + fioletowy tint + flicker alpha + przerywany
    // krag-aura (rysowany RAZ, obracany transformem).
    private ghostC: PIXI.Container | null = null;
    private ghostRing: PIXI.Graphics | null = null;
    private ghostX = 0;
    private ghostY = 0;
    private ghostFramesLeft = 0;
    private ghostAge = 0;
    /** Reuzywany punkt dla ghostTauntFor — zero alokacji per wrog per klatka. */
    private readonly ghostTauntPoint = { x: 0, y: 0 };

    // ── F7b-5: MINY — "moc jazdy": okno 7s, mina co 75px drogi, zegar 5s per mina.
    // Wizuale = pula maxActive (talerz AT + osobna dioda blinkowana transformem alpha).
    private mineVisuals: Array<{ c: PIXI.Container; diode: PIXI.Graphics }> = [];
    private minesArmed: Array<{ vi: number; x: number; y: number; fuse: number }> = [];
    private minesWindowLeft = 0;
    private minesBudget = 0; // laczny budzet zrzutow na aktywacje (fix "drugiego setu")
    private mineOdo = 0;
    private mineLastX = 0;
    private mineLastY = 0;

    // ── F7b-6: BUILDER — druga "moc jazdy". Segment muru = REALNY collider w swiecie;
    // collidery wstawia/usuwa main.ts przez wallSpawner (zwraca remover albo null =
    // miejsce niedozwolone). PowerSystem trzyma okno/odometr/budzet + wizuale + timery.
    private wallVisuals: PIXI.Graphics[] = [];
    private wallsActive: Array<{
        vi: number;
        x: number; y: number;
        life: number;
        age: number;
        remove: () => void;   // splice collidera z buildings/solidBuildings/ctf (main.ts)
    }> = [];
    private buildWindowLeft = 0;
    private buildBudget = 0;
    private buildOdo = 0;
    private buildLastX = 0;
    private buildLastY = 0;
    /**
     * Wstawienie collidera muru — WYMAGANE w konstruktorze (wzorzec towerBulletSpawner).
     * null = miejsce niedozwolone (kolizja z budynkiem / wrog w srodku) => segment pominiety.
     */
    private readonly wallSpawner: (x: number, y: number) => (() => void) | null;
    // ═══ TIER 2 (v0.111.0) — wszystkie fire-and-forget, wlasne timery ═══
    // NALOT: eskadra cieni + bomby detonowane fala wzdluz linii celowania.
    // v2: 5 maszyn +50% + doppler przelotu + KRATERY (decal gruntu 1:1 z BossBomb CTF,
    // fade craterFrames) — "chwilowe dziury w podlodze".
    private strikePlanes: Array<{ g: PIXI.Graphics; x: number; y: number; ang: number; life: number }> = [];
    private strikeBombs: Array<{ x: number; y: number; delay: number }> = [];
    private strikeCraters: Array<{ g: PIXI.Graphics; life: number }> = [];
    // CZARNA DZIURA: wir przed lufa (pull na wrogach robi holeUpdate — ma enemies).
    // v2 2.5D (feedback Mariusza): kontener scale.y=0.72 (lej w ziemi, nie placek),
    // 2 pierscienie KONTR-rotujace (sim 1:1: t*4 vs -t*2.6) + 2 warstwy drobin
    // zasysanych spiralnie (sawtooth scale+alpha, przesuniete w fazie = ciagly wir).
    private holeC: PIXI.Container | null = null;
    private holeRing1: PIXI.Graphics | null = null;
    private holeRing2: PIXI.Graphics | null = null;
    private holeDots1: PIXI.Graphics | null = null;
    private holeDots2: PIXI.Graphics | null = null;
    private holeX = 0;
    private holeY = 0;
    private holeFramesLeft = 0;
    private holeCrushT = 0;
    private holeAge = 0;
    // LASER: plamka celownika goni czolg z opoznieniem ("malujesz jazda").
    private laserGfx: PIXI.Graphics | null = null;
    private laserX = 0;
    private laserY = 0;
    private laserFramesLeft = 0;
    private laserTickT = 0;
    // PING-PONG: pulsujaca aura odbijajaca pociski (check pongDeflects wola main.ts).
    // v2 (feedback Mariusza): 3 PALETKI orbitujace + wiazki-trojkat miedzy nimi
    // + kontr-rotujacy zewnetrzny ring segmentowy + iskry z poola co ~12 klatek.
    private pongGfx: PIXI.Graphics | null = null;
    private pongFramesLeft = 0;
    private pongPlayerX = 0;
    private pongPlayerY = 0;
    private pongSparkT = 0;
    private pongSparkIdx = 0;

    private readonly worldContainer: PIXI.Container;
    /**
     * Spawn pocisku Wiezy — WYMAGANY w konstruktorze (przeglad F7b-2: wstrzykiwanie
     * po fakcie + `?.()` = cichy skip przy ponownym `new PowerSystem` w startGame;
     * wymagany parametr => pilnuje kompilator).
     */
    private readonly towerBulletSpawner: (x: number, y: number, angle: number) => void;

    constructor(
        worldContainer: PIXI.Container,
        loadout: readonly [PowerId, PowerId],
        towerBulletSpawner: (x: number, y: number, angle: number) => void,
        aoeExplode: (x: number, y: number, radius: number, dmg: number, quiet?: boolean) => void,
        wallSpawner: (x: number, y: number) => (() => void) | null,
    ) {
        this.loadout = loadout;
        this.worldContainer = worldContainer;
        this.towerBulletSpawner = towerBulletSpawner;
        this.aoeExplode = aoeExplode;
        this.wallSpawner = wallSpawner;
        this.powerCooldowns = Object.fromEntries(
            POWER_ORDER.map(id => [id, 0]),
        ) as Record<PowerId, number>;
        this.auraGfx = new PIXI.Graphics();
        this.auraGfx.visible = false;
        this.auraGfx.zIndex = 400;
        worldContainer.addChild(this.auraGfx);
    }

    /** Moc w danym slocie. */
    getSlotPower(slot: 0 | 1): PowerId {
        return this.loadout[slot];
    }

    /** Scroll na desktopie: przesun wybor slotu (przy 2 slotach = toggle; skaluje sie na 3+). */
    cycleSlot(direction: number): void {
        const n = this.loadout.length;
        this.selectedSlot = (((this.selectedSlot + direction) % n) + n) % n as 0 | 1;
    }

    /**
     * Czy moc jest gotowa do aktywacji? (cooldown minal + zaden efekt czasowy nie trwa —
     * blokada "jedna moc naraz" zostaje: dwa rownoczesne efekty to osobna decyzja balansowa.)
     */
    canActivate(id: PowerId): boolean {
        if (this.activePowerId !== null) return false;
        return Date.now() >= (this.powerCooldowns[id] ?? 0);
    }

    canActivateSlot(slot: 0 | 1): boolean {
        return this.canActivate(this.loadout[slot]);
    }

    /** Cooldown progress 0..1 (0 = gotowy, 1 = pelny cooldown). */
    getCooldownProgress(id: PowerId): number {
        const power = POWERS[id];
        const remaining = (this.powerCooldowns[id] ?? 0) - Date.now();
        if (remaining <= 0) return 0;
        return Math.min(1, remaining / power.cooldownMs);
    }

    /** Pozostale sekundy cooldownu (lub 0 jesli gotowy). */
    getCooldownSecondsLeft(id: PowerId): number {
        const remaining = (this.powerCooldowns[id] ?? 0) - Date.now();
        return Math.max(0, remaining / 1000);
    }

    /** Wyzeruj cooldowny + aktywny efekt (tutorial / handoff do meczu — zamiast literalow w main.ts). */
    clearCooldowns(): void {
        for (const id of Object.keys(this.powerCooldowns) as PowerId[]) {
            this.powerCooldowns[id] = 0;
        }
        this.activePowerId = null;
        this.framesLeft = 0;
        this.auraHide();
        this.towerDespawn();  // F7b-2: handoff tutorial->mecz nie moze zostawic zywej wiezy
        this.rocketsClear();  // F7b-3: ...ani rakiet w locie / w kolejce startowej
        this.ghostDespawn();  // F7b-4: ...ani wabika (bez wybuchu — czysty teardown)
        this.minesClear();    // F7b-5: ...ani uzbrojonych min (bez detonacji)
        this.buildClear();    // F7b-6: ...ani muru (collidery MUSZA wyjsc z tablic!)
        this.tier2Clear();    // v0.111.0: ...ani nalotu/wiru/lasera/pongu
    }

    /**
     * Aktywacja mocy ze slotu — wykonuje definicje z rejestru.
     * Efekty/notif/audio robi PowerDef.onActivate; wraca tylko to, co musi przejsc
     * przez petle gry (cele mega bomby).
     */
    activate(slot: 0 | 1, ctx: Omit<PowerActivationCtx, 'system'>): ActivationResult {
        const id = this.loadout[slot];
        if (!this.canActivate(id)) {
            return { activated: false };
        }
        const def = POWERS[id];
        console.log(`[PowerSystem] Activating ${id} (slot ${slot + 1}), cooldown ${def.cooldownMs}ms`);
        this.powerCooldowns[id] = Date.now() + def.cooldownMs;
        return def.onActivate({ ...ctx, system: this });
    }

    /**
     * Rozpocznij efekt czasowy mocy (wolane przez PowerDef.onActivate).
     * durationFrames bierze z rejestru — moc nie dubluje wlasnej stalej.
     */
    beginTimedEffect(id: PowerId): void {
        this.activePowerId = id;
        this.framesLeft = POWERS[id].durationFrames;
        // (wizual: auraTick/channelRingTick same ustawiaja visible — zero if-chain po id)
    }

    activateMagnet(durationMs: number): void {
        this.magnetActive = true;
        this.magnetEndTime = Date.now() + durationMs;
    }

    /** Czy gracz aktualnie ma tarcze (invulnerability)? */
    get isInvulnerable(): boolean {
        return this.activePowerId === 'aura';
    }

    /** Czy aktualnie freeze jest aktywny? */
    get isFreezeActive(): boolean {
        return this.activePowerId === 'freeze';
    }

    update(
        delta: number,
        player: Player,
        enemies: Enemy[],
        _worldContainer: PIXI.Container,
        effects: EffectsManager
    ): void {
        if (this.magnetActive && Date.now() >= this.magnetEndTime) {
            this.magnetActive = false;
        }

        // F7b-2..6 + Tier 2: wszystkie moce fire-and-forget tykaja NIEZALEZNIE.
        this.towerUpdate(delta, enemies, effects);
        this.rocketsUpdate(delta, enemies, effects);
        this.ghostUpdate(delta, effects);
        this.minesUpdate(delta, player, effects);
        this.buildUpdate(delta, player, effects);
        this.strikeUpdate(delta, effects);
        this.holeUpdate(delta, enemies, effects);
        this.laserUpdate(delta, player, enemies, effects);
        this.pongUpdate(delta, player, effects);

        // Generyczny tick efektu czasowego — zachowanie per-moc w PowerDef.onTick/onEnd.
        // F7b: onTick dostaje DELTE (efekty narastajace w czasie, np. heal, musza byc
        // odporne na FPS) + effects (iskry z poola).
        if (this.activePowerId !== null) {
            const def = getPowerDef(this.activePowerId);
            this.framesLeft -= delta;
            def?.onTick?.(this, player, delta, effects);
            if (this.framesLeft <= 0) {
                this.activePowerId = null;
                def?.onEnd?.(this, player, effects);
            }
        }
    }

    // ── Hooki wizualu aury (wolane przez PowerDef.onTick/onEnd — gfx jest prywatny) ──

    auraTick(playerX: number, playerY: number): void {
        this.auraGfx.visible = true;
        this.drawAuraShield(playerX, playerY);
    }

    auraHide(): void {
        this.auraGfx.visible = false;
        this.auraGfx.clear();
    }

    // ── F7b: generyczny RING KANALU (Naprawa i przyszle moce kanalowane) ─────
    // Reuzywa auraGfx (jedna moc czasowa naraz => zero konfliktu). To JEDYNY wskaznik
    // kanalu na mobile (pasek HUD wylaczony) — obowiazkowy, nie ozdobny (Czytelnosc).

    channelRingTick(playerX: number, playerY: number, color: number): void {
        const g = this.auraGfx;
        g.visible = true;
        g.x = playerX;
        g.y = playerY;
        g.clear();
        const t = Date.now() / 120;
        const pulse = 0.55 + Math.sin(t) * 0.35;
        const r = 40 + Math.sin(t * 1.7) * 4;
        g.lineStyle(4, color, pulse);
        g.drawCircle(0, 0, r);
        g.lineStyle(2, 0xffffff, pulse * 0.4);
        g.drawCircle(0, 0, r - 7);
    }

    channelRingHide(): void {
        this.auraGfx.visible = false;
        this.auraGfx.clear();
    }

    // ── F7b-2: WIEZA MG (spec feelingu: BT_SuperPowers_Sim_v6.html drawTower/tick) ────

    /** Rozstawia wieze w pozycji gracza (wolane przez PowerDef.onActivate z rejestru). */
    towerSpawn(x: number, y: number): void {
        this.towerX = x;
        this.towerY = y;
        this.towerFramesLeft = POWERS.tower.durationFrames;
        this.towerAngle = 0;
        this.towerTarget = null;
        this.towerScanT = 0; // pierwszy skan natychmiast po ladowaniu
        this.towerFireT = 0;
        this.towerHeat = 0;
        this.towerDropLeft = TOWER_DROP_FRAMES;   // zrzut z nieba (sync z whoosh w SFX)
        this.towerSquashLeft = 0;

        if (!this.towerBody || !this.towerTurret || !this.towerShadow || !this.towerTurretWrap) {
            // Rysowane RAZ przy spawnie (lekcja F4.1: zero per-frame redraw — dalej tylko
            // transformy). Kotwica bryly = punkt gruntu (0,0), bryla rosnie w -y.

            // CIEN — elipsa na gruncie; zostaje na ziemi gdy bryla spada (rosnie/ciemnieje).
            const shadow = new PIXI.Graphics();
            shadow.beginFill(0x000000, 0.30);
            shadow.drawEllipse(0, 4, 26, 11);
            shadow.endFill();
            this.worldContainer.addChild(shadow);
            this.towerShadow = shadow;

            // BRYLA — cokol + kolumna 2.5D (jasny front / ciemny prawy bok = kierunek
            // swiatla jak budynki) + blue-camo z sim + tealowy pasek LED (kolor mocy).
            const body = new PIXI.Graphics();
            // cokol (szeroki, niski)
            body.beginFill(0x2b333b);
            body.drawRoundedRect(-21, -4, 42, 18, 5);
            body.endFill();
            body.beginFill(0x39434d);
            body.drawRoundedRect(-21, -8, 42, 8, 3);   // gorna plyta cokolu
            body.endFill();
            // kolumna — front
            body.beginFill(0x39434d);
            body.drawRect(-14, -TOWER_TOP_LIFT, 24, TOWER_TOP_LIFT - 6);
            body.endFill();
            // kolumna — prawy bok (ciemniejszy = bryla, nie plaska naklejka)
            body.beginFill(0x252d34);
            body.drawRect(10, -TOWER_TOP_LIFT, 5, TOWER_TOP_LIFT - 6);
            body.endFill();
            // linie paneli (czytaja sie jako segmenty konstrukcji)
            body.beginFill(0x2b333b);
            body.drawRect(-14, -TOWER_TOP_LIFT + 9, 29, 1.5);
            body.drawRect(-14, -TOWER_TOP_LIFT + 19, 29, 1.5);
            body.endFill();
            // blue-camo na kolumnie (paleta 1:1 z sim)
            body.beginFill(0x2980b9);
            body.drawCircle(-6, -TOWER_TOP_LIFT + 13, 5);
            body.endFill();
            body.beginFill(0x1a5276);
            body.drawCircle(4, -TOWER_TOP_LIFT + 22, 4);
            body.endFill();
            body.beginFill(0x5dade2);
            body.drawCircle(-2, -TOWER_TOP_LIFT + 27, 3);
            body.endFill();
            // tealowy pasek LED — sygnatura mocy (kolor 0x4dd7c8 jak przycisk/tracery)
            body.beginFill(0x4dd7c8, 0.9);
            body.drawRect(-14, -TOWER_TOP_LIFT + 4, 24, 2);
            body.endFill();
            // platforma szczytowa (podstawa lufy)
            body.beginFill(0x454f5a);
            body.drawRoundedRect(-17, -TOWER_TOP_LIFT - 7, 34, 10, 4);
            body.endFill();
            body.beginFill(0x556270);
            body.drawRoundedRect(-17, -TOWER_TOP_LIFT - 9, 34, 5, 3);  // rant platformy
            body.endFill();
            this.worldContainer.addChild(body);
            this.towerBody = body;

            // WRAP lufy — scale.y=TILT: obrot dziecka zatacza ELIPSE = tania perspektywa
            // (pelny angle-bake jak czolgi to opcja polish; elipsa czyta sie dobrze).
            const wrap = new PIXI.Container();
            wrap.scale.y = TOWER_TILT_Y;
            const turret = new PIXI.Graphics();
            turret.beginFill(0x1a5276);
            turret.drawRect(8, -6, 26, 4.5);   // podwojna lufa MG (1:1 sim)
            turret.drawRect(8, 1.5, 26, 4.5);
            turret.endFill();
            turret.beginFill(0x2980b9);
            turret.drawCircle(0, 0, 11);
            turret.endFill();
            turret.lineStyle(3, 0x12405e);
            turret.drawCircle(0, 0, 11);
            turret.lineStyle(0);
            turret.beginFill(0x5dade2, 0.8);   // blik na kopule
            turret.drawCircle(-3, -3, 3);
            turret.endFill();
            wrap.addChild(turret);
            this.worldContainer.addChild(wrap);
            this.towerTurretWrap = wrap;
            this.towerTurret = turret;
        }

        // Pozycje + Y-sort (statyczne — ustawiane raz; drop animuje tylko offset y).
        this.towerShadow.x = x;
        this.towerShadow.y = y;
        this.towerShadow.zIndex = y - 1;
        this.towerBody.x = x;
        this.towerBody.zIndex = y;
        this.towerTurretWrap.x = x;
        this.towerTurretWrap.zIndex = y + 2;
        this.towerTurret.rotation = 0;
        for (const d of [this.towerShadow, this.towerBody, this.towerTurretWrap]) d.alpha = 1;
        this.towerBody.scale.set(1);
        this.towerApplyDropOffset(); // klatka 0 spadania (wysoko nad ziemia)
    }

    /** Sprzatniecie wiezy: DESTROY grafiki (nie clear) — zero wycieku geometrii per mecz. */
    towerDespawn(effects?: EffectsManager): void {
        this.towerFramesLeft = 0;
        this.towerTarget = null;
        if (!this.towerBody && !this.towerTurret && !this.towerShadow) return;
        if (effects) effects.spawnEnemyHitSparks(this.towerX, this.towerY - TOWER_TOP_LIFT, 0x4dd7c8);
        for (const d of [this.towerShadow, this.towerBody, this.towerTurretWrap]) {
            if (d) {
                if (d.parent) d.parent.removeChild(d);
                d.destroy({ children: true }); // wrap niszczy lufe razem ze soba
            }
        }
        this.towerShadow = null;
        this.towerBody = null;
        this.towerTurretWrap = null;
        this.towerTurret = null;
    }

    /** Pozycja bryly/lufy/cienia dla biezacej klatki zrzutu (cien ZOSTAJE na ziemi). */
    private towerApplyDropOffset(): void {
        const body = this.towerBody, wrap = this.towerTurretWrap, shadow = this.towerShadow;
        if (!body || !wrap || !shadow) return;
        const p = 1 - this.towerDropLeft / TOWER_DROP_FRAMES;      // 0 start -> 1 ziemia
        const offset = -TOWER_DROP_HEIGHT * (1 - p) * (1 - p);     // kwadratowo = przyspiesza
        body.y = this.towerY + offset;
        wrap.y = this.towerY - TOWER_TOP_LIFT + offset;
        shadow.scale.set(0.55 + 0.45 * p);                          // cien rosnie pod spadajaca bryla
        shadow.alpha = 0.35 + 0.65 * p;
    }

    /** Per-frame logika wiezy: zrzut -> skan (throttled) -> obrot -> ogien -> heat/mruganie. */
    private towerUpdate(delta: number, enemies: Enemy[], effects: EffectsManager): void {
        if (this.towerFramesLeft <= 0) return;
        this.towerFramesLeft -= delta;
        if (this.towerFramesLeft <= 0) {
            this.towerDespawn(effects); // puff na wygasniecie (sensoryka, jak w sim)
            return;
        }
        const body = this.towerBody;
        const wrap = this.towerTurretWrap;
        const turret = this.towerTurret;
        if (!body || !wrap || !turret) return;

        // ── Faza zrzutu: spada, nie strzela; ladowanie = kurz + wstrzas + przysiad ──
        if (this.towerDropLeft > 0) {
            this.towerDropLeft -= delta;
            if (this.towerDropLeft <= 0) {
                this.towerDropLeft = 0;
                this.towerSquashLeft = TOWER_SQUASH_FRAMES;
                effects.spawnTowerDeployDust(this.towerX, this.towerY);
                effects.shake(6, 8); // wstrzas w klatce LADOWANIA (thud w SFX wypada tu)
            }
            this.towerApplyDropOffset();
            return;
        }

        // Przysiad po ladowaniu (squash & stretch — kotwica bryly na gruncie).
        if (this.towerSquashLeft > 0) {
            this.towerSquashLeft = Math.max(0, this.towerSquashLeft - delta);
            const q = this.towerSquashLeft / TOWER_SQUASH_FRAMES;  // 1 -> 0
            body.scale.set(1 + 0.12 * q, 1 - 0.15 * q);
            wrap.y = this.towerY - TOWER_TOP_LIFT + TOWER_TOP_LIFT * 0.15 * q;
        }

        // Cel: martwy -> zwolnij od razu; nowy wybor co ~200ms (throttle jak w sim).
        if (this.towerTarget && !this.towerTarget.active) this.towerTarget = null;
        this.towerScanT -= delta;
        if (this.towerScanT <= 0) {
            this.towerScanT = TOWER_CONFIG.scanEveryFrames;
            let best: Enemy | null = null;
            let bestD = TOWER_CONFIG.range * TOWER_CONFIG.range;
            for (const e of enemies) {
                if (!e.active) continue;
                const d = (e.x - this.towerX) ** 2 + (e.y - this.towerY) ** 2;
                if (d < bestD) { bestD = d; best = e; }
            }
            this.towerTarget = best;
        }

        // Celowanie/pociski licza sie od PIVOTU lufy (szczyt wiezy) — pocisk spawnowany
        // u wylotu MUSI leciec dokladnie w cel, inaczej tracery "mijaja" (Czytelnosc).
        const pivotY = this.towerY - TOWER_TOP_LIFT;
        const tgt = this.towerTarget;
        if (tgt) {
            const desired = Math.atan2(tgt.y - pivotY, tgt.x - this.towerX);
            this.towerAngle = PowerSystem.lerpAngle(
                this.towerAngle, desired, TOWER_CONFIG.aimLerpPerFrame * delta,
            );
            let diff = desired - this.towerAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.towerFireT -= delta;
            if (this.towerFireT <= 0 && Math.abs(diff) < TOWER_CONFIG.aimToleranceRad) {
                this.towerFireT = TOWER_CONFIG.fireEveryFrames;
                this.towerHeat = 1;
                const a = this.towerAngle + (Math.random() - 0.5) * 2 * TOWER_CONFIG.spreadRad;
                const mx = this.towerX + Math.cos(this.towerAngle) * TOWER_CONFIG.barrelLen;
                const my = pivotY + Math.sin(this.towerAngle) * TOWER_CONFIG.barrelLen;
                effects.spawnMuzzleFlash(mx, my, a);
                this.towerBulletSpawner(mx, my, a);
            }
        }
        this.towerHeat = Math.max(0, this.towerHeat - 0.13 * delta);

        // Transformy (zero redraw): obrot + odrzut wzdluz -lufy (lokalnie w wrapie,
        // TILT robi wrap) + mruganie przed koncem.
        turret.rotation = this.towerAngle;
        const rec = this.towerHeat * 2.5;
        turret.x = -Math.cos(this.towerAngle) * rec;
        turret.y = -Math.sin(this.towerAngle) * rec;
        const alpha = this.towerFramesLeft < TOWER_CONFIG.blinkFrames
            ? 0.35 + 0.55 * Math.abs(Math.sin(Date.now() / 90))
            : 1;
        body.alpha = alpha;
        wrap.alpha = alpha;
        if (this.towerShadow) this.towerShadow.alpha = alpha;
    }

    // ── F7b-3: SALWA RAKIET (spec: sim v6 134-139/459-467 — stagger/steering/dumb-fire) ──

    /**
     * Aktywacja salwy: przydziel cele (i-ty najblizszy, round-robin gdy wrogow < count)
     * i ustaw kolejke startow. Rakiety startuja co launchEveryFrames (tuk-tuk).
     */
    rocketsLaunch(x: number, y: number, baseAng: number, enemies: Enemy[]): void {
        const sorted = enemies
            .filter(e => e.active)
            .sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2));
        this.rocketQueue = [];
        for (let i = 0; i < ROCKETS_CONFIG.count; i++) {
            // Round-robin po najblizszych (sim 1:1); zero wrogow => null = dumb-fire w rozrzucie.
            this.rocketQueue.push(sorted.length > 0 ? sorted[i % sorted.length] : null);
        }
        this.rocketOriginX = x;
        this.rocketOriginY = y;
        this.rocketBaseAng = baseAng;
        this.rocketLaunchT = 0; // pierwsza rakieta natychmiast
    }

    /** Handoff/teardown: schowaj wizuale, wytnij kolejke i aktywne rakiety (bez eksplozji). */
    rocketsClear(): void {
        this.rocketQueue = [];
        for (const r of this.rocketsActive) this.rocketVisuals[r.vi].c.visible = false;
        this.rocketsActive = [];
    }

    /** Wizual rakiety z puli (rysowany RAZ przy pierwszym uzyciu — potem visible on/off). */
    private rocketAcquireVisual(): number {
        for (let i = 0; i < this.rocketVisuals.length; i++) {
            if (!this.rocketVisuals[i].c.visible) return i;
        }
        // "Godny" art (feedback Mariusza): kadlub + biala obwodka glowicy + zloty nos
        // + stateczniki + dysza; osobny PLOMIEN silnika (flicker transformami per klatke).
        const c = new PIXI.Container();
        const flame = new PIXI.Graphics();
        flame.beginFill(0xff7a2a, 0.75);
        flame.drawPolygon([-1, -3.4, -12, 0, -1, 3.4]);   // ogon plomienia
        flame.endFill();
        flame.beginFill(0xffd166, 0.9);
        flame.drawPolygon([-1, -1.8, -7, 0, -1, 1.8]);    // zar wewnetrzny
        flame.endFill();
        flame.x = -8;
        c.addChild(flame);
        const body = new PIXI.Graphics();
        body.beginFill(0xc94f1f);                          // stateczniki (za kadlubem)
        body.drawPolygon([-8, -3, -3.5, -3, -8, -7.5]);
        body.drawPolygon([-8, 3, -3.5, 3, -8, 7.5]);
        body.endFill();
        body.beginFill(0xd35424);                          // kadlub
        body.drawRoundedRect(-8, -3.5, 16, 7, 3);
        body.endFill();
        body.beginFill(0xff9f43);                          // grzbietowy blik (3D)
        body.drawRoundedRect(-7, -3.2, 14, 2.2, 2);
        body.endFill();
        body.beginFill(0xf2e9dc);                          // biala obwodka glowicy
        body.drawRect(3, -3.5, 2.4, 7);
        body.endFill();
        body.beginFill(0xffd166);                          // zloty stozek nosa
        body.drawPolygon([8, -3.5, 13.5, 0, 8, 3.5]);
        body.endFill();
        body.beginFill(0x8a3a16);                          // dysza
        body.drawRect(-9.5, -2.4, 2, 4.8);
        body.endFill();
        c.addChild(body);
        this.worldContainer.addChild(c);
        this.rocketVisuals.push({ c, flame });
        return this.rocketVisuals.length - 1;
    }

    /** Per-frame: kolejka startow (rytm tuk-tuk) + lot/sterowanie/dym/detonacje. */
    private rocketsUpdate(delta: number, enemies: Enemy[], effects: EffectsManager): void {
        // Starty z kolejki — co launchEveryFrames, kazdy z wlasnym "thoomp".
        if (this.rocketQueue.length > 0) {
            this.rocketLaunchT -= delta;
            while (this.rocketLaunchT <= 0 && this.rocketQueue.length > 0) {
                this.rocketLaunchT += ROCKETS_CONFIG.launchEveryFrames;
                const target = this.rocketQueue.shift() ?? null;
                const vi = this.rocketAcquireVisual();
                const ang = this.rocketBaseAng + (Math.random() - 0.5) * 2 * ROCKETS_CONFIG.spreadRad;
                this.rocketsActive.push({
                    vi,
                    x: this.rocketOriginX,
                    y: this.rocketOriginY,
                    ang,
                    life: ROCKETS_CONFIG.lifeFrames,
                    smokeT: 0,
                    target: target && target.active ? target : null,
                });
                const v = this.rocketVisuals[vi];
                v.c.visible = true;
                v.c.x = this.rocketOriginX;
                v.c.y = this.rocketOriginY;
                v.c.rotation = ang;
                AudioSys.getInstance().playRocketLaunch();
                effects.spawnMuzzleFlash(this.rocketOriginX, this.rocketOriginY, ang);
            }
        }

        if (this.rocketsActive.length === 0) return;
        const contact2 = ROCKETS_CONFIG.contactDist * ROCKETS_CONFIG.contactDist;
        for (let i = this.rocketsActive.length - 1; i >= 0; i--) {
            const r = this.rocketsActive[i];
            // Sterowanie proporcjonalne DO ZYWEGO celu; martwy => leci prosto (dumb-fire).
            if (r.target && r.target.active) {
                const ta = Math.atan2(r.target.y - r.y, r.target.x - r.x);
                r.ang = PowerSystem.lerpAngle(r.ang, ta, ROCKETS_CONFIG.steerLerpPerFrame * delta);
            } else {
                r.target = null;
            }
            r.x += Math.cos(r.ang) * ROCKETS_CONFIG.speed * delta;
            r.y += Math.sin(r.ang) * ROCKETS_CONFIG.speed * delta;
            r.life -= delta;

            // Dym z poola co smokeEveryFrames (cap designu: max 3 particles/rakiete/klatke).
            r.smokeT -= delta;
            if (r.smokeT <= 0) {
                r.smokeT = ROCKETS_CONFIG.smokeEveryFrames;
                effects.spawnRocketSmoke(r.x - Math.cos(r.ang) * 10, r.y - Math.sin(r.ang) * 10);
            }

            // Detonacja: kontakt z DOWOLNYM zywym wrogiem albo koniec zycia.
            let boom = r.life <= 0;
            if (!boom) {
                for (const e of enemies) {
                    if (!e.active) continue;
                    if ((e.x - r.x) ** 2 + (e.y - r.y) ** 2 < contact2) { boom = true; break; }
                }
            }
            if (boom) {
                this.rocketVisuals[r.vi].c.visible = false;
                this.rocketsActive.splice(i, 1);
                AudioSys.getInstance().playRocketBoom(); // dzwiek = sygnatura mocy (wolajacy)
                this.aoeExplode(r.x, r.y, ROCKETS_CONFIG.explosionRadius, ROCKETS_CONFIG.explosionDmg);
                continue;
            }

            // Transformy wizualu (zero redraw): pozycja/obrot + flicker plomienia.
            const v = this.rocketVisuals[r.vi];
            v.c.x = r.x;
            v.c.y = r.y;
            v.c.rotation = r.ang;
            v.c.zIndex = r.y + 9;
            v.flame.scale.x = 0.75 + Math.random() * 0.5;
            v.flame.alpha = 0.7 + Math.random() * 0.3;
        }
    }

    // ── F7b-4: CZOLG WIDMO (spec: sim 140-142/389-392/456/551-554 + design §18.2 #8) ──

    /** Stawia wabik w pozycji gracza (wolane przez PowerDef.onActivate z rejestru). */
    ghostSpawn(player: Player): void {
        this.ghostDespawn(); // recast w trakcie (po cd) = przeniesienie, nie dwa wabiki
        this.ghostX = player.x;
        this.ghostY = player.y;
        this.ghostFramesLeft = GHOST_CONFIG.durationFrames;
        this.ghostAge = 0;
        this.ghostTauntPoint.x = player.x;
        this.ghostTauntPoint.y = player.y;

        // Kopia AKTUALNEGO brawlera — tekstury z SpriteFactory (flat; w trybie bake
        // rotacja hull jest wpieczona w teksture, wiec kopia stoi "na wprost" — akceptowalne,
        // wabik i tak flickeruje). Tint fiolet + alpha robi ghostUpdate.
        const c = new PIXI.Container();
        const ring = new PIXI.Graphics();
        // Przerywany krag-aura wabienia (sim: dash 8/8 na r60) — 10 segmentow RAZ,
        // potem tylko rotacja + puls skali (zero redraw).
        ring.lineStyle(2, 0xb39ddb, 0.45);
        for (let i = 0; i < 10; i++) {
            const a0 = (i / 10) * Math.PI * 2;
            ring.moveTo(Math.cos(a0) * 60, Math.sin(a0) * 60);
            ring.arc(0, 0, 60, a0, a0 + 0.38);
        }
        c.addChild(ring);
        const tex = getBrawlerTextures(player.brawler);
        const hull = new PIXI.Sprite(tex.hull);
        hull.anchor.set(0.5);
        hull.tint = 0xb39ddb;
        hull.rotation = player.hull.rotation;
        c.addChild(hull);
        const turret = new PIXI.Sprite(tex.turret);
        turret.anchor.set(0.5);
        turret.tint = 0x7e57c2;
        turret.rotation = player.turretAngle;
        c.addChild(turret);
        c.x = player.x;
        c.y = player.y;
        c.zIndex = player.y + 1;
        this.worldContainer.addChild(c);
        this.ghostC = c;
        this.ghostRing = ring;
    }

    /** Sprzatniecie wabika BEZ wybuchu (teardown/handoff). Wybuch robi ghostUpdate. */
    ghostDespawn(): void {
        this.ghostFramesLeft = 0;
        if (this.ghostC) {
            if (this.ghostC.parent) this.ghostC.parent.removeChild(this.ghostC);
            this.ghostC.destroy({ children: true });
            this.ghostC = null;
            this.ghostRing = null;
        }
    }

    /**
     * Cel dla AI wroga — TO JEST "targetRef" z reguly super-powers.md, zrealizowany
     * iniekcja wspolrzednych (Enemy.update juz bierze targetX/Y; jedno wywolanie w main.ts).
     * null => wrog celuje w gracza jak zwykle. Zwracany obiekt jest REUZYWANY — czytaj
     * natychmiast, nie przechowuj referencji.
     */
    ghostTauntFor(enemy: Enemy): { x: number; y: number } | null {
        if (this.ghostFramesLeft <= 0) return null;
        // Boss/mega boss ignoruje wabik po 2s (design: inaczej trywializuje bossfighty).
        if ((enemy.isBoss || enemy.isMegaBoss) && this.ghostAge > GHOST_CONFIG.bossIgnoreAfterFrames) {
            return null;
        }
        const dx = enemy.x - this.ghostX;
        const dy = enemy.y - this.ghostY;
        if (dx * dx + dy * dy > GHOST_CONFIG.tauntRadius * GHOST_CONFIG.tauntRadius) return null;
        return this.ghostTauntPoint;
    }

    /** Czy pocisk wroga trafil w wabik? (sim: absorpcja + fioletowy puff — robi main.ts). */
    ghostAbsorbs(x: number, y: number): boolean {
        if (this.ghostFramesLeft <= 0) return false;
        const dx = x - this.ghostX;
        const dy = y - this.ghostY;
        return dx * dx + dy * dy < GHOST_CONFIG.absorbRadius * GHOST_CONFIG.absorbRadius;
    }

    /** Per-frame: timer + flicker + puls kragu; koniec = fioletowy wybuch r100 (kill-path main.ts). */
    private ghostUpdate(delta: number, effects: EffectsManager): void {
        if (this.ghostFramesLeft <= 0) return;
        this.ghostFramesLeft -= delta;
        this.ghostAge += delta;
        const c = this.ghostC;
        if (!c) return;

        if (this.ghostFramesLeft <= 0) {
            const x = this.ghostX, y = this.ghostY;
            this.ghostDespawn();
            effects.spawnEnemyHitSparks(x, y, 0xb39ddb); // fioletowy puff rozplyniecia
            AudioSys.getInstance().playRocketBoom(); // dzwiek = sygnatura mocy (wolajacy)
            this.aoeExplode(x, y, GHOST_CONFIG.endExplosionRadius, GHOST_CONFIG.endExplosionDmg);
            return;
        }

        // Flicker (sim: .45+.25*sin(t*22)) + mikro-glitch pozycji = "widmo", nie drugi czolg
        // (Czytelnosc: gracz i wrogowie MUSZA odrozniac wabik od prawdziwego gracza).
        const t = Date.now();
        c.alpha = 0.45 + 0.22 * Math.sin(t / 45) + (Math.random() < 0.06 ? -0.2 : 0);
        c.x = this.ghostX + (Math.random() - 0.5) * 1.6;
        c.y = this.ghostY + (Math.random() - 0.5) * 1.6;
        if (this.ghostRing) {
            this.ghostRing.rotation = t / 900;
            const pulse = 1 + 0.08 * Math.sin(t / 250);
            this.ghostRing.scale.set(pulse);
        }
    }

    // ── F7b-5: MINY (spec: sim v6 143-145/276-289/539-543 — timer 5s, ZERO proximity) ──

    /** Aktywacja: otwiera 7s okno zostawiania min podczas jazdy (sim: "MINY! jedz!"). */
    minesActivate(player: Player): void {
        this.minesWindowLeft = MINES_CONFIG.windowFrames;
        this.minesBudget = MINES_CONFIG.maxPerActivation;
        this.mineOdo = 0;
        this.mineLastX = player.x;
        this.mineLastY = player.y;
    }

    /** Handoff/teardown: schowaj miny bez detonacji + zamknij okno. */
    minesClear(): void {
        this.minesWindowLeft = 0;
        for (const m of this.minesArmed) this.mineVisuals[m.vi].c.visible = false;
        this.minesArmed = [];
    }

    /** Wizual miny z puli (talerz AT rysowany RAZ; dioda = osobna gfx blinkowana alpha). */
    private mineAcquireVisual(): number {
        for (let i = 0; i < this.mineVisuals.length; i++) {
            if (!this.mineVisuals[i].c.visible) return i;
        }
        const c = new PIXI.Container();
        const plate = new PIXI.Graphics();
        plate.beginFill(0x3a3f45);                 // talerz przeciwpancerny (sim 1:1)
        plate.drawCircle(0, 0, 11);
        plate.endFill();
        plate.lineStyle(3, 0x20242a);
        plate.drawCircle(0, 0, 11);
        plate.lineStyle(2, 0x20242a);
        plate.moveTo(-11, 0); plate.lineTo(11, 0); // zebra talerza (krzyz)
        plate.moveTo(0, -11); plate.lineTo(0, 11);
        plate.lineStyle(0);
        plate.beginFill(0x555c64, 0.9);            // srodkowy garb zapalnika
        plate.drawCircle(0, 0, 4.5);
        plate.endFill();
        c.addChild(plate);
        const diode = new PIXI.Graphics();
        diode.beginFill(0xff5252);
        diode.drawCircle(0, 0, 2.2);
        diode.endFill();
        diode.y = -6;
        c.addChild(diode);
        this.worldContainer.addChild(c);
        this.mineVisuals.push({ c, diode });
        return this.mineVisuals.length - 1;
    }

    /** Per-frame: okno jazdy (odometr -> drop) + zegary min + blink diod + detonacje. */
    private minesUpdate(delta: number, player: Player, effects: EffectsManager): void {
        // Okno zostawiania: mina co dropEveryPx przejechanej drogi, ZA czolgiem.
        if (this.minesWindowLeft > 0) {
            this.minesWindowLeft -= delta;
            const dx = player.x - this.mineLastX;
            const dy = player.y - this.mineLastY;
            const moved = Math.hypot(dx, dy);
            this.mineLastX = player.x;
            this.mineLastY = player.y;
            if (moved > 0 && this.minesBudget > 0) {
                this.mineOdo += moved;
                if (this.mineOdo >= MINES_CONFIG.dropEveryPx) {
                    this.mineOdo -= MINES_CONFIG.dropEveryPx;
                    this.minesBudget--;
                    if (this.minesBudget <= 0) this.minesWindowLeft = 0; // set skonczony
                    // ZA czolgiem wzdluz kierunku jazdy (sim: -cos(angle)*24)
                    const inv = 1 / moved;
                    const mx = player.x - dx * inv * MINES_CONFIG.dropBehindPx;
                    const my = player.y - dy * inv * MINES_CONFIG.dropBehindPx;
                    const vi = this.mineAcquireVisual();
                    const v = this.mineVisuals[vi];
                    v.c.visible = true;
                    v.c.x = mx;
                    v.c.y = my;
                    v.c.zIndex = my - 2; // plasko na gruncie — czolgi przejezdzaja NAD talerzem
                    this.minesArmed.push({ vi, x: mx, y: my, fuse: MINES_CONFIG.fuseFrames });
                    effects.spawnEnemyHitSparks(mx, my, 0xff8a80); // puff zrzutu (sensoryka)
                    AudioSys.getInstance().playMineDrop(); // klik zatrzasku per mina
                }
            }
        }

        // Zegary + blink + detonacje (timer-only, sim 1:1 — zero proximity).
        for (let i = this.minesArmed.length - 1; i >= 0; i--) {
            const m = this.minesArmed[i];
            m.fuse -= delta;
            if (m.fuse <= 0) {
                this.mineVisuals[m.vi].c.visible = false;
                this.minesArmed.splice(i, 1);
                // "Swietna eksplozja" (sim): podwojny ring + mocniejszy wstrzas + AoE kill-path.
                effects.spawnShockwaveRing(m.x, m.y, MINES_CONFIG.explosionRadius);
                effects.shake(8, 10);
                AudioSys.getInstance().playMineExplosion(); // SP_tank_mine (asset Mariusza)
                this.aoeExplode(m.x, m.y, MINES_CONFIG.explosionRadius, MINES_CONFIG.explosionDmg);
                continue;
            }
            // Dioda: miga; ostatnie 1.5s — szybciej (sim: freq 26 vs 10). Transform alpha only.
            const fast = m.fuse < MINES_CONFIG.blinkFastFuseFrames;
            const blink = (Math.sin(Date.now() / (fast ? 38 : 100)) + 1) / 2;
            this.mineVisuals[m.vi].diode.alpha = 0.25 + 0.75 * blink;
        }
    }

    // ── F7b-6: BUILDER (spec: sim v6 146-148/291-299/527-536 — worki, scale-in, fade) ──

    /** Aktywacja: otwiera 4s okno budowania podczas jazdy; pierwszy segment natychmiast. */
    buildActivate(player: Player): void {
        this.buildWindowLeft = BUILDER_CONFIG.windowFrames;
        this.buildBudget = BUILDER_CONFIG.maxPerActivation;
        this.buildOdo = BUILDER_CONFIG.dropEveryPx; // sim: wallOdo=999 => pierwszy segment od razu
        this.buildLastX = player.x;
        this.buildLastY = player.y;
    }

    /** Handoff/teardown: usun WSZYSTKIE collidery muru z tablic swiata + schowaj wizuale. */
    buildClear(): void {
        this.buildWindowLeft = 0;
        for (const w of this.wallsActive) {
            w.remove(); // splice z buildings/solidBuildings/ctf — bez tego niewidzialne sciany!
            this.wallVisuals[w.vi].visible = false;
        }
        this.wallsActive = [];
    }

    /** Wizual segmentu z puli (worki/cegly rysowane RAZ — paleta 1:1 z sim). */
    private wallAcquireVisual(): number {
        for (let i = 0; i < this.wallVisuals.length; i++) {
            if (!this.wallVisuals[i].visible) return i;
        }
        const g = new PIXI.Graphics();
        const s = BUILDER_CONFIG.segmentSize / 2; // 15
        g.beginFill(0xc9a36a);                    // cialo worka
        g.drawRoundedRect(-s, -s, s * 2, s * 2, 5);
        g.endFill();
        g.beginFill(0xb58d55);                    // dwa ciemniejsze pasy (warstwy workow)
        g.drawRoundedRect(-s, -s, s * 2, 9, 4);
        g.drawRoundedRect(-s, 6, s * 2, 9, 4);
        g.endFill();
        g.lineStyle(2, 0x8a6a3c);
        g.drawRect(-s, -s, s * 2, s * 2);         // obrys
        g.moveTo(0, -s); g.lineTo(0, -6);         // fugi cegiel (przesuniete rzedy)
        g.moveTo(-7, -6); g.lineTo(-7, 6);
        g.moveTo(7, -6); g.lineTo(7, 6);
        g.moveTo(0, 6); g.lineTo(0, s);
        g.lineStyle(0);
        this.worldContainer.addChild(g);
        this.wallVisuals.push(g);
        return this.wallVisuals.length - 1;
    }

    /** Per-frame: okno jazdy (odometr -> segment) + starzenie (scale-in / fade / expiry). */
    private buildUpdate(delta: number, player: Player, effects: EffectsManager): void {
        if (this.buildWindowLeft > 0) {
            this.buildWindowLeft -= delta;
            const dx = player.x - this.buildLastX;
            const dy = player.y - this.buildLastY;
            const moved = Math.hypot(dx, dy);
            this.buildLastX = player.x;
            this.buildLastY = player.y;
            if (moved > 0 && this.buildBudget > 0) {
                this.buildOdo += moved;
                if (this.buildOdo >= BUILDER_CONFIG.dropEveryPx) {
                    this.buildOdo -= BUILDER_CONFIG.dropEveryPx;
                    const inv = 1 / moved;
                    const wx = player.x - dx * inv * BUILDER_CONFIG.dropBehindPx;
                    const wy = player.y - dy * inv * BUILDER_CONFIG.dropBehindPx;
                    // main.ts waliduje miejsce (budynek/wrog) i wstawia collider; null = pomin
                    // segment (budzet NIE zuzyty — mur ma byc ciagly, nie dziurawy przez pecha).
                    const remove = this.wallSpawner(wx, wy);
                    if (remove) {
                        this.buildBudget--;
                        if (this.buildBudget <= 0) this.buildWindowLeft = 0; // zapora skonczona
                        const vi = this.wallAcquireVisual();
                        const g = this.wallVisuals[vi];
                        g.visible = true;
                        g.x = wx;
                        g.y = wy;
                        g.zIndex = wy + BUILDER_CONFIG.segmentSize / 2; // Y-sort po dolnej krawedzi
                        g.alpha = 1;
                        g.scale.set(0.1); // scale-in narodzin (sim: sc=age*5)
                        this.wallsActive.push({ vi, x: wx, y: wy, life: BUILDER_CONFIG.lifeFrames, age: 0, remove });
                        effects.spawnEnemyHitSparks(wx, wy, 0xe6b566); // puff piachu (sensoryka)
                        AudioSys.getInstance().playWallThunk();        // thunk worka per segment
                    }
                }
            }
        }

        // Starzenie segmentow: scale-in -> zycie -> fade (telegraf) -> expiry (collider OUT).
        for (let i = this.wallsActive.length - 1; i >= 0; i--) {
            const w = this.wallsActive[i];
            w.age += delta;
            w.life -= delta;
            const g = this.wallVisuals[w.vi];
            if (w.life <= 0) {
                w.remove(); // NAJPIERW collider (niewidzialna sciana = smiertelny grzech Czytelnosci)
                g.visible = false;
                this.wallsActive.splice(i, 1);
                effects.spawnEnemyHitSparks(w.x, w.y, 0xb58d55); // puff rozsypania
                continue;
            }
            if (w.age < BUILDER_CONFIG.growFrames) {
                g.scale.set(Math.min(1, w.age / BUILDER_CONFIG.growFrames));
            } else if (g.scale.x !== 1) {
                g.scale.set(1);
            }
            // Ostatnia sekunda: fade (sim: alpha=max(.25,dieIn)) — gracz WIE, ze zaraz zniknie.
            g.alpha = w.life < BUILDER_CONFIG.fadeFrames
                ? Math.max(0.25, w.life / BUILDER_CONFIG.fadeFrames)
                : 1;
        }
    }

    // ═══ TIER 2 PREMIUM (v0.111.0, spec: sim v6 153-172/334-356/436-451) ═══

    /** Teardown/handoff wszystkich mocy Tier 2 (bez efektow konca). */
    tier2Clear(): void {
        for (const p of this.strikePlanes) { if (p.g.parent) p.g.parent.removeChild(p.g); p.g.destroy(); }
        this.strikePlanes = [];
        this.strikeBombs = [];
        for (const cr of this.strikeCraters) { if (cr.g.parent) cr.g.parent.removeChild(cr.g); cr.g.destroy(); }
        this.strikeCraters = [];
        this.holeFramesLeft = 0;
        if (this.holeC) {
            if (this.holeC.parent) this.holeC.parent.removeChild(this.holeC);
            this.holeC.destroy({ children: true });
            this.holeC = null;
            this.holeRing1 = this.holeRing2 = this.holeDots1 = this.holeDots2 = null;
        }
        this.laserFramesLeft = 0;
        if (this.laserGfx) { if (this.laserGfx.parent) this.laserGfx.parent.removeChild(this.laserGfx); this.laserGfx.destroy(); this.laserGfx = null; }
        this.pongFramesLeft = 0;
        if (this.pongGfx) { if (this.pongGfx.parent) this.pongGfx.parent.removeChild(this.pongGfx); this.pongGfx.destroy(); this.pongGfx = null; }
    }

    // ── NALOT 🛸 ─────────────────────────────────────────────────────────────

    /** Eskadra cieni wzdluz linii celowania + 8 bomb detonowanych fala (sim 1:1). */
    strikeLaunch(px: number, py: number, aimAngle: number): void {
        const cos = Math.cos(aimAngle), sin = Math.sin(aimAngle);
        // Cienie bombowcow: startuja 400px ZA graczem, przelatuja nad linia bomb.
        for (let i = 0; i < STRIKE_CONFIG.planeCount; i++) {
            const off = (i - (STRIKE_CONFIG.planeCount - 1) / 2) * STRIKE_CONFIG.planeSpreadPx;
            const g = new PIXI.Graphics();
            // Sylwetka krzyza samolotu (sim drawPlane 1:1: dziob + kadlub + skrzydla + ogon)
            g.beginFill(0x0a1016, 0.45);
            g.drawPolygon([18, 0, -12, -5, -12, 5]);
            g.drawRect(-4, -16, 7, 32);
            g.drawRect(-14, -7, 5, 14);
            g.endFill();
            g.rotation = aimAngle;
            g.scale.set(STRIKE_CONFIG.planeScale); // v2: sylwetki +50%
            g.zIndex = 1e6; // cien LECI NAD wszystkim (warstwa "pogodowa", wzorzec sniezycy)
            this.worldContainer.addChild(g);
            this.strikePlanes.push({
                g,
                x: px + cos * 80 - cos * 400 - sin * off,
                y: py + sin * 80 - sin * 400 + cos * off,
                ang: aimAngle,
                life: STRIKE_CONFIG.planeLifeFrames,
            });
        }
        AudioSys.getInstance().playStrikeFlyby(); // v2: doppler przelotu (rownolegle z super_strike)
        // Bomby: wzdluz linii z losowym rozrzutem w poprzek (organiczny dywan),
        // detonacje ida FALA (stagger narasta z dystansem).
        this.strikeBombs = [];
        for (let i = 0; i < STRIKE_CONFIG.bombCount; i++) {
            const d = STRIKE_CONFIG.bombStartDist + i * STRIKE_CONFIG.bombStepDist;
            const off = (Math.random() - 0.5) * 2 * STRIKE_CONFIG.bombSpreadPx;
            this.strikeBombs.push({
                x: px + cos * d - sin * off,
                y: py + sin * d + cos * off,
                delay: (i + 1) * STRIKE_CONFIG.bombStaggerFrames,
            });
        }
    }

    /** v2: chwilowy KRATER w gruncie (decal 1:1 z BossBomb CTF, fade w strikeUpdate). */
    private strikeSpawnCrater(x: number, y: number): void {
        const g = new PIXI.Graphics();
        g.beginFill(0x140a00, 0.75);
        g.drawEllipse(0, 0, 17, 11);
        g.endFill();
        g.beginFill(0x50280a, 0.5);
        g.drawEllipse(1, 1, 13, 8);
        g.endFill();
        g.lineStyle(3, 0x3c1e00, 0.5);
        g.drawCircle(0, 0, 18);
        g.lineStyle(0);
        g.x = x;
        g.y = y;
        g.zIndex = 9; // decal GRUNTU — pod wszystkim Y-sortowanym (wzorzec BossBomb zIndex 8)
        this.worldContainer.addChild(g);
        this.strikeCraters.push({ g, life: STRIKE_CONFIG.craterFrames });
    }

    private strikeUpdate(delta: number, effects: EffectsManager): void {
        for (let i = this.strikePlanes.length - 1; i >= 0; i--) {
            const p = this.strikePlanes[i];
            p.life -= delta;
            p.x += Math.cos(p.ang) * STRIKE_CONFIG.planeSpeed * delta;
            p.y += Math.sin(p.ang) * STRIKE_CONFIG.planeSpeed * delta;
            p.g.x = p.x;
            p.g.y = p.y;
            if (p.life <= 0) {
                if (p.g.parent) p.g.parent.removeChild(p.g);
                p.g.destroy();
                this.strikePlanes.splice(i, 1);
            }
        }
        for (let i = this.strikeBombs.length - 1; i >= 0; i--) {
            const b = this.strikeBombs[i];
            b.delay -= delta;
            if (b.delay <= 0) {
                this.strikeBombs.splice(i, 1);
                AudioSys.getInstance().playRocketBoom(); // seria boomow = dywan (sygnatura mocy)
                effects.spawnShockwaveRing(b.x, b.y, STRIKE_CONFIG.bombRadius);
                this.strikeSpawnCrater(b.x, b.y); // v2: dziura w podlodze zostaje
                this.aoeExplode(b.x, b.y, STRIKE_CONFIG.bombRadius, STRIKE_CONFIG.bombDmg);
            }
        }
        // v2: kratery gasna (fade jak BossBomb CTF — alpha z life, potem destroy)
        for (let i = this.strikeCraters.length - 1; i >= 0; i--) {
            const cr = this.strikeCraters[i];
            cr.life -= delta;
            if (cr.life <= 0) {
                if (cr.g.parent) cr.g.parent.removeChild(cr.g);
                cr.g.destroy();
                this.strikeCraters.splice(i, 1);
            } else if (cr.life < 120) {
                cr.g.alpha = cr.life / 120; // ostatnie 2s: znikanie
            }
        }
    }

    // ── CZARNA DZIURA 🕳️ ────────────────────────────────────────────────────

    /** Wir 200px przed lufa: zasysa wrogow, miazdzy w rdzeniu, imploduje na koniec.
     *  v2 2.5D: kontener scale.y=0.72 (lej w gruncie), pierscienie KONTR-rotujace,
     *  2 warstwy drobin spiralnie wpadajacych (sawtooth w przeciwfazie). */
    holeSpawn(px: number, py: number, aimAngle: number): void {
        this.holeX = px + Math.cos(aimAngle) * HOLE_CONFIG.spawnDist;
        this.holeY = py + Math.sin(aimAngle) * HOLE_CONFIG.spawnDist;
        this.holeFramesLeft = HOLE_CONFIG.durationFrames;
        this.holeCrushT = 0;
        this.holeAge = 0;
        if (!this.holeC) {
            const c = new PIXI.Container();
            c.scale.y = 0.72; // perspektywa 2.5D — wir to LEJ w ziemi, nie plaski placek

            // Warstwa statyczna: cien leja + ciemny rdzen z fioletowa poswiata krawedzi
            const base = new PIXI.Graphics();
            base.beginFill(0x000000, 0.35);
            base.drawCircle(0, 0, 78);            // miekki cien leja
            base.endFill();
            base.beginFill(0x1a1030, 0.55);
            base.drawCircle(0, 0, 46);
            base.endFill();
            base.beginFill(0x0a0612, 0.92);
            base.drawCircle(0, 0, 26);            // czarny rdzen
            base.endFill();
            base.lineStyle(2, 0xc4b5fd, 0.5);
            base.drawCircle(0, 0, 27);            // gorejaca krawedz horyzontu zdarzen
            base.lineStyle(0);
            c.addChild(base);

            // Pierscienie akrecyjne — OSOBNE gfx = kontr-rotacja roznymi predkosciami (sim 1:1)
            const mkRing = (r: number, width: number, alpha: number, arcs: number, arcLen: number) => {
                const g = new PIXI.Graphics();
                g.lineStyle(width, 0xa78bfa, alpha);
                for (let a = 0; a < arcs; a++) {
                    const a0 = (a / arcs) * Math.PI * 2;
                    g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
                    g.arc(0, 0, r, a0, a0 + arcLen);
                }
                g.lineStyle(0);
                c.addChild(g);
                return g;
            };
            this.holeRing1 = mkRing(62, 3, 0.8, 3, 1.4);   // szybki, +
            this.holeRing2 = mkRing(89, 2, 0.4, 4, 1.0);   // wolniejszy, − (kontr-rotacja)

            // Drobiny zasysane: 2 warstwy po 6 kropek na promieniu jednostkowym 100 —
            // sawtooth scale 1->0.3 + rotacja = spirala wpadajaca; warstwy w przeciwfazie
            // => wir nigdy nie "mruga".
            const mkDots = () => {
                const g = new PIXI.Graphics();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + (i % 2) * 0.35;
                    g.beginFill(0xc4b5fd, 0.85);
                    g.drawCircle(Math.cos(a) * 100, Math.sin(a) * 100, 3);
                    g.endFill();
                }
                c.addChild(g);
                return g;
            };
            this.holeDots1 = mkDots();
            this.holeDots2 = mkDots();

            this.worldContainer.addChild(c);
            this.holeC = c;
        }
        this.holeC.visible = true;
        this.holeC.x = this.holeX;
        this.holeC.y = this.holeY;
        this.holeC.zIndex = this.holeY;
    }

    private holeUpdate(delta: number, enemies: Enemy[], effects: EffectsManager): void {
        if (this.holeFramesLeft <= 0) return;
        this.holeFramesLeft -= delta;
        this.holeAge += delta;
        const c = this.holeC;
        if (this.holeFramesLeft <= 0) {
            // Implozja na koniec (sim: ring r120 + puff) — kill-path w rdzeniu robi ostatni crush.
            if (c) { c.visible = false; }
            effects.spawnShockwaveRing(this.holeX, this.holeY, 120);
            effects.spawnEnemyHitSparks(this.holeX, this.holeY, 0xa78bfa);
            effects.shake(6, 8);
            return;
        }
        if (c) {
            // Kontr-rotacja pierscieni (sim: t*4 vs -t*2.6 => ~0.067 i -0.043 rad/klatke)
            if (this.holeRing1) this.holeRing1.rotation += 0.067 * delta;
            if (this.holeRing2) this.holeRing2.rotation -= 0.043 * delta;
            // Drobiny: spirala wpadajaca — sawtooth scale 1->0.3 (45 klatek/cykl),
            // warstwy w PRZECIWFAZIE; alpha gasnie przy rdzeniu ("polkniete").
            const CYCLE = 45;
            const spiral = (g: PIXI.Graphics | null, phase: number, dir: number) => {
                if (!g) return;
                const p = 1 - (((this.holeAge + phase) % CYCLE) / CYCLE) * 0.7; // 1 -> 0.3
                g.scale.set(p);
                g.alpha = Math.max(0, (p - 0.32) / 0.68);
                g.rotation += dir * 0.1 * delta;
            };
            spiral(this.holeDots1, 0, 1);
            spiral(this.holeDots2, CYCLE / 2, 1);
            // Oddech calego leja (puls grawitacyjny) — scale.y zachowuje squash 2.5D
            const breathe = 1 + 0.04 * Math.sin(Date.now() / 160);
            c.scale.set(breathe, 0.72 * breathe);
        }
        // Zasysanie: sila gasnie liniowo od rdzenia do krawedzi; boss opiera sie wirowi.
        const r2 = HOLE_CONFIG.pullRadius * HOLE_CONFIG.pullRadius;
        for (const e of enemies) {
            if (!e.active) continue;
            const dx = this.holeX - e.x;
            const dy = this.holeY - e.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > r2 || d2 < 1) continue;
            const d = Math.sqrt(d2);
            const resist = (e.isBoss || e.isMegaBoss) ? HOLE_CONFIG.bossPullMult : 1;
            const f = HOLE_CONFIG.pullPerFrame * (1 - d / HOLE_CONFIG.pullRadius) * resist * delta;
            e.x += (dx / d) * f;
            e.y += (dy / d) * f;
        }
        // Miazdzenie w rdzeniu — tick co 0.2s (kill-path przez aoeExplode, quiet=krotka iskra).
        this.holeCrushT -= delta;
        if (this.holeCrushT <= 0) {
            this.holeCrushT = HOLE_CONFIG.crushEveryFrames;
            let anyInCore = false;
            for (const e of enemies) {
                if (!e.active) continue;
                const dx = e.x - this.holeX, dy = e.y - this.holeY;
                if (dx * dx + dy * dy < HOLE_CONFIG.crushRadius * HOLE_CONFIG.crushRadius) { anyInCore = true; break; }
            }
            if (anyInCore) {
                effects.spawnEnemyHitSparks(this.holeX, this.holeY, 0xa78bfa);
                this.aoeExplode(this.holeX, this.holeY, HOLE_CONFIG.crushRadius, HOLE_CONFIG.crushDmg, true);
            }
        }
    }

    // ── LASER ORBITALNY 🔦 ───────────────────────────────────────────────────

    /** Plamka celownika startuje na graczu i GONI go z opoznieniem ("malujesz jazda"). */
    laserActivate(px: number, py: number): void {
        this.laserX = px;
        this.laserY = py;
        this.laserFramesLeft = LASER_CONFIG.durationFrames;
        this.laserTickT = 0;
        if (!this.laserGfx) {
            // Rysowane RAZ: pierscien celownika + krzyz + polprzezroczysta KOLUMNA z nieba
            // (waski pas — zero full-screen overdraw) + gorace jadro.
            const g = new PIXI.Graphics();
            g.beginFill(0xff6bcb, 0.16);
            g.drawRect(-13, -560, 26, 560);       // kolumna wiazki (v2: szersza, jak plamka)
            g.endFill();
            g.beginFill(0xff6bcb, 0.35);
            g.drawCircle(0, 0, 18);               // gorace jadro (v2: +)
            g.endFill();
            g.lineStyle(3, 0xff6bcb, 0.8);
            g.drawCircle(0, 0, LASER_CONFIG.beamRadius);
            g.moveTo(-LASER_CONFIG.beamRadius - 8, 0); g.lineTo(-LASER_CONFIG.beamRadius + 10, 0);
            g.moveTo(LASER_CONFIG.beamRadius - 10, 0); g.lineTo(LASER_CONFIG.beamRadius + 8, 0);
            g.moveTo(0, -LASER_CONFIG.beamRadius - 8); g.lineTo(0, -LASER_CONFIG.beamRadius + 10);
            g.moveTo(0, LASER_CONFIG.beamRadius - 10); g.lineTo(0, LASER_CONFIG.beamRadius + 8);
            g.lineStyle(0);
            g.zIndex = 1e6; // wiazka z nieba NAD swiatem (warstwa "pogodowa")
            this.worldContainer.addChild(g);
            this.laserGfx = g;
        }
        this.laserGfx.visible = true;
    }

    private laserUpdate(delta: number, player: Player, enemies: Enemy[], effects: EffectsManager): void {
        if (this.laserFramesLeft <= 0) return;
        this.laserFramesLeft -= delta;
        const g = this.laserGfx;
        if (this.laserFramesLeft <= 0) {
            if (g) g.visible = false;
            effects.spawnEnemyHitSparks(this.laserX, this.laserY, 0xff6bcb);
            return;
        }
        // v2 SAMONAPROWADZANIE: plamka GONI najblizszego zywego wroga (nie gracza);
        // cel ginie => automatycznie nastepny. Zero wrogow => dryfuje do gracza (eskorta).
        let tx = player.x, ty = player.y;
        let bestD2 = Infinity;
        for (const e of enemies) {
            if (!e.active) continue;
            const dx = e.x - this.laserX, dy = e.y - this.laserY;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; tx = e.x; ty = e.y; }
        }
        this.laserX += (tx - this.laserX) * LASER_CONFIG.huntLerpPerFrame * delta;
        this.laserY += (ty - this.laserY) * LASER_CONFIG.huntLerpPerFrame * delta;
        if (g) {
            g.x = this.laserX;
            g.y = this.laserY;
            g.alpha = 0.75 + 0.25 * Math.sin(Date.now() / 60); // wibracja wiazki
        }
        // Tick obrazen co 0.1s — kazdy wrog w plamce (quiet aoeExplode per wrog = male
        // trafienie z pelnym kill-pathem, bez fireballa per tick).
        this.laserTickT -= delta;
        if (this.laserTickT <= 0) {
            this.laserTickT = LASER_CONFIG.tickEveryFrames;
            const r2 = LASER_CONFIG.beamRadius * LASER_CONFIG.beamRadius;
            for (const e of enemies) {
                if (!e.active) continue;
                const dx = e.x - this.laserX, dy = e.y - this.laserY;
                if (dx * dx + dy * dy < r2) {
                    effects.spawnEnemyHitSparks(e.x, e.y, 0xff6bcb);
                    this.aoeExplode(e.x, e.y, 2, LASER_CONFIG.tickDmg, true);
                }
            }
        }
    }

    // ── PING-PONG 🏓 ─────────────────────────────────────────────────────────

    /** Pulsujaca aura odbijania — check pociskow robi main.ts (pongDeflects). */
    pongActivate(): void {
        this.pongFramesLeft = PONG_CONFIG.durationFrames;
        if (!this.pongGfx) {
            const g = new PIXI.Graphics();
            g.zIndex = 400;
            this.worldContainer.addChild(g);
            this.pongGfx = g;
        }
        this.pongGfx.visible = true;
    }

    /** Czy aura pong lapie pocisk w (x,y)? main.ts wtedy odbija (deactivate + player bullet). */
    pongDeflects(x: number, y: number): boolean {
        if (this.pongFramesLeft <= 0) return false;
        const dx = x - this.pongPlayerX;
        const dy = y - this.pongPlayerY;
        return dx * dx + dy * dy < PONG_CONFIG.deflectRadius * PONG_CONFIG.deflectRadius;
    }

    private pongUpdate(delta: number, player: Player, effects: EffectsManager): void {
        if (this.pongFramesLeft <= 0) return;
        this.pongFramesLeft -= delta;
        this.pongPlayerX = player.x;
        this.pongPlayerY = player.y;
        const g = this.pongGfx;
        if (!g) return;
        if (this.pongFramesLeft <= 0) {
            g.visible = false;
            g.clear();
            return;
        }
        // Aura v2 (redraw jak aura gracza — 1 Graphics, akceptowalny koszt):
        // ring + kontr-rotujacy ring segmentowy + 3 PALETKI + wiazki-trojkat.
        const t = Date.now() / 110;
        const pulse = 0.5 + 0.35 * Math.sin(t);
        const r = PONG_CONFIG.deflectRadius * (0.94 + 0.06 * Math.sin(t * 1.6));
        g.x = player.x;
        g.y = player.y;
        g.clear();
        // ring glowny (granica odbicia = Czytelnosc: hitbox zgodny z wizualem)
        g.lineStyle(4, 0xffe066, pulse);
        g.drawCircle(0, 0, r);
        // zewnetrzny ring segmentowy — KONTR-rotacja (dynamika bez particles)
        g.lineStyle(2, 0xfff6c2, pulse * 0.55);
        for (let i = 0; i < 6; i++) {
            const a0 = -t * 0.55 + (i / 6) * Math.PI * 2;
            g.moveTo(Math.cos(a0) * (r + 9), Math.sin(a0) * (r + 9));
            g.arc(0, 0, r + 9, a0, a0 + 0.55);
        }
        // pozycje paletek (orbitujace)
        const px: number[] = [], py: number[] = [];
        for (let i = 0; i < 3; i++) {
            const a = t * 0.9 + (i / 3) * Math.PI * 2;
            px.push(Math.cos(a) * r);
            py.push(Math.sin(a) * r);
        }
        // WIAZKI: trojkat energii miedzy paletkami (pole sily — "wiazka laserowa")
        g.lineStyle(1.5, 0xffe066, 0.16 + 0.14 * Math.sin(t * 2.3));
        for (let i = 0; i < 3; i++) {
            g.moveTo(px[i], py[i]);
            g.lineTo(px[(i + 1) % 3], py[(i + 1) % 3]);
        }
        // PALETKI: prostokaciki styczne do orbity (raketki pingpongowe, nie kropki)
        for (let i = 0; i < 3; i++) {
            const a = t * 0.9 + (i / 3) * Math.PI * 2;
            const tx = -Math.sin(a), ty = Math.cos(a); // wektor styczny
            g.lineStyle({ width: 6, color: 0xffe066, alpha: Math.min(1, pulse + 0.3), cap: PIXI.LINE_CAP.ROUND });
            g.moveTo(px[i] - tx * 9, py[i] - ty * 9);
            g.lineTo(px[i] + tx * 9, py[i] + ty * 9);
            g.lineStyle({ width: 2, color: 0xfff6c2, alpha: pulse, cap: PIXI.LINE_CAP.ROUND });
            g.moveTo(px[i] - tx * 5, py[i] - ty * 5);
            g.lineTo(px[i] + tx * 5, py[i] + ty * 5);
        }
        g.lineStyle(0);
        // ISKRY: smuga za kolejna paletka co ~12 klatek (pooled — dymek/energia orbit)
        this.pongSparkT -= delta;
        if (this.pongSparkT <= 0) {
            this.pongSparkT = 12;
            this.pongSparkIdx = (this.pongSparkIdx + 1) % 3;
            effects.spawnEnemyHitSparks(
                player.x + px[this.pongSparkIdx],
                player.y + py[this.pongSparkIdx],
                0xffe066,
            );
        }
    }

    /** Lerp kata po najkrotszym luku (obrot lufy nie moze isc "dookola"). */
    private static lerpAngle(a: number, b: number, t: number): number {
        let d = b - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return a + d * Math.min(1, t);
    }

    /**
     * Visual tarczy (zamiast "ognisty pierscien") — wnetrze pulsujace, deflection-style.
     */
    private drawAuraShield(playerX: number, playerY: number): void {
        this.auraGfx.x = playerX;
        this.auraGfx.y = playerY;
        this.auraGfx.clear();

        const t = Date.now() / 100;
        const pulse = 0.7 + Math.sin(t) * 0.3;
        const r = 55; // tarcza bezposrednio wokol gracza

        // Zewnetrzny pierscien
        this.auraGfx.lineStyle(4, 0xffdd00, pulse);
        this.auraGfx.drawCircle(0, 0, r);

        // Wewnetrzny ring (cienszy)
        this.auraGfx.lineStyle(2, 0xffffaa, pulse * 0.5);
        this.auraGfx.drawCircle(0, 0, r - 6);

        // Subtelne wypelnienie (transparent shield)
        this.auraGfx.beginFill(0xffdd00, 0.05 * pulse);
        this.auraGfx.drawCircle(0, 0, r);
        this.auraGfx.endFill();

        // Heksagonalny pattern shield (segmenty)
        const segments = 6;
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2 + Date.now() / 800;
            const sx = Math.cos(angle) * r;
            const sy = Math.sin(angle) * r;
            this.auraGfx.beginFill(0xffffff, pulse * 0.8);
            this.auraGfx.drawCircle(sx, sy, 2);
            this.auraGfx.endFill();
        }
    }

    /** Pozostaly czas aktywnego super w sekundach (do HUD). */
    getActiveSecondsLeft(): number {
        return this.framesLeft / 60;
    }
}

export type { LoadoutPair };
