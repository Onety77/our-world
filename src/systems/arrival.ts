/**
 * Whether the way in is still shut.
 *
 * A one-field store rather than component state, because the rest of the
 * garden has to be able to ask. `ui/Arrival` covers everything, and anything
 * listening on `window` — which is most of the gestures — would otherwise act
 * on events aimed at the door.
 */

import { create } from 'zustand'

interface ArrivalState {
  /** True until somebody has come in. */
  shut: boolean
  open(): void
}

export const useArrival = create<ArrivalState>((set) => ({
  shut: true,
  open: () => set({ shut: false }),
}))
