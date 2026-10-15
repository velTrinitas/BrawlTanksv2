// DEV: strefa slow fosy w rogach (SIM 17) — node tools/moat-corner-check.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage();
await p.goto('http://localhost:5181/BrawlTanksv2/?cloud=0'); await p.waitForTimeout(2000);
const r = await p.evaluate(async () => {
    const { CASTLE_MOAT } = await import('/BrawlTanksv2/src/maps/CastleMap.ts');
    const { moatLoopFrom } = await import('/BrawlTanksv2/src/maps/castle/castleMoatLoop.ts');
    const { CastleMoat } = await import('/BrawlTanksv2/src/maps/castle/CastleMoat.ts');
    const PIXI = await import('/BrawlTanksv2/node_modules/.vite/deps/pixi__js.js').catch(() => import('/BrawlTanksv2/node_modules/pixi.js/dist/pixi.mjs'));
    const m = new CastleMoat(CASTLE_MOAT, new PIXI.Container());
    const L = moatLoopFrom(CASTLE_MOAT);
    return { L, corner: m.isPointInside(L.o0 + 4, L.o0 + 4), nearInner: m.isPointInside(L.i0 - 6, L.i0 - 6), arcMid: m.isPointInside(L.i0 - L.half, L.o0 + 6), straight: m.isPointInside(1250, L.o0 + 4), arcIn: m.isPointInside(1040, 1040), courtyard: m.isPointInside(1500, 1500) };
});
console.log(JSON.stringify(r)); await b.close();
