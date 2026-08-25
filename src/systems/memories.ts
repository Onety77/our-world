/**
 * Every memory, and which one is open.
 *
 * Fed by exactly one watcher, mounted in App for the life of the session —
 * because the Glasshouse is not the only thing that needs to know. Its landmark
 * out in the garden is built from the same list: how much of the building
 * exists, and what colour its glass is, is *the memory count and their tints*,
 * so a preview that did not read them would be a guess that drifts.
 *
 * One listener rather than one per reader, for the reason the conversation has
 * one: this is a live subscription against a real backend, and a component
 * mounting a second copy of it is a second read of everything.
 */

import { create } from 'zustand'
import type { Memory } from '@/data/types'

interface MemoriesState {
  /** Oldest first, always. A pane's place in the building is its index here. */
  all: Memory[]
  /** False until the first answer arrives — see the note on `nothing` below. */
  loaded: boolean
  /** The one being looked at, or null. */
  openId: string | null
  /** True while a picture is being prepared and hung. */
  hanging: boolean
  /**
   * The one hung a moment ago, which is still forming.
   *
   * Held here rather than worked out from `at` being recent, because that
   * would also fire for *her* memory arriving while you stand in the building —
   * and a pane forming in front of you should mean you just made it. Hers
   * simply appears, which is honest: it formed hours ago, somewhere else.
   */
  formingId: string | null

  setAll(all: Memory[]): void
  open(id: string | null): void
  setHanging(hanging: boolean): void
  forming(id: string | null): void
}

export const useMemories = create<MemoriesState>((set) => ({
  all: [],
  loaded: false,
  openId: null,
  hanging: false,
  formingId: null,

  setAll: (all) => set({ all, loaded: true }),
  open: (openId) => set({ openId }),
  setHanging: (hanging) => set({ hanging }),
  forming: (formingId) => set({ formingId }),
}))

/**
 * Whether the Glasshouse is genuinely empty, as opposed to not answered yet.
 *
 * These are not the same thing and the difference is the whole of an honest
 * state. "Nothing here yet — the first picture either of you leaves builds the
 * first pane" is a lovely thing to read on your first visit and a lie to show
 * somebody with two years of photographs and a slow connection.
 */
export function nothingYet(): boolean {
  const { all, loaded } = useMemories.getState()
  return loaded && all.length === 0
}

/** One memory by id, or null. Never throws on an id that has gone. */
export function memoryById(all: Memory[], id: string | null): Memory | null {
  if (!id) return null
  return all.find((m) => m.id === id) ?? null
}
