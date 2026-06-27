/**
 * MapType.ts — definicje map gry.
 *
 * FAZA A (Arctic unlock):
 * - MapId rozszerzone: 'city' | 'desert' | 'tropics' | 'arctic' (Constitution Decision #6 update)
 * - arctic dodane do MAP_CONFIGS (musicTrack: arktyka1.ogg, badge: #1a6ea8)
 * - MENU_MAP_CARDS: arctic.available = true (przeniesione z locked do playable), comingSoonKey usuniety
 * - MenuMapCardId zwezone do MapId (arctic juz w MapId; przyszle LOCKED mapy rozszerza ten union)
 * - getMapIdFromUrl: dodana obsluga ?map=arctic
 * - isPlayableMapId: uwzglednia 'arctic'
 *
 * v0.25.0 update (FAZA T1 — Tropics unlock):
 * - MapId rozszerzone: 'city' | 'desert' | 'tropics'
 * - tropics dodane do MAP_CONFIGS + MENU_MAP_CARDS unlocked
 *
 * v0.19.0 update (FAZA 6 — Map Selection UI + i18n):
 * - MENU_MAP_CARDS: osobna struktura dla menu display, uzywa translation keys
 * - Type-safe separation: game logic uzywa MapId, menu uzywa MenuMapCardId
 */

import type { TranslationKey } from '../i18n/i18n';

// PLAYABLE maps — uzywane przez game logic (main.ts, AudioSys, Spawn, etc.)
export type MapId = 'city' | 'desert' | 'tropics' | 'arctic';

export interface MapConfig {
    id: MapId;
    name: string;         // display name (legacy — main.ts mapBadge nadal uzywa)
    bg: string;           // CSS fallback color (przed zaladowaniem tekstury)
    musicTrack: string;   // mp3 filename (legacy — AudioSys uzywa MUSIC_TRACKS_PER_MAP)
    badge: string;        // kolor badge w menu wyboru mapy
}

export const MAP_CONFIGS: Record<MapId, MapConfig> = {
    city:    { id: 'city',    name: 'CYBERPUNK', bg: '#0d0d14', musicTrack: 'miasto.mp3',    badge: '#5d3580' },
    desert:  { id: 'desert',  name: 'PUSTYNIA',  bg: '#e8d4a2', musicTrack: 'pustynia.mp3',  badge: '#b8720a' },
    tropics: { id: 'tropics', name: 'TROPIKI',   bg: '#6dba4a', musicTrack: 'tropiki.mp3',   badge: '#1a7a40' },
    arctic:  { id: 'arctic',  name: 'ARKTYKA',   bg: '#bcdfec', musicTrack: 'arktyka1.ogg',  badge: '#1a6ea8' },
};

/**
 * Czyta URL param ?map=desert dla wyboru mapy (testing, dev shortcut).
 * Po FAZIE 6 menu jest glownym sposobem wyboru — URL param zostaje jako dev fallback.
 * Domyslnie zwraca 'city'.
 */
export function getMapIdFromUrl(): MapId {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('map');
    if (m === 'desert') return 'desert';
    if (m === 'tropics') return 'tropics';
    if (m === 'arctic') return 'arctic';
    return 'city';
}

/**
 * Wspolny interfejs dla obiektow map z kolizja i parallax.
 * Implementowany przez CyberBuilding (city), Pyramid/Sphinx/Rock (desert),
 * FarmBuilding/Crate/Windmill (tropics), GlacialBorder/IceBarricade (arctic — FAZA A+).
 *
 * UWAGA: collision functions w Bullet.ts / Player.ts uzywaja b.x, b.y, b.w, b.h
 * (rectangle hitbox). Wartosc update() obsluguje parallax offset per frame.
 */
export interface ICollidable {
    x: number;
    y: number;
    w: number;
    h: number;
    update(camX: number, camY: number, screenW: number, screenH: number): void;
}

// ============================================================
// FAZA 6 — Menu display (separate from game logic, i18n-enabled)
// ============================================================

/**
 * Identyfikatory map dla menu display.
 * FAZA A: 'arctic' przeniesione z locked do playable (jest w MapId), wiec
 * MenuMapCardId == MapId. Gdy w przyszlosci dojdzie LOCKED mapa z id spoza MapId,
 * rozszerz ten union (np. `MapId | 'volcano'`).
 */
export type MenuMapCardId = MapId;

export interface MenuMapCard {
    id: MenuMapCardId;
    /** Translation key dla nazwy mapy (np. 'map.desert.name'). */
    nameKey: TranslationKey;
    /** Translation key dla krotkiego opisu/tagline. */
    taglineKey: TranslationKey;
    /** Emoji fallback (Unicode, bez tlumaczenia). */
    emoji: string;
    /** Dominant color karty (hex). */
    accentColor: string;
    /** Darker shade dla cienia karty (hex). */
    accentDarker: string;
    /** CSS gradient dla tla karty. */
    bgGradient: string;
    /** Czy klikalne (false = locked). */
    available: boolean;
    /** Translation key dla badge gdy locked (np. 'common.soon'). */
    comingSoonKey?: TranslationKey;
    /** Typ MapPreview component (FAZA 6b). */
    previewType: 'desert' | 'cyberpunk' | 'tropics' | 'arctic';
}

/**
 * Wszystkie karty mapy w menu — kolejnosc = display order.
 * Available mapy ida pierwsze, locked na koncu.
 */
export const MENU_MAP_CARDS: MenuMapCard[] = [
    {
        id: 'desert',
        nameKey: 'map.desert.name',
        taglineKey: 'map.desert.tagline',
        emoji: '🐪',
        accentColor: '#d4961f',
        accentDarker: '#8b6014',
        bgGradient: 'linear-gradient(160deg, #f4d68a 0%, #e8b65c 50%, #c98c2f 100%)',
        available: true,
        previewType: 'desert',
    },
    {
        id: 'city',
        nameKey: 'map.city.name',
        taglineKey: 'map.city.tagline',
        emoji: '🌆',
        accentColor: '#9b59b6',
        accentDarker: '#5d3580',
        bgGradient: 'linear-gradient(160deg, #2a1f4a 0%, #1a1a2e 50%, #0d0d14 100%)',
        available: true,
        previewType: 'cyberpunk',
    },
    {
        id: 'tropics',
        nameKey: 'map.tropics.name',
        taglineKey: 'map.tropics.tagline',
        emoji: '🌴',
        accentColor: '#27ae60',
        accentDarker: '#1a7a40',
        bgGradient: 'linear-gradient(160deg, #2ecc71 0%, #16a085 50%, #0e6655 100%)',
        available: true,                  // v0.25.0 FAZA T1: unlocked
        previewType: 'tropics',
    },
    {
        id: 'arctic',
        nameKey: 'map.arctic.name',
        taglineKey: 'map.arctic.tagline',
        emoji: '❄️',
        accentColor: '#5dade2',
        accentDarker: '#1a6ea8',
        bgGradient: 'linear-gradient(160deg, #d6eaf8 0%, #85c1e9 50%, #2874a6 100%)',
        available: true,                  // FAZA A: unlocked
        previewType: 'arctic',
    },
];

/**
 * Helper — czy id mapy jest playable (typy MapId)?
 * Uzywamy do narrowing typu przed uzyciem w game logic.
 * FAZA A: arctic dodane do playable.
 */
export function isPlayableMapId(id: MenuMapCardId): id is MapId {
    return id === 'city' || id === 'desert' || id === 'tropics' || id === 'arctic';
}

/**
 * Helper — znajdz MenuMapCard po id (dla menu).
 */
export function getMenuMapCard(id: MenuMapCardId): MenuMapCard | undefined {
    return MENU_MAP_CARDS.find(c => c.id === id);
}