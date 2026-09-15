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
    const runId = `${String(idx).padStart(3, '0')}-${r.scenario}-${r.map}-${r.brawler}-${r.diff}-${r.mode}${r.mobile ? '-mobile' : ''}-s${r.seed}`;
    const ctx = await browser.newContext(r.mobile
        ? { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36' }
        : { viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e.message).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('response', (res) => { if (res.status() >= 400) consoleErrors.push(`HTTP ${res.status()} ${res.url().slice(0, 160)}`); });
    page.on('requestfailed', (req) => consoleErrors.push(`REQFAIL ${req.failure()?.errorText ?? ''} ${req.url().slice(0, 160)}`));
    const t0 = Date.now();
    const snaps = []; const shots = [];
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
            snaps.push(snap);
            if (sec === 2) shots.push(await shot(page, outDir, runId, 'start'));
            if (snap.gameState !== 'PLAYING') {
                outcome = snap.gameState;
                // ekran koncowy animuje sie (przycisk wjezdza z opoznieniem): 2 s zegara gry + chwila czasu rzeczywistego
                // przed zrzutem, inaczej "end" lapal karte bez przycisku (falszywe "brak POWROT DO MENU" w raporcie)
                await page.evaluate(() => window.__sigmaTest.control.step(120));
                await page.waitForTimeout(800);
                shots.push(await shot(page, outDir, runId, 'end'));
                break;
            }
        }
        if (!outcome) shots.push(await shot(page, outDir, runId, 'timeout'));
        const events = await page.evaluate(() => window.__sigmaTest.events.slice());
        const matchFrames = snaps.length ? snaps[snaps.length - 1].frame : 0;
        const violations = await page.evaluate((inp) => window.__sigmaTest.oracles.run(inp), { snaps: snaps.map(s => ({ ...s })), events, matchFrames });
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
            kills, bossKills, deathAtSec, playerDied: deaths > 0, violations, consoleErrors, screenshots: shots, oracleIds,
            timeline: snaps.map(s => ({ f: s.frame, hp: s.player?.hp ?? null, en: s.enemies.filter(e => e.active).length, bul: s.bullets + s.enemyBullets, part: s.perf.particles, heap: s.perf.heapMB, score: s.score })),
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
