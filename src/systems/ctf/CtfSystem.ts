import * as PIXI from 'pixi.js';
import { Enemy } from '../../entities/Enemy';
import { worldRng } from '../Rng'; // Z0.1: seeded gameplay RNG
import { CtfFlag } from '../../entities/ctf/CtfFlag';
import { BossBomb, BOSS_BOMB_BLAST_R } from '../../entities/ctf/BossBomb';
import { ENEMY_GUARD, ENEMY_CTF_BOSS, CTF_BOSS_SHOOT_RANGE, type EnemyConfig } from '../../config/enemies';
import { FORTIFIED_FLAG_POSITIONS, FORTIFIED_HANGAR_RECT } from '../../maps/FortifiedRuinsMap';
import { WORLD_W } from '../../config/constants';
import { t } from '../../i18n/i18n';
import type { GameSession } from '../../services/GameSession';
import type { Player } from '../../entities/Player';
import type { EffectsManager } from '../../rendering/Effects';
import type { DifficultyModifiers } from '../../config/difficulty';

/**
 * CtfSystem — rdzen logiki Capture the Flag (FAZA CTF F2).
 *
 * Port logiki legacy ctf.html 1:1 (wartosci potwierdzone w plan §2):
 *  - 3 flagi IDLE/CARRIED/CAPTURED, pickup R=80, drop po smierci -> IDLE @gracz,
 *    reset do startu po 10 s,
 *  - hangar (30,1250,500,500): dostawa => CAPTURED, full-heal, shake 20,
 *    3 flagi => VICTORY,
 *  - eskalacja esc=min(2,captured): detRadius 200+esc*75, fireRate 2200-esc*300,
 *    bomby bossow co 5 s przy esc>=2 (cel gracz +/-40 px, telegraph caly lot),
 *  - straznicy: 2/flage, PATROL(orbita R=180, D4)/CHASE/ALERT; predkosc per
 *    klatke wg D2 (zero kumulacji legacy-buga), powrot do patrolu gdy gracz
 *    w bazie/poza det+80/w stealth (stealth = rozszerzenie: krzaki dzialaja),
 *  - super-bossy: 3, normalne AI poscigu (legacy isGuard=false), triple-spread
 *    z dist<400 (shootRangeOverride), respawn 60 s na pozycji spawnu (D3),
 *  - carry penalty: x(1 - 0.10 - esc*0.05) -> 0.90/0.85/0.80 (mnoznik do
 *    player.speedModifier w main.ts, multiplikatywnie ze slow-zone).
 *
 * Stan przezywalny miedzy klatkami zyje w GameSession.ctf (architektura 3 warstw)
 * — CtfSystem trzyma tylko referencje obiektow (flagi/strażnicy/bossy/bomby).
 *
 * Difficulty: statsy guard/boss skalowane jak w SpawnSystem.scaleConfig
 * (hp/dmg/bulletDmg * mult); predkosc guarda: formula D2 * enemySpeedMult.
 */

/**
 * v0.143.0 — SANKTUARIUM ZAMIAST MAGICZNYCH LINII.
 *
 * Bylo: `SAFE_ZONE_BULLET_X = 450` (pociski wroga gina na zachod od tej linii) oraz
 * `GUARD_CLAMP_MARGIN = 5` (straznik nie jedzie ponizej x=535). Obie linie ciagnely sie
 * przez CALA wysokosc mapy (3000 px), a hangar to prostokat 500x500 na y=1250..1750.
 * Dawalo to dwa bugi zgloszone z playtestu Michala:
 *   1. PAS SMIERCI W GARAZU x=[450,530]: wizualnie w bazie, dla kodu poza strefa.
 *      Straznik stal za bariera na x=535 i z zasiegiem 500 px przestrzeliwal garaz.
 *   2. KORYTARZ KAMPINGOWY x<450 na calej wysokosci: pociski parowaly w powietrzu,
 *      roamerzy kumulowali sie przy barierze i ginęli za darmo.
 * Teraz jest JEDNA regula: sanktuarium = prostokat hangaru AND tarcza aktywna.
 * Straznikow zatrzymuja `ctfEnemyBarriers` (main.ts) — czyli TO SAMO zrodlo prawdy.
 */
const BASE_SHIELD_MS = 5000;      // 5 s tarczy: start meczu + po kazdej dostawie flagi
const GUARD_ORBIT_R = 180;        // D4 (legacy 160 — przenikalo mury o 4 px)
const FLAG_PICKUP_R = 80;
const FLAG_RESET_MS = 10000;
const BOSS_RESPAWN_MS = 60000;
const BOMB_TARGET_JITTER = 80;    // cel = gracz +/- 40 px ((rand-0.5)*80)
// v0.73.7: interval bomb przeniesiony do difficulty (ctfBombIntervalMs). Ponizej mechaniki fairness:
const MIN_BOMB_GAP_MS = 1500;      // desync (B): min odstep miedzy DOWOLNYMI bombami — strefy razenia nie nachodza
const BOMB_PICKUP_GRACE_MS = 2000; // laska: przez 2s po podniesieniu flagi bomby wstrzymane (szansa na start ucieczki)

export interface CtfUpdateResult {
    victory: boolean;
    playerDied: boolean;
}

export interface CtfSystemOpts {
    session: GameSession;
    worldContainer: PIXI.Container;
    /** Referencja do TABLICY enemies z main.ts (ta sama instancja przez caly mecz). */
    enemies: Enemy[];
    effects: EffectsManager;
    difficulty: DifficultyModifiers;
    hudNotif: (text: string, cssColor: string) => void;
    onPickupSfx: () => void;
    onCaptureSfx: () => void;
    onBombExplosionSfx: () => void;
    onEnrage: () => void; // FAZA F4.3 — baner eskalacji (2. flaga)
    /** v0.143.0 — dostarczono flage o tym indeksie (proporzec na maszt w hangarze). */
    onCapture: (flagIdx: number) => void;
    /** v0.143.0 — tarcza bazy wlasnie wygasla (baner + zdjecie barier w main.ts). */
    onShieldExpired: () => void;
}

export class CtfSystem {
    public readonly flags: CtfFlag[];
    public readonly hangarRect = FORTIFIED_HANGAR_RECT;

    private readonly opts: CtfSystemOpts;
    private guards: Enemy[] = [];
    private bosses: Array<Enemy | null> = [null, null, null];
    private bombs: BossBomb[] = [];
    private lastBombTime: number[] = [0, 0, 0];
    private lastAnyBombTime = 0;   // v0.73.7 desync (B): czas ostatniej DOWOLNEJ bomby (dowolnego bossa)
    private bombGraceUntil = 0;    // v0.73.7: bomby wstrzymane do tego czasu (ustawiane przy podniesieniu flagi)
    /** v0.143.0: stan tarczy z POPRZEDNIEJ klatki — do wykrycia momentu wygasniecia (raz). */
    private shieldWasActive = true;

    constructor(opts: CtfSystemOpts) {
        this.opts = opts;

        // Tarcza startowa: gracz ma 5 s na ogarniecie sie, zanim wrogowie wjada do bazy.
        if (opts.session.ctf) opts.session.ctf.baseShieldUntil = Date.now() + BASE_SHIELD_MS;

        this.flags = FORTIFIED_FLAG_POSITIONS.map((f, i) =>
            new CtfFlag(i, f.id.toUpperCase(), f.x, f.y, f.color, opts.worldContainer));
    }

    /**
     * v0.143.0 — restart 5 s tarczy. Potrzebne przy przejsciu z samouczka do prawdziwego
     * meczu: CtfSystem powstaje na starcie, ale w tutorialu wrogowie NIE spawnuja sie
     * (spawnCtfMatchForces jest odlozone). Bez tego tarcza wygasalaby w pustce i gracz
     * dostawalby baner "WROGOWIE WCHODZA!" przy zerowej liczbie wrogow.
     */
    public resetBaseShield(): void {
        const ctf = this.opts.session.ctf;
        if (!ctf) return;
        ctf.baseShieldUntil = Date.now() + BASE_SHIELD_MS;
        this.shieldWasActive = true;
    }

    /** Skala difficulty jak SpawnSystem.scaleConfig (hp/dmg/bulletDmg/speed). */
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

    /**
     * Spawn sil poczatkowych: 3 super-bossy (fx+180, fy+30; BRAVO clamp x=2900
     * jak legacy) + 6 straznikow (fx-80,fy+60 / fx+80,fy-60). Wpycha do enemies.
     * Roamerzy startowi ida przez SpawnSystem.spawnCtfInitialRoamers (main.ts).
     */
    public spawnInitialForces(): void {
        const { worldContainer, enemies } = this.opts;

        FORTIFIED_FLAG_POSITIONS.forEach((f, i) => {
            enemies.push(this.spawnBoss(i));

            const guardPositions = [
                { x: f.x - 80, y: f.y + 60 },
                { x: f.x + 80, y: f.y - 60 },
            ];
            for (const gp of guardPositions) {
                const guard = new Enemy(gp.x, gp.y, this.scaleConfig(ENEMY_GUARD), false, worldContainer);
                guard.attachGuard({
                    flagId: i,
                    flagColor: f.color,
                    orbitX: f.x,
                    orbitY: f.y,
                    orbitR: GUARD_ORBIT_R,
                    state: 'patrol',
                    patrolAngle: worldRng.next() * Math.PI * 2, // Z0.1: seeded
                    chaseSpeed: 2.2,
                    fireIntervalMs: 2200,
                });
                this.guards.push(guard);
                enemies.push(guard);
            }
        });
    }

    private spawnBoss(flagIdx: number): Enemy {
        const f = FORTIFIED_FLAG_POSITIONS[flagIdx];
        const bx = Math.min(f.x + 180, WORLD_W - 100); // BRAVO 2930 -> 2900 (legacy clamp)
        const boss = new Enemy(bx, f.y + 30, this.scaleConfig(ENEMY_CTF_BOSS), true, this.opts.worldContainer);
        boss.shootRangeOverride = CTF_BOSS_SHOOT_RANGE;
        this.bosses[flagIdx] = boss;
        return boss;
    }

    /**
     * v0.73.7: carry penalty USUNIETY (decyzja Mariusz) — predkosc czolgu STALA
     * niezaleznie od niesionej flagi i liczby zdobytych flag. Fairness: koniec
     * brutalnego 0.80 predkosci + szybkie bomby po 2 fladze. Zawsze 1.0.
     * (Bylo: carrying ? 1 - 0.10 - esc*0.05 = 0.90/0.85/0.80 : 1.0.)
     */
    public getCarrySpeedMult(): number {
        return 1.0;
    }

    /** Czy gracz niesie flage (dla HUD/telegraphu w F3). */
    public getCarriedFlag(): CtfFlag | null {
        const ctf = this.opts.session.ctf;
        if (!ctf || ctf.carryingFlagId === null) return null;
        return this.flags[ctf.carryingFlagId];
    }

    /** Drop flagi przy smierci gracza (legacy: IDLE @gracz + reset 10 s). */
    public handlePlayerDeath(playerX: number, playerY: number): void {
        const ctf = this.opts.session.ctf;
        if (!ctf || ctf.carryingFlagId === null) return;
        const flag = this.flags[ctf.carryingFlagId];
        flag.state = 'idle';
        flag.x = playerX;
        flag.y = playerY;
        flag.dropTimer = Date.now() + FLAG_RESET_MS;
        ctf.carryingFlagId = null;
        ctf.startedCarryAt = null;
    }

    /**
     * Glowny update CTF — wolany z tickera main.ts (po bloku stealth, przed
     * petla enemies, zeby stany guardow byly swieze w tej samej klatce).
     */
    public update(delta: number, player: Player, isInvulnerable: boolean): CtfUpdateResult {
        const ctf = this.opts.session.ctf;
        if (!ctf) return { victory: false, playerDied: false };
        const { effects, hudNotif } = this.opts;
        const now = Date.now();

        // ── 0. Tarcza bazy: wykryj MOMENT wygasniecia (dokladnie raz). main.ts zdejmuje
        //    wtedy bariery, a HUD odpala baner — inaczej wrogowie wjezdzaliby po cichu,
        //    czyli dokladnie ta "smierc znikad", ktora naprawiamy. ──
        const shieldNow = now < ctf.baseShieldUntil;
        if (this.shieldWasActive && !shieldNow) {
            this.shieldWasActive = false;
            this.opts.onShieldExpired();
        }

        // ── 1. Flagi (follow/reset/anim) ──
        for (const flag of this.flags) {
            flag.update(delta, player.x, player.y, player.hullAngle);
        }

        // ── 2. Pickup (R=80, tylko gdy nic nie niesiemy) ──
        if (ctf.carryingFlagId === null) {
            for (const flag of this.flags) {
                if (flag.state !== 'idle') continue;
                if (Math.hypot(player.x - flag.x, player.y - flag.y) < FLAG_PICKUP_R) {
                    flag.state = 'carried';
                    ctf.carryingFlagId = flag.id;
                    ctf.startedCarryAt = now;
                    this.bombGraceUntil = now + BOMB_PICKUP_GRACE_MS; // v0.73.7: 2s laski na start ucieczki
                    hudNotif(t('ctf.flagPickup', { name: flag.name }), this.cssColor(flag.color));
                    effects.spawnFloatingText(flag.x, flag.y - 40, `🚩 ${flag.name}`, flag.color);
                    effects.spawnEnemyHitSparks(flag.x, flag.y, flag.color);
                    effects.shake(6, 10);
                    this.opts.onPickupSfx();
                    break;
                }
            }
        }

        // ── 3. Dostawa do hangaru ──
        if (ctf.carryingFlagId !== null && this.containsHangar(player.x, player.y)) {
            const flag = this.flags[ctf.carryingFlagId];
            flag.state = 'captured';
            ctf.carryingFlagId = null;
            ctf.startedCarryAt = null;
            ctf.flagsCaptured++;
            ctf.escalation = Math.min(2, ctf.flagsCaptured);
            player.hp = player.maxHp; // full-heal (legacy 1:1) — petla ryzyko/nagroda
            // v0.143.0: dostawa ODNAWIA tarcze bazy (5 s oddechu przed kolejnym wypadem)
            // i wciaga proporzec na maszt tej flagi.
            ctf.baseShieldUntil = now + BASE_SHIELD_MS;
            this.shieldWasActive = true;
            this.opts.onCapture(flag.id);
            // v0.136.0: PUNKTY za dostawe. Do v0.135.0 flaga nie dawala ani jednego punktu —
            // przy wlaczonym rankingu CTF wygrywalby ten, kto olewa flagi i farmi wrogow.
            const flagBonus = this.opts.session.addFlagCaptureBonus();
            // F4.3 flex dostawy: duzy popup postepu, zielone iskry heala, mocny shake.
            // (Konfetti per-capture anulowane — endcard ma juz swoje; unikamy dublu.)
            hudNotif(t('ctf.flagCaptured', { name: flag.name }), this.cssColor(flag.color));
            // Punkty dopisane do TEGO SAMEGO popupu, nie osobna notyfikacja — kolejka HUD
            // ma juz baner zdobycia; drugi wpis byłby szumem, a nie informacja.
            effects.spawnFloatingText(
                player.x, player.y - 80,
                `✅ ${flag.name}  ${ctf.flagsCaptured}/3  +${flagBonus.added}`,
                flag.color,
            );
            effects.spawnEnemyHitSparks(player.x, player.y, 0x2ecc71); // heal (zielony)
            effects.shake(20, 24);
            this.opts.onCaptureSfx();
            if (ctf.flagsCaptured >= 3) {
                return { victory: true, playerDied: false };
            }
            // F4.3 eskalacja: 2. flaga => bomby bossow => DRAMATYCZNY baner + puls.
            if (ctf.flagsCaptured === 2) {
                hudNotif(t('ctf.enemiesEnraged'), '#ff5533');
                effects.shake(11, 18);
                this.opts.onEnrage();
            }
        }

        // ── 4. Maszyna stanow straznikow + wartosci per klatke (D2) ──
        const esc = ctf.escalation;
        const detRadius = 200 + esc * 75;
        const fireInterval = 2200 - esc * 300;
        for (const guard of this.guards) {
            if (!guard.active || !guard.guard) continue;
            const g = guard.guard;
            const flag = this.flags[g.flagId];
            const dist = Math.hypot(player.x - guard.x, player.y - guard.y);

            // v0.143.0: "gracz nietykalny" = gracz w SANKTUARIUM (hangar + tarcza),
            // nie "gracz na zachod od x=450". Po wygasnieciu tarczy straznik sciga
            // gracza takze do garazu — to jest wlasnie "wrogowie wjezdzaja do bazy".
            const playerSafe = this.isInHomeSanctuary(player.x, player.y);
            if (flag.state === 'carried') {
                g.state = 'alert'; // zlodziej! (alert ignoruje stealth — alarm jawny)
            } else if (dist < detRadius && !guard.playerStealthed && !playerSafe) {
                g.state = 'chase';
            } else if (g.state !== 'patrol' && (dist > detRadius + 80 || guard.playerStealthed)) {
                g.state = 'patrol';
            }
            if (playerSafe && g.state === 'chase') {
                g.state = 'patrol'; // gracz w sanktuarium — CHASE odpuszcza (legacy 2003)
            }

            // D2: predkosc liczona per klatke — zero kumulacji.
            g.chaseSpeed = (2.2 + esc * 0.4)
                * (g.state === 'alert' ? 1.25 : 1)
                * (esc >= 2 ? 1.20 : 1)
                * this.opts.difficulty.enemySpeedMult;
            g.fireIntervalMs = fireInterval;
        }

        // ── 5. Super-bossy: smierc -> timer 60 s -> respawn na spawnie (D3) ──
        for (let i = 0; i < 3; i++) {
            const boss = this.bosses[i];
            if (boss && !boss.active) {
                this.bosses[i] = null;
                ctf.bossRespawnAt[i] = now + BOSS_RESPAWN_MS;
            }
            if (!this.bosses[i] && ctf.bossRespawnAt[i] > 0 && now > ctf.bossRespawnAt[i]) {
                ctf.bossRespawnAt[i] = 0;
                const newBoss = this.spawnBoss(i);
                this.opts.enemies.push(newBoss);
                effects.spawnPortal(newBoss.x, newBoss.y, 0xe74c3c); // F4.3: portal spawnu bossa
                const f = FORTIFIED_FLAG_POSITIONS[i];
                effects.spawnFloatingText(f.x, f.y - 60, t('ctf.bossRespawn'), 0xe74c3c);
                hudNotif(t('ctf.bossRespawn'), '#e74c3c');
            }
        }

        // ── 6. Bomby bossow (esc>=2). v0.73.7: interval+predkosc z difficulty, desync (B)
        //    zeby strefy nie nachodzily, oraz 2s laski po podniesieniu flagi. ──
        const bombInterval = this.opts.difficulty.ctfBombIntervalMs;
        const bombFlightSpeed = this.opts.difficulty.ctfBombFlightSpeed;
        if (esc >= 2 && now >= this.bombGraceUntil) {
            for (let i = 0; i < 3; i++) {
                const boss = this.bosses[i];
                if (!boss || !boss.active) continue;
                if (this.lastBombTime[i] === 0) this.lastBombTime[i] = now;
                // desync (B): boss gotowy wg WLASNEGO interwalu ORAZ min odstep od DOWOLNEJ bomby.
                // Dzieki temu 3 bossy nie walą naraz w to samo miejsce (unik zawsze mozliwy).
                if (now - this.lastBombTime[i] > bombInterval && now - this.lastAnyBombTime >= MIN_BOMB_GAP_MS) {
                    this.lastBombTime[i] = now;
                    this.lastAnyBombTime = now;
                    this.bombs.push(new BossBomb(
                        boss.x, boss.y,
                        player.x + (worldRng.next() - 0.5) * BOMB_TARGET_JITTER, // Z0.1: seeded
                        player.y + (worldRng.next() - 0.5) * BOMB_TARGET_JITTER,
                        this.opts.worldContainer,
                        bombFlightSpeed,
                    ));
                }
            }
        }

        // ── 7. Update bomb + eksplozje (dmg 300/200/100 wg dystansu, legacy x100) ──
        let playerDied = false;
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const bomb = this.bombs[i];
            const explosion = bomb.update(delta);
            if (explosion) {
                effects.spawnShockwaveRing(explosion.x, explosion.y, BOSS_BOMB_BLAST_R);
                effects.spawnEnemyHitSparks(explosion.x, explosion.y, 0xff5500);
                this.opts.onBombExplosionSfx();
                const dist = Math.hypot(player.x - explosion.x, player.y - explosion.y);
                if (dist < BOSS_BOMB_BLAST_R) {
                    const dmg = dist < BOSS_BOMB_BLAST_R * 0.33 ? 300
                        : dist < BOSS_BOMB_BLAST_R * 0.66 ? 200 : 100;
                    // v0.143.0: bomba tez respektuje sanktuarium. Bez tego "bezpieczna baza"
                    // bylaby klamstwem — bomba leci z 400 px i ma promien razenia 250 px.
                    const shielded = isInvulnerable || this.isInHomeSanctuary(player.x, player.y);
                    const died = player.takeDamage(dmg, shielded);
                    if (!shielded) {
                        this.opts.session.markDamageTaken();
                        effects.shake(28, 30);
                        effects.spawnFloatingText(player.x, player.y - 65, `💥 -${dmg} HP!`, 0xff5500);
                    }
                    if (died) {
                        this.handlePlayerDeath(player.x, player.y);
                        playerDied = true;
                    }
                }
            }
            if (!bomb.active) {
                bomb.destroy();
                this.bombs.splice(i, 1);
            }
        }

        return { victory: false, playerDied };
    }

    /**
     * F3 (playtest) — "swiete altary flag": pociski wroga gina w promieniu
     * SAFE_POCKET wokol pozycji fortec flag. Gracz moze bezpiecznie podniesc flage,
     * ale po wyjezdzie z kieszeni (>100 px) jest juz normalnym celem. Analogicznie
     * do strefy domowej (x<450) — spojna, czytelna zasada "przy fladze nie strzelaja".
     * Uzywa startX/startY (pozycja fortu), niezaleznie od stanu flagi.
     */
    public isInFlagSafePocket(px: number, py: number): boolean {
        const R2 = 100 * 100;
        for (const f of this.flags) {
            const dx = px - f.startX;
            const dy = py - f.startY;
            if (dx * dx + dy * dy < R2) return true;
        }
        return false;
    }

    /**
     * v0.143.0 — SANKTUARIUM: prostokat hangaru ORAZ aktywna tarcza. Jedno zrodlo prawdy
     * dla: kasowania pociskow wroga (main.ts), odpuszczania pogoni przez straznikow,
     * nietykalnosci gracza (pocisk / taran / bomba bossa).
     * Po wygasnieciu tarczy zwraca false => baza staje sie sporna i wrogowie wjezdzaja.
     */
    public isInHomeSanctuary(px: number, py: number): boolean {
        const ctf = this.opts.session.ctf;
        if (!ctf || Date.now() >= ctf.baseShieldUntil) return false;
        return this.containsHangar(px, py);
    }

    /** Czy punkt lezy w obrysie hangaru — BEZ warunku tarczy (spawn wrogow, HUD). */
    public isInHangarRect(px: number, py: number): boolean {
        return this.containsHangar(px, py);
    }

    /** Ile pelnych sekund tarczy zostalo (0 = tarcza nieaktywna). Dla licznika na HUD. */
    public getShieldSecondsLeft(): number {
        const ctf = this.opts.session.ctf;
        if (!ctf) return 0;
        const left = ctf.baseShieldUntil - Date.now();
        return left > 0 ? Math.ceil(left / 1000) : 0;
    }

    /** Legacy Hangar.containsWorld — prostokat strefy domowej. */
    private containsHangar(px: number, py: number): boolean {
        const h = this.hangarRect;
        return px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h;
    }

    private cssColor(color: number): string {
        return '#' + color.toString(16).padStart(6, '0');
    }

    /** Sprzatanie przy koncu meczu (flagi + bomby; wrogowie sprzata main). */
    public destroy(): void {
        for (const f of this.flags) f.destroy();
        for (const b of this.bombs) b.destroy();
        this.bombs = [];
    }
}
