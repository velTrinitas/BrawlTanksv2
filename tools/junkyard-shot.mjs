import { chromium } from 'playwright';
const BASE = 'http://localhost:5175/BrawlTanksv2/';
const b = await chromium.launch({ channel: 'chrome' });
async function hub(ctx, q) {
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    p.on('console', m => { if (m.type() === 'error' || /\[propBaker\]|\[JunkyardMap\]|\[Junkyard/.test(m.text())) errs.push(m.text()); });
    await p.goto(BASE + q); await p.waitForTimeout(2200);
    await p.evaluate(async () => { localStorage.clear(); const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); localStorage.setItem('bt2:tutorialCoreDone', '1'); });
    await p.reload(); await p.waitForTimeout(2200);
    await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
    await p.waitForTimeout(3000); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
    return { p, errs };
}
// 1) picker without flag (locked) and with flag
for (const [tag, q] of [['locked', ''], ['flag', '?junkyard=1']]) {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
    const { p, errs } = await hub(ctx, q);
    await p.evaluate(() => document.querySelector('[data-scenario="ktb"]')?.click()); await p.waitForTimeout(600);
    await p.evaluate(() => document.querySelector('[data-scenario="ktb"]')?.click()); await p.waitForTimeout(900);
    const grid = await p.$('.bt-mp-grid');
    if (grid) await grid.screenshot({ path: `reports/jy-picker-${tag}.png` }); else await p.screenshot({ path: `reports/jy-picker-${tag}.png` });
    const info = await p.evaluate(() => [...document.querySelectorAll('.bt-mp-card')].map(c => c.className + ' ' + (c.querySelector('.mp-name')?.textContent ?? '')));
    console.log(tag, JSON.stringify({ info, errs }));
    await ctx.close();
}
// 2) match on the map (bot bridge for teleport), diag on
{
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
    const { p, errs } = await hub(ctx, '?junkyard=1&bot=1&diag=1');
    await p.evaluate(async () => { await window.__sigmaTest.control.start({ map: 'junkyard', brawler: 'twardy' }); });
    await p.waitForTimeout(3000);
    await p.evaluate(() => window.__sigmaTest.control.god(true));
    const spots = { stackNW: [1150, 1150], contIn: [2290, 470], craneTop: [1500, 430], press: [1500, 1500], crane: [1500, 700], wash: [690, 1500], belt: [2250, 1500], mazeNW: [600, 600], containers: [2400, 560], office: [750, 2300], stackE: [2660, 1830] };
    for (const [k, [x, y]] of Object.entries(spots)) {
        await p.evaluate(([x, y]) => window.__sigmaTest.control.teleport(x, y), [x, y]);
        await p.waitForTimeout(700);
        await p.screenshot({ path: `reports/jy-${k}.png` });
    }
    const diag = await p.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => /tex|VRAM/i.test(d.textContent ?? '') && d.children.length < 6 && (d.textContent ?? '').length < 400); return el ? el.textContent : null; });
    console.log('match', JSON.stringify({ diag, errs }));
    await ctx.close();
}
await b.close();
