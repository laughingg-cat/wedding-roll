import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

import { currentAuthUser } from "@/features/admin/current-admin";
import { normalizeSetup, setupSchema } from "@/features/admin/setup";
import { createOpaqueToken, hashOpaqueToken } from "@/features/auth/session-token";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseAdminStore } from "@/lib/repositories/admin-store";
import { adminSupabase } from "@/lib/supabase/admin";

const errorMessages: Record<string, string> = {
  event_already_exists: "An event has already been created for this project.",
  organizer_already_linked: "Your account is already linked to an event.",
  unknown_organizer: "One of the organizer emails has no account yet.",
};

export async function POST(request: NextRequest) {
  try {
    const env = serverEnv();
    assertTrustedMutationOrigin(request.headers, env.NEXT_PUBLIC_SITE_URL);
    const user = await currentAuthUser();
    if (!user) return NextResponse.json({ error: "Organizer sign-in required" }, { status: 401 });

    const parsed = setupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again" }, { status: 400 });
    }

    const userIds = [user.userId];
    if (parsed.data.secondAdminEmail) {
      const { data: users, error: usersError } = await adminSupabase().auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) throw usersError;
      const second = users.users.find((candidate) => candidate.email?.toLowerCase() === parsed.data.secondAdminEmail?.toLowerCase());
      if (!second) return NextResponse.json({ error: "The second organizer has no account yet. Create their Supabase Auth user first." }, { status: 400 });
      if (second.id === user.userId) return NextResponse.json({ error: "The second organizer cannot be the same account." }, { status: 400 });
      userIds.push(second.id);
    }

    const normalized = normalizeSetup(parsed.data);
    const token = createOpaqueToken(16);
    const eventId = await new SupabaseAdminStore().bootstrapEvent({
      userIds,
      name: normalized.name,
      timezone: normalized.timezone,
      accessTokenHash: hashOpaqueToken(token),
      uploadStartsAt: normalized.uploadStartsAt,
      uploadEndsAt: normalized.uploadEndsAt,
      votingStartsAt: normalized.votingStartsAt,
      votingEndsAt: normalized.votingEndsAt,
      shotLimit: normalized.shotLimit,
    });

    const joinUrl = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/join/${token}`;
    const qrSvg = await QRCode.toString(joinUrl, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      color: { dark: "#171512", light: "#fffdf9" },
    });

    return NextResponse.json(
      { eventId, joinUrl, qrSvg },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed";
    if (message in errorMessages) return NextResponse.json({ error: errorMessages[message] }, { status: 409 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
