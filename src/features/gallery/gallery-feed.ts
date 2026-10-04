import type { PresetId } from "@/features/shared/domain";

export type GalleryItem = {
  id: string;
  author: string;
  preset: PresetId;
  capturedAt: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  mediaUrl: string;
};

export type RevealedWinner = { photoId: string; placement: number; awardLabel: string; author: string; mediaUrl: string };

export type GalleryCursor = { completedAt: string; id: string };

type GalleryRow = {
  id: string;
  guest_session_id: string;
  preset: PresetId;
  completed_at: string;
  guest_sessions: { display_name: string } | Array<{ display_name: string }>;
  likes: Array<{ guest_session_id: string }>;
};

export function encodeGalleryCursor(cursor: GalleryCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeGalleryCursor(value: string): GalleryCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<GalleryCursor>;
    if (!parsed.completedAt || !parsed.id || Number.isNaN(Date.parse(parsed.completedAt))) throw new Error();
    return { completedAt: parsed.completedAt, id: parsed.id };
  } catch {
    throw new Error("invalid_cursor");
  }
}

export function toGalleryItem(row: GalleryRow, currentGuestId: string): GalleryItem {
  const guest = Array.isArray(row.guest_sessions) ? row.guest_sessions[0] : row.guest_sessions;
  return {
    id: row.id,
    author: guest.display_name,
    preset: row.preset,
    capturedAt: row.completed_at,
    likeCount: row.likes.length,
    likedByMe: row.likes.some((like) => like.guest_session_id === currentGuestId),
    isMine: row.guest_session_id === currentGuestId,
    mediaUrl: `/api/photos/${row.id}/media`,
  };
}
