// TROPICS ART v2 — zrzuty w wielu punktach mapy (hak __devTp, dev-only).
import { chromium } from 'playwright';
const spots = JSON.parse(process.argv[2] || '[[630,1160],[2730,2400],[2800,540],[1070,590],[2320,640],[2050,2260],[2450,1760],[1500,1500]]');
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5181/BrawlTanksv2/?cloud=0&mp=1&tropicsart=1');
await p.waitForTimeout(2500);
await p.evaluate(async () => {
    const m = await import('/BrawlTanksv2/src/services/ProfileService.ts');
    const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' });
    m.ProfileService.setActiveProfile(pr.id);
});
await p.reload();
await p.waitForTimeout(2500);
await p.evaluate(() => (window).__coopHostStart?.('tropics'));
await p.waitForTimeout(6000);
for (let i = 0; i < spots.length; i++) {
    await p.evaluate(([x, y]) => (window).__devTp?.(x, y), spots[i]);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `reports/tour-${i}.png` });
}
console.log(JSON.stringify({ errs: errs.slice(0, 5) }));
await b.close();
