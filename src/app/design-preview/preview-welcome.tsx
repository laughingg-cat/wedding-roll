"use client";

import { WelcomeForm } from "@/features/auth/WelcomeForm";

export function PreviewWelcome() {
  return <WelcomeForm eventName="Taylor & Sam · 24 August 2027" onJoined={() => undefined} />;
}
