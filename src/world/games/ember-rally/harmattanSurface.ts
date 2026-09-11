/**
 * The Harmattan's cross-section, as the road and the physics agree on it.
 *
 * Shared by `Harmattan.tsx`, which draws the road across it, and by
 * `harmattanLand`, which keeps the drawn verge on the same plane the wheels are
 * supported on. The wheels themselves stand on the drawn mesh — see
 * `roadSurface` — so nothing here is a second copy of the road; it is the one
 * description the drawing is made from.
 */

import { HARMATTAN, vergeWidth, type RoadAt } from './track'

export const HARMATTAN_RING = 2
export const HARMATTAN_PROFILE = 13

/** The drawn cross-section: thirteen offsets across the road, and their heights above it. */
export function harmattanProfile(road: RoadAt, s: number) {
  const town = s > HARMATTAN.gateAt - 20 && s < HARMATTAN.gateOut + 12
  const out = road.width + vergeWidth(road.room) + (town ? 10 : 6 + road.room * 22)
  return {
    offsets: [-out, -out, -road.width, -road.width * .92, -road.width * .62,
      -road.width * .31, 0, road.width * .31, road.width * .62,
      road.width * .92, road.width, out, out],
    heights: [town ? -.3 : -1.1, town ? .02 : .34,
      .02, .05, .075, .092, .1, .092, .075, .05, .02,
      town ? .02 : .34, town ? -.3 : -1.1],
  }
}
