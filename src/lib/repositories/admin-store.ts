import "server-only";

import type { PhotoStatus } from "@/features/shared/domain";
import type { AdminSnapshot } from "@/features/admin/admin-types";
import { adminSupabase } from "@/lib/supabase/admin";

type AdminPhotoRow = {
  id: string;
  status: PhotoStatus;
  completed_at: string | null;
  author: string;
  like_count: number;
  rank: number;
  tied: boolean;
};

export class SupabaseAdminStore {
  async photoPage(eventId: string, offset = 0, pageSize = 100) {
    const result = await adminSupabase().rpc("admin_event_photos", { p_event_id: eventId }).range(offset, offset + pageSize);
    if (result.error) throw result.error;
    const rows = (result.data ?? []) as AdminPhotoRow[];
    const hasMore = rows.length > pageSize;
    return {
      photos: rows.slice(0, pageSize).map((row) => ({
        id: row.id, author: row.author, likeCount: Number(row.like_count), status: row.status,
        capturedAt: row.completed_at ?? "", rank: Number(row.rank), tied: row.tied,
      })),
      nextOffset: hasMore ? offset + pageSize : null,
    };
  }

  async dashboard(eventId: string): Promise<AdminSnapshot> {
    const client = adminSupabase();
    const [eventResult, guestResult, visibleResult, hiddenResult, failedResult, processingResult, page] = await Promise.all([
      client.from("events").select("id,name,uploads_paused,voting_paused,voting_ends_at,winners_revealed,retention_at,shot_limit").eq("id", eventId).single(),
      client.from("guest_sessions").select("id", { count: "exact", head: true }).eq("event_id", eventId),
      client.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "visible"),
      client.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "hidden"),
      client.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "failed"),
      client.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "processing"),
      this.photoPage(eventId),
    ]);
    if (eventResult.error) throw eventResult.error;
    const event = eventResult.data;
    return {
      event: { id: event.id, name: event.name, uploadsPaused: event.uploads_paused, votingPaused: event.voting_paused, votingEndsAt: event.voting_ends_at, winnersRevealed: event.winners_revealed, retentionAt: event.retention_at, shotLimit: event.shot_limit },
      stats: {
        guests: guestResult.count ?? 0,
        visible: visibleResult.count ?? 0,
        hidden: hiddenResult.count ?? 0,
        failed: failedResult.count ?? 0,
        processing: processingResult.count ?? 0,
      },
      photos: page.photos,
      nextPhotoOffset: page.nextOffset,
    };
  }

  async updateEvent(eventId: string, update: { uploadsPaused?: boolean; votingPaused?: boolean; winnersRevealed?: boolean; votingEndsAt?: string }) {
    const row: Record<string, boolean | string> = {};
    if (update.uploadsPaused !== undefined) row.uploads_paused = update.uploadsPaused;
    if (update.votingPaused !== undefined) row.voting_paused = update.votingPaused;
    if (update.winnersRevealed !== undefined) row.winners_revealed = update.winnersRevealed;
    if (update.votingEndsAt !== undefined) row.voting_ends_at = update.votingEndsAt;
    const { error } = await adminSupabase().from("events").update(row).eq("id", eventId);
    if (error) throw error;
  }

  async moderate(eventId: string, photoId: string, status: "visible" | "hidden", userId: string, reason?: string | null) {
    const update = status === "hidden"
      ? { status, hidden_at: new Date().toISOString(), hidden_by: userId, hide_reason: reason ?? "Hidden by organizer", updated_at: new Date().toISOString() }
      : { status, hidden_at: null, hidden_by: null, hide_reason: null, updated_at: new Date().toISOString() };
    const { error } = await adminSupabase().from("photos").update(update).eq("event_id", eventId).eq("id", photoId).in("status", ["visible", "hidden"]);
    if (error) throw error;
  }

  async signPhoto(eventId: string, photoId: string, variant: "clean" | "filtered", download: boolean) {
    const { data, error } = await adminSupabase().from("photos").select("original_path,filtered_path").eq("event_id", eventId).eq("id", photoId).single<{ original_path: string | null; filtered_path: string | null }>();
    if (error) return null;
    const path = variant === "clean" ? data.original_path : data.filtered_path;
    if (!path) return null;
    const signed = await adminSupabase().storage.from("wedding-photos").createSignedUrl(path, 60, { download: download ? `wedding-${photoId}-${variant}.jpg` : false });
    if (signed.error) throw signed.error;
    return signed.data.signedUrl;
  }
}
