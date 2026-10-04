import type { PhotoStatus } from "@/features/shared/domain";

export type AdminSnapshot = {
  event: {
    id: string;
    name: string;
    timezone: string;
    uploadStartsAt: string;
    uploadEndsAt: string;
    votingStartsAt: string;
    votingEndsAt?: string;
    uploadsPaused: boolean;
    votingPaused: boolean;
    winnersRevealed: boolean;
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
