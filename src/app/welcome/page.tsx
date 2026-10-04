import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { JOIN_COOKIE } from "@/features/auth/cookies";
import { readJoinGrant } from "@/features/auth/guest-access";
import type { LandingPhotoView } from "@/features/auth/WelcomeForm";
import { serverEnv } from "@/lib/env";
import { SupabaseLandingStore } from "@/lib/repositories/landing-store";
import { WelcomeClient } from "./welcome-client";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const env = serverEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(JOIN_COOKIE)?.value;
  if (!token) redirect("/invalid-link");
  let eventName: string;
  let eventId: string;
  try {
    const grant = await readJoinGrant(token, env.RATE_LIMIT_SECRET);
    eventName = grant.eventName;
    eventId = grant.eventId;
  } catch {
    redirect("/invalid-link");
  }

  let landingPhotos: LandingPhotoView[] = [];
  try {
    const store = new SupabaseLandingStore();
    const published = await store.listPublished(eventId);
    landingPhotos = await Promise.all(
      published.map(async (photo) => ({
        mediaUrl: await store.signUrl(photo.storagePath),
        altText: photo.altText,
        isCover: photo.isCover,
      })),
    );
  } catch {
    // Fall back to the bundled welcome image when no photos are configured.
    landingPhotos = [];
  }

  return <WelcomeClient eventName={eventName} landingPhotos={landingPhotos} />;
}
