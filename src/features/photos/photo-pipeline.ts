import { randomBytes } from "node:crypto";

import type { PresetId } from "@/features/shared/domain";

export type ReservationDependencies = {
  reserve(input: {
    eventId: string;
    guestSessionId: string;
    preset: PresetId;
    tempPath: string;
  }): Promise<{ id: string; reservationExpiresAt: string }>;
  signUpload(path: string): Promise<{ signedUrl: string; token: string }>;
  randomPathSegment?: () => string;
};

export async function reserveGuestPhoto(
  input: { eventId: string; guestSessionId: string; preset: PresetId },
  dependencies: ReservationDependencies,
) {
  const segment = (dependencies.randomPathSegment ?? (() => randomBytes(24).toString("base64url")))();
  const tempPath = `${input.eventId}/${input.guestSessionId}/${segment}.jpg`;
  const photo = await dependencies.reserve({ ...input, tempPath });
  const signed = await dependencies.signUpload(tempPath);
  const upload = { ...signed, path: tempPath };
  return { photoId: photo.id, upload, expiresAt: photo.reservationExpiresAt };
}

type ClaimedPhoto = {
  id: string;
  eventId: string;
  tempPath: string;
  preset: PresetId;
};

export type PhotoPipelineDependencies = {
  claim(
    photoId: string,
    guestSessionId: string,
  ): Promise<
    | { state: "claimed"; photo: ClaimedPhoto }
    | { state: "complete" | "busy" | "expired"; photo?: undefined }
  >;
  downloadTemp(path: string): Promise<Buffer>;
  process(input: Buffer, preset: PresetId): Promise<{
    clean: Buffer;
    filtered: Buffer;
    width: number;
    height: number;
  }>;
  uploadFinal(path: string, contents: Buffer): Promise<void>;
  complete(input: {
    photoId: string;
    originalPath: string;
    filteredPath: string;
    width: number;
    height: number;
    byteSize: number;
  }): Promise<void>;
  markFailed(photoId: string, failureCode: string): Promise<void>;
  removeObjects(bucket: "wedding-temp" | "wedding-photos", paths: string[]): Promise<void>;
};

export async function finalizeGuestPhoto(
  photoId: string,
  guestSessionId: string,
  dependencies: PhotoPipelineDependencies,
) {
  const claim = await dependencies.claim(photoId, guestSessionId);
  if (claim.state !== "claimed") {
    if (claim.state === "complete") return { state: "complete" as const };
    if (claim.state === "busy") return { state: "processing" as const };
    return { state: "expired" as const };
  }
  const claimedPhoto = claim.photo;

  const cleanPath = `${claimedPhoto.eventId}/${claimedPhoto.id}/clean.jpg`;
  const filteredPath = `${claimedPhoto.eventId}/${claimedPhoto.id}/filtered.jpg`;
  let completionStarted = false;
  try {
    const temporary = await dependencies.downloadTemp(claimedPhoto.tempPath);
    const processed = await dependencies.process(temporary, claimedPhoto.preset);
    const uploadResults = await Promise.allSettled([
      dependencies.uploadFinal(cleanPath, processed.clean),
      dependencies.uploadFinal(filteredPath, processed.filtered),
    ]);
    const failedUpload = uploadResults.find((result) => result.status === "rejected");
    if (failedUpload?.status === "rejected") throw failedUpload.reason;
    completionStarted = true;
    await dependencies.complete({
      photoId,
      originalPath: cleanPath,
      filteredPath,
      width: processed.width,
      height: processed.height,
      byteSize: processed.clean.byteLength,
    });
  } catch (error) {
    // A transport failure during complete() is ambiguous: the transaction may
    // already be committed. Preserve final objects and let an idempotent retry
    // observe/reclaim the row instead of risking broken visible media.
    if (completionStarted) throw error;
    await Promise.allSettled([
      dependencies.markFailed(photoId, "processing_failed"),
      dependencies.removeObjects("wedding-photos", [cleanPath, filteredPath]),
    ]);
    throw error;
  }

  // Final assets and quota are committed at this point. Temporary cleanup is
  // deliberately best-effort so a transient delete failure cannot corrupt a
  // visible photo; the retention job will remove any leftover temporary file.
  await Promise.allSettled([
    dependencies.removeObjects("wedding-temp", [claimedPhoto.tempPath]),
  ]);
  return { state: "complete" as const };
}
