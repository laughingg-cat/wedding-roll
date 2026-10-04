import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GalleryFeed } from "./GalleryFeed";

const photos = [{
  id: "photo-1",
  author: "Maya",
  preset: "portra_400" as const,
  capturedAt: "2027-08-24T10:30:00.000Z",
  likeCount: 4,
  likedByMe: false,
  isMine: false,
  mediaUrl: "/api/photos/photo-1/media",
}];

describe("GalleryFeed", () => {
  it("optimistically likes a photo", async () => {
    const user = userEvent.setup();
    const setLiked = vi.fn().mockResolvedValue({ likeCount: 5, liked: true });
    render(<GalleryFeed initialPhotos={photos} fetchPage={vi.fn()} setLiked={setLiked} />);

    await user.click(screen.getByRole("button", { name: "Like Maya's photo" }));
    expect(await screen.findByText("5")).toBeVisible();
    expect(setLiked).toHaveBeenCalledWith("photo-1", true);
  });

  it("does not offer self-likes", () => {
    render(<GalleryFeed initialPhotos={[{ ...photos[0], isMine: true }]} fetchPage={vi.fn()} setLiked={vi.fn()} />);
    expect(screen.getByText("Your photo")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Like Maya/ })).not.toBeInTheDocument();
  });

  it("loads older pages and keeps them when the newest page refreshes", async () => {
    const user = userEvent.setup();
    const older = { ...photos[0], id: "photo-older", author: "Noah" };
    const newest = { ...photos[0], id: "photo-new", author: "Ari" };
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ photos: [older], nextCursor: null })
      .mockResolvedValueOnce({ photos: [newest, photos[0]], nextCursor: "cursor-2" });

    render(<GalleryFeed initialPhotos={photos} initialNextCursor="cursor-1" fetchPage={fetchPage} setLiked={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Load more photos" }));

    expect(await screen.findByText("Noah")).toBeVisible();
    expect(fetchPage).toHaveBeenNthCalledWith(1, "cursor-1");
  });

  it("removes a loaded photo after organizer moderation", async () => {
    vi.useFakeTimers();
    const fetchPage = vi.fn().mockResolvedValue({ photos: [], nextCursor: null, removedPhotoIds: ["photo-1"], syncToken: "2027-08-24T10:31:00Z" });
    render(<GalleryFeed initialPhotos={photos} initialSyncToken="2027-08-24T10:30:00Z" fetchPage={fetchPage} setLiked={vi.fn()} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(screen.queryByText("Maya")).not.toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledWith(undefined, "2027-08-24T10:30:00Z");
    vi.useRealTimers();
  });

  it("adds an older photo back after organizer restoration", async () => {
    vi.useFakeTimers();
    const restored = { ...photos[0], id: "restored", author: "Restored guest" };
    const fetchPage = vi.fn().mockResolvedValue({ photos: [], nextCursor: null, changedPhotos: [restored], syncToken: "2027-08-24T10:31:00Z" });
    render(<GalleryFeed initialPhotos={photos} initialSyncToken="2027-08-24T10:30:00Z" fetchPage={fetchPage} setLiked={vi.fn()} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(screen.getByText("Restored guest")).toBeVisible();
    vi.useRealTimers();
  });
});
