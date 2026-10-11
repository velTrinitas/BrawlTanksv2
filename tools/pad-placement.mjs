/**
 * pad-placement.mjs — v0.245.0 FAZA GRYWALNOSC: pozycja +1 medi pada na kazdej mapie.
 *
 * Mierzy na PRAWDZIWEJ geometrii (gra w ?bot=1, window.__sigmaTest): budynki (buildings + solids),
 * strefy niedrivalne (spawnBlocked: piaski, oazy, fosa, przerebla, kryjowki, prasa, tasma, hangar CTF)
 * i istniejace pady (medi + power). Kandydat = pad 100x100 (x,y = TOP-LEFT), ktory:
 *   - nie nachodzi na zaden budynek z marginesem 40 px,
 *   - ma 49 punktow probnych (pad + 60 px marginesu) poza strefami niedrivalnymi/specjalnymi/lawa,
 *   - srodek lezy >= 500 px od krawedzi swiata (obrzeza map = dekoracja, martwa strefa),
 *   - MAKSYMALIZUJE minimalna odleglosc srodka od srodkow istniejacych padow
 *     (pierwsza wersja z kara zamiast progu wybierala rogi — odrzucone).
 *
 * Uzycie (dziala dev server na 5175):  node tools/pad-placement.mjs [--url http://localhost:5175/BrawlTanksv2/]
 * Wynik: tabela na stdout + reports/pad-placement.json + zrzut kazdej mapy z kamera na kandydacie.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
const BASE = args.url ?? 'http://localhost:5175/BrawlTanksv2/';
const MAPS = [
    ['ktb', 'city'], ['ktb', 'desert'], ['ktb', 'tropics'], ['ktb', 'arctic'], ['ktb', 'mars'], ['ktb', 'junkyard'],
    ['ctf', 'fortified_ruins'], ['castle', 'castle_grounds'], ['save_queen', 'dungeon'],
];

const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] });
const out = [];
fs.mkdirSync('reports/pad-placement', { recursive: true });
for (const [scenario, map] of MAPS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
        await page.goto(`${BASE}?bot=1&seed=1&queentut=0&castletut=0&queen=1&castle=1`, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => !!window.__sigmaTest, null, { timeout: 60000 });
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /START/i.test(b.textContent)); b && b.click(); });
        await page.waitForTimeout(1200);
        await page.evaluate(async (cfg) => { await window.__sigmaTest.control.start(cfg); }, { scenario, map, brawler: 'twardy', difficulty: 'normal' });
        await page.waitForFunction(() => window.__sigmaTest.snapshot().gameState === 'PLAYING', null, { timeout: 30000 });
        await page.evaluate(() => window.__sigmaTest.control.step(240)); // ekran ladowania + pelne zbudowanie mapy
        const res = await page.evaluate(() => {
            const T = window.__sigmaTest;
            const snap = T.snapshot();
            const probe = T.padProbe();
            const PAD = 100, M = 40, EDGE = 450, W = 3000, H = 3000; // srodek pada >= 500 px od krawedzi swiata (obrzeza = martwa strefa)
            const rects = [...snap.buildings, ...snap.solids];
            const pads = [...snap.mediPads.map(p => ({ ...p, kind: 'medi' })), ...probe.power.map(p => ({ ...p, kind: 'power' }))];
            const centers = pads.map(p => ({ x: p.x + PAD / 2, y: p.y + PAD / 2 }));
            const cands = [];
            for (let x = EDGE; x <= W - EDGE - PAD; x += 25) {
                for (let y = EDGE; y <= H - EDGE - PAD; y += 25) {
                    let bad = false;
                    for (const b of rects) {
                        if (x < b.x + b.w + M && x + PAD + M > b.x && y < b.y + b.h + M && y + PAD + M > b.y) { bad = true; break; }
                    }
                    if (bad) continue;
                    for (let i = 0; i <= 6 && !bad; i++) for (let j = 0; j <= 6; j++) { // pad + 60 px marginesu (lawa ma wybrzuszenia obrysu)
                        if (probe.blocked(x - 60 + i * (PAD + 120) / 6, y - 60 + j * (PAD + 120) / 6)) { bad = true; break; }
                    }
                    if (bad) continue;
                    const cx = x + PAD / 2, cy = y + PAD / 2;
                    let minD = Infinity;
                    for (const c of centers) minD = Math.min(minD, Math.hypot(cx - c.x, cy - c.y));
                    const edge = Math.min(cx, cy, W - cx, H - cy);
                    const score = minD;
                    cands.push({ x, y, minD: Math.round(minD), edge: Math.round(edge), score: Math.round(score) });
                }
            }
            cands.sort((a, b) => b.score - a.score);
            return { pads, best: cands.slice(0, 3), nCands: cands.length };
        });
        const b = res.best[0];
        if (b) {
            await page.evaluate((p) => { window.__sigmaTest.control.teleport(p.x + 50, p.y + 50); }, b);
            await page.evaluate(() => window.__sigmaTest.control.step(30));
            await page.screenshot({ path: `reports/pad-placement/${map}.png` });
        }
        out.push({ scenario, map, ...res });
        console.log(`${map.padEnd(16)} existing=${res.pads.length} cands=${res.nCands} best=${b ? `(${b.x},${b.y}) minD=${b.minD} edge=${b.edge}` : 'NONE'}`);
    } catch (e) {
        console.error(`${map}: ERROR`, e.stack ?? e);
        out.push({ scenario, map, error: String(e) });
    }
    await page.close();
}
await browser.close();
fs.writeFileSync('reports/pad-placement.json', JSON.stringify(out, null, 2));
