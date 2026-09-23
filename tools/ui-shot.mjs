/**
 * ui-shot.mjs — zrzuty ekranow hubu/menu bez grania (dev).
 *
 * PO CO: kazda poprawka kosmetyczna wymaga porownania PRZED/PO na tej samej scenie.
 * Klikanie tego recznie na telefonie przy kazdej iteracji jest wolniejsze niz caly fix.
 *
 * UZYCIE (dev-server musi chodzic):
 *   node tools/ui-shot.mjs <nazwa> "<selektor1>" "<selektor2>" ...
 * np.
 *   node tools/ui-shot.mjs mapa '[data-section="battle"]' '[data-action="pick-map"]'
 *
 * Domyslnie robi dwa warianty: desktop 1280x900 i mobile 812x375 (POZIOMO — gra ma
 * landscape-lock i w pionie zaslania wszystko `.bt-portrait-warning`).
 *
 * Narzedzie dev — brak wplywu na symulacje.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'docs', 'reports', 'ui');
const URL_BASE = process.env.BT_URL || 'http://localhost:5173/BrawlTanksv2/';

const [, , name = 'shot', ...steps] = process.argv;
const PROFILE_ID = '11111111-2222-3333-4444-555555555555';
const now = Date.now();

/** Ksztalt wprost z ProfileService.isValidProfileEntry — daty to LICZBY, nie ISO. */
const profile = {
    id: PROFILE_ID, nickname: 'TestGracz', avatarId: 'ash', flagId: 'pl',
    language: 'pl', createdAt: now - 86400000, lastPlayedAt: now, totalGamesPlayed: 37,
};
const progression = {
    profileId: PROFILE_ID, trophies: 2600, bolts: 3000, boltsSpent: 400,
    perMapBest: { desert: 420, city: 180 }, claimedMilestones: [10, 30, 100],
    lastRunDayKey: null, totalRuns: 37, updatedAt: now,
    cratesEarned: 6, cratesOpened: 6, pityCounter: 0,
    ownedCosmetics: [], equipped: {}, equippedAt: now, crateMilestonesCredited: [],
    ownedPowers: [], loadout: [null, null, null], loadoutAt: now,
    funModeOn: false, funModeAt: 0,
    lifetime: { kills: 640, gems: 210, seconds: 5400, shotsFired: 4200, shotsHit: 1500 },
    records: { maxKills: 54, maxGems: 31, maxSeconds: 420, bestAccuracy: 48, maxCombo: 12 },
};

const browser = await chromium.launch({ channel: 'chrome' });
const made = [];
try {
    for (const [tag, viewport] of [
        ['desktop', { width: 1280, height: 900 }],
        ['mobile', { width: 812, height: 375 }],
    ]) {
        const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        await page.goto(URL_BASE, { waitUntil: 'load' });
        await page.evaluate(([p, prog, pid]) => {
            localStorage.setItem('bt2:profiles', JSON.stringify([p]));
            localStorage.setItem('bt2:activeProfileId', pid);
            localStorage.setItem('bt2:progression', JSON.stringify({ [pid]: prog }));
        }, [profile, progression, PROFILE_ID]);
        await page.reload({ waitUntil: 'load' });

        // Splash: klikamy KONKRETNY element, nie wspolrzedne (okno zmienia rozmiar).
        const start = page.locator('button.bt-intro-start');
        await start.waitFor({ state: 'visible', timeout: 20000 });
        await start.click();
        await page.waitForTimeout(2500);

        for (const sel of steps) {
            const loc = page.locator(sel).first();
            if (!(await loc.count())) { console.log(`  [${tag}] brak selektora: ${sel}`); break; }
            await loc.click();
            await page.waitForTimeout(1200);
        }

        const file = path.join(OUT, `${name}-${tag}.png`);
        await page.screenshot({ path: file });
        made.push(file);
        await ctx.close();
    }
} finally {
    await browser.close();
}
console.log(made.map(f => path.relative(REPO, f)).join('\n'));
