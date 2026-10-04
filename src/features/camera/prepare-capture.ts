export const MAX_UPLOAD_EDGE = 2000;
export const UPLOAD_JPEG_QUALITY = 0.85;

type DecodedCapture = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
};

export type CapturePreparationDependencies = {
  decode(blob: Blob): Promise<DecodedCapture>;
  encode(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob>;
};

export function calculateUploadDimensions(width: number, height: number, maxEdge = MAX_UPLOAD_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeInBrowser(blob: Blob): Promise<DecodedCapture> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this photo"));
    };
    image.src = url;
  });
}

function encodeInBrowser(source: CanvasImageSource, width: number, height: number, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return reject(new Error("Photo preparation is unavailable"));
    context.drawImage(source, 0, 0, width, height);
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Could not prepare this photo")),
      "image/jpeg",
      quality,
    );
  });
}

const browserDependencies: CapturePreparationDependencies = {
  decode: decodeInBrowser,
  encode: encodeInBrowser,
};

export async function prepareCaptureForUpload(
  blob: Blob,
  dependencies: CapturePreparationDependencies = browserDependencies,
) {
  const decoded = await dependencies.decode(blob);
  try {
    const dimensions = calculateUploadDimensions(decoded.width, decoded.height);
    const prepared = await dependencies.encode(
      decoded.source,
      dimensions.width,
      dimensions.height,
      UPLOAD_JPEG_QUALITY,
    );
    // Always return the canvas output. Besides reducing large phone captures,
    // this guarantees the upload really is a JPEG even when the input came
    // from a native picker as PNG, WebP, or another browser-decodable format.
    return prepared;
  } finally {
    decoded.release();
  }
}
