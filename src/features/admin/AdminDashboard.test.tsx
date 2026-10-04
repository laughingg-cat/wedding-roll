import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AdminDashboard } from "./AdminDashboard";

const snapshot = {
  event: {
    id: "event-1",
    name: "Taylor & Sam",
    uploadsPaused: false,
    votingPaused: false,
    winnersRevealed: false,
    retentionAt: "2027-09-24T00:00:00.000Z",
    shotLimit: 12,
  },
  stats: { guests: 18, visible: 126, hidden: 2, failed: 3, processing: 1 },
  photos: [{ id: "photo-1", author: "Maya", likeCount: 24, status: "visible" as const, capturedAt: "2027-08-24T10:30:00.000Z", rank: 1, tied: false }],
};

describe("AdminDashboard", () => {
  it("pauses uploads with an explicit control", async () => {
    const user = userEvent.setup();
    const updateEvent = vi.fn().mockResolvedValue(undefined);
    render(<AdminDashboard initialSnapshot={snapshot} updateEvent={updateEvent} moderatePhoto={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Pause uploads" }));
    expect(updateEvent).toHaveBeenCalledWith({ uploadsPaused: true });
    expect(await screen.findByRole("button", { name: "Resume uploads" })).toBeVisible();
  });

  it("hides a visible photo while preserving its likes in the row", async () => {
    const user = userEvent.setup();
    const moderatePhoto = vi.fn().mockResolvedValue(undefined);
    render(<AdminDashboard initialSnapshot={snapshot} updateEvent={vi.fn()} moderatePhoto={moderatePhoto} />);
    await user.click(screen.getByRole("button", { name: "Hide Maya's photo" }));
    expect(moderatePhoto).toHaveBeenCalledWith("photo-1", "hidden");
    expect(await screen.findByText("Hidden")).toBeVisible();
    expect(screen.getByText("24 likes")).toBeVisible();
  });

  it("paginates the moderation list", async () => {
    const user = userEvent.setup();
    const fetchMorePhotos = vi.fn().mockResolvedValue({
      photos: [{ ...snapshot.photos[0], id: "photo-2", author: "Noah", rank: 2 }],
      nextOffset: null,
    });
    render(<AdminDashboard initialSnapshot={{ ...snapshot, nextPhotoOffset: 100 }} fetchMorePhotos={fetchMorePhotos} />);

    await user.click(screen.getByRole("button", { name: "Load more photos" }));
    expect(await screen.findByText("Noah")).toBeVisible();
    expect(fetchMorePhotos).toHaveBeenCalledWith(100);
    expect(screen.queryByRole("button", { name: "Load more photos" })).not.toBeInTheDocument();
  });
});
