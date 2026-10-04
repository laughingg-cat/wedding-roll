import type { PhotoStatus } from "@/features/shared/domain";

export type AdminSnapshot = {
  event: {
    id: string;
    name: string;
    uploadsPaused: boolean;
    votingPaused: boolean;
    winnersRevealed: boolean;
    votingEndsAt?: string;
    retentionAt: string;
    shotLimit: number;
  };
  stats: { guests: number; visible: number; hidden: number; failed: number; processing: number };
  photos: Array<{
    id: string;
    author: string;
    likeCount: number;
    status: PhotoStatus;
    capturedAt: string;
    rank: number;
    tied: boolean;
  }>;
  nextPhotoOffset?: number | null;
  winners?: Array<{ photoId: string; placement: number; awardLabel: string }>;
};
