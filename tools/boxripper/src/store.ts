// IndexedDB persistence. Photos are large (data URLs), so localStorage won't do.
// We keep a single snapshot under one key and overwrite it on every change.
import type { Project } from './types';

export interface StoredPhoto {
  id: string;
  dataUrl: string;
  name?: string;
}

export interface Snapshot {
  photos: StoredPhoto[];
  project: Project;
  modelName?: string;
}

const DB_NAME = 'boxripper';
const STORE = 'snapshot';
const KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function writeSnapshot(snapshot: Snapshot | null): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (snapshot) store.put(snapshot, KEY);
      else store.delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function saveSnapshot(snapshot: Snapshot): Promise<void> {
  return writeSnapshot(snapshot);
}

export function clearSnapshot(): Promise<void> {
  return writeSnapshot(null);
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  const db = await openDB();
  try {
    return await new Promise<Snapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Snapshot) ?? null);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
