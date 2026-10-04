import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentAdmin } from "@/features/admin/current-admin";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseAdminStore } from "@/lib/repositories/admin-store";

const updateSchema = z.object({ uploadsPaused: z.boolean().optional(), votingPaused: z.boolean().optional(), winnersRevealed: z.boolean().optional(), votingEndsAt: z.iso.datetime().optional() }).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: NextRequest) {
  try {
    assertTrustedMutationOrigin(request.headers, serverEnv().NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const update = updateSchema.parse(await request.json());
    await new SupabaseAdminStore().updateEvent(admin.eventId, update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 400 });
  }
}
