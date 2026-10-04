export const PRESET_IDS = [
  "original",
  "portra_400",
  "quicksnap",
  "cinestill_800t",
  "hp5_plus",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export const PHOTO_STATUSES = [
  "reserved",
  "processing",
  "visible",
  "hidden",
  "failed",
  "expired",
] as const;

export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export type EventWindow = {
  uploadStartsAt: string;
  uploadEndsAt: string;
  votingStartsAt: string;
  votingEndsAt: string;
  uploadsPaused: boolean;
  votingPaused: boolean;
};

export function deriveEventAvailability(window: EventWindow, now = new Date()) {
  const instant = now.getTime();
  return {
    uploadsOpen:
      !window.uploadsPaused &&
      instant >= Date.parse(window.uploadStartsAt) &&
      instant < Date.parse(window.uploadEndsAt),
    votingOpen:
      !window.votingPaused &&
      instant >= Date.parse(window.votingStartsAt) &&
      instant < Date.parse(window.votingEndsAt),
  };
}

export function sanitizeDisplayName(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("Enter your name");
  if ([...normalized].length > 60) throw new Error("Name must be 60 characters or fewer");
  return normalized;
}

export function canGuestLikePhoto(input: {
  guestSessionId: string;
  ownerSessionId: string;
  photoStatus: PhotoStatus;
  votingOpen: boolean;
}): { allowed: true } | { allowed: false; reason: "voting_closed" | "self_vote" | "photo_unavailable" } {
  if (!input.votingOpen) return { allowed: false, reason: "voting_closed" };
  if (input.photoStatus !== "visible") return { allowed: false, reason: "photo_unavailable" };
  if (input.guestSessionId === input.ownerSessionId) return { allowed: false, reason: "self_vote" };
  return { allowed: true };
}

export function rankVisiblePhotos(
  photos: Array<{ id: string; status: PhotoStatus; likeCount: number }>,
) {
  const visible = photos
    .filter((photo) => photo.status === "visible")
    .sort((a, b) => b.likeCount - a.likeCount);

  return visible.map((photo, index) => {
    const rank = index > 0 && visible[index - 1].likeCount === photo.likeCount
      ? visible.slice(0, index).findIndex((candidate) => candidate.likeCount === photo.likeCount) + 1
      : index + 1;
    const tied = visible.some(
      (candidate) => candidate.id !== photo.id && candidate.likeCount === photo.likeCount,
    );
    return { id: photo.id, likeCount: photo.likeCount, rank, tied };
  });
}

