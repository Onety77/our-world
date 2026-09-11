/**
 * The surface the wheels stand on — which is the one that is drawn.
 *
 * ---------------------------------------------------------------------------
 * The car used to be placed from one sample of the road under its middle: the
 * road's height, its grade and its bank, and every wheel at its resting height.
 * That is where the road is *written down*, and the road as drawn is not quite
 * there — it has a crown, the verge rises to a lip, a hairpin is banked, the
 * Swaying Span's deck rolls in the shader — so the tyres spent their time a few
 * centimetres into the stone or hovering over it, worst on a slope or turned
 * across the camber.
 *
 * The first fix, on the Harmattan, rebuilt that road's cross-section a second
 * time in a separate file and stood the wheels on the copy. It worked until the
 * road was redrawn a day later and the copy was not: two descriptions of one
 * road will not stay the same road.
 *
 * So this samples the mesh that is actually rendered. Every road builder marks
 * which of its triangles a wheel may stand on — the road, the verge, the deck
 * boards of the span — and hands them here with the chunk; this indexes them in
 * a grid over the ground and answers "how high is the drawn surface here". One
 * sampler for all four roads and both routes of the Rootway, and it cannot
 * disagree with the picture because it *is* the picture.
 *
 * Two things it has to know beyond the triangles:
 *
 *   **which road, when roads cross or stack.** The Thunder Stair's switchbacks
 *   lie twenty metres over each other, the Rootwake runs thirty under the
 *   Rootway, and on one seed the Rootway crosses *itself* with half a metre
 *   between the two floors. So every triangle remembers which stretch of road it
 *   was built for — the chunk's metres — and a query says where along the road
 *   the car is; only that stretch answers. Among what is left, only surfaces
 *   near the road's written height count, and the highest wins, which is how
 *   the deck boards win over the dark under them.
 *
 *   **the Swaying Span.** Its vertices carry `aSwing` and `aSwayPhase`, and the
 *   rock shader moves them each frame. A triangle that swings is moved here by
 *   the same formula from the same three constants, so the wheels ride the deck
 *   as it is drawn on this frame and not as it rests.
 * ---------------------------------------------------------------------------
 */

import type { BufferGeometry } from 'three'
import { SWAY_RATE, SWAY_ROLL, SWAY_WAVE, type Track } from './track'

/** What a road builder hands over: the drawn geometry, the metres of road it covers, and which of its index a wheel may stand on. */
export interface TreadChunk {
  from: number
  to: number
  geometry: BufferGeometry
  /** Flat pairs of [from, to) over the geometry's index. Absent: nothing drivable in this chunk. */
  tread?: number[]
}

/** How far a wheel can be, along the road, from the metres of the chunk under it. A car is four metres long. */
const REACH = 8

/** The plane of the surface under a point, for whoever needs its slope as well as its height. */
export interface Support {
  /** The height of the surface at the point asked about. */
  y: number
  /** y = dx·x + dz·z + c over this triangle. */
  dx: number
  dz: number
}

export interface RoadSurface {
  /**
   * The drawn surface under `(x, z)` for a car `s` metres along the road: the
   * highest one within `window` metres of `near`. Returns false and leaves
   * `out` alone when there is none.
   */
  supportAt(x: number, z: number, s: number, near: number, window: number, elapsed: number, out: Support): boolean
  /** How many triangles a wheel can stand on. */
  readonly count: number
}

/** Metres a grid cell is on a side. About a car's length: a query touches one cell, sometimes two. */
const CELL = 3
/** Faces steeper than this are walls and skirts, not floors, however they were marked. */
const UP_LEAST = 0.5

const surfaces = new WeakMap<Track, RoadSurface>()

/** The surface of a road that has been laid, if it has. */
export function surfaceOf(track: Track): RoadSurface | undefined {
  return surfaces.get(track)
}

/**
 * Index the drivable triangles of a road's drawn chunks, and remember them for
 * the track. Called where the chunks are built, so the wheels always stand on
 * what that frame is about to draw.
 */
export function laySurface(track: Track, chunks: readonly TreadChunk[]): RoadSurface {
  const surface = buildSurface(chunks)
  surfaces.set(track, surface)
  return surface
}

function buildSurface(chunks: readonly TreadChunk[]): RoadSurface {
  // --- gather --------------------------------------------------------------
  let total = 0
  for (const chunk of chunks) {
    if (!chunk.tread) continue
    for (let r = 0; r < chunk.tread.length; r += 2) total += (chunk.tread[r + 1] - chunk.tread[r]) / 3
  }
  /** Nine floats a triangle: the three corners, at rest. */
  const corners = new Float32Array(total * 9)
  /** The metres of road each triangle was built for: the first and last of its chunk. */
  const fromS = new Float32Array(total)
  const toS = new Float32Array(total)
  /** Where each corner goes when the deck rolls one radian, and (sway, s) of its ring; only the span has any. */
  let swing: Float32Array | null = null
  let phase: Float32Array | null = null
  let count = 0
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const chunk of chunks) {
    if (!chunk.tread) continue
    const geometry = chunk.geometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!index) continue
    const swings = geometry.getAttribute('aSwing')
    const phases = geometry.getAttribute('aSwayPhase')
    for (let r = 0; r < chunk.tread.length; r += 2) {
      for (let i = chunk.tread[r]; i + 2 < chunk.tread[r + 1]; i += 3) {
        const a = index.getX(i)
        const b = index.getX(i + 1)
        const c = index.getX(i + 2)
        const ax = position.getX(a)
        const ay = position.getY(a)
        const az = position.getZ(a)
        const bx = position.getX(b)
        const by = position.getY(b)
        const bz = position.getZ(b)
        const cx = position.getX(c)
        const cy = position.getY(c)
        const cz = position.getZ(c)
        // Only floors: the marked ranges can include a box's sides and a skirt.
        const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
        const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
        const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
        if (length < 1e-9 || Math.abs(ny) / length < UP_LEAST) continue
        const at = count * 9
        fromS[count] = chunk.from
        toS[count] = chunk.to
        corners[at] = ax
        corners[at + 1] = ay
        corners[at + 2] = az
        corners[at + 3] = bx
        corners[at + 4] = by
        corners[at + 5] = bz
        corners[at + 6] = cx
        corners[at + 7] = cy
        corners[at + 8] = cz
        if (swings && phases && (phases.getX(a) > 0.002 || phases.getX(b) > 0.002 || phases.getX(c) > 0.002)) {
          swing ??= new Float32Array(total * 9)
          phase ??= new Float32Array(total * 6)
          for (const [k, v] of [[0, a], [1, b], [2, c]] as const) {
            swing[at + k * 3] = swings.getX(v)
            swing[at + k * 3 + 1] = swings.getY(v)
            swing[at + k * 3 + 2] = swings.getZ(v)
            phase[count * 6 + k * 2] = phases.getX(v)
            phase[count * 6 + k * 2 + 1] = phases.getY(v)
          }
        }
        minX = Math.min(minX, ax, bx, cx)
        maxX = Math.max(maxX, ax, bx, cx)
        minZ = Math.min(minZ, az, bz, cz)
        maxZ = Math.max(maxZ, az, bz, cz)
        count++
      }
    }
  }

  // --- the grid, as a compressed row: counts, then offsets, then the fill ----
  const x0 = Number.isFinite(minX) ? minX - CELL : 0
  const z0 = Number.isFinite(minZ) ? minZ - CELL : 0
  const nx = Number.isFinite(minX) ? Math.ceil((maxX - x0) / CELL) + 2 : 1
  const nz = Number.isFinite(minZ) ? Math.ceil((maxZ - z0) / CELL) + 2 : 1
  const cellOf = (x: number, z: number) => {
    const i = Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / CELL)))
    const j = Math.max(0, Math.min(nz - 1, Math.floor((z - z0) / CELL)))
    return j * nx + i
  }
  const starts = new Int32Array(nx * nz + 1)
  const span = (t: number, visit: (cell: number) => void) => {
    const at = t * 9
    const lowX = Math.min(corners[at], corners[at + 3], corners[at + 6])
    const highX = Math.max(corners[at], corners[at + 3], corners[at + 6])
    const lowZ = Math.min(corners[at + 2], corners[at + 5], corners[at + 8])
    const highZ = Math.max(corners[at + 2], corners[at + 5], corners[at + 8])
    const i0 = Math.max(0, Math.floor((lowX - x0) / CELL))
    const i1 = Math.min(nx - 1, Math.floor((highX - x0) / CELL))
    const j0 = Math.max(0, Math.floor((lowZ - z0) / CELL))
    const j1 = Math.min(nz - 1, Math.floor((highZ - z0) / CELL))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) visit(j * nx + i)
  }
  for (let t = 0; t < count; t++) span(t, (cell) => starts[cell + 1]++)
  for (let cell = 0; cell < nx * nz; cell++) starts[cell + 1] += starts[cell]
  const fill = new Int32Array(starts[nx * nz])
  const cursor = starts.slice(0, nx * nz)
  for (let t = 0; t < count; t++) span(t, (cell) => { fill[cursor[cell]++] = t })

  // --- one triangle's corners on this frame, swung if it swings -------------
  const p = new Float32Array(9)
  const cornersNow = (t: number, elapsed: number) => {
    const at = t * 9
    for (let k = 0; k < 9; k++) p[k] = corners[at + k]
    if (swing && phase && (phase[t * 6] > 0.002 || phase[t * 6 + 2] > 0.002 || phase[t * 6 + 4] > 0.002)) {
      for (let k = 0; k < 3; k++) {
        const amount = phase[t * 6 + k * 2]
        if (amount <= 0.002) continue
        // The rock shader's own line, with `uSway` = (clock, SWAY_ROLL, SWAY_RATE, SWAY_WAVE).
        const roll = -SWAY_ROLL * amount * Math.sin(elapsed * SWAY_RATE - phase[t * 6 + k * 2 + 1] * SWAY_WAVE)
        const s = Math.sin(roll)
        p[k * 3] += swing[at + k * 3] * s
        p[k * 3 + 1] += swing[at + k * 3 + 1] * s
        p[k * 3 + 2] += swing[at + k * 3 + 2] * s
      }
    }
    return p
  }

  const supportAt = (x: number, z: number, s: number, near: number, window: number, elapsed: number, out: Support) => {
    const cell = cellOf(x, z)
    let best = -Infinity
    let bestDx = 0
    let bestDz = 0
    for (let f = starts[cell]; f < starts[cell + 1]; f++) {
      const t = fill[f]
      // Another stretch of the same road, crossing over or under this one.
      if (s < fromS[t] - REACH || s > toS[t] + REACH) continue
      const q = cornersNow(t, elapsed)
      const ax = q[0]
      const ay = q[1]
      const az = q[2]
      const bx = q[3] - ax
      const by = q[4] - ay
      const bz = q[5] - az
      const cx = q[6] - ax
      const cy = q[7] - ay
      const cz = q[8] - az
      const det = bx * cz - bz * cx
      if (Math.abs(det) < 1e-10) continue
      const px = x - ax
      const pz = z - az
      const u = (px * cz - pz * cx) / det
      const v = (bx * pz - bz * px) / det
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue
      const y = ay + u * by + v * cy
      if (Math.abs(y - near) > window || y <= best) continue
      best = y
      // The plane through the three corners, as height per metre of x and z.
      bestDx = (by * cz - cy * bz) / det
      bestDz = (bx * cy - cx * by) / det
    }
    if (best === -Infinity) return false
    out.y = best
    out.dx = bestDx
    out.dz = bestDz
    return true
  }

  return { supportAt, count }
}
