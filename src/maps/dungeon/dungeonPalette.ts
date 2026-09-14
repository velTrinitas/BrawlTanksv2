/**
 * dungeonPalette.ts — paleta "LOCHY" (SAVE THE QUEEN). Osobny modul bez importow,
 * zeby DungeonMap.ts (bake gruntu) i dungeon/* (propy) dzielily kolory bez cyklu.
 *
 * Lock palety (design doc §9.13): podloga/mury = zimny granat-fiolet; lawa/pochodnie =
 * JEDYNE cieple kolory (pomarancz-czerwien); cegla = bordo-ceglasta; ruda = stalowy
 * szaro-niebieski; Krolowa = perla + magenta + fiolet. ZERO zlota (Enigma), zero cyjanu
 * (freeze/stealth). T7: musi sie odrozniac od Ruin (piaskowiec) i Zamku (laka).
 */

export const DUNGEON_PALETTE = Object.freeze({
    floor:        '#1e1729',
    floorLight:   '#2a2036',
    floorDark:    '#151020',
    grout:        '#120d1a',
    groutWarm:    '#ff7a1a', // fugi z cieplym swiatlem lawy (alpha 0.15)
    rock:         '#2b2438',
    rockLight:    '#3a3149',
    rockDark:     '#1a1424',
    rockEdge:     '#4a405c',
    moss:         '#6b3fa0', // fioletowy mech w pekniecach
    mossLight:    '#8e5ccc',
    stone:        '#4d4660', // most kamienny / filary
    stoneLight:   '#6a6280',
    stoneDark:    '#352f45',
    stoneJoint:   '#231e30',
    lava:         '#ff5a1a',
    lavaBright:   '#ffb347',
    lavaDark:     '#8a1e0a',
    lavaCrust:    '#3a1a12',
    lavaCoreDark: '#591100', // v0.179.0 "gorący rdzeń" (brief AD): cebula bordo -> pomarancz -> zolty
    lavaCoreMid:  '#ff6600',
    lavaCoreHot:  '#ffcc00',
    lavaWhite:    '#fff3b8', // v0.180.0 placki: najgoretszy zar szczelin
    lavaCrustLight: '#6b3a2a', // grzbiet placka (rim NW)
    lavaCrustDark:  '#2a120c', // cien placka
    torch:        '#ffb347',
    iron:         '#3b3f46',
    ironLight:    '#5a6068',
    brick:        '#8b3a2f',
    brickLight:   '#a84a3b',
    brickDark:    '#5e2419',
    mortar:       '#c9b8a5',
    violet:       '#8e44ad', // kolor kafla / Krolowej
    magenta:      '#c2247a',
    pearl:        '#f2ecf5',
    coin:         '#7a6b52', // stare monety-kamyki (matowe, NIE zloto)
});

export const DUNGEON_HEX = Object.freeze({
    floor:      0x1e1729,
    rock:       0x2b2438,
    rockDark:   0x1a1424,
    rockEdge:   0x4a405c,
    stone:      0x4d4660,
    stoneDark:  0x352f45,
    lava:       0xff5a1a,
    lavaBright: 0xffb347,
    lavaDark:   0x8a1e0a,
    lavaCrust:    0x3a1a12,
    lavaCoreDark: 0x591100,
    lavaCoreMid:  0xff6600,
    lavaCoreHot:  0xffcc00,
    lavaWhite:    0xfff3b8,
    lavaCrustLight: 0x6b3a2a,
    lavaCrustDark:  0x2a120c,
    violet:     0x8e44ad,
    magenta:    0xc2247a,
    pearl:      0xf2ecf5,
    brick:      0x8b3a2f,
    iron:       0x3b3f46,
});

/** T1: swiatlo NW (jak kazda mapa) — highlight NW, cien SE. W lochach dodatkowo
 *  lokalne cieple podswietlenie od lawy (wpieczone, nie live). */
export const DUNGEON_LIGHT = Object.freeze({
    shX: 4,
    shY: 5,
    highlightAlpha: 0.16,
    shadowAlpha: 0.38,
});
