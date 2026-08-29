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
 *   four buttons at the bottom      a handbrake and an ember under *each*
 *                                   thumb — see the note on mirroring below
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

/**
 * Two positions, four buttons.
 *
 * ---------------------------------------------------------------------------
 * **Both controls exist under both thumbs**, mirrored across the middle of the
 * screen, with the handbrakes on the outside and the embers inboard.
 *
 * The first version had one of each — handbrake left, ember right — and that
 * is one of each only if you never need them together. You do, constantly: the
 * ember is what cancels a drift and leaves you going fast, so *pull, hold,
 * fire* is the whole move, and with one on each side it is two thumbs crossing
 * the screen to do it. Duplicated, the move belongs to whichever hand is free.
 *
 * The handbrakes go outboard because that is the deeper reach and the
 * handbrake is the one you commit to; the embers sit inboard where a thumb
 * rests, because that is the one pressed mid-corner without looking.
 *
 * **Stored as two spots, drawn as four.** The right pair is the left pair
 * reflected — `x → 1 − x` — so a layout cannot end up lopsided, and the panel
 * in `/dev7731` stays two things to drag rather than four to keep level.
 * ---------------------------------------------------------------------------
 */
export interface TouchLayout {
  /** The outer button on the left. Its mirror is the outer one on the right. */
  handbrake: Spot
  /** The inner button on the left. Its mirror is the inner one on the right. */
  boost: Spot
  /** Across the smaller side of the screen, so a button is round at any size. */
  size: number
}

/** The same spot, on the other side of the screen. */
export function mirrored(spot: Spot): Spot {
  return { x: 1 - spot.x, y: spot.y }
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
  handbrake: { x: 0.16, y: 0.8 },
  boost: { x: 0.36, y: 0.8 },
  size: 0.13,
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

/** This device's own arrangement, or null if it has never been given one. */
function read(): TouchLayout | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    return raw === null ? null : clean(JSON.parse(raw))
  } catch {
    return null
  }
}

function write(layout: TouchLayout | null): void {
  if (typeof window === 'undefined') return
  try {
    if (layout === null) localStorage.removeItem(LAYOUT_KEY)
    else localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* storage blocked; the buttons still work, the device just forgets */
  }
}

interface LayoutState {
  /** What the buttons are actually drawn at: this device's, or the sent one. */
  layout: TouchLayout
  /** What was sent to both of you, if anything has been. */
  published: TouchLayout | null
  /** This device's own arrangement. Null means "whatever was sent". */
  own: TouchLayout | null
  move(which: 'handbrake' | 'boost', spot: Spot): void
  resize(size: number): void
  /** Back to the sent arrangement, or to the defaults if none was sent. */
  reset(): void
  receivePublished(values: Record<string, unknown>): void
}

/*
  Sent, and kept, and the reason the first answer was wrong.

  This used to be device-only, and the argument for it was good: where a button
  sits is a fact about somebody's hands, not about the garden. What that missed
  is *where it gets arranged*. The only screen that can arrange it is the
  control room at `/dev7731`, and nobody drags four thumb buttons around on
  the phone they are about to race on — they do it on a laptop, with a mouse,
  looking at a picture of a phone. Then nothing changes on the phone, because
  the phone was never told, and there is no button to press because it had
  already saved. Correct, instant, and useless.

  So there are two layers now, exactly as the car has:

    published   what was sent to both of you, from the control room
    this device this phone's own arrangement, if it has been given one

  The device wins where it has an opinion, which keeps the original argument
  intact — her hands are not your hands, and a phone that has been arranged by
  hand should not be rearranged from a laptop. It just no longer means a laptop
  can do nothing at all.

  It travels in the car's own tuning document, as five more finite numbers. See
  the note on `rallyTuning` in `firestore.rules`: that rule deliberately does
  not enumerate its fields, precisely so it can carry a small bag of numbers
  without a rules change every time the car gains one.
*/

/** The layout as plain numbers, for the document it is sent in. */
export function asNumbers(layout: TouchLayout): Record<string, number> {
  return {
    thumbHandbrakeX: layout.handbrake.x,
    thumbHandbrakeY: layout.handbrake.y,
    thumbBoostX: layout.boost.x,
    thumbBoostY: layout.boost.y,
    thumbSize: layout.size,
  }
}

/** And back, or null if the numbers are not all there. */
export function fromNumbers(values: Record<string, unknown>): TouchLayout | null {
  const at = (key: string) => {
    const value = values[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }
  const hx = at('thumbHandbrakeX')
  const hy = at('thumbHandbrakeY')
  const bx = at('thumbBoostX')
  const by = at('thumbBoostY')
  const size = at('thumbSize')
  if (hx === null || hy === null || bx === null || by === null || size === null) return null
  return clean({ handbrake: { x: hx, y: hy }, boost: { x: bx, y: by }, size })
}
/** This device's own if it has one, else what was sent, else the defaults. */
function showing(own: TouchLayout | null, published: TouchLayout | null): TouchLayout {
  return own ?? published ?? { ...DEFAULT_LAYOUT }
}

export const useTouchLayout = create<LayoutState>((set, get) => {
  const own = read()
  /** Dragging anything makes this device's arrangement its own. */
  const nudge = (change: (from: TouchLayout) => TouchLayout) => {
    const layout = change(get().layout)
    write(layout)
    set({ own: layout, layout })
  }

  return {
    layout: showing(own, null),
    published: null,
    own,

    move(which, spot) {
      nudge((from) => ({
        ...from,
        [which]: {
          x: Math.max(0.06, Math.min(0.94, spot.x)),
          y: Math.max(0.1, Math.min(0.94, spot.y)),
        },
      }))
    },

    resize(size) {
      nudge((from) => ({ ...from, size: Math.max(0.07, Math.min(0.3, size)) }))
    },

    /*
      Back to the sent arrangement, not to the defaults.

      "Reset" on a device that has been given a layout means "stop overriding
      it", the same as dropping a draft of the car. With nothing sent there is
      nothing to fall back to but the numbers in this file, which is the old
      behaviour and still the right one.
    */
    reset() {
      write(null)
      set({ own: null, layout: showing(null, get().published) })
    },

    receivePublished(values) {
      const published = fromNumbers(values)
      if (published === null) return
      set({ published, layout: showing(get().own, published) })
    },
  }
})

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
