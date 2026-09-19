import type { SigmaSnapshot } from './SigmaTest';
import type { SigmaEvent } from './sigmaFlag';

/**
 * oracles.ts — SigmaTester: ASERCJE nad {snapshoty, zdarzenia} meczu. Kontrakt: docs/sigma-tester/ORACLES.md.
 * Czyste funkcje: zero zaleznosci od PIXI/main — dzialaja w przegladarce (window.__sigmaTest.oracles)
 * I w Node (runner importuje ten sam modul przez Playwright evaluate). Kazdy oracle <= ~40 linii.
 *
 * Wejscie: seria snapshotow (co ~1 s) + ring zdarzen z calego meczu. Wyjscie: Violation[] z id checklisty.
 * Severity: P0 = crash/zawis/przenikanie, P1 = zla regula gry, P2 = AI/UX, P3 = kosmetyka.
 */

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';
export interface Violation { id: string; severity: Severity; msg: string; frame: number; evidence?: unknown }
export type Stamped<E> = E & { frame: number; ts: number };
export interface OracleInput { snaps: SigmaSnapshot[]; events: Stamped<SigmaEvent>[]; matchFrames: number }
export type Oracle = { id: string; title: string; run: (inp: OracleInput) => Violation[] };

const aabbHit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ── A. Spawn & placement ─────────────────────────────────────────────────
const A1: Oracle = {
    id: 'A1', title: 'spawn nie koliduje AABB z buildings/solidBuildings',
    run: ({ snaps, events }) => {
        const out: Violation[] = [];
        // solidy z najblizszego snapshotu (mur Krolowej rosnie — bierzemy stan przy spawnie)
        // rola wroga znana dopiero ze snapshotu (attachGuard/castleRole po konstruktorze) — mapa id -> role
        const roleOf = new Map<number, string | null>();
        for (const s of snaps) for (const e of s.enemies) if (!roleOf.has(e.id)) roleOf.set(e.id, e.role);
        for (const ev of events) {
            if (ev.t !== 'spawn') continue;
            const snap = snaps.find(s => s.frame >= ev.frame) ?? snaps[snaps.length - 1];
            if (!snap) continue;
            const box = { x: ev.x, y: ev.y, w: ev.w, h: ev.h };
            const hit = snap.buildings.find(b => aabbHit(box, b)) ?? snap.solids.find(b => aabbHit(box, b));
            if (!hit) continue;
            // CTF guard: legacy AI bez kolizji (orbituje wokol flagi przez mury fortecy) — znane, kosmetyka P3, nie regula gry
            const guard = ev.kind === 'enemy' && roleOf.get(ev.id) === 'guard';
            out.push({ id: 'A1', severity: guard ? 'P3' : 'P1', frame: ev.frame, msg: `spawn ${ev.kind}${guard ? ' (guard, legacy bez kolizji)' : ''} @${Math.round(ev.x + ev.w / 2)},${Math.round(ev.y + ev.h / 2)} w kolizji z ${JSON.stringify(hit)}`, evidence: { ev, hit } });
        }
        return out.slice(0, 20);
    },
};
const A2: Oracle = {
    id: 'A2', title: 'spawn w granicach swiata',
    run: ({ snaps, events }) => {
        const w = snaps[0]?.world.w ?? 3000, h = snaps[0]?.world.h ?? 3000;
        return events.filter((e): e is Stamped<Extract<SigmaEvent, { t: 'spawn' }>> => e.t === 'spawn' && (e.x < 0 || e.y < 0 || e.x + e.w > w || e.y + e.h > h))
            .slice(0, 10).map(e => ({ id: 'A2', severity: 'P1', frame: e.frame, msg: `spawn ${e.kind} poza swiatem @${Math.round(e.x)},${Math.round(e.y)}` }));
    },
};

// ── C. Enemy AI — ruch ───────────────────────────────────────────────────
const C2: Oracle = {
    id: 'C2', title: 'wrog nie utyka o geometrie > 3 s',
    run: ({ snaps }) => {
        const out: Violation[] = []; const seen = new Set<number>();
        for (const s of snaps) for (const e of s.enemies) {
            if (e.active && e.stuck > 180 && !seen.has(e.id)) { seen.add(e.id); out.push({ id: 'C2', severity: 'P2', frame: s.frame, msg: `wrog #${e.id} (${e.kind}${e.role ? '/' + e.role : ''}) utknal ${Math.round(e.stuck / 60)} s @${Math.round(e.x)},${Math.round(e.y)}` }); }
        }
        return out.slice(0, 10);
    },
};

// ── D. Enemy AI — walka ──────────────────────────────────────────────────
const D1: Oracle = {
    id: 'D1', title: 'wrog w zasiegu strzela (nie "niemy")',
    run: ({ snaps }) => {
        // wrog zywy >= 8 s, w zasiegu 500 px od gracza przez wiekszosc czasu i 0 strzalow => niemy (role bez strzalu pomijamy)
        const first = new Map<number, number>(), inRange = new Map<number, number>(), last = new Map<number, SigmaSnapshot['enemies'][number]>();
        // tylko zywy mecz — snapshoty po gameover/victory nie licza sie jako "w zasiegu"
        for (const s of snaps.filter(x => x.gameState === 'PLAYING')) for (const e of s.enemies) {
            // role bez strzalu / ze strzalem warunkowym: maszyny Zamku, CTF guard (strzela tylko w chase/alert, patrol milczy z zalozenia)
            if (!e.active || e.role === 'taran' || e.role === 'katapulta' || e.role === 'trebuchet' || e.role === 'guard') continue;
            if (!first.has(e.id)) first.set(e.id, s.frame);
            if (s.player && Math.hypot(e.x - s.player.x, e.y - s.player.y) < 500) inRange.set(e.id, (inRange.get(e.id) ?? 0) + 1);
            last.set(e.id, e);
        }
        const out: Violation[] = [];
        for (const [id, e] of last) { const alive = snaps.length && (snaps[snaps.length - 1].frame - (first.get(id) ?? 0)); if (alive > 480 && (inRange.get(id) ?? 0) >= 6 && e.shots === 0) out.push({ id: 'D1', severity: 'P2', frame: snaps[snaps.length - 1].frame, msg: `wrog #${id} (${e.kind}) w zasiegu ${inRange.get(id)} s, 0 strzalow` }); }
        return out.slice(0, 10);
    },
};

/** D5 progi: kat lotu vs widoczna lufa (25 st.) i wylot vs koniec lufy (30 px). */
export const D5_MAX_ANGLE_DEG = 25;
export const D5_MAX_MUZZLE_PX = 30;
type ShotEv = Extract<SigmaEvent, { t: 'shot' }>;
/**
 * D5 — rozjazd jednego strzalu. `angle` to SRODEK serii (rozrzut bossa 0.30 rad dokleja main.ts po
 * zwroceniu strzalu), wiec porownanie srodka z lufa jest uczciwe i nie wymaga tolerancji na spread.
 * Kwantyzacja atlasu bake (36 klatek = 10 st.) daje max 5 st. — duzo ponizej progu.
 */
export function shotMismatch(e: ShotEv): { deg: number; px: number; bad: boolean } {
    let d = e.angle - e.barrel;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const deg = Math.abs(d) * 180 / Math.PI;
    const px = Math.hypot(e.x - (e.cx + Math.cos(e.barrel) * e.muzzle), e.y - (e.cy + Math.sin(e.barrel) * e.muzzle));
    return { deg, px, bad: deg > D5_MAX_ANGLE_DEG || px > D5_MAX_MUZZLE_PX };
}
const D5: Oracle = {
    id: 'D5', title: 'strzal wroga wychodzi z WIDOCZNEJ lufy (kat lotu i wylot) — zero smierci "znikad"',
    run: ({ events }) => {
        // agregat per (typ wroga, rola): liczba zlych strzalow, max rozjazdu i pierwszy przyklad
        const agg = new Map<string, { n: number; bad: number; maxDeg: number; maxPx: number; first: Stamped<ShotEv> | null }>();
        for (const ev of events) {
            if (ev.t !== 'shot') continue;
            const e = ev as Stamped<ShotEv>;
            const key = `${e.kind}${e.role ? '/' + e.role : ''}`;
            const a = agg.get(key) ?? { n: 0, bad: 0, maxDeg: 0, maxPx: 0, first: null };
            const m = shotMismatch(e);
            a.n++;
            if (m.bad) { a.bad++; if (!a.first) a.first = e; }
            a.maxDeg = Math.max(a.maxDeg, m.deg); a.maxPx = Math.max(a.maxPx, m.px);
            agg.set(key, a);
        }
        const out: Violation[] = [];
        for (const [key, a] of agg) {
            if (!a.bad || !a.first) continue;
            out.push({ id: 'D5', severity: 'P0', frame: a.first.frame,
                msg: `${key}: ${a.bad}/${a.n} strzalow nie z lufy (max ${a.maxDeg.toFixed(0)} st., wylot ${a.maxPx.toFixed(0)} px od konca lufy; progi ${D5_MAX_ANGLE_DEG} st./${D5_MAX_MUZZLE_PX} px)`,
                evidence: { first: a.first, ...shotMismatch(a.first) } });
        }
        return out.slice(0, 10);
    },
};

// ── E. Pociski ───────────────────────────────────────────────────────────
const E1: Oracle = {
    id: 'E1', title: 'brak leaku pociskow (licznik nie rosnie monotonicznie)',
    run: ({ snaps }) => {
        if (snaps.length < 20) return [];
        const half = Math.floor(snaps.length / 2);
        const avg = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
        const b1 = avg(snaps.slice(0, half).map(s => s.bullets + s.enemyBullets)), b2 = avg(snaps.slice(half).map(s => s.bullets + s.enemyBullets));
        const maxLive = Math.max(...snaps.map(s => s.bullets + s.enemyBullets));
        return (b2 > b1 * 3 + 40 && maxLive > 150) ? [{ id: 'E1', severity: 'P0', frame: snaps[snaps.length - 1].frame, msg: `pociski rosna: srednia ${b1.toFixed(0)} -> ${b2.toFixed(0)}, max ${maxLive}` }] : [];
    },
};
const E3: Oracle = {
    id: 'E3', title: 'kazde takeDamage niesie DamageSource',
    run: ({ events }) => events.filter(e => e.t === 'damage' && (!e.src || e.src === 'undefined')).slice(0, 5).map(e => ({ id: 'E3', severity: 'P1', frame: e.frame, msg: 'damage bez zrodla' })),
};

// ── F. Inwarianty ────────────────────────────────────────────────────────
const F1: Oracle = {
    id: 'F1', title: 'HP w [0, maxHp] (gracz i wrogowie)',
    run: ({ snaps }) => {
        const out: Violation[] = [];
        for (const s of snaps) {
            if (s.player && (s.player.hp > s.player.maxHp + 0.01 || s.player.hp < -0.01)) out.push({ id: 'F1', severity: 'P1', frame: s.frame, msg: `gracz hp ${s.player.hp}/${s.player.maxHp}` });
            for (const e of s.enemies) if (e.active && e.hp > e.maxHp + 0.01) out.push({ id: 'F1', severity: 'P1', frame: s.frame, msg: `wrog #${e.id} hp ${e.hp} > max ${e.maxHp}` });
            if (out.length > 5) break;
        }
        return out;
    },
};
const F2: Oracle = {
    id: 'F2', title: 'pozycje bez NaN/Infinity',
    run: ({ snaps }) => {
        const bad = (v: number): boolean => !Number.isFinite(v);
        for (const s of snaps) {
            if (s.player && (bad(s.player.x) || bad(s.player.y))) return [{ id: 'F2', severity: 'P0', frame: s.frame, msg: 'gracz NaN/Inf' }];
            const e = s.enemies.find(en => bad(en.x) || bad(en.y)); if (e) return [{ id: 'F2', severity: 'P0', frame: s.frame, msg: `wrog #${e.id} NaN/Inf` }];
        }
        return [];
    },
};
const F3: Oracle = {
    id: 'F3', title: 'liczniki encji/czastek nie rosna monotonicznie (leak)',
    run: ({ snaps }) => {
        if (snaps.length < 30) return [];
        const p = snaps.map(s => s.perf.particles); const third = Math.floor(p.length / 3);
        const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
        const a1 = avg(p.slice(0, third)), a3 = avg(p.slice(2 * third));
        return a3 > a1 * 2.5 + 200 ? [{ id: 'F3', severity: 'P1', frame: snaps[snaps.length - 1].frame, msg: `czastki rosna ${a1.toFixed(0)} -> ${a3.toFixed(0)}` }] : [];
    },
};
const F4: Oracle = {
    id: 'F4', title: 'freeze schodzi (brak latcha)',
    run: ({ snaps }) => {
        const frozenSince = new Map<number, number>(); const out: Violation[] = [];
        for (const s of snaps) for (const e of s.enemies) {
            if (e.frozen) { if (!frozenSince.has(e.id)) frozenSince.set(e.id, s.frame); else if (s.frame - (frozenSince.get(e.id) ?? 0) > 60 * 20) { out.push({ id: 'F4', severity: 'P1', frame: s.frame, msg: `wrog #${e.id} zamrozony > 20 s` }); frozenSince.delete(e.id); } }
            else frozenSince.delete(e.id);
        }
        return out.slice(0, 5);
    },
};

// ── G. Oracles scenariuszy ───────────────────────────────────────────────
const G1: Oracle = {
    id: 'G1', title: 'mecz konczy sie (outcome) albo trwa < limit; nie zawisa',
    run: ({ snaps, events, matchFrames }) => {
        const last = snaps[snaps.length - 1]; if (!last) return [];
        const ended = events.some(e => e.t === 'outcome');
        if (ended) return [];
        // KTB/CTF nie maja timera — brak outcome jest OK; Queen ma 180 s (v0.188.0) => po 200 s bez outcome = zawis.
        // Prog MUSI isc za matchMs, inaczej bot zglasza falszywe P0 przy kazdym meczu Krolowej.
        if (last.config?.scenario === 'save_queen' && matchFrames > 60 * 200) return [{ id: 'G1', severity: 'P0', frame: last.frame, msg: 'Krolowa: > 200 s bez outcome (zegar nie schodzi?)' }];
        if (last.gameState !== 'PLAYING') return [{ id: 'G1', severity: 'P0', frame: last.frame, msg: `stan ${last.gameState} bez zdarzenia outcome` }];
        return [];
    },
};
const G5: Oracle = {
    id: 'G5', title: 'submit wyniku: bot/castle/queen ZABLOKOWANE',
    run: ({ events }) => events.filter(e => e.t === 'submitAttempt' && !e.blocked).map(e => ({ id: 'G5', severity: 'P0', frame: e.frame, msg: `submit NIE zablokowany dla ${(e as { mode: string }).mode}` })),
};

// ── J. Mobile / uklad ekranu (S5b) ───────────────────────────────────────
// Wejscie: snapshot.layout (runner dokleja raz na sekunde). HUD = canvas (prostokaty z klatki), kontrolki = DOM.
// Playwright != A54: to geometria ukladu, nie wydajnosc ani odczucie palca.
type LRect = { kind: string; x: number; y: number; w: number; h: number };
const family = (r: LRect): string => r.kind.split('-')[0];
const overlap = (a: LRect, b: LRect): number => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 4 && h > 4 ? Math.round(w * h) : 0; // tolerancja 4 px (antyaliasing, obrysy)
};
const J1: Oracle = {
    id: 'J1', title: 'brak scrolla strony w meczu (CTA ekranu koncowego sprawdza runner)',
    run: ({ snaps }) => {
        const s = snaps.find(x => x.gameState === 'PLAYING' && x.layout && (x.layout.scrollW > x.layout.vw + 1 || x.layout.scrollH > x.layout.vh + 1));
        return s?.layout ? [{ id: 'J1', severity: 'P2', frame: s.frame, msg: `strona przewija sie: ${s.layout.scrollW}x${s.layout.scrollH} > ekran ${s.layout.vw}x${s.layout.vh}` }] : [];
    },
};
const J2: Oracle = {
    id: 'J2', title: 'HUD bez nachodzenia (pigulki, znaczniki, pasek mocy, joysticki, przyciski, wersja)',
    run: ({ snaps }) => {
        const out: Violation[] = []; const seen = new Set<string>();
        for (const s of snaps) {
            if (s.gameState !== 'PLAYING' || !s.layout) continue;
            const all: LRect[] = [...s.layout.hud, ...s.layout.dom];
            for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
                const a = all[i], b = all[j], fa = family(a), fb = family(b);
                if (fa === fb && fa !== 'pill') continue; // stos notyfikacji, znaczniki obok siebie, joystick L/R — z zalozenia
                const area = overlap(a, b); if (!area) continue;
                const key = [fa === 'marker' ? 'marker' : a.kind, fb === 'marker' ? 'marker' : b.kind].sort().join(' x ');
                if (seen.has(key)) continue; seen.add(key);
                // P1 = zasloniety element sterujacy/wynik (pigulka, przycisk, joystick); P2 = reszta (napis wersji, notyfikacja)
                const critical = ['pill', 'superbtn', 'joystick', 'powerbar'];
                const sev: Severity = (critical.includes(fa) && critical.includes(fb)) || ((fa === 'marker' || fb === 'marker') && (critical.includes(fa) || critical.includes(fb))) ? 'P1' : 'P2';
                out.push({ id: 'J2', severity: sev, frame: s.frame, msg: `${a.kind} nachodzi na ${b.kind} (${area} px², ekran ${s.layout.vw}x${s.layout.vh})`, evidence: { a, b } });
            }
        }
        return out.slice(0, 15);
    },
};
const J4: Oracle = {
    id: 'J4', title: 'tap-targety kontrolek dotykowych >= 44 px',
    run: ({ snaps }) => {
        const s = snaps.find(x => x.screen.isTouch && x.gameState === 'PLAYING' && x.layout && x.layout.dom.length);
        if (!s?.layout) return [];
        return s.layout.dom.filter(r => (family(r) === 'superbtn' || family(r) === 'joystick') && Math.min(r.w, r.h) < 44)
            .map(r => ({ id: 'J4', severity: 'P2' as Severity, frame: s.frame, msg: `${r.kind} ${r.w}x${r.h} px < 44 px (ekran ${s.layout!.vw}x${s.layout!.vh})` }));
    },
};
const J8: Oracle = {
    id: 'J8', title: 'wrog i znajdzka czytelne przy zoomie mobile (rozmiar na ekranie)',
    run: ({ snaps }) => {
        const s = snaps.find(x => x.screen.isTouch && x.player);
        if (!s) return [];
        const z = s.screen.zoom, out: Violation[] = [];
        // hitbox wroga 40 px, znajdzki 32 px (spawn events) — progi czytelnosci sylwetki na telefonie
        if (40 * z < 18) out.push({ id: 'J8', severity: 'P2', frame: s.frame, msg: `wrog ${Math.round(40 * z)} px na ekranie przy zoom ${z} (< 18 px)` });
        if (32 * z < 14) out.push({ id: 'J8', severity: 'P3', frame: s.frame, msg: `znajdzka ${Math.round(32 * z)} px na ekranie przy zoom ${z} (< 14 px)` });
        return out;
    },
};

// ── L. Stabilnosc ────────────────────────────────────────────────────────
const L1: Oracle = {
    id: 'L1', title: 'zero uncaught error / unhandled rejection',
    run: ({ events }) => events.filter(e => e.t === 'error').slice(0, 10).map(e => ({ id: 'L1', severity: 'P0', frame: e.frame, msg: (e as { msg: string }).msg.slice(0, 200), evidence: (e as { stack: string }).stack.slice(0, 600) })),
};

export const ORACLES: Oracle[] = [A1, A2, C2, D1, D5, E1, E3, F1, F2, F3, F4, G1, G5, J1, J2, J4, J8, L1];

export function runOracles(inp: OracleInput): Violation[] {
    const out: Violation[] = [];
    for (const o of ORACLES) { try { out.push(...o.run(inp)); } catch (err) { out.push({ id: o.id, severity: 'P3', frame: -1, msg: 'oracle crashed: ' + String((err as Error).message) }); } }
    return out;
}
