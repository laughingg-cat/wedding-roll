import { NextRequest, NextResponse } from "next/server";

import { currentAdmin } from "@/features/admin/current-admin";
import { normalizeSetup, setupSchema } from "@/features/admin/setup";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseAdminStore } from "@/lib/repositories/admin-store";

export async function PATCH(request: NextRequest) {
  try {
    assertTrustedMutationOrigin(request.headers, serverEnv().NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const parsed = setupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again" }, { status: 400 });
    }
    const n = normalizeSetup(parsed.data);
    await new SupabaseAdminStore().updateEventSettings(admin.eventId, {
      name: n.name,
      timezone: n.timezone,
      uploadStartsAt: n.uploadStartsAt,
      uploadEndsAt: n.uploadEndsAt,
      votingStartsAt: n.votingStartsAt,
      votingEndsAt: n.votingEndsAt,
      shotLimit: n.shotLimit,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 400 });
  }
}
