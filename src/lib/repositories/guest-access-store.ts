import "server-only";

import type { GuestAccessStore } from "@/features/auth/guest-access";
import { adminSupabase } from "@/lib/supabase/admin";

type EventRow = {
  id: string;
  name: string;
  retention_at: string;
};

export class SupabaseGuestAccessStore implements GuestAccessStore {
  async findEventByAccessTokenHash(hash: string) {
    const { data, error } = await adminSupabase()
      .from("events")
      .select("id,name,retention_at")
      .eq("access_token_hash", hash)
      .maybeSingle<EventRow>();
    if (error) throw error;
    return data ? { id: data.id, name: data.name, retentionAt: data.retention_at } : null;
  }

  async findEventById(id: string) {
    const { data, error } = await adminSupabase()
      .from("events")
      .select("id,name,retention_at")
      .eq("id", id)
      .maybeSingle<EventRow>();
    if (error) throw error;
    return data ? { id: data.id, name: data.name, retentionAt: data.retention_at } : null;
  }

  async createGuestSession(input: {
    eventId: string;
    displayName: string;
    consentVersion: string;
    consentedAt: string;
    tokenHash: string;
    expiresAt: string;
  }) {
    const { data, error } = await adminSupabase()
      .from("guest_sessions")
      .insert({
        event_id: input.eventId,
        display_name: input.displayName,
        consent_version: input.consentVersion,
        consented_at: input.consentedAt,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      })
      .select("id")
      .single<{ id: string }>();
    if (error) throw error;
    return data;
  }

  async findGuestSessionByTokenHash(hash: string) {
    const { data, error } = await adminSupabase()
      .from("guest_sessions")
      .select("id,event_id,display_name,completed_photo_count,expires_at,revoked_at,events!inner(shot_limit,timezone)")
      .eq("token_hash", hash)
      .maybeSingle<{
        id: string;
        event_id: string;
        display_name: string;
        completed_photo_count: number;
        expires_at: string;
        revoked_at: string | null;
        events: { shot_limit: number; timezone: string } | Array<{ shot_limit: number; timezone: string }>;
      }>();
    if (error) throw error;
    if (!data) return null;
    const event = Array.isArray(data.events) ? data.events[0] : data.events;
    return {
      id: data.id,
      eventId: data.event_id,
      displayName: data.display_name,
      completedPhotoCount: data.completed_photo_count,
      shotLimit: event.shot_limit,
      eventTimezone: event.timezone,
      expiresAt: data.expires_at,
      revokedAt: data.revoked_at,
    };
  }
}
