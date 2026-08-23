/**
 * Which letter is open, and which one you're pointing at.
 *
 * Opening is a *tap*, not a proximity trigger. Walking up to things is the
 * right verb for a place you go to; it is the wrong one for a letter you can
 * see hanging ten metres away and want to read now. You point at it and open
 * it, the way you'd reach up and take it down.
 */

import { create } from 'zustand'
import { clearFocus, focusOn } from './focus'

interface ReadingState {
  /** Open, and filling the screen. Set by tapping; cleared by closing. */
  openLetterId: string | null
  /** Under the pointer right now, so it can show it's reachable. */
  hoveredLetterId: string | null
  /** Standing at the place where letters get written. */
  atHollow: boolean
  /** The composer is open. Set by the marker in the world, or by walking up. */
  composing: boolean

  /**
   * Open a letter. `at` is where the paper hangs, so the camera can lean in on
   * it; leaving it out opens the letter without moving anything, which is what
   * you want when it wasn't opened by pointing at it.
   */
  open(id: string, at?: [number, number, number]): void
  startWriting(): void
  stopWriting(): void
  close(): void
  setHovered(id: string | null): void
  setAtHollow(value: boolean): void
}

export const useReading = create<ReadingState>((set, get) => ({
  openLetterId: null,
  hoveredLetterId: null,
  atHollow: false,
  composing: false,

  open: (id, at) => {
    if (at) focusOn(at[0], at[1], at[2])
    set({ openLetterId: id, hoveredLetterId: null, composing: false })
  },
  startWriting: () => {
    clearFocus()
    set({ composing: true, openLetterId: null })
  },
  stopWriting: () => set({ composing: false }),
  close: () => {
    clearFocus()
    set({ openLetterId: null })
  },

  setHovered(id) {
    // guarded: this is written from a pointer handler many times a second
    if (get().hoveredLetterId !== id) set({ hoveredLetterId: id })
  },

  setAtHollow(value) {
    if (get().atHollow !== value) set({ atHollow: value })
  },
}))

/** How close you have to be to the hollow to write, in metres. */
export const HOLLOW_REACH = 4.2

/**
 * Radius of a letter's tap target, in metres. Much larger than the paper —
 * they hang high up and small on screen, and this is being aimed at with a
 * thumb on a phone.
 */
export const LETTER_TARGET = 0.9

/**
 * And the radius at which the world stops turning so you can reach it.
 *
 * The same problem the labels have: hover-look swings the view as your hand
 * moves, so a letter you aim at slides away faster than the cursor closes on
 * it. Wider than the tap target, so you cross into the calm before the letter
 * has had a chance to escape.
 */
export const LETTER_REACH = 2.4

/**
 * Whether the pointer is closing on a letter. A plain object rather than store
 * state: it is written from a pick that runs ten times a second and read by
 * the camera every frame, and neither wants a React render out of it.
 */
export const reachingForLetter = { near: false }
