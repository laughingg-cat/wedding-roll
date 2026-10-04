"use client";

import { CameraExperience } from "@/features/camera/CameraExperience";
import { uploadCapture } from "@/features/camera/upload-capture";

export function CameraClient({ shotsRemaining }: { shotsRemaining: number }) {
  return <CameraExperience shotsRemaining={shotsRemaining} uploadCapture={uploadCapture} />;
}

