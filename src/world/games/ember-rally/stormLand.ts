/**
 * The mountain under the Stormcrown.
 *
 * ---------------------------------------------------------------------------
 * **The road climbed a hundred and thirty-nine metres up nothing.** It was a
 * ribbon of asphalt with a three-metre skirt, laid in the sky: a flat black slab
 * under the Rainwood, and under the climb, the ledge, the stair and the ridge,
 * no ground at all. From the Eye it looked like a toy track hanging over a cloud
 * sea, and the only mountains were flat triangles standing some way off.
 *
 * So this builds the mountain, and builds it *out of the road* — the road is
 * authored and the mountain has to agree with every metre of it:
 *
 *   **a slope under every few metres of road**, falling away from its edge. Where
 *   the road runs along the windward face the fall is steep — the Cloud Shelf
 *   and the Crown are cut into cliffs — and in the Rainwood it is barely a slope
 *   at all, which is what a forest floor is. Taken as the highest of all of them
 *   at each point, the switchbacks of the Thunder Stair come out stacked on one
 *   hillside instead of floating past each other.
 *
 *   **massifs** where the old triangle peaks stood, so the mountains around the
 *   road are the same ground as the road, snow above the cloud line and all.
 *
 *   **a crag over every ford**, because the three waterfalls fall off something.
 *
 *   **and a ledge cut for the road**, carved afterwards so that nothing raised
 *   above ever lies across it: flat for a few metres past the edge the car is
 *   stopped at, then up at a cutting's angle.
 *
 * A grid of twelve-metre cells, cut into tiles. Below the cloud the fog closes
 * at sixty metres and only the tiles within it are drawn; above it, the tiles
 * that lie wholly under the cloud sea are left out, because the cloud is over
 * them.
 * ---------------------------------------------------------------------------
 */

import { BufferAttribute, BufferGeometry, Color, Sphere, Vector3 } from 'three'
import { basisAt, roadPoint } from './geometry'
import { CLOUD_TOP, STORMCROWN, emptyRoad, roadAt, vergeWidth, type Track } from './track'

/** Metres between heights. */
const CELL = 12
/** How far the mountain reaches past the furthest metre of road. */
const MARGIN = 460
/** The valley floor, far below the forest. */
const FLOOR = -26
/** Cells along a tile's side. */
const TILE = 20
/** How far under the road surface the ground under the ledge lies. The flank of the road reaches it. */
const UNDER = 2.6

function hash2(x: number, z: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return value - Math.floor(value)
}

function noise2(x: number, z: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  let fx = x - ix
  let fz = z - iz
  fx = fx * fx * (3 - 2 * fx)
  fz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz)
  const b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1)
  const d = hash2(ix + 1, iz + 1)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}

/** Rock that is rough at three scales, 0..1. */
function fbm(x: number, z: number): number {
  return noise2(x / 140, z / 140) * 0.55 + noise2(x / 55, z / 55) * 0.3 + noise2(x / 21, z / 21) * 0.15
}

const smooth = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

export interface MountainTile {
  geometry: BufferGeometry
  centre: Vector3
  radius: number
  /** The highest ground in it, so a tile wholly under the cloud sea can be left out. */
  top: number
}

export interface Mountain {
  tiles: MountainTile[]
  /** The height of the ground at a point in the world. */
  heightAt(x: number, z: number): number
  /** How steep the ground is there: rise over run. */
  slopeAt(x: number, z: number): number
}

/*
  Lighter than a mountain at night looks like it should be, for the reason the
  Rootway's rock had to be: under a storm's fill light and through the tone
  curve, dark rock is not dark, it is a hole in the frame.
*/
const FOREST_FLOOR = new Color('#2c3b33')
const SCREE = new Color('#565e5f')
const ROCK = new Color('#454d50')
const SNOW = new Color('#a9b3bc')

export function buildMountain(track: Track): Mountain {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < track.x.length; i += 4) {
    minX = Math.min(minX, track.x[i])
    maxX = Math.max(maxX, track.x[i])
    minZ = Math.min(minZ, track.z[i])
    maxZ = Math.max(maxZ, track.z[i])
  }
  const x0 = minX - MARGIN
  const z0 = minZ - MARGIN
  const nx = Math.ceil((maxX - minX + MARGIN * 2) / CELL) + 1
  const nz = Math.ceil((maxZ - minZ + MARGIN * 2) / CELL) + 1
  const H = new Float32Array(nx * nz).fill(FLOOR)
  const road = emptyRoad()
  const point = new Vector3()

  /** Visit every cell within `reach` metres of a point. */
  const around = (x: number, z: number, reach: number, visit: (k: number, d: number) => void) => {
    const i0 = Math.max(0, Math.floor((x - reach - x0) / CELL))
    const i1 = Math.min(nx - 1, Math.ceil((x + reach - x0) / CELL))
    const j0 = Math.max(0, Math.floor((z - reach - z0) / CELL))
    const j1 = Math.min(nz - 1, Math.ceil((z + reach - z0) / CELL))
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + j * CELL - z
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * CELL - x
        const d = Math.sqrt(dx * dx + dz * dz)
        if (d <= reach) visit(j * nx + i, d)
      }
    }
  }

  const inside = (s: number, span: { from: number; to: number }) => s > span.from && s < span.to

  // --- the slope under the road ---------------------------------------------
  for (let s = 0; s <= track.length; s += 6) {
    roadAt(track, s, road)
    const wall = road.width + vergeWidth(road.room)
    const forest = s < STORMCROWN.climb.from - 30 || s > STORMCROWN.lastRun.from + 260
    const cliff = inside(s, STORMCROWN.cloudShelf) || inside(s, STORMCROWN.crown) ? 0.75 : 0
    const k = forest ? 0.12 : 0.6 + noise2(s / 180, 3.7) * 0.9 + cliff
    const flat = wall + 8
    const top = road.y - UNDER
    const reach = Math.min(MARGIN - 20, flat + (top - FLOOR) / k)
    around(road.x, road.z, reach, (cell, d) => {
      const h = top - k * Math.max(0, d - flat)
      if (h > H[cell]) H[cell] = h
    })
  }

  // --- the massifs the old peaks stood for ----------------------------------
  let peakSeed = 400
  for (let s = STORMCROWN.cloudShelf.from + 70; s < STORMCROWN.lastRun.from; s += 235) {
    const side = peakSeed % 2 === 0 ? -1 : 1
    roadAt(track, s, road)
    // Well out: at a hundred and fifty metres their flanks buried the Cloud Shelf in a canyon.
    const out = road.width + 240 + hash2(peakSeed, 8.2) * 150
    roadPoint(road, side * out, 0, point, basisAt(road))
    const summit = road.y + 62 + hash2(peakSeed, 9.4) * 58
    const k = 0.58 + hash2(peakSeed, 3.1) * 0.25
    const seed = peakSeed
    around(point.x, point.z, Math.min(440, (summit - FLOOR) / k), (cell, d) => {
      const i = cell % nx
      const j = (cell - i) / nx
      // Ridged: shoulders and gullies down the flanks rather than a cone.
      const ridge = Math.abs(noise2((x0 + i * CELL) / 70 + seed, (z0 + j * CELL) / 70) - 0.5) * 2
      const h = summit - k * d - ridge * d * 0.08
      if (h > H[cell]) H[cell] = h
    })
    peakSeed++
  }

  // --- a crag over every ford -----------------------------------------------
  STORMCROWN.waterfalls.forEach((s, index) => {
    const side = index % 2 === 0 ? -1 : 1
    roadAt(track, s, road)
    const wall = road.width + vergeWidth(road.room)
    roadPoint(road, side * (wall + 20), 0, point, basisAt(road))
    const top = road.y + 34
    around(point.x, point.z, (top - FLOOR) / 1.5, (cell, d) => {
      const h = top - 1.5 * Math.max(0, d - 6)
      if (h > H[cell]) H[cell] = h
    })
  })

  // --- rock is not smooth ---------------------------------------------------
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * CELL
      const z = z0 + j * CELL
      H[j * nx + i] += (fbm(x, z) - 0.5) * 7
    }
  }

  // --- nothing stands beside the road where the gale has a clean run ---------
  /*
    The Cloud Shelf, Gale Bend and the Crown are exposed: that is what the gale
    in the physics *is*, and the road's own notes say "there is nothing either
    side". So wherever the road is that exposed, the ground is held down below
    it for a hundred metres out on both sides, and whatever mountain there is
    stands beyond. Built first without this, the shelf came out in a canyon.
  */
  for (let s = 0; s <= track.length; s += 4) {
    roadAt(track, s, road)
    if (road.gale < 0.75) continue
    const flat = road.width + vergeWidth(road.room) + 8
    const floor = road.y - UNDER
    around(road.x, road.z, flat + 110, (cell, d) => {
      const allowed = floor - 0.45 * Math.max(0, d - flat)
      if (H[cell] > allowed) H[cell] = allowed
    })
  }

  // --- and the ledge the road is cut into -----------------------------------
  for (let s = 0; s <= track.length; s += 3) {
    roadAt(track, s, road)
    const flat = road.width + vergeWidth(road.room) + 8
    const floor = road.y - UNDER
    around(road.x, road.z, flat + 30, (cell, d) => {
      const allowed = floor + 1.4 * Math.max(0, d - flat)
      if (H[cell] > allowed) H[cell] = allowed
    })
  }

  const heightOf = (i: number, j: number) => H[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))]

  // --- tiles ------------------------------------------------------------------
  const tiles: MountainTile[] = []
  const colour = new Color()
  for (let tz = 0; tz * TILE < nz - 1; tz++) {
    for (let tx = 0; tx * TILE < nx - 1; tx++) {
      const iFrom = tx * TILE
      const iTo = Math.min(nx - 1, (tx + 1) * TILE)
      const jFrom = tz * TILE
      const jTo = Math.min(nz - 1, (tz + 1) * TILE)
      const w = iTo - iFrom + 1
      const position: number[] = []
      const normal: number[] = []
      const col: number[] = []
      const surface: number[] = []
      const index: number[] = []
      let top = -Infinity
      let sumY = 0
      for (let j = jFrom; j <= jTo; j++) {
        for (let i = iFrom; i <= iTo; i++) {
          const y = heightOf(i, j)
          const x = x0 + i * CELL
          const z = z0 + j * CELL
          position.push(x, y, z)
          top = Math.max(top, y)
          sumY += y
          // Normals off the whole field, so no tile has a seam where its edge is.
          const dx = heightOf(i - 1, j) - heightOf(i + 1, j)
          const dz = heightOf(i, j - 1) - heightOf(i, j + 1)
          const length = Math.hypot(dx, 2 * CELL, dz)
          normal.push(dx / length, (2 * CELL) / length, dz / length)
          const slope = Math.hypot(dx, dz) / (2 * CELL)
          const steep = smooth(0.5, 1.15, slope)
          colour.copy(FOREST_FLOOR).lerp(SCREE, smooth(35, 95, y))
          colour.lerp(ROCK, steep)
          // Snow from the top of the cloud up, and only where it can lie.
          colour.lerp(SNOW, smooth(CLOUD_TOP - 4, CLOUD_TOP + 16, y) * (1 - steep * 0.85))
          colour.multiplyScalar(0.86 + hash2(i, j) * 0.24)
          col.push(colour.r, colour.g, colour.b)
          const wet = y < CLOUD_TOP ? 0.5 : 0.18
          // Rough enough for the rock shader's grain and its beds of strata to
          // show; the veins that roughness also allows are turned nearly off on
          // this road (see the Stormcrown's vein colour in `Race`).
          surface.push(wet, 0.45)
        }
      }
      for (let j = 0; j < jTo - jFrom; j++) {
        for (let i = 0; i < w - 1; i++) {
          const a = j * w + i
          const b = a + 1
          const d = a + w
          const c = d + 1
          index.push(a, d, c, a, c, b)
        }
      }
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3))
      geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(col), 3))
      geometry.setAttribute('aSurface', new BufferAttribute(new Float32Array(surface), 2))
      geometry.setIndex(index)
      const cx = x0 + ((iFrom + iTo) / 2) * CELL
      const cz = z0 + ((jFrom + jTo) / 2) * CELL
      const centre = new Vector3(cx, sumY / (position.length / 3), cz)
      const radius = Math.hypot((iTo - iFrom) * CELL, (jTo - jFrom) * CELL) / 2 + Math.max(40, top - centre.y)
      geometry.boundingSphere = new Sphere(centre.clone(), radius)
      tiles.push({ geometry, centre, radius, top })
    }
  }

  const heightAt = (x: number, z: number) => {
    const fi = (x - x0) / CELL
    const fj = (z - z0) / CELL
    const i = Math.floor(fi)
    const j = Math.floor(fj)
    const u = fi - i
    const v = fj - j
    const a = heightOf(i, j)
    const b = heightOf(i + 1, j)
    const c = heightOf(i, j + 1)
    const d = heightOf(i + 1, j + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  const slopeAt = (x: number, z: number) => {
    const dx = heightAt(x + CELL, z) - heightAt(x - CELL, z)
    const dz = heightAt(x, z + CELL) - heightAt(x, z - CELL)
    return Math.hypot(dx, dz) / (2 * CELL)
  }

  return { tiles, heightAt, slopeAt }
}
