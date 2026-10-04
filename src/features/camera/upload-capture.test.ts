// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { runCaptureUpload, type CaptureUploadDependencies } from "./upload-capture";

function dependencies(overrides: Partial<CaptureUploadDependencies> = {}): CaptureUploadDependencies {
  return {
    savePending: vi.fn().mockResolvedValue(undefined),
    clearPending: vi.fn().mockResolvedValue(undefined),
    reserve: vi.fn().mockResolvedValue({
      photoId: "photo-1",
      upload: { path: "event/guest/temp.jpg", token: "signed-token" },
    }),
    upload: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue({ state: "complete" as const }),
    wait: vi.fn().mockResolvedValue(undefined),
    now: () => new Date("2027-08-24T12:00:00.000Z"),
    ...overrides,
  };
}

describe("runCaptureUpload", () => {
  it("reports the network phase so slow uploads can be identified on-device", async () => {
    const onProgress = vi.fn();
    const deps = dependencies({ onProgress });

    await runCaptureUpload(new Blob(["jpeg"], { type: "image/jpeg" }), "original", deps);

    expect(onProgress.mock.calls.map(([phase]) => phase)).toEqual([
      "reserving",
      "uploading",
      "processing",
      "complete",
    ]);
  });

  it("persists before networking and clears only after server completion", async () => {
    const calls: string[] = [];
    const deps = dependencies({
      savePending: vi.fn(async () => { calls.push("save"); }),
      reserve: vi.fn(async () => { calls.push("reserve"); return { photoId: "photo-1", upload: { path: "temp.jpg", token: "token" } }; }),
      upload: vi.fn(async () => { calls.push("upload"); }),
      finalize: vi.fn(async () => { calls.push("finalize"); return { state: "complete" as const }; }),
      clearPending: vi.fn(async () => { calls.push("clear"); }),
    });

    const result = await runCaptureUpload(new Blob(["jpeg"], { type: "image/jpeg" }), "portra_400", deps);

    expect(calls).toEqual(["save", "reserve", "save", "upload", "save", "finalize", "clear"]);
    expect(result).toEqual({ photoId: "photo-1" });
  });

  it("polls an in-progress idempotent finalization", async () => {
    const finalize = vi.fn()
      .mockResolvedValueOnce({ state: "processing" })
      .mockResolvedValueOnce({ state: "complete" });
    const deps = dependencies({ finalize });

    await runCaptureUpload(new Blob(["jpeg"], { type: "image/jpeg" }), "original", deps);

    expect(finalize).toHaveBeenCalledTimes(2);
    expect(deps.wait).toHaveBeenCalledWith(1200);
    expect(deps.clearPending).toHaveBeenCalledOnce();
  });

  it("keeps the local pending capture when the network fails", async () => {
    const deps = dependencies({ upload: vi.fn().mockRejectedValue(new Error("offline")) });

    await expect(runCaptureUpload(new Blob(["jpeg"], { type: "image/jpeg" }), "original", deps)).rejects.toThrow(
      "offline",
    );
    expect(deps.clearPending).not.toHaveBeenCalled();
  });

  it("resumes the same uploaded reservation after reload", async () => {
    const deps = dependencies();
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    await runCaptureUpload(blob, "original", deps, {
      blob,
      preset: "original",
      createdAt: "2027-08-24T12:00:00.000Z",
      reservation: { photoId: "photo-existing", upload: { path: "old/path.jpg", token: "old-token" }, expiresAt: "2027-08-24T12:10:00.000Z" },
      uploaded: true,
    });

    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledWith("photo-existing");
  });

  it("retries a lost finalization response for the same photo", async () => {
    const finalize = vi.fn().mockRejectedValueOnce(new Error("network lost")).mockResolvedValueOnce({ state: "complete" });
    const deps = dependencies({ finalize });

    await runCaptureUpload(new Blob(["jpeg"]), "original", deps);
    expect(finalize).toHaveBeenNthCalledWith(1, "photo-1");
    expect(finalize).toHaveBeenNthCalledWith(2, "photo-1");
    expect(deps.reserve).toHaveBeenCalledOnce();
  });

  it("probes an uploaded expired reservation before creating a replacement", async () => {
    const blob = new Blob(["jpeg"]);
    const finalize = vi.fn().mockResolvedValue({ state: "complete" });
    const deps = dependencies({ finalize });
    await runCaptureUpload(blob, "original", deps, {
      blob, preset: "original", createdAt: "2027-08-24T11:00:00.000Z", uploaded: true,
      reservation: { photoId: "possibly-complete", upload: { path: "old.jpg", token: "old" }, expiresAt: "2027-08-24T11:10:00.000Z" },
    });

    expect(finalize).toHaveBeenCalledWith("possibly-complete");
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
  });
});
