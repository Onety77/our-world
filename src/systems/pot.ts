/**
 * Whether the contribution sheet is open.
 *
 * Its own small store rather than a flag on the reading store: putting money
 * in the pot and leaving a letter happen at different places and mean different
 * things, and sharing one "something is open" flag between them is how two
 * unrelated features end up entangled.
 */

import { create } from 'zustand'

interface PotState {
  open: boolean
  show(): void
  close(): void
}

export const usePot = create<PotState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}))
