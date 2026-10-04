import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentAdmin } from "@/features/admin/current-admin";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseLandingStore } from "@/lib/repositories/landing-store";
import { adminSupabase } from "@/lib/supabase/admin";

const patchSchema = z.object({
  altText: z.string().max(200).optional(),
  visible: z.boolean().optional(),
  isCover: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedMutationOrigin(request.headers, serverEnv().NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const id = z.string().min(1).parse((await context.params).id);
    const body = patchSchema.parse(await request.json());

    const store = new SupabaseLandingStore();
    if (body.isCover === true) {
      const draft = await store.setCover(admin.eventId, id);
      return NextResponse.json({ draft });
    }
    const draft = await store.updateDraft(admin.eventId, id, {
      altText: body.altText,
      visible: body.visible,
      isCover: body.isCover,
    });
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedMutationOrigin(request.headers, serverEnv().NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const id = z.string().min(1).parse((await context.params).id);
    const store = new SupabaseLandingStore();
    const storagePath = await store.deleteDraft(admin.eventId, id);
    const removal = await adminSupabase().storage.from("wedding-landing").remove([storagePath]);
    if (removal.error) throw removal.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed" }, { status: 400 });
  }
}
