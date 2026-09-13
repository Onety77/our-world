import { useEffect, useRef } from 'react'

type Entry = { id: number; order: number; priority: number; active: boolean; pushed: boolean; consumed: boolean; close(): void | boolean }
const entries = new Map<number, Entry>()
let nextId = Date.now()
let current: number | null = null
let travelling = false
let scheduled = false
let nextOrder = 1

// Removed parents remain until history reaches them, so Back never lands on a
// dead layer. New layers wait for asynchronous cleanup before pushing entries.
function reconcile() {
  scheduled = false
  if (travelling) return
  const top = current === null ? undefined : entries.get(current)
  if (top && (!top.active || top.consumed)) {
    travelling = true
    window.history.back()
    return
  }
  const waiting = [...entries.values()]
    .filter(entry => entry.active && !entry.pushed && !entry.consumed)
    .sort((a, b) => a.priority - b.priority || a.id - b.id)
  for (const entry of waiting) {
    window.history.pushState({ ...window.history.state, backstop: entry.id }, '')
    entry.pushed = true
    entry.order = nextOrder++
    current = entry.id
  }
}

function schedule() {
  if (scheduled) return
  scheduled = true
  // Let React finish replacing layers before changing browser history.
  window.setTimeout(reconcile, 0)
}

if (typeof window !== 'undefined') {
  // A reload starts a fresh UI. Its current entry becomes that UI's base,
  // rather than masquerading as a layer owned by the previous JS session.
  if (window.history.state?.backstop !== undefined) {
    const { backstop: _old, ...rest } = window.history.state
    window.history.replaceState(Object.keys(rest).length ? rest : null, '')
  }
  window.addEventListener('popstate', () => {
    const previous = current === null ? undefined : entries.get(current)
    const target = window.history.state?.backstop as number | undefined
    current = target ?? null
    const cleanup = travelling
    travelling = false
    if (!cleanup && previous?.active && !previous.consumed && (entries.get(target ?? -1)?.order ?? 0) < previous.order) {
      previous.pushed = false
      previous.consumed = true
      // A pending write can decline dismissal without losing its Back boundary.
      if (previous.close() === false) previous.consumed = false
    }
    schedule()
  })
}

/** Native Back dismisses the top layer. Buttons retire the same history entry. */
export function useBackCloses(open: boolean, close: () => void | boolean, priority = 30): void {
  const latest = useRef(close)
  latest.current = close
  const generation = useRef(0)
  const owned = useRef<Entry | null>(null)
  useEffect(() => {
    if (!open) return
    const turn = ++generation.current
    const entry = owned.current ?? {
      id: nextId++, order: 0, priority, active: true, pushed: false, consumed: false,
      close: () => latest.current(),
    }
    owned.current = entry
    entries.set(entry.id, entry)
    schedule()
    return () => queueMicrotask(() => {
      // Strict Mode immediately replays setup and still owns the same entry.
      if (generation.current !== turn) return
      owned.current = null
      entry.active = false
      // Retain only the lightweight tombstone for browser Forward; release the
      // callback so old components and their data are not held by history.
      entry.close = () => {}
      schedule()
    })
  }, [open, priority])
}
