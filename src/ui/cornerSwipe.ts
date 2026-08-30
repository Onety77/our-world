/**
 * Pushing the corner off the side of the screen with a thumb.
 *
 * ---------------------------------------------------------------------------
 * The handle in `CornerTab` could already put the music and the conversation
 * away, and it was the only thing that could — which meant the gesture you
 * would actually reach for, shoving the panel itself off to the right, did
 * nothing at all. A control you have to find before you can use it is a
 * control most people never find.
 *
 * Two things make this harder than watching `pointerup`:
 *
 * **The panel is full of buttons.** A drag that begins on the play button ends
 * as a click on the play button, because that is what a browser does, so a
 * swipe would put the corner away and start a song on the way out. The click
 * that follows a real swipe is swallowed, once, on the way up the tree.
 *
 * **The list inside it scrolls.** `touch-action: none` would take the sideways
 * gesture cleanly and also stop you scrolling through your own songs.
 * `pan-y` is the exact division wanted: vertical belongs to the list, sideways
 * belongs to this.
 * ---------------------------------------------------------------------------
 */

import { useEffect, type RefObject } from 'react'

/** Far enough to be a shove rather than a wobble, in pixels. */
const ENOUGH = 44

/** Before this, the gesture has not decided what it is. */
const DECIDED = 10

export function useTuckOnSwipe(
  ref: RefObject<HTMLElement | null>,
  { on, tuck }: { on: boolean; tuck(at: number): void },
) {
  useEffect(() => {
    const el = ref.current
    if (!el || !on) return

    let id: number | null = null
    let fromX = 0
    let fromY = 0
    /** null until the gesture has decided whether it is horizontal. */
    let sideways: boolean | null = null

    const down = (event: PointerEvent) => {
      id = event.pointerId
      fromX = event.clientX
      fromY = event.clientY
      sideways = null
    }

    const move = (event: PointerEvent) => {
      if (id !== event.pointerId) return
      const dx = event.clientX - fromX
      const dy = event.clientY - fromY
      if (sideways === null && Math.abs(dx) + Math.abs(dy) > DECIDED) {
        sideways = Math.abs(dx) > Math.abs(dy)
      }
    }

    const up = (event: PointerEvent) => {
      if (id !== event.pointerId) return
      const dx = event.clientX - fromX
      id = null
      if (sideways !== true || dx < ENOUGH) return
      sideways = null

      /*
        Swallow the click this gesture is about to become.

        Capturing, and once: the browser fires `click` on the element the
        finger went down on after `pointerup`, and on this panel that element
        is usually a button that plays, skips or opens something.
      */
      el.addEventListener('click', stopTheClick, { capture: true, once: true })
      // If the finger went down on nothing clickable, no click ever arrives
      // and the listener would sit there waiting for the next honest tap.
      window.setTimeout(() => el.removeEventListener('click', stopTheClick, true), 0)
      // Where it was let go, so the handle can be left there rather than in
      // the corner the panel happens to live in. See `CornerTab`.
      tuck(event.clientY / Math.max(1, window.innerHeight))
    }

    const stopTheClick = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
    }

    const cancel = () => {
      id = null
      sideways = null
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('click', stopTheClick, true)
    }
  }, [ref, on, tuck])
}
