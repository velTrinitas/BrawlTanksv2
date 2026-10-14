// RANKING — pasek filtrow v0.249.0: zrzuty (zamkniety / popover Filtry) + liczba widocznych wierszy. Dev-only.
// RPC rankingu przechwycone (dane sztuczne), wiec nie zalezy od chmury.
import { chromium } from 'playwright';
const URL = process.env.LB_URL ?? 'http://localhost:5181/BrawlTanksv2/';
const sizes = [
    { name: 'desktop', w: 1366, h: 768, touch: false },
    { name: 'm812', w: 812, h: 375, touch: true },
    { name: 'm667', w: 667, h: 375, touch: true },
    { name: 'p375', w: 375, h: 667, touch: true },
];
const tanks = ['heavy', 'sniper', 'scout', 'shadow'];
const diffs = ['easy', 'normal', 'hard', 'nightmare'];
const rows = Array.from({ length: 40 }, (_, i) => ({
    rank: i + 1, profile_id: 'p' + i, nickname: 'Pilot' + (i + 1), avatar_id: 'ash', flag_id: 'pl',
    score: 90000 - i * 1700, map: 'desert', brawler_id: tanks[i % 4], difficulty: diffs[i % 4], created_at: '2026-10-10T10:00:00Z',
}));
const b = await chromium.launch({ channel: 'chrome' });
for (const s of sizes) {
    const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1 });
    await ctx.route('**/rest/v1/rpc/leaderboard_top*', r => r.fulfill({ json: rows }));
    await ctx.route('**/rest/v1/rpc/leaderboard_my_rank*', r => r.fulfill({ json: [{ rank: 12, my_score: 70000, total: 40 }] }));
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
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
    await p.evaluate(() => document.querySelector("[data-section='rank']")?.click());
    await p.waitForTimeout(2500);
    const visible = () => p.evaluate(() => {
        const body = document.querySelector('.bt-lb-list')?.getBoundingClientRect();
        if (!body) return null;
        return [...document.querySelectorAll('.bt-lb-row')].filter(r => { const q = r.getBoundingClientRect(); return q.top >= body.top - 1 && q.bottom <= body.bottom + 1; }).length;
    });
    const v1 = await visible();
    await p.screenshot({ path: `reports/lbf-${s.name}-closed.png` });
    await p.evaluate(() => document.querySelector("[data-dd='filters']")?.click());
    await p.waitForTimeout(400);
    await p.screenshot({ path: `reports/lbf-${s.name}-filters.png` });
    await p.evaluate(() => document.querySelector("[data-diff='nightmare']")?.click());
    await p.waitForTimeout(800);
    await p.evaluate(() => document.querySelector("[data-map='desert']")?.click());
    await p.waitForTimeout(800);
    await p.mouse.click(5, s.h - 5); // tap poza panelem
    await p.waitForTimeout(800);
    const v2 = await visible();
    const popOpen = await p.evaluate(() => !!document.querySelector('.bt-lb-pop:not([hidden])'));
    await p.screenshot({ path: `reports/lbf-${s.name}-active.png` });
    await p.evaluate(() => document.querySelector("[data-dd='board']")?.click());
    await p.waitForTimeout(400);
    await p.screenshot({ path: `reports/lbf-${s.name}-board.png` });
    console.log(s.name, JSON.stringify({ visibleDefault: v1, visibleFiltered: v2, popOpenAfterOutsideTap: popOpen, errs }));
    await ctx.close();
}
await b.close();
