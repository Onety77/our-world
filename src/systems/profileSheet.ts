/**
 * Whether your own profile is open.
 *
 * Its own small store, for the same reason the pot has one: opening a letter,
 * putting something in the pot and saying where you are now are three
 * different acts, and a single shared "something is open" flag is how three
 * unrelated things end up tangled.
 */

import { create } from 'zustand'

interface ProfileSheetState {
  open: boolean
  show(): void
  close(): void
}

export const useProfileSheet = create<ProfileSheetState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}))
