/**
 * Driving it with two thumbs, and where the two buttons sit.
 *
 * ---------------------------------------------------------------------------
 * **The phone gets a different car to the keyboard, on purpose.**
 *
 * The old scheme was one thumb doing everything: the left half dragged
 * sideways to steer, the right half held for throttle and dragged down through
 * the brake and into the handbrake, and a tap on it spent the ember. It is a
 * clever control and it asks too much. A drag has to be *started* somewhere
 * before it means anything, so the first tenth of a second of every correction
 * is spent finding the origin — which is exactly the tenth of a second a
 * corner is decided in. And a pedal that lives on the same thumb as the ember
 * means every boost is also a lift.
 *
 * So on a phone:
 *
 *   the left of the screen, held    steer left
 *   the right of the screen, held   steer right
 *   the throttle                    is not a control. It is always on
 *   two buttons at the bottom       the handbrake, and the ember
 *
 * **Nothing is drawn for the steering.** There is no wheel and no pad, because
 * the whole of the left half *is* the left, and drawing a small target on top
 * of a large one only teaches people to aim at the small one. The one time it
 * is drawn is the first race — see `showTheArrows`.
 *
 * **The throttle goes because a phone cannot spare the thumb.** Two thumbs,
 * two jobs each at most: steering under one and the two buttons under the
 * other. That leaves the car always accelerating, which sounds like it removes
 * driving until you remember that the handbrake is *also* the brake — the
 * physics gives the rears a real braking torque whenever it is down and the
 * car is not already sideways — so slowing down is a control you have, it is
 * just the same one as going sideways. Which is the game.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Where the buttons are
// ---------------------------------------------------------------------------

/**
 * A place on the screen, as a fraction of it.
 *
 * Fractions rather than pixels because there is no such thing as the size of a
 * phone: the same layout has to land on a 5-inch screen with a notch and on a
 * tablet, and a button pinned 90 pixels from the bottom is under the home bar
 * on one of them. `x` and `y` are the *centre* of the button, measured from
 * the left and the top.
 */
export interface Spot {
  x: number
  y: number
}

export interface TouchLayout {
  handbrake: Spot
  boost: Spot
  /** Across the smaller side of the screen, so a button is round at any size. */
  size: number
}

/**
 * Where they sit before anybody moves them.
 *
 * Both low and near the middle, the handbrake to the left of the ember. Low
 * because that is where a thumb is when the phone is held in two hands in
 * landscape, and toward the middle because the far corners are where the
 * palms are — a button in the very corner is one you have to re-grip to reach,
 * and re-gripping at speed is a crash.
 *
 * They are apart by more than a thumb's width on purpose. These are the two
 * buttons you press *at the same moment* coming out of a corner, and two
 * targets that can be hit with one thumb are two targets you will hit with one
 * thumb by accident.
 *
 * They also sit wide enough to **frame the car rather than cover it**. The
 * first set of numbers put them at 0.38 and 0.62, which on a phone held
 * sideways is directly on top of the back of your own car — the one thing on
 * the screen you are actually reading, because the three ember lamps and both
 * brake lights are on it. Out at 0.3 and 0.7 they sit either side of it, still
 * well inside where a thumb falls without regripping.
 */
export const DEFAULT_LAYOUT: TouchLayout = {
  handbrake: { x: 0.3, y: 0.8 },
  boost: { x: 0.7, y: 0.8 },
  size: 0.14,
}

const LAYOUT_KEY = 'rally:touch-layout:v1'

/** Only the keys we know, only finite numbers, only on the screen. */
function clean(raw: unknown): TouchLayout {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_LAYOUT }
  const source = raw as Record<string, unknown>
  const spot = (value: unknown, fallback: Spot): Spot => {
    if (value === null || typeof value !== 'object') return { ...fallback }
    const it = value as Record<string, unknown>
    const num = (n: unknown, back: number) =>
      typeof n === 'number' && Number.isFinite(n) ? Math.max(0.04, Math.min(0.96, n)) : back
    return { x: num(it.x, fallback.x), y: num(it.y, fallback.y) }
  }
  const size =
    typeof source.size === 'number' && Number.isFinite(source.size)
      ? Math.max(0.07, Math.min(0.3, source.size))
      : DEFAULT_LAYOUT.size
  return {
    handbrake: spot(source.handbrake, DEFAULT_LAYOUT.handbrake),
    boost: spot(source.boost, DEFAULT_LAYOUT.boost),
    size,
  }
}

function read(): TouchLayout {
  if (typeof window === 'undefined') return { ...DEFAULT_LAYOUT }
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    return raw === null ? { ...DEFAULT_LAYOUT } : clean(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

function write(layout: TouchLayout): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* storage blocked; the buttons still work, the device just forgets */
  }
}

interface LayoutState {
  layout: TouchLayout
  move(which: 'handbrake' | 'boost', spot: Spot): void
  resize(size: number): void
  reset(): void
}

/**
 * This device only, and that is the right scope.
 *
 * Where a button should sit is a fact about the size of somebody's hands and
 * the phone they are holding, not about the garden — so it is not sent, not
 * shared, and not part of the car. It is the one setting in here that is
 * genuinely personal.
 */
export const useTouchLayout = create<LayoutState>((set, get) => ({
  layout: read(),
  move(which, spot) {
    const layout = {
      ...get().layout,
      [which]: {
        x: Math.max(0.06, Math.min(0.94, spot.x)),
        y: Math.max(0.1, Math.min(0.94, spot.y)),
      },
    }
    write(layout)
    set({ layout })
  },
  resize(size) {
    const layout = { ...get().layout, size: Math.max(0.07, Math.min(0.3, size)) }
    write(layout)
    set({ layout })
  },
  reset() {
    write(DEFAULT_LAYOUT)
    set({ layout: { ...DEFAULT_LAYOUT } })
  },
}))

// ---------------------------------------------------------------------------
// What the thumbs are doing
// ---------------------------------------------------------------------------

/**
 * Live input from the on-screen buttons.
 *
 * A plain mutable object rather than store state, for the same reason `deep`
 * and `storm` are: this is read by `controls.ts` inside the physics loop at a
 * hundred and twenty hertz, and a React subscription per frame per button is
 * the thing the technical law in `depth.ts` exists to prevent. The buttons
 * write it on pointerdown and pointerup — a handful of events a lap.
 */
export const thumb = {
  /** Held down right now. */
  handbrake: false,
  /**
   * One press, waiting to be spent.
   *
   * Edge-triggered like the keyboard's, so leaning on the button is one
   * measure of ember rather than the whole bar. Cleared by whoever reads it.
   */
  boost: false,
  /** −1, 0 or 1 — which side of the screen is being held. */
  steer: 0,
}

/** Everything let go of. For losing focus, pausing, and the end of a run. */
export function releaseThumbs(): void {
  thumb.handbrake = false
  thumb.boost = false
  thumb.steer = 0
}

// ---------------------------------------------------------------------------
// Whether any of this is on
// ---------------------------------------------------------------------------

/**
 * Is this a phone?
 *
 * `pointer: coarse` rather than a width or a user-agent string. A narrow
 * window on a laptop is not a phone and should keep its keyboard; a large
 * tablet is one and should get the buttons. It asks the right question —
 * "is the thing pointing at this screen a finger" — and it is the same test
 * the start lights already use to decide which words to say.
 */
export function drivingWithThumbs(): boolean {
  if (typeof matchMedia === 'undefined') return false
  return matchMedia('(pointer: coarse)').matches
}
