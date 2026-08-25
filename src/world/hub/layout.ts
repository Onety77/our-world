/**
 * Where the garden's five places stand.
 *
 * Two things decide this, and both were learned the hard way.
 *
 * **It is not at the origin.** The world terrain carves the river's valley
 * along x = 0 — a trench thirteen metres wide at the bed, five deep, with
 * banks out to thirty (see VALLEY in systems/terrain). The hub used to lay its
 * landmarks from −30 to +30, which put two of the four *at the bottom of that
 * trench* with no grass around them: `dryLand` strips the meadow out of the
 * channel on purpose, so the water can be seen. The Wellspring and the Hollow
 * were standing in a bare ditch and it read exactly as badly as it sounds. So
 * the garden sits well clear of the valley, out on open meadow.
 *
 * **It is not a row.** Even spacing along a line is a grid, and the design law
 * says grids read as forms. Each place is nudged off the line in z and given
 * its own gap, so swiping recomposes the frame instead of scrolling a
 * contact sheet past you.
 *
 * **The gaps are wide.** Thirty metres, not twenty-two. Each of these is a
 * real object eight to ten metres across, and packed closer than this the
 * neighbours crowd the edges of the frame — at one point a boulder off the
 * Hollow's mound filled a corner of the Stars. You should be able to see the
 * next place along, which is half of what makes the garden feel like a place
 * with somewhere else in it; you should not be standing inside it.
 */

import { groundHeight } from '@/systems/terrain'

/**
 * Far enough out that the whole garden — landmarks, treeline, stones — clears
 * the river's banks. The nearest tree in the ring lands around x = 68, well
 * past the thirty where the valley stops pulling the ground down.
 */
export const HUB_ORIGIN: [number, number] = [110, 0]

/**
 * How wide the wood around the garden is drawn.
 *
 * The inner radius has to clear where the camera *stands*, not where the
 * landmarks are. The camera sits back from whichever place is selected, and at
 * the two ends of the row that puts it up to forty-five metres out from the
 * centre — so a ring starting at forty-two put the viewer inside the treeline
 * with a canopy filling the entire frame.
 *
 * **Widened once, for the fifth place.** Five landmarks with the gaps the note
 * below insists on span a hundred and twelve metres rather than eighty-eight,
 * which puts the camera at the far ends about sixty-one metres out. Eighty
 * keeps the same nineteen metres of clearance the four had. The alternative
 * was tightening the gaps, and the whole point of the note below is that
 * tightening them is what crowds the neighbours into the frame.
 */
export const HUB_WOOD = { inner: 80, outer: 130 }

/**
 * Where the treeline opens, in radians, and how wide.
 *
 * Wide enough to span every position the camera takes, so the wood is always a
 * backdrop behind the garden and never a fence in front of it.
 */
export const HUB_OPENING = { at: Math.PI / 2, width: 1.15 }

export interface Anchor {
  /** World x, z. */
  x: number
  z: number
  /** Terrain height at that spot, precomputed — every frame would be waste. */
  y: number
  /** How far back the camera stands from it, in metres. */
  stand: number
  /** How high above its foot the resting frame is aimed, in metres. */
  aim: number
}

/**
 * The five places, in the order they are swiped through, as offsets from the
 * hub origin. Gaps vary between twenty-one and twenty-four metres and each
 * sits a few metres fore or aft of the line.
 *
 * Each carries its own framing, because they are nothing like the same size. A
 * single stand-back and aim height for all four cropped the top off a
 * thirteen-metre tree while leaving a stream lying flat and tiny in the
 * bottom of the frame. What the camera should do is what a person would do:
 * step back and look up at the tree, and walk in and look down at the water.
 */
const PLACES: { at: [number, number]; stand: number; aim: number }[] = [
  { at: [-56, 2.5], stand: 33, aim: 7.0 }, // the great tree — tall, so stand off
  { at: [-28, -7], stand: 20, aim: 1.1 }, // the stream — low and wide, so close in
  { at: [-1, 4], stand: 26, aim: 2.8 }, // the cave mouth
  { at: [27, -3.5], stand: 23, aim: 2.6 }, // the cairn and its two lights
  /*
    The Glasshouse — long, low and lying along the row rather than facing it.

    Appended, never inserted. Everything below indexes this array positionally
    and `HUB_STREAM` is measured off entry 1, so slotting a fifth place into
    the middle would move the Wellspring's water away from the Wellspring
    without a single test noticing.
  */
  { at: [56, 5], stand: 25, aim: 2.6 },
]

export const ANCHORS: readonly Anchor[] = PLACES.map(({ at: [dx, dz], stand, aim }) => {
  const x = HUB_ORIGIN[0] + dx
  const z = HUB_ORIGIN[1] + dz
  return { x, z, y: groundHeight(x, z), stand, aim }
})

/**
 * Where the camera should be looking, for a fractional position in the row.
 *
 * Takes a float because the slide is eased and spends most of its time
 * between two places — 1.4 is most of the way from the river to the hollow.
 * Interpolating the real anchors is what lets them sit off the line at all;
 * a camera that only ever moved along x would slide past them crookedly.
 */
export function anchorAt(position: number): Anchor {
  const last = ANCHORS.length - 1
  const clamped = Math.max(0, Math.min(last, position))
  const i = Math.floor(clamped)
  const j = Math.min(last, i + 1)
  const t = clamped - i
  const a = ANCHORS[i]
  const b = ANCHORS[j]
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    stand: a.stand + (b.stand - a.stand) * t,
    aim: a.aim + (b.aim - a.aim) * t,
  }
}

/**
 * The footprint of the stream at the Wellspring's landmark.
 *
 * The meadow has to be told to leave a gap here, the same way it already
 * leaves one for the world river's channel: grass is rooted at the terrain
 * height and grows perfectly happily *through* a water surface laid on top of
 * it, which is precisely as convincing as it sounds. An ellipse rather than a
 * disc, because the stream is long and narrow.
 *
 * Consumed as GLSL by `world/terrainShader.ts`, which interpolates these
 * numbers straight into the meadow's shader — so the gap and the water it
 * exists for cannot drift apart.
 */
export const HUB_STREAM = {
  x: ANCHORS[1].x,
  z: ANCHORS[1].z,
  /**
   * Half-extents. Tight — only just clear of the meander and the bank stones.
   *
   * Generous is wrong here. Every metre of gap wider than the water is a metre
   * of bare ground with nothing growing on it, and a bald ring around a stream
   * is more obviously wrong than a blade or two of grass at the edge.
   */
  rx: 5.9,
  rz: 14.0,
}
