import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CameraExperience } from "./CameraExperience";

function capture() {
  return Promise.resolve({
    blob: new Blob(["jpeg"], { type: "image/jpeg" }),
    previewUrl: "blob:preview",
  });
}

describe("CameraExperience", () => {
  it("locks the selected preset during confirmation and retakes without uploading", async () => {
    const user = userEvent.setup();
    const uploadCapture = vi.fn();
    render(
      <CameraExperience
        shotsRemaining={12}
        startCamera={async () => null}
        captureFrame={capture}
        uploadCapture={uploadCapture}
      />,
    );

    await user.click(screen.getByRole("button", { name: "QuickSnap" }));
    await user.click(screen.getByRole("button", { name: "Take photo" }));

    expect(screen.getByRole("img", { name: "QuickSnap preview" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Portra 400" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retake" }));
    expect(screen.getByText("12 shots left")).toBeVisible();
    expect(uploadCapture).not.toHaveBeenCalled();
  });

  it("uploads a confirmed photo and decrements quota only after success", async () => {
    const user = userEvent.setup();
    const uploadCapture = vi.fn().mockResolvedValue({ photoId: "photo-1" });
    render(
      <CameraExperience
        shotsRemaining={12}
        startCamera={async () => null}
        captureFrame={capture}
        uploadCapture={uploadCapture}
      />,
    );

    await user.click(screen.getByRole("button", { name: "HP5+" }));
    await user.click(screen.getByRole("button", { name: "Take photo" }));
    expect(screen.getByText("12 shots left")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Use Photo" }));

    expect(await screen.findByText("Uploaded — 11 shots left")).toBeVisible();
    expect(uploadCapture).toHaveBeenCalledWith(expect.any(Blob), "hp5_plus", null);
  });

  it("offers native capture when live camera permission fails", async () => {
    render(
      <CameraExperience
        shotsRemaining={12}
        startCamera={async () => {
          throw new Error("permission denied");
        }}
        captureFrame={capture}
        uploadCapture={vi.fn()}
      />,
    );

    expect(await screen.findByText("Camera access is unavailable")).toBeVisible();
    expect(screen.getByLabelText("Use your phone camera instead")).toHaveAttribute("capture", "environment");
  });

  it("restores one unexpired local capture after a refresh", async () => {
    render(
      <CameraExperience
        shotsRemaining={12}
        startCamera={async () => null}
        captureFrame={capture}
        uploadCapture={vi.fn()}
        loadPending={async () => ({
          blob: new Blob(["saved"], { type: "image/jpeg" }),
          preset: "cinestill_800t",
          createdAt: "2027-08-24T12:00:00.000Z",
        })}
        createPreviewUrl={() => "blob:restored"}
      />,
    );

    expect(await screen.findByRole("img", { name: "800T preview" })).toHaveAttribute("src", "blob:restored");
    expect(screen.getByRole("button", { name: "Use Photo" })).toBeVisible();
  });

  it("clears a recovered reservation when the guest chooses Retake", async () => {
    const user = userEvent.setup();
    const clearPending = vi.fn().mockResolvedValue(undefined);
    render(
      <CameraExperience
        shotsRemaining={12}
        startCamera={async () => null}
        captureFrame={capture}
        uploadCapture={vi.fn()}
        clearPending={clearPending}
        loadPending={async () => ({
          blob: new Blob(["saved"], { type: "image/jpeg" }), preset: "original", createdAt: "2027-08-24T12:00:00.000Z",
          reservation: { photoId: "old-photo", upload: { path: "old.jpg", token: "token" } }, uploaded: true,
        })}
        createPreviewUrl={() => "blob:restored"}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Retake" }));
    expect(clearPending).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Use Photo" })).not.toBeInTheDocument();
  });

  it("reuses the persisted reservation when Use Photo is retried without a reload", async () => {
    const user = userEvent.setup();
    const pending = {
      blob: new Blob(["saved"], { type: "image/jpeg" }), preset: "original" as const, createdAt: "2027-08-24T12:00:00.000Z",
      reservation: { photoId: "same-photo", upload: { path: "same.jpg", token: "token" } }, uploaded: true,
    };
    const loadPending = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(pending);
    const uploadCapture = vi.fn().mockRejectedValueOnce(new Error("network lost")).mockResolvedValueOnce({ photoId: "same-photo" });
    render(<CameraExperience shotsRemaining={12} startCamera={async () => null} captureFrame={capture} uploadCapture={uploadCapture} loadPending={loadPending} />);

    await user.click(screen.getByRole("button", { name: "Take photo" }));
    await user.click(await screen.findByRole("button", { name: "Use Photo" }));
    expect(await screen.findByText("network lost")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Use Photo" }));

    expect(uploadCapture).toHaveBeenNthCalledWith(2, expect.any(Blob), "original", pending);
    expect(await screen.findByText("Uploaded — 11 shots left")).toBeVisible();
  });
});
