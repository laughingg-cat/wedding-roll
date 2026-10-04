import { describe, expect, it } from "vitest";

import {
  canGuestLikePhoto,
  deriveEventAvailability,
  rankVisiblePhotos,
  sanitizeDisplayName,
} from "./domain";

describe("deriveEventAvailability", () => {
  const now = new Date("2027-08-24T12:00:00.000Z");

  it("keeps upload and voting windows independent", () => {
    expect(
      deriveEventAvailability(
        {
          uploadStartsAt: "2027-08-24T10:00:00.000Z",
          uploadEndsAt: "2027-08-24T11:00:00.000Z",
          votingStartsAt: "2027-08-24T10:00:00.000Z",
          votingEndsAt: "2027-08-24T13:00:00.000Z",
          uploadsPaused: false,
          votingPaused: false,
        },
        now,
      ),
    ).toEqual({ uploadsOpen: false, votingOpen: true });
  });

  it("honors organizer pause controls inside active windows", () => {
    expect(
      deriveEventAvailability(
        {
          uploadStartsAt: "2027-08-24T10:00:00.000Z",
          uploadEndsAt: "2027-08-24T13:00:00.000Z",
          votingStartsAt: "2027-08-24T10:00:00.000Z",
          votingEndsAt: "2027-08-24T13:00:00.000Z",
          uploadsPaused: true,
          votingPaused: true,
        },
        now,
      ),
    ).toEqual({ uploadsOpen: false, votingOpen: false });
  });
});

describe("sanitizeDisplayName", () => {
  it("normalizes whitespace while preserving a human name", () => {
    expect(sanitizeDisplayName("  Taylor   &   Sam  ")).toBe("Taylor & Sam");
  });

  it("rejects empty and overlong names", () => {
    expect(() => sanitizeDisplayName("   ")).toThrow("Enter your name");
    expect(() => sanitizeDisplayName("a".repeat(61))).toThrow("60 characters");
  });
});

describe("canGuestLikePhoto", () => {
  it("blocks self-votes and hidden photos", () => {
    expect(
      canGuestLikePhoto({
        guestSessionId: "guest-a",
        ownerSessionId: "guest-a",
        photoStatus: "visible",
        votingOpen: true,
      }),
    ).toEqual({ allowed: false, reason: "self_vote" });

    expect(
      canGuestLikePhoto({
        guestSessionId: "guest-a",
        ownerSessionId: "guest-b",
        photoStatus: "hidden",
        votingOpen: true,
      }),
    ).toEqual({ allowed: false, reason: "photo_unavailable" });
  });

  it("allows one eligible guest to vote for another guest's visible photo", () => {
    expect(
      canGuestLikePhoto({
        guestSessionId: "guest-a",
        ownerSessionId: "guest-b",
        photoStatus: "visible",
        votingOpen: true,
      }),
    ).toEqual({ allowed: true });
  });
});

describe("rankVisiblePhotos", () => {
  it("excludes hidden photos and assigns competition ranks to ties", () => {
    expect(
      rankVisiblePhotos([
        { id: "a", status: "visible", likeCount: 12 },
        { id: "b", status: "visible", likeCount: 9 },
        { id: "c", status: "hidden", likeCount: 99 },
        { id: "d", status: "visible", likeCount: 9 },
        { id: "e", status: "visible", likeCount: 4 },
      ]),
    ).toEqual([
      { id: "a", likeCount: 12, rank: 1, tied: false },
      { id: "b", likeCount: 9, rank: 2, tied: true },
      { id: "d", likeCount: 9, rank: 2, tied: true },
      { id: "e", likeCount: 4, rank: 4, tied: false },
    ]);
  });
});

