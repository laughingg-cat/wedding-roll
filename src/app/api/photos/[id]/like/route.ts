import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentGuest } from "@/features/auth/current-guest";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseGalleryStore } from "@/lib/repositories/gallery-store";
import { enforceRateLimit } from "@/lib/repositories/rate-limit-store";

async function mutate(request: NextRequest, context: { params: Promise<{ id: string }> }, liked: boolean) {
  try {
    assertTrustedMutationOrigin(request.headers, serverEnv().NEXT_PUBLIC_SITE_URL);
    const guest = await currentGuest();
    if (!guest) return NextResponse.json({ error: "Guest session required" }, { status: 401 });
    const photoId = z.uuid().parse((await context.params).id);
    const rate = await enforceRateLimit({ bucketKey: `like:${guest.id}`, action: "like", limit: 60, windowSeconds: 60 });
    if (!rate.allowed) return NextResponse.json({ error: "Please slow down" }, { status: 429 });
    return NextResponse.json(await new SupabaseGalleryStore().toggleLike(photoId, guest.id, liked));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update vote";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return mutate(request, context, true);
}

export function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return mutate(request, context, false);
}
