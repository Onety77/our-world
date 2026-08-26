/**
 * The shape of the Glasshouse, and where each memory hangs in it.
 *
 * ---------------------------------------------------------------------------
 * **The one rule this file exists to keep: a pane never moves.**
 *
 * `slotFor` takes the memory's index in the *oldest-first* list, and that index
 * is permanent — a new memory is appended and renumbers nothing. The same law
 * the letters follow, for the same reason: a thing you left somewhere has to
 * still be there. Ordering newest-first would be far more natural to write and
 * would shift every pane in the building one bay every time either of you hung
 * a photograph.
 *
 * So the building grows *away from the origin*, the oldest memory stands at
 * z = 0, and you arrive at the far end where the newest is. Which means
 * travelling forward — the only direction there is in here — is travelling
 * backwards through everything the two of you have kept, and the deep end of
 * the Glasshouse, the mossy overgrown end where the first pictures are, is the
 * one you have to walk to.
 * ---------------------------------------------------------------------------
 */

import { makeRng, seedFrom } from '@/systems/rng'
import { groundHeight } from '@/systems/terrain'

/**
 * Where the Glasshouse stands, in world metres.
 *
 * ---------------------------------------------------------------------------
 * **Offset in X, like the Tree, and for exactly the same reason.** Sections
 * render at the origin, but the *terrain* is one shared height function for
 * the whole world — and it carves the river's valley along x = 0: a trench
 * thirteen metres wide and five deep with the grass stripped out of it. A
 * building put at the origin stands at the bottom of that, in a bare channel.
 * The Tree of Thoughts spent a while down there before anybody noticed.
 * ---------------------------------------------------------------------------
 */
export const GLASS_X = 340

/**
 * The height of the terrace it is built on.
 *
 * A hundred metres of building lying along Z crosses about four and a half
 * metres of meadow roll, and a conservatory does not undulate. So it sits on a
 * level plinth set *above* the highest ground it will ever cross, and the
 * plinth is deep enough to meet the lowest — which is what a real one is, and
 * why they are always up a step.
 *
 * Sampled over a length far beyond anything two people will fill, so the
 * terrace height is fixed forever rather than rising as memories are hung.
 */
export const GLASS_Y = (() => {
  let top = -Infinity
  for (let z = -20; z < 620; z += 2) top = Math.max(top, groundHeight(GLASS_X, z))
  return top + 0.12
})()

/** How far down the plinth reaches, so the meadow never pokes up through it. */
export const PLINTH = 7

/**
 * Half the width of the aisle floor, in metres.
 *
 * Under three, and it was three and a half. A conservatory you could drive
 * down is a railway station: the panes end up small in the frame, the two
 * walls are too far apart to be seen at once, and the whole thing reads as
 * scale rather than as somewhere you are standing. Close enough that both
 * walls are in view is what makes it intimate.
 */
export const HALF = 2.62

/** Where the walls stop being vertical and the roof starts to curve over. */
export const EAVE = 2.52

/** The ridge, at the middle of the roof. */
export const RIDGE = 3.95

/**
 * The dwarf wall — the low course of stone the glazing starts on top of.
 *
 * Every real conservatory has one, and it turned out to be doing three jobs
 * here at once. It hides the join between the flagstones and the meadow
 * outside; it stops the eye reading straight out at floor level, which made
 * the first version look like a bus shelter; and it puts every pane above knee
 * height, so a wall of photographs is something you look *at* rather than
 * down at.
 */
export const DWARF = 0.5

/**
 * Distance between one bay of ironwork and the next.
 *
 * Three and a bit metres. Wide enough that a two-metre pane sits inside a bay
 * with iron either side of it rather than being cut by it, and tight enough
 * that a hundred memories is a corridor rather than a runway.
 */
export const BAY = 3.25

/**
 * Every frame in the building is this shape, and this size.
 *
 * ---------------------------------------------------------------------------
 * **One ratio, and the pictures are cropped to it.**
 *
 * Panes used to be cut to whatever shape the photograph happened to be, which
 * is the respectful-sounding option and looks like a jumble: a wall of
 * rectangles in six proportions reads as a noticeboard, and the eye spends its
 * attention on the *outlines* instead of on what is inside them. Identical
 * frames disappear, and once the frames disappear you are looking at the
 * photographs — which is the entire point of the place and the thing it was
 * getting wrong.
 *
 * Three by two, because it is what cameras actually shoot, and because at this
 * bay it is the ratio that makes the pane biggest: 2.34 across a 3.12 panel,
 * with iron either side and almost none wasted. A square would give up a third
 * of the area and four by three nearly a fifth.
 *
 * The crop is centred and happens in the shader, off the stored dimensions —
 * see `cropFor`. Nothing is cropped when a memory is *opened*: that shows the
 * whole photograph at its own proportions, which is where a picture is
 * actually looked at.
 * ---------------------------------------------------------------------------
 */
export const FRAME_RATIO = 3 / 2

/** How wide the glass is, in metres. The panel less an iron margin. */
export const FRAME_W = BAY - 0.9
/** And how tall, from the ratio. */
export const FRAME_H = FRAME_W / FRAME_RATIO

export interface Slot {
  /** -1 left wall, 1 right wall. */
  side: -1 | 1
  /** Along the building. Oldest at 0, growing with the index. */
  z: number
  /** Centre height above the floor. */
  y: number
  /** How far in from the wall plane it hangs — glass is set into iron. */
  inset: number
  /** A degree or two off true. Nothing in here was hung by a machine. */
  tilt: number
  /** Which bay of the ironwork this pane belongs to. */
  bay: number
}

/**
 * Every slot worked out so far.
 *
 * ---------------------------------------------------------------------------
 * A cache, and it has to be one. Which bay a pane stands in depends on every
 * pane before it — that is what stops the building being a grid — so working
 * one out from scratch means walking the whole list, and drawing a wall of two
 * hundred panes that way is forty thousand steps *per frame*.
 *
 * It only ever grows, and each entry is decided by a hash of its own index, so
 * extending it can never change an entry already in it. That is the property
 * that matters: this is a cache of a pure function, not a pile of state.
 * ---------------------------------------------------------------------------
 */
const slots: Slot[] = []

/**
 * Where memory `index` hangs. Pure, and stable forever.
 *
 * Two panes share a bay when they are on opposite walls, and the sides mostly
 * alternate — mostly, because strict alternation is a pattern the eye finds in
 * about four seconds and then the building is a grid with curved edges. The
 * hash decides, so it is the same building on both of your phones.
 */
export function slotFor(index: number): Slot {
  const want = Math.max(0, Math.floor(index))
  while (slots.length <= want) {
    const i = slots.length
    const rng = makeRng(seedFrom(`glasshouse:slot:${i}`))
    const before = slots[i - 1]

    let side: -1 | 1 = 1
    let bay = 0
    if (before) {
      // Same side twice in a row about one time in five. Strict alternation is
      // a pattern the eye finds immediately; this one it does not.
      side = rng() < 0.8 ? ((-before.side) as -1 | 1) : before.side
      // A new bay whenever we cross back to a side already used in this one,
      // and sometimes anyway — so some bays hold one pane and some hold three.
      bay = before.bay + (side === before.side || rng() < 0.55 ? 1 : 0)
    }

    /*
      Dead centre of its bay, on one line, with no tilt.

      -------------------------------------------------------------------------
      **Every scrap of randomness here was a mistake, and it took looking at a
      wall of them to see it.**

      The height wandered between the dwarf wall and the eaves, the z drifted a
      little either way, and each pane sat a degree or two off true. The
      reasoning was that a shared centreline reads as a picture rail and nothing
      in here was hung by a machine — which is a fine argument about *one* pane
      and completely wrong about twenty. Down a wall it does not read as
      hand-hung, it reads as **misaligned**: the eye is very good at spotting a
      line that is nearly straight, and it spends all its attention on the
      wobble instead of on the photographs.

      It is the same lesson as the frames all being one shape. Regularity
      disappears, and disappearing is the job — the building should stop being
      something you notice. What is left irregular is the *placement*: which
      bay, which side, and how many bays get skipped. That is where the
      looseness belongs, because that is a fact about how the two of you filled
      the building rather than about how carefully anybody hung anything.

      And it is what makes the open state possible at all. A pane that is
      exactly perpendicular to the wall, at a known height, projects to a clean
      rectangle on screen — which is what the photograph aligns itself to when
      you open it. A tilt of two degrees is enough to make that impossible.
      -------------------------------------------------------------------------
    */
    slots.push({
      side,
      bay,
      z: bay * BAY + BAY / 2,
      /** One line, at about the height a picture is hung. */
      y: DWARF + (EAVE - DWARF) / 2,
      /** Set into the iron by the same amount everywhere. */
      inset: 0.06,
      tilt: 0,
    })
  }
  return slots[want]
}

/** Every pane, always. Kept as a function because every call site had one. */
export function paneSize(): { w: number; h: number } {
  return { w: FRAME_W, h: FRAME_H }
}

/**
 * How to sample a photograph so it fills the frame without being stretched.
 *
 * Returns the scale to apply to uv *about its centre*: the long axis of the
 * source is squeezed until what is left matches the frame, which is a centred
 * crop. A portrait loses its top and bottom, a panorama loses its ends, and
 * neither is ever distorted — a stretched face is worse than a cropped one by
 * a distance that is not close.
 *
 * From the stored dimensions rather than the decoded image, because the pane
 * has to be cut before anything has been fetched. A pane that re-cropped when
 * its photograph arrived would make the whole wall twitch as you walked past.
 */
export function cropFor(width: number, height: number): [number, number] {
  const source = Math.max(0.05, width) / Math.max(0.05, height)
  return source > FRAME_RATIO
    ? [FRAME_RATIO / source, 1]
    : [1, source / FRAME_RATIO]
}

/**
 * The point on the wall a pane's centre sits at.
 *
 * One answer, because three things need to agree about it and they will
 * otherwise drift: the quad that draws the glass, the pool of colour it throws
 * on the floor, and the target you tap to open it. The Tree of Thoughts spent a
 * long time with a paper you could see and a target somewhere else entirely.
 *
 * The height is clamped against the pane's own size rather than being the slot's
 * alone, because the slot is decided before anybody knows what shape the
 * photograph is: a tall portrait hung at the same centre as a wide landscape
 * goes straight through the eaves at the top and into the floor at the bottom.
 */
export function paneAt(slot: Slot, height: number): [number, number, number] {
  const lowest = DWARF + 0.1 + height / 2
  const highest = EAVE - 0.12 - height / 2
  const y = highest <= lowest ? (lowest + highest) / 2 : Math.min(highest, Math.max(lowest, slot.y))
  return [slot.side * (HALF - slot.inset), y, slot.z]
}

/**
 * How far along the building the whole thing has been built, in metres.
 *
 * The empty frame counts: the ironwork always runs one bay past the last
 * memory, so there is somewhere for the next one to go and the end of the
 * building is never a wall you have arrived at.
 */
export function builtTo(count: number): number {
  return slotFor(Math.max(0, count)).bay * BAY
}

/**
 * How much of the screen an open memory should take.
 *
 * ---------------------------------------------------------------------------
 * **A distance in metres cannot be the answer, and it took two viewports to
 * see it.**
 *
 * Standing five metres from a pane fills ninety-nine per cent of a phone's
 * width and twenty-eight per cent of a laptop's. Same building, same pane,
 * same distance — the aspect does all of it, which is the very thing
 * `backOffFor` exists in SlideCamera to deal with and the same mistake made
 * again one level down. So the distance is solved from the size you want the
 * pane to *end up*, and the numbers that stay fixed are these two.
 *
 * Height first, because it is the honest one: the vertical field of view does
 * not change with the shape of the screen, so "a bit under half the height" is
 * the same picture on a phone and on a laptop. Width is a ceiling on top of
 * it, for wide screens where filling the height would run the pane off the
 * sides.
 * ---------------------------------------------------------------------------
 */
export const OPEN_HEIGHT = 0.46
/** And never wider than this much of it. */
export const OPEN_WIDTH = 0.9

/**
 * And how far back you may stand, which the building decides.
 *
 * The pane is `HALF - inset` from the middle of the aisle and the wall behind
 * you is `HALF` the other way, so anything past their sum is standing outside
 * in the meadow looking in through the near glazing — a photograph beautifully
 * framed against a flat grey nothing, which is exactly what it looked like.
 * The margin keeps you a hand's width inside.
 */
const FURTHEST = 2 * HALF - 0.24
/** Close enough to read it, no closer. Under this the pane overruns the screen. */
const NEAREST = 2.4

/** Set from a test. `?shot=1` only — see the verbs in the scene. */
let forced = 0
export function forceStand(metres: number): void {
  forced = metres
}

/**
 * Where to stand to open the pane, in metres from its glass.
 *
 * Perspective, backwards: a pane `FRAME_H` tall fills `OPEN_HEIGHT` of the
 * screen at exactly one distance, and this is that distance — then the same
 * sum for the width, then whichever asks you to stand further, then the walls.
 */
export function standFor(fovDegrees: number, aspect: number): number {
  if (forced) return forced
  // What one metre at one metre's distance covers, as a fraction of the screen.
  const spread = 2 * Math.tan((fovDegrees * Math.PI) / 360)
  const forHeight = FRAME_H / (OPEN_HEIGHT * spread)
  const forWidth = FRAME_W / (OPEN_WIDTH * spread * Math.max(0.2, aspect))
  return Math.min(FURTHEST, Math.max(NEAREST, Math.max(forHeight, forWidth)))
}
