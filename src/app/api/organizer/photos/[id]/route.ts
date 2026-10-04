import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentAdmin } from "@/features/admin/current-admin";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseAdminStore } from "@/lib/repositories/admin-store";

const bodySchema = z.object({ status: z.enum(["visible", "hidden"]), reason: z.string().max(240).nullable().optional() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedMutationOrigin(request.headers, serverEnv().NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const photoId = z.uuid().parse((await context.params).id);
    const body = bodySchema.parse(await request.json());
    await new SupabaseAdminStore().moderate(admin.eventId, photoId, body.status, admin.userId, body.reason);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Moderation failed" }, { status: 400 });
  }
}
