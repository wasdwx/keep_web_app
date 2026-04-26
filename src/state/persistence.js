import { sanitizeState, toStorageState } from './serializers.js';

const STORAGE_KEY = 'keep-web-app:state:v1';
const DB_NAME = 'keep-web-app';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, run) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let settled = false;

    const safeResolve = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const safeReject = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const result = run(store, safeResolve, safeReject);

    transaction.oncomplete = () => {
      if (mode === 'readwrite' && !settled) {
        safeResolve(result);
      }
      db.close();
    };

    transaction.onerror = () => {
      safeReject(transaction.error);
      db.close();
    };
  });
}
export function loadState(defaults) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    return sanitizeState(JSON.parse(raw), defaults);
  } catch (error) {
    console.warn('Failed to load state from localStorage:', error);
    return defaults;
  }
}

export function hasSavedState() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save state to localStorage:', error);
  }
}

export async function saveAssetBlob(blob, meta = {}) {
  const id = `asset-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const record = {
    id,
    blob,
    name: meta.name ?? id,
    type: meta.type ?? blob.type ?? 'application/octet-stream',
    slot: meta.slot ?? 'generic',
    updatedAt: Date.now(),
  };

  await withStore('readwrite', (store) => {
    store.put(record);
  });

  return record;
}

export async function getAssetRecord(id) {
  if (!id) {
    return null;
  }

  return withStore('readonly', (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAssetBlob(id) {
  const record = await getAssetRecord(id);
  return record?.blob ?? null;
}

export function exportStorageState(state, defaults) {
  return toStorageState(state, defaults);
}
