import * as PIXI from 'pixi.js';
import { sigmaEmit } from '../testing/sigmaFlag';
import type { Brawler } from '../types/Brawler';
import { getBrawlerTextures, PROGRAMMATIC_BRAWLER_CONFIG, TANK_CANVAS_SCALE, BAKER_ENABLED } from '../rendering/SpriteFactory';
import { TankSpriteBaker } from '../rendering/TankSpriteBaker';
import { isTankArtV2 } from '../config/tankArtFlag'; // TANK ART v2
import { hpColorHex } from '../rendering/hpColor'; // v0.187.0 — ten sam kolor co pigulka HP w HUD
import { heartbeat } from '../rendering/heartbeat'; // v0.187.0 — rytm tetna wspolny z HUD
import type { DamageSmoke } from '../rendering/DamageSmoke'; // v0.188.0 — dym uszkodzenia (poza pula czasteczek)
import { checkRectCollision } from '../systems/Physics';
import { DASH_CONFIG } from '../config/balanceRules'; // BALANCE_V2 S3 — dash Shadowa (kroki, nie ms)
import type { EffectsManager } from '../rendering/Effects';
import type { ICollidable } from '../types/MapType';
import type { DamageSource } from '../types/DamageSource'; // Z0.5

// FAZA 7c: profile flag override via FLAGS config (data-driven)
import { FLAGS, type FlagConfig } from '../config/flags';
import type { FlagId } from '../types/Profile';

interface KeysState { w: boolean; a: boolean; s: boolean; d: boolean; }

/**
 * Okno super strzalu. EKSPORTOWANE od v0.200.0 (BALANCE_V2 S4): `main.ts` liczy z niego sprawiedliwy
 * dmg supera (`(okno / reload) x dmg_salwy = stala`). Skopiowana liczba rozjechalaby sie przy
 * pierwszym tuningu — jedno zrodlo prawdy.
 */
export const SUPER_SHOT_DURATION_MS = 5000;
const SUPER_MAX_CHARGES = 9;
const SUPER_TINT = 0xc850ff;
// SKIN-2: reduced-motion gasi sin pulsu skina (stale alpha) — odczyt raz na load.
const SKIN_PULSE_REDUCED = ((): boolean => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
})();

// TANK ART v2 — faza gasienic: przelaczana co TREAD_PHASE_FRAMES klatek TYLKO w ruchu (8 Hz @60fps;
// szybciej = migot, niezaleznie od predkosci), w spoczynku trzyma faze. Licznik klatek, nie zegar.
const TREAD_PHASE_FRAMES = 7;
// TANK ART v2 — blysk lufy: sprite ADD z TA SAMA tekstura co wieza (0 VRAM), alpha gasnie w BARREL_FLASH_FRAMES.
const BARREL_FLASH_FRAMES = 4;

// FAZA P1 Sprite Baker — display scale gracza w trybie bake (2.5D). 1.25 = +25% vs wrogowie.
// Flaga wpieczona w teksture hull skaluje sie razem z bryla. Hitbox (main.ts radius) BEZ zmian.
const BAKE_DISPLAY_SCALE = 1.25;

// === v0.187.0 FAZA 2 — pasek zycia nad czolgiem gracza ===
/** Szerokosc paska w px swiata. Wrogowie: 40 zwykly / 55 pursuit / 70 boss / 100 mega boss.
 *  Gracz ma byc czytelnie szerszy od szeregowego wroga, ale nie szerszy od bossa. */
const HP_BAR_W = 60;
const HP_BAR_H = 7;
/** Ile px NAD srodkiem czolgu stoi pasek (w px swiata, niezaleznie od sciezki bake/flat). */
const HP_BAR_OFFSET_Y = 62;

/**
 * "Pancerz krytyczny" wchodzi ponizej 30% HP, a gasnie dopiero powyzej 35%. Histereza chroni przed
 * migotaniem, gdy gracz leczy sie dokladnie na granicy progu. Wartosci do potwierdzenia playtestem.
 */
const CRITICAL_HP_ENTER = 0.30;
const CRITICAL_HP_EXIT = 0.35;

/**
 * Tempo tetna: 1/60 na klatke = **rowno jeden cykl na sekunde** przy 60 fps.
 *
 * Bylo `0.055..0.105`, czyli cykl 0.16-0.30 s = **3.3-6.3 blyskow na sekunde**. Mariusz po playtescie:
 * "az oczy bola przy dluzszej grze na niskim HP" — i mial racje, to byl stroboskop. Tempo celowo NIE
 * przyspiesza juz wraz z utrata HP; przyspieszanie bylo drugim powodem meczenia wzroku.
 */
const CRITICAL_BEAT_PER_FRAME = 1 / 60;

// ============================================================
// FAZA P3 — TANK JUICE (recoil / kick / pitch / taunt bounce)
// ============================================================
// Port 1:1 z lab.ts (src/experimental/tank25d/lab.ts) + konsumpcja jak render2d drawTank.
// TYLKO tryb bake (bakerActive) — flat path nietkniety bit-for-bit. Zero nowych tekstur,
// zero fill-rate: kilka offsetow/mnoznikow na istniejacych sprite'ach per frame.
//
// Konsumpcja (render2d units, *BAKE_DISPLAY_SCALE dla world):
//   recoil -> barrel/turret cofa sie o recoil*8 wzdluz -turretAngle (Y *CAMERA_TILT_Y)
//   kick   -> caly czolg (container) jolt o kick px w kierunku przeciwnym do strzalu
//   pitch  -> container.y -= pitch*3 (nose up gdy pitch>0) + container.scale.y *= 1+pitch*0.015
const JUICE_RECOIL_DECAY = 0.82;       // recoil *= per frame (lab)
const JUICE_KICK_DECAY = 0.7;          // chassis kick *= per frame (lab)
const JUICE_KICK_MAG = 2.4;            // chassis jolt px opposite shot (lab)
const JUICE_PITCH_SPRING = 9.0;        // pitch spring rate /s (lab) — do targetu podczas jazdy, do 0 poza
const JUICE_FIRE_PITCH_BUMP = 0.2;     // pitch += on fire (lab)
const JUICE_RECOIL_BARREL_UNITS = 8;   // barrel pullback = recoil*8 (render2d drawTank)
const JUICE_PITCH_Z_UNITS = 3;         // pitchZOffset = pitch*3 (render2d drawTank)
const JUICE_PITCH_TILT_K = 0.015;      // pitchTiltMul = 1 + pitch*0.015 (render2d drawTank)
const JUICE_TAUNT_IDLE_SEC = 4.0;      // idle seconds before lowrider bounce (lab TAUNT_IDLE)
const JUICE_BOUNCE_DUR_SEC = 0.55;     // bounce length (lab BOUNCE_DUR)
const JUICE_TAUNT_PITCH_AMP = 2.6;     // taunt bounce pitch amplitude (lab)
const JUICE_CAMERA_TILT_Y = 0.866;     // render2d camera tilt (barrel recoil Y compression)
// DESIGNED (gra = instant-movement, brak labowego velocity integratora). v2 (A+B po playtescie):
// model TARGET-PITCH zamiast impulsu start/stop. Jadacy czolg trzyma staly squat (nos w gore) przez
// CALA jazde (odwzorowuje ciaglosc laba, gdzie ACC-ramp laduje pitch przez wiele klatek); na stopie
// dodatkowy dive. Impuls-only (v1) dawal <1px blysk na 1 klatke = niewidoczny. To JEDYNE stale P3
// NIE verbatim z lab — dostrajalne.
const JUICE_PITCH_DRIVE_TARGET = 0.6;  // staly squat podczas jazdy (nose-up). world Y ~= 0.6*3*1.25 = 2.25px
const JUICE_PITCH_DIVE_ON_STOP = -0.7; // dodatkowy nose-down kop na moment zatrzymania
const JUICE_PITCH_CLAMP = 0.8;         // clamp pitch od ruchu (recoil/taunt liczone osobno)

// Flag — pozycja WEWNATRZ hull (drzewce -25px od center, flag ciagnie w lewo)
const FLAG_W = 21;
const FLAG_H = 13.5;
const FLAG_POLE_W = 2.25;
const FLAG_POLE_H = 17.5;
const FLAG_POLE_DIST = 25;

/**
 * v0.23.1 Opcja A — per-brawler mobile speed multiplier (surgical fix).
 *
 * Problem: pojedynczy global multiplier (0.7) sprawial ze wolne brawlerzy (Pancerny speed=3)
 * stawali sie cele na mobile — enemies (~4-5 speed) wyprzedzaly ich w prostej linii.
 *
 * Rozwiazanie: per-brawler bracket — wolne dostaja BONUS (>1.0), szybkie standard cap (~0.7).
 * Bracket-based zeby uniknac magic numbers per-brawler-id (kalibruje sie raz, robi dobrze dla nowych).
 *
 * Wartosci kalibrowane vs typical enemy speed (~4-5):
 * - speed <=3 (Pancerny):   x1.05 -> mobile ~3.15 (wciaz wolny, ale nie ofiara)
 * - speed <=4 (Heavy):      x0.95 -> mobile ~3.8 (porownywalne z enemy)
 * - speed <=5 (Twardy/Std): x0.80 -> mobile ~4.0
 * - speed <=7 (Plasma):     x0.72 -> mobile ~5.0 (wciaz szybsze od enemy)
 * - speed >7 (Scout):       x0.68 -> mobile ~5.4 (najszybszy, role zachowana)
 *
 * Cap >1.0 dla najwolniejszych jest celowy — tam input lag mniej znaczy niz przezycie graczy.
 */
function getMobileSpeedMult(baseSpeed: number): number {
    if (baseSpeed <= 3) return 1.05;
    if (baseSpeed <= 4) return 0.95;
    if (baseSpeed <= 5) return 0.80;
    if (baseSpeed <= 7) return 0.72;
    return 0.68;
}

export class Player {
    public brawler: Brawler;
    public x: number;
    public y: number;
    public baseSpeed: number;
    public maxHp: number;
    public hp: number;
    /** Z0.5: ostatnie PRZYJETE zrodlo obrazen (konsumenci: koop/moce — na razie brak). */
    public lastDamageSource: DamageSource | null = null;
    public container: PIXI.Container;
    public hull: PIXI.Sprite;
    public turret: PIXI.Sprite;
    /**
     * SKIN-2: tani puls animowanego skina w meczu — sprite ADD reuzywajacy
     * TA SAMA teksture co hull (podmiana referencji per kat = zero VRAM),
     * animowane tylko alpha (sin). Pelna animacja wzoru zyje w Garazu.
     * null gdy skin nie-animowany albo flat path.
     */
    private skinPulseOverlay: PIXI.Sprite | null = null;
    private skinPulseT = 0;
    // TANK ART v2 — stan wizualny (lokalny, poza symulacja)
    private readonly artV2: boolean = false;
    private treadPhase = 0;
    private treadPhaseT = 0;
    private barrelFlash: PIXI.Sprite | null = null;
    private barrelFlashT = 0;
    /** v0.187.0 — pasek zycia nad czolgiem (zawsze widoczny, jak u wrogow). */
    private hpBar: PIXI.Graphics;
    /** Ostatnie narysowane HP — pasek przerysowujemy TYLKO przy zmianie, nie co klatke. */
    private hpBarLastHp = -1;
    /** v0.187.0 — stan krytyczny (<=30% HP): SAM dym. Bez migania, bez pulsu. */
    public criticalArmor = false;
    /**
     * v0.188.0 — "na hita": nastepny pocisk wroga zabija. Liczy `main.ts` (zna liste zywych wrogow
     * i ich `bulletDmg` juz przeskalowany trudnoscia), tu tylko konsumujemy. Dopiero ten stan wlacza
     * puls kadluba i poswiate w rogach ekranu.
     */
    public oneHitFromDeath = false;
    /** Faza tetna — czyta ja HUD, zeby pekniecia bily DOKLADNIE z pulsem kadluba. */
    public criticalPhase = 0;
    private criticalSmokeT = 0;

    public speedBoostMult: number = 1;
    public speedBoostEnd: number = 0;

    // v0.18.1 FAZA 4b — speed modifier (set externally per-frame by main.ts: quicksand = 0.5, normal = 1.0)
    public speedModifier: number = 1.0;

    public superCharges: number = 0;
    public superActive: boolean = false;
    public superEndTime: number = 0;
    private superRingGfx: PIXI.Graphics;

    // ── DASH (BALANCE_V2 S3, Shadow) ────────────────────────────────────────────────────
    // STAN GRY (musi przejsc przez symulacje): ile krokow lotu zostalo, kierunek lotu,
    // ile krokow do odnowienia. Liczone w KROKACH, nigdy w ms — patrz DASH_CONFIG.
    /** >0 = czolg jest w trakcie dasha (tyle krokow jeszcze przeleci). */
    private dashStepsLeft = 0;
    /** Znormalizowany kierunek lotu, zamrozony w chwili startu (dash nie skreca w locie). */
    private dashDirX = 0;
    private dashDirY = 0;
    /** Kroki pozostale do odnowienia; 0 = gotowy. */
    private dashCdLeft = 0;

    private flagGfx: PIXI.Graphics;
    private tracksGfx: PIXI.Graphics;
    private exhaustGfx: PIXI.Graphics;

    private trackTimer: number = 0;
    private lastMoveAngle: number = 0;
    public isMoving: boolean = false;

    // FAZA P1 Sprite Baker — logiczne katy (nosniki dla main.ts gdy rotacja wpieczona w teksture)
    private bakerActive: boolean = false;
    private _turretAngle: number = 0;
    get turretAngle(): number { return this._turretAngle; }
    get hullAngle(): number { return this.lastMoveAngle; }

    // FAZA P3 — juice state (bake mode only). Stale 1:1 z lab.ts.
    private recoil: number = 0;
    private kickX: number = 0;
    private kickY: number = 0;
    private pitch: number = 0;
    private idleTimeSec: number = 0;
    private bounceTimer: number = 0;
    private wasMoving: boolean = false;
    private _prevNow: number = performance.now();
    /** Ustawiane przez main.ts co klatke — supresja tauntu podczas strzelania (lab: !pointer.down). */
    public firing: boolean = false;

    /**
     * Constructor signature (FAZA 7c):
     *   new Player(brawlerData, worldContainer)                       — uses brawler.flag default
     *   new Player(brawlerData, worldContainer, profileFlagId)        — profile override
     */
    constructor(brawlerData: Brawler, worldContainer: PIXI.Container, profileFlagId?: FlagId | null,
        // SKIN-2: obecnosc = zalozony ANIMOWANY skin (puls ADD); tint opcjonalny.
        skinPulse?: { tint?: string } | null) {
        this.brawler = brawlerData;
        this.x = 800;
        this.y = 800;
        this.baseSpeed = brawlerData.speed;
        this.maxHp = brawlerData.hp;
        this.hp = this.maxHp;

        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;

        const tex = getBrawlerTextures(this.brawler);
        this.hull = new PIXI.Sprite(tex.hull);
        this.hull.anchor.set(0.5);
        this.turret = new PIXI.Sprite(tex.turret);
        this.turret.anchor.set(0.5);

        // FAZA P1 Sprite Baker — jesli flaga ON i tekstury upieczone (bake w main.ts startGame),
        // podmien flat -> 2.5D. Rotacja wpieczona => sprite.rotation=0, podmiana .texture per kat.
        this.bakerActive = BAKER_ENABLED && TankSpriteBaker.isBaked(this.brawler.id);
        this.artV2 = this.bakerActive && isTankArtV2() && TankSpriteBaker.getTreadPhases(this.brawler.id) > 1;
        if (this.bakerActive) {
            this.hull.texture = TankSpriteBaker.getHullTexture(this.brawler.id, 0);
            this.turret.texture = TankSpriteBaker.getTurretTexture(this.brawler.id, 0);
            // +25% skala calego czolga (bryla+gasienice+wydech+ring spojnie). Flaga wpieczona
            // w teksture hull skaluje sie razem. Hitbox (main.ts radius) BEZ zmian — czysto wizualne.
            this.container.scale.set(BAKE_DISPLAY_SCALE);
        }

        this.superRingGfx = new PIXI.Graphics();
        this.superRingGfx.visible = false;
        this.tracksGfx = new PIXI.Graphics();
        this.exhaustGfx = new PIXI.Graphics();
        this.flagGfx = new PIXI.Graphics();
        // v0.187.0 FAZA 2 — pasek zycia NAD CZOLGIEM. Dwoch testerow zglosilo, ze nie widza, ile maja
        // zycia: jedyna reprezentacja byla pigulka w lewym gornym rogu, a wzrok gracza jest na czolgu
        // na srodku ekranu. KAZDY wrog mial swoj pasek, gracz nie.
        // W trybie bake kontener ma scale 1.25 — kompensujemy, zeby pasek mial STALE 60 px w swiecie
        // niezaleznie od sciezki renderu (inaczej gracz w bake mialby pasek szerszy od bossa).
        this.hpBar = new PIXI.Graphics();
        const hpBarScale = this.bakerActive ? 1 / BAKE_DISPLAY_SCALE : 1;
        this.hpBar.scale.set(hpBarScale);
        this.hpBar.y = -HP_BAR_OFFSET_Y * hpBarScale;

        // FAZA 7c: profile override via FLAGS config, else legacy brawler default
        if (profileFlagId && FLAGS[profileFlagId]) {
            this.drawFlagFromConfig(FLAGS[profileFlagId]);
        } else {
            this.drawFlag(this.brawler.flag ?? 'PL');
        }

        // FAZA P1: w trybie bake flaga jest WPIECZONA w teksture hull (per-profil, 1:1 lab),
        // wiec gasimy overlay zeby nie dublowac (overlay mial nierozwiazywalny problem kompresji 2.5D).
        if (this.bakerActive) this.flagGfx.visible = false;

        // SKIN-2: puls animowanego skina — tylko bake path; dane skina przychodza
        // z main.ts (Player nie siega do serwisow — kierunek GameConfig -> Player).
        // Nad hull, POD tracks/flag/turret (poswiata lakieru nie moze przykryc
        // flagi ani wiezy). reduced-motion => stale alpha (bez sin).
        if (this.bakerActive && skinPulse) {
            this.skinPulseOverlay = new PIXI.Sprite(this.hull.texture);
            this.skinPulseOverlay.anchor.set(0.5);
            this.skinPulseOverlay.blendMode = PIXI.BLEND_MODES.ADD;
            this.skinPulseOverlay.alpha = 0.06;
            if (skinPulse.tint) {
                this.skinPulseOverlay.tint = parseInt(skinPulse.tint.replace('#', ''), 16);
            }
        }

        // TANK ART v2: blysk lufy = overlay ADD tekstury wiezy (poza lustrem tintu — celowo).
        if (this.artV2) {
            this.barrelFlash = new PIXI.Sprite(this.turret.texture);
            this.barrelFlash.anchor.set(0.5);
            this.barrelFlash.blendMode = PIXI.BLEND_MODES.ADD;
            this.barrelFlash.visible = false;
            // v2: gasienice kreca sie w teksturze — plaskie kreski tracksGfx zbedne (-1 Graphics/klatke).
            this.tracksGfx.visible = false;
        }

        // Order: super-ring -> hull -> [skin pulse] -> tracks -> exhaust -> flag -> turret -> [barrel flash]
        this.container.addChild(this.superRingGfx);
        this.container.addChild(this.hull);
        if (this.skinPulseOverlay) this.container.addChild(this.skinPulseOverlay);
        this.container.addChild(this.tracksGfx);
        this.container.addChild(this.exhaustGfx);
        this.container.addChild(this.flagGfx);
        this.container.addChild(this.turret);
        if (this.barrelFlash) this.container.addChild(this.barrelFlash);
        this.container.addChild(this.hpBar); // nad wszystkim — pasek nigdy nie chowa sie pod wieza
        this.drawHp();
        worldContainer.addChild(this.container);
    }

    /**
     * Legacy flag rendering (FAZA 6 era) — country code string switch.
     * Used for brawler defaults (PL/UA/DE/JP). Profile flags use drawFlagFromConfig.
     */
    drawFlag(countryCode: string): void {
        this.flagGfx.clear();
        const flagStartX = -FLAG_W;

        this.flagGfx.beginFill(0x4a3520);
        this.flagGfx.drawRect(-FLAG_POLE_W / 2, -FLAG_POLE_H / 2, FLAG_POLE_W, FLAG_POLE_H);
        this.flagGfx.endFill();

        switch (countryCode.toUpperCase()) {
            case 'PL':
                this.flagGfx.beginFill(0xffffff);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xdc143c);
                this.flagGfx.drawRect(flagStartX, 0, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                break;
            case 'UA':
                this.flagGfx.beginFill(0x0057b8);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xffd700);
                this.flagGfx.drawRect(flagStartX, 0, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                break;
            case 'DE':
                this.flagGfx.beginFill(0x000000);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H / 3);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xdd0000);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2 + FLAG_H / 3, FLAG_W, FLAG_H / 3);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xffce00);
                this.flagGfx.drawRect(flagStartX, FLAG_H / 2 - FLAG_H / 3, FLAG_W, FLAG_H / 3);
                this.flagGfx.endFill();
                break;
            case 'JP':
                this.flagGfx.beginFill(0xffffff);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xbc002d);
                this.flagGfx.drawCircle(flagStartX + FLAG_W / 2, 0, FLAG_H / 3.5);
                this.flagGfx.endFill();
                break;
            default:
                this.flagGfx.beginFill(0xaaaaaa);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H);
                this.flagGfx.endFill();
        }

        this.drawFlagBorderAndFinial(flagStartX);
    }

    /**
     * FAZA 7c: profile flag rendering — data-driven via FlagConfig.
     * Supports all 3 patterns (horizontal_2 / horizontal_3 / vertical_3).
     */
    drawFlagFromConfig(config: FlagConfig): void {
        this.flagGfx.clear();
        const flagStartX = -FLAG_W;

        this.flagGfx.beginFill(0x4a3520);
        this.flagGfx.drawRect(-FLAG_POLE_W / 2, -FLAG_POLE_H / 2, FLAG_POLE_W, FLAG_POLE_H);
        this.flagGfx.endFill();

        const p = config.colors.primary;
        const s = config.colors.secondary;
        const tert = config.colors.tertiary ?? p;

        switch (config.pattern) {
            case 'horizontal_2':
                this.flagGfx.beginFill(p);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(s);
                this.flagGfx.drawRect(flagStartX, 0, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                break;
            case 'horizontal_3':
                this.flagGfx.beginFill(p);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H / 3);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(s);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2 + FLAG_H / 3, FLAG_W, FLAG_H / 3);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(tert);
                this.flagGfx.drawRect(flagStartX, FLAG_H / 2 - FLAG_H / 3, FLAG_W, FLAG_H / 3);
                this.flagGfx.endFill();
                break;
            case 'vertical_3':
                this.flagGfx.beginFill(p);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W / 3, FLAG_H);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(s);
                this.flagGfx.drawRect(flagStartX + FLAG_W / 3, -FLAG_H / 2, FLAG_W / 3, FLAG_H);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(tert);
                this.flagGfx.drawRect(flagStartX + (FLAG_W * 2) / 3, -FLAG_H / 2, FLAG_W / 3, FLAG_H);
                this.flagGfx.endFill();
                break;
        }

        this.drawFlagBorderAndFinial(flagStartX);
    }

    /** Helper — black border + gold finial on pole top. Shared by drawFlag + drawFlagFromConfig. */
    private drawFlagBorderAndFinial(flagStartX: number): void {
        this.flagGfx.lineStyle(0.8, 0x000000, 0.75);
        this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H);
        this.flagGfx.lineStyle(0);
        this.flagGfx.beginFill(0xd4af37);
        this.flagGfx.drawCircle(0, -FLAG_POLE_H / 2 - 0.5, 2);
        this.flagGfx.endFill();
    }

    /**
     * Z0.5: `source` OBOWIAZKOWE — kazde obrazenie niesie sprawce (typ + referencja).
     * Zapisywane tylko przy FAKTYCZNIE przyjetym obrazeniu (invulnerable nie nadpisuje).
     */
    /**
     * v0.187.0 — pasek zycia nad czolgiem. Wzorzec 1:1 z wrogow (`Enemy.drawHp`): PIXI.Graphics,
     * przerysowywany TYLKO przy zmianie HP. Kolor z `hpColor.ts`, czyli ten sam co pigulka w HUD.
     * Obramowanie jest tu szersze niz u wrogow — to czolg GRACZA i ma sie wyroznic.
     */
    private drawHp(): void {
        const t = this.maxHp > 0 ? Math.max(0, Math.min(1, this.hp / this.maxHp)) : 0;
        this.hpBar.clear();
        this.hpBar.beginFill(0x000000, 0.55);
        this.hpBar.drawRoundedRect(-HP_BAR_W / 2 - 2, -2, HP_BAR_W + 4, HP_BAR_H + 4, 4);
        this.hpBar.endFill();
        if (t > 0) {
            this.hpBar.beginFill(hpColorHex(t));
            this.hpBar.drawRoundedRect(-HP_BAR_W / 2, 0, HP_BAR_W * t, HP_BAR_H, 3);
            this.hpBar.endFill();
        }
    }

    /** Wolane co klatke z `update()`. HP zmienia sie takze POZA klasa (leczenie w main.ts/powers.ts),
     *  wiec nie da sie tego wpiac tylko w `takeDamage` — porownanie wartosci lapie wszystkie zrodla. */
    private refreshHpBar(): void {
        if (this.hp === this.hpBarLastHp) return;
        this.hpBarLastHp = this.hp;
        this.drawHp();
    }

    /**
     * v0.187.0 FAZA 2 — "PANCERZ KRYTYCZNY", warstwa przy czolgu.
     *
     * Do tej wersji jedynym sygnalem niskiego zycia byla linia glosowa przy 50% HP. Gracz ginal
     * bez ostrzezenia, co dla 9-12 lat czyta sie jako niesprawiedliwosc (wartosc nr 1: czytelnosc).
     *
     * Dym leci z PULI czasteczek (`spawnRocketSmoke`), wiec nie dokladamy nowego kodu czasteczek
     * ani fill-rate'u: gestosc rosnie im mniej HP, ale ma twardy sufit co kilka klatek.
     * Histereza (wejscie 30%, wyjscie 35%) chroni przed migotaniem przy leczeniu na granicy progu.
     */
    private updateCriticalArmor(delta: number, smoke: DamageSmoke | null): void {
        const t = this.maxHp > 0 ? this.hp / this.maxHp : 0;
        if (this.criticalArmor) {
            if (t > CRITICAL_HP_EXIT || this.hp <= 0) this.criticalArmor = false;
        } else if (t <= CRITICAL_HP_ENTER && this.hp > 0) {
            this.criticalArmor = true;
        }

        // POZIOM 1 (30% HP): SAM DYM. Bez migania i bez pulsu — to sygnal "uwazaj", nie alarm.
        // Poprzednia wersja migala juz tutaj i Mariusz zglosil, ze przy dluzszej grze na niskim HP
        // "az oczy bola". Miganie przeniesione o poziom wyzej.
        if (this.criticalArmor && this.hp > 0 && smoke) {
            this.criticalSmokeT += delta;
            const every = 5 + Math.round((t / CRITICAL_HP_ENTER) * 5); // 5..10 klatek
            if (this.criticalSmokeT >= every) {
                this.criticalSmokeT = 0;
                smoke.spawn(this.x, this.y - 6);
            }
        }

        // POZIOM 2 ("na hita"): dochodzi puls kadluba. Poswiate narozna rysuje HUD tym samym rytmem.
        if (!this.oneHitFromDeath || this.hp <= 0) {
            // Tint bazowy ustawia juz `update()` tuz nad wywolaniem — tu nic nie zerujemy,
            // zeby nie skasowac fioletu super mocy ani zolci turbo.
            this.turret.tint = this.hull.tint;
            return;
        }

        // Tetno: dwa uderzenia i pauza (NIE zwykly sinus) — to odroznia "ja gine" od alarmu donzonu
        // w Zamku, ktory pulsuje rowno.
        // TEMPO: 1/60 na klatke = RONWO JEDEN cykl na sekunde. Bylo 0.055..0.105, czyli cykl 0.16-0.30 s
        // = 3.3-6.3 blyskow na sekunde — stroboskop. Tempo celowo NIE rosnie juz z utrata HP:
        // przyspieszanie bylo drugim powodem meczenia wzroku.
        this.criticalPhase += delta * CRITICAL_BEAT_PER_FRAME;
        const beat = heartbeat(this.criticalPhase);

        // Czerwien kadluba w rytmie tetna: sciemniamy kanaly G i B (R zostaje 255), wiec czolg
        // czerwienieje. Miedzy uderzeniami beat = 0, wiec wraca kolor ustawiony przez `update()`.
        if (beat > 0) {
            const gb = Math.round(255 * (1 - beat * 0.85));
            this.hull.tint = (0xff << 16) | (gb << 8) | gb;
        }
        this.turret.tint = this.hull.tint;
    }

    takeDamage(amount: number, isInvulnerable: boolean, source: DamageSource): boolean {
        if (isInvulnerable) return false;
        this.lastDamageSource = source;
        this.hp = Math.max(0, this.hp - amount); // SigmaTester F1: HP nie schodzi ponizej 0 (bylo -100 po smierci)
        sigmaEmit({ t: 'damage', target: 'player', dmg: amount, src: source.kind, hp: this.hp, x: this.x, y: this.y }); // SigmaTester (no-op poza ?bot=1)
        return this.hp <= 0;
    }

    applyTurboBoost(durationMs: number, multiplier: number): void {
        this.speedBoostMult = multiplier;
        this.speedBoostEnd = Date.now() + durationMs;
    }

    get currentSpeed(): number {
        if (Date.now() > this.speedBoostEnd) this.speedBoostMult = 1;
        return this.baseSpeed * this.speedBoostMult * this.speedModifier;
    }

    get hasSpeedBoost(): boolean {
        return Date.now() < this.speedBoostEnd && this.speedBoostMult > 1;
    }

    addSuperCharge(amount: number): void {
        this.superCharges = Math.min(SUPER_MAX_CHARGES, this.superCharges + amount);
    }

    tryActivateOrContinueSuperShot(): boolean {
        const now = Date.now();
        if (this.superActive && now < this.superEndTime) return true;
        if (this.superActive && now >= this.superEndTime) this.superActive = false;
        if (!this.superActive && this.superCharges > 0) {
            this.superActive = true;
            this.superEndTime = now + SUPER_SHOT_DURATION_MS;
            this.superCharges--;
            return true;
        }
        return false;
    }

    get isSuperShotActive(): boolean {
        return this.superActive && Date.now() < this.superEndTime;
    }

    get superShotSecondsLeft(): number {
        if (!this.superActive) return 0;
        return Math.max(0, (this.superEndTime - Date.now()) / 1000);
    }

    // ── DASH (BALANCE_V2 S3) ────────────────────────────────────────────────────────────

    /** Czy ten czolg w ogole ma dash (ruleset v2 -> `dash: true`). Przy `?bal=0` zawsze false. */
    get hasDash(): boolean { return this.brawler.dash === true; }

    /** Gotowy do odpalenia: ma dash, nie leci juz teraz i ma odnowione. */
    get canDash(): boolean { return this.hasDash && this.dashStepsLeft <= 0 && this.dashCdLeft <= 0; }

    /** true w trakcie lotu — main.ts blokuje na ten czas sterowanie ruchem. */
    get isDashing(): boolean { return this.dashStepsLeft > 0; }

    /** 0..1 — ile odnowienia ZOSTALO (1 = swiezo uzyty). Do zegara na przycisku. */
    get dashCooldownProgress(): number {
        return DASH_CONFIG.cooldownSteps > 0 ? this.dashCdLeft / DASH_CONFIG.cooldownSteps : 0;
    }

    /** Sekundy odnowienia — przeliczane z KROKOW przy zalozeniu 60 krokow/s (tylko do UI). */
    get dashSecondsLeft(): number { return this.dashCdLeft / 60; }

    /**
     * Odpalenie dasha w podanym kierunku (nie musi byc znormalizowany).
     * Bez kierunku (gracz stoi) leci w strone lufy — inaczej tap w przycisk nie robilby nic,
     * a „przycisk, ktory czasem nie dziala" to najgorszy rodzaj niesprawiedliwosci dla dziecka.
     *
     * Zwraca false, gdy dash niedostepny — wolajacy decyduje, czy dac feedback.
     */
    tryDash(dirX: number, dirY: number, effects?: EffectsManager): boolean {
        if (!this.canDash) return false;
        let len = Math.hypot(dirX, dirY);
        if (len < 0.001) { dirX = Math.cos(this._turretAngle); dirY = Math.sin(this._turretAngle); len = 1; }
        this.dashDirX = dirX / len;
        this.dashDirY = dirY / len;
        this.dashStepsLeft = DASH_CONFIG.steps;
        this.dashCdLeft = DASH_CONFIG.cooldownSteps;
        this.lastMoveAngle = Math.atan2(this.dashDirY, this.dashDirX);
        if (!this.bakerActive) this.hull.rotation = this.lastMoveAngle;
        // Sensoryka: pyl na starcie (istniejaca pula czastek, zero nowego kodu efektow).
        effects?.spawnRocketSmoke(this.x, this.y);
        return true;
    }

    /**
     * Jeden KROK dasha. Wolane raz na wywolanie update() — NIE skalowane `delta`, bo dash ma byc
     * identyczny u kazdego klienta (regula MP #2: catch-up liczy stala liczbe krokow).
     * Skutek: przy spadku FPS dash trwa dluzej w sekundach, ale tyle samo w symulacji.
     *
     * Kolizje sprawdzane NA KAZDYM KROKU (20 px), nie tylko w punkcie koncowym — inaczej skok
     * o 180 px przenikalby cienkie sciany. Uderzenie = dash sie konczy w miejscu kontaktu.
     */
    private stepDash(buildings: ICollidable[], effects: EffectsManager): void {
        this.dashStepsLeft--;
        const nx = this.x + this.dashDirX * DASH_CONFIG.stepPx;
        const ny = this.y + this.dashDirY * DASH_CONFIG.stepPx;
        for (const b of buildings) {
            if (checkRectCollision(b.x, b.y, b.w, b.h, nx, ny, 20)) {
                this.dashStepsLeft = 0;     // sciana zatrzymuje dash — bez przenikania i bez slizgu
                effects.spawnWallImpact(this.x, this.y);
                return;
            }
        }
        this.x = nx;
        this.y = ny;
        this.isMoving = true;
        // Smuga: slad gasienic co krok — czytelny „ogon" bez nowej warstwy czastek.
        effects.spawnTrackMark(this.x, this.y, this.lastMoveAngle);
    }

    /**
     * FAZA P3 — wolane przez main.ts przy strzale. Recoil (barrel) + chassis kick + pitch bump.
     * 1:1 z lab.ts fire block. No-op w trybie flat (juice tylko w bake). Ustawia tylko stan;
     * wizualnie stosowane w update() -> updateJuice().
     */
    /** TANK ART v2 — blysk lufy przy strzale (no-op poza v2). */
    triggerBarrelFlash(): void {
        if (!this.barrelFlash) return;
        this.barrelFlashT = BARREL_FLASH_FRAMES;
        this.barrelFlash.visible = true;
    }

    triggerRecoil(): void {
        if (!this.bakerActive) return;
        this.recoil = 1;
        this.kickX = -Math.cos(this._turretAngle) * JUICE_KICK_MAG;
        this.kickY = -Math.sin(this._turretAngle) * JUICE_KICK_MAG;
        this.pitch = Math.min(JUICE_PITCH_CLAMP, this.pitch + JUICE_FIRE_PITCH_BUMP);
    }

    /**
     * FAZA P3 — ewolucja stanu juice (recoil/kick decay, pitch spring, taunt bounce). 1:1 z lab.ts
     * update(). Timing wlasny (performance.now delta) — Player.update nie dostaje delta z main.ts.
     * frame = dtSec*60 (~1 @60fps) dla per-frame decayow (frame-rate safe przez pow).
     */
    private updateJuice(): void {
        const now = performance.now();
        let dtSec = (now - this._prevNow) / 1000;
        this._prevNow = now;
        if (dtSec > 0.05) dtSec = 0.05;      // cap jak lab (dt clamp)
        if (dtSec < 0) dtSec = 0;
        const frame = dtSec * 60;            // ~1 @60fps, dla per-frame decayow

        // Recoil (barrel) + chassis kick decay — per-frame (lab), frame-rate safe.
        this.recoil *= Math.pow(JUICE_RECOIL_DECAY, frame);
        this.kickX *= Math.pow(JUICE_KICK_DECAY, frame);
        this.kickY *= Math.pow(JUICE_KICK_DECAY, frame);

        // Taunt (lowrider bounce): po TAUNT_IDLE_SEC bezruchu (i nie strzelajac) — damped pitch pop.
        // Re-arms w petli (lab). idleNow: brak ruchu + nie strzela (lab: al===0 && !pointer.down && sp<14).
        const idleNow = !this.isMoving && !this.firing;
        this.idleTimeSec = idleNow ? this.idleTimeSec + dtSec : 0;
        if (idleNow && this.bounceTimer <= 0 && this.idleTimeSec >= JUICE_TAUNT_IDLE_SEC) {
            this.bounceTimer = JUICE_BOUNCE_DUR_SEC;
            this.idleTimeSec = 0;
        }

        if (this.bounceTimer > 0) {
            // Scripted bounce nadpisuje spring (1:1 lab).
            this.bounceTimer -= dtSec;
            const p = 1 - this.bounceTimer / JUICE_BOUNCE_DUR_SEC;
            this.pitch = JUICE_TAUNT_PITCH_AMP * Math.sin(p * Math.PI * 2.2) * Math.pow(Math.max(0, 1 - p), 0.5);
        } else {
            // Suspension squat/dive (v2 A+B): jadacy czolg DAZY do stalego squat (nose-up) przez cala
            // jazde (widoczny caly czas, nie blysk); na moment zatrzymania dodatkowy dive kop, potem
            // spring do 0. Spring rate 1:1 lab. To odwzorowuje ciaglosc laba (ACC-ramp laduje pitch).
            if (!this.isMoving && this.wasMoving) this.pitch += JUICE_PITCH_DIVE_ON_STOP; // kop na hamowanie
            const target = this.isMoving ? JUICE_PITCH_DRIVE_TARGET : 0;
            this.pitch += (target - this.pitch) * JUICE_PITCH_SPRING * dtSec;
            this.pitch = Math.max(-JUICE_PITCH_CLAMP, Math.min(JUICE_PITCH_CLAMP, this.pitch));
        }
        this.wasMoving = this.isMoving;
    }

    private updateSuperRing(): void {
        const showRing = this.superCharges > 0 || this.isSuperShotActive;
        if (!showRing) { this.superRingGfx.visible = false; return; }
        this.superRingGfx.visible = true;
        this.superRingGfx.clear();
        const t = Date.now() / 100;
        const pulse = 0.6 + Math.sin(t) * 0.4;
        const isActive = this.isSuperShotActive;
        if (isActive) {
            const r = 38 + Math.sin(t * 1.5) * 3;
            this.superRingGfx.lineStyle(5, SUPER_TINT, pulse);
            this.superRingGfx.drawCircle(0, 0, r);
            this.superRingGfx.lineStyle(3, 0xffffff, pulse * 0.7);
            this.superRingGfx.drawCircle(0, 0, r - 6);
            this.superRingGfx.beginFill(SUPER_TINT, 0.08 * pulse);
            this.superRingGfx.drawCircle(0, 0, r);
            this.superRingGfx.endFill();
            for (let i = 0; i < 6; i++) {
                const angle = Date.now() / 150 + (i / 6) * Math.PI * 2;
                this.superRingGfx.beginFill(0xffffff, pulse);
                this.superRingGfx.drawCircle(Math.cos(angle) * r, Math.sin(angle) * r, 2.5);
                this.superRingGfx.endFill();
            }
        } else {
            this.superRingGfx.lineStyle(2.5, SUPER_TINT, pulse * 0.6);
            this.superRingGfx.drawCircle(0, 0, 35);
        }
    }

    private updateBrawlerTracks(): void {
        this.tracksGfx.clear();
        const config = PROGRAMMATIC_BRAWLER_CONFIG[this.brawler.id];
        if (!config) return;
        if (!this.isMoving) return;

        const time = Date.now();
        const speedFactor = this.currentSpeed / 5;
        const phase = (time * speedFactor * 0.04) % 12;
        const trackHalfLen = config.HL / 2;
        const trackY = (config.HW / 2) + (config.TRK_H / 2);
        const cos = Math.cos(this.lastMoveAngle);
        const sin = Math.sin(this.lastMoveAngle);

        this.tracksGfx.lineStyle(1.8, 0xfff5cf, 0.55);

        for (const ty of [-trackY, trackY]) {
            for (let i = -3; i <= 3; i++) {
                const localX1 = i * 12 + phase - 8;
                const localX2 = localX1 + 5;
                const cx1 = Math.max(localX1, -trackHalfLen);
                const cx2 = Math.min(localX2, trackHalfLen);
                if (cx2 <= cx1) continue;
                const sx1 = (cx1 * cos - ty * sin) * TANK_CANVAS_SCALE;
                const sy1 = (cx1 * sin + ty * cos) * TANK_CANVAS_SCALE;
                const sx2 = (cx2 * cos - ty * sin) * TANK_CANVAS_SCALE;
                const sy2 = (cx2 * sin + ty * cos) * TANK_CANVAS_SCALE;
                this.tracksGfx.moveTo(sx1, sy1);
                this.tracksGfx.lineTo(sx2, sy2);
            }
        }
    }

    private updateBrawlerExhaust(): void {
        this.exhaustGfx.clear();
        const config = PROGRAMMATIC_BRAWLER_CONFIG[this.brawler.id];
        if (!config) return;
        if (!config.HAS_FLAME && !config.HAS_SMOKE) return;

        const time = Date.now();
        const cos = Math.cos(this.lastMoveAngle);
        const sin = Math.sin(this.lastMoveAngle);
        const rearDirX = -cos;
        const rearDirY = -sin;
        const intensityBase = this.isMoving ? 1.0 : 0.55;
        const offsets = [-config.EXHAUST_Y, config.EXHAUST_Y];

        for (let idx = 0; idx < 2; idx++) {
            const offLocalY = offsets[idx];
            const ex = (config.EXHAUST_X * cos - offLocalY * sin) * TANK_CANVAS_SCALE;
            const ey = (config.EXHAUST_X * sin + offLocalY * cos) * TANK_CANVAS_SCALE;

            if (config.HAS_FLAME) {
                const flamePhase = time / 130 + idx * 1.7;
                const flameScale = 0.85 + Math.sin(flamePhase) * 0.25;
                const flameSize = 5 * flameScale * intensityBase;
                const flameDist = 5 + Math.sin(flamePhase * 0.7) * 1.5;
                const fx = ex + rearDirX * flameDist;
                const fy = ey + rearDirY * flameDist;
                this.exhaustGfx.beginFill(config.FLAME_COLOR_OUTER!, 0.75 * intensityBase);
                this.exhaustGfx.drawCircle(fx, fy, flameSize);
                this.exhaustGfx.endFill();
                this.exhaustGfx.beginFill(config.FLAME_COLOR_INNER!, 0.92 * intensityBase);
                this.exhaustGfx.drawCircle(fx, fy, flameSize * 0.55);
                this.exhaustGfx.endFill();
                this.exhaustGfx.beginFill(0xffffff, 0.6 * intensityBase);
                this.exhaustGfx.drawCircle(fx, fy, flameSize * 0.22);
                this.exhaustGfx.endFill();
            }

            if (config.HAS_SMOKE) {
                const smokeBoost = config.SMOKE_BOOST ?? 1.0;
                for (let s = 0; s < 4; s++) {
                    const smokePhase = ((time / 900) + s * 0.25 + idx * 0.17) % 1.0;
                    const smokeDist = (10 + smokePhase * 25) * smokeBoost;
                    const smokeSize = (2.5 + smokePhase * 4) * smokeBoost;
                    const smokeAlpha = config.SMOKE_ALPHA! * (1 - smokePhase) * intensityBase;
                    const driftPerp = Math.sin(smokePhase * Math.PI * 2 + idx) * 2.5;
                    const perpX = -rearDirY * driftPerp;
                    const perpY = rearDirX * driftPerp;
                    const smx = ex + rearDirX * smokeDist + perpX;
                    const smy = ey + rearDirY * smokeDist + perpY;

                    this.exhaustGfx.beginFill(config.SMOKE_COLOR!, smokeAlpha);
                    this.exhaustGfx.drawCircle(smx, smy, smokeSize);
                    this.exhaustGfx.endFill();
                    this.exhaustGfx.beginFill(0xffffff, smokeAlpha * 0.3);
                    this.exhaustGfx.drawCircle(smx, smy, smokeSize * 0.4);
                    this.exhaustGfx.endFill();
                }
            }
        }
    }

    /**
     * Update player state from input.
     *
     * FAZA 8.5 + v0.23.1: signature dorzuca 6-th optional arg moveVector — gdy provided,
     * smooth analog ruch zastepuje keys.wasd (touch joystick on mobile).
     *
     * v0.23.1 magnitude scaling: lekkie wychylenie = wolny ruch, pelne = max speed.
     *
     * v0.23.1 Opcja A — per-brawler mobile multiplier (zamiast hardcoded 0.7):
     *   getMobileSpeedMult(baseSpeed) zwraca bracket-based wartosc.
     *   Wolne brawlerzy (Pancerny <=3) dostaja bonus x1.05 — kompensacja "ofiary mobile".
     *   Szybkie (Scout >7) dostaja mocniejszy cap x0.68 — zachowana role + control.
     */
    update(
        delta: number,
        keys: KeysState,
        mouseWorldX: number,
        mouseWorldY: number,
        buildings: ICollidable[],
        effects: EffectsManager,
        moveVector?: { x: number; y: number } | null,
        damageSmoke?: DamageSmoke | null, // v0.188.0 — dym uszkodzenia (wlasna warstwa nad czolgami)
    ): void {
        this.refreshHpBar(); // v0.187.0: lapie takze leczenie (dzieje sie poza ta klasa)

        // DASH (S3): odnowienie tyka zawsze — takze w locie — zeby licznik na przycisku byl
        // monotoniczny (gracz nie widzi „zamrozonej" sekundy przez 9 krokow lotu).
        if (this.dashCdLeft > 0) this.dashCdLeft--;

        let dx = 0, dy = 0;

        // FAZA 8.5: touch joystick override gdy provided, else fallback do keys.wasd
        const isTouchInput = !!(moveVector && (moveVector.x !== 0 || moveVector.y !== 0));

        if (isTouchInput) {
            dx = moveVector!.x;
            dy = moveVector!.y;
        } else {
            if (keys.w) dy -= 1;
            if (keys.s) dy += 1;
            if (keys.a) dx -= 1;
            if (keys.d) dx += 1;
        }

        this.isMoving = false;

        if (this.dashStepsLeft > 0) {
            // W LOCIE gracz nie steruje: dash jest zobowiazaniem, nie sugestia. Kierunek zostal
            // zamrozony przy starcie, wiec wynik jest przewidywalny — to jest ta „kontrola",
            // ktora ma byc nagroda za wybor Shadowa.
            this.stepDash(buildings, effects);
        } else if (dx !== 0 || dy !== 0) {
            this.isMoving = true;
            const len = Math.sqrt(dx * dx + dy * dy);

            // v0.23.1: magnitude scaling dla touch (joystick wychylenie wplywa na speed).
            // Keys.wasd: len = 1 (single key) lub sqrt(2) (diagonal) -> normalize zachowuje constant speed.
            // Touch: magnitude = len (0..1), naturalne analogowe sterowanie.
            const magnitudeScale = isTouchInput ? Math.min(1, len) : 1;

            // v0.23.1 Opcja A: per-brawler mobile multiplier (zamiast hardcoded 0.7)
            const platformMult = isTouchInput ? getMobileSpeedMult(this.baseSpeed) : 1;

            const speed = this.currentSpeed * magnitudeScale * platformMult;

            // Krok skalowany delta (frame-rate spojny z Enemy.update). Desktop 60fps: delta~1 =
            // identycznie jak dotad; mobile <60fps: kompensuje mniej klatek (gracz nie zwalnia wzgledem
            // wrogow, ktorzy juz uzywaja delta). Bez tego Scout byl doganiany przy spadku FPS.
            const nx = this.x + (dx / len) * speed * delta;
            const ny = this.y + (dy / len) * speed * delta;
            let canMoveX = true, canMoveY = true;
            for (const b of buildings) {
                if (checkRectCollision(b.x, b.y, b.w, b.h, nx, this.y, 20)) canMoveX = false;
                if (checkRectCollision(b.x, b.y, b.w, b.h, this.x, ny, 20)) canMoveY = false;
            }
            if (canMoveX) this.x = nx;
            if (canMoveY) this.y = ny;
            this.lastMoveAngle = Math.atan2(dy, dx);
            if (!this.bakerActive) this.hull.rotation = this.lastMoveAngle;
        }

        this._turretAngle = Math.atan2(mouseWorldY - this.y, mouseWorldX - this.x);

        if (this.bakerActive) {
            // FAZA P3 — juice: ewolucja stanu + transformy na container/turret (tylko bake).
            this.updateJuice();

            // kick (caly czolg) + pitch Z offset (nose up gdy pitch>0). render2d units *1.25.
            this.container.x = this.x + this.kickX * BAKE_DISPLAY_SCALE;
            this.container.y = this.y + (this.kickY - this.pitch * JUICE_PITCH_Z_UNITS) * BAKE_DISPLAY_SCALE;
            // pitch tilt: lekka deformacja Y (±1.5% przy clamp, wiecej podczas taunt bounce).
            this.container.scale.y = BAKE_DISPLAY_SCALE * (1 + this.pitch * JUICE_PITCH_TILT_K);

            // TANK ART v2: faza gasienic (licznik klatek, tylko w ruchu).
            if (this.artV2 && this.isMoving) {
                this.treadPhaseT += delta;
                if (this.treadPhaseT >= TREAD_PHASE_FRAMES) { this.treadPhaseT = 0; this.treadPhase++; }
            }
            // rotacja wpieczona: sprite.rotation=0, podmien teksture na najblizszy z 36 katow
            this.hull.texture = TankSpriteBaker.getHullTexture(this.brawler.id, this.lastMoveAngle, this.treadPhase);
            this.turret.texture = TankSpriteBaker.getTurretTexture(this.brawler.id, this._turretAngle);
            if (this.barrelFlash && this.barrelFlash.visible) {
                this.barrelFlashT -= delta;
                if (this.barrelFlashT <= 0) { this.barrelFlash.visible = false; }
                else { this.barrelFlash.texture = this.turret.texture; this.barrelFlash.alpha = 0.7 * (this.barrelFlashT / BARREL_FLASH_FRAMES); }
            }

            // SKIN-2: puls skina — ta sama referencja tekstury co hull + sin-alpha.
            if (this.skinPulseOverlay) {
                this.skinPulseOverlay.texture = this.hull.texture;
                this.skinPulseT += 1 / 60;
                this.skinPulseOverlay.alpha = SKIN_PULSE_REDUCED
                    ? 0.06
                    : 0.05 + 0.09 * (0.5 + 0.5 * Math.sin(this.skinPulseT * 2.2));
            }

            // recoil: caly turret sprite cofa sie wzdluz -turretAngle (barrel wpieczony w teksture
            // turret). Rozbieznosc vs lab (lab cofa tylko barrel) — czyta sie jako kopniecie.
            this.turret.x = -Math.cos(this._turretAngle) * this.recoil * JUICE_RECOIL_BARREL_UNITS;
            this.turret.y = -Math.sin(this._turretAngle) * this.recoil * JUICE_RECOIL_BARREL_UNITS * JUICE_CAMERA_TILT_Y;
            if (this.barrelFlash) { this.barrelFlash.x = this.turret.x; this.barrelFlash.y = this.turret.y; }
        } else {
            // FLAT PATH — bit-for-bit jak dotad (zero juice).
            this.container.x = this.x;
            this.container.y = this.y;
            this.turret.rotation = this._turretAngle;
        }
        // v0.186.0 CZYTELNOSC: +40 (bylo +19) => przy nachodzeniu gracz jest NAD wrogami (grunt +19,
        // pursuit +24, boss +28, mega +35). Wczesniej mega boss 392 px potrafil calkiem zakryc czolg gracza.
        this.container.zIndex = this.y + 40;

        // Flag overlay — TYLKO w trybie flat (OFF). W trybie bake flaga jest wpieczona w teksture
        // hull (drawHullTop), wiec overlay jest zgaszony (visible=false) i pomijamy obliczenia.
        if (!this.bakerActive) {
            this.flagGfx.x = -Math.cos(this.lastMoveAngle) * FLAG_POLE_DIST;
            this.flagGfx.y = -Math.sin(this.lastMoveAngle) * FLAG_POLE_DIST;
            this.flagGfx.rotation = this.lastMoveAngle;
        }

        if (this.isSuperShotActive) this.hull.tint = SUPER_TINT;
        else if (this.hasSpeedBoost) this.hull.tint = 0xffcc66;
        else this.hull.tint = 0xffffff;

        // v0.187.0: MUSI byc PO powyzszym przypisaniu tintu. Pierwsza wersja liczyla to na poczatku
        // `update()` i ta linijka kasowala czerwien co klatke — czolg zostawal zielony mimo 25% HP.
        // Czerwien nakladamy TYLKO na szczycie uderzenia serca, wiec miedzy uderzeniami nadal widac
        // tint super mocy / turbo (informacja o mocy nie ginie).
        this.updateCriticalArmor(delta, damageSmoke ?? null);

        if (this.superActive && Date.now() >= this.superEndTime) this.superActive = false;

        this.updateSuperRing();
        this.updateBrawlerTracks();
        this.updateBrawlerExhaust();

        if (this.isMoving) {
            this.trackTimer++;
            const trackInterval = this.hasSpeedBoost ? 2 : 4;
            if (this.trackTimer >= trackInterval) {
                this.trackTimer = 0;
                const perpX = -Math.sin(this.lastMoveAngle) * 12;
                const perpY = Math.cos(this.lastMoveAngle) * 12;
                effects.spawnTrackMark(this.x + perpX, this.y + perpY, this.lastMoveAngle);
                effects.spawnTrackMark(this.x - perpX, this.y - perpY, this.lastMoveAngle);
            }
        }
    }
}