/**
 * castlePalette.ts — paleta "ZIELONA DOLINA" (OBRON ZAMEK). Osobny modul bez
 * importow, zeby CastleMap.ts (bake gruntu) i castle/* (propy, bake czesci) mogly
 * dzielic te same kolory bez cyklu importow.
 *
 * T7: laka/las 60%, granit 30%, heraldyczny szkarlat + zloto 10%. Musi sie
 * odrozniac od Ruin Fortecy (piaskowiec/zimny kamien/zmierzch) i Tropikow
 * (cieplejsza zielen, czerwone stodoly). Zero cyjanu (freeze/stealth), zloto
 * STATYCZNE (pulsujacy zloty pierscien = Enigma).
 */

export const CASTLE_PALETTE = Object.freeze({
    meadow:      '#7cbf58',
    meadowDark:  '#6aa84a',
    meadowLight: '#8fce68',
    forest:      '#3f7a3a',
    forestMid:   '#4f8f45',
    forestLight: '#6fb35a',
    forestDeep:  '#2c5a2a',
    trunk:       '#6b4c2a',
    trunkDark:   '#48331d',
    road:        '#b9a37a',
    roadEdge:    '#9c8862',
    cobble:      '#a8a49a',
    cobbleJoint: '#807c72',
    granite:     '#8f959a',
    graniteJoint:'#5f656a',
    graniteTop:  '#a9aeb2',
    graniteDark: '#6d7378',
    graniteDeep: '#3d4247',
    crack:       '#2b2f34',
    moss:        '#5f8a3e',
    moat:        '#3b7f8c',
    moatDeep:    '#2c6270',
    moatFoam:    '#9fd3d9',
    plank:       '#8a6a3c',
    plankDark:   '#5e4626',
    oak:         '#6e4a24',
    oakDark:     '#4a3016',
    iron:        '#3a3d44',
    crimson:     '#b3202a',
    crimsonDark: '#7a1119',
    crimsonLight:'#d7404a',
    gold:        '#e0b53c',
    goldDark:    '#a67f1e',
    wheat:       '#d8b855',
    wheatDark:   '#b3933a',
    canvas:      '#d9cbb0', // namioty obozow
    canvasDark:  '#a89a80',
    enemyRed:    '#c0392b', // sztandary najezdzcow
});

export const CASTLE_HEX = Object.freeze({
    meadow:      0x7cbf58,
    meadowDark:  0x6aa84a,
    forest:      0x3f7a3a,
    forestDeep:  0x2c5a2a,
    granite:     0x8f959a,
    graniteJoint:0x5f656a,
    graniteTop:  0xa9aeb2,
    moat:        0x3b7f8c,
    moatDeep:    0x2c6270,
    moatFoam:    0x9fd3d9,
    plank:       0x8a6a3c,
    crimson:     0xb3202a,
    gold:        0xe0b53c,
    wheat:       0xd8b855,
});

/** T1: slonce NW -> highlight NW, cien SE. Wspolne dla kazdego bake'u castle/*. */
export const CASTLE_LIGHT = Object.freeze({
    shX: 4,
    shY: 4,
    highlightAlpha: 0.2,
    shadowAlpha: 0.3,
});
