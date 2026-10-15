// PUMPKIN — podglad 4 wariantow plamy (pieczone tekstury z Effects.ts) na jednym zrzucie. Dev-only, vite 5181.
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: 700, height: 220 } })).newPage();
await p.goto('http://localhost:5181/BrawlTanksv2/pumpkin-preview.html');
await p.evaluate(async () => {
    const m = await import('/BrawlTanksv2/src/rendering/Effects.ts');
    document.body.innerHTML = '<div id=w style="display:flex;gap:20px;padding:20px;background:#7a6a4a"></div>';
    for (let v = 0; v < m.PUMPKIN_SPLAT_VARIANTS; v++) {
        const src = m.getPumpkinSplatTexture(v).baseTexture.resource.source;
        src.style.cssText = 'width:144px;height:144px;background:#5d6168;border-radius:8px';
        document.getElementById('w').appendChild(src);
    }
});
await p.screenshot({ path: 'reports/pumpkin-splats.png' });
await b.close();
