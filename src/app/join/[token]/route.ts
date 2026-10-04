import { NextRequest, NextResponse } from "next/server";

import { createJoinGrant } from "@/features/auth/guest-access";
import { JOIN_COOKIE } from "@/features/auth/cookies";
import { anonymizeIp, readClientIp } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseGuestAccessStore } from "@/lib/repositories/guest-access-store";
import { enforceRateLimit } from "@/lib/repositories/rate-limit-store";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const env = serverEnv();
  const { token } = await context.params;
  try {
    const ipHash = anonymizeIp(readClientIp(request.headers), env.RATE_LIMIT_SECRET);
    const rate = await enforceRateLimit({
      bucketKey: `join:${ipHash}`,
      action: "join",
      // Venue Wi-Fi commonly puts the whole guest list behind one public IP.
      // The 128-bit bearer credential remains the admission secret; this limit
      // absorbs retries for 300 arrivals while still bounding automated abuse.
      limit: 900,
      windowSeconds: 900,
    });
    if (!rate.allowed) return NextResponse.redirect(new URL("/too-many-requests", env.NEXT_PUBLIC_SITE_URL));

    const grant = await createJoinGrant(token, new SupabaseGuestAccessStore(), env.RATE_LIMIT_SECRET);
    const response = NextResponse.redirect(new URL("/welcome", env.NEXT_PUBLIC_SITE_URL));
    response.cookies.set(JOIN_COOKIE, grant.token, {
      httpOnly: true,
      secure: env.NEXT_PUBLIC_SITE_URL.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      expires: grant.expiresAt,
    });
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/invalid-link", env.NEXT_PUBLIC_SITE_URL));
  }
}
