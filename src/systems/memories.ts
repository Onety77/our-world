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
import { PictureTrouble, pickPicture, prepare, type Prepared } from './picture'
import { useTrouble } from './trouble'

interface MemoriesState {
  /**
   * Oldest first, always, **including the ones that have been taken out.**
   *
   * A pane's place in the building is its index in this list, so a removed
   * memory has to keep its place in it — see `Memory.removed`. Anything that
   * *draws* or *counts* wants `standing()` instead; anything that needs a
   * memory's slot must index against this.
   */
  all: Memory[]
  /** False until the first answer arrives — see the note on `nothing` below. */
  loaded: boolean
  /** The one being looked at, or null. */
  openId: string | null
  /** True while a picture is being prepared and hung. */
  hanging: boolean
  /**
   * The picture that has been chosen and prepared, waiting for its two lines.
   *
   * ---------------------------------------------------------------------------
   * **Here rather than inside the component, because of where the picker has to
   * be opened.** A file picker only opens reliably when `click()` on the input
   * happens *synchronously inside a user gesture* — Safari on iOS in particular
   * refuses one that arrives a tick later. It used to be opened from an effect,
   * which happens after paint and outside that window, and which React's Strict
   * Mode double-invokes in development: two pickers, one of them orphaned, and
   * the screen stuck on "Opening your pictures…".
   *
   * So the button opens it, and what it comes back with lands here.
   * ---------------------------------------------------------------------------
   */
  picked: Prepared | null
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
  setPicked(picked: Prepared | null): void
  /**
   * Open the picker, then prepare what comes back.
   *
   * Called straight from the button and never from an effect — see `picked`.
   * The screen only comes up once there is something to show, because a wash
   * behind the operating system's own picker is a second dialog over the first.
   */
  leaveOne(): Promise<void>
  forming(id: string | null): void
}

export const useMemories = create<MemoriesState>((set) => ({
  all: [],
  loaded: false,
  openId: null,
  hanging: false,
  picked: null,
  formingId: null,

  setAll: (all) => set({ all, loaded: true }),
  open: (openId) => set({ openId }),
  setHanging: (hanging) => set(hanging ? { hanging } : { hanging, picked: null }),
  setPicked: (picked) => set({ picked }),

  leaveOne: async () => {
    // Synchronously inside the gesture. Everything after this may take its
    // time; this one call may not.
    const file = await pickPicture()
    if (!file) return
    set({ hanging: true, picked: null })
    try {
      set({ picked: await prepare(file) })
    } catch (error) {
      useTrouble
        .getState()
        .say(
          error instanceof PictureTrouble ? error.message : 'That picture would not open.',
        )
      set({ hanging: false, picked: null })
    }
  },
  forming: (formingId) => set({ formingId }),
}))

/**
 * The ones that still have glass in them, with their real ages attached.
 *
 * Everything that draws a pane, lights a pool, counts what the two of you have
 * or answers a tap works off this — and the `age` is the index in `all`,
 * carried along, because that is what `slotFor` needs. Filtering and then
 * looking the index back up would be quadratic in the one number here that
 * grows forever.
 */
export function standing(all: Memory[]): { memory: Memory; age: number }[] {
  const out: { memory: Memory; age: number }[] = []
  for (let age = 0; age < all.length; age++) {
    if (!all[age].removed) out.push({ memory: all[age], age })
  }
  return out
}

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
