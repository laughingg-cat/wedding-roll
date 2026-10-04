import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentGuest } from "@/features/auth/current-guest";
import { finalizeGuestPhoto } from "@/features/photos/photo-pipeline";
import { processCapture } from "@/features/photos/process-capture";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabasePhotoStore } from "@/lib/repositories/photo-store";
import { enforceRateLimit } from "@/lib/repositories/rate-limit-store";

const photoIdSchema = z.uuid();

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const env = serverEnv();
    assertTrustedMutationOrigin(request.headers, env.NEXT_PUBLIC_SITE_URL);
    const guest = await currentGuest();
    if (!guest) return NextResponse.json({ error: "Guest session required" }, { status: 401 });
    const rate = await enforceRateLimit({
      bucketKey: `finalize:${guest.id}`,
      action: "finalize",
      limit: 20,
      windowSeconds: 60,
    });
    if (!rate.allowed) return NextResponse.json({ error: "Too many processing requests" }, { status: 429 });
    const { id } = await context.params;
    const photoId = photoIdSchema.parse(id);
    const store = new SupabasePhotoStore();
    const result = await finalizeGuestPhoto(photoId, guest.id, {
      claim: store.claim.bind(store),
      downloadTemp: store.downloadTemp.bind(store),
      process: processCapture,
      uploadFinal: store.uploadFinal.bind(store),
      complete: store.complete.bind(store),
      markFailed: store.markFailed.bind(store),
      removeObjects: store.removeObjects.bind(store),
    });
    return NextResponse.json(result, { status: result.state === "processing" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process photo";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

