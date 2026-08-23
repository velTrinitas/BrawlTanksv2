/**
 * flagGradient.ts — PROFILE-1 (v0.118.0).
 *
 * CSS linear-gradient odpowiadajacy PIXI FlagRenderer (wspolny jezyk wizualny).
 * Wyciagniete z ProfileEditScreen/IdentityScreen/MainHub (kazdy mial wlasna kopie) —
 * uzywane przez nowa strone profilu w hubie + legacy ekrany moga migrowac pozniej.
 */
import type { FlagConfig } from '../config/flags';

export function computeFlagGradient(config: FlagConfig): string {
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
    const p = hex(config.colors.primary);
    const s = hex(config.colors.secondary);
    const tert = hex(config.colors.tertiary ?? config.colors.primary);

    switch (config.pattern) {
        case 'horizontal_2':
            return `linear-gradient(to bottom, ${p} 0%, ${p} 50%, ${s} 50%, ${s} 100%)`;
        case 'horizontal_3':
            return `linear-gradient(to bottom, ${p} 0%, ${p} 33.33%, ${s} 33.33%, ${s} 66.67%, ${tert} 66.67%, ${tert} 100%)`;
        case 'vertical_3':
            return `linear-gradient(to right, ${p} 0%, ${p} 33.33%, ${s} 33.33%, ${s} 66.67%, ${tert} 66.67%, ${tert} 100%)`;
    }
}
