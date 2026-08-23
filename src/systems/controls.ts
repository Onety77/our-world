/**
 * Which way the pointer behaves on this device.
 *
 *   Mouse — hovering looks around. No button, no drag, no capture: move the
 *   mouse and the view follows it. Near the edges of the screen the view keeps
 *   turning, so you can spin all the way round without the cursor running out
 *   of desk.
 *
 *   Touch — drag to look, and the world moves *with* your finger, the way a map
 *   does. There is nothing to hover with.
 *
 * The two turn opposite ways and that's correct: a drag moves the world, a
 * mouse moves your head.
 */

import { create } from 'zustand'

interface ControlsState {
  /** Does this device have a mouse to hover with. */
  hoverLook: boolean
  setHoverLook(on: boolean): void
}

function detect(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: fine)').matches ?? false
}

export const useControls = create<ControlsState>((set) => ({
  hoverLook: detect(),
  setHoverLook: (hoverLook) => set({ hoverLook }),
}))
