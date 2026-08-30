/**
 * Whether anybody is presently asking the world to move.
 *
 * A phone left on the Stars used to draw the same procedural sky at the same
 * rate as a hand actively turning it. Pointer position, typing, scrolling and
 * touch are all activity; after a short quiet spell the world may keep its
 * weather alive at a much lower cadence. Hiding the page is different again:
 * there are no pixels to preserve, so the renderer may stop completely.
 *
 * This is deliberately about the *device*, not a section. The Canvas, the
 * conversation and any future expensive overlay should agree about whether a
 * person is interacting instead of each growing its own idle timer.
 */

import { useEffect } from 'react'
import { create } from 'zustand'

const IDLE_AFTER_MS = 5_000
const CHECK_EVERY_MS = 750

interface ActivityState {
  visible: boolean
  idle: boolean
}

export const useActivity = create<ActivityState>(() => ({
  visible: typeof document === 'undefined' ? true : !document.hidden,
  idle: false,
}))

let lastActivity = typeof performance === 'undefined' ? 0 : performance.now()
const listeners = new Set<() => void>()

/** Imperative consumers can restart a short animation without a React render. */
export function onActivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Wake the visual world for work that did not begin with an input event, such
 * as a message arriving from the other phone.
 */
export function wakeWorld(): void {
  lastActivity = performance.now()
  if (useActivity.getState().idle) useActivity.setState({ idle: false })
  for (const listener of listeners) listener()
}

/** Installed once by the Canvas pacer. */
export function useActivityMonitor(): void {
  useEffect(() => {
    const activity = () => wakeWorld()
    const visibility = () => {
      const visible = !document.hidden
      lastActivity = performance.now()
      useActivity.setState({ visible, idle: !visible })
    }

    const passive: AddEventListenerOptions = { passive: true }
    window.addEventListener('pointerdown', activity, passive)
    window.addEventListener('pointermove', activity, passive)
    window.addEventListener('wheel', activity, passive)
    window.addEventListener('touchstart', activity, passive)
    window.addEventListener('keydown', activity)
    window.addEventListener('focus', activity)
    document.addEventListener('visibilitychange', visibility)

    const check = window.setInterval(() => {
      const state = useActivity.getState()
      if (!state.visible || state.idle) return
      if (performance.now() - lastActivity >= IDLE_AFTER_MS) {
        useActivity.setState({ idle: true })
      }
    }, CHECK_EVERY_MS)

    visibility()
    return () => {
      window.clearInterval(check)
      window.removeEventListener('pointerdown', activity)
      window.removeEventListener('pointermove', activity)
      window.removeEventListener('wheel', activity)
      window.removeEventListener('touchstart', activity)
      window.removeEventListener('keydown', activity)
      window.removeEventListener('focus', activity)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
}
