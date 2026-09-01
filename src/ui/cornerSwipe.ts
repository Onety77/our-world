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
import { cornerHandleAt } from '@/systems/corner'

/** Far enough to be a shove rather than a wobble, in pixels. */
const ENOUGH = 44

/**
 * Or fast enough, in pixels a second.
 *
 * Distance alone made short flicks fail. A thumb that moves thirty pixels in a
 * tenth of a second has unmistakably thrown the panel at the edge, and refusing
 * that because it fell short of a fixed distance is why the gesture felt
 * unreliable rather than strict — you did the thing, and nothing happened.
 */
const FLICKED = 320

/** Before this, the gesture has not decided what it is. */
const DECIDED = 10

/**
 * How much more horizontal than vertical a drag has to be to count as sideways.
 *
 * A plain `>` makes a forty-five degree drag a coin toss, and a thumb reaching
 * across a phone travels diagonally by nature — so half the shoves were being
 * read as scrolls. Requiring a clear lead is the difference between a gesture
 * that works and one that works most of the time.
 */
const CLEARLY = 1.3

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
    let startedAt = 0
    /** null until the gesture has decided whether it is horizontal. */
    let sideways: boolean | null = null

    const down = (event: PointerEvent) => {
      /*
        Not while the shared screen is up.

        The screen lives inside the corner, so every sideways drag in it — most
        of all the one along the progress line, which is *the* horizontal
        gesture in a video player — reached this and shoved the whole corner off
        the edge of the display. Seeking forward put the film away.

        It is not a conflict worth arbitrating with thresholds either: the
        screen is full-bleed and owns the surface while it is open. The way out
        of it is the way out of everything else here, which is the word in the
        top left.
      */
      if ((event.target as HTMLElement | null)?.closest('.together.full')) return
      id = event.pointerId
      fromX = event.clientX
      fromY = event.clientY
      startedAt = event.timeStamp
      sideways = null
    }

    const move = (event: PointerEvent) => {
      if (id !== event.pointerId) return
      const dx = Math.abs(event.clientX - fromX)
      const dy = Math.abs(event.clientY - fromY)
      // Undecided until one axis is *clearly* ahead, rather than merely ahead.
      if (sideways === null && dx + dy > DECIDED) {
        if (dx > dy * CLEARLY) sideways = true
        else if (dy > dx * CLEARLY) sideways = false
      }
    }

    const up = (event: PointerEvent) => {
      if (id !== event.pointerId) return
      const dx = event.clientX - fromX
      const seconds = Math.max(0.001, (event.timeStamp - startedAt) / 1000)
      id = null
      /*
        Far enough, or fast enough.

        Both are the same intention — the panel has been pushed at the edge —
        and only accepting the slow version made a quick shove do nothing at
        all, which reads as the gesture being broken rather than as being
        careful.
      */
      const enough = dx >= ENOUGH || (dx > 16 && dx / seconds >= FLICKED)
      if (sideways !== true || !enough) {
        sideways = null
        return
      }
      sideways = null

      /*
        Swallow the click this gesture is about to become.

        Capturing, and once: the browser fires `click` on the element the
        finger went down on after `pointerup`, and on this panel that element
        is usually a button that plays, skips or opens something.
      */
      el.addEventListener('click', stopTheClick, { capture: true, once: true })
      /*
        And take it away again *after* the click would have arrived.

        This was zero milliseconds, which fires before the click rather than
        after it — so the listener was almost always gone by the time it was
        needed and the shove went on pressing whatever it started from. A third
        of a second is well past the click and well short of the next tap.
      */
      window.setTimeout(() => el.removeEventListener('click', stopTheClick, true), 350)
      /*
        Where the gesture *began*, not where it ended.

        A sideways shove drifts vertically — a thumb travels in an arc — so
        using the release point put the handle a couple of centimetres from
        where the hand thought it was aiming. Where the finger landed is the
        deliberate half of the gesture; the rest is the throw.
      */
      tuck(cornerHandleAt(fromY))
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
