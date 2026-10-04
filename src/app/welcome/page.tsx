import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { JOIN_COOKIE } from "@/features/auth/cookies";
import { readJoinGrant } from "@/features/auth/guest-access";
import { serverEnv } from "@/lib/env";
import { WelcomeClient } from "./welcome-client";

export default async function WelcomePage() {
  const env = serverEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(JOIN_COOKIE)?.value;
  if (!token) redirect("/invalid-link");
  let eventName: string;
  try {
    eventName = (await readJoinGrant(token, env.RATE_LIMIT_SECRET)).eventName;
  } catch {
    redirect("/invalid-link");
  }
  return <WelcomeClient eventName={eventName} />;
}
