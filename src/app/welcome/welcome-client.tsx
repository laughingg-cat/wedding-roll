"use client";

import { useRouter } from "next/navigation";

import { WelcomeForm } from "@/features/auth/WelcomeForm";

export function WelcomeClient({ eventName }: { eventName: string }) {
  const router = useRouter();
  return <WelcomeForm eventName={eventName} onJoined={(path) => router.replace(path)} />;
}

