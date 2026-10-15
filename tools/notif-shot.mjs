// DEV: rozmiar banerow/notyfikacji HUD — mobile 812x375 i desktop 1366x768. node tools/notif-shot.mjs
import { chromium } from 'playwright';
const BASE = 'http://localhost:5181/BrawlTanksv2/';
const b = await chromium.launch({ channel: 'chrome' });
for (const [name, opt] of [['mob', { viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }], ['desk', { viewport: { width: 1366, height: 768 } }]]) {
    const ctx = await b.newContext(opt); const p = await ctx.newPage();
    await p.goto(BASE + '?cloud=0'); await p.waitForTimeout(2500);
    await p.evaluate(async () => { const m = await import('/BrawlTanksv2/src/services/ProfileService.ts'); const pr = m.ProfileService.createProfile({ avatarId: 'ash', flagId: 'pl', nickname: 'TestPilot' }); m.ProfileService.setActiveProfile(pr.id); for (const k of ['bt2:castle_tut_done']) localStorage.setItem(k, '1'); for (const k of Object.keys(localStorage)) if (/tutorial/i.test(k)) localStorage.setItem(k, '1'); });
    await p.reload(); await p.waitForTimeout(2500);
    await p.evaluate(() => window.__devStart('castle', 'castle_grounds')); await p.waitForTimeout(6000);
    const shots = { mega: h => h.triggerMegaBossAlert(), banner: h => h.triggerCastleBanner('⚔ FALA 3/6', '#ff5a5a', 200), notif: h => { h.addNotif('🛡️ Tarcza aktywna!', '#2ecc71'); h.addNotif('+250 BONUS FALI', '#ffd24a'); }, enrage: h => h.triggerCtfEnrage() };
    for (const [k, fn] of Object.entries(shots)) {
        await p.evaluate(s => { const h = window.__hud; h.megaBossAlertTimer = 0; h.castleBannerTimer = 0; h.ctfEnrageTimer = 0; (0, eval)('(' + s + ')')(h); }, fn.toString());
        await p.waitForTimeout(900);
        await p.screenshot({ path: `reports/notif-${name}-${k}.png` });
    }
    await ctx.close();
}
await b.close(); console.log('done');
