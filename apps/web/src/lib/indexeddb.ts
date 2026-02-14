export type IndexedDbConfig = {
  dbName: string;
  storeName: string;
  version?: number;
};

const DEFAULT_DB_VERSION = 1;

function isIndexedDbAvailable() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openIndexedDb(config: IndexedDbConfig): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(config.dbName, config.version ?? DEFAULT_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(config.storeName)) {
        db.createObjectStore(config.storeName);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };
  });
}

export async function getIndexedDbValue<T>(
  config: IndexedDbConfig,
  key: IDBValidKey,
  validate?: (value: unknown) => value is T,
): Promise<T | null> {
  if (!isIndexedDbAvailable()) return null;

  let db: IDBDatabase | undefined;
  try {
    db = await openIndexedDb(config);
    const openDb = db;
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = openDb.transaction(config.storeName, "readonly");
      const store = tx.objectStore(config.storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to read IndexedDB value"));
    });

    if (value == null) return null;
    if (!validate) return value as T;
    return validate(value) ? value : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function setIndexedDbValue<T>(
  config: IndexedDbConfig,
  key: IDBValidKey,
  value: T,
): Promise<boolean> {
  if (!isIndexedDbAvailable()) return false;

  let db: IDBDatabase | undefined;
  try {
    db = await openIndexedDb(config);
    const openDb = db;
    await new Promise<void>((resolve, reject) => {
      const tx = openDb.transaction(config.storeName, "readwrite");
      const store = tx.objectStore(config.storeName);
      store.put(value, key);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to write IndexedDB value"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
    });
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

export async function removeIndexedDbValue(
  config: IndexedDbConfig,
  key: IDBValidKey,
): Promise<boolean> {
  if (!isIndexedDbAvailable()) return false;

  let db: IDBDatabase | undefined;
  try {
    db = await openIndexedDb(config);
    const openDb = db;
    await new Promise<void>((resolve, reject) => {
      const tx = openDb.transaction(config.storeName, "readwrite");
      const store = tx.objectStore(config.storeName);
      store.delete(key);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to delete IndexedDB value"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB delete aborted"));
    });
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
