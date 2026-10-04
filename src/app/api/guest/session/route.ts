import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { GUEST_COOKIE, JOIN_COOKIE } from "@/features/auth/cookies";
import { createGuestSession, readJoinGrant } from "@/features/auth/guest-access";
import { sessionCookieOptions } from "@/features/auth/session-token";
import { anonymizeIp, assertTrustedMutationOrigin, readClientIp } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseGuestAccessStore } from "@/lib/repositories/guest-access-store";
import { enforceRateLimit } from "@/lib/repositories/rate-limit-store";

const bodySchema = z.object({
  displayName: z.string(),
  consentAccepted: z.literal(true),
});

export async function POST(request: NextRequest) {
  const env = serverEnv();
  try {
    assertTrustedMutationOrigin(request.headers, env.NEXT_PUBLIC_SITE_URL);
    const cookieStore = await cookies();
    const grantToken = cookieStore.get(JOIN_COOKIE)?.value;
    if (!grantToken) return NextResponse.json({ error: "Join link required" }, { status: 401 });

    const grant = await readJoinGrant(grantToken, env.RATE_LIMIT_SECRET);
    const ipHash = anonymizeIp(readClientIp(request.headers), env.RATE_LIMIT_SECRET);
    const rate = await enforceRateLimit({ bucketKey: `register:${grant.eventId}:${ipHash}`, action: "register", limit: 600, windowSeconds: 900 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many guests joined from this network. Please wait a moment." }, { status: 429 });
    const store = new SupabaseGuestAccessStore();
    const event = await store.findEventById(grant.eventId);
    if (!event) return NextResponse.json({ error: "Event unavailable" }, { status: 404 });
    const input = bodySchema.parse(await request.json());
    const session = await createGuestSession(
      { eventId: grant.eventId, ...input },
      store,
      { now: new Date(), retentionAt: event.retentionAt, consentVersion: env.CONSENT_VERSION },
    );
    const response = NextResponse.json({
      sessionId: session.sessionId,
      displayName: session.displayName,
      redirectTo: "/camera",
    });
    response.cookies.set(GUEST_COOKIE, session.token, {
      ...sessionCookieOptions(new Date(event.retentionAt)),
      secure: env.NEXT_PUBLIC_SITE_URL.startsWith("https://"),
    });
    response.cookies.delete(JOIN_COOKIE);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
