// CZOLG SEZONU (v0.250.0) — symulacja na Enigmie: galeria (zablokowany/odblokowany), garaz, szlak, gratulacje,
// odznaka w profilu. ?seasondemo = stan tylko w pamieci, ?cloud=0 = zero Supabase. Dev-only.
// Uzycie: node tools/season-tank-shot.mjs [punkty=250]
import { chromium } from 'playwright';
const BASE = process.env.LB_URL ?? 'http://localhost:5181/BrawlTanksv2/';
const PTS = Number(process.argv[2] ?? 250);
const Q = `?seasonv2=1&cloud=0&seasontank=enigma&seasondemo=${PTS}`;
const sizes = [
    { name: 'desktop', w: 1366, h: 768, touch: false },
    { name: 'm812', w: 812, h: 375, touch: true },
];
const b = await chromium.launch({ channel: 'chrome' });
for (const s of sizes) {
    const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(BASE + Q);
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
    const tag = `stk-${PTS}-${s.name}`;
    // 1) strona SEZON (wyplata toru -> gratulacje)
    await p.evaluate(() => document.querySelector("[data-action='season']")?.click());
    await p.waitForTimeout(1800);
    const cel1 = await p.evaluate(() => document.querySelector('.bt-scel .bt-rankup-title')?.textContent ?? null);
    await p.screenshot({ path: `reports/${tag}-1-season-or-cel.png` });
    if (cel1) {
        await p.evaluate(() => document.querySelector("[data-action='cel-close']")?.click());
        await p.waitForTimeout(1500);
    }
    const cel2 = await p.evaluate(() => document.querySelector('.bt-scel .bt-rankup-title')?.textContent ?? null);
    if (cel2) {
        await p.screenshot({ path: `reports/${tag}-2-cel2.png` });
        await p.evaluate(() => document.querySelector("[data-action='cel-close']")?.click());
        await p.waitForTimeout(1200);
    }
    await p.evaluate(() => document.querySelector('[data-trail]')?.scrollTo(99999, 0));
    await p.waitForTimeout(300);
    await p.screenshot({ path: `reports/${tag}-3-trail-end.png` });
    // 2) galeria czolgow z garazu
    await p.evaluate(() => document.querySelector("[data-section='garage']")?.click());
    await p.waitForTimeout(1500);
    await p.evaluate(() => [...document.querySelectorAll('.bt-gr2-rosterbtn')].find(e => e.offsetParent)?.click());
    await p.waitForTimeout(1200);
    await p.evaluate(() => document.querySelector('.bt-rs-season')?.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(400);
    const card = await p.evaluate(() => {
        const c = document.querySelector('.bt-rs-card.is-season');
        return c ? { locked: c.classList.contains('is-locked'), pick: c.getAttribute('data-pick') } : null;
    });
    await p.screenshot({ path: `reports/${tag}-4-roster.png` });
    // 3) wybor z galerii (jesli odblokowany) -> garaz z wstazka
    if (card && !card.locked) {
        await p.evaluate(() => document.querySelector('.bt-rs-card.is-season')?.click());
        await p.waitForTimeout(1500);
        await p.screenshot({ path: `reports/${tag}-5-garage.png` });
    } else {
        await p.keyboard.press('Escape');
    }
    // 4) profil — odznaka sezonu
    await p.evaluate(() => document.querySelector('.bt-hub0-profile')?.click());
    await p.waitForTimeout(1200);
    const badges = await p.evaluate(() => document.querySelectorAll('.ph-sbadge').length);
    await p.screenshot({ path: `reports/${tag}-6-profile.png` });
    const stored = await p.evaluate(() => { try { return (localStorage.getItem('bt2:progression') ?? '').includes('trk:'); } catch { return null; } });
    console.log(s.name, JSON.stringify({ cel1, cel2, card, badges, demoLeakedToStorage: stored, errs }));
    await ctx.close();
}
await b.close();
