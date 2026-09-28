import * as PIXI from 'pixi.js';
import type { Pyramid } from './Pyramid';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import { SRC_CURSE_FOG, type DamageSource } from '../../types/DamageSource';
import { DESERT_CURSE, CURSE_BY_DIFFICULTY } from '../../config/desertCurse';
import { Mummy } from '../../entities/desert/Mummy';
import { Scarab } from '../../entities/desert/Scarab';
import { DesertJuice } from './DesertJuice';
import { RaWrath } from './RaWrath';
import { ArchaeologistGroup } from '../../entities/desert/Archaeologist';
import { SRC_RA_FIRE } from '../../types/DamageSource';
import { bakeSmokePuff } from '../../rendering/Tier3Baker';
import { BURP_CONFIG } from '../../config/powers';

/** Mgla klatwy = ten sam gaz co super moc Bek (uwaga Mariusza 2026-09-28). */
const CURSE_FOG_COLOR = BURP_CONFIG.cloudColor;
const CURSE_FOG_ALPHA = BURP_CONFIG.cloudAlpha;

/**
 * PyramidCurse — DESERT ART v2 / E4. Klatwa piramidy (dziala na KAZDEJ z 3 piramid).
 *
 * Gracz ostrzeliwuje piramide -> licznik obrazen w oknie 5 s -> od 60% progu TELEGRAF
 * (drzenie, pyl, zielona poswiata w wejsciu N, komunikat) -> przy 500: WYRZUT POWIETRZA
 * z wejscia grobowca u podstawy sciany N + duza zielona mgla (10 s, podgryza HP),
 * z wejscia wychodzi mumia (+50%, wijace sie bandaze, delikatny ryk) z 8 skarabeuszami.
 * Skarabeusze TYLKO przeszkadzaja (oblepiaja czolg, zero obrazen). Mumia i stado NIE
 * wchodza na przeszkody (piramidy, skaly, rzeka, piaskowiec) — kolizja kolo vs AABB.
 * Zabicie mumii = KLATWA ZDJETA: chmurka (-25 HP w obrebie), stado ucieka / wkopuje sie.
 * Po 45 s klatwa gasnie sama. Kazda piramida ma wlasna klatwe i wlasny cooldown 60 s. Punkty: brak (decyzja 2026-09-28, bez bumpu score_version).
 *
 * DECYZJE Mariusza (2026-09-28): klatwe budza TYLKO pociski gracza; poprawki po pierwszym
 * playtescie: wejscie N, mgla 10 s z obrazeniami, mumia +50% fake-3D + bandaze + ryk,
 * 8 skarabeuszy bez obrazen, zakaz wchodzenia na piramidy, chmurka smierci -25 HP.
 *
 * COOP/MP:
 *  - stan gry (licznik okna, cooldown, strefy mgly i ich obrazenia, pozycje/HP mumii
 *    i skarabeuszy) zmienia sie WYLACZNIE w `update()` z `runLogicStep` (staly krok),
 *    czasy w krokach (`desertCurse.ts`), zero Math.random / Date.now w logice;
 *  - obrazenia gracza niosa DamageSource `curse_fog`;
 *  - lokalne: wyglad mgly, pyl, drzenie, bandaze, dzwiek, komunikaty.
 *  - max 1 aktywna klatwa na mape.
 */

export interface CurseHooks {
    /** Gracz (null = brak / martwy). */
    getPlayer(): { x: number; y: number; isDashing: boolean } | null;
    /** Czy klatwa moze dzialac (gra w toku). */
    isLive(): boolean;
    /** Przeszkody ruchu (buildings) — mumia i stado ich nie przechodza. */
    getObstacles(): ICollidable[];
    /** Zadaj obrazenia graczowi (guardy nietykalnosci / tutorialu po stronie main.ts). */
    damagePlayer(amount: number, src: DamageSource): void;
    notify(key: 'warn' | 'awake' | 'lifted' | 'faded' | 'ra' | 'archeo'): void;
    /** Nick gracza do kartusza na piramidzie (E5 flex). */
    playerName(): string;
}

interface PyrState {
    pyramid: Pyramid;
    hits: { step: number; dmg: number }[];
    cooldown: number;
    warned: boolean;
    stage: number;
    /** E7 — co budzi ta piramida (DESERT_CURSE.pyramidEvents[indeks]). */
    event: 'mummy' | 'ra' | 'archaeologists';
    /** E7 — zdarzenie jednorazowe juz zuzyte (Ra / archeolodzy). */
    spent: boolean;
}

interface ActiveCurse {
    p: PyrState;
    t: number;
    homeX: number;
    homeY: number;
    mummy: Mummy | null;
    scarabs: Scarab[];
}

/**
 * Strefa zielonej mgly (stan gry: pozycja/polosie/czas/obrazenia; wyglad lokalny).
 * Wyglad = chmura super mocy Bek (uwaga Mariusza): pieczone kleby dymu `bakeSmokePuff`,
 * kazdy z wlasnym dryfem, obrotem i opoznieniem; bez obwodki. Strefa obrazen to ELIPSA
 * dopasowana do splaszczonego gazu (jak BURP_CONFIG.cloudHitX/Y) — rani to, co widac.
 */
interface FogPuff { s: PIXI.Sprite; dx: number; dy: number; spin: number; size: number; delay: number }
interface FogZone {
    x: number;
    y: number;
    rx: number;           // polos pozioma strefy obrazen
    ry: number;           // polos pionowa (gaz splaszczony — widok z gory)
    life: number;
    maxLife: number;
    dps: number;          // ciagle obrazenia (paczkami), 0 = brak
    oneShot: number;      // jednorazowe obrazenia przy wejsciu w strefe, 0 = brak
    hitDone: boolean;
    tick: number;
    view: PIXI.Container;
    puffs: FogPuff[];
}

/** Uklad klebow jak w Beku, ale gestszy (16 zamiast 11) — staly, bez RNG (nie migocze). */
const FOG_LAYOUT: ReadonlyArray<readonly [number, number, number, number]> = Array.from({ length: 16 }, (_, i) => {
    if (i === 0) return [0, 0, 1, 0] as const;
    const turn = (i * 0.618034) % 1;
    const dist = 0.28 + ((i * 37) % 10) / 24;      // 0.28-0.66 — nierowno, zeby nie bylo gwiazdki
    const size = 0.55 + ((i * 53) % 10) / 24;      // 0.55-0.93
    const delay = ((i * 29) % 10) / 70;            // 0-0.13
    return [turn, dist, size, delay] as const;
});

export class PyramidCurse {
    private pyrs: PyrState[];
    /**
     * Aktywne klatwy — KAZDA piramida niezaleznie (uwaga Mariusza 2026-09-28: druga piramide
     * mozna obudzic, gdy pierwsza trwa). Max = liczba piramid (3).
     */
    private actives: ActiveCurse[] = [];
    /** E7 — jednorazowe zdarzenia w toku. */
    private raEvents: RaWrath[] = [];
    private archGroups: ArchaeologistGroup[] = [];
    private fogs: FogZone[] = [];
    private stepNo = 0;

    constructor(
        pyramids: Pyramid[],
        private worldContainer: PIXI.Container,
        private effects: EffectsManager,
        private audio: AudioSys,
        private hooks: CurseHooks,
        /** Obrazenia per poziom trudnosci (CURSE_BY_DIFFICULTY[config.difficulty]). */
        private tuning: (typeof CURSE_BY_DIFFICULTY)[keyof typeof CURSE_BY_DIFFICULTY],
    ) {
        this.pyrs = pyramids.map((p, i) => ({
            pyramid: p, hits: [], cooldown: 0, warned: false, stage: 0,
            event: DESERT_CURSE.pyramidEvents[i] ?? 'mummy', spent: false,
        }));
        for (const s of this.pyrs) {
            s.pyramid.enableHitHooks(
                (dmg, x, y) => this.onPlayerHit(s, dmg, x, y),
                (x, y) => this.onEnemyHit(x, y),
            );
        }
    }

    private activeFor(s: PyrState): ActiveCurse | undefined {
        return this.actives.find(a => a.p === s);
    }

    // ── trafienia w piramide (wolane z Bullet/EnemyBullet — tez w kroku logiki) ──
    private onPlayerHit(s: PyrState, dmg: number, x: number, y: number): void {
        this.effects.spawnWallImpact(x, y);
        DesertJuice.active?.chip(x, y, 1);   // E5: odprysk kamienia
        this.audio.playHit('wall');
        if (s.spent || s.cooldown > 0 || this.activeFor(s)) return;
        s.hits.push({ step: this.stepNo, dmg });
    }

    private onEnemyHit(x: number, y: number): void {
        this.effects.spawnWallImpact(x, y);
    }

    /**
     * Kolizja kolo (r) vs AABB przeszkod: wypycha na zewnatrz najblizszej krawedzi.
     * Dwa przejscia wystarczaja na rogi. Filtr odleglosci tnie rzeke (~100 segmentow).
     */
    private resolve = (x: number, y: number, r: number): { x: number; y: number } => {
        const obs = this.hooks.getObstacles();
        for (let pass = 0; pass < 2; pass++) {
            for (const b of obs) {
                if (b.w <= 0 || b.h <= 0) continue;
                if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
                const cx = Math.max(b.x, Math.min(x, b.x + b.w));
                const cy = Math.max(b.y, Math.min(y, b.y + b.h));
                let dx = x - cx, dy = y - cy;
                const d = Math.hypot(dx, dy);
                if (d >= r) continue;
                if (d < 0.001) {
                    // srodek wewnatrz prostokata: wypchnij najkrotsza droga
                    const l = x - b.x, rr = b.x + b.w - x, t = y - b.y, bt = b.y + b.h - y;
                    const m = Math.min(l, rr, t, bt);
                    if (m === l) x = b.x - r; else if (m === rr) x = b.x + b.w + r;
                    else if (m === t) y = b.y - r; else y = b.y + b.h + r;
                    continue;
                }
                dx /= d; dy /= d;
                x = cx + dx * r;
                y = cy + dy * r;
            }
        }
        return { x, y };
    };

    /** Pociski gracza vs mumie/skarabeusze wszystkich klatw. Zwraca true, gdy pocisk zostal zuzyty. */
    public hitTestBullet(x: number, y: number, r: number, dmg: number): boolean {
        for (const a of this.actives) {
            for (const sc of a.scarabs) {
                if (!sc.alive || sc.state === 'attached') continue;
                const rr = DESERT_CURSE.scarabHitRadius + r;
                if ((sc.x - x) ** 2 + (sc.y - y) ** 2 < rr * rr) {
                    sc.kill();
                    this.effects.spawnScarabSquash(sc.x, sc.y);
                    this.audio.playHit('enemy');
                    return true;
                }
            }
            const m = a.mummy;
            if (m && m.alive) {
                const rr = DESERT_CURSE.mummyHitRadius + r;
                // trafienie liczone w tulow (srodek ~30 px nad stopami przy skali 1.5)
                if ((m.x - x) ** 2 + (m.y - 30 - y) ** 2 < rr * rr) {
                    this.effects.spawnEnemyHitSparks(x, y, 0xe6dcc0);
                    this.effects.spawnFloatingText(x, y - 15, `${Math.round(dmg)}`, 0xffffff);
                    this.audio.playHit('enemy');
                    if (m.hit(dmg)) this.lift(a);
                    return true;
                }
            }
        }
        return false;
    }

    /** Krok logiki. */
    public update(): void {
        this.stepNo++;
        const C = DESERT_CURSE;
        const live = this.hooks.isLive();

        for (const s of this.pyrs) {
            while (s.hits.length && this.stepNo - s.hits[0].step > C.windowSteps) s.hits.shift();
            if (s.cooldown > 0) s.cooldown--;
            const act = this.activeFor(s);
            let sum = 0;
            for (const h of s.hits) sum += h.dmg;
            const k = s.spent || s.cooldown > 0 || act ? 0 : sum / C.threshold;
            if (k >= C.telegraphFrac && live) {
                s.pyramid.setCurseTelegraph(Math.min(1, k), this.stepNo);
                if (this.stepNo % 8 === 0) {
                    const v = s.pyramid.getVisual();
                    this.effects.spawnSoftPuff(v.x + ((this.stepNo * 37) % 80) - 40, v.y - v.size / 2, 0xe0c890, 0.9);
                }
                if (!s.warned) { s.warned = true; this.hooks.notify('warn'); }
            } else {
                s.pyramid.setCurseTelegraph(act && act.t < C.emergeSteps ? 1 : 0, this.stepNo);
                if (sum === 0) s.warned = false;
            }
            if (sum >= C.threshold && !act && !s.spent && s.cooldown === 0 && live) this.trigger(s);
        }

        const pl = live ? this.hooks.getPlayer() : null;
        this.updateFogs(pl);

        // E7: Zemsta Ra (stan gry: kule i obrazenia) + archeolodzy (tylko wizual)
        for (let i = this.raEvents.length - 1; i >= 0; i--) {
            this.raEvents[i].update();
            if (this.raEvents[i].done) this.raEvents.splice(i, 1);
        }
        for (let i = this.archGroups.length - 1; i >= 0; i--) {
            this.archGroups[i].update(pl ? pl.x : null, () => this.audio.playArchaeologistShout());
            if (this.archGroups[i].done) this.archGroups.splice(i, 1);
        }

        let nearest = 1e9;
        for (const a of [...this.actives]) nearest = Math.min(nearest, this.stepCurse(a, pl));
        if (pl && nearest < 500) this.audio.playScarabSkitter(1 - nearest / 500);
    }

    /** Krok jednej klatwy. Zwraca dystans najblizszego skarabeusza do gracza (dzwiek). */
    private stepCurse(a: ActiveCurse, pl: { x: number; y: number; isDashing: boolean } | null): number {
        const C = DESERT_CURSE;
        a.t++;
        const v = a.p.pyramid.getVisual();
        if (a.t < C.emergeSteps) return 1e9;
        if (!a.mummy) {
            a.mummy = new Mummy(a.homeX, a.homeY, this.worldContainer);
            for (let i = 0; i < C.scarabCount; i++) {
                const ang = (i / C.scarabCount) * Math.PI * 2;
                const p = this.resolve(a.homeX + Math.cos(ang) * 26, a.homeY - 12 + Math.sin(ang) * 14, C.scarabBodyRadius);
                a.scarabs.push(new Scarab(p.x, p.y, i, this.worldContainer));
            }
            this.audio.playMummyRoar();
            this.effects.shake(5, 10);
        }

        const m = a.mummy;
        if (a.t >= C.emergeSteps + C.lifeSteps) { this.fade(a); return 1e9; }

        // Mumia: smycz 900 px od piramidy (pilnuje grobowca)
        const inLeash = !!pl && Math.hypot(pl.x - v.x, pl.y - v.y) < C.leashRange;
        if (pl && inLeash) m.step(pl.x, pl.y, this.resolve);
        else m.step(a.homeX, a.homeY - 20, this.resolve);

        // Skarabeusze: szukaja gracza na CALEJ mapie; wspinacze na kadlub (limit), reszta krazy
        let attached = 0;
        for (const sc of a.scarabs) if (sc.alive && sc.state === 'attached') attached++;
        let nearest = 1e9;
        for (const sc of a.scarabs) {
            if (!sc.alive) continue;
            const canAttach = attached < C.maxAttached;
            if (sc.step(this.stepNo, pl ? pl.x : null, pl ? pl.y : null, m.x, m.y, canAttach, this.resolve)) attached++;
            // Oblepiaja czolg (przeszkadzaja), ale NIE zadaja obrazen. Dash je strzasa.
            if (sc.state === 'attached' && pl && pl.isDashing) sc.detach(pl.x, pl.y);
            if (pl) nearest = Math.min(nearest, Math.hypot(sc.x - pl.x, sc.y - pl.y));
        }
        if (a.t % 300 === 0) this.audio.playMummyRoar();
        return nearest;
    }

    // ── mgla: stan (obrazenia) w kroku logiki, wyglad lokalny ──
    /** `r` = polos pozioma strefy obrazen; pionowa = r * 0.72 (splaszczenie gazu). */
    private spawnFog(x: number, y: number, r: number, steps: number, dps: number, oneShot: number): void {
        const view = new PIXI.Container();
        view.zIndex = 1400;                  // nad czolgami — gracz ma widziec, ze jest w chmurze
        view.x = x; view.y = y;
        const tex = bakeSmokePuff();
        const puffs: FogPuff[] = [];
        FOG_LAYOUT.forEach(([turn, dist, size, delay], i) => {
            const a = turn * Math.PI * 2;
            const sp = new PIXI.Sprite(tex);
            sp.anchor.set(0.5);
            sp.tint = CURSE_FOG_COLOR;
            sp.rotation = a;
            sp.alpha = 0;
            sp.scale.set(0.01);
            view.addChild(sp);
            // Naprzemienny obrot — chmura „mieli sie" zamiast wirowac w calosci (jak Bek)
            puffs.push({ s: sp, dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, spin: i % 2 ? 0.006 : -0.005, size, delay });
        });
        this.worldContainer.addChild(view);
        this.fogs.push({ x, y, rx: r, ry: r * 0.72, life: steps, maxLife: steps, dps, oneShot, hitDone: false, tick: 0, view, puffs });
    }

    private updateFogs(pl: { x: number; y: number } | null): void {
        const C = DESERT_CURSE;
        for (let i = this.fogs.length - 1; i >= 0; i--) {
            const f = this.fogs[i];
            f.life--;
            const age = f.maxLife - f.life;              // kroki od wybuchu
            const nx = pl ? (pl.x - f.x) / f.rx : 9;
            const ny = pl ? (pl.y - f.y) / f.ry : 9;
            const inside = nx * nx + ny * ny <= 1;
            if (inside && f.oneShot > 0 && !f.hitDone) {
                f.hitDone = true;
                this.hooks.damagePlayer(f.oneShot, SRC_CURSE_FOG);
            }
            if (inside && f.dps > 0) {
                f.tick++;
                if (f.tick >= C.damageTickSteps) {
                    f.tick = 0;
                    this.hooks.damagePlayer(f.dps * (C.damageTickSteps / 60), SRC_CURSE_FOG);
                }
            } else {
                f.tick = 0;
            }
            // Animacja jak Bek: buchniecie (rozrost) -> stanie -> rozwianie w ostatnich 30%
            const expand = Math.max(1, Math.round(f.maxLife * 0.16));
            const fadeFrom = f.maxLife * 0.7;
            let gone = 1;
            if (age > fadeFrom) { const k = (age - fadeFrom) / (f.maxLife - fadeFrom); gone = (1 - k) * (1 - k); }
            const te = Math.min(1, age / expand);
            const creep = 1 + 0.08 * (age / f.maxLife);
            // Promien wizualny dobrany tak, by dryf klebow pokrywal strefe obrazen (Bek: hit ~0.54 R)
            const R = f.rx / 0.54;
            const MAX_SCALE = (R * 0.95) / 128;
            const DRIFT = R * 0.52;
            for (const p of f.puffs) {
                const tt = Math.min(1, Math.max(0, (te - p.delay) / (1 - p.delay)));
                const ease = 1 - (1 - tt) * (1 - tt);
                const sc = MAX_SCALE * p.size * (0.3 + 0.7 * ease) * creep;
                p.s.scale.set(sc, sc * 0.78);
                p.s.x = p.dx * DRIFT * ease * creep;
                p.s.y = p.dy * DRIFT * 0.72 * ease * creep;
                p.s.rotation += p.spin;
                p.s.alpha = CURSE_FOG_ALPHA * Math.min(1, tt / 0.12) * gone;
            }
            if (f.life <= 0) {
                f.view.destroy({ children: true });   // tekstura zostaje w cache Tier3Bakera
                this.fogs.splice(i, 1);
            }
        }
    }

    private trigger(s: PyrState): void {
        const C = DESERT_CURSE;
        const v = s.pyramid.getVisual();
        s.hits.length = 0;
        s.warned = false;
        s.stage = Math.min(3, s.stage + 1);
        s.pyramid.setDamageStage(s.stage);
        // Wejscie grobowca u podstawy sciany N; punkt startu poza hitboxem piramidy
        // (size/2 + pad 15) i poza promieniem ciala mumii.
        const homeX = v.x;
        const homeY = v.y - v.size / 2 - 15 - C.mummyBodyRadius - 6;

        // E7: jednorazowe zdarzenia innych piramid
        if (s.event === 'ra') {
            s.spent = true;
            this.raEvents.push(new RaWrath(v.x, v.y, v.size, this.worldContainer, this.effects, this.audio, {
                getPlayer: () => (this.hooks.isLive() ? this.hooks.getPlayer() : null),
                damagePlayer: (amount) => this.hooks.damagePlayer(amount, SRC_RA_FIRE),
                balls: this.tuning.raBalls,
                dmg: this.tuning.raDmg,
                directEvery: this.tuning.raDirectEvery,
            }));
            this.hooks.notify('ra');
            return;
        }
        if (s.event === 'archaeologists') {
            s.spent = true;
            this.effects.shake(4, 8);
            for (let i = 0; i < 6; i++) this.effects.spawnSoftPuff(homeX + (i - 2.5) * 12, homeY, 0xe0c890, 1.2);
            this.archGroups.push(new ArchaeologistGroup(homeX, homeY + 10, C.archaeologistCount, this.worldContainer));
            this.hooks.notify('archeo');
            return;
        }

        this.actives.push({ p: s, t: 0, homeX, homeY, mummy: null, scarabs: [] });
        // WYRZUT POWIETRZA: fala + podmuch pylu + mgla
        this.effects.shake(8, 16);
        this.effects.spawnShockwaveRing(homeX, homeY, 200, 0x7dff6a);
        this.effects.spawnShockwaveRing(homeX, homeY, 110, 0xe0c890);
        for (let i = 0; i < 10; i++) {
            const ang = -Math.PI / 2 + (i / 9 - 0.5) * 1.6;   // wachlarz na N (od piramidy)
            this.effects.spawnSoftPuff(homeX + Math.cos(ang) * 30, homeY + Math.sin(ang) * 30, 0xe0c890, 1.4);
        }
        this.spawnFog(homeX, homeY - C.fogRadius * 0.35, C.fogRadius, C.fogSteps, this.tuning.fogDps, 0);
        this.audio.playCurseBlast();
        this.hooks.notify('awake');
    }

    /**
     * Mumia zabita — KLATWA ZDJETA (flex) + chmurka smierci (-25 HP w obrebie).
     * Uwaga Mariusza: zabicie mumii ZABIJA jej skarabeusze (chrupniecie kazdego).
     * Ta piramida spi 60 s; pozostale mozna budzic od razu.
     */
    private lift(a: ActiveCurse): void {
        const C = DESERT_CURSE;
        const m = a.mummy!;
        this.effects.spawnBandageBurst(m.x, m.y - 30);
        this.spawnFog(m.x, m.y - 20, C.deathCloudRadius, C.deathCloudSteps, 0, this.tuning.deathCloudDmg);
        for (const sc of a.scarabs) {
            if (!sc.alive) continue;
            this.effects.spawnScarabSquash(sc.x, sc.y);
            sc.kill();
        }
        const v = a.p.pyramid.getVisual();
        this.effects.spawnCurseLifted(v.x, v.y);
        a.p.pyramid.flashPyramidion(120);                    // E5 flex: rozblysk szczytu
        a.p.pyramid.showCartouche(this.hooks.playerName());   // E5 flex: kartusz z nickiem
        this.effects.spawnShockwaveRing(v.x, v.y, 220, 0xffd84a);
        this.effects.shake(6, 12);
        this.audio.playCurseLifted();
        this.hooks.notify('lifted');
        this.end(a);
    }

    /** Klatwa wygasla sama — stado wraca do grobowca w chmurze. */
    private fade(a: ActiveCurse): void {
        if (a.mummy?.alive) this.effects.spawnSoftPuff(a.mummy.x, a.mummy.y - 30, 0x7dff6a, 2);
        for (const sc of a.scarabs) if (sc.alive) this.effects.spawnSoftPuff(sc.x, sc.y, 0x7dff6a, 0.8);
        this.hooks.notify('faded');
        this.end(a);
    }

    private end(a: ActiveCurse): void {
        a.p.cooldown = DESERT_CURSE.cooldownSteps;
        a.mummy?.destroy();
        for (const sc of a.scarabs) sc.destroy();
        const i = this.actives.indexOf(a);
        if (i >= 0) this.actives.splice(i, 1);
    }
}
