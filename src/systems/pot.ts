/**
 * Which of the Wellspring's sheets is open.
 *
 * Its own small store rather than a flag on the reading store: putting money
 * in the pot and leaving a letter happen at different places and mean different
 * things, and sharing one "something is open" flag between them is how two
 * unrelated features end up entangled.
 *
 * Three sheets now, not one. The pot could be *added to* and nothing else —
 * there was no way to say what the two of you were saving for, though the data
 * had a place for it from the start, and no way to look at what had gone in
 * and who put it there, though every entry is kept. A river you can only pour
 * into is half a place.
 */

import { create } from 'zustand'

export type PotSheet = 'add' | 'goal' | 'record'

interface PotState {
  /** Which sheet, or none. */
  sheet: PotSheet | null
  /** True while any sheet is up — what everything that asks "is the pot open" reads. */
  open: boolean
  /** The contribution sheet. */
  show(): void
  /** What it is for. */
  showGoal(): void
  /** What went in, and who put it there. */
  showRecord(): void
  close(): void
}

export const usePot = create<PotState>((set) => ({
  sheet: null,
  open: false,
  show: () => set({ sheet: 'add', open: true }),
  showGoal: () => set({ sheet: 'goal', open: true }),
  showRecord: () => set({ sheet: 'record', open: true }),
  close: () => set({ sheet: null, open: false }),
}))
