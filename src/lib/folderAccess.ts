/**
 * File System Access helpers — picking and remembering the destination folder.
 *
 * A `FileSystemDirectoryHandle` cannot be serialized to a string, so it can't
 * live in the RxDB `settings` collection (which only stores string values).
 * We persist the handle itself in a dedicated IndexedDB store via structured
 * clone (mirroring the legacy `certNfseDir` store) and keep the human-readable
 * folder NAME in RxDB so the UI can show it reactively even before the user
 * re-grants permission after a browser restart.
 */

const DIR_IDB = 'baixarnfseDir';
const DIR_STORE = 'handles';
const DIR_KEY = 'syncFolder';

// `queryPermission` / `requestPermission` are part of the File System Access
// spec but aren't in the standard TS DOM lib, so we narrow them here.
type PermissionMode = 'read' | 'readwrite';
interface DirHandleWithPermissions extends FileSystemDirectoryHandle {
  queryPermission?: (opts: { mode: PermissionMode }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: PermissionMode }) => Promise<PermissionState>;
}

interface WindowWithPicker extends Window {
  showDirectoryPicker?: (opts?: { mode: PermissionMode }) => Promise<FileSystemDirectoryHandle>;
}

/** True when the browser exposes the File System Access directory picker (Chrome/Edge). */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as WindowWithPicker).showDirectoryPicker === 'function';
}

function openDirIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DIR_IDB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DIR_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist the directory handle so it survives reloads / browser restarts. */
export async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDirIDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, 'readwrite');
      tx.objectStore(DIR_STORE).put(handle, DIR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Load the previously chosen directory handle, or `null` if none was saved. */
export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDirIDB();
  try {
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, 'readonly');
      const req = tx.objectStore(DIR_STORE).get(DIR_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Forget the remembered directory handle. */
export async function clearDirHandle(): Promise<void> {
  const db = await openDirIDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, 'readwrite');
      tx.objectStore(DIR_STORE).delete(DIR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Ensure we hold write permission on `handle`, prompting the user if needed.
 * Must be called from within a user gesture for the request to be allowed.
 */
export async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as DirHandleWithPermissions;
  if (!h.queryPermission || !h.requestPermission) return true; // older browsers grant implicitly
  let perm = await h.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') perm = await h.requestPermission({ mode: 'readwrite' });
  return perm === 'granted';
}

/** Outcome of a folder-pick attempt. */
export type PickFolderResult =
  | { ok: true; handle: FileSystemDirectoryHandle; name: string }
  | { ok: false; cancelled: boolean; error?: string };

/**
 * Open the native directory picker, persist the chosen handle, and return its
 * name. Distinguishes a user cancel (AbortError) from a real failure so the
 * caller can stay quiet on cancel.
 */
export async function pickFolder(): Promise<PickFolderResult> {
  if (!isFileSystemAccessSupported()) {
    return { ok: false, cancelled: false, error: 'Seu navegador não suporta escolher a pasta aqui (use o Chrome).' };
  }
  try {
    const handle = await (window as WindowWithPicker).showDirectoryPicker!({ mode: 'readwrite' });
    await saveDirHandle(handle);
    return { ok: true, handle, name: handle.name };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, cancelled: true };
    }
    return { ok: false, cancelled: false, error: err instanceof Error ? err.message : String(err) };
  }
}
