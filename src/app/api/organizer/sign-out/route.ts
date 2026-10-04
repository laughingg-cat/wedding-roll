import { NextRequest, NextResponse } from "next/server";

import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { authSupabase } from "@/lib/supabase/auth-server";

export async function POST(request: NextRequest) {
  const env = serverEnv();
  try {
    assertTrustedMutationOrigin(request.headers, env.NEXT_PUBLIC_SITE_URL);
    await (await authSupabase()).auth.signOut();
    return NextResponse.redirect(new URL("/organizer/login", env.NEXT_PUBLIC_SITE_URL), 303);
  } catch {
    return NextResponse.json({ error: "Sign out failed" }, { status: 400 });
  }
}
