/**
 * DamageSource.ts — Z0.5 (COOP ETAP 0, v0.152.0): zrodlo obrazen w kolizjach.
 *
 * Kazde wywolanie Player.takeDamage / Enemy.takeDamage niesie zrodlo (parametr
 * OBOWIAZKOWY — kompilator wymusza komplet, nie konwencja). To pre-task zapisany
 * w .claude/rules/super-powers.md: miny/taran/questy potrzebuja wiedziec "kto
 * zadal obrazenia"; w koopie (ETAP 2) `playerIndex` rozstrzygnie kill/asyste.
 *
 * Zakres SWIADOMIE ograniczony do encji z gameplayowym HP (Player, Enemy).
 * Propsy mapowe (skrzynki, lod, reaktory, cargo) maja wlasne duck-typowane
 * takeDamage(d,x,y) w dziesiatkach plikow — to srodowisko bez atrybucji,
 * zmiana ich sygnatur = duza powierzchnia regresji przy zerowej wartosci.
 *
 * Z0.5 NIE dodaje zadnego konsumenta zrodla — zero zmian zachowania/balansu.
 * Konsumenci przyjda pozniej: koop (score per gracz), moce (Widmo/Babcia),
 * questy per-zrodlo. `lastDamageSource` na encji jest gotowym punktem odczytu.
 */

export type DamageSourceKind =
    // -> gracz
    | 'enemy_bullet'   // pocisk wroga (attackerRef: EnemyBullet)
    | 'enemy_ram'      // taran / kolizja z wrogiem (attackerRef: Enemy)
    | 'snowball'       // sniezka yeti (Arktyka)
    | 'boss_bomb'      // bomba bossa CTF
    // -> wrogowie
    | 'player_bullet'  // pocisk gracza (takze super shot)
    | 'power'          // super moc (mega bomba, miny, rakiety, Dziura, Laser, wieza...)
    | 'shockwave';     // shockwave-on-hit Pancernego (perk brawlera, nie moc)

export interface DamageSource {
    readonly kind: DamageSourceKind;
    /** Ktora moc (dla kind 'power') — do nawleczenia gdy questy tego zazadaja. */
    readonly powerId?: string;
    /** Indeks gracza-sprawcy (koop ETAP 2); dzis zawsze 0. */
    readonly playerIndex?: number;
    /** Referencja sprawcy (Enemy przy taranie, EnemyBullet przy pocisku). */
    readonly attackerRef?: object;
}

// Zamrozone stale wspoldzielone dla zrodel bez referencji — zero churnu GC
// przy wielu trafieniach na sekunde. Zrodla Z referencja buduje sie literalem.
export const SRC_SNOWBALL: DamageSource = Object.freeze({ kind: 'snowball' as const });
export const SRC_BOSS_BOMB: DamageSource = Object.freeze({ kind: 'boss_bomb' as const });
export const SRC_PLAYER_BULLET: DamageSource = Object.freeze({ kind: 'player_bullet' as const, playerIndex: 0 });
export const SRC_POWER: DamageSource = Object.freeze({ kind: 'power' as const, playerIndex: 0 });
export const SRC_SHOCKWAVE: DamageSource = Object.freeze({ kind: 'shockwave' as const, playerIndex: 0 });
export const SRC_POWER_MEGA_BOMB: DamageSource = Object.freeze({ kind: 'power' as const, powerId: 'megaBomb', playerIndex: 0 });
