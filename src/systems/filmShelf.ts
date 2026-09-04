/**
 * The shelf: films this device has opened before, and can open again.
 *
 * ---------------------------------------------------------------------------
 * **A browser cannot keep your file, and should not be able to.** Choosing a
 * file grants a page temporary access to it, and that access dies with the
 * tab — which is exactly right, because the alternative is a website that can
 * read your disk whenever it likes.
 *
 * So the second night begins the way the first did: a dialog, a folder, and
 * a hunt for the film you were watching yesterday. Nothing is broken about
 * that; it is just the wrong amount of work for the wrong moment, which is the
 * two of you sitting down and wanting to start.
 *
 * The File System Access API is the way through. A *handle* is a bookmark to
 * a file rather than the file itself: it can be stored, it survives the tab
 * closing, and it grants nothing on its own — coming back to it asks the
 * person again, once, with a click. Nothing about the security bargain
 * changes; what changes is that the click replaces the hunt.
 *
 * **It is Chromium-only, and this file is written to be absent rather than
 * broken.** Safari and Firefox have no handles, `canRemember` says so, and
 * every way in falls back to the ordinary file dialog that has always worked.
 * A shelf that half-works would be worse than no shelf: the whole value is
 * being able to trust the one button.
 *
 * Nothing here is shared. What is on your shelf is a fact about your machine,
 * like the volume faders and where the miniature was put down.
 * ---------------------------------------------------------------------------
 */

/*
  The handle's shape, named here rather than relied on from the DOM library.

  `FileSystemFileHandle` and `showOpenFilePicker` land in TypeScript's DOM
  types on their own schedule, and a build that fails because a library version
  moved is a poor trade for four lines. Only what is used is described.
*/
interface Handle {
  readonly name: string
  getFile(): Promise<File>
  queryPermission?(options: { mode: 'read' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'read' }): Promise<PermissionState>
  isSameEntry?(other: Handle): Promise<boolean>
}

type Picker = (options: {
  multiple?: boolean
  types?: { description: string; accept: Record<string, string[]> }[]
}) => Promise<Handle[]>

function picker(): Picker | null {
  const host = globalThis as unknown as { showOpenFilePicker?: Picker }
  return typeof host.showOpenFilePicker === 'function' ? host.showOpenFilePicker : null
}

/** Whether this browser can be asked to remember a film at all. */
export function canRemember(): boolean {
  return picker() !== null && typeof indexedDB !== 'undefined'
}

/** A film on the shelf: enough to recognise it, and the way back to it. */
export interface Shelved {
  /** The fingerprint of the file, which is also how the anchor names it. */
  print: string
  title: string
  name: string
  size: number
  /** When it was last put on, so the shelf reads newest-first. */
  at: number
  handle: Handle
}

// ---------------------------------------------------------------------------
// Where it is kept
// ---------------------------------------------------------------------------

const DB = 'garden-shelf'
const STORE = 'films'

/*
  IndexedDB, because it is the only store that can hold a handle.

  `localStorage` is strings, and a handle is not one — it is an object the
  browser hands out and takes back, and structured clone is the only thing that
  keeps it a handle. That is the whole reason this file reaches for a database
  to store four fields.
*/
function open(): Promise<IDBDatabase | null> {
  return new Promise((settle) => {
    try {
      const ask = indexedDB.open(DB, 1)
      ask.onupgradeneeded = () => {
        const db = ask.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'print' })
      }
      ask.onsuccess = () => settle(ask.result)
      // A private window, a full disk, a browser with storage switched off.
      // The shelf is a convenience and is allowed to simply not be there.
      ask.onerror = () => settle(null)
      ask.onblocked = () => settle(null)
    } catch {
      settle(null)
    }
  })
}

function done<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((settle) => {
    request.onsuccess = () => settle(request.result)
    request.onerror = () => settle(null)
  })
}

export async function shelve(film: Omit<Shelved, 'at'>): Promise<void> {
  const db = await open()
  if (!db) return
  try {
    const put = db.transaction(STORE, 'readwrite').objectStore(STORE)
    await done(put.put({ ...film, at: Date.now() }))
  } catch {
    /* A handle that will not clone is a handle we simply do not keep. */
  } finally {
    db.close()
  }
}

export async function shelfFor(print: string | null): Promise<Shelved | null> {
  if (print === null) return null
  const db = await open()
  if (!db) return null
  try {
    const got = await done<Shelved>(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(print) as IDBRequest<Shelved>,
    )
    return got ?? null
  } catch {
    return null
  } finally {
    db.close()
  }
}

/** What was watched most recently, newest first. */
export async function recent(limit = 5): Promise<Shelved[]> {
  const db = await open()
  if (!db) return []
  try {
    const all = await done<Shelved[]>(
      db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<Shelved[]>,
    )
    return (all ?? []).sort((a, b) => b.at - a.at).slice(0, limit)
  } catch {
    return []
  } finally {
    db.close()
  }
}

export async function forget(print: string): Promise<void> {
  const db = await open()
  if (!db) return
  try {
    await done(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(print))
  } catch {
    /* nothing to do about it */
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Asking for it back
// ---------------------------------------------------------------------------

const FILMS = {
  description: 'Films',
  accept: {
    'video/*': ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'] as string[],
  },
}

/**
 * The file dialog, in the form that hands back something worth keeping.
 *
 * Returns null when the person closes the dialog, which is not an error and
 * must not be reported as one — half of all file pickers are opened and shut
 * again.
 *
 * **Must be called from a click.** Every browser requires a gesture to open a
 * file dialog, which is why this is reached from a button and never from an
 * effect.
 */
export async function askForFilm(): Promise<{ file: File; handle: Handle } | null> {
  const ask = picker()
  if (!ask) return null
  try {
    const [handle] = await ask({ multiple: false, types: [FILMS] })
    if (!handle) return null
    return { file: await handle.getFile(), handle }
  } catch {
    // AbortError when it is dismissed, and anything else is the same to us:
    // no file was chosen, and the ordinary picker is still sitting there.
    return null
  }
}

/**
 * The file behind a shelved film, asking for permission if it needs to.
 *
 * ---------------------------------------------------------------------------
 * Three answers, and they are genuinely different:
 *
 * - **The file.** Permission was already granted this session, or was granted
 *   just now by the click that called this.
 * - **`null`, and the shelf keeps it.** Permission was refused. Nothing is
 *   wrong; they can press it again, or choose the file the long way.
 * - **`null`, and the shelf lets it go.** The file is not there any more —
 *   moved, renamed, deleted, or on a drive that is not plugged in. A shelf
 *   that keeps offering a film that cannot be opened is worse than an empty
 *   one, so it forgets it and the row disappears.
 *
 * **Must be called from a click**, for the same reason as `askForFilm`:
 * `requestPermission` is gated on a gesture.
 * ---------------------------------------------------------------------------
 */
export async function fileFrom(film: Shelved): Promise<File | null> {
  try {
    /*
      Only a handle that *has* a permission gate is put through one.

      Not every handle comes from the file picker — the origin's own storage
      hands out handles with no `queryPermission` at all, because there is
      nobody to ask: it is already this site's. Treating a missing method as a
      refusal would turn "always allowed" into "always denied", which is the
      wrong way round and silently.
    */
    const held = film.handle
    if (typeof held.queryPermission === 'function') {
      let state = await held.queryPermission({ mode: 'read' })
      if (state !== 'granted' && typeof held.requestPermission === 'function') {
        state = await held.requestPermission({ mode: 'read' })
      }
      if (state !== 'granted') return null
    }
    return await held.getFile()
  } catch {
    /*
      `getFile` throws `NotFoundError` for a file that has gone. Permission
      trouble does not reach here — it is answered above — so this is the
      "it is not there any more" case, and the row goes with it.
    */
    void forget(film.print)
    return null
  }
}
