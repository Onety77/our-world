/** Binary storage for local-mode voice lights. See pictures.ts for the same law. */

const DB = 'garden:voice-lights'
const STORE = 'clips'

let opening: Promise<IDBDatabase> | null = null

function database(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser cannot keep recordings on this device.'))
      return
    }
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Recordings could not be opened.'))
    request.onblocked = () =>
      reject(new Error('Another tab has an older version of the Stars open. Close it.'))
  })
  return opening
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('The recording could not be stored.'))
      }),
  )
}

const urls = new Map<string, string>()

export function putVoiceClip(key: string, blob: Blob): Promise<void> {
  return run('readwrite', (store) => store.put(blob, key)).then(() => undefined)
}

export async function voiceClipFromStore(key: string): Promise<string> {
  const existing = urls.get(key)
  if (existing) return existing
  const blob = await run<Blob | undefined>('readonly', (store) => store.get(key))
  if (!blob) throw new Error('That voice-light is not on this device.')
  const url = URL.createObjectURL(blob)
  urls.set(key, url)
  return url
}

export async function forgetVoiceClip(key: string): Promise<void> {
  const url = urls.get(key)
  if (url) URL.revokeObjectURL(url)
  urls.delete(key)
  await run('readwrite', (store) => store.delete(key))
}

export async function forgetVoiceClips(): Promise<void> {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  await run('readwrite', (store) => store.clear())
}
