import sharp, { type Sharp } from "sharp";

import type { PresetId } from "@/features/shared/domain";

export const MAX_CAPTURE_BYTES = 6 * 1024 * 1024;
export const MAX_CAPTURE_PIXELS = 24_000_000;
export const MAX_CAPTURE_EDGE = 2400;

function isJpeg(input: Buffer) {
  return input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
}

function applyPreset(image: Sharp, preset: Exclude<PresetId, "original">) {
  switch (preset) {
    case "portra_400":
      return image
        // Warm pastel highlights with a deliberately visible low-saturation
        // film palette; this is an unofficial interpretation, not a scan.
        .recomb([
          [1.08, -0.03, -0.02],
          [-0.01, 1.02, 0.01],
          [-0.04, 0.05, 0.86],
        ])
        .modulate({ brightness: 1.06, saturation: 0.78 })
        .gamma(1.08);
    case "quicksnap":
      return image.modulate({ brightness: 1.04, saturation: 1.5 }).linear(1.14, -9).sharpen({ sigma: 1.1 });
    case "cinestill_800t":
      return image
        .recomb([
          [1.12, -0.04, -0.02],
          [0.01, 0.92, 0.08],
          [-0.06, 0.05, 1.18],
        ])
        .modulate({ brightness: 0.98, saturation: 1.3 })
        .gamma(1.1);
    case "hp5_plus":
      return image.grayscale().linear(1.16, -14).gamma(1.12).sharpen();
  }
}

export async function processCapture(input: Buffer, preset: PresetId) {
  if (input.byteLength > MAX_CAPTURE_BYTES) throw new Error("Capture must be 6 MB or smaller");
  if (!isJpeg(input)) throw new Error("Capture must be a valid JPEG");

  try {
    const source = sharp(input, { limitInputPixels: MAX_CAPTURE_PIXELS, failOn: "error" });
    const metadata = await source.metadata();
    if (metadata.format !== "jpeg" || !metadata.width || !metadata.height) {
      throw new Error("Capture must be a valid JPEG");
    }
    if (metadata.width * metadata.height > MAX_CAPTURE_PIXELS) {
      throw new Error("Capture must not exceed 24 megapixels");
    }

    const normalized = sharp(input, { limitInputPixels: MAX_CAPTURE_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: MAX_CAPTURE_EDGE, height: MAX_CAPTURE_EDGE, fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true });
    const clean = await normalized.toBuffer();
    const cleanMetadata = await sharp(clean).metadata();
    if (!cleanMetadata.width || !cleanMetadata.height) throw new Error("Capture dimensions are unavailable");

    const filtered = preset === "original"
      ? clean
      : await applyPreset(sharp(clean), preset)
          .jpeg({ quality: 88, chromaSubsampling: "4:4:4", mozjpeg: true })
          .toBuffer();

    return {
      clean,
      filtered,
      width: cleanMetadata.width,
      height: cleanMetadata.height,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/pixel limit|24 megapixels/i.test(message)) throw new Error("Capture must not exceed 24 megapixels");
    if (/6 MB/.test(message) || /valid JPEG/.test(message)) throw error;
    throw new Error("Capture must be a valid JPEG");
  }
}
