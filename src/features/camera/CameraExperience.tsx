"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, Images, RefreshCw, SwitchCamera, X } from "lucide-react";

import { clearPendingCapture, loadPendingCapture, type PendingCapture } from "@/features/camera/pending-capture";
import type { PresetId } from "@/features/shared/domain";

type Capture = { blob: Blob; previewUrl: string };

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: "original", label: "Original" },
  { id: "portra_400", label: "Portra 400" },
  { id: "quicksnap", label: "QuickSnap" },
  { id: "cinestill_800t", label: "800T" },
  { id: "hp5_plus", label: "HP5+" },
];

async function defaultStartCamera(facingMode: "environment" | "user") {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera unsupported");
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facingMode }, width: { ideal: 2400 }, height: { ideal: 1800 } },
  });
}

function canvasCapture(video: HTMLVideoElement) {
  return new Promise<Capture>((resolve, reject) => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return reject(new Error("Camera is still starting"));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return reject(new Error("Camera capture is unavailable"));
    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => blob ? resolve({ blob, previewUrl: URL.createObjectURL(blob) }) : reject(new Error("Could not capture photo")),
      "image/jpeg",
      0.92,
    );
  });
}

async function loadStoredPendingCapture() {
  if (typeof indexedDB === "undefined") return null;
  return loadPendingCapture();
}

function createObjectPreviewUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}

export function CameraExperience({
  shotsRemaining: initialShots,
  startCamera = defaultStartCamera,
  captureFrame,
  uploadCapture,
  loadPending = loadStoredPendingCapture,
  createPreviewUrl = createObjectPreviewUrl,
  clearPending = clearPendingCapture,
}: {
  shotsRemaining: number;
  startCamera?: (facingMode: "environment" | "user") => Promise<MediaStream | null>;
  captureFrame?: () => Promise<Capture>;
  uploadCapture: (blob: Blob, preset: PresetId, recovered?: PendingCapture | null) => Promise<{ photoId: string }>;
  loadPending?: () => Promise<PendingCapture | null>;
  createPreviewUrl?: (blob: Blob) => string;
  clearPending?: () => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [preset, setPreset] = useState<PresetId>("original");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [shotsRemaining, setShotsRemaining] = useState(initialShots);
  const [status, setStatus] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [recoveredPending, setRecoveredPending] = useState<PendingCapture | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPending().then((pending) => {
      if (cancelled || !pending) return;
      setPreset(pending.preset);
      setRecoveredPending(pending);
      setCapture({ blob: pending.blob, previewUrl: createPreviewUrl(pending.blob) });
      setStatus("Recovered photo — ready to upload");
    });
    return () => {
      cancelled = true;
    };
  }, [createPreviewUrl, loadPending]);

  useEffect(() => {
    let cancelled = false;
    startCamera(facingMode)
      .then((stream) => {
        if (cancelled || !stream) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancelled) setCameraUnavailable(true);
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facingMode, startCamera]);

  function releasePreview() {
    if (capture?.previewUrl.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(capture.previewUrl);
    }
  }

  async function takePhoto() {
    setStatus("");
    try {
      if (recoveredPending) await clearPending();
      setRecoveredPending(null);
      const next = captureFrame ? await captureFrame() : await canvasCapture(videoRef.current!);
      setCapture(next);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not take photo");
    }
  }

  function useNativeCapture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (recoveredPending) void clearPending();
    setRecoveredPending(null);
    setCapture({ blob: file, previewUrl: URL.createObjectURL(file) });
  }

  async function confirmPhoto() {
    if (!capture || uploading) return;
    setUploading(true);
    setStatus("Saving your photo…");
    try {
      await uploadCapture(capture.blob, preset, recoveredPending);
      releasePreview();
      setCapture(null);
      setRecoveredPending(null);
      setShotsRemaining((count) => Math.max(0, count - 1));
      setStatus(`Uploaded — ${Math.max(0, shotsRemaining - 1)} shots left`);
    } catch (error) {
      // runCaptureUpload persists its reservation before networking. Reload it
      // so tapping Use Photo again in this mounted screen resumes the same ID.
      try { setRecoveredPending(await loadPending()); } catch { /* keep the visible capture retryable */ }
      setStatus(error instanceof Error ? error.message : "Upload paused. Your photo is safe on this phone.");
    } finally {
      setUploading(false);
    }
  }

  if (capture) {
    return (
      <main className="camera-shell camera-confirmation">
        <div className="camera-topbar camera-topbar-light">
          <button className="icon-button" aria-label="Discard photo" onClick={() => { releasePreview(); setCapture(null); if (recoveredPending) void clearPending(); setRecoveredPending(null); }}><X /></button>
          <span>{shotsRemaining} shots left</span>
          <span className="topbar-spacer" />
        </div>
        {/* Blob URLs require a native image element. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`confirmation-image preset-${preset}`} src={capture.previewUrl} alt={`${PRESETS.find((item) => item.id === preset)?.label} preview`} />
        <div className="confirmation-actions">
          <button className="secondary-button" onClick={() => { releasePreview(); setCapture(null); if (recoveredPending) void clearPending(); setRecoveredPending(null); }}>Retake</button>
          <button className="primary-button" disabled={uploading} onClick={confirmPhoto}>{uploading ? "Uploading…" : "Use Photo"}</button>
        </div>
        <p className="camera-status" role="status">{status}</p>
      </main>
    );
  }

  return (
    <main className="camera-shell">
      <video ref={videoRef} className={`camera-video preset-${preset}`} autoPlay muted playsInline aria-label="Live camera preview" />
      <div className="camera-vignette" aria-hidden="true" />
      <div className="camera-topbar">
        <a href="/gallery" className="icon-button" aria-label="Open gallery"><Images /></a>
        <span>{shotsRemaining} shots left</span>
        <button className="icon-button" aria-label="Switch camera" onClick={() => { setCameraUnavailable(false); setFacingMode((mode) => mode === "environment" ? "user" : "environment"); }}><SwitchCamera /></button>
      </div>

      {cameraUnavailable ? (
        <section className="camera-fallback">
          <Camera size={34} strokeWidth={1.4} aria-hidden="true" />
          <h1>Camera access is unavailable</h1>
          <p>Live camera preview needs an HTTPS link. This local Wi-Fi test uses HTTP, so use your phone’s camera below or open an HTTPS preview.</p>
          <label className="native-capture-button">
            Use your phone camera instead
            <input type="file" accept="image/jpeg,image/*" capture="environment" onChange={useNativeCapture} />
          </label>
        </section>
      ) : null}

      <div className="camera-controls">
        <div className="preset-rail" aria-label="Film presets">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              className={`preset-option ${preset === item.id ? "selected" : ""}`}
              aria-pressed={preset === item.id}
              onClick={() => setPreset(item.id)}
            >
              <span className={`preset-swatch preset-${item.id}`} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <button className="shutter-button" aria-label="Take photo" onClick={takePhoto} disabled={shotsRemaining === 0 || cameraUnavailable}>
          <span />
        </button>
        <p className="camera-status" role="status">{status}</p>
      </div>
      <RefreshCw className="camera-grain-mark" size={13} aria-hidden="true" />
    </main>
  );
}
