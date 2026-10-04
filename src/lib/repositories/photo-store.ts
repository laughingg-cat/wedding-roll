import "server-only";

import type { PresetId } from "@/features/shared/domain";
import type { PhotoPipelineDependencies, ReservationDependencies } from "@/features/photos/photo-pipeline";
import { isStorageAlreadyExists } from "@/features/photos/storage-errors";
import { adminSupabase } from "@/lib/supabase/admin";

export class SupabasePhotoStore {
  async reserve(input: Parameters<ReservationDependencies["reserve"]>[0]) {
    const { data, error } = await adminSupabase().rpc("reserve_photo", {
      p_event_id: input.eventId,
      p_guest_session_id: input.guestSessionId,
      p_preset: input.preset,
      p_temp_path: input.tempPath,
    });
    if (error) throw error;
    const row = data as { id: string; reservation_expires_at: string };
    return { id: row.id, reservationExpiresAt: row.reservation_expires_at };
  }

  async signUpload(path: string) {
    const { data, error } = await adminSupabase().storage.from("wedding-temp").createSignedUploadUrl(path);
    if (error) throw error;
    return { signedUrl: data.signedUrl, token: data.token };
  }

  async claim(photoId: string, guestSessionId: string): ReturnType<PhotoPipelineDependencies["claim"]> {
    const { data: state, error } = await adminSupabase().rpc("claim_photo_processing", {
      p_photo_id: photoId,
      p_guest_session_id: guestSessionId,
    });
    if (error) throw error;
    if (state !== "claimed") return { state: state as "complete" | "busy" | "expired" };

    const { data, error: selectError } = await adminSupabase()
      .from("photos")
      .select("id,event_id,temp_path,preset")
      .eq("id", photoId)
      .single<{ id: string; event_id: string; temp_path: string; preset: PresetId }>();
    if (selectError) throw selectError;
    return {
      state: "claimed",
      photo: { id: data.id, eventId: data.event_id, tempPath: data.temp_path, preset: data.preset },
    };
  }

  async downloadTemp(path: string) {
    const { data, error } = await adminSupabase().storage.from("wedding-temp").download(path);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  async uploadFinal(path: string, contents: Buffer) {
    const { error } = await adminSupabase().storage.from("wedding-photos").upload(path, contents, {
      contentType: "image/jpeg",
      upsert: false,
      // Signed URLs are authorization grants, so object caching must never
      // outlive the media route's visibility/session decision.
      cacheControl: "0",
    });
    if (error && !isStorageAlreadyExists(error)) throw error;
  }

  async complete(input: Parameters<PhotoPipelineDependencies["complete"]>[0]) {
    const { error } = await adminSupabase().rpc("complete_photo", {
      p_photo_id: input.photoId,
      p_original_path: input.originalPath,
      p_filtered_path: input.filteredPath,
      p_width: input.width,
      p_height: input.height,
      p_byte_size: input.byteSize,
    });
    if (error) throw error;
  }

  async markFailed(photoId: string, failureCode: string) {
    const { error } = await adminSupabase()
      .from("photos")
      .update({ status: "failed", failure_code: failureCode, updated_at: new Date().toISOString() })
      .eq("id", photoId)
      .eq("status", "processing");
    if (error) throw error;
  }

  async removeObjects(bucket: "wedding-temp" | "wedding-photos", paths: string[]) {
    const { error } = await adminSupabase().storage.from(bucket).remove(paths);
    if (error) throw error;
  }
}
