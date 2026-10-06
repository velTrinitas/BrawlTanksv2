// TROPICS ART v2 — zrzuty mapy (v2 vs legacy). Dev-only. Start przez hak __coopHostStart (?mp=1).
import { chromium } from 'playwright';
const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['v2', 'old'];
const b = await chromium.launch({ channel: 'chrome' });
for (const name of variants) {
    const q = name === 'v2' ? '&tropicsart=1' : '&tropicsart=0';
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (/propBaker|tropicsBake/.test(m.text())) errs.push(m.text()); });
    await p.goto('http://localhost:5181/BrawlTanksv2/?cloud=0&mp=1' + q);
    await p.waitForTimeout(2500);
    await p.evaluate(async () => {
        const m = await import('/BrawlTanksv2/src/services/ProfileService.ts');
        const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' });
        m.ProfileService.setActiveProfile(pr.id);
        for (const k of Object.keys(localStorage)) if (/tutorial/i.test(k)) localStorage.setItem(k, '1');
    });
    await p.reload();
    await p.waitForTimeout(2500);
    await p.evaluate(() => (window).__coopHostStart?.('tropics'));
    await p.waitForTimeout(6000);
    await p.screenshot({ path: `reports/tropics-${name}-0.png` });
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `reports/tropics-${name}-1.png` });
    console.log(name, JSON.stringify({ errs: errs.slice(0, 5) }));
    await ctx.close();
}
await b.close();
