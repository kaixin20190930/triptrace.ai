import type { Memory } from "./memory-types";

const DB_NAME = "triptrace-drafts";
const DB_VERSION = 1;
const STORE_NAME = "capture-drafts";
const DRAFT_KEY = "pending-create";

export type StoredDraftPhoto = {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
};

export type StoredCaptureDraft = {
  moment: string;
  place: string;
  mood: string;
  memory: Memory | null;
  files: StoredDraftPhoto[];
  exifCandidate?: {
    filename: string;
    capturedAt: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  confirmedEventDate?: string;
  latitude?: number | null;
  longitude?: number | null;
  factsConfirmed: boolean;
  savedState: "idle" | "cloud" | "local";
  updatedAt: string;
};

type DraftRecord = {
  key: string;
  draft: StoredCaptureDraft;
};

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    Promise.resolve(handler(store))
      .then((result) => {
        transaction.oncomplete = () => {
          db.close();
          resolve(result);
        };
      })
      .catch((error) => {
        db.close();
        reject(error);
      });
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function loadCaptureDraft(): Promise<StoredCaptureDraft | null> {
  const record = await withStore<DraftRecord | undefined>("readonly", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(DRAFT_KEY);
      request.onsuccess = () => resolve(request.result as DraftRecord | undefined);
      request.onerror = () => reject(request.error);
    });
  });
  return record?.draft ?? null;
}

export async function saveCaptureDraft(draft: StoredCaptureDraft): Promise<void> {
  await withStore("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put({ key: DRAFT_KEY, draft } satisfies DraftRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

export async function clearCaptureDraft(): Promise<void> {
  await withStore("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(DRAFT_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}
