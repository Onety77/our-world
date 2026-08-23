/**
 * Which place you are looking at, and the slide between them.
 *
 * There is no walking any more. The world is a row of places laid out along
 * one axis and the camera slides sideways between them — so "where am I" is a
 * single number, and the transition is that number easing.
 *
 * `at` is the live, eased position in section-index space: 1.4 means most of
 * the way from section 1 to section 2. Every camera and every scene reads it
 * per frame, never through React.
 */

import { create } from 'zustand'

/**
 * How long the fade between places lasts, in milliseconds.
 *
 * The place on screen is swapped at the halfway point, when nothing is
 * visible. Long enough to hide the swap, short enough that it reads as a
 * movement rather than a loading screen.
 */
export const FADE_MS = 620

/** How far the camera slides sideways under the fade, in metres. */
export const SLIDE_DISTANCE = 9

interface SectionsState {
  /** The index being travelled toward. */
  index: number
  /** How many there are. Set once at startup by the registry. */
  count: number
  /** Browsing shows the garden's places as destinations; entered opens one. */
  entered: boolean
  go(index: number): void
  enter(): void
  leave(): void
  next(): void
  previous(): void
  setCount(count: number): void
}

export const useSections = create<SectionsState>((set, get) => ({
  index: 0,
  count: 1,
  entered: false,
  go: (index) => set({ index: Math.max(0, Math.min(get().count - 1, index)) }),
  enter: () => set({ entered: true }),
  leave: () => set({ entered: false }),
  next: () => get().go(get().index + 1),
  previous: () => get().go(get().index - 1),
  setCount: (count) => set({ count }),
}))

/**
 * The live slide position, outside React.
 *
 * `at` chases `index` every frame; `drag` is the finger's live offset while a
 * swipe is in progress, so the world moves *with* the thumb rather than
 * waiting for it to lift. Reading these per frame in the camera is what makes
 * the slide feel attached to the hand.
 */
export const slide = {
  at: 0,
  drag: 0,
  /** True while a finger or mouse button is down and dragging the world. */
  grabbing: false,
}

/** Where the camera actually is, in index space, including the live drag. */
export function slidePosition(): number {
  return slide.at + slide.drag
}
