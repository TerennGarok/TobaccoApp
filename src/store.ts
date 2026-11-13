// Document library persisted in IndexedDB (fully on-device).

export interface DocMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  size: number;
  pages: number;
  thumb?: string;
}

const DB_NAME = 'pocketpdf';
const DB_VER = 1;
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(stores, mode);
        const r = fn(t);
        t.oncomplete = () => resolve(r ? (r.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function listDocs(): Promise<DocMeta[]> {
  const all = await tx<DocMeta[]>(['meta'], 'readonly', (t) => t.objectStore('meta').getAll());
  return (all || []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDocBytes(id: string): Promise<Uint8Array | null> {
  const v = await tx<any>(['files'], 'readonly', (t) => t.objectStore('files').get(id));
  if (!v) return null;
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

export async function getMeta(id: string): Promise<DocMeta | null> {
  return (await tx<DocMeta>(['meta'], 'readonly', (t) => t.objectStore('meta').get(id))) || null;
}

export async function saveDoc(meta: DocMeta, bytes: Uint8Array) {
  meta.size = bytes.byteLength;
  await tx(['meta', 'files'], 'readwrite', (t) => {
    t.objectStore('meta').put(meta);
    t.objectStore('files').put(bytes, meta.id);
  });
}

export async function updateMeta(meta: DocMeta) {
  await tx(['meta'], 'readwrite', (t) => {
    t.objectStore('meta').put(meta);
  });
}

export async function deleteDoc(id: string) {
  await tx(['meta', 'files'], 'readwrite', (t) => {
    t.objectStore('meta').delete(id);
    t.objectStore('files').delete(id);
  });
}

export function requestPersistence() {
  try {
    (navigator as any).storage?.persist?.();
  } catch {
    /* ignore */
  }
}
