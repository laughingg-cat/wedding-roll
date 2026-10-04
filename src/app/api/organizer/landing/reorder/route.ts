import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentAdmin } from "@/features/admin/current-admin";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseLandingStore } from "@/lib/repositories/landing-store";

const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationOrigin(request.headers, serverEnv().NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const { ids } = reorderSchema.parse(await request.json());
    await new SupabaseLandingStore().reorder(admin.eventId, ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reorder failed" }, { status: 400 });
  }
}
