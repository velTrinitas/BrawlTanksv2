/**
 * hpColor — v0.187.0 (FAZA 2).
 *
 * JEDNO zrodlo koloru paska zycia gracza. Ta sama interpolacja zasila teraz dwa miejsca:
 *  - pigulke HP w HUD (`HUD.drawHPPill`, Canvas 2D — potrzebuje `rgb()`),
 *  - pasek nad czolgiem gracza (`Player.drawHp`, PIXI.Graphics — potrzebuje liczby 0xRRGGBB).
 *
 * Dzieki temu gracz widzi ten sam kolor w obu miejscach: gdy pasek nad czolgiem robi sie czerwony,
 * pigulka w rogu jest dokladnie tak samo czerwona. Wczesniej formula istniala tylko w HUD.
 *
 * Skala jest CIAGLA (bez progow): zielony -> pomaranczowy w polowie -> czerwony przy zerze.
 */

/** Zielony (pelne HP) -> pomaranczowy (50%) -> czerwony (0%). `t` = hp/maxHp, clampowane 0..1. */
export function hpColorRGB(t: number): { r: number; g: number; b: number } {
    const k = Math.max(0, Math.min(1, t));
    // Powyzej polowy interpolujemy zielen -> pomarancz, ponizej pomarancz -> czerwien.
    const r = k >= 0.5 ? Math.round(46 + (1 - k) * 2 * (255 - 46)) : Math.round(255 + (0.5 - k) * 2 * (231 - 255));
    const g = k >= 0.5 ? Math.round(204 + (1 - k) * 2 * (165 - 204)) : Math.round(165 + (0.5 - k) * 2 * (76 - 165));
    const b = k >= 0.5 ? Math.round(113 + (1 - k) * 2 * (0 - 113)) : Math.round((0.5 - k) * 2 * 60);
    return { r, g, b };
}

/** Ten sam kolor jako liczba 0xRRGGBB — dla PIXI.Graphics. */
export function hpColorHex(t: number): number {
    const { r, g, b } = hpColorRGB(t);
    return (r << 16) | (g << 8) | b;
}
