/**
 * tankart-verify.mjs — weryfikacja TANK ART v2 W GRZE (dev; dev-server musi chodzic).
 *   node tools/tankart-verify.mjs [out.png] [extraQuery]
 * Bootstrap profilu jak ui-shot.mjs, mecz przez ?bot=1 (bot jezdzi i strzela), zrzut po kilku
 * sekundach + logi konsoli (AABB / VRAM z ?diag=1, bledy). Narzedzie dev — brak wplywu na symulacje.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_BASE = process.env.BT_URL || 'http://localhost:5173/BrawlTanksv2/';
const out = process.argv[2] || path.join(REPO, 'docs', 'reports', 'ui', 'tankart-ingame.png');
const extra = process.argv[3] || 'tankart=1&diag=1';
const PROFILE_ID = '11111111-2222-3333-4444-555555555555';
const now = Date.now();
const profile = { id: PROFILE_ID, nickname: 'TestGracz', avatarId: 'ash', flagId: process.env.FLAG || 'pl', language: 'pl', createdAt: now - 86400000, lastPlayedAt: now, totalGamesPlayed: 37, tankNumber: 42 };
const progression = {
    profileId: PROFILE_ID, trophies: 2600, bolts: 3000, boltsSpent: 400, perMapBest: {}, claimedMilestones: [],
    lastRunDayKey: null, totalRuns: 37, updatedAt: now, cratesEarned: 0, cratesOpened: 0, pityCounter: 0,
    ownedCosmetics: [], equipped: {}, equippedAt: now, crateMilestonesCredited: [], ownedPowers: [], loadout: [null, null, null], loadoutAt: now,
    funModeOn: false, funModeAt: 0,
};

let browser; try { browser = await chromium.launch({ channel: 'chrome' }); } catch { browser = await chromium.launch({ channel: 'msedge' }); }
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => { const t = m.text(); if (m.type() === 'error' || /TankSpriteBaker|AABB|tankart|Tank Art/i.test(t)) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', e => logs.push('[PAGEERROR] ' + e.message));
await page.goto(URL_BASE, { waitUntil: 'load' });
await page.evaluate(([p, prog, pid]) => {
    localStorage.setItem('bt2:profiles', JSON.stringify([p]));
    localStorage.setItem('bt2:activeProfileId', pid);
    localStorage.setItem('bt2:progression', JSON.stringify({ [pid]: prog }));
}, [profile, progression, PROFILE_ID]);
await page.goto(`${URL_BASE}?bot=1&seed=3&queentut=0&castletut=0&${extra}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__sigmaTest, null, { timeout: 60000 }).catch(() => logs.push('[warn] __sigmaTest not found'));
// intro START -> control.start (jak sigma run.mjs) -> bot jezdzi i strzela przez N klatek
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /START/i.test(b.textContent)); b && b.click(); });
await page.waitForTimeout(1200);
await page.evaluate(async (cfg) => { await window.__sigmaTest.control.start(cfg); }, { scenario: 'ktb', map: process.env.MAP || 'desert', brawler: process.env.TANK || 'twardy', difficulty: 'normal' });
await page.waitForTimeout(600);
await page.evaluate(() => window.__sigmaTest.bot.setMode('play'));
const frames = parseInt(process.env.FRAMES || '240', 10);
await page.evaluate((n) => { for (let i = 0; i < n; i += 30) window.__sigmaTest.bot.tick(30); }, frames);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
// FX strzalu: wymuszony ogien (aim w prawo, trzymany) + 3 zrzuty co 8 klatek (SUPER=1 => super strzal)
await page.evaluate((sup) => { const T = window.__sigmaTest; const pl = T.snapshot().player; if (sup) T.input.super(0); T.input.aimWorld(pl.x + 400, pl.y, true); for (let i = 0; i < 3; i++) T.control.step(1); }, process.env.SUPER === '1');
for (let k = 1; k <= 3; k++) { await page.evaluate(() => { const T = window.__sigmaTest; const pl = T.snapshot().player; T.input.aimWorld(pl.x + 400, pl.y, true); T.control.step(5); }); await page.waitForTimeout(120); await page.screenshot({ path: out.replace(/.png$/, `-f${k}.png`), clip: { x: 400, y: 250, width: 880, height: 300 } }); }
console.log('saved', out);
for (const l of logs) console.log(l);
await browser.close();
