// CASTLE ART v2 — zrzuty Zamku (v2 vs legacy, tiery zniszczen). Dev-only.
// Uzycie: node tools/castle-shot.mjs [v2|old ...]   (vite na 5181)
import { chromium } from 'playwright';
const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['v2', 'old'];
const BASE = process.env.LB_URL ?? 'http://localhost:5181/BrawlTanksv2/';
const b = await chromium.launch({ channel: 'chrome' });
for (const name of variants) {
    const q = `?cloud=0&castle=1&castleart=${name === 'v2' ? 1 : 0}`;
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' || /castleBake|castleArt/.test(m.text())) errs.push(m.text()); });
    await p.goto(BASE + q);
    await p.waitForTimeout(2500);
    await p.evaluate(async () => {
        const m = await import('/BrawlTanksv2/src/services/ProfileService.ts');
        const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' });
        m.ProfileService.setActiveProfile(pr.id);
        localStorage.setItem('bt2:castle_tut_done', '1');
        for (const k of Object.keys(localStorage)) if (/tutorial/i.test(k)) localStorage.setItem(k, '1');
    });
    await p.reload();
    await p.waitForTimeout(2500);
    await p.evaluate(() => window.__devStart?.('castle', 'castle_grounds'));
    await p.waitForTimeout(7000);
    // kamera nad zamkiem: teleport gracza do placu przed brama S
    await p.evaluate(() => window.__devTp?.(1500, 1700));
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `reports/castle-${name}-t0.png` });
    await p.evaluate(() => window.__devTp?.(1500, 2150));
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `reports/castle-${name}-moat.png` });
    await p.evaluate(() => window.__devTp?.(1250, 1965));
    await p.waitForTimeout(250);
    await p.screenshot({ path: `reports/castle-${name}-splash.png` });
    for (const tier of [1, 2, 3]) {
        await p.evaluate(t => window.castleTier?.(t), tier);
        await p.evaluate(() => window.__devTp?.(1500, 1700));
        await p.waitForTimeout(2500);
        await p.screenshot({ path: `reports/castle-${name}-t${tier}.png` });
    }
    console.log(name, JSON.stringify({ errs: errs.slice(0, 8) }));
    await ctx.close();
}
await b.close();
