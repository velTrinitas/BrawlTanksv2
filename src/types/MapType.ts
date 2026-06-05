export type MapId = 'city' | 'desert';

export interface MapConfig {
    id: MapId;
    name: string;
    bg: string;           // CSS fallback color (przed załadowaniem tekstury)
    musicTrack: string;   // mp3 filename (do AudioSys)
    badge: string;        // kolor badge w menu wyboru mapy
}

export const MAP_CONFIGS: Record<MapId, MapConfig> = {
    city:   { id: 'city',   name: 'CYBERPUNK', bg: '#0d0d14', musicTrack: 'miasto.mp3',   badge: '#5d3580' },
    desert: { id: 'desert', name: 'PUSTYNIA',  bg: '#e8d4a2', musicTrack: 'pustynia.mp3', badge: '#b8720a' },
};

/**
 * Czyta URL param ?map=desert dla wyboru mapy (testing FAZA 1, przed menu w FAZIE 6).
 * Domyślnie zwraca 'city'.
 */
export function getMapIdFromUrl(): MapId {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('map');
    return m === 'desert' ? 'desert' : 'city';
}