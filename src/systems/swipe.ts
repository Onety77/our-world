/**
 * Swiping between places.
 *
 * The world moves with the thumb while the thumb is down — that is the whole
 * difference between a gesture that feels like an object and one that feels
 * like a button you happened to drag. On release it either settles back or
 * carries on to the next place, decided by distance *and* by how fast you
 * threw it, so a short flick works as well as a long drag.
 */

import { SECTIONS } from '@/sections/registry'
import { slide, useSections } from './sections'

/**
 * Whether the gesture that just ended was a swipe.
 *
 * Anything that reacts to a tap has to ask this first: a finger that dragged
 * the world must not also pick the flower it happened to lift off over.
 */
let wasSwipe = false
export function grabbed(): boolean {
  return wasSwipe
}

/** Fraction of the window a drag must cover to count as a move on release. */
const DISTANCE = 0.22
/** Or this much speed, in fractions of the window per second. */
const FLING = 0.55

export interface SwipeHandle {
  detach(): void
  /** True while a drag is deciding whether it is a swipe. Blocks taps. */
  isDragging(): boolean
}

export function attachSwipe(el: HTMLElement): SwipeHandle {
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let startedAt = 0
  let lastX = 0
  let lastAt = 0
  let velocity = 0
  /** null until the gesture has decided whether it is horizontal. */
  let horizontal: boolean | null = null
  let moved = false

  const width = () => el.getBoundingClientRect().width || 1

  const clamp = (v: number) => {
    const max = SECTIONS.length - 1
    // A little give past either end says "nothing that way" far better than a
    // hard stop, and it springs back on release.
    if (v < 0) return v * 0.35
    if (v > max) return max + (v - max) * 0.35
    return v
  }

  const down = (e: PointerEvent) => {
    // Once inside a place, horizontal gestures belong to that activity. The
    // garden carousel only exists outside, where the places are being chosen.
    if (useSections.getState().entered) return
    if (pointerId !== null) return
    /*
      Let anything interactive above the canvas have the gesture.

      **The corner is listed by name, and it has to be.** The tag list catches
      controls; it does not catch a panel *made of* controls, and the open
      whisper is exactly that — a block of lines you can tap to travel to the
      Stars, with a field under it. Its recent-lines block is a `div` with a
      link role, so the tag list let the world take the pointer instead: a
      thumb that moved the six pixels this needs to call a gesture horizontal
      turned a tap on her last message into a swipe of the whole garden, and
      the tap never happened. It worked with a mouse, which is why it looked
      like it worked, and failed on the only device either of you uses.

      The player is here for the same reason and would have had the same bug
      the first time somebody dragged along its progress line.
    */
    if (
      (e.target as HTMLElement)?.closest(
        'button, input, textarea, select, a, .whisper, .player, [data-keeps-gesture]',
      )
    ) {
      return
    }
    pointerId = e.pointerId
    startX = lastX = e.clientX
    startY = e.clientY
    startedAt = lastAt = performance.now()
    velocity = 0
    horizontal = null
    moved = false
  }

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    // Decide the axis once, after enough movement to be sure. A vertical drag
    // must be allowed to scroll a letter rather than dragging the world.
    if (horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      horizontal = Math.abs(dx) > Math.abs(dy)
      if (horizontal) {
        slide.grabbing = true
        el.setPointerCapture?.(e.pointerId)
      }
    }
    if (!horizontal) return

    moved = true
    const now = performance.now()
    const dt = Math.max(1, now - lastAt) / 1000
    velocity = ((lastX - e.clientX) / width()) / dt
    lastX = e.clientX
    lastAt = now

    // Dragging left moves you *forward* — the world slides the way your thumb
    // pushes it, which is the direction every photo gallery has taught.
    const wanted = useSections.getState().index - dx / width()
    slide.drag = clamp(wanted) - slide.at
  }

  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    pointerId = null
    el.releasePointerCapture?.(e.pointerId)

    if (!horizontal || !moved) {
      wasSwipe = false
      slide.grabbing = false
      slide.drag = 0
      return
    }
    wasSwipe = true
    // cleared on the next frame, after every pointerup listener has run
    setTimeout(() => {
      wasSwipe = false
    }, 0)

    const travelled = (startX - lastX) / width()
    const quick = performance.now() - startedAt < 500

    let step = 0
    if (travelled > DISTANCE || (quick && velocity > FLING)) step = 1
    else if (travelled < -DISTANCE || (quick && velocity < -FLING)) step = -1

    const state = useSections.getState()
    const target = Math.max(0, Math.min(SECTIONS.length - 1, state.index + step))

    // Hand the eased slide the position the finger left it at, so letting go
    // continues from where you were rather than snapping back to the start.
    slide.at = slide.at + slide.drag
    slide.drag = 0
    slide.grabbing = false
    state.go(target)
  }

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)

  return {
    detach() {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    },
    isDragging: () => moved && horizontal === true,
  }
}
