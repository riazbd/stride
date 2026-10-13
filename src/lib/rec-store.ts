"use client";
// Keeps the activity being recorded on the phone itself (IndexedDB), so a
// crashed, killed or reloaded tab doesn't lose it. One record, written every few
// seconds while recording and kept until the activity has been uploaded.

const DB = "stride-recorder";
const STORE = "recording";
const KEY = "active";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const available = () => typeof indexedDB !== "undefined";

export async function saveRecording(snapshot: unknown): Promise<void> {
  if (!available()) return;
  try {
    await run("readwrite", (s) => s.put(snapshot, KEY));
  } catch (e) {
    console.warn("[recorder] could not save the recording to this device", e);
  }
}

export async function loadRecording<T>(): Promise<T | null> {
  if (!available()) return null;
  try {
    return ((await run("readonly", (s) => s.get(KEY))) as T | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearRecording(): Promise<void> {
  if (!available()) return;
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch { /* nothing stored */ }
}
