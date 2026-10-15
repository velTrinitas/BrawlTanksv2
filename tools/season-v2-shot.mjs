// SEZON v2 (v0.250.0) — zrzuty stron SEZON i PUCHARKI z ?seasonv2=1 + podstawionym postepem sezoniakow. Dev-only.
// Uzycie: node tools/season-v2-shot.mjs [punkty=60]
import { chromium } from 'playwright';
const BASE = process.env.LB_URL ?? 'http://localhost:5181/BrawlTanksv2/';
const POINTS = Number(process.argv[2] ?? 60);
const THEME = process.argv[3] === 'theme'; // zaloz motyw menu sezonu
const TAG = THEME ? 'theme-' : '';
const sizes = [
    { name: 'desktop', w: 1366, h: 768, touch: false },
    { name: 'm812', w: 812, h: 375, touch: true },
    { name: 'm667', w: 667, h: 375, touch: true },
];
const b = await chromium.launch({ channel: 'chrome' });
for (const s of sizes) {
    const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(BASE + '?seasonv2=1&cloud=0'); // cloud=0: test nie pisze do Supabase
    await p.waitForTimeout(2500);
    await p.evaluate(async ({ pts, th }) => {
        const m = await import('/BrawlTanksv2/src/services/ProfileService.ts');
        const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' });
        m.ProfileService.setActiveProfile(pr.id);
        const ps = (await import('/BrawlTanksv2/src/services/ProgressionService.ts')).ProgressionService;
        ps.getSeasonCollected(pr.id); // ensureSeason
        const st = ps.getOrCreate(pr.id);
        st.season.collected = pts;
        st.season.items = { 1: 9, 2: 5, 3: 2, 4: 1 };
        st.trophies = 640;
        if (th) { st.ownedCosmetics = [...st.ownedCosmetics, 'mt_s3_school']; st.equipped.menuTheme = 'mt_s3_school'; }
        ps.save();
    }, { pts: POINTS, th: THEME });
    await p.reload();
    await p.waitForTimeout(2500);
    await p.evaluate(() => (document.querySelector('.bt-intro-start') ?? document.querySelector('.brawl-btn'))?.click());
    await p.waitForTimeout(3500); await p.evaluate(() => document.querySelector('.brawl-btn')?.click()); await p.waitForTimeout(1500);
    await p.evaluate(() => document.querySelector("[data-action='season']")?.click());
    await p.waitForTimeout(1500);
    const info = await p.evaluate(() => ({
        pill: document.querySelector('.bt-hub0-s2')?.textContent?.trim(),
        nodes: document.querySelectorAll('.sv2-node').length,
        done: document.querySelectorAll('.sv2-node.is-done').length,
        fresh: document.querySelectorAll('.is-fresh').length,
        overflowX: document.documentElement.scrollWidth > innerWidth,
    }));
    await p.screenshot({ path: `reports/sv2-${TAG}${s.name}-season.png` });
    await p.evaluate(() => document.querySelector('.bt-hub0-main')?.scrollTo(0, 99999));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `reports/sv2-${TAG}${s.name}-season-bottom.png` });
    await p.evaluate(() => document.querySelector("[data-section='trophies']")?.click());
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `reports/sv2-${TAG}${s.name}-trophies.png` });
    await p.evaluate(() => document.querySelector('.bt-hub0-profile')?.click());
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `reports/sv2-${TAG}${s.name}-profile.png` });
    console.log(s.name, JSON.stringify({ ...info, errs }));
    await ctx.close();
}
await b.close();
