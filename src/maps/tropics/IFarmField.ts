/**
 * v0.36.0 FAZA T7.1 — Wspólny interface dla wszystkich pól rolniczych.
 *
 * Implementations:
 *   - CornField (existing T2)        — kukurydza z stealth + sok rozchylania
 *   - SugarcaneField (NEW T7.1)      — trzcina cukrowa z stealth + fluffy plumes
 *   - LettuceField (NEW T7.1)        — sałata z per-sprite crushed state
 *   - PastureField (NEW T7.1)        — pastwisko z trawą + AAA traktor mowing
 */
export interface IFarmField {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;

    update(): void;

    /** True jeśli pole oferuje stealth dla player (corn, sugarcane). False dla lettuce/pasture. */
    isPointInside(px: number, py: number): boolean;

    /** Reagowanie na pozycję czołgu (corn sok rozchylania, lettuce crush, pasture grass parting). */
    onTankEnter(tankX: number, tankY: number): void;
}

/** Display name dla HUD notyfikacji stealth. */
export const FARM_FIELD_STEALTH_LABELS: Record<string, { label: string; color: string }> = {
    corn:      { label: '🌾 UKRYTY W KUKURYDZY (10s)!', color: '#d4b830' },
    sugarcane: { label: '🎋 UKRYTY W TRZCINIE (10s)!',  color: '#a8d870' },
};