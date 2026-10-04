"use client";

import { useRouter } from "next/navigation";

import type { LandingPhotoView } from "@/features/auth/WelcomeForm";
import { WelcomeForm } from "@/features/auth/WelcomeForm";

export function WelcomeClient({ eventName, landingPhotos }: { eventName: string; landingPhotos?: LandingPhotoView[] }) {
  const router = useRouter();
  return <WelcomeForm eventName={eventName} landingPhotos={landingPhotos} onJoined={(path) => router.replace(path)} />;
}
