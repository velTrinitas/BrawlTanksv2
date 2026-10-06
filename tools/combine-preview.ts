// Dev-only: podglad 8 kierunkow kombajnu (esbuild -> tools/combine-preview.html).
import { drawCombineFrame } from '../src/maps/tropics/Combine';
const cv = document.createElement('canvas'); cv.width = 800; cv.height = 400;
document.body.style.background = '#6cba48'; document.body.style.margin = '0';
document.body.appendChild(cv);
const c = cv.getContext('2d')!;
for (let i = 0; i < 8; i++) {
    c.save(); c.translate((i % 4) * 200, Math.floor(i / 4) * 200);
    drawCombineFrame(c, i * Math.PI / 4);
    c.restore();
}
