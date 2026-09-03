import * as PIXI from 'pixi.js';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EffectsManager } from '../rendering/Effects';
import {
    POWERS, POWER_ORDER, TOWER_CONFIG, ROCKETS_CONFIG, GHOST_CONFIG, MINES_CONFIG,
    BUILDER_CONFIG, STRIKE_CONFIG, HOLE_CONFIG, LASER_CONFIG, PONG_CONFIG,
    DUCK_CONFIG, LOCKER_CONFIG, DISCO_CONFIG, GRANNY_CONFIG, BURP_CONFIG, getPowerDef,
    TIER3_POWERS, DICE_COOLDOWN_MS, DICE_ROLL_FRAMES, DICE_EMOJI,
    type PowerId, type LoadoutTriple, type PowerActivationCtx, type ActivationResult,
} from '../config/powers';
import {
    bakeDuck, bakeLocker, bakeLockerLed, bakeParcel, bakeGranny, bakeDiscoBall, bakeSoftShadow,
    bakeSmokePuff,
} from '../rendering/Tier3Baker'; // v0.112.0 — pieczony art z gradientami (Canvas 2D)
import { t } from '../i18n/i18n'; // v0.112.0 — kwestie Babci (literal keys)
import { WORLD_W, WORLD_H } from '../config/constants'; // v0.112.0 — kaczka odbija sie od granic PLANSZY
import { AudioSys } from '../audio/AudioSys'; // F7b-3: tuk-tuk wystrzalow (precedens: Bullet.ts)
import { getBrawlerTextures } from '../rendering/SpriteFactory'; // F7b-4: kopia czolgu gracza

export type { ActivationResult } from '../config/powers';

/** v0.112: wizual wiru +20% (feedback Mariusza) — pull/crush w HOLE_CONFIG, to tylko wyglad. */
const HOLE_VISUAL_SCALE = 1.2;

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
    /** 3 sloty z GARAZU, rozwiazane pod scenariusz (resolveLoadoutForMatch w startGame). */
    public readonly loadout: readonly [PowerId, PowerId, PowerId];

    /** Date.now() timestamps gdy cooldown wygasa per moc (klucze z rejestru). */
    public powerCooldowns: Record<PowerId, number>;

    /**
     * v0.114.0: kostka 🎲 — toggle "Szalone Moce" w Garazu. Gdy ON, slot index 2
     * jest w MECZU kostka (wybor gracza z Garazu wraca po OFF). Kostka NIE jest
     * PowerId: aktywacja startuje ROLL (~1.3s animacji, ikony migaja), po ktorym
     * losowa moc z TIER3_POWERS (bez powtorki 2x z rzedu) odpala sie SAMA.
     * Wlasny cooldown (diceReadyAt), NIE wpis w powerCooldowns.
     */
    public readonly diceEnabled: boolean;
    /** Date.now() timestamp gdy kostka znow gotowa (liczony od TAPU, nie od reveal). */
    private diceReadyAt: number = 0;
    /** Ostatnio wylosowana moc — HUD/touch pokazuja jej emoji podczas cooldownu kostki. */
    public lastRolled: PowerId | null = null;
    /** Klatki pozostale animacji rolla (0 = brak rolla). */
    private diceRollFramesLeft: number = 0;
    /** Kontekst aktywacji zapamietany na czas rolla (referencje zyja caly mecz). */
    private diceCtx: Omit<PowerActivationCtx, 'system'> | null = null;

    /**
     * DESKTOP: slot wybrany scrollem — SPACJA/PPM odpala ten slot (feedback Mariusza:
     * scroll+PPM to pamiec miesniowa z legacy). Widoczny w HUD (strzalka), wiec NIE jest
     * ukrytym stanem — pasek HUD rysuje sie tylko na desktopie. Touch tego nie uzywa
     * (kazdy slot ma wlasny przycisk). Po kazdej aktywacji przeskakuje na uzyty slot.
     */
    public selectedSlot: 0 | 1 | 2 = 0;

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
    // v0.146.1 (feedback Mariusza — „myli sie z Aura"): 3 PALETKI z raczkami + kreskowana
    // granica + pileczka w srodku; ostatnia sekunda miga, koniec jest zdarzeniem.
    private pongGfx: PIXI.Graphics | null = null;
    private pongFramesLeft = 0;
    private pongPlayerX = 0;
    private pongPlayerY = 0;
    private pongSparkT = 0;
    private pongSparkIdx = 0;
    /** Ustawiana w `pongFinish`, zdejmowana przez `consumePongEnded` w petli gry. */
    private pongEnded = false;

    // ═══ TIER 3 SZALONE (v0.112.0) — art z Tier3Baker (baked Canvas 2D + transformy) ═══
    // KACZKA: sprite + cien na gruncie (2.5D — kaczka LECI, cien zostaje na ziemi).
    private duckSprite: PIXI.Sprite | null = null;
    private duckShadow: PIXI.Sprite | null = null;
    private duckX = 0; private duckY = 0;
    private duckVx = 0; private duckVy = 0;
    private duckLife = 0;
    private duckWob = 0;
    // v0.146.0: okresowe kwakanie zdjete — kaczka gra `duck.mp3` w petli, wiec licznik
    // kwakniec przestal byc do czegokolwiek potrzebny i zostal usuniety.
    private duckTurnT = 0;  // v3: skret 90 stopni co 2s (zygzak po mapie)
    // PACZKOMAT: szafa + blinkujacy LED + paczki w LUKU (kazda z wlasnym cieniem).
    private lockerC: PIXI.Container | null = null;
    private lockerLed: PIXI.Sprite | null = null;
    private lockerX = 0; private lockerY = 0;
    private lockerFramesLeft = 0;
    private lockerFireT = 0;
    private parcels: Array<{
        sp: PIXI.Sprite; sh: PIXI.Sprite;
        x0: number; y0: number; x1: number; y1: number; t: number;
    }> = [];
    // DISCO: kula nad graczem + 3 kolorowe swiatla na gruncie (rotacja kontenera).
    private discoBall: PIXI.Sprite | null = null;
    private discoLights: PIXI.Graphics | null = null;
    private discoFramesLeft = 0;
    private discoNoteT = 0;
    /** v2: kto tanczyl, bije 20% slabiej do konca meczu (WeakSet — zero wyciekow). */
    private readonly discoDancers = new WeakSet<Enemy>();
    // BABCIA: sprite przy graczu (bob transformem) + fear-point (wzorzec ghostTauntFor).
    private grannySprite: PIXI.Sprite | null = null;
    private grannyX = 0; private grannyY = 0;
    private grannyFramesLeft = 0;
    private grannyFearFade = 0; // v3: strach gasnie 2s po odejsciu babci (transition)
    private grannySayT = 0;
    private grannySayAlt = false;
    private readonly grannyFearPoint = { x: 0, y: 0 };
    /**
     * v0.146.0 — stan strachu per wrog: ZAPAMIETANY kierunek ucieczki + znacznik wygasniecia.
     * `WeakMap`, zeby martwy wrog nie trzymal wpisu przy zyciu (tablica `enemies` jest
     * przebudowywana co mecz, a wrogowie sa usuwani w trakcie).
     * Powod istnienia: patrz komentarz w `grannyFearFor` — bez tego kierunek przeliczany
     * co klatke przerzucal sie o 180 stopni na granicy promienia.
     */
    private grannyFear = new WeakMap<Enemy, { until: number; dx: number; dy: number }>();
    // MEGA BEKA: odrzut tikowany per wrog (decay), stun przez enemy.freeze.
    private burpPushes: Array<{ e: Enemy; kx: number; ky: number }> = [];
    /** v0.146.0 — strach po becie: ten sam mechanizm co babcia, wlasny znacznik czasu. */
    private burpFear = new WeakMap<Enemy, { until: number; dx: number; dy: number }>();
    /**
     * v0.146.1 — chmura „nieswiezego oddechu" jako KLEBY DYMU (pieczone sprity).
     * Kazdy kleb ma wlasny kierunek dryfu, obrot i opoznienie startu — chmura ROSNIE
     * i rozwiewa sie, zamiast byc zbiorem kolek zmieniajacych promien.
     */
    private burpCloud: {
        cont: PIXI.Container;
        puffs: Array<{ s: PIXI.Sprite; dx: number; dy: number; spin: number; size: number; delay: number }>;
        born: number;
        /** v0.146.3 — pozycja strefy razenia (chmura nie jedzie za graczem). */
        x: number;
        y: number;
        /** v0.146.3 — odliczanie do nastepnego ticku obrazen. */
        tick: number;
    } | null = null;

    private readonly worldContainer: PIXI.Container;
    /**
     * Spawn pocisku Wiezy — WYMAGANY w konstruktorze (przeglad F7b-2: wstrzykiwanie
     * po fakcie + `?.()` = cichy skip przy ponownym `new PowerSystem` w startGame;
     * wymagany parametr => pilnuje kompilator).
     */
    private readonly towerBulletSpawner: (x: number, y: number, angle: number) => void;

    constructor(
        worldContainer: PIXI.Container,
        loadout: readonly [PowerId, PowerId, PowerId],
        towerBulletSpawner: (x: number, y: number, angle: number) => void,
        aoeExplode: (x: number, y: number, radius: number, dmg: number, quiet?: boolean) => void,
        wallSpawner: (x: number, y: number) => (() => void) | null,
        // v0.114.0: slot 🎲 per mecz. WYMAGANY param (wzorzec towerBulletSpawner —
        // wstrzykiwanie po fakcie = cichy skip przy ponownym new; pilnuje kompilator).
        diceEnabled: boolean,
    ) {
        this.loadout = loadout;
        this.diceEnabled = diceEnabled;
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

    /** Moc w danym slocie (przy diceEnabled slot 2 gra jako kostka, nie ta moc). */
    getSlotPower(slot: 0 | 1 | 2): PowerId {
        return this.loadout[slot];
    }

    /** Liczba slotow w meczu — od v0.114.0 zawsze 3 (kostka podmienia slot 3, nie dodaje 4.). */
    get slotCount(): 3 {
        return 3;
    }

    /** Czy trwa animacja rolla kostki. */
    get diceRolling(): boolean {
        return this.diceRollFramesLeft > 0;
    }

    /** Scroll na desktopie: przesun wybor slotu (3 sloty). */
    cycleSlot(direction: number): void {
        const n = this.slotCount;
        this.selectedSlot = (((this.selectedSlot + direction) % n) + n) % n as 0 | 1 | 2;
    }

    /**
     * Czy moc jest gotowa do aktywacji? (cooldown minal + zaden efekt czasowy nie trwa —
     * blokada "jedna moc naraz" zostaje: dwa rownoczesne efekty to osobna decyzja balansowa.)
     */
    canActivate(id: PowerId): boolean {
        if (this.activePowerId !== null) return false;
        return Date.now() >= (this.powerCooldowns[id] ?? 0);
    }

    canActivateSlot(slot: 0 | 1 | 2): boolean {
        if (slot === 2 && this.diceEnabled) {
            // Kostka: ta sama blokada "jedna moc naraz" co canActivate + wlasny cooldown
            // (roll w toku = cooldown juz nabity, wiec nie trzeba osobnego warunku).
            return this.activePowerId === null && Date.now() >= this.diceReadyAt;
        }
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

    /** Cooldown progress per SLOT (petla HUD/touch nie zna id — slot 2 bywa kostka). */
    getSlotCooldownProgress(slot: 0 | 1 | 2): number {
        if (slot === 2 && this.diceEnabled) {
            if (this.diceRolling) return 0; // podczas rolla NIE pokazuj zegara — ikony migaja
            const remaining = this.diceReadyAt - Date.now();
            if (remaining <= 0) return 0;
            return Math.min(1, remaining / DICE_COOLDOWN_MS);
        }
        return this.getCooldownProgress(this.loadout[slot]);
    }

    /** Pozostale sekundy cooldownu per SLOT (0 = gotowy). */
    getSlotCooldownSecondsLeft(slot: 0 | 1 | 2): number {
        if (slot === 2 && this.diceEnabled) {
            if (this.diceRolling) return 0;
            return Math.max(0, (this.diceReadyAt - Date.now()) / 1000);
        }
        return this.getCooldownSecondsLeft(this.loadout[slot]);
    }

    /**
     * Ikona slotu kostki (HUD + touch, per-frame; wolajacy ma thrash-guard):
     * roll => ikony puli migaja (jednoreki bandyta), cooldown => wylosowana moc,
     * gotowa => 🎲.
     */
    getDiceIcon(): string {
        if (this.diceRolling) {
            const step = Math.floor((DICE_ROLL_FRAMES - this.diceRollFramesLeft) / 7);
            return POWERS[TIER3_POWERS[step % TIER3_POWERS.length]].emoji;
        }
        if (this.lastRolled && Date.now() < this.diceReadyAt) {
            return POWERS[this.lastRolled].emoji;
        }
        return DICE_EMOJI;
    }

    /** Wyzeruj cooldowny + aktywny efekt (tutorial / handoff do meczu — zamiast literalow w main.ts). */
    clearCooldowns(): void {
        for (const id of Object.keys(this.powerCooldowns) as PowerId[]) {
            this.powerCooldowns[id] = 0;
        }
        this.activePowerId = null;
        this.framesLeft = 0;
        this.diceReadyAt = 0;   // v0.114.0: handoff tutorial->mecz zeruje tez kostke
        this.lastRolled = null;
        this.diceRollFramesLeft = 0; // przerwany roll NIE odpala mocy
        this.diceCtx = null;
        this.auraHide();
        this.towerDespawn();  // F7b-2: handoff tutorial->mecz nie moze zostawic zywej wiezy
        this.rocketsClear();  // F7b-3: ...ani rakiet w locie / w kolejce startowej
        this.ghostDespawn();  // F7b-4: ...ani wabika (bez wybuchu — czysty teardown)
        this.minesClear();    // F7b-5: ...ani uzbrojonych min (bez detonacji)
        this.buildClear();    // F7b-6: ...ani muru (collidery MUSZA wyjsc z tablic!)
        this.tier2Clear();    // v0.111.0: ...ani nalotu/wiru/lasera/pongu
        this.tier3Clear();    // v0.112.0: ...ani kaczki/paczkomatu/disco/babci/beki
    }

    /**
     * Aktywacja mocy ze slotu — wykonuje definicje z rejestru.
     * Efekty/notif/audio robi PowerDef.onActivate; wraca tylko to, co musi przejsc
     * przez petle gry (cele mega bomby).
     */
    activate(slot: 0 | 1 | 2, ctx: Omit<PowerActivationCtx, 'system'>): ActivationResult {
        if (slot === 2 && this.diceEnabled) {
            // ── Kostka 🎲 (v0.114.0): tap startuje ROLL (~1.3s, ikony migaja przez
            // getDiceIcon), po ktorym wylosowana moc odpala sie SAMA (diceRollTick w
            // update). Cooldown kostki liczy sie OD TAPU. Bramka = tylko cooldown kostki
            // (fizzle wylosowanej mocy czytalby sie jak bug). Wylosowana moc dostanie
            // przy reveal TEZ wlasny cooldown — anty-exploit double-fire, gdy ta sama
            // moc siedzi w slocie 0/1 (odwrotnie NIE: equipped T3 nie dotyka kostki).
            if (!this.canActivateSlot(2)) {
                return { activated: false };
            }
            this.diceReadyAt = Date.now() + DICE_COOLDOWN_MS;
            this.diceRollFramesLeft = DICE_ROLL_FRAMES;
            this.diceCtx = ctx; // referencje (player/enemies/effects/audio/hud) zyja caly mecz
            console.log(`[PowerSystem] Dice roll started (${DICE_ROLL_FRAMES} frames)`);
            return { activated: true };
        }
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
     * v0.114.0: tick animacji rolla kostki. Po DICE_ROLL_FRAMES losuje moc z TIER3_POWERS
     * (bez powtorki 2x z rzedu) i odpala ja SAMA z zapamietanego kontekstu (pozycja gracza
     * = z chwili reveal, nie tapu). Notif "🎲 X!" tutaj — gracz widzi CO wypadlo (Czytelnosc).
     * update() biegnie tylko podczas PLAYING, wiec smierc/koniec meczu wstrzymuje reveal,
     * a clearCooldowns/teardown anuluja go calkowicie.
     */
    private diceRollTick(delta: number): void {
        if (this.diceRollFramesLeft <= 0) return;
        this.diceRollFramesLeft -= delta;
        if (this.diceRollFramesLeft > 0) return;
        this.diceRollFramesLeft = 0;
        const ctx = this.diceCtx;
        this.diceCtx = null;
        if (!ctx) return;
        const pool = TIER3_POWERS.filter(pid => pid !== this.lastRolled);
        const id = pool[Math.floor(Math.random() * pool.length)];
        this.lastRolled = id;
        const def = POWERS[id];
        console.log(`[PowerSystem] Dice rolled ${id}`);
        this.powerCooldowns[id] = Date.now() + def.cooldownMs;
        try {
            ctx.hud.addNotif(t('hud.diceRolled', { name: t(def.labelKey) }), '#f1c40f');
            def.onActivate({ ...ctx, system: this });
        } catch (e) {
            console.error(`[PowerSystem] Dice fire failed for ${id}:`, (e as Error).stack ?? e);
        }
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

        this.diceRollTick(delta); // v0.114.0: animacja rolla kostki -> auto-fire

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
        this.duckUpdate(delta, enemies, effects);
        this.lockerUpdate(delta, enemies, effects);
        this.discoUpdate(delta, player, enemies, effects);
        this.grannyUpdate(delta, player, enemies, effects);
        this.burpUpdate(delta, enemies, effects);

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
        // v0.146.0: PIERWSZA MINA LECI OD RAZU. Odometr startowal od zera, wiec trzeba
        // bylo najpierw przejechac 75 px — przy krotszym zapalniku (150) to zjadalo
        // znaczaca czesc okna. Builder robi dokladnie to samo od poczatku (buildOdo
        // = dropEveryPx), wiec to nie nowy wzorzec, tylko wyrownanie do niego.
        this.mineOdo = MINES_CONFIG.dropEveryPx;
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
        this.pongEnded = false;  // v0.146.1 — flaga nie moze przezyc teardownu (notif po smierci)
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
        this.holeC.scale.set(HOLE_VISUAL_SCALE, 0.72 * HOLE_VISUAL_SCALE);
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
            // Oddech calego leja (puls grawitacyjny) — scale.y zachowuje squash 2.5D;
            // HOLE_VISUAL_SCALE 1.2 = wir wiekszy o 20% (feedback Mariusza)
            const breathe = (1 + 0.04 * Math.sin(Date.now() / 160)) * HOLE_VISUAL_SCALE;
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

    /** Wirujace paletki — check pociskow robi main.ts (pongDeflects). */
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
            this.pongFinish(player, effects);
            return;
        }
        /*
         * v0.146.1 — WIZUAL PRZEBUDOWANY.
         *
         * Zgloszenie: „ta moc myli sie z Aura". Powod byl strukturalny, nie kosmetyczny:
         * oba efekty to byl GLADKI PULSUJACY PIERSCIEN na czolgu, w tym samym zlocie
         * (0xffdd00 vs 0xffe066 — 4 stopnie hue) i na tym samym zIndeksie 400. Zmiana
         * samego koloru by nie wystarczyla, bo oko czyta najpierw SYLWETKE.
         *
         * Dlatego Ping-Pong przestaje byc pierscieniem:
         *  - granica to KRESKOWANY okrag (12 krotkich lukow) — bariera, nie tarcza,
         *  - dominanta wizualna to 3 DUZE PALETKI z raczkami, obracajace sie po orbicie,
         *  - w srodku lata PILECZKA (odbija sie miedzy czolgiem a granica).
         * Promien jest STALY i rowny `deflectRadius` — Czytelnosc: wizual = hitbox.
         */
        const t = Date.now() / 110;
        const r = PONG_CONFIG.deflectRadius;
        // TELEGRAF KONCA: ostatnia sekunda miga szybko i przechodzi w jasny odcien.
        const ending = this.pongFramesLeft <= PONG_CONFIG.blinkFrames;
        const blink = ending ? (Math.sin(Date.now() / 45) > -0.2 ? 1 : 0.22) : 1;
        const mainCol = ending ? PONG_CONFIG.colorLight : PONG_CONFIG.color;
        const pulse = (0.62 + 0.28 * Math.sin(t)) * blink;
        g.x = player.x;
        g.y = player.y;
        g.clear();
        // GRANICA: kreskowany okrag (12 lukow), obrot zgodny z paletkami.
        g.lineStyle({ width: 5, color: mainCol, alpha: pulse, cap: PIXI.LINE_CAP.ROUND });
        for (let i = 0; i < 12; i++) {
            const a0 = t * 0.35 + (i / 12) * Math.PI * 2;
            g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
            g.arc(0, 0, r, a0, a0 + 0.26);
        }
        // PALETKI: blat (kolo) + raczka do srodka. To one niosa rozpoznanie mocy.
        const px: number[] = [], py: number[] = [];
        for (let i = 0; i < 3; i++) {
            const a = t * 0.9 + (i / 3) * Math.PI * 2;
            const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
            px.push(cx); py.push(cy);
            g.lineStyle({ width: 5, color: mainCol, alpha: pulse, cap: PIXI.LINE_CAP.ROUND });
            g.moveTo(cx * 0.72, cy * 0.72);           // raczka
            g.lineTo(cx * 0.96, cy * 0.96);
            g.lineStyle(2, PONG_CONFIG.colorLight, pulse);
            g.beginFill(mainCol, 0.85 * blink);       // blat paletki
            g.drawCircle(cx, cy, 11);
            g.endFill();
        }
        g.lineStyle(0);
        // PILECZKA: odbija sie w tam i z powrotem miedzy czolgiem a granica.
        const bounce = Math.abs(Math.sin(t * 1.7));
        const ba = -t * 1.25;
        g.beginFill(0xffffff, blink);
        g.drawCircle(Math.cos(ba) * r * (0.2 + 0.75 * bounce), Math.sin(ba) * r * (0.2 + 0.75 * bounce), 5);
        g.endFill();
        // ISKRY: smuga za kolejna paletka co ~12 klatek (pooled — dymek/energia orbit)
        this.pongSparkT -= delta;
        if (this.pongSparkT <= 0) {
            this.pongSparkT = 12;
            this.pongSparkIdx = (this.pongSparkIdx + 1) % 3;
            effects.spawnEnemyHitSparks(
                player.x + px[this.pongSparkIdx],
                player.y + py[this.pongSparkIdx],
                PONG_CONFIG.color,
            );
        }
    }

    /**
     * v0.146.1 — KONIEC PING-PONGA.
     *
     * Do v0.146.0 moc konczyla sie linijka `g.visible = false` — pierscien znikal
     * w jednej klatce, bez dzwieku i bez sladu. Gracz nie mial jak zauwazyc, ze wlasnie
     * przestal odbijac pociski (a to jest moment, w ktorym zaczyna obrywac).
     * Teraz koniec jest zdarzeniem: zapadajaca sie fala + iskry + wstrzas + dzwiek
     * (opadajaca wysokosc = „power down") + notyfikacja HUD, ktora zdejmuje `main.ts`.
     */
    private pongFinish(player: Player, effects: EffectsManager): void {
        const g = this.pongGfx;
        if (g) { g.visible = false; g.clear(); }
        effects.spawnShockwaveRing(player.x, player.y, PONG_CONFIG.deflectRadius * 1.5, PONG_CONFIG.color);
        effects.spawnEnemyHitSparks(player.x, player.y, PONG_CONFIG.color);
        effects.shake(3, 5);
        AudioSys.getInstance().playPongEnd();
        this.pongEnded = true;
    }

    /**
     * Flaga „Ping-Pong wlasnie wygasl", konsumowana raz przez petle gry.
     * PowerSystem nie zna HUD (notyfikacje robi `main.ts` / `onActivate` z kontekstu),
     * wiec komunikat idzie przez flage zamiast przez nowa zaleznosc.
     */
    consumePongEnded(): boolean {
        if (!this.pongEnded) return false;
        this.pongEnded = false;
        return true;
    }

    // ═══ TIER 3 SZALONE (v0.112.0, spec: sim v6 177-208/358-392/412-417) ═══
    // Art: baked Canvas 2D (Tier3Baker, gradienty) — w meczu TYLKO transformy.

    /** Teardown/handoff wszystkich mocy Tier 3 (bez efektow konca). */
    tier3Clear(): void {
        this.duckLife = 0;
        AudioSys.getInstance().stopDuckLoop();   // v0.146.0 — petla nie moze przezyc teardownu
        for (const d of [this.duckSprite, this.duckShadow]) {
            if (d) { if (d.parent) d.parent.removeChild(d); d.destroy(); }
        }
        this.duckSprite = null;
        this.duckShadow = null;
        this.lockerFramesLeft = 0;
        if (this.lockerC) {
            if (this.lockerC.parent) this.lockerC.parent.removeChild(this.lockerC);
            this.lockerC.destroy({ children: true });
            this.lockerC = null;
            this.lockerLed = null;
        }
        for (const p of this.parcels) {
            for (const d of [p.sp, p.sh]) { if (d.parent) d.parent.removeChild(d); d.destroy(); }
        }
        this.parcels = [];
        this.discoFramesLeft = 0;
        for (const d of [this.discoBall, this.discoLights]) {
            if (d) { if (d.parent) d.parent.removeChild(d); d.destroy(); }
        }
        this.discoBall = null;
        this.discoLights = null;
        this.grannyFramesLeft = 0;
        if (this.grannySprite) {
            if (this.grannySprite.parent) this.grannySprite.parent.removeChild(this.grannySprite);
            this.grannySprite.destroy();
            this.grannySprite = null;
        }
        this.burpPushes = [];
        this.burpClearCloud();   // v0.146.0 — chmura nie moze przezyc konca meczu
    }

    // ── GIGA KACZKA 🦆 ───────────────────────────────────────────────────────

    /** Kaczka wlatuje z boku gracza i szaleje po CALEJ planszy (odbicia od granic mapy). */
    duckLaunch(px: number, py: number): void {
        const fromLeft = Math.random() < 0.5;
        this.duckX = Math.max(DUCK_CONFIG.edgeMargin, Math.min(WORLD_W - DUCK_CONFIG.edgeMargin, px + (fromLeft ? -500 : 500)));
        this.duckY = Math.max(DUCK_CONFIG.edgeMargin, Math.min(WORLD_H - DUCK_CONFIG.edgeMargin, py));
        this.duckVx = (fromLeft ? 1 : -1) * DUCK_CONFIG.speedX;
        this.duckVy = (Math.random() < 0.5 ? 1 : -1) * DUCK_CONFIG.speedY;
        this.duckLife = DUCK_CONFIG.lifeFrames;
        this.duckWob = 0;
        this.duckTurnT = DUCK_CONFIG.turnEveryFrames;
        if (!this.duckSprite) {
            this.duckSprite = new PIXI.Sprite(bakeDuck());
            this.duckSprite.anchor.set(0.5, 0.62);
            this.duckSprite.zIndex = 1e6 - 1; // LECI nad polem (pod cieniem samolotow nalotu)
            this.worldContainer.addChild(this.duckSprite);
            this.duckShadow = new PIXI.Sprite(bakeSoftShadow());
            this.duckShadow.anchor.set(0.5);
            this.duckShadow.zIndex = 9;       // cien NA GRUNCIE (2.5D: wysokosc lotu)
            this.worldContainer.addChild(this.duckShadow);
        }
        this.duckSprite.visible = true;
        if (this.duckShadow) this.duckShadow.visible = true;
        AudioSys.getInstance().startDuckLoop();   // v0.146.0 — kwak leci przez caly lot
    }

    private duckUpdate(delta: number, enemies: Enemy[], effects: EffectsManager): void {
        if (this.duckLife <= 0) return;
        this.duckLife -= delta;
        const sp = this.duckSprite, sh = this.duckShadow;
        if (this.duckLife <= 0) {
            if (sp) sp.visible = false;
            if (sh) sh.visible = false;
            AudioSys.getInstance().stopDuckLoop();   // v0.146.0 — dzwiek milknie Z kaczka
            effects.spawnEnemyHitSparks(this.duckX, this.duckY, 0xffd93b); // "kwak…" puff
            return;
        }
        this.duckWob += DUCK_CONFIG.wobbleRate * delta;
        this.duckX += this.duckVx * delta;
        this.duckY += this.duckVy * delta;
        // v2: odbicia od GRANIC PLANSZY (WORLD_W/H) — kaczka patroluje cala mape
        const M = DUCK_CONFIG.edgeMargin;
        let bounced = false;
        if (this.duckX < M) { this.duckVx = Math.abs(this.duckVx); this.duckX = M; bounced = true; }
        if (this.duckX > WORLD_W - M) { this.duckVx = -Math.abs(this.duckVx); this.duckX = WORLD_W - M; bounced = true; }
        if (this.duckY < M) { this.duckVy = Math.abs(this.duckVy); this.duckY = M; bounced = true; }
        if (this.duckY > WORLD_H - M) { this.duckVy = -Math.abs(this.duckVy); this.duckY = WORLD_H - M; bounced = true; }
        if (bounced) effects.spawnEnemyHitSparks(this.duckX, this.duckY, 0xffd93b);
        // v0.146.0 — NAMIERZANIE NAJBLIZSZEGO WROGA (prosba z playtestu).
        // Do v0.145.0 lot byl calkowicie losowy. Skret jest CELOWO wolny (polowa tempa
        // rakiet): kaczka ma polowac, a nie byc pociskiem samonaprowadzajacym — przy
        // `crushDmg: 9999` szybkie naprowadzanie zamienia 7 s lotu w kasowanie mapy.
        // Modul predkosci zostaje staly, zmienia sie tylko kierunek.
        let target: Enemy | null = null;
        let bestD2 = DUCK_CONFIG.seekRange * DUCK_CONFIG.seekRange;
        for (const e of enemies) {
            if (!e.active) continue;
            const dx = e.x - this.duckX, dy = e.y - this.duckY;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; target = e; }
        }
        if (target) {
            const spd = Math.hypot(this.duckVx, this.duckVy);
            const ang = PowerSystem.lerpAngle(
                Math.atan2(this.duckVy, this.duckVx),
                Math.atan2(target.y - this.duckY, target.x - this.duckX),
                DUCK_CONFIG.steerLerpPerFrame * delta,
            );
            this.duckVx = Math.cos(ang) * spd;
            this.duckVy = Math.sin(ang) * spd;
            // Zygzak jest planem awaryjnym na PUSTA mape — z celem tylko przeszkadza.
            this.duckTurnT = DUCK_CONFIG.turnEveryFrames;
        }

        // v3: SKRET 90 stopni co 2s (zygzak — kaczka nie czeka na krawedz planszy);
        // losowo w lewo/prawo. Dziala tylko, gdy kaczka NIE ma celu (patrz wyzej).
        this.duckTurnT -= delta;
        if (this.duckTurnT <= 0) {
            this.duckTurnT = DUCK_CONFIG.turnEveryFrames;
            const vx = this.duckVx, vy = this.duckVy;
            if (Math.random() < 0.5) { this.duckVx = -vy; this.duckVy = vx; }  // 90 w lewo
            else { this.duckVx = vy; this.duckVy = -vx; }                       // 90 w prawo
            effects.spawnEnemyHitSparks(this.duckX, this.duckY, 0xffd93b);
            bounced = true; // skret = tez kwak (nizej)
        }
        // v0.146.0 — OKRESOWE KWAKANIE USUNIETE. Kaczka gra teraz `duck.mp3` W PETLI
        // przez caly lot (start w `duckLaunch`, stop przy znikniecu), wiec dokladanie
        // kwaku co 0.83 s i przy kazdym odbiciu robilo kakofonie na tej samej probce.
        void bounced; // iskry przy odbiciu/skrecie zostaja — tylko dzwiek zszedl
        // Miazga na kontakcie: grunt insta (quiet=false => eksplozja per kill = spektakl),
        // boss dostaje ulamek (bossfight zostaje bossfightem).
        for (const e of enemies) {
            if (!e.active) continue;
            const dx = e.x - this.duckX, dy = e.y - this.duckY;
            if (dx * dx + dy * dy < DUCK_CONFIG.crushRadius * DUCK_CONFIG.crushRadius) {
                const dmg = (e.isBoss || e.isMegaBoss)
                    ? DUCK_CONFIG.crushDmg * DUCK_CONFIG.bossDmgMult
                    : DUCK_CONFIG.crushDmg;
                this.aoeExplode(e.x, e.y, 10, dmg);
            }
        }
        // Transformy: pozycja + machanie (rotacja sinusem) + flip wg kierunku +
        // podskok lotu (sprite buja sie NAD cieniem = 2.5D).
        if (sp) {
            const hop = Math.sin(this.duckWob * 1.7) * 7;
            sp.x = this.duckX;
            sp.y = this.duckY - 26 + hop;
            sp.rotation = Math.sin(this.duckWob) * 0.14;
            sp.scale.x = this.duckVx >= 0 ? 1 : -1; // dziob zawsze w strone lotu
        }
        if (sh) {
            sh.x = this.duckX;
            sh.y = this.duckY + 24;
            const hopN = (Math.sin(this.duckWob * 1.7) + 1) / 2;
            sh.scale.set(0.9 - 0.12 * hopN);       // cien oddycha z wysokoscia lotu
            sh.alpha = 0.8 - 0.25 * hopN;
        }
    }

    // ── PACZKOMAT 📦 ─────────────────────────────────────────────────────────

    /** Szafa 120px przed lufa; przez 8s mozdzierzuje paczki LUKIEM w losowych wrogow. */
    lockerSpawn(px: number, py: number, aimAngle: number): void {
        this.lockerX = px + Math.cos(aimAngle) * LOCKER_CONFIG.spawnDist;
        this.lockerY = py + Math.sin(aimAngle) * LOCKER_CONFIG.spawnDist;
        this.lockerFramesLeft = LOCKER_CONFIG.durationFrames;
        this.lockerFireT = 24; // pierwsza paczka po 0.4s (sim 1:1)
        if (!this.lockerC) {
            const c = new PIXI.Container();
            const shadow = new PIXI.Sprite(bakeSoftShadow());
            shadow.anchor.set(0.5);
            shadow.y = 58;
            shadow.scale.set(1.1, 0.75);
            c.addChild(shadow);
            const body = new PIXI.Sprite(bakeLocker());
            body.anchor.set(0.5);
            c.addChild(body);
            const led = new PIXI.Sprite(bakeLockerLed());
            led.anchor.set(0.5);
            led.y = 44;
            c.addChild(led);
            this.lockerLed = led;
            this.worldContainer.addChild(c);
            this.lockerC = c;
        }
        this.lockerC.visible = true;
        this.lockerC.x = this.lockerX;
        this.lockerC.y = this.lockerY;
        this.lockerC.zIndex = this.lockerY + 58; // Y-sort po podstawie szafy
        this.lockerC.scale.set(0.1);             // scale-in "dostawy" (jak mur)
    }

    private lockerUpdate(delta: number, enemies: Enemy[], effects: EffectsManager): void {
        // Paczki w locie zyja NIEZALEZNIE od szafy (szafa moze zniknac w trakcie lotu).
        for (let i = this.parcels.length - 1; i >= 0; i--) {
            const p = this.parcels[i];
            p.t += delta / LOCKER_CONFIG.parcelFlightFrames;
            if (p.t >= 1) {
                for (const d of [p.sp, p.sh]) { if (d.parent) d.parent.removeChild(d); d.destroy(); }
                this.parcels.splice(i, 1);
                AudioSys.getInstance().playRocketBoom();
                effects.spawnShockwaveRing(p.x1, p.y1, LOCKER_CONFIG.blastRadius);
                this.aoeExplode(p.x1, p.y1, LOCKER_CONFIG.blastRadius, LOCKER_CONFIG.blastDmg);
                continue;
            }
            // Pozycja XY liniowo + LUK w pionie (parabola sinusem) — cien zostaje na
            // trajektorii GRUNTU i zbiega do celu: czytelny telegraf "tu spadnie".
            const x = p.x0 + (p.x1 - p.x0) * p.t;
            const y = p.y0 + (p.y1 - p.y0) * p.t;
            const arc = Math.sin(p.t * Math.PI) * LOCKER_CONFIG.arcHeight;
            p.sp.x = x;
            p.sp.y = y - arc;
            p.sp.rotation += 0.11 * delta; // paczka koziolkuje
            p.sp.zIndex = 1e6 - 2;
            p.sh.x = x;
            p.sh.y = y;
            const hN = arc / LOCKER_CONFIG.arcHeight;
            p.sh.scale.set(0.45 - 0.2 * hN);
            p.sh.alpha = 0.7 - 0.4 * hN;
        }

        if (this.lockerFramesLeft <= 0) return;
        this.lockerFramesLeft -= delta;
        const c = this.lockerC;
        if (this.lockerFramesLeft <= 0) {
            if (c) c.visible = false;
            effects.spawnEnemyHitSparks(this.lockerX, this.lockerY, 0x8899aa); // puff demontazu
            return;
        }
        if (c) {
            if (c.scale.x < 1) c.scale.set(Math.min(1, c.scale.x + 0.09 * delta)); // scale-in
            if (this.lockerLed) this.lockerLed.alpha = 0.4 + 0.6 * (Math.sin(Date.now() / 160) + 1) / 2;
        }
        // Mozdzierz: co 0.7s paczka w LOSOWEGO wroga w zasiegu (sim 1:1 — chaos dostaw)
        this.lockerFireT -= delta;
        if (this.lockerFireT <= 0) {
            this.lockerFireT = LOCKER_CONFIG.fireEveryFrames;
            const inRange = enemies.filter(e => {
                if (!e.active) return false;
                const dx = e.x - this.lockerX, dy = e.y - this.lockerY;
                return dx * dx + dy * dy < LOCKER_CONFIG.range * LOCKER_CONFIG.range;
            });
            if (inRange.length > 0) {
                const tgt = inRange[Math.floor(Math.random() * inRange.length)];
                const sp = new PIXI.Sprite(bakeParcel());
                sp.anchor.set(0.5);
                const sh = new PIXI.Sprite(bakeSoftShadow());
                sh.anchor.set(0.5);
                sh.zIndex = 9;
                this.worldContainer.addChild(sh);
                this.worldContainer.addChild(sp);
                this.parcels.push({ sp, sh, x0: this.lockerX, y0: this.lockerY - 64, x1: tgt.x, y1: tgt.y, t: 0 });
                AudioSys.getInstance().playWallThunk(); // thoomp mozdzierza (reuse — pasuje 1:1)
                effects.spawnMuzzleFlash(this.lockerX, this.lockerY - 64, -Math.PI / 2);
            }
        }
    }

    // ── DISCO SZAŁ 🪩 ────────────────────────────────────────────────────────

    /** 6s: wrogowie wiruja i nie walcza (petla wrogow w main.ts pyta discoActive). */
    discoActivate(): void {
        this.discoFramesLeft = DISCO_CONFIG.durationFrames;
        this.discoNoteT = 0;
        AudioSys.getInstance().playDiscoGroove(); // v2: groove 6s W TLE (syntezowany)
        if (!this.discoBall) {
            this.discoBall = new PIXI.Sprite(bakeDiscoBall());
            this.discoBall.anchor.set(0.5);
            this.discoBall.zIndex = 1e6 - 3;
            this.worldContainer.addChild(this.discoBall);
            // 3 kolorowe plamy swiatla na gruncie — rysowane RAZ, wiruja kontenerem
            const lights = new PIXI.Graphics();
            const cols = [0xff7ce0, 0x7ef0f7, 0xffe066];
            for (let i = 0; i < 3; i++) {
                const a = (i / 3) * Math.PI * 2;
                lights.beginFill(cols[i], 0.16);
                lights.drawEllipse(Math.cos(a) * 90, Math.sin(a) * 90 * 0.6, 55, 33);
                lights.endFill();
            }
            lights.zIndex = 9;
            this.worldContainer.addChild(lights);
            this.discoLights = lights;
        }
        this.discoBall.visible = true;
        if (this.discoLights) this.discoLights.visible = true;
    }

    /** Czy trwa DISCO? (main.ts: wrogowie wiruja zamiast update — tancza, nie walcza). */
    get discoActive(): boolean {
        return this.discoFramesLeft > 0;
    }

    /** v2: kto tanczyl, bije 20% slabiej DO KONCA MECZU (main.ts skaluje dmg). */
    isDiscoTired(enemy: Enemy): boolean {
        return this.discoDancers.has(enemy);
    }

    private discoUpdate(delta: number, player: Player, enemies: Enemy[], effects: EffectsManager): void {
        if (this.discoFramesLeft <= 0) return;
        this.discoFramesLeft -= delta;
        const ball = this.discoBall, lights = this.discoLights;
        if (this.discoFramesLeft <= 0) {
            if (ball) ball.visible = false;
            if (lights) lights.visible = false;
            return;
        }
        if (ball) {
            ball.x = player.x;
            ball.y = player.y - 96 + Math.sin(Date.now() / 300) * 5; // kula wisi i buja sie
            ball.rotation += 0.02 * delta;
        }
        if (lights) {
            lights.x = player.x;
            lights.y = player.y;
            lights.rotation += 0.035 * delta; // karuzela swiatel wokol parkietu
        }
        // v2: kazdy obecny na parkiecie = zmeczony do konca meczu (WeakSet, -20% dmg)
        for (const e of enemies) {
            if (e.active) this.discoDancers.add(e);
        }
        // ♪ nad losowym tancerzem — PIXI.Text jest drogi => twardy throttle (sim spamowal)
        this.discoNoteT -= delta;
        if (this.discoNoteT <= 0) {
            this.discoNoteT = DISCO_CONFIG.noteEveryFrames;
            const alive = enemies.filter(e => e.active);
            if (alive.length > 0) {
                const e = alive[Math.floor(Math.random() * alive.length)];
                effects.spawnFloatingText(e.x, e.y - 26, '♪', 0xff7ce0);
            }
        }
    }

    // ── BABCIA 👵 ────────────────────────────────────────────────────────────

    /** Babcia drepcze przy graczu 5s: leczy zupa, wrogowie w strachu UCIEKAJA. */
    grannySpawn(player: Player): void {
        this.grannyX = player.x + GRANNY_CONFIG.sideOffset;
        this.grannyY = player.y;
        this.grannyFramesLeft = GRANNY_CONFIG.durationFrames;
        this.grannyFearFade = 0;
        this.grannySayT = 0;
        if (!this.grannySprite) {
            this.grannySprite = new PIXI.Sprite(bakeGranny());
            this.grannySprite.anchor.set(0.5, 0.78); // kotwica przy stopach (Y-sort)
            this.worldContainer.addChild(this.grannySprite);
        }
        this.grannySprite.visible = true;
    }

    /**
     * Fear-point dla AI wroga (wzorzec ghostTauntFor — INIEKCJA wspolrzednych):
     * wrog w promieniu strachu dostaje cel PO PRZECIWNEJ stronie => UCIEKA.
     * Zwracany obiekt REUZYWANY — czytaj natychmiast.
     */
    grannyFearFor(enemy: Enemy): { x: number; y: number } | null {
        // ══ v0.146.0 — STRACH JAKO STAN, NIE JAKO TEST ODLEGLOSCI ══
        //
        // Zgloszenie z playtestu: „wrogowie sie zacinaja, migocza kierunkami — jakby
        // obracali sie wokol wlasnego srodka".
        //
        // PRZYCZYNA. Do v0.145.0 ta funkcja byla BINARNYM PRZELACZNIKIEM na dokladnie
        // `fearRadius`, przeliczanym co klatke, BEZ HISTEREZY:
        //   - w promieniu: cel = punkt 600 px OD BABCI  -> kat ~theta
        //   - poza:        cel = gracz, a gracz stoi 44 px od babci (`sideOffset`)
        //                                                -> kat ~theta + PI
        // Wrog na granicy dostawal wiec obrot o ~180 STOPNI CO KLATKE, a rotacja jest
        // ustawiana natychmiastowo, bez wygladzania (Enemy.ts, `applyBakedAngle` na 36
        // zapieczonych katach). Do tego rotacja jest ustawiana TAKZE gdy wrog stoi
        // (ruch ma prog MIN_DIST_TO_PLAYER = 60, obrot nie ma zadnego) — stad wrazenie
        // krecenia sie w miejscu. Trzeci skladnik: przy malym dystansie od babci kierunek
        // ucieczki jest matematycznie niestabilny (dTheta ~ przesuniecie / d).
        //
        // LEKARSTWO. Kierunek ucieczki zapamietujemy RAZ, przy wejsciu w strach, i trzymamy
        // go przez `fearFadeFrames`. Znika przerzut o 180 stopni, znika osobliwosc przy
        // malym d, a wygasanie wpisu daje naturalna histereze: wrog nie wraca na gracza
        // w tej samej klatce, w ktorej przekroczy granice.
        const active = this.grannyFramesLeft > 0 || this.grannyFearFade > 0;
        const now = Date.now();
        let st = this.grannyFear.get(enemy);

        if (active) {
            const dx = enemy.x - this.grannyX;
            const dy = enemy.y - this.grannyY;
            const d2 = dx * dx + dy * dy;
            if (d2 <= GRANNY_CONFIG.fearRadius * GRANNY_CONFIG.fearRadius && d2 >= 1) {
                const d = Math.sqrt(d2);
                // Kierunek zapisujemy tylko przy WEJSCIU w strach; potem juz nie drga.
                if (!st || st.until <= now) {
                    st = { until: 0, dx: dx / d, dy: dy / d };
                    this.grannyFear.set(enemy, st);
                }
                st.until = now + (GRANNY_CONFIG.fearFadeFrames / 60) * 1000;
            }
        }

        if (!st || st.until <= now) {
            if (st) this.grannyFear.delete(enemy);
            return null;
        }
        // Cel = punkt daleko przed wrogiem, na ZAPAMIETANEJ osi ucieczki.
        this.grannyFearPoint.x = enemy.x + st.dx * 600;
        this.grannyFearPoint.y = enemy.y + st.dy * 600;
        return this.grannyFearPoint;
    }

    private grannyUpdate(delta: number, player: Player, enemies: Enemy[], effects: EffectsManager): void {
        // v3: faza FADE — babcia juz poszla, ale strach jeszcze dziala (gasnacy boost).
        if (this.grannyFramesLeft <= 0) {
            if (this.grannyFearFade > 0) {
                this.grannyFearFade -= delta;
                const fadeN = Math.max(0, this.grannyFearFade / GRANNY_CONFIG.fearFadeFrames);
                this.grannyFearPush(enemies, fadeN, delta);
            }
            return;
        }
        this.grannyFramesLeft -= delta;
        const sp = this.grannySprite;
        if (this.grannyFramesLeft <= 0) {
            if (sp) sp.visible = false;
            this.grannyFearFade = GRANNY_CONFIG.fearFadeFrames; // v3: transition startuje
            effects.spawnEnemyHitSparks(this.grannyX, this.grannyY, 0xe8a0bf); // pozegnalny puff
            return;
        }
        // v2 (playtest Mariusza): uciekajacy dostaja EKSTRA odrzut ponad wlasny naped —
        // musza byc SZYBSI od gracza (taran w plecy uciekiniera = niechciana strata HP).
        this.grannyFearPush(enemies, 1, delta);
        // Drepcze do boku gracza (sim 1:1) + energiczny bob (DRAMATYCZNIE, nie subtelnie)
        this.grannyX += (player.x + GRANNY_CONFIG.sideOffset - this.grannyX) * GRANNY_CONFIG.followLerpPerFrame * delta;
        this.grannyY += (player.y - this.grannyY) * GRANNY_CONFIG.followLerpPerFrame * delta;
        if (sp) {
            const bob = Math.sin(Date.now() / 130);
            sp.x = this.grannyX;
            sp.y = this.grannyY + bob * 3;
            sp.rotation = bob * 0.06;
            sp.zIndex = this.grannyY + 28;
        }
        // Zupa leczy: % maxHp/s skalowane delta (wzorzec Naprawy — FPS-independent)
        player.hp = Math.min(player.maxHp, player.hp + (player.maxHp * GRANNY_CONFIG.healPerSecPct / 60) * delta);
        // "A SIO!" / "ZUPA! 🍲" + rozowe iskierki milosci
        this.grannySayT -= delta;
        if (this.grannySayT <= 0) {
            this.grannySayT = GRANNY_CONFIG.sayEveryFrames;
            this.grannySayAlt = !this.grannySayAlt;
            effects.spawnFloatingText(
                this.grannyX, this.grannyY - 64,
                t(this.grannySayAlt ? 'hud.grannySay1' : 'hud.grannySay2'), 0xe8a0bf,
            );
            effects.spawnGrannyHearts(this.grannyX, this.grannyY - 20); // v2: DUZE serduszka
        }
    }

    /** Odrzut strachu (wspolny dla fazy aktywnej i fade; strength 0..1 skaluje sile). */
    private grannyFearPush(enemies: Enemy[], strength: number, delta: number): void {
        const fr2 = GRANNY_CONFIG.fearRadius * GRANNY_CONFIG.fearRadius;
        for (const e of enemies) {
            if (!e.active) continue;
            const dx = e.x - this.grannyX, dy = e.y - this.grannyY;
            const d2 = dx * dx + dy * dy;
            if (d2 > fr2 || d2 < 1) continue;
            const d = Math.sqrt(d2);
            const boost = GRANNY_CONFIG.fearBoostPerFrame * (1 - d / GRANNY_CONFIG.fearRadius) * strength * delta;
            e.x += (dx / d) * boost;
            e.y += (dy / d) * boost;
        }
    }

    // ── MEGA BEKA 📢 ─────────────────────────────────────────────────────────

    /**
     * Instant: 4 fale + odrzut wszystkich wrogow w 320px + stun 1s (freeze reuse).
     *
     * v0.146.0 (playtest): dochodza OBRAZENIA, STRACH 2 s i CHMURA. Do v0.145.0 bek byl
     * czystym odrzutem — robil wrazenie, ale nic nie kosztowal przeciwnika.
     */
    burpBlast(px: number, py: number, enemies: Enemy[]): void {
        const now = Date.now();
        for (const e of enemies) {
            if (!e.active) continue;
            const dx = e.x - px, dy = e.y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 > BURP_CONFIG.knockRadius * BURP_CONFIG.knockRadius || d2 < 1) continue;
            const d = Math.sqrt(d2);
            const f = (1 - d / BURP_CONFIG.knockRadius) * BURP_CONFIG.knockScale + BURP_CONFIG.knockBase;
            this.burpPushes.push({ e, kx: (dx / d) * f, ky: (dy / d) * f });
            e.freeze(now + BURP_CONFIG.stunMs); // stun (mechanicznie = krotki mroz)
            // Strach: kierunek zapamietany RAZ — ta sama zasada co przy babci, z tego
            // samego powodu (przeliczanie co klatke daje migotanie kierunku).
            this.burpFear.set(e, { until: now + BURP_CONFIG.fearMs, dx: dx / d, dy: dy / d });
        }
        // Jedna eksplozja obszarowa zamiast pętli po wrogach — `aoeExplode` sam znajduje
        // cele w promieniu (ten sam kill-path co miny i rakiety).
        this.aoeExplode(px, py, BURP_CONFIG.knockRadius, BURP_CONFIG.blastDmg, true);
        this.burpSpawnCloud(px, py);
    }

    /**
     * v0.146.0 — CHMURA „NIESWIEZEGO ODDECHU".
     *
     * `zIndex = 9` to kanoniczna w tym projekcie warstwa „decal gruntu POD wszystkim
     * Y-sortowanym" (dokladnie ta sama, co krater po nalocie). Wszystko, co ma
     * `y + offset` — gracz (y+19), wrogowie (y+19), budynki (y+h), rosliny (floor(py)) —
     * rysuje sie NAD nia. Prosba brzmiala „dym pod obiektami typu domy, drzewa".
     *
     * v0.146.1 — KLEBY zamiast plaskich kolek. `drawCircle` z jednolitym wypelnieniem
     * czyta sie jak strefa mechaniki (tak wygladaja pady i zasiegi), nie jak gaz: gaz
     * potrzebuje miekkiej krawedzi, a tej Graphics tanio nie zrobi. Dlatego jedna
     * pieczona tekstura (`bakeSmokePuff`, biala) tintowana na zielono i uzyta jako 11
     * spritow — kazdy z wlasnym dryfem, obrotem i opoznieniem startu.
     *
     * Rozklad jest STALY (bez `Math.random`) z dwoch powodow: chmura nie migocze miedzy
     * klatkami, a wyglad jest powtarzalny w playtescie. Zero screen-blendu, zero
     * gradientu per klatka — w meczu lecą wylacznie transformy.
     */
    private burpSpawnCloud(px: number, py: number): void {
        this.burpClearCloud();
        const cont = new PIXI.Container();
        cont.zIndex = 9;
        cont.x = px;
        cont.y = py;
        const tex = bakeSmokePuff();
        // [kat w obrotach, dystans 0-1, rozmiar 0-1, opoznienie 0-1]
        // Dystanse celowo NIEROWNE — przy rownych kleby ustawiaja sie w gwiazdke
        // (sprawdzone na podgladzie), a chmura ma byc nieregularna.
        const LAYOUT: ReadonlyArray<readonly [number, number, number, number]> = [
            [0.00, 0.00, 1.00, 0.00], [0.07, 0.46, 0.82, 0.03], [0.17, 0.66, 0.60, 0.12],
            [0.26, 0.30, 0.74, 0.01], [0.36, 0.58, 0.86, 0.06], [0.47, 0.72, 0.56, 0.14],
            [0.54, 0.36, 0.70, 0.02], [0.63, 0.62, 0.80, 0.09], [0.72, 0.28, 0.62, 0.04],
            [0.81, 0.68, 0.76, 0.11], [0.92, 0.44, 0.88, 0.05],
        ];
        const puffs: Array<{ s: PIXI.Sprite; dx: number; dy: number; spin: number; size: number; delay: number }> = [];
        for (let i = 0; i < LAYOUT.length; i++) {
            const [turn, dist, size, delay] = LAYOUT[i];
            const a = turn * Math.PI * 2;
            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5);
            s.tint = BURP_CONFIG.cloudColor;
            s.rotation = a;
            s.alpha = 0;                 // stan startowy — pierwszy `burpUpdate` go nadpisze
            s.scale.set(0.01);
            cont.addChild(s);
            // Naprzemienny kierunek obrotu — chmura „mieli sie" zamiast wirowac w calosci.
            puffs.push({ s, dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, spin: (i % 2 ? 0.006 : -0.005), size, delay });
        }
        this.worldContainer.addChild(cont);
        this.burpCloud = { cont, puffs, born: Date.now(), x: px, y: py, tick: BURP_CONFIG.cloudTickFrames };
    }

    private burpClearCloud(): void {
        const c = this.burpCloud;
        if (!c) return;
        if (c.cont.parent) c.cont.parent.removeChild(c.cont);
        c.cont.destroy({ children: true }); // tekstura zostaje w cache Tier3Bakera
        this.burpCloud = null;
    }

    /**
     * Fear-point po becie — wpinany w ten sam lancuch co babcia (main.ts).
     * Kierunek jest ZAPAMIETANY, wiec wrog jedzie rownym torem zamiast drgac.
     */
    burpFearFor(enemy: Enemy): { x: number; y: number } | null {
        const st = this.burpFear.get(enemy);
        if (!st) return null;
        if (st.until <= Date.now()) { this.burpFear.delete(enemy); return null; }
        this.grannyFearPoint.x = enemy.x + st.dx * 600;
        this.grannyFearPoint.y = enemy.y + st.dy * 600;
        return this.grannyFearPoint;
    }

    /**
     * v0.146.3 — TICK OBRAZEN CHMURY (tylko wrogowie).
     *
     * Strefa jest ELIPSA dopasowana do narysowanego gazu (patrz BURP_CONFIG.cloudHitX/Y):
     * kleby sa splaszczone i dryfuja w pionie krocej niz w poziomie, wiec kolo klamaloby
     * o zasiegu. Test elipsy robie tutaj, a aoeExplode wolam per wrog z promieniem 2 —
     * dokladnie tak, jak robi to tick Lasera. Dzieki temu obrazenia ida PELNYM kill-pathem
     * (registerKill, punkty, dropy, multi-kill, victory), a nie skrotem obok niego.
     */
    private burpCloudDamage(
        c: NonNullable<PowerSystem['burpCloud']>,
        gone: number,
        delta: number,
        enemies: Enemy[],
        effects: EffectsManager,
    ): void {
        if (gone < BURP_CONFIG.cloudDmgMinAlpha) return;   // gaz juz niewidoczny = nie razi
        c.tick -= delta;
        if (c.tick > 0) return;
        c.tick = BURP_CONFIG.cloudTickFrames;
        const ax = BURP_CONFIG.cloudHitX, ay = BURP_CONFIG.cloudHitY;
        for (const e of enemies) {
            if (!e.active) continue;
            const nx = (e.x - c.x) / ax, ny = (e.y - c.y) / ay;
            if (nx * nx + ny * ny > 1) continue;
            // Sensoryka: kazdy tick musi byc WIDOCZNY na wrogu, nie tylko na pasku HP.
            effects.spawnEnemyHitSparks(e.x, e.y, BURP_CONFIG.cloudColor);
            this.aoeExplode(e.x, e.y, 2, BURP_CONFIG.cloudTickDmg, true);
        }
    }

    /** Fale wizualne robi main.ts przy aktywacji? NIE — tu, przez effects w update 1. klatki:
     *  prosciej: pchniecia tikuja z decayem az zgasna (sim: kx -= kx*5*dt). */
    private burpUpdate(delta: number, enemies: Enemy[], effects: EffectsManager): void {
        // v0.146.2 — animacja chmury w trzech fazach (patrz BURP_CONFIG): rozrost ->
        // stanie w pelnej sile -> rozwianie. Same transformy sprita, zero rysowania.
        const c = this.burpCloud;
        if (c) {
            const age = Date.now() - c.born;
            if (age >= BURP_CONFIG.cloudMs) {
                this.burpClearCloud();
            } else {
                const MAX_SCALE = (BURP_CONFIG.cloudRadius * 0.95) / 128; // 128 = bok pieczonej tekstury
                const DRIFT = BURP_CONFIG.cloudRadius * 0.52;
                // Rozwianie startuje dopiero `cloudFadeMs` przed koncem — do tej chwili
                // chmura stoi na pelnym kryciu (wczesniej gasla juz od pierwszej klatki).
                const holdMs = BURP_CONFIG.cloudMs - BURP_CONFIG.cloudFadeMs;
                let gone = 1;
                if (age > holdMs) {
                    const f = (age - holdMs) / BURP_CONFIG.cloudFadeMs;
                    gone = (1 - f) * (1 - f);                              // easeInQuad — zanik lagodny
                }
                // Rozrost ma WLASNY, krotki zegar. Przy 5 s zycia wspolny zegar sprawilby,
                // ze kleby pelzna przez pol mocy zamiast buchnac od razu.
                const te = Math.min(1, age / BURP_CONFIG.cloudExpandMs);
                // Po rozroscie chmura dalej leniwie sie rozlazi (+8% do konca zycia).
                const creep = 1 + 0.08 * (age / BURP_CONFIG.cloudMs);
                for (const p of c.puffs) {
                    const tt = Math.min(1, Math.max(0, (te - p.delay) / (1 - p.delay)));
                    const ease = 1 - (1 - tt) * (1 - tt);                  // easeOutQuad
                    const sc = MAX_SCALE * p.size * (0.30 + 0.70 * ease) * creep;
                    p.s.scale.set(sc, sc * 0.78);                          // splaszczenie = widok z gory
                    p.s.x = p.dx * DRIFT * ease * creep;
                    p.s.y = p.dy * DRIFT * 0.72 * ease * creep;
                    p.s.rotation += p.spin * delta;
                    p.s.alpha = BURP_CONFIG.cloudAlpha * Math.min(1, tt / 0.12) * gone;
                }
                this.burpCloudDamage(c, gone, delta, enemies, effects);
            }
        }

        if (this.burpPushes.length === 0) return;
        for (let i = this.burpPushes.length - 1; i >= 0; i--) {
            const p = this.burpPushes[i];
            if (!p.e.active) { this.burpPushes.splice(i, 1); continue; }
            p.e.x += p.kx * delta;
            p.e.y += p.ky * delta;
            const decay = Math.pow(BURP_CONFIG.knockDecay, delta);
            p.kx *= decay;
            p.ky *= decay;
            if (Math.abs(p.kx) < 0.15 && Math.abs(p.ky) < 0.15) this.burpPushes.splice(i, 1);
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

export type { LoadoutTriple };
