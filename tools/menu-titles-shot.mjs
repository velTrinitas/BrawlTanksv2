// NAGLOWKI MENU v0.249.0 — zrzuty Ustawien (zebatka nowego hubu) (Jak grac usuniety). Dev-only.
import { chromium } from 'playwright';
const BASE = process.env.LB_URL ?? 'http://localhost:5181/BrawlTanksv2/';
const sizes = [
    { name: 'desktop', w: 1366, h: 768, touch: false },
    { name: 'm812', w: 812, h: 375, touch: true },
    { name: 'm667', w: 667, h: 375, touch: true },
];
const b = await chromium.launch({ channel: 'chrome' });
for (const s of sizes) {
    for (const mode of ['settings']) {
        const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1 });
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        const url = mode === 'howto' ? BASE + '?hub=0' : BASE;
        await p.goto(url);
        await p.waitForTimeout(2500);
        await p.evaluate(async () => {
            const m = await import('/BrawlTanksv2/src/services/ProfileService.ts');
            const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' });
            m.ProfileService.setActiveProfile(pr.id);
        });
        await p.reload();
        await p.waitForTimeout(2500);
        await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
        await p.waitForTimeout(3500); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
        if (mode === 'settings') await p.evaluate(() => document.querySelector("[data-action='settings']")?.click());
        else await p.evaluate(() => document.querySelector("[data-action='howToPlay']")?.click());
        await p.waitForTimeout(1500);
        const info = await p.evaluate(() => {
            const h = document.querySelector('.bt-settings-title');
            const scr = document.querySelector('.bt-howto-screen, .bt-settings-panel, .bt-settings-screen');
            return {
                title: h?.textContent?.trim() ?? null,
                fontSize: h ? getComputedStyle(h).fontSize : null,
                scroll: scr ? scr.scrollHeight > scr.clientHeight + 1 : null,
            };
        });
        await p.screenshot({ path: `reports/mt-${s.name}-${mode}.png` });
        console.log(s.name, mode, JSON.stringify({ ...info, errs }));
        await ctx.close();
    }
}
await b.close();
