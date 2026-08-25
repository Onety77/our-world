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

import { makeRng, range, seedFrom } from '@/systems/rng'
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
export const HALF = 2.85

/** Where the walls stop being vertical and the roof starts to curve over. */
export const EAVE = 2.3

/** The ridge, at the middle of the roof. */
export const RIDGE = 3.85

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
export const DWARF = 0.62

/**
 * Distance between one bay of ironwork and the next.
 *
 * Three and a bit metres. Wide enough that a two-metre pane sits inside a bay
 * with iron either side of it rather than being cut by it, and tight enough
 * that a hundred memories is a corridor rather than a runway.
 */
export const BAY = 3.25

/**
 * How much glass a memory gets, in square metres, before its shape is decided.
 *
 * Constant *area* rather than constant height, which is what makes a portrait
 * come out tall and narrow and a landscape wide and low without either of them
 * being bigger than the other. A shared height would make a panorama enormous
 * and a phone photograph a slot; a shared width does the reverse.
 */
const AREA = 2.15

/**
 * And it has to fit the panel it is set into.
 *
 * A memory does not hang *on* the wall, it *is* one of the wall's panels — so
 * these are the bay and the glazed height, less a margin for the iron round
 * it. The first version let a pane be any size and float wherever, and it read
 * exactly as it was: banners hung in a shelter, rather than glass in a
 * building.
 */
const WIDEST = BAY - 0.62
const TALLEST = EAVE - DWARF - 0.24

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

    slots.push({
      side,
      bay,
      /*
        The centre of its bay, give or take.

        A memory occupies a *panel* of the wall — one bay wide, between the
        dwarf wall and the eaves — so it can only wander within it. The first
        version let z drift freely and the panes ended up straddling the ribs,
        which is what made them read as things hung in front of the building
        rather than as part of it.
      */
      z: bay * BAY + BAY / 2 + range(rng, -0.1, 0.1),
      /*
        And never all at one height.

        All on a shared centreline the wall reads as a picture rail, which is
        the gallery this place is specifically not. `paneAt` clamps this
        against the pane's own size, so a tall one settles lower on its own.
      */
      y: range(rng, DWARF + 0.55, EAVE - 0.5),
      inset: range(rng, 0.03, 0.09),
      tilt: range(rng, -0.025, 0.025),
    })
  }
  return slots[want]
}

/**
 * How big the glass is, given the shape of what is behind it.
 *
 * From the stored pixel dimensions, never from the decoded image — the pane has
 * to be cut before anything has been fetched, and a pane that resizes when its
 * photograph arrives would make the whole wall twitch as you walked past it.
 */
export function paneSize(width: number, height: number): { w: number; h: number } {
  const aspect = Math.max(0.2, Math.min(5, width / Math.max(1, height)))
  let w = Math.sqrt(AREA * aspect)
  let h = Math.sqrt(AREA / aspect)
  if (w > WIDEST) {
    h *= WIDEST / w
    w = WIDEST
  }
  if (h > TALLEST) {
    w *= TALLEST / h
    h = TALLEST
  }
  return { w, h }
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
