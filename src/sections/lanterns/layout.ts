/**
 * The shape of the Lantern Walk, and where each memory hangs along it.
 *
 * ---------------------------------------------------------------------------
 * **The one rule this file exists to keep: a lantern never moves.**
 *
 * `sFor` takes the memory's index in the *oldest-first* list, and that index is
 * permanent — a new memory is appended and renumbers nothing. The same law the
 * letters follow, for the same reason: a thing you left somewhere has to still
 * be there. Ordering newest-first would be far more natural to write and would
 * shift every lantern on the walk one place along every time either of you kept
 * a photograph.
 *
 * So the lane grows *away from its head*, the oldest memory hangs at s = 0, and
 * you arrive at the far end where the newest is. Which means walking forward —
 * the only direction there is out here — is walking back through everything the
 * two of you have kept, and the deep end of the walk, the overgrown end where
 * the first pictures are, is the one you have to go to.
 * ---------------------------------------------------------------------------
 *
 * **Why a lane, and why it bends.**
 *
 * The room this replaced hung its pictures on two walls that ran parallel to
 * the way you were travelling, which means they were permanently seen edge-on —
 * its own notes record a focused picture occupying twenty-eight pixels on a
 * phone, and the fix was to rotate the entire building twenty-two degrees about
 * the viewer every time one was chosen. That is a workaround for the shape
 * being wrong, and it is what made moving through the place feel like being
 * steered.
 *
 * Here nothing rotates about anybody. Every lantern is turned, once and
 * permanently, to face the piece of path you will be standing on when you reach
 * it — see `facingFor`. Face-on is a property of where the lantern was hung
 * rather than something the camera has to arrange, and the lane is then free to
 * wander, which is what makes a chain of lights read as a chain rather than as
 * a row.
 */

import { groundHeight } from '@/systems/terrain'

/**
 * Where the walk lies, in world metres.
 *
 * ---------------------------------------------------------------------------
 * Offset in X, like the Tree and like the room that stood here before it, and
 * for exactly the same reason. Sections render at the origin, but the *terrain*
 * is one shared height function for the whole world — and it carves the river's
 * valley along x = 0: a trench thirteen metres wide and five deep with the
 * grass stripped out of it. Anything put at the origin lies at the bottom of
 * that, in a bare channel.
 * ---------------------------------------------------------------------------
 */
export const WALK_X = 340


/**
 * Distance along the lane from one memory to the next, in metres.
 *
 * Four and a bit. Close enough that three or four lanterns are in the frame at
 * once — one lantern at a time is a slideshow, and a slideshow is what this
 * place must never be — and far enough that they do not overlap on the bends,
 * where the lane foreshortens and two lanterns can otherwise land on top of
 * each other.
 */
export const SPACING = 5.4

/**
 * How far to the side of the centreline a lantern hangs.
 *
 * They alternate, so this is half the width of the corridor of light. Wider and
 * you walk between two separate rows of pictures with nothing in the middle;
 * tighter and the posts crowd the path you are supposed to be walking down.
 */
export const VERGE = 2.15

/**
 * How far ahead of a lantern the walker is when it should be face-on.
 *
 * A lantern is turned to face the path *this* many metres back towards where
 * you are coming from, so it is square to you as you come up to it rather than
 * as you pass it. Roughly one and a half spacings: the lantern you are looking
 * at is the one after next, not the one at your shoulder.
 */
const FACING = 6.4

/** The lantern's own height above the path — its light at eye level. */
export const LANTERN_Y = 1.62

/**
 * Every lantern is this shape, and this size, in metres.
 *
 * ---------------------------------------------------------------------------
 * **One ratio, and the pictures are cropped to it.**
 *
 * Panes cut to whatever shape the photograph happened to be is the
 * respectful-sounding option and it looks like a jumble: a row of rectangles in
 * six proportions reads as a noticeboard, and the eye spends its attention on
 * the *outlines* instead of on what is inside them. Identical frames disappear,
 * and once they disappear you are looking at photographs.
 *
 * Three by two, because it is what cameras actually shoot. The crop is authored
 * when the memory is kept and applied in the shader; nothing is cropped when a
 * memory is *opened*, which shows the whole photograph at its own proportions.
 * ---------------------------------------------------------------------------
 */
export const GLASS_W = 1.45
export const GLASS_H = GLASS_W * (2 / 3)

/**
 * The size of one lantern's glass, from the shape of the photograph in it.
 *
 * ---------------------------------------------------------------------------
 * **Nothing is cropped any more, and the reason the old room cropped does not
 * apply out here.**
 *
 * A wall of frames in six proportions reads as a noticeboard — the eye spends
 * its attention on the *outlines* instead of on what is inside them — so the
 * Glasshouse cut every photograph to three by two and the frames disappeared.
 * That argument is about a wall. On a lane the lanterns are metres apart, hung
 * at different angles, seen one or two at a time against trees: there is no row
 * of outlines to be distracted by, and a tall photograph on a post is just a
 * tall lantern. Cutting the sides off somebody's picture to make a shape nobody
 * was going to notice is a real loss for no gain.
 *
 * So the width is fixed and the height follows the picture. Fixed width because
 * that is what keeps the chain reading as a chain, and because the post, the
 * hood and the arm are all built off it.
 *
 * Clamped at both ends, which is not a crop — the picture is never cut, it is
 * only stopped from becoming a lantern taller than the post that holds it or a
 * letterbox too thin to see. A panorama and a phone portrait both land inside
 * this comfortably; it is there for the accident, not the ordinary case.
 * ---------------------------------------------------------------------------
 */
export function paneSize(width: number, height: number): { w: number; h: number } {
  const shape = Math.max(0.05, height) / Math.max(0.05, width)
  const w = Math.min(GLASS_W, 1.8 / shape)
  return { w, h: w * shape }
}

/**
 * The centreline, as a wander rather than a curve with a name.
 *
 * Two harmonics, well apart, so the lane never repeats inside a walk anybody
 * will take and never reads as a sine wave. The long one does the work — a bend
 * every sixty-two metres, which is about fourteen memories — and the short one
 * keeps the straights from being straight.
 *
 * Amplitudes are chosen against their own periods rather than by eye, because
 * what matters is the *slope*: 6.0 over 62 metres and 1.4 over 34 put the
 * steepest heading at about forty degrees, which is a lane finding its way
 * around something. Past that it stops being a path and becomes a slalom.
 */
const LONG_A = 6.0
const LONG_K = (Math.PI * 2) / 62
const SHORT_A = 1.4
const SHORT_K = (Math.PI * 2) / 34

/** Sideways offset of the centreline at `s`, in metres. */
function wander(s: number): number {
  return LONG_A * Math.sin(s * LONG_K) + SHORT_A * Math.sin(s * SHORT_K + 1.1)
}

/** Its slope, which is the heading — see `pathAt`. */
function wanderSlope(s: number): number {
  return LONG_A * LONG_K * Math.cos(s * LONG_K) + SHORT_A * SHORT_K * Math.cos(s * SHORT_K + 1.1)
}

/**
 * The height the lane is graded to.
 *
 * ---------------------------------------------------------------------------
 * **Level, and that is forced by how the world draws its ground rather than by
 * taste.** The meadow is one plane that *follows the camera*, displaced in the
 * vertex shader by the shared height function — so the ground under your feet
 * is whatever the terrain says where the camera is standing. Travel here works
 * the way it does everywhere in the garden: the place slides past a camera that
 * never moves. Those two facts together mean anything bedded into the terrain
 * at the position it was authored would rise and sink as the lane slid
 * underneath it, because the ground it was measured against is not the ground
 * it ends up over. The room that stood here met the same wall and answered it
 * with a plinth.
 *
 * A graded path is the honest version of that rather than a workaround — a lane
 * cut across a hillside *is* level, which is what makes it a lane and not a
 * scramble — and it means a lantern hangs at the same height at both ends of
 * the walk, which is what lets the chain read as a chain instead of as
 * something falling downhill.
 *
 * Sampled above the highest ground it will ever cross, over a length far past
 * anything two people will fill, so it is fixed for good rather than rising as
 * memories are kept. `Lane` lays its own shelf at this height and skirts down
 * to the meadow at the edges.
 * ---------------------------------------------------------------------------
 */
export const WALK_Y = (() => {
  /*
    The height of the meadow where you are standing, and not a metre more.

    It was the *maximum* over nine hundred metres of route, copied from the
    plinth the room here used to need — which put the lane two and a half metres
    above the grass and left everything on it hanging in the air. That plinth
    was clearing terrain the building actually crossed. This clears nothing,
    because `Lane` brings its own ground and the world's is not drawn: the only
    thing this number has to do is agree with the horizon and the distant wood,
    which are still the world's.
  */
  let sum = 0
  let n = 0
  for (let s = -8; s <= 8; s += 2, n++) sum += groundHeight(WALK_X + wander(s), -s)
  return sum / n
})()

export interface PathPoint {
  /** World X. */
  x: number
  /** World Y — the meadow's own height, which the lane follows. */
  y: number
  /** World Z. The lane runs away down negative Z. */
  z: number
  /** Heading, as a rotation about Y. Zero looks down negative Z. */
  yaw: number
}

/**
 * Where the lane is, `s` metres along it from the oldest memory.
 *
 * ---------------------------------------------------------------------------
 * **`s` is a parameter, not an arc length, and the difference is deliberate.**
 *
 * True arc length along a wandering curve has no closed form, so it would have
 * to be integrated and cached — and the thing it would buy is lanterns exactly
 * 4.35 metres apart along the *curve* instead of 4.35 apart along Z. On the
 * steepest part of the wander that is a spacing error of about a fifth, which
 * nobody can see on a path whose whole character is that it wanders.
 *
 * What it would cost is a table to keep, invalidated whenever the shape
 * changes, and an inverse to solve every frame to find out where you are
 * standing. Travel is measured in this same parameter, so the two agree
 * exactly, which is the property that actually matters.
 * ---------------------------------------------------------------------------
 *
 * **The lane follows the meadow rather than sitting on a plinth.** The room
 * that stood here needed a level floor and so was built on one, above the
 * highest ground it would ever cross. A path has no such problem: it goes over
 * what is there, and the meadow's own roll — about four and a half metres in a
 * hundred — is what lifts the far lanterns above the near ones and lets you see
 * the whole chain at once.
 */
export function pathAt(s: number): PathPoint {
  /*
    `s` runs along positive Z, and the sign matters more than it looks.

    You arrive at the *head* of the lane, where the newest memory is, and walk
    towards s = 0 where the oldest one is. The scene carries the lane so that
    the point you are standing on sits at the camera, which means everything
    with a smaller `s` than yours must end up in front of the camera — and the
    camera, like everywhere else in this world, looks down negative Z.

    With the lane laid out along negative Z instead, every memory landed
    *behind* the viewer: you arrived at a walk you had already finished, facing
    an empty meadow, with eighteen lanterns lit at your back.
  */
  return {
    x: WALK_X + wander(s),
    y: WALK_Y,
    z: s,
    yaw: Math.atan(wanderSlope(s)),
  }
}

/** How far along the lane the memory at `index` hangs. Oldest first, always. */
export function sFor(index: number): number {
  return index * SPACING
}

/**
 * Which side of the lane a lantern hangs on: -1 left, +1 right.
 *
 * Strict alternation rather than anything random. A random side leaves gaps
 * where three in a row land together and the corridor stops being a corridor,
 * and it is the sort of thing that looks like a bug the one time it happens
 * badly. Alternating also means the two of you are never systematically on
 * different sides, which a seeded choice by author would quietly do.
 */
export function sideFor(index: number): number {
  return index % 2 === 0 ? -1 : 1
}

/** Where a lantern hangs, and which way it faces. */
export interface Hanging {
  x: number
  y: number
  z: number
  /** Rotation about Y that turns its face towards where you will stand. */
  yaw: number
}

/**
 * Where memory `index` hangs, and the direction it is turned.
 *
 * The position is the lane offset sideways by `VERGE`, along the *normal* of
 * the centreline rather than straight along X — on a bend those differ by
 * enough to push a lantern into the path or out into the trees.
 *
 * The facing is the whole argument of this place: it looks at the point on the
 * path `FACING` metres back towards the head of the lane, which is where you
 * are standing when it is the thing you are looking at.
 */
export function hangingFor(index: number): Hanging {
  const s = sFor(index)
  const here = pathAt(s)
  const side = sideFor(index)

  // The normal of the centreline, so the offset is square to the lane.
  const nx = Math.cos(here.yaw) * side
  const nz = Math.sin(here.yaw) * side

  const x = here.x + nx * VERGE
  const z = here.z + nz * VERGE

  const look = pathAt(s + FACING)
  return { x, y: WALK_Y + LANTERN_Y, z, yaw: Math.atan2(look.x - x, look.z - z) }
}

/**
 * How far down the lane the empty lantern waits.
 *
 * One place past the newest memory, which is where you arrive: the next thing
 * to be kept goes at the head of the walk, and the walk grows away from you.
 * With nothing kept at all it stands at zero, alone, on a path nobody has worn
 * yet — which is the honest picture of an empty archive and the reason this
 * place does not need an empty state drawn for it.
 */
export function headFor(count: number): number {
  return sFor(count)
}
