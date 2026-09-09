/**
 * The shape of the Fold, and where an animal stands in it.
 *
 * ---------------------------------------------------------------------------
 * **This place lays its own ground, and unlike the Lantern Walk it is not
 * because it travels.**
 *
 * The world's terrain is a gentle roll — `groundHeight` swings about two and a
 * half metres over eighty, which is a meadow and is exactly right for the four
 * places that stand still on it. What this section needs is a *slope you can
 * read distance up*: the entire readout here is that a kept practice is near
 * and a dropped one is far, and on flat ground an animal at forty metres and an
 * animal at twelve are two smudges the same distance below the horizon.
 *
 * A fold in the land solves it with no interface at all. The far ones are
 * *higher up the opposite side*, so they are separated vertically in frame as
 * well as by size — and the ridge gives the mist a definite far wall to be
 * pulled back to, which is the other half of the design.
 *
 * Adding a bump to `groundHeight` was the alternative and it is not available:
 * that function is shared by the meadow, the treeline, the flowers, the garden
 * hub and every other place, so a hill here would be a hill under the Tree.
 * ---------------------------------------------------------------------------
 */

import { groundHeight } from '@/systems/terrain'

/**
 * Where the Fold is, in world metres.
 *
 * Well clear of everything: the river's trench is at x = 0, the garden hub at
 * 110, the Tree's meadow at 220 and the Lantern Walk at 340. Far enough out
 * that nothing of this place's own ground can ever overlap another's.
 */
export const FOLD_X = 480

/** The height the world's meadow is at here, which the lip is levelled to. */
export const FOLD_Y = groundHeight(FOLD_X, 0)

/** Where you stand: on the near lip, at the top of the fall. */
export const LIP_Z = 6

/** The bottom of the fold, and how far below the lip it lies. */
const FLOOR_Z = -25
const DEPTH = 5.4

/** The far ridge, and how far above the lip it stands. */
const RIDGE_Z = -58
const RIDGE = 3.1

/** How far the ground is drawn in every direction. Past the fog, always. */
export const REACH = 104

/**
 * A raised cosine — 1 at `centre`, 0 at `half` either side, smooth at both ends.
 *
 * Used instead of a Gaussian because it reaches zero at a stated distance
 * rather than asymptotically, which means the ground outside the fold is
 * genuinely the meadow's own level and not the meadow plus a millimetre of
 * hill going on forever.
 */
function swell(v: number, centre: number, half: number): number {
  const t = Math.abs(v - centre) / half
  if (t >= 1) return 0
  return 0.5 + 0.5 * Math.cos(t * Math.PI)
}

/**
 * The ground, in the section's own coordinates.
 *
 * `z` runs away from you down the fold; `x` is across it. Both are offsets from
 * the anchor, not world coordinates — the whole place is drawn in a group at
 * `[FOLD_X, FOLD_Y, 0]`.
 */
export function foldHeight(x: number, z: number): number {
  // The fold itself: down into the bottom, up onto the far ridge.
  let h = -DEPTH * swell(z, FLOOR_Z, 40) + RIDGE * swell(z, RIDGE_Z, 30)

  /*
    And the sides come up, which is what makes it a fold rather than a step.

    Quadratic in the distance across, capped: without the cap the ground at the
    edge of `REACH` would be a hundred metres in the air.
  */
  const across = Math.min(1, Math.abs(x) / 52)
  h += across * across * 4.2

  /*
    Roughness, so it is a hillside and not a machined dish. Two frequencies well
    apart, small — the design law's "imperfect on purpose", and at this scale a
    quarter of a metre is the difference between grazing land and a skate ramp.
  */
  h += Math.sin(x * 0.09 + 1.7) * Math.cos(z * 0.075) * 0.34
  h += Math.sin((x + z) * 0.031 + 0.4) * 0.22

  return h
}

/** The slope, for standing an animal on the ground rather than through it. */
export function foldNormal(x: number, z: number, eps = 0.8): [number, number, number] {
  const l = foldHeight(x - eps, z)
  const r = foldHeight(x + eps, z)
  const d = foldHeight(x, z - eps)
  const u = foldHeight(x, z + eps)
  const nx = l - r
  const nz = d - u
  const ny = 2 * eps
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

/**
 * Where an animal stands, from how far away its practice has let it get.
 *
 * ---------------------------------------------------------------------------
 * `away` is 0..1 out of `conditionOf`. The near end is deliberately not at your
 * feet — nine metres, so a well-kept animal is *near* rather than *in your
 * face*, and there is somewhere nearer for it to walk to when it comes over.
 *
 * The sideways offset is a hash of the practice id rather than an index. An
 * index would re-shuffle the whole hill the day somebody takes a new practice
 * in, and an animal that moves because a *different* animal arrived is the one
 * thing here that would read as a bug. The same fact the Lantern Walk's
 * `sFor` protects, for the same reason.
 * ---------------------------------------------------------------------------
 */
export function standingFor(id: string, away: number): { x: number; z: number } {
  /*
    ---------------------------------------------------------------------------
    **A mixing hash, not `hash * 31 + c`.**

    The multiply-and-add hash is fine for a hash *table*, where all that matters
    is that different strings land in different buckets. Used as a *position* it
    fails in a way that is obvious on screen and invisible in the source: ids
    sharing a prefix — and every id here does, they are all "seed-practice-…" —
    come out with almost the same low bits. The first render put three of the
    four animals within thirty pixels of each other, two of them overlapping,
    and it looked like a placement bug rather than a hashing one.

    Two rounds of xor-shift and a multiply spread the low bits properly, and
    taking the two coordinates from *different* parts of the word stops them
    correlating with each other.
    ---------------------------------------------------------------------------
  */
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  hash ^= hash >>> 15
  hash = Math.imul(hash, 2246822507) >>> 0
  hash ^= hash >>> 13

  const unit = (bits: number) => ((hash >>> bits) & 4095) / 4095

  /*
    The near end is three metres down the slope, which with the camera on the
    lip puts a well-kept animal about twelve metres away — near enough to read
    as a companion. It was nine, which measured from where you actually stand
    came out at nineteen, and nineteen metres is scenery.
  */
  const t = Math.max(0, Math.min(1, away))
  const z = -3 - t * 48 + (unit(20) - 0.5) * 5

  /*
    ---------------------------------------------------------------------------
    **Spread in proportion to distance, so the herd is a constant *angle* wide
    rather than a constant number of metres.**

    A flat nine metres either side works on a desktop and puts animals off the
    side of a phone, which is the trap PLAN.md states as a law: section cameras
    are composed for a landscape frame and the field of view is vertical, so a
    portrait screen sees exactly as much sky and far less to either side. At
    twenty-four metres a portrait frame is under six metres wide — and the first
    phone screenshot had the crane at x = 441 on a 393-pixel screen, entirely
    outside the picture, while the desktop shot of the same moment looked fine.

    A quarter of the distance keeps every animal inside the narrowest frame this
    world is used on, and still separates two standing at the same depth.
    ---------------------------------------------------------------------------
  */
  const away2 = 10 + t * 48
  const spread = away2 * 0.25
  const x = (unit(4) * 2 - 1) * spread

  return { x, z }
}

/** Where the broken wall runs, as a line of points across the fold. */
export const WALL_Z = -31
