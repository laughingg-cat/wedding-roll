import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentGuest } from "@/features/auth/current-guest";
import { reserveGuestPhoto } from "@/features/photos/photo-pipeline";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { PRESET_IDS } from "@/features/shared/domain";
import { serverEnv } from "@/lib/env";
import { SupabasePhotoStore } from "@/lib/repositories/photo-store";
import { enforceRateLimit } from "@/lib/repositories/rate-limit-store";

const inputSchema = z.object({ preset: z.enum(PRESET_IDS) });

export async function POST(request: NextRequest) {
  try {
    const env = serverEnv();
    assertTrustedMutationOrigin(request.headers, env.NEXT_PUBLIC_SITE_URL);
    const guest = await currentGuest();
    if (!guest) return NextResponse.json({ error: "Guest session required" }, { status: 401 });
    const rate = await enforceRateLimit({
      bucketKey: `reserve:${guest.id}`,
      action: "reserve",
      limit: 12,
      windowSeconds: 60,
    });
    if (!rate.allowed) return NextResponse.json({ error: "Please wait before taking another photo" }, { status: 429 });
    const { preset } = inputSchema.parse(await request.json());
    const store = new SupabasePhotoStore();
    const reservation = await reserveGuestPhoto(
      { eventId: guest.eventId, guestSessionId: guest.id, preset },
      store,
    );
    return NextResponse.json({ ...reservation, upload: { ...reservation.upload, bucket: "wedding-temp" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reserve a photo";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

