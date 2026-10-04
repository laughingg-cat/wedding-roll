import "server-only";

import { cookies } from "next/headers";

import { GUEST_COOKIE } from "./cookies";
import { resolveGuestSession } from "./guest-access";
import { SupabaseGuestAccessStore } from "@/lib/repositories/guest-access-store";

export async function currentGuest() {
  const cookieStore = await cookies();
  return resolveGuestSession(cookieStore.get(GUEST_COOKIE)?.value, new SupabaseGuestAccessStore());
}

