import "server-only";

import { liveStoragePath, draftStoragePath, randomDraftId } from "@/features/admin/landing";
import { adminSupabase } from "@/lib/supabase/admin";

const BUCKET = "wedding-landing";

type DraftRow = {
  id: string;
  event_id: string;
  storage_path: string;
  position: number;
  is_cover: boolean;
  alt_text: string;
  visible: boolean;
  width: number | null;
  height: number | null;
  byte_size: number | null;
};

type PublishedRow = DraftRow;

function toDraft(row: DraftRow) {
  return {
    id: row.id,
    storagePath: row.storage_path,
    position: row.position,
    isCover: row.is_cover,
    altText: row.alt_text,
    visible: row.visible,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
  };
}

export class SupabaseLandingStore {
  async listDrafts(eventId: string) {
    const { data, error } = await adminSupabase()
      .from("event_landing_photo_drafts")
      .select("id,event_id,storage_path,position,is_cover,alt_text,visible,width,height,byte_size")
      .eq("event_id", eventId)
      .order("position", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    return (data as DraftRow[]).map(toDraft);
  }

  async addDraft(input: { eventId: string; id: string; position: number; width: number; height: number; byteSize: number }) {
    const storagePath = draftStoragePath(input.eventId, input.id);
    const { data, error } = await adminSupabase()
      .from("event_landing_photo_drafts")
      .insert({
        id: input.id,
        event_id: input.eventId,
        storage_path: storagePath,
        position: input.position,
        width: input.width,
        height: input.height,
        byte_size: input.byteSize,
      })
      .select("id,event_id,storage_path,position,is_cover,alt_text,visible,width,height,byte_size")
      .single<DraftRow>();
    if (error) throw error;
    return toDraft(data);
  }

  async updateDraft(eventId: string, id: string, patch: { altText?: string; visible?: boolean; isCover?: boolean; position?: number }) {
    const row: Record<string, string | boolean | number> = {};
    if (patch.altText !== undefined) row.alt_text = patch.altText;
    if (patch.visible !== undefined) row.visible = patch.visible;
    if (patch.isCover !== undefined) row.is_cover = patch.isCover;
    if (patch.position !== undefined) row.position = patch.position;
    const { data, error } = await adminSupabase()
      .from("event_landing_photo_drafts")
      .update(row)
      .eq("event_id", eventId)
      .eq("id", id)
      .select("id,event_id,storage_path,position,is_cover,alt_text,visible,width,height,byte_size")
      .single<DraftRow>();
    if (error) throw error;
    return toDraft(data);
  }

  async setCover(eventId: string, id: string) {
    const { error } = await adminSupabase().rpc("set_landing_draft_cover", { p_event_id: eventId, p_id: id });
    if (error) throw error;
    return this.listDrafts(eventId).then((drafts) => drafts.find((draft) => draft.id === id)!);
  }

  async reorder(eventId: string, ids: string[]) {
    const { error } = await adminSupabase().rpc("reorder_landing_drafts", { p_event_id: eventId, p_ids: ids });
    if (error) throw error;
  }

  async deleteDraft(eventId: string, id: string) {
    const { data, error } = await adminSupabase()
      .from("event_landing_photo_drafts")
      .delete()
      .eq("event_id", eventId)
      .eq("id", id)
      .select("storage_path")
      .single<{ storage_path: string }>();
    if (error) throw error;
    return data.storage_path;
  }

  async countDrafts(eventId: string) {
    const { count, error } = await adminSupabase()
      .from("event_landing_photo_drafts")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    if (error) throw error;
    return count ?? 0;
  }

  async listPublished(eventId: string) {
    const { data, error } = await adminSupabase()
      .from("event_landing_photos")
      .select("id,event_id,storage_path,position,is_cover,alt_text,visible,width,height,byte_size")
      .eq("event_id", eventId)
      .eq("visible", true)
      .order("position", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    return (data as PublishedRow[]).map(toDraft);
  }

  async signUrl(storagePath: string, download = false) {
    const signed = await adminSupabase()
      .storage.from(BUCKET)
      .createSignedUrl(storagePath, 60, { download: download ? undefined : false });
    if (signed.error) throw signed.error;
    return signed.data.signedUrl;
  }

  // Replaces the published set with the current drafts, copying draft objects
  // into the live prefix before mutating any rows so guests never see a row
  // whose object is missing.
  async publish(eventId: string) {
    const client = adminSupabase();
    const drafts = await this.listDrafts(eventId);
    const version = randomDraftId();

    const photos = drafts.map((draft) => ({
      id: draft.id,
      storage_path: liveStoragePath(eventId, version, draft.id),
      position: draft.position,
      is_cover: draft.isCover,
      alt_text: draft.altText,
      visible: draft.visible,
      width: draft.width,
      height: draft.height,
      byte_size: draft.byteSize,
    }));

    // Copy draft objects into a fresh, versioned live prefix. A retry uses a new
    // version, so a partial prior attempt can never collide with this one.
    const copied: string[] = [];
    try {
      for (const draft of drafts) {
        const destination = liveStoragePath(eventId, version, draft.id);
        const { error } = await client.storage.from(BUCKET).copy(draft.storagePath, destination);
        if (error) throw error;
        copied.push(destination);
      }
    } catch (error) {
      await removeObjects(client, copied);
      throw error;
    }

    const oldLive = await client.from("event_landing_photos").select("storage_path").eq("event_id", eventId);
    if (oldLive.error) {
      await removeObjects(client, copied);
      throw oldLive.error;
    }

    // Transactional swap of the published rows; drafts remain untouched so the
    // organizer keeps a working copy to edit after publishing.
    const { error: swapError } = await client.rpc("replace_published_landing", { p_event_id: eventId, p_photos: photos });
    if (swapError) {
      await removeObjects(client, copied);
      throw swapError;
    }

    // The swap is committed at this point. Deleting the previous live objects is
    // best-effort: the new landing page is already live, and the retention job
    // reclaims any object the list can no longer reach.
    if (oldLive.data?.length) {
      await removeObjects(client, oldLive.data.map((row) => row.storage_path));
    }

    return { published: photos.length };
  }
}

// Best-effort object removal. A failure here must not mask the operation that
// triggered it; retention's recursive listing is the safety net for orphans.
async function removeObjects(client: ReturnType<typeof adminSupabase>, paths: string[]) {
  if (!paths.length) return;
  await client.storage.from(BUCKET).remove(paths).catch(() => undefined);
}
