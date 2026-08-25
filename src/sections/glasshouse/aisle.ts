/**
 * How far down the Glasshouse you are standing, in metres.
 *
 * ---------------------------------------------------------------------------
 * **The building moves, not the camera.** This is the same decision the world
 * made when it stopped laying its places out along an axis: one place is on
 * screen at a time, it sits at the origin, and what you feel as travel is
 * framing. Driving the camera instead would mean fighting `SlideCamera`, which
 * is already steering it every frame from the section's own composition — two
 * things steering one camera is a fight nobody wins, and the racer had to
 * stand the slide camera down entirely to avoid it.
 *
 * So the Glasshouse slides past a camera that never moves. Fog is measured
 * from the camera and so stays correct; the sky and the far wood do not move,
 * and should not, because you are inside a building looking out of it.
 * ---------------------------------------------------------------------------
 *
 * Outside React, like `systems/sections`' own slide: read every frame by the
 * scene, written every frame by the drag. State would be sixty re-renders a
 * second of a wall of photographs.
 */

/** How quickly the aisle settles on where you asked to be, per second. */
const FOLLOW = 3.4

export const aisle = {
  /** Live, eased. Metres from the oldest pane. */
  at: 0,
  /** Where it is heading. */
  to: 0,
  /** The finger's live offset, so the building moves with the thumb. */
  drag: 0,
  /** True while a finger or mouse button is down and pulling. */
  grabbing: false,
  /** The far end — the empty frame. Set by the scene from the memory count. */
  deepest: 0,
}

/** Where the eye actually is, including the live drag. */
export function aisleAt(): number {
  return aisle.at + aisle.drag
}

/**
 * Where the building sits, given where you are standing.
 *
 * ---------------------------------------------------------------------------
 * **There is deliberately nothing added to this, and finding that out took a
 * measurement.**
 *
 * On a phone the near panes looked wrong, and the theory was that a corridor
 * under three metres wide, seen through a vertical field of view on a portrait
 * screen, put them outside the frame — so a "standoff" was added to make you
 * stand a few metres short of the pane you are at. That made it worse, which
 * is what a wrong theory usually does.
 *
 * `?shot=1` publishes the focus pane's projected rectangle (see `__glass` in
 * the scene), and sweeping the standoff against it settled it in one run:
 *
 *     standoff 0     desktop 164px    phone 56px    whole: yes
 *     standoff 1.5   desktop  92px    phone 36px    whole: yes
 *     standoff 3     desktop  82px    phone 34px    whole: yes
 *     standoff 5     desktop  52px    phone 22px    whole: yes
 *
 * The pane was never cut off at any distance. It was simply small, and every
 * metre of standoff made it smaller. **Measure the thing before compensating
 * for it** — the compensation here was for a problem that did not exist, and
 * it cost two thirds of the size of every photograph on the primary surface.
 *
 * The function stays, with nothing in it, because two expressions of this
 * offset is how a tap lands on the photograph next to the one you aimed at:
 * the group that moves the building and the ray that picks out of it both go
 * through here.
 * ---------------------------------------------------------------------------
 */
export function buildingZ(): number {
  return -aisleAt()
}

/** Step the easing. Called once a frame by the scene, before anything reads it. */
export function stepAisle(delta: number): void {
  aisle.to = Math.max(0, Math.min(aisle.deepest, aisle.to))
  if (aisle.grabbing) return
  aisle.at += (aisle.to - aisle.at) * (1 - Math.exp(-FOLLOW * delta))
}

/** Put yourself somewhere, gliding. Used by tapping a pane further along. */
export function walkTo(metres: number): void {
  aisle.to = Math.max(0, Math.min(aisle.deepest, metres))
}

/** Start again at the near end — the newest memory, and the empty frame. */
export function toTheNewest(): void {
  aisle.at = aisle.deepest
  aisle.to = aisle.deepest
  aisle.drag = 0
}

/**
 * Dragging along the aisle.
 *
 * **Vertically**, and that is not arbitrary. Horizontal belongs to
 * `systems/swipe`, which browses places — it stands down once you are inside
 * one, so there is no collision today, but a corridor that answers the same
 * gesture as "go to the next place" is one refactor away from being a bug
 * nobody can explain. Vertical is also what the hand already does to a list of
 * things in time: drag up and you go further back, exactly as you would
 * through a conversation.
 *
 * Its own recogniser rather than the garden's, for the reason the Hollow's row
 * has its own: the shared one is about places, and this is inside one.
 */
export function alongTheAisle(target: HTMLElement): () => void {
  /** Metres travelled per pixel dragged. */
  const RATE = 0.045
  /** Below this a drag is a tap, and a tap belongs to whatever was under it. */
  const SLOP = 6

  let from: number | null = null
  let base = 0
  let moved = 0

  const down = (e: PointerEvent) => {
    // Anything that is a control keeps its own gesture.
    if ((e.target as HTMLElement | null)?.closest('button, input, textarea, a')) return
    from = e.clientY
    base = aisle.at
    moved = 0
  }

  const move = (e: PointerEvent) => {
    if (from === null) return
    const dy = e.clientY - from
    moved = Math.max(moved, Math.abs(dy))
    if (moved < SLOP) return
    aisle.grabbing = true
    /*
      Written to `at` rather than to `drag`, and `drag` is left at zero.

      The sections' slide keeps the two separate because a swipe there either
      completes or springs back, so the finger's offset is a *proposal*. Here
      there is nothing to complete: where you let go is where you are standing.
      Clamped as it goes, so pulling past the ends resists instead of winding up
      a number that then unwinds when you release.
    */
    aisle.at = Math.max(0, Math.min(aisle.deepest, base - dy * RATE))
    aisle.to = aisle.at
  }

  const up = () => {
    from = null
    aisle.grabbing = false
  }

  /** A wheel or a trackpad, for whoever is looking at this on a laptop. */
  const wheel = (e: WheelEvent) => {
    walkTo(aisle.to + e.deltaY * 0.012)
  }

  target.addEventListener('pointerdown', down)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  window.addEventListener('wheel', wheel, { passive: true })

  return () => {
    target.removeEventListener('pointerdown', down)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    window.removeEventListener('wheel', wheel)
    aisle.grabbing = false
  }
}

/** True while the aisle is being pulled, so a tap is not also a drag. */
export function pulling(): boolean {
  return aisle.grabbing
}
