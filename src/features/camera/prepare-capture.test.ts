// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  MAX_UPLOAD_EDGE,
  UPLOAD_JPEG_QUALITY,
  calculateUploadDimensions,
  prepareCaptureForUpload,
} from "./prepare-capture";

describe("calculateUploadDimensions", () => {
  it("constrains the long edge while preserving aspect ratio", () => {
    expect(calculateUploadDimensions(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(calculateUploadDimensions(1200, 1600)).toEqual({ width: 1200, height: 1600 });
  });
});

describe("prepareCaptureForUpload", () => {
  it("downscales and recompresses a phone-sized capture before upload", async () => {
    const release = vi.fn();
    const encoded = new Blob(["smaller"], { type: "image/jpeg" });
    const encode = vi.fn().mockResolvedValue(encoded);
    const input = new Blob([new Uint8Array(4096)], { type: "image/jpeg" });

    const result = await prepareCaptureForUpload(input, {
      decode: vi.fn().mockResolvedValue({ source: {} as CanvasImageSource, width: 4032, height: 3024, release }),
      encode,
    });

    expect(encode).toHaveBeenCalledWith(expect.anything(), MAX_UPLOAD_EDGE, 1500, UPLOAD_JPEG_QUALITY);
    expect(release).toHaveBeenCalledOnce();
    expect(result).toBe(encoded);
  });

  it("always returns the JPEG encoding so small non-JPEG files cannot bypass normalization", async () => {
    const release = vi.fn();
    const input = new Blob(["small"], { type: "image/png" });
    const encoded = new Blob([new Uint8Array(100)], { type: "image/jpeg" });

    const result = await prepareCaptureForUpload(input, {
      decode: vi.fn().mockResolvedValue({ source: {} as CanvasImageSource, width: 800, height: 600, release }),
      encode: vi.fn().mockResolvedValue(encoded),
    });

    expect(result).toBe(encoded);
    expect(result.type).toBe("image/jpeg");
    expect(release).toHaveBeenCalledOnce();
  });
});
