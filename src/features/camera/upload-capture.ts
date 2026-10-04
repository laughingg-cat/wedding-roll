"use client";

import type { PresetId } from "@/features/shared/domain";
import { browserSupabase } from "@/lib/supabase/browser";
import { prepareCaptureForUpload } from "./prepare-capture";

import { clearPendingCapture, savePendingCapture, type PendingCapture } from "./pending-capture";

type Reservation = {
  photoId: string;
  upload: { path: string; token: string };
  expiresAt?: string;
};

export type CaptureUploadPhase = "preparing" | "reserving" | "uploading" | "processing" | "complete";

export type CaptureUploadDependencies = {
  savePending(input: PendingCapture): Promise<void>;
  clearPending(): Promise<void>;
  reserve(preset: PresetId): Promise<Reservation>;
  upload(path: string, token: string, blob: Blob): Promise<void>;
  finalize(photoId: string): Promise<{ state: "complete" | "processing" | "expired" }>;
  wait(milliseconds: number): Promise<void>;
  now(): Date;
  onProgress?(phase: Exclude<CaptureUploadPhase, "preparing">): void;
};

export async function runCaptureUpload(
  blob: Blob,
  preset: PresetId,
  dependencies: CaptureUploadDependencies,
  recovered?: PendingCapture | null,
) {
  const createdAt = recovered?.createdAt ?? dependencies.now().toISOString();
  const recoveredUnexpired = Boolean(recovered?.reservation
    && (!recovered.reservation.expiresAt || Date.parse(recovered.reservation.expiresAt) > dependencies.now().getTime()));
  // An uploaded reservation is always probed first: the completion transaction
  // may have committed even if its response was lost after nominal expiry.
  const shouldResume = Boolean(recovered?.reservation && (recovered.uploaded || recoveredUnexpired));
  await dependencies.savePending({ blob, preset, createdAt, reservation: shouldResume ? recovered?.reservation : undefined, uploaded: shouldResume ? recovered?.uploaded : false });
  if (!(shouldResume && recovered?.reservation)) dependencies.onProgress?.("reserving");
  let reservation = shouldResume && recovered?.reservation ? recovered.reservation : await dependencies.reserve(preset);
  await dependencies.savePending({ blob, preset, createdAt, reservation, uploaded: Boolean(shouldResume && recovered?.uploaded) });
  if (!(shouldResume && recovered?.uploaded)) {
    dependencies.onProgress?.("uploading");
    await dependencies.upload(reservation.upload.path, reservation.upload.token, blob);
    await dependencies.savePending({ blob, preset, createdAt, reservation, uploaded: true });
  }
  let mayRenewExpiredUpload = Boolean(recovered?.reservation && recovered.uploaded && !recoveredUnexpired);

  dependencies.onProgress?.("processing");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let finalization: Awaited<ReturnType<CaptureUploadDependencies["finalize"]>>;
    try {
      finalization = await dependencies.finalize(reservation.photoId);
    } catch (error) {
      if (attempt === 5) throw error;
      await dependencies.wait(1200);
      continue;
    }
    if (finalization.state === "complete") {
      await dependencies.clearPending();
      dependencies.onProgress?.("complete");
      return { photoId: reservation.photoId };
    }
    if (finalization.state === "expired") {
      if (!mayRenewExpiredUpload) throw new Error("This upload reservation expired. Please try again.");
      dependencies.onProgress?.("reserving");
      reservation = await dependencies.reserve(preset);
      await dependencies.savePending({ blob, preset, createdAt, reservation, uploaded: false });
      dependencies.onProgress?.("uploading");
      await dependencies.upload(reservation.upload.path, reservation.upload.token, blob);
      await dependencies.savePending({ blob, preset, createdAt, reservation, uploaded: true });
      mayRenewExpiredUpload = false;
      attempt = -1;
      dependencies.onProgress?.("processing");
      continue;
    }
    if (attempt < 5) await dependencies.wait(1200);
  }
  throw new Error("Your photo is still processing. It is safe to leave this screen.");
}

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

export async function uploadCapture(
  blob: Blob,
  preset: PresetId,
  recovered?: PendingCapture | null,
  onProgress?: (phase: CaptureUploadPhase) => void,
) {
  onProgress?.("preparing");
  const prepared = recovered?.blob ?? await prepareCaptureForUpload(blob);
  return runCaptureUpload(prepared, preset, {
    savePending: savePendingCapture,
    clearPending: clearPendingCapture,
    reserve: (selectedPreset) =>
      jsonRequest<Reservation>("/api/photos/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset: selectedPreset }),
      }),
    upload: async (path, token, capture) => {
      const { error } = await browserSupabase()
        .storage
        .from("wedding-temp")
        .uploadToSignedUrl(path, token, capture, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
    },
    finalize: (photoId) => jsonRequest(`/api/photos/${photoId}/finalize`, { method: "POST" }),
    wait: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
    now: () => new Date(),
    onProgress,
  }, recovered);
}
