import * as PIXI from 'pixi.js';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EffectsManager } from '../rendering/Effects';
import {
    POWERS, POWER_ORDER, TOWER_CONFIG, ROCKETS_CONFIG, GHOST_CONFIG, getPowerDef,
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
     * Generyczna eksplozja AoE mocy (rakiety + wybuch konca Widma) — kill-path
     * (dmg/score/drop/victory) zyje w main.ts, jak mega bomba. Radius/dmg per wywolanie.
     */
    private readonly aoeExplode: (x: number, y: number, radius: number, dmg: number) => void;

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
        aoeExplode: (x: number, y: number, radius: number, dmg: number) => void,
    ) {
        this.loadout = loadout;
        this.worldContainer = worldContainer;
        this.towerBulletSpawner = towerBulletSpawner;
        this.aoeExplode = aoeExplode;
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

        // F7b-2/3/4: Wieza, rakiety i Widmo tykaja NIEZALEZNIE od efektu czasowego.
        this.towerUpdate(delta, enemies, effects);
        this.rocketsUpdate(delta, enemies, effects);
        this.ghostUpdate(delta, effects);

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
                // wizual+dzwiek+AoE kill-path w main.ts
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
