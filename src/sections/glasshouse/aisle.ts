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

/**
 * Which wall the pane you are nearest is on, and how far to lean toward it.
 *
 * ---------------------------------------------------------------------------
 * **The single biggest thing wrong with this place was that it was a corridor
 * first and a photograph second.**
 *
 * Standing in the middle of an aisle, both walls are at the edge of the frame
 * — worse on a phone, where the horizontal field of view is about twenty-seven
 * degrees and a pane measured twenty-eight pixels across. It was on screen,
 * it was tappable, and it was not *looked at*. The architecture had all the
 * middle of the frame and the memories had the margins, in a place that exists
 * for the memories.
 *
 * So the building slides sideways. Not the camera — `SlideCamera` owns that,
 * and two things steering one camera is the fight the racer had to stand it
 * down to avoid. Moving the building the other way is the same picture and
 * costs one number.
 *
 * It reads as leaning toward the wall you are looking at, which is what a
 * person does in a gallery. The far end of the aisle stays visible past your
 * shoulder, so it is still a corridor you are in — it is just no longer the
 * subject.
 * ---------------------------------------------------------------------------
 */
export const LEAN = 1.45

/*
   How far from the pane you stand once a memory is open lives in `layout`,
   as `standFor` — it is a fact about the size of a pane and the shape of a
   screen, not about easing. It started life here as a bigger lean, on the
   reasoning that leaning harder walks you closer to the wall. That is true
   while you are walking and completely false once you have turned, and the
   reason why is worth keeping: after a quarter turn the building's local X
   *is* the depth axis, so how far back down the aisle the camera happens to
   be standing becomes how far across the building it is standing. The lean
   was cancelling about half of that and leaving the camera a metre outside
   the far glazing, looking in through grey glass at a pane on the opposite
   wall — perfectly centred, perfectly sized, and with no room around it,
   because the room was behind the camera.
*/

/**
 * And it has to *turn*, which is the part that actually matters.
 *
 * ---------------------------------------------------------------------------
 * **A pane on a corridor wall is seen almost edge-on.** Its two and a bit
 * metres of width run *down the aisle* — which is the direction you are
 * looking — so almost all of it is depth and almost none of it is screen. That
 * is the arithmetic behind "the focused pane measured twenty-eight pixels":
 * not distance, and not size. Angle.
 *
 * Moving closer cannot fix it; the foreshortening is the same at any range.
 * Sliding sideways barely touches it either. The only thing that turns a wall
 * into a picture is *facing* it, which is why this exists and why the lean
 * above is now the smaller half of the pair.
 *
 * Twenty-two degrees. Enough that the near pane opens up to something you are
 * looking at rather than past, and little enough that the aisle still recedes
 * — diagonally now, across the frame, which is what a room does when you turn
 * to something on its wall.
 * ---------------------------------------------------------------------------
 */
export const TURN = 0.38

/**
 * And all the way round, when you open one.
 *
 * ---------------------------------------------------------------------------
 * **Opening a memory is the same turn, continued.** Twenty-two degrees is
 * glancing at the wall; ninety is standing square in front of it, which is
 * what a person does when they stop to look at a picture. So there is no
 * second mechanism and no separate camera move: `open` runs 0 to 1 and the
 * turn runs from a glance to face-on along with it, with the aisle walking to
 * the pane's own bay at the same time.
 *
 * The arithmetic falls out unreasonably well. At exactly ninety degrees the
 * pane's own width maps onto world *x* and its height onto world *y*, so it
 * lands dead centre of the aisle — and the existing sideways lean, which was
 * chosen for something else entirely, happens to leave it about five and a
 * half metres from the camera. That is eighty-odd per cent of a phone screen.
 *
 * And being exactly perpendicular is what lets the photograph align to it:
 * a face-on rectangle projects to an axis-aligned rectangle on screen, which
 * a DOM element can be placed on precisely. One degree of tilt and none of
 * this would be possible — see the note on `slotFor`.
 * ---------------------------------------------------------------------------
 */
const FACING = Math.PI / 2

/** Live, eased. Written by the scene, read by the two groups. */
export const lean = { shift: 0, turn: 0 }

/** How far into looking at one, 0..1. Read by the drag and by the DOM. */
export const focus = { open: 0 }

/**
 * Step the lean, the turn and the opening together.
 *
 * `toward` is the wall being attended to — the nearest pane while walking, the
 * open one while looking. `opening` is 1 once a memory has been tapped.
 */
export function stepLean(delta: number, toward: -1 | 0 | 1, opening: boolean): void {
  const ease = 1 - Math.exp(-2.4 * delta)
  // Slower than the lean: this is a whole body turning rather than a glance,
  // and at this size a fast one reads as the room being yanked.
  focus.open += ((opening ? 1 : 0) - focus.open) * (1 - Math.exp(-2.9 * delta))

  const want = toward * (TURN + (FACING - TURN) * focus.open)
  // Facing a wall means the building turns the other way about the point in
  // front of you — see the nested groups in the scene.
  /*
    The lean is now only the walking one — a glance toward the wall you are
    passing. The open state does not lean at all; it is placed, by the solve in
    the scene, and easing a lean underneath that solve only gives it more to
    cancel.
  */
  lean.shift += (-toward * LEAN - lean.shift) * ease
  lean.turn += (want - lean.turn) * ease
}

/** Where the building sits across the aisle. */
export function buildingX(): number {
  return lean.shift
}

/** How far the building is turned, in radians. */
export function buildingTurn(): number {
  return lean.turn
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
    // Not while a memory is open: you are standing in front of a picture, and
    // the building sliding under the thumb that is trying to read it is the
    // gesture fighting the moment.
    if (focus.open > 0.02) return
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

  /** The same walk for a keyboard: one bay at a time, never a camera jump. */
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
      walkTo(aisle.to - 3.2)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      walkTo(aisle.to + 3.2)
    } else if (e.key === 'Home') {
      e.preventDefault()
      walkTo(aisle.deepest)
    } else if (e.key === 'End') {
      e.preventDefault()
      walkTo(0)
    }
  }

  target.addEventListener('pointerdown', down)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  window.addEventListener('wheel', wheel, { passive: true })
  window.addEventListener('keydown', key)

  return () => {
    target.removeEventListener('pointerdown', down)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    window.removeEventListener('wheel', wheel)
    window.removeEventListener('keydown', key)
    aisle.grabbing = false
  }
}

/** True while the aisle is being pulled, so a tap is not also a drag. */
export function pulling(): boolean {
  return aisle.grabbing
}
