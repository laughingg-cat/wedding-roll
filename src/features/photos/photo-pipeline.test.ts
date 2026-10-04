// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { finalizeGuestPhoto, reserveGuestPhoto, type PhotoPipelineDependencies } from "./photo-pipeline";

describe("reserveGuestPhoto", () => {
  it("creates a server-owned path and returns a one-path upload token", async () => {
    const reserve = vi.fn().mockResolvedValue({ id: "photo-1", reservationExpiresAt: "2027-08-24T12:10:00Z" });
    const signUpload = vi.fn().mockResolvedValue({ signedUrl: "https://upload.example/signed", token: "signed-token" });

    const result = await reserveGuestPhoto(
      { eventId: "event-1", guestSessionId: "guest-1", preset: "quicksnap" },
      { reserve, signUpload, randomPathSegment: () => "random-segment" },
    );

    expect(reserve).toHaveBeenCalledWith({
      eventId: "event-1",
      guestSessionId: "guest-1",
      preset: "quicksnap",
      tempPath: "event-1/guest-1/random-segment.jpg",
    });
    expect(signUpload).toHaveBeenCalledWith("event-1/guest-1/random-segment.jpg");
    expect(result).toEqual({
      photoId: "photo-1",
      upload: {
        signedUrl: "https://upload.example/signed",
        token: "signed-token",
        path: "event-1/guest-1/random-segment.jpg",
      },
      expiresAt: "2027-08-24T12:10:00Z",
    });
  });
});

function pipeline(overrides: Partial<PhotoPipelineDependencies> = {}): PhotoPipelineDependencies {
  return {
    claim: vi.fn().mockResolvedValue({
      state: "claimed",
      photo: { id: "photo-1", eventId: "event-1", tempPath: "event/guest/temp.jpg", preset: "portra_400" },
    }),
    downloadTemp: vi.fn().mockResolvedValue(Buffer.from("jpeg")),
    process: vi.fn().mockResolvedValue({
      clean: Buffer.from("clean"),
      filtered: Buffer.from("filtered"),
      width: 1800,
      height: 2400,
    }),
    uploadFinal: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    removeObjects: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("finalizeGuestPhoto", () => {
  it("processes one claimed capture and completes it with non-overwritable paths", async () => {
    const deps = pipeline();
    const result = await finalizeGuestPhoto("photo-1", "guest-1", deps);

    expect(deps.uploadFinal).toHaveBeenNthCalledWith(1, "event-1/photo-1/clean.jpg", Buffer.from("clean"));
    expect(deps.uploadFinal).toHaveBeenNthCalledWith(2, "event-1/photo-1/filtered.jpg", Buffer.from("filtered"));
    expect(deps.complete).toHaveBeenCalledWith({
      photoId: "photo-1",
      originalPath: "event-1/photo-1/clean.jpg",
      filteredPath: "event-1/photo-1/filtered.jpg",
      width: 1800,
      height: 2400,
      byteSize: 5,
    });
    expect(deps.removeObjects).toHaveBeenCalledWith("wedding-temp", ["event/guest/temp.jpg"]);
    expect(result).toEqual({ state: "complete" });
  });

  it("uploads clean and filtered assets concurrently", async () => {
    const started: string[] = [];
    const releases: Array<() => void> = [];
    const uploadFinal = vi.fn((path: string) => new Promise<void>((resolve) => {
      started.push(path);
      releases.push(resolve);
    }));
    const deps = pipeline({ uploadFinal });

    const finalization = finalizeGuestPhoto("photo-1", "guest-1", deps);
    await vi.waitFor(() => expect(started).toEqual([
      "event-1/photo-1/clean.jpg",
      "event-1/photo-1/filtered.jpg",
    ]));
    releases.forEach((release) => release());

    await expect(finalization).resolves.toEqual({ state: "complete" });
  });

  it("waits for both final uploads to settle before cleaning up a failed pair", async () => {
    let releaseFiltered: (() => void) | undefined;
    const filteredUpload = new Promise<void>((resolve) => { releaseFiltered = resolve; });
    const removeObjects = vi.fn().mockResolvedValue(undefined);
    const uploadFinal = vi.fn((path: string) => path.endsWith("clean.jpg")
      ? Promise.reject(new Error("clean upload failed"))
      : filteredUpload);
    const deps = pipeline({ uploadFinal, removeObjects });

    const finalization = finalizeGuestPhoto("photo-1", "guest-1", deps);
    await vi.waitFor(() => expect(uploadFinal).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(removeObjects).not.toHaveBeenCalled();

    releaseFiltered?.();
    await expect(finalization).rejects.toThrow("clean upload failed");
    expect(removeObjects).toHaveBeenCalledWith("wedding-photos", [
      "event-1/photo-1/clean.jpg",
      "event-1/photo-1/filtered.jpg",
    ]);
  });

  it("is idempotent when another request already completed or is processing", async () => {
    const complete = pipeline({ claim: vi.fn().mockResolvedValue({ state: "complete" }) });
    const busy = pipeline({ claim: vi.fn().mockResolvedValue({ state: "busy" }) });

    await expect(finalizeGuestPhoto("photo-1", "guest-1", complete)).resolves.toEqual({ state: "complete" });
    await expect(finalizeGuestPhoto("photo-1", "guest-1", busy)).resolves.toEqual({ state: "processing" });
    expect(complete.downloadTemp).not.toHaveBeenCalled();
    expect(busy.downloadTemp).not.toHaveBeenCalled();
  });

  it("marks a claimed photo failed and removes partial final assets", async () => {
    const deps = pipeline({ uploadFinal: vi.fn().mockRejectedValue(new Error("storage unavailable")) });

    await expect(finalizeGuestPhoto("photo-1", "guest-1", deps)).rejects.toThrow("storage unavailable");
    expect(deps.markFailed).toHaveBeenCalledWith("photo-1", "processing_failed");
    expect(deps.removeObjects).toHaveBeenCalledWith("wedding-photos", [
      "event-1/photo-1/clean.jpg",
      "event-1/photo-1/filtered.jpg",
    ]);
  });

  it("keeps committed assets when temporary cleanup fails", async () => {
    const removeObjects = vi.fn().mockImplementation(async (bucket: string) => {
      if (bucket === "wedding-temp") throw new Error("temporary cleanup unavailable");
    });
    const deps = pipeline({ removeObjects });

    await expect(finalizeGuestPhoto("photo-1", "guest-1", deps)).resolves.toEqual({ state: "complete" });
    expect(deps.complete).toHaveBeenCalledOnce();
    expect(deps.markFailed).not.toHaveBeenCalled();
    expect(removeObjects).not.toHaveBeenCalledWith("wedding-photos", expect.anything());
  });

  it("preserves final assets when completion has an ambiguous transport failure", async () => {
    const deps = pipeline({ complete: vi.fn().mockRejectedValue(new Error("response lost")) });

    await expect(finalizeGuestPhoto("photo-1", "guest-1", deps)).rejects.toThrow("response lost");
    expect(deps.markFailed).not.toHaveBeenCalled();
    expect(deps.removeObjects).not.toHaveBeenCalled();
  });
});
