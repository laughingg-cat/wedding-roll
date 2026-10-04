import type { PresetId } from "@/features/shared/domain";

const DATABASE = "our-wedding-roll";
const STORE = "pending-captures";
const CURRENT_KEY = "current";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PendingCapture = {
  blob: Blob;
  preset: PresetId;
  createdAt: string;
  reservation?: {
    photoId: string;
    upload: { path: string; token: string };
    expiresAt?: string;
  };
  uploaded?: boolean;
};

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePendingCapture(capture: PendingCapture) {
  const db = await database();
  try {
    const transaction = db.transaction(STORE, "readwrite");
    await requestResult(transaction.objectStore(STORE).put(capture, CURRENT_KEY));
  } finally {
    db.close();
  }
}

export async function clearPendingCapture() {
  const db = await database();
  try {
    const transaction = db.transaction(STORE, "readwrite");
    await requestResult(transaction.objectStore(STORE).delete(CURRENT_KEY));
  } finally {
    db.close();
  }
}

export async function loadPendingCapture(now = new Date()): Promise<PendingCapture | null> {
  const db = await database();
  let result: PendingCapture | undefined;
  try {
    const transaction = db.transaction(STORE, "readonly");
    result = await requestResult(transaction.objectStore(STORE).get(CURRENT_KEY));
  } finally {
    db.close();
  }
  if (!result) return null;
  const created = Date.parse(result.createdAt);
  if (!Number.isFinite(created) || now.getTime() - created > MAX_AGE_MS) {
    await clearPendingCapture();
    return null;
  }
  return result;
}
