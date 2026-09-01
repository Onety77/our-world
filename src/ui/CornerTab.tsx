/**
 * The handle the corner leaves behind when it tucks.
 *
 * A thin bar at the edge of the screen, and nothing else. It has to be
 * *findable* without being another thing on top of a game — so it is the
 * smallest mark that still reads as "there is something under here", with a
 * touch target considerably larger than the mark.
 *
 * Tap it, or swipe it away from the edge. Both work, because on a phone one of
 * those is what you will try first and there is no telling which.
 */

import { useEffect, useRef } from 'react'
import { cornerHandleAt, useCorner } from '@/systems/corner'

export function CornerTab({ show }: { show: boolean }) {
  const tucked = useCorner((s) => s.tucked)
  const toggle = useCorner((s) => s.toggle)
  const at = useCorner((s) => s.at)
  const putAt = useCorner((s) => s.putAt)
  const node = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const el = node.current
    if (!el) return
    let from: number | null = null

    const down = (event: PointerEvent) => {
      from = event.clientX
      el.setPointerCapture(event.pointerId)
    }
    const up = (event: PointerEvent) => {
      if (from === null) return
      const moved = event.clientX - from
      from = null
      /*
        A swipe toward the middle of the screen pulls it out; a swipe back at
        the edge puts it away. A tap — which is a swipe of about nothing —
        just toggles, so the control works before anybody has learned it.
      */
      const wantsOut = moved < -18
      const wantsIn = moved > 18
      if (wantsOut && !tucked) return
      if (wantsIn && tucked) return
      /*
        Putting it away from the handle leaves the handle where the handle is;
        pulling it out forgets the position, so the next shove decides afresh
        rather than inheriting where a thumb happened to be an hour ago.
      */
      if (tucked) putAt(null)
      else putAt(cornerHandleAt(event.clientY))
      toggle()
    }

    const cancel = () => {
      from = null
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
    }
  }, [tucked, toggle, putAt])

  // The mark is a way back to a corner that has actually been tucked. Leaving
  // it on screen while the corner was open produced a stray vertical line at
  // whichever height an old gesture happened to leave behind.
  if (!show || !tucked) return null

  return (
    <button
      ref={node}
      type="button"
      className={`corner-tab${tucked ? ' tucked' : ''}${at === null ? '' : ' placed'}`}
      /*
        Where the thumb left it. A percentage rather than pixels so turning the
        phone keeps it in the same place on the screen rather than the same
        number of pixels from a bottom edge that has moved.
      */
      style={at === null ? undefined : {
        top: `clamp(4.25rem, ${(at * 100).toFixed(2)}%, calc(100dvh - 4.25rem))`,
      }}
      aria-label={tucked ? 'show the music and the conversation' : 'tuck the music and the conversation away'}
      aria-expanded={!tucked}
    >
      <span aria-hidden="true" />
    </button>
  )
}
