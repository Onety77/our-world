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
import { sky } from '@/sections/stars/theme'

export function SkyEdge() {
  const mark = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frame = 0
    const paint = () => {
      frame = requestAnimationFrame(paint)
      const el = mark.current
      if (!el) return

      /*
        It lives on whichever edge the *other* sky is behind, which is the same
        rule the pull itself follows: on the plain the cloudsea is off to the
        right, and once you are up there the plain is the thing off to the left.
        A handle that stayed on one side would be pointing at the sky you are
        already standing in.
      */
      const onRight = sky.at < 0.5
      el.style.left = onRight ? 'auto' : '0'
      el.style.right = onRight ? '0' : 'auto'

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

  return <span className="sky-edge" ref={mark} aria-hidden="true" />
}
