import { describe, expect, it } from "vitest";

import { decodeGalleryCursor, encodeGalleryCursor, toGalleryItem } from "./gallery-feed";

describe("gallery feed", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = encodeGalleryCursor({ completedAt: "2027-08-24T10:30:00.000Z", id: "photo-2" });
    expect(decodeGalleryCursor(cursor)).toEqual({ completedAt: "2027-08-24T10:30:00.000Z", id: "photo-2" });
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeGalleryCursor("not-a-cursor")).toThrow("invalid_cursor");
  });

  it("maps a visible photo without leaking a storage path", () => {
    const item = toGalleryItem({
      id: "photo-1",
      guest_session_id: "guest-1",
      preset: "portra_400",
      completed_at: "2027-08-24T10:30:00.000Z",
      guest_sessions: { display_name: "Maya" },
      likes: [{ guest_session_id: "guest-2" }, { guest_session_id: "guest-3" }],
    }, "guest-2");

    expect(item).toEqual({
      id: "photo-1",
      author: "Maya",
      preset: "portra_400",
      capturedAt: "2027-08-24T10:30:00.000Z",
      likeCount: 2,
      likedByMe: true,
      isMine: false,
      mediaUrl: "/api/photos/photo-1/media",
    });
    expect(JSON.stringify(item)).not.toContain("path");
  });
});
