/**
 * SupabaseProfileService.ts — FAZA 9b.3a (v0.47.0)
 *
 * Cloud (Supabase) operacje na profilu — WSZYSTKIE async.
 * Per-feature isolation: ProfileService (localStorage, synchroniczny) zostaje
 * nietkniety i pozostaje zrodlem prawdy lokalnie. Ten serwis dokłada warstwe
 * chmury jako OSOBNY concern — zero zmian w istniejacym flow onboarding/edit.
 *
 * Mapowanie Profile (klient) <-> profiles (DB):
 *   id              -> id
 *   nickname        -> nickname
 *   avatarId        -> avatar_id
 *   flagId          -> flag_id        (Profile.flagId zawsze wypelnione)
 *   language        -> language
 *   totalGamesPlayed-> session_count
 *   createdAt/lastPlayedAt -> local-only (DB created_at = server now())
 *
 * TOZSAMOSC (Z0.10b, 2026-09-24): `id` nadal jest client-side UUID i jest PUBLICZNY
 * (ranking zwraca `profile_id`), wiec NIE moze pelnic roli sekretu. Wlascicielem wiersza
 * jest `owner_uid` = uid anonimowej sesji Supabase, ktorego klient nie moze podrobic.
 * Uniqueness nicku dalej przez DB UNIQUE constraint.
 */

import type { Profile } from '../types/Profile';
import type { ProfileInsert, ProfileRow } from './supabase/types';
import { isCloudEnabled } from '../config/cloud';
import { ensureAnonSession, getSupabase } from './supabase/SupabaseClient';

/**
 * Rzucany gdy nick jest juz zajety w chmurze (DB UNIQUE violation, kod 23505).
 * UI lapie ten typ i pokazuje komunikat 'profile.*.nicknameTaken'.
 */
export class NicknameTakenError extends Error {
    constructor(public readonly nickname: string) {
        super(`Nickname taken: ${nickname}`);
        this.name = 'NicknameTakenError';
    }
}

export class SupabaseProfileService {
    /**
     * Czy nick jest dostepny? CASE-INSENSITIVE — "Komandor"/"komandor"/"KOMANDOR"
     * to ten sam nick (spojne z DB functional unique index na lower(nickname)).
     * excludeProfileId pozwala edytowac wlasny profil bez kolizji z samym soba.
     *
     * .ilike() z nickiem bez wildcardow (%/_) dziala jak case-insensitive equals.
     * UWAGA: gdyby nick zawieral % lub _ — tu by byly wildcardami. Nicki sa
     * alfanumeryczne (isValidNickname: ^[a-zA-Z0-9]+$), wiec wildcardy nie wystapia.
     */
    async isNicknameAvailable(nickname: string, excludeProfileId?: string): Promise<boolean> {
        // Chmura odcieta => nie ma z czym kolidowac; nick wolny (walidacja lokalna zostaje).
        if (!isCloudEnabled()) return true;
        const sb = getSupabase();
        const { data, error } = await sb
            .from('profiles')
            .select('id')
            .ilike('nickname', nickname);

        if (error) throw error;
        if (!data || data.length === 0) return true;
        // Dostepny tylko jesli wszystkie trafienia to nasz wlasny profil.
        if (excludeProfileId && data.every((r) => r.id === excludeProfileId)) return true;
        return false;
    }

    /**
     * UPSERT profilu do chmury (insert lub update po id).
     * Rzuca NicknameTakenError gdy nick zajety przez INNE id (DB 23505).
     */
    async upsertProfile(profile: Profile): Promise<void> {
        if (!isCloudEnabled()) return;
        const sb = getSupabase();
        // Z0.10b: bez uid RLS odrzuci zapis (`WITH CHECK (owner_uid = auth.uid())`).
        // `ensureAnonSession()` jest idempotentne i cache'owane — kolejne wywolania
        // oddaja ten sam uid bez dodatkowego logowania.
        const uid = await ensureAnonSession();
        // Brak sesji => NIE probujemy zapisu. Bez `owner_uid` RLS i tak by go odrzucil,
        // a blad poleczialby w gore przez `pushProfileToCloud()` do UI, ktore wtedy NIE
        // zapisuje profilu lokalnie — czyli awaria providera auth zablokowalaby
        // zakladanie konta w ogole. Offline-first: localStorage jest zrodlem prawdy,
        // chmura dogoni przy nastepnym boocie (`syncActiveProfileToCloud`).
        if (!uid) {
            console.warn('[Supabase] Profil NIE wyslany do chmury — brak anonimowej sesji. '
                + 'Zapis lokalny dziala normalnie.');
            return;
        }
        const row: ProfileInsert = {
            id: profile.id,
            nickname: profile.nickname,
            avatar_id: profile.avatarId,
            flag_id: profile.flagId,
            language: profile.language,
            session_count: profile.totalGamesPlayed,
            owner_uid: uid,
        };

        const { error } = await sb.from('profiles').upsert(row, { onConflict: 'id' });

        if (error) {
            if (error.code === '23505') throw new NicknameTakenError(profile.nickname);
            throw error;
        }
    }

    /**
     * Pobiera profil z chmury po id (cross-device sync down).
     * Zwraca null gdy nie istnieje.
     */
    async fetchProfile(id: string): Promise<ProfileRow | null> {
        if (!isCloudEnabled()) return null;
        const sb = getSupabase();
        const { data, error } = await sb
            .from('profiles')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        return (data as ProfileRow) ?? null;
    }
}

/** Singleton — import wszędzie gdzie potrzeba cloud profilu. */
export const supabaseProfileService = new SupabaseProfileService();