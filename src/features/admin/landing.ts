import { randomBytes } from "node:crypto";
import sharp from "sharp";

import { MAX_CAPTURE_BYTES, MAX_CAPTURE_EDGE, MAX_CAPTURE_PIXELS } from "@/features/photos/process-capture";

export type LandingPhoto = {
  id: string;
  storagePath: string;
  position: number;
  isCover: boolean;
  altText: string;
  visible: boolean;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  mediaUrl?: string;
};

function isJpeg(input: Buffer) {
  return input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
}

// Normalizes an organizer-uploaded landing image: verifies it is a valid JPEG
// within size/dimension limits, strips metadata (including EXIF/location),
// corrects orientation, and renders one optimized web variant.
export async function processLandingImage(input: Buffer) {
  if (input.byteLength > MAX_CAPTURE_BYTES) throw new Error("Landing image must be 6 MB or smaller");
  if (!isJpeg(input)) throw new Error("Landing image must be a valid JPEG");

  try {
    const source = sharp(input, { limitInputPixels: MAX_CAPTURE_PIXELS, failOn: "error" });
    const metadata = await source.metadata();
    if (metadata.format !== "jpeg" || !metadata.width || !metadata.height) {
      throw new Error("Landing image must be a valid JPEG");
    }
    if (metadata.width * metadata.height > MAX_CAPTURE_PIXELS) {
      throw new Error("Landing image must not exceed 24 megapixels");
    }

    const normalized = sharp(input, { limitInputPixels: MAX_CAPTURE_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: MAX_CAPTURE_EDGE, height: MAX_CAPTURE_EDGE, fit: "inside", withoutEnlargement: true })
      .removeAlpha();
    const result = await normalized
      .jpeg({ quality: 86, chromaSubsampling: "4:2:0" })
      .toBuffer({ resolveWithObject: true });
    const { width, height } = result.info;
    if (!width || !height) throw new Error("Landing image dimensions are unavailable");
    return { buffer: result.data, width, height };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/pixel limit|24 megapixels/i.test(message)) throw new Error("Landing image must not exceed 24 megapixels");
    if (/6 MB/.test(message) || /valid JPEG/.test(message)) throw error;
    throw new Error("Landing image must be a valid JPEG");
  }
}

export function draftStoragePath(eventId: string, id: string) {
  return `draft/${eventId}/${id}.jpg`;
}

export function liveStoragePath(eventId: string, version: string, id: string) {
  return `live/${eventId}/${version}/${id}.jpg`;
}

export function randomDraftId() {
  return randomBytes(16).toString("hex");
}

// Reorders drafts so their positions match the supplied id sequence. Unknown
// ids are ignored; any missing id keeps its prior relative order at the tail.
export function applyDraftOrder(drafts: Array<{ id: string; position: number }>, orderedIds: string[]) {
  const known = new Map(drafts.map((draft) => [draft.id, draft]));
  const order = new Map(orderedIds.map((id, index) => [id, index]));
  const included = drafts
    .filter((draft) => order.has(draft.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const remaining = drafts.filter((draft) => !order.has(draft.id)).sort((a, b) => a.position - b.position);
  return [...included, ...remaining].map((draft, index) => ({
    id: draft.id,
    position: index,
    wasChanged: known.get(draft.id)?.position !== index,
  }));
}

export function withCover<T extends { id: string; isCover: boolean }>(items: T[], coverId: string | null) {
  if (!coverId) return items.map((item) => ({ ...item, isCover: false }));
  return items.map((item) => ({ ...item, isCover: item.id === coverId }));
}
