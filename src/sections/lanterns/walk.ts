/**
 * How far along the lane you are standing, and how you got there.
 *
 * ---------------------------------------------------------------------------
 * **The lane moves, not the camera.** This is the same decision the world made
 * when it stopped laying its places out along an axis: one place is on screen
 * at a time, it sits at the origin, and what you feel as travel is framing.
 * Driving the camera instead would mean fighting `SlideCamera`, which is
 * already steering it every frame from the section's own composition — two
 * things steering one camera is a fight nobody wins, and the racer had to stand
 * the slide camera down entirely to avoid it.
 *
 * So the lane slides past a camera that never moves. Fog is measured from the
 * camera and so stays correct, and the sky and the far wood do not move, which
 * is right: you are walking under them, not past them.
 * ---------------------------------------------------------------------------
 *
 * Outside React, like `systems/sections`' own slide: read every frame by the
 * scene, written every frame by the drag. State would be sixty re-renders a
 * second of a lane full of photographs.
 *
 * **What is not here, and was in the room this replaced.** That place carried a
 * sideways lean and a twenty-two degree turn, both of which existed for one
 * reason: its pictures hung on walls running along the direction of travel, so
 * they were seen edge-on and the building had to rotate about the viewer to
 * make them visible. Out here a lantern is turned to face you when it is hung —
 * see `hangingFor` — so there is nothing to compensate for, and both mechanisms
 * are gone rather than ported. Travel is travel.
 */

import { headFor, SPACING } from './layout'

const COARSE =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

/**
 * How quickly the walk settles on where you asked to be, per second.
 *
 * A phone is controlled in short thumb gestures and was spending several
 * seconds coasting after the hand had already stopped. It gets a firmer settle;
 * a mouse or trackpad keeps the longer, more gliding one.
 */
const FOLLOW = COARSE ? 7.2 : 4.2

/** The last real pull, so its pointer-up can never also open a lantern. */
let lastDraggedAt = 0

export const walk = {
  /** Live, eased. Metres along the lane from the oldest memory. */
  at: 0,
  /** Where it is heading. */
  to: 0,
  /** True while a finger or mouse button is down and pulling. */
  grabbing: false,
  /** The head of the lane — the empty lantern. Set by the scene from the count. */
  deepest: 0,
}

/** How far into looking at one, 0..1. Read by the drag and by the interface. */
export const focus = { open: 0 }

/** Where the eye actually is, along the lane. */
export function walkAt(): number {
  return walk.at
}

/**
 * Step the opening.
 *
 * Slower than the walk on purpose: this is stopping in front of something
 * rather than glancing at it, and at this size a fast one reads as the lane
 * being yanked out from under you.
 */
export function stepFocus(delta: number, opening: boolean): void {
  focus.open +=
    ((opening ? 1 : 0) - focus.open) * (1 - Math.exp(-(COARSE ? 6.2 : 4.1) * delta))
}

/** Step the easing. Called once a frame by the scene, before anything reads it. */
export function stepWalk(delta: number): void {
  walk.to = Math.max(0, Math.min(walk.deepest, walk.to))
  if (walk.grabbing) return
  walk.at += (walk.to - walk.at) * (1 - Math.exp(-FOLLOW * delta))
}

/** Put yourself somewhere, gliding. Used by tapping a lantern further along. */
export function walkTo(metres: number): void {
  walk.to = Math.max(0, Math.min(walk.deepest, metres))
}

/** Start again at the head of the lane — the newest memory, and the empty one. */
export function toTheNewest(): void {
  walk.at = walk.deepest
  walk.to = walk.deepest
}

/** The head of the lane for a given number of memories. */
export function headOfWalk(count: number): number {
  return headFor(count)
}

/**
 * Walking the lane.
 *
 * **Vertically**, and that is not arbitrary. Horizontal belongs to
 * `systems/swipe`, which browses places — it stands down once you are inside
 * one, so there is no collision today, but a lane that answers the same gesture
 * as "go to the next place" is one refactor away from being a bug nobody can
 * explain. Vertical is also what the hand already does to a list of things in
 * time: drag up and you go further back, exactly as you would through a
 * conversation.
 *
 * Its own recogniser rather than the garden's, for the reason the Hollow's row
 * has its own: the shared one is about places, and this is inside one.
 */
export function alongTheLane(target: HTMLElement): () => void {
  /** Metres travelled per pixel dragged. */
  const RATE = 0.045
  /** Below this a drag is a tap, and a tap belongs to whatever was under it. */
  const SLOP = 6

  let from: number | null = null
  let pointer: number | null = null
  let base = 0
  let moved = 0

  const down = (e: PointerEvent) => {
    // Anything that is a control keeps its own gesture.
    if ((e.target as HTMLElement | null)?.closest('button, input, textarea, a')) return
    if (!e.isPrimary) return
    from = e.clientY
    pointer = e.pointerId
    base = walk.at
    moved = 0
    target.setPointerCapture?.(e.pointerId)
  }

  const move = (e: PointerEvent) => {
    if (from === null || e.pointerId !== pointer) return
    // Not while a memory is open: you are standing in front of a picture, and
    // the lane sliding under the thumb that is trying to read it is the gesture
    // fighting the moment.
    if (focus.open > 0.02) return
    const dy = e.clientY - from
    moved = Math.max(moved, Math.abs(dy))
    if (moved < SLOP) return
    e.preventDefault()
    walk.grabbing = true
    lastDraggedAt = performance.now()
    /*
      Written straight to `at`, with no separate finger offset.

      The sections' slide keeps those apart because a swipe there either
      completes or springs back, so the finger's offset is a *proposal*. Here
      there is nothing to complete: where you let go is where you are standing.
      Clamped as it goes, so pulling past either end resists instead of winding
      up a number that then unwinds when you release.
    */
    walk.at = Math.max(0, Math.min(walk.deepest, base - dy * RATE))
    walk.to = walk.at
  }

  const up = (e: PointerEvent) => {
    if (pointer !== null && e.pointerId !== pointer) return
    if (moved >= SLOP) lastDraggedAt = performance.now()
    if (pointer !== null && target.hasPointerCapture?.(pointer)) {
      target.releasePointerCapture(pointer)
    }
    from = null
    pointer = null
    walk.grabbing = false
  }

  /** A wheel or a trackpad, for whoever is looking at this on a laptop. */
  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    if (focus.open > 0.02) return
    walkTo(walk.to + e.deltaY * 0.012)
  }

  /** The same walk for a keyboard: one lantern at a time, never a camera jump. */
  const key = (e: KeyboardEvent) => {
    const focused = document.activeElement
    if (
      focused instanceof HTMLInputElement ||
      focused instanceof HTMLTextAreaElement ||
      focused instanceof HTMLSelectElement ||
      focus.open > 0.02
    ) return
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      walkTo(walk.to - SPACING)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      walkTo(walk.to + SPACING)
    } else if (e.key === 'Home') {
      e.preventDefault()
      walkTo(walk.deepest)
    } else if (e.key === 'End') {
      e.preventDefault()
      walkTo(0)
    }
  }

  target.addEventListener('pointerdown', down)
  target.addEventListener('pointermove', move, { passive: false })
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
  window.addEventListener('wheel', wheel, { passive: false })
  window.addEventListener('keydown', key)

  return () => {
    target.removeEventListener('pointerdown', down)
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', up)
    window.removeEventListener('wheel', wheel)
    window.removeEventListener('keydown', key)
    walk.grabbing = false
  }
}

/** True while the lane is being pulled, so a tap is not also a drag. */
export function pulling(): boolean {
  return walk.grabbing || performance.now() - lastDraggedAt < 180
}
