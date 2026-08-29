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
import { useCorner } from '@/systems/corner'

export function CornerTab({ show }: { show: boolean }) {
  const tucked = useCorner((s) => s.tucked)
  const toggle = useCorner((s) => s.toggle)
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
      toggle()
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', () => { from = null })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
    }
  }, [tucked, toggle])

  if (!show) return null

  return (
    <button
      ref={node}
      type="button"
      className={`corner-tab${tucked ? ' tucked' : ''}`}
      aria-label={tucked ? 'show the music and the conversation' : 'tuck the music and the conversation away'}
      aria-expanded={!tucked}
    >
      <span aria-hidden="true" />
    </button>
  )
}
