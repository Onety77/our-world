/**
 * Where the mock keeps photographs.
 *
 * ---------------------------------------------------------------------------
 * **Not localStorage, and this is not a preference.**
 *
 * Everything else the local layer stores is a few kilobytes of JSON and goes in
 * localStorage, which is simple and synchronous and entirely adequate for it.
 * A photograph is two hundred kilobytes of binary, and localStorage holds
 * strings — so a picture would have to be base64'd, growing it by a third, into
 * a store with a five-megabyte ceiling that is shared with the rest of the
 * garden. Twenty memories and the whole thing starts throwing QuotaExceeded on
 * writes that have nothing to do with pictures, which is a genuinely horrible
 * way for a garden to break.
 *
 * IndexedDB holds Blobs as Blobs and is measured in hundreds of megabytes. It
 * is also asynchronous, which is why `pictureUrl` on the seam is a promise
 * even though the real layer would have needed one anyway.
 * ---------------------------------------------------------------------------
 *
 * Object URLs handed out here are cached and never revoked while the tab
 * lives: the same picture is asked for every time its pane comes near, and a
 * URL revoked while an `<img>` still points at it turns into a broken image
 * with no error anywhere.
 */

const DB = 'garden:pictures'
const STORE = 'display'

let open: Promise<IDBDatabase> | null = null

function database(): Promise<IDBDatabase> {
  if (open) return open
  open = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so pictures cannot be kept locally.'))
      return
    }
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB would not open.'))
    // A tab left open on an older version blocks the upgrade. Say so rather
    // than hanging: a promise that never settles looks like a slow network.
    request.onblocked = () =>
      reject(new Error('Another tab has the garden open on an older version. Close it.'))
  })
  return open
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = work(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB refused.'))
      }),
  )
}

export function putPicture(key: string, blob: Blob): Promise<void> {
  return run('readwrite', (store) => store.put(blob, key)).then(() => undefined)
}

const urls = new Map<string, string>()

/**
 * An object URL for a stored picture.
 *
 * Rejects if the key is not there, rather than resolving to a blank. A picture
 * that silently becomes an empty frame is the one failure this place must not
 * have — the whole point of it is that these are the things that cannot be
 * made again, so it has to say when one has gone.
 */
export async function pictureFromStore(key: string): Promise<string> {
  const had = urls.get(key)
  if (had) return had
  const blob = await run<Blob | undefined>('readonly', (store) => store.get(key))
  if (!blob) throw new Error('That picture is not in this device.')
  const url = URL.createObjectURL(blob)
  urls.set(key, url)
  return url
}

/**
 * Delete one, for good.
 *
 * The object URL goes with it — a revoked URL in an `<img>` that is still on
 * screen becomes a broken image with no error anywhere, so this is only ever
 * called for a memory that is being taken out of the building in the same
 * breath.
 */
export async function forgetPicture(key: string): Promise<void> {
  const had = urls.get(key)
  if (had) {
    URL.revokeObjectURL(had)
    urls.delete(key)
  }
  await run('readwrite', (store) => store.delete(key))
}

/** For the control room's "start again", which wipes the rest of the mock too. */
export async function forgetPictures(): Promise<void> {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  await run('readwrite', (store) => store.clear())
}
