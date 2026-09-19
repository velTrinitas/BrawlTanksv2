#!/usr/bin/env node
/**
 * SigmaTester runner — odpala gre w Chrome (Playwright, kanal 'chrome' = zainstalowany Chrome, zero pobierania),
 * gra botem (polityka w przegladarce: window.__sigmaTest.bot), zbiera snapshoty/zdarzenia/zrzuty i uruchamia
 * oracles (docs/sigma-tester/ORACLES.md). Wynik: reports/<data>/<runId>.json + PNG + summary.md.
 *
 * Uzycie:
 *   npm run sigma -- --matrix smoke                    # 4 scenariusze x 90 s (wymaga dzialajacego dev/preview)
 *   npm run sigma -- --scenario save_queen --seed 7 --minutes 2 --mode play
 *   npm run sigma -- --matrix nightly --url http://localhost:5173/BrawlTanksv2/
 *   opcje: --url --scenario --map --brawler --diff --seed --minutes --mode(play|wallhug|idle|fuzz) --mobile --headed --out
 * Gra NIE wysyla wynikow/telemetrii w trybie ?bot=1 (guard w main.ts, oracle G5).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true'] : []).filter(Boolean));
const URL = (args.url ?? 'http://localhost:5175/BrawlTanksv2/').replace(/\/?$/, '/');
const OUT_ROOT = args.out ?? 'reports';
const HEADLESS = args.headed !== 'true';
// L4 (v0.187.0): --killctx zabija kontekst WebGL w 15. sekundzie meczu i sprawdza, czy gra
// pokazuje sciezke wyjscia zamiast bialego ekranu. Domyslnie OFF (konczy mecz).
const KILL_CTX = args.killctx === 'true';
const day = new Date().toISOString().slice(0, 10);
const outDir = path.join(OUT_ROOT, day);
fs.mkdirSync(outDir, { recursive: true });

const DEFAULT_MAP = { ktb: 'desert', ctf: 'fortified_ruins', castle: 'castle_grounds', save_queen: 'dungeon' };

function buildMatrix() {
    if (args.scenario || args.seed || args.mode) {
        return [{ scenario: args.scenario ?? 'ktb', map: args.map ?? DEFAULT_MAP[args.scenario ?? 'ktb'], brawler: args.brawler ?? 'twardy', diff: args.diff ?? 'normal', seed: Number(args.seed ?? 1), minutes: Number(args.minutes ?? 2), mode: args.mode ?? 'play', mobile: args.mobile === 'true' }];
    }
    const m = args.matrix ?? 'smoke';
    const runs = [];
    if (m === 'smoke') {
        let seed = 1;
        for (const sc of ['ktb', 'ctf', 'castle', 'save_queen']) runs.push({ scenario: sc, map: DEFAULT_MAP[sc], brawler: 'twardy', diff: 'normal', seed: seed++, minutes: Number(args.minutes ?? 1.5), mode: 'play', mobile: false });
        return runs;
    }
    // S5b mobile: 4 scenariusze @667x375 (typowy telefon w poziomie) + KTB/CTF @812x375 (dlugi ekran z notchem)
    if (m === 'mobile') {
        let s = 500;
        for (const sc of ['ktb', 'ctf', 'castle', 'save_queen']) runs.push({ scenario: sc, map: DEFAULT_MAP[sc], brawler: 'twardy', diff: 'normal', seed: s++, minutes: Number(args.minutes ?? 1.5), mode: 'play', mobile: true, vw: 667, vh: 375 });
        for (const sc of ['ktb', 'ctf']) runs.push({ scenario: sc, map: DEFAULT_MAP[sc], brawler: 'scout', diff: 'normal', seed: s++, minutes: Number(args.minutes ?? 1.5), mode: 'play', mobile: true, vw: 812, vh: 375 });
        return runs;
    }
    // nightly: KTB po mapach, reszta na swoich; 3 brawlerow x 2 trudnosci + tryby chaos
    let seed = 100;
    const brawlers = ['twardy', 'scout', 'heavy'], diffs = ['normal', 'hard'];
    for (const map of ['city', 'desert', 'tropics', 'arctic', 'mars']) for (const b of brawlers) runs.push({ scenario: 'ktb', map, brawler: b, diff: 'normal', seed: seed++, minutes: 2, mode: 'play', mobile: false });
    for (const sc of ['ctf', 'castle', 'save_queen']) for (const b of brawlers) for (const d of diffs) runs.push({ scenario: sc, map: DEFAULT_MAP[sc], brawler: b, diff: d, seed: seed++, minutes: 2.5, mode: 'play', mobile: false });
    for (const sc of ['ktb', 'ctf', 'castle', 'save_queen']) for (const mode of ['wallhug', 'idle', 'fuzz']) runs.push({ scenario: sc, map: DEFAULT_MAP[sc], brawler: 'twardy', diff: 'normal', seed: seed++, minutes: 1, mode, mobile: false });
    for (const sc of ['ktb', 'save_queen']) runs.push({ scenario: sc, map: DEFAULT_MAP[sc], brawler: 'twardy', diff: 'normal', seed: seed++, minutes: 1.5, mode: 'play', mobile: true });
    return runs;
}

async function runOne(browser, r, idx) {
    const vw = r.vw ?? 667, vh = r.vh ?? 375;
    const runId = `${String(idx).padStart(3, '0')}-${r.scenario}-${r.map}-${r.brawler}-${r.diff}-${r.mode}${r.mobile ? `-m${vw}x${vh}` : ''}-s${r.seed}`;
    const ctx = await browser.newContext(r.mobile
        ? { viewport: { width: vw, height: vh }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36' }
        : { viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e.message).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('response', (res) => { if (res.status() >= 400) consoleErrors.push(`HTTP ${res.status()} ${res.url().slice(0, 160)}`); });
    page.on('requestfailed', (req) => consoleErrors.push(`REQFAIL ${req.failure()?.errorText ?? ''} ${req.url().slice(0, 160)}`));
    const t0 = Date.now();
    const snaps = []; const shots = [];
    // S5b: naruszenia i proby liczone po stronie runnera (obrot, predkosc, zwiniecie, CTA) — dolaczane do oracles
    const extra = []; const probes = {}; let hudShot = false; let badShotShot = false; let lastShotFrame = 0;
    const extraIds = [{ id: 'J1', title: 'CTA ekranu koncowego w viewport' }];
    if (r.mobile) extraIds.push({ id: 'J7', title: 'obrot do pionu: ostrzezenie, pauza, powrot' }, { id: 'J9', title: 'predkosc gracza = baseSpeed x mnoznik mobile' }, { id: 'J10', title: 'zwiniecie karty: muzyka pauzowana i wznawiana' });
    let outcome = null; let firstDeathShot = false;
    try {
        await page.goto(`${URL}?bot=1&seed=${r.seed}&queentut=0&castletut=0&queen=1&castle=1`, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => !!window.__sigmaTest, null, { timeout: 60000 });
        // intro: klik START (bez rAF w headless tez dziala — DOM)
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /START/i.test(b.textContent)); b && b.click(); });
        await page.waitForTimeout(1200);
        await page.evaluate(async (cfg) => { await window.__sigmaTest.control.start(cfg); }, { scenario: r.scenario, map: r.map, brawler: r.brawler, difficulty: r.diff });
        await page.waitForTimeout(400);
        await page.evaluate((mode) => window.__sigmaTest.bot.setMode(mode), r.mode);
        const totalSec = Math.round(r.minutes * 60);
        for (let sec = 0; sec < totalSec; sec++) {
            // S4: przy niskim HP tick po 2 klatki i stop w PIERWSZEJ klatce z hp <= 0 — zrzut "death" pokazuje plansze
            // w chwili zgonu (skad przyszlo trafienie), a nie ekran koncowy (wczesniej: smierc i end card w tym samym ticku 60).
            const res = await page.evaluate((catchDeath) => {
                const T = window.__sigmaTest;
                for (let f = 0; f < 60;) {
                    const p = T.snapshot().player;
                    const chunk = catchDeath && p && p.hp > 0 && p.hp / p.maxHp < 0.35 ? 2 : 60 - f;
                    T.bot.tick(chunk); f += chunk;
                    if (f < 60) { const s = T.snapshot(); if ((s.player && s.player.hp <= 0) || s.gameState !== 'PLAYING') return { snap: s, rest: 60 - f }; }
                }
                return { snap: T.snapshot(), rest: 0 };
            }, !firstDeathShot);
            let snap = res.snap;
            if (!firstDeathShot && snap.player && snap.player.hp <= 0) { firstDeathShot = true; shots.push(await shot(page, outDir, runId, 'death')); }
            if (res.rest > 0) snap = await page.evaluate((n) => { window.__sigmaTest.bot.tick(n); return window.__sigmaTest.snapshot(); }, res.rest);
            snap.layout = await page.evaluate(() => window.__sigmaTest.layout()); // S5b: J1/J2/J4
            // S5b: jeden zrzut "hud" w pierwszej sekundzie nachodzenia znacznika/powiadomienia na panel lub kontrolke
            // (dowod wizualny dla J2 i persony — geometria sama nie wystarcza do zgloszenia)
            if (!hudShot && snap.gameState === 'PLAYING' && hudOverlap(snap.layout)) { hudShot = true; shots.push(await shot(page, outDir, runId, 'hud')); }
            // D5: dowod wizualny "strzal nie z lufy" — zrzut w sekundzie, w ktorej padl pierwszy zly strzal
            if (!badShotShot && snap.gameState === 'PLAYING' && await page.evaluate((f) => window.__sigmaTest.oracles.badShotSince(f), lastShotFrame)) { badShotShot = true; shots.push(await shot(page, outDir, runId, 'shot')); }
            lastShotFrame = snap.frame;
            snaps.push(snap);
            if (sec === 2) shots.push(await shot(page, outDir, runId, 'start'));
            if (r.mobile && snap.gameState === 'PLAYING') {
                if (sec === 1) await probeSpeed(page, probes, extra);
                if (sec === 10) await probeVisibility(page, probes, extra);
                if (sec === 20) await probePortrait(page, probes, extra, shots, runId, vw, vh);
            }
            // L4 (--killctx): osobny przebieg, bo konczy mecz — nie mieszac z innymi probami.
            if (KILL_CTX && !probes.l4 && snap.gameState === 'PLAYING' && sec === 15) {
                await probeContextLoss(page, probes, extra, shots, runId);
            }
            if (snap.gameState !== 'PLAYING') {
                outcome = snap.gameState;
                // L4: pod --killctx mecz KONCZY sie powrotem do menu z nakladki, wiec brak ekranu
                // koncowego jest oczekiwany — bez tego G1 i J1 zglaszaly falszywe naruszenia.
                if (KILL_CTX && probes.l4) { shots.push(await shot(page, outDir, runId, 'end')); break; }
                // ekran koncowy animuje sie (przycisk wjezdza z opoznieniem): 2 s zegara gry + chwila czasu rzeczywistego
                // przed zrzutem, inaczej "end" lapal karte bez przycisku (falszywe "brak POWROT DO MENU" w raporcie)
                await page.evaluate(() => window.__sigmaTest.control.step(120));
                await page.waitForTimeout(800);
                shots.push(await shot(page, outDir, runId, 'end'));
                // S5b J1: przycisk POWROT DO MENU w calosci w viewport (breakpoint = wysokosc)
                const cta = await page.evaluate(() => { const b = [...document.querySelectorAll('.brawl-btn')].find(x => x.getBoundingClientRect().width > 0); if (!b) return null; const q = b.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height), vw: innerWidth, vh: innerHeight }; });
                probes.cta = cta;
                if (!cta) extra.push({ id: 'J1', severity: 'P1', frame: snap.frame, msg: `brak widocznego przycisku na ekranie koncowym (${vw}x${vh})` });
                else if (cta.x < 0 || cta.y < 0 || cta.x + cta.w > cta.vw || cta.y + cta.h > cta.vh) extra.push({ id: 'J1', severity: 'P1', frame: snap.frame, msg: `przycisk konca poza ekranem: ${JSON.stringify(cta)}` });
                break;
            }
        }
        if (!outcome) shots.push(await shot(page, outDir, runId, 'timeout'));
        const events = await page.evaluate(() => window.__sigmaTest.events.slice());
        const matchFrames = snaps.length ? snaps[snaps.length - 1].frame : 0;
        const violationsRaw = await page.evaluate((inp) => window.__sigmaTest.oracles.run(inp), { snaps: snaps.map(s => ({ ...s })), events, matchFrames });
        // L4: celowo ubilismy kontekst, wiec "stan MENU bez outcome" (G1) to skutek testu, nie bug gry.
        const violations = (KILL_CTX && probes.l4) ? violationsRaw.filter(v => v.id !== 'G1') : violationsRaw;
        const oracleIds = await page.evaluate(() => window.__sigmaTest.oracles.ids);
        const outcomeEv = events.find(e => e.t === 'outcome');
        const deaths = events.filter(e => e.t === 'damage' && e.target === 'player' && e.hp <= 0).length;
        const kills = events.filter(e => e.t === 'kill').length;
        // S4 raport: boss padl? (D4/O3) + sekunda pierwszej smierci gracza (K3 time-to-death)
        const bossKills = events.filter(e => e.t === 'kill' && (e.kind === 'boss' || e.kind === 'mega')).length;
        const firstDeath = events.find(e => e.t === 'damage' && e.target === 'player' && e.hp <= 0);
        const deathAtSec = firstDeath ? Math.round(firstDeath.frame / 60) : null;
        const report = {
            runId, build: snaps[0]?.build ?? '?', ...r, url: URL, startedAt: new Date(t0).toISOString(), durationSec: Math.round((Date.now() - t0) / 1000),
            outcome: outcomeEv ? outcomeEv.result : (outcome ?? 'timeout'), matchSec: outcomeEv?.seconds ?? snaps.length, score: snaps[snaps.length - 1]?.score ?? 0,
            kills, bossKills, deathAtSec, playerDied: deaths > 0, violations: [...violations, ...extra], consoleErrors, screenshots: shots,
            oracleIds: [...oracleIds, ...extraIds.filter(e => !oracleIds.some(o => o.id === e.id))], probes, viewport: r.mobile ? `${vw}x${vh}` : '1280x720',
            timeline: snaps.map(s => ({ f: s.frame, hp: s.player?.hp ?? null, en: s.enemies.filter(e => e.active).length, bul: s.bullets + s.enemyBullets, part: s.perf.particles, heap: s.perf.heapMB, score: s.score, pw: s.powersUsed ?? 0, wave: s.scenario?.wave ?? null, ea: s.scenario?.enemiesAlive ?? null })),
            // S5a: moce uzyte przez bota + najwyzsza fala Zamku (log postepu fal — "52 s bez postepu": bot czy gra?)
            powersUsed: snaps[snaps.length - 1]?.powersUsed ?? 0,
            maxWave: snaps.reduce((m, s) => Math.max(m, s.scenario?.wave ?? 0), 0) || null,
            eventsSummary: Object.fromEntries(Object.entries(events.reduce((a, e) => (a[e.t] = (a[e.t] || 0) + 1, a), {}))),
        };
        fs.writeFileSync(path.join(outDir, runId + '.json'), JSON.stringify(report, null, 1));
        return report;
    } catch (err) {
        const report = { runId, ...r, error: String(err && err.stack || err).slice(0, 1500), consoleErrors, violations: [{ id: 'L1', severity: 'P0', frame: -1, msg: 'runner exception: ' + String(err && err.message || err).slice(0, 200) }], screenshots: shots, outcome: 'runner-error' };
        try { shots.push(await shot(page, outDir, runId, 'error')); } catch { /* ignore */ }
        fs.writeFileSync(path.join(outDir, runId + '.json'), JSON.stringify(report, null, 1));
        return report;
    } finally {
        await ctx.close();
    }
}

/** S5b: czy znacznik krawedziowy / powiadomienie nachodzi na pigulke, pasek mocy lub kontrolke dotykowa (ta sama tolerancja 4 px co J2). */
function hudOverlap(l) {
    if (!l) return false;
    const fam = (r) => r.kind.split('-')[0];
    const movers = l.hud.filter(r => fam(r) === 'marker' || fam(r) === 'notif');
    const fixed = [...l.hud.filter(r => fam(r) === 'pill' || fam(r) === 'powerbar'), ...l.dom.filter(r => fam(r) === 'superbtn' || fam(r) === 'joystick')];
    return movers.some(a => fixed.some(b => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 4 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 4));
}

// ── S5b: proby mobile po stronie runnera ─────────────────────────────────
// kopia getMobileSpeedMult z src/entities/Player.ts (funkcja nieeksportowana) — przy zmianie tabeli zaktualizowac
const mobileMult = (b) => b <= 3 ? 1.05 : b <= 4 ? 0.95 : b <= 5 ? 0.80 : b <= 7 ? 0.72 : 0.68;

/** J9: 4 kierunki po 30 klatek (bot wstrzymany), najwieksze przesuniecie/klatke vs currentSpeed x mnoznik mobile. */
async function probeSpeed(page, probes, extra) {
    const m = await page.evaluate(() => {
        const T = window.__sigmaTest; T.bot.setMode('idle');
        const s0 = T.snapshot(); const per = [];
        for (const dir of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
            const a = T.snapshot().player; T.input.move(dir); T.control.step(30); T.input.move(null); T.control.step(4);
            const b = T.snapshot().player; per.push(Math.hypot(b.x - a.x, b.y - a.y) / 30);
        }
        T.bot.setMode('play');
        return { frame: s0.frame, touch: s0.screen.isTouch, base: s0.player.baseSpeed, cur: s0.player.currentSpeed, perFrame: Math.max(...per), all: per };
    });
    const expected = m.touch ? m.cur * mobileMult(m.base) : m.cur;
    probes.j9 = { ...m, expected: Math.round(expected * 100) / 100 };
    if (m.perFrame < expected * 0.3) { probes.j9.note = 'ruch zablokowany we wszystkich kierunkach — proba pominieta'; return; }
    const ratio = m.perFrame / expected;
    if (ratio < 0.9 || ratio > 1.1) extra.push({ id: 'J9', severity: 'P2', frame: m.frame, msg: `predkosc ${m.perFrame.toFixed(2)} px/klatke vs oczekiwane ${expected.toFixed(2)} (base ${m.base} x mnoznik ${m.touch ? mobileMult(m.base) : 1}, x${ratio.toFixed(2)})` });
}

/** J10: symulowane zwiniecie karty (visibilityState=hidden + zdarzenie) i powrot. Headless moze nie grac muzyki — wtedy tylko stan pageHidden. */
async function probeVisibility(page, probes, extra) {
    const v = await page.evaluate(() => {
        const T = window.__sigmaTest; const before = T.audio();
        const setVis = (st) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st }); document.dispatchEvent(new Event('visibilitychange')); };
        setVis('hidden'); const hidden = T.audio();
        setVis('visible'); const shown = T.audio();
        delete document.visibilityState; // przywraca getter z prototypu
        return { frame: T.snapshot().frame, before, hidden, shown };
    });
    probes.j10 = v;
    if (!v.hidden.pageHidden) extra.push({ id: 'J10', severity: 'P1', frame: v.frame, msg: 'visibilitychange=hidden nie przelacza AudioSys w stan schowany' });
    if (v.hidden.musicPlaying) extra.push({ id: 'J10', severity: 'P1', frame: v.frame, msg: 'muzyka gra dalej po zwinieciu karty' });
    if (v.before.musicPlaying && !v.shown.musicPlaying) extra.push({ id: 'J10', severity: 'P2', frame: v.frame, msg: 'muzyka nie wraca po powrocie do karty' });
    if (v.shown.pageHidden) extra.push({ id: 'J10', severity: 'P1', frame: v.frame, msg: 'po powrocie AudioSys nadal w stanie schowanym (cisza)' });
}

/** J7: obrot do pionu na 5 s bez inputu (gracz obraca telefon), potem powrot. Ostrzezenie widoczne? Ile HP zniknelo? */
async function probePortrait(page, probes, extra, shots, runId, vw, vh) {
    const before = await page.evaluate(() => { const s = window.__sigmaTest.snapshot(); return { hp: s.player?.hp ?? 0, frame: s.frame }; });
    await page.setViewportSize({ width: vh, height: vw });
    const warn = await page.evaluate(() => { const el = document.querySelector('.bt-portrait-warning'); return el ? getComputedStyle(el).display !== 'none' : null; });
    shots.push(await shot(page, outDir, runId, 'portrait'));
    const during = await page.evaluate(() => { const T = window.__sigmaTest; T.bot.setMode('idle'); T.input.release(); T.control.step(300); const s = T.snapshot(); return { hp: s.player?.hp ?? 0, state: s.gameState }; });
    await page.setViewportSize({ width: vw, height: vh });
    // resize dochodzi asynchronicznie — bez czekania HUD bywal jeszcze w wymiarach pionu (falszywe J7)
    await page.waitForFunction(([w, h]) => window.innerWidth === w && window.innerHeight === h, [vw, vh], { timeout: 5000 }).catch((err) => console.error(`[sigma] J7 resize timeout ${runId}: ${err.message}`));
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => { const T = window.__sigmaTest; T.control.step(10); T.bot.setMode('play'); const s = T.snapshot(); return { state: s.gameState, w: s.screen.w, h: s.screen.h }; });
    probes.j7 = { warn, hpBefore: before.hp, hpAfter: during.hp, stateDuring: during.state, after };
    if (warn !== true) extra.push({ id: 'J7', severity: 'P1', frame: before.frame, msg: `brak ostrzezenia "Obroc telefon" w pionie ${vh}x${vw}` });
    if (during.hp < before.hp) extra.push({ id: 'J7', severity: 'P2', frame: before.frame, msg: `gra nie pauzuje w pionie: -${Math.round(before.hp - during.hp)} HP w 5 s bez mozliwosci sterowania${during.state !== 'PLAYING' ? ` (stan: ${during.state})` : ''}` });
    if (after.w !== vw || after.h !== vh) extra.push({ id: 'J7', severity: 'P2', frame: before.frame, msg: `HUD po powrocie do poziomu ma ${after.w}x${after.h} zamiast ${vw}x${vh}` });
}

/**
 * L4 (v0.187.0): utrata kontekstu WebGL w srodku meczu — dokladnie to, co robil sterownik na
 * Huawei MatePad (bialy ekran). Sprawdza, czy ContextGuard wykryl utrate, pokazal nakladke
 * z przyciskiem i czy powrot oddaje gracza do menu bez wyjatkow, zamiast zostawiac bialy canvas.
 */
async function probeContextLoss(page, probes, extra, shots, runId) {
    const before = await page.evaluate(() => window.__sigmaTest.snapshot().frame);
    const killed = await page.evaluate(() => {
        const cv = [...document.querySelectorAll('canvas')].find((c) => c.id !== 'hudCanvas');
        const gl = cv && (cv.getContext('webgl2') || cv.getContext('webgl'));
        const ext = gl && gl.getExtension('WEBGL_lose_context');
        if (!ext) return false;
        ext.loseContext();
        return true;
    });
    if (!killed) { probes.l4 = { skipped: 'brak WEBGL_lose_context' }; return; }
    await page.waitForTimeout(1200);
    const seen = await page.evaluate(() => {
        const el = document.querySelector('.bt-ctxlost');
        const btn = document.querySelector('.bt-ctxlost-btn');
        return { overlay: !!el && getComputedStyle(el).display !== 'none', btn: btn ? (btn.textContent || '').trim() : null };
    });
    shots.push(await shot(page, outDir, runId, 'ctxlost'));
    if (!seen.overlay) extra.push({ id: 'L4', severity: 'P0', frame: before, msg: 'utrata kontekstu WebGL w meczu bez zadnego komunikatu (bialy ekran = koniec sesji)' });
    if (seen.overlay && !seen.btn) extra.push({ id: 'L4', severity: 'P0', frame: before, msg: 'nakladka po utracie kontekstu bez przycisku wyjscia' });
    if (seen.overlay) {
        await page.click('.bt-ctxlost-btn').catch((err) => console.error(`[sigma] L4 klik ${runId}: ${err.message}`));
        await page.waitForTimeout(1200);
        const st = await page.evaluate(() => window.__sigmaTest.snapshot().gameState);
        if (st === 'PLAYING') extra.push({ id: 'L4', severity: 'P1', frame: before, msg: `po powrocie z utraty kontekstu stan nadal PLAYING (oczekiwano menu), jest ${st}` });
        probes.l4 = { overlay: seen.overlay, btn: seen.btn, stateAfter: st };
    }
}

async function shot(page, dir, runId, tag) {
    const file = path.join(dir, `${runId}-${tag}.png`);
    // "death": ekran koncowy (DOM nad canvasem) pojawia sie w TEJ SAMEJ klatce co zgon; canvas pod nim ma plansze
    // z chwili smierci — chowamy nakladke tylko na czas zrzutu (Playwright `style`), gra nietknieta.
    // przycisk POWROT DO MENU (.brawl-btn) nie siedzi w #gameOverScreen — chowamy go osobno
    const style = tag === 'death' ? '#gameOverScreen, #victoryScreen, .brawl-btn { display: none !important; }' : undefined;
    try { await page.screenshot({ path: file, style }); } catch (err) { console.error(`[sigma] zrzut ${tag} ${runId}: ${err.stack}`); }
    return path.basename(file);
}

function summarize(reports) {
    const lines = [`# SigmaTester — ${day} (${reports.length} przebiegow)`, ''];
    const byId = {};
    for (const r of reports) for (const v of r.violations ?? []) { const k = `${v.id}|${r.scenario}|${r.map}`; (byId[k] ??= { id: v.id, severity: v.severity, scenario: r.scenario, map: r.map, n: 0, sample: v.msg, seeds: new Set() }); byId[k].n++; byId[k].seeds.add(r.seed); }
    lines.push('## Przebiegi', '', '| run | build | wynik | s | kille | zgon | violations | errors |', '|---|---|---|---|---|---|---|---|');
    for (const r of reports) lines.push(`| ${r.runId} | ${r.build ?? '?'} | ${r.outcome} | ${r.matchSec ?? '-'} | ${r.kills ?? '-'} | ${r.playerDied ? 'tak' : 'nie'} | ${(r.violations ?? []).length} | ${(r.consoleErrors ?? []).length} |`);
    lines.push('', '## Klastry naruszen (dedup po id+scenariusz+mapa)', '', '| sev | id | scenariusz | mapa | ile | seedy | przyklad |', '|---|---|---|---|---|---|---|');
    for (const c of Object.values(byId).sort((a, b) => a.severity.localeCompare(b.severity) || b.n - a.n)) lines.push(`| ${c.severity} | ${c.id} | ${c.scenario} | ${c.map} | ${c.n} | ${[...c.seeds].join(',')} | ${c.sample.replace(/\|/g, '/')} |`);
    if (!Object.keys(byId).length) lines.push('| - | - | - | - | 0 | - | brak naruszen |');
    lines.push('', `Zrzuty i JSON: \`${outDir}\``);
    return lines.join('\n');
}

(async () => {
    const matrix = buildMatrix();
    console.log(`[sigma] ${matrix.length} przebiegow -> ${outDir} (url ${URL}, headless ${HEADLESS})`);
    const browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
    const reports = [];
    for (let i = 0; i < matrix.length; i++) {
        const r = matrix[i];
        process.stdout.write(`[sigma] ${i + 1}/${matrix.length} ${r.scenario}/${r.map}/${r.brawler}/${r.diff} ${r.mode}${r.mobile ? ' mobile' : ''} seed=${r.seed} ... `);
        const rep = await runOne(browser, r, i + 1);
        reports.push(rep);
        console.log(`${rep.outcome} | ${rep.matchSec ?? '-'} s | violations ${(rep.violations ?? []).length}${rep.error ? ' | RUNNER ERROR' : ''}`);
    }
    await browser.close();
    const md = summarize(reports);
    fs.writeFileSync(path.join(outDir, 'summary.md'), md);
    fs.writeFileSync(path.join(outDir, 'runs.json'), JSON.stringify(reports.map(r => ({ ...r, timeline: undefined })), null, 1));
    console.log('\n' + md);
    // S4: --report = od razu raport dzienny (report.mjs; --report-dry = bez LLM)
    if (args.report === 'true' || args['report-dry'] === 'true') {
        const { spawnSync } = await import('node:child_process');
        const extra = args['report-dry'] === 'true' ? ['--dry-run'] : [];
        // uwaga: stala URL (adres gry) przeslania globalne URL — stad fileURLToPath zamiast new URL(...)
        const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'report.mjs'), '--day', day, '--out', OUT_ROOT, ...extra], { stdio: 'inherit' });
        if (r.status !== 0) console.error(`[sigma] report.mjs zakonczyl sie kodem ${r.status}`);
    }
})().catch((e) => { console.error('[sigma] FATAL', e); process.exit(1); });
