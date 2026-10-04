// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { cleanupExpiredEvent } from "./cleanup-retention";

describe("cleanupExpiredEvent", () => {
  it("removes every stored object before deleting event metadata", async () => {
    const calls: string[] = [];
    const remove = vi.fn(async (bucket: string, paths: string[]) => { calls.push(`${bucket}:${paths.join("|")}`); });
    const deleteEvent = vi.fn(async () => { calls.push("database"); });
    await cleanupExpiredEvent({
      eventId: "event-1",
      photos: [{ id: "a", tempPath: "tmp/a.jpg", originalPath: "final/a-clean.jpg", filteredPath: "final/a-filtered.jpg" }],
    }, { remove, deleteEvent });
    expect(calls).toEqual(["wedding-temp:tmp/a.jpg", "wedding-photos:final/a-clean.jpg|final/a-filtered.jpg", "database"]);
  });

  it("preserves database metadata if object deletion fails", async () => {
    const deleteEvent = vi.fn();
    await expect(cleanupExpiredEvent({ eventId: "event-1", photos: [{ id: "a", tempPath: "tmp/a.jpg", originalPath: null, filteredPath: null }] }, {
      remove: vi.fn().mockRejectedValue(new Error("storage unavailable")), deleteEvent,
    })).rejects.toThrow("storage unavailable");
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it("removes derived partial assets for more than one API page of photos", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const photos = Array.from({ length: 1201 }, (_, index) => ({ id: `photo-${index}`, tempPath: null, originalPath: null, filteredPath: null }));
    await cleanupExpiredEvent({ eventId: "event-1", photos }, { remove, deleteEvent: vi.fn() });

    expect(remove).toHaveBeenCalledTimes(25);
    expect(remove).toHaveBeenCalledWith("wedding-photos", expect.arrayContaining([
      "event-1/photo-1200/clean.jpg",
      "event-1/photo-1200/filtered.jpg",
    ]));
  });
});
