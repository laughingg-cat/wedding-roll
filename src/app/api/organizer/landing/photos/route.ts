import { NextRequest, NextResponse } from "next/server";

import { currentAdmin } from "@/features/admin/current-admin";
import { processLandingImage, randomDraftId } from "@/features/admin/landing";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseLandingStore } from "@/lib/repositories/landing-store";
import { adminSupabase } from "@/lib/supabase/admin";

const MAX_COUNT = 24;

export async function GET() {
  try {
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const store = new SupabaseLandingStore();
    const [drafts, published] = await Promise.all([
      store.listDrafts(admin.eventId),
      store.listPublished(admin.eventId),
    ]);
    const withMedia = await Promise.all(
      drafts.map(async (draft) => ({ ...draft, mediaUrl: await store.signUrl(draft.storagePath) })),
    );
    return NextResponse.json(
      { drafts: withMedia, published: published.map((photo) => ({ id: photo.id, isCover: photo.isCover })) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load landing photos" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const env = serverEnv();
    assertTrustedMutationOrigin(request.headers, env.NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    const replaceId = form.get("replace")?.toString() || undefined;
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a JPEG image to upload" }, { status: 400 });
    if (file.type !== "image/jpeg") return NextResponse.json({ error: "Landing images must be JPEG" }, { status: 400 });

    const store = new SupabaseLandingStore();
    const count = await store.countDrafts(admin.eventId);
    if (!replaceId && count >= MAX_COUNT) return NextResponse.json({ error: `At most ${MAX_COUNT} landing photos are allowed` }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const processed = await processLandingImage(buffer);

    const id = replaceId ?? randomDraftId();
    const storagePath = `draft/${admin.eventId}/${id}.jpg`;
    const upload = await adminSupabase()
      .storage.from("wedding-landing")
      .upload(storagePath, processed.buffer, { contentType: "image/jpeg", upsert: true });
    if (upload.error) throw upload.error;

    if (replaceId) {
      const { data, error } = await adminSupabase()
        .from("event_landing_photo_drafts")
        .update({ width: processed.width, height: processed.height, byte_size: processed.buffer.byteLength })
        .eq("event_id", admin.eventId)
        .eq("id", replaceId)
        .select("id,event_id,storage_path,position,is_cover,alt_text,visible,width,height,byte_size")
        .single();
      if (error) throw error;
      return NextResponse.json({
        draft: {
          id: data.id,
          storagePath: data.storage_path,
          position: data.position,
          isCover: data.is_cover,
          altText: data.alt_text,
          visible: data.visible,
          width: data.width,
          height: data.height,
          byteSize: data.byte_size,
          mediaUrl: await store.signUrl(storagePath),
        },
      });
    }

    const draft = await store.addDraft({
      eventId: admin.eventId,
      id,
      position: count,
      width: processed.width,
      height: processed.height,
      byteSize: processed.buffer.byteLength,
    });
    return NextResponse.json({ draft: { ...draft, mediaUrl: await store.signUrl(storagePath) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
