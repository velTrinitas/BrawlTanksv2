/**
 * Czyste funkcje matematyczne — kolizje, dystans. Bez state.
 */

/**
 * Sprawdza czy okrąg (cx,cy,cr) koliduje z prostokątem (rx,ry,rw,rh).
 * Używa squared distance (no sqrt) dla performance.
 */
export function checkRectCollision(
    rx: number, ry: number, rw: number, rh: number,
    cx: number, cy: number, cr: number
): boolean {
    let tX = cx, tY = cy;
    if (cx < rx) tX = rx;
    else if (cx > rx + rw) tX = rx + rw;
    if (cy < ry) tY = ry;
    else if (cy > ry + rh) tY = ry + rh;
    
    return ((cx - tX) ** 2 + (cy - tY) ** 2) <= (cr * cr);
}

/**
 * Squared distance dla collision checks. Unika Math.sqrt.
 */
export function distSq(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
}