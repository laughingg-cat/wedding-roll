import "server-only";

import type { PresetId } from "@/features/shared/domain";
import { decodeGalleryCursor, encodeGalleryCursor, toGalleryItem } from "@/features/gallery/gallery-feed";
import { adminSupabase } from "@/lib/supabase/admin";

type PhotoRow = {
  id: string;
  guest_session_id: string;
  preset: PresetId;
  completed_at: string;
  guest_sessions: { display_name: string } | Array<{ display_name: string }>;
  likes: Array<{ guest_session_id: string }>;
};

export class SupabaseGalleryStore {
  async listVisibilityChanges(eventId: string, guestSessionId: string, since?: string) {
    if (!since) return { changedPhotos: [], removedPhotoIds: [] };
    const { data, error } = await adminSupabase().from("photos")
      .select("id,status,guest_session_id,preset,completed_at,guest_sessions!photos_guest_session_id_fkey(display_name),likes(guest_session_id)")
      .eq("event_id", eventId).gte("updated_at", since).order("updated_at", { ascending: true }).limit(5000);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<PhotoRow & { status: string }>;
    return {
      changedPhotos: rows.filter((row) => row.status === "visible").map((row) => toGalleryItem(row, guestSessionId)),
      removedPhotoIds: rows.filter((row) => row.status !== "visible").map((row) => row.id),
    };
  }

  async listVisible(eventId: string, guestSessionId: string, cursor?: string, limit = 24) {
    const pageSize = Math.min(Math.max(limit, 1), 48);
    let query = adminSupabase()
      .from("photos")
      .select("id,guest_session_id,preset,completed_at,guest_sessions!photos_guest_session_id_fkey(display_name),likes(guest_session_id)")
      .eq("event_id", eventId)
      .eq("status", "visible")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize + 1);

    if (cursor) {
      const decoded = decodeGalleryCursor(cursor);
      query = query.or(`completed_at.lt.${decoded.completedAt},and(completed_at.eq.${decoded.completedAt},id.lt.${decoded.id})`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as PhotoRow[];
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    const last = page.at(-1);
    return {
      photos: page.map((row) => toGalleryItem(row, guestSessionId)),
      nextCursor: hasMore && last ? encodeGalleryCursor({ completedAt: last.completed_at, id: last.id }) : null,
    };
  }

  async toggleLike(photoId: string, guestSessionId: string, liked: boolean) {
    const { data, error } = await adminSupabase().rpc("toggle_photo_like", {
      p_photo_id: photoId,
      p_guest_session_id: guestSessionId,
      p_like: liked,
    });
    if (error) throw error;
    return { likeCount: data as number, liked };
  }

  async signFilteredPhoto(photoId: string, eventId: string) {
    const { data: photo, error } = await adminSupabase()
      .from("photos")
      .select("filtered_path")
      .eq("id", photoId)
      .eq("event_id", eventId)
      .eq("status", "visible")
      .single<{ filtered_path: string }>();
    if (error || !photo?.filtered_path) return null;
    const { data, error: signingError } = await adminSupabase().storage
      .from("wedding-photos")
      .createSignedUrl(photo.filtered_path, 60, { download: false });
    if (signingError) throw signingError;
    return data.signedUrl;
  }

  async listRevealedWinners(eventId: string) {
    const client = adminSupabase();
    const { data: event } = await client.from("events").select("winners_revealed").eq("id", eventId).single<{ winners_revealed: boolean }>();
    if (!event?.winners_revealed) return [];
    const { data, error } = await client.from("winner_selections")
      .select("photo_id,placement,award_label,photos!winner_selections_photo_id_fkey!inner(status,guest_sessions!photos_guest_session_id_fkey(display_name))")
      .eq("event_id", eventId)
      .eq("photos.status", "visible")
      .order("placement", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as Array<{ photo_id: string; placement: number; award_label: string; photos: { guest_sessions: { display_name: string } | Array<{ display_name: string }> } }>).map((row) => {
      const guest = Array.isArray(row.photos.guest_sessions) ? row.photos.guest_sessions[0] : row.photos.guest_sessions;
      return { photoId: row.photo_id, placement: row.placement, awardLabel: row.award_label, author: guest.display_name, mediaUrl: `/api/photos/${row.photo_id}/media` };
    });
  }
}
