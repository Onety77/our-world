/**
 * The handle on the edge of the Stars, and the only thing that says the second
 * sky is there.
 *
 * ---------------------------------------------------------------------------
 * **A gesture nobody can find is a gesture that does not exist.**
 *
 * Pulling from the edge is the right way to cross — it is what every phone
 * either of you has held does for a second layer, and it keeps out of the way
 * of a conversation that scrolls. It is also completely invisible, which is the
 * one thing wrong with it, and the reason a place cannot only be *good* when
 * you already know about it.
 *
 * So there is a mark: a short soft line on the edge the other sky is behind. It
 * is not a button and it does not say anything — the garden has no labels — but
 * it is the only bright thing on that edge, and it *leans with your finger*.
 * That last part is the whole of it: a handle that answers the first millimetre
 * of a pull teaches the gesture in one go, where a static hint would still need
 * explaining.
 * ---------------------------------------------------------------------------
 *
 * Driven from an animation frame rather than from state, like everything else
 * that follows this drag: it moves sixty times a second under a finger, and a
 * re-render per frame of a screen holding a whole conversation is exactly what
 * the technical law is about.
 */

import { useEffect, useRef } from 'react'
import { crossOver, sky } from '@/sections/stars/theme'

export function SkyEdge() {
  const mark = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let frame = 0
    const paint = () => {
      frame = requestAnimationFrame(paint)
      const el = mark.current
      if (!el) return

      /*
        It stays on the right, always.

        It used to move to whichever edge the *other* sky was behind, matching a
        pull that could start from either side. That pull is gone — one edge
        toggles now, because nobody remembers which edge they are owed — and
        this was not changed with it, so in the morning the only visible handle
        sat on the left while the only working edge was on the right. The hint
        was pointing away from the control, which is worse than no hint.
      */

      /*
        Brighter and longer as the pull begins, and faint the rest of the time.

        Faint enough at rest that it is scenery rather than furniture — this is
        a place people sit in for an hour — and unmistakable the moment a thumb
        touches it.
      */
      const woken = Math.min(1, sky.peek * 2.4)
      el.style.opacity = String(0.24 + woken * 0.66)
      el.style.transform = `scaleY(${1 + woken * 0.5}) scaleX(${1 + woken * 2.2})`
    }
    frame = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(frame)
  }, [])

  /*
    A button, not a mark.

    It was decoration with `pointer-events: none` — which is right for a hint
    and wrong for the only thing on screen that says the second sky exists. On a
    laptop the drag is awkward and there was nothing to click; now the hint *is*
    the control, which is what it looked like all along.
  */
  return (
    <button
      type="button"
      className="sky-edge"
      ref={mark}
      onClick={crossOver}
      aria-label="cross to the other sky"
    />
  )
}
