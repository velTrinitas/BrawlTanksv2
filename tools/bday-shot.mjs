// EVENT urodziny Michala: zrzuty intro -> Start.jpg -> hub (desktop + 812x375). Uzycie: node tools/bday-shot.mjs <url> <outDir>
import { chromium } from 'playwright';
const URL_BASE = process.argv[2] || 'http://localhost:4173/BrawlTanksv2/';
const OUT = process.argv[3] || '.';
const PID = '11111111-2222-3333-4444-555555555555', now = Date.now();
const profile = { id: PID, nickname: 'BurzowySruba', avatarId: 'ash', flagId: 'pl', language: 'pl', createdAt: now - 86400000, lastPlayedAt: now, totalGamesPlayed: 3 };
const b = await chromium.launch({ channel: 'chrome' });
for (const [name, viewport] of [['desk', { width: 1920, height: 1080 }], ['m375', { width: 812, height: 375 }]]) {
    const ctx = await b.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') console.log(`[${name} console.error] ${m.text()}`); });
    page.on('requestfailed', r => console.log(`[${name} 404?] ${r.url()}`));
    await page.goto(URL_BASE, { waitUntil: 'load' });
    await page.evaluate(([p, pid]) => { localStorage.setItem('bt2:profiles', JSON.stringify([p])); localStorage.setItem('bt2:activeProfileId', pid); }, [profile, PID]);
    await page.reload({ waitUntil: 'load' });
    const start = page.locator('button.bt-intro-start');
    await start.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/bday_${name}_1intro.png` });
    await start.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/bday_${name}_2start.png` });
    await page.waitForTimeout(6500); // auto-zamkniecie po 6 s
    console.log(name, 'overlay po 7.4 s:', await page.locator('.bt-bday-start').count());
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/bday_${name}_3hub.png` });
    await ctx.close();
}
await b.close();
