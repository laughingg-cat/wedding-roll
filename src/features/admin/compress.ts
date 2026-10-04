"use client";

export const MAX_LANDING_EDGE = 2400;
// Vercel Functions reject request bodies over ~4.5 MB; stay well under it.
export const MAX_LANDING_UPLOAD_BYTES = 4 * 1024 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the image"));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress the image"))),
      "image/jpeg",
      quality,
    );
  });
}

// Resizes and re-encodes a client-side JPEG so the upload fits inside the
// function body limit. Canvas re-encoding also strips EXIF/location metadata;
// the server still re-validates and normalizes as a second layer.
export async function compressJpeg(
  file: File,
  { maxEdge = MAX_LANDING_EDGE, targetBytes = MAX_LANDING_UPLOAD_BYTES } = {},
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process the image");
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.85, 0.7, 0.5]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= targetBytes || quality === 0.5) return blob;
    }
    return canvasToBlob(canvas, 0.5);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
