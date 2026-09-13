/**
 * The threads the thoughts hang on, as ropes — the simulation, with nothing
 * drawn. See `world/Letters` for why, and `scripts/threads-check.ts` for the
 * proof that a thread never ends up inside the wood.
 *
 * Verlet integration at a fixed sixty steps a second, a handful of constraint
 * passes, collisions against a spatial hash of the wood. Positions are in the
 * tree's own space: foot at the origin.
 */

import { groundHeight } from '@/systems/terrain'
import { bendNow } from './treeWind'
import type { AncientTree } from '@/sections/tree/greatTree'

export const STEP = 1 / 60
/** How long a piece of thread is between points, in metres. */
const SEGMENT = 0.38
const ITERATIONS = 5
/** How much of its velocity a point keeps each step: the air. */
const DAMP = 0.992
/** How far a thread point stands off the wood, and a paper's edge. */
export const THREAD_RADIUS = 0.025
export const PAPER_RADIUS = 0.19
const CELL = 1.0
/** How much a point touching wood keeps of its sliding: the bark's grip. */
const FRICTION = 0.55

export interface RopeSpec {
  /** The knot, in the world. */
  knot: readonly [number, number, number]
  /** Thread from knot to the top of the sheet. */
  drop: number
}

export interface Ropes {
  /** Per rope: first particle index and number of thread segments. */
  start: Int32Array
  segments: Int32Array
  segLength: Float32Array
  /** Tree-local knot, for the bend. */
  knot: Float32Array
  pos: Float32Array
  prev: Float32Array
  /** Inverse mass: 0 pinned, 1 thread, less for the paper. */
  inv: Float32Array
  radius: Float32Array
  /** 0 thread, 1 the paper's top, 2 the paper's bottom. */
  role: Uint8Array
  count: number
  ropes: number
  paperHeight: number
}

export interface Wood {
  /** a.xyz, b.xyz, r — tree-local, as grown. */
  cap: Float32Array
  /**
   * The same, bent by the wind for the current step: ax az bx bz, then the
   * bounding sphere's centre x y z and radius². Worked out once a step rather
   * than once for every point that looks at a capsule.
   */
  bent: Float32Array
  /** Cell key → capsule indices. */
  grid: Map<number, Int32Array>
  count: number
}

const keyOf = (ix: number, iy: number, iz: number) => (ix + 512) * 1048576 + (iy + 512) * 1024 + (iz + 512)

export function buildWood(tree: AncientTree): Wood {
  const cap = new Float32Array(tree.capsules.length * 7)
  const lists = new Map<number, number[]>()
  tree.capsules.forEach((c, i) => {
    cap.set([c.a[0], c.a[1], c.a[2], c.b[0], c.b[1], c.b[2], c.r], i * 7)
    // Reach: the radius, the fattest thing that meets it, and room for the bend.
    const pad = c.r + PAPER_RADIUS + 0.7
    const x0 = Math.floor((Math.min(c.a[0], c.b[0]) - pad) / CELL)
    const x1 = Math.floor((Math.max(c.a[0], c.b[0]) + pad) / CELL)
    const y0 = Math.floor((Math.min(c.a[1], c.b[1]) - pad) / CELL)
    const y1 = Math.floor((Math.max(c.a[1], c.b[1]) + pad) / CELL)
    const z0 = Math.floor((Math.min(c.a[2], c.b[2]) - pad) / CELL)
    const z1 = Math.floor((Math.max(c.a[2], c.b[2]) + pad) / CELL)
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const k = keyOf(x, y, z)
          const list = lists.get(k)
          if (list) list.push(i)
          else lists.set(k, [i])
        }
  })
  const grid = new Map<number, Int32Array>()
  for (const [k, list] of lists) grid.set(k, Int32Array.from(list))
  return { cap, bent: new Float32Array(tree.capsules.length * 8), grid, count: tree.capsules.length }
}

/** Bend the wood for this step. */
function bendWood(wood: Wood, B: number) {
  const { cap, bent } = wood
  for (let i = 0; i < wood.count; i++) {
    const o = i * 7
    const q = i * 8
    const ay = cap[o + 1], by = cap[o + 4]
    const ba = B * ay * ay, bb = B * by * by
    const ax = cap[o] + ba, az = cap[o + 2] + ba * 0.4
    const bx = cap[o + 3] + bb, bz = cap[o + 5] + bb * 0.4
    bent[q] = ax
    bent[q + 1] = az
    bent[q + 2] = bx
    bent[q + 3] = bz
    bent[q + 4] = (ax + bx) / 2
    bent[q + 5] = (ay + by) / 2
    bent[q + 6] = (az + bz) / 2
    const half = Math.hypot(bx - ax, by - ay, bz - az) / 2 + cap[o + 6] + PAPER_RADIUS
    bent[q + 7] = half * half
  }
}

export function buildRopes(specs: readonly RopeSpec[], foot: readonly [number, number, number], paperHeight: number): Ropes {
  let count = 0
  const segments = new Int32Array(specs.length)
  specs.forEach((h, i) => {
    segments[i] = Math.max(3, Math.min(22, Math.round(h.drop / SEGMENT)))
    // Thread points (segments + 1, the last being the paper's top) and the paper's bottom.
    count += segments[i] + 2
  })
  const r: Ropes = {
    start: new Int32Array(specs.length),
    segments,
    segLength: new Float32Array(specs.length),
    knot: new Float32Array(specs.length * 3),
    pos: new Float32Array(count * 3),
    prev: new Float32Array(count * 3),
    inv: new Float32Array(count),
    radius: new Float32Array(count),
    role: new Uint8Array(count),
    count,
    ropes: specs.length,
    paperHeight,
  }
  let p = 0
  specs.forEach((h, i) => {
    r.start[i] = p
    const n = segments[i]
    r.segLength[i] = h.drop / n
    const kx = h.knot[0] - foot[0]
    const ky = h.knot[1] - foot[1]
    const kz = h.knot[2] - foot[2]
    r.knot.set([kx, ky, kz], i * 3)
    for (let s = 0; s <= n + 1; s++) {
      const y = s <= n ? ky - (h.drop * s) / n : ky - h.drop - paperHeight
      // A little lean per rope so a curtain of them does not start as a ruler.
      const lean = s * 0.004 * Math.sin(i * 2.4)
      r.pos.set([kx + lean, y, kz], (p + s) * 3)
      r.prev.set([kx + lean, y, kz], (p + s) * 3)
      r.inv[p + s] = s === 0 ? 0 : s >= n ? 0.35 : 1
      r.radius[p + s] = s >= n ? PAPER_RADIUS : THREAD_RADIUS
      r.role[p + s] = s === n ? 1 : s === n + 1 ? 2 : 0
    }
    p += n + 2
  })
  return r
}

/** The air at a moment: a slow turning direction, gusting. Metres per second. */
function windAt(time: number, wind: number) {
  const heading = 0.7 + Math.sin(time * 0.043) * 0.9
  const gust = 0.45 + 0.55 * (Math.sin(time * 0.37) * 0.5 + 0.5) * (Math.sin(time * 0.13 + 1.1) * 0.5 + 0.5)
  return { x: Math.cos(heading) * wind * 1.6, z: Math.sin(heading) * wind * 1.6, gust }
}

/** One fixed step of the whole curtain. `time` is the tree's clock at the end of the step. */
export function stepRopes(r: Ropes, wood: Wood, foot: readonly [number, number, number], time: number, wind: number) {
  const B = bendNow(foot, time)
  bendWood(wood, B)
  const pos = r.pos
  const prev = r.prev
  const dt2 = STEP * STEP
  const air = windAt(time, wind)

  for (let k = 0; k < r.ropes; k++) {
    const s0 = r.start[k]
    const last = s0 + r.segments[k] + 1
    // Each thread in its own eddy of the gust.
    const local = air.gust * (0.75 + 0.25 * Math.sin(time * 1.7 + r.knot[k * 3] * 0.6 + r.knot[k * 3 + 2] * 0.4))
  for (let i = s0 + 1; i <= last; i++) {
    const j = i * 3
    const x = pos[j], y = pos[j + 1], z = pos[j + 2]
    const vx = (x - prev[j]) * DAMP
    const vy = (y - prev[j + 1]) * DAMP
    const vz = (z - prev[j + 2]) * DAMP
    // Drag toward the wind's velocity: a sheet catches it, a thread barely does.
    const catches = r.role[i] === 0 ? 0.25 : 2.2
    const ax = (air.x * local - vx / STEP) * catches
    const az = (air.z * local - vz / STEP) * catches
    const ay = -9.8 + (-vy / STEP) * catches * 0.25
    prev[j] = x
    prev[j + 1] = y
    prev[j + 2] = z
    pos[j] = x + vx + ax * dt2
    pos[j + 1] = y + vy + ay * dt2
    pos[j + 2] = z + vz + az * dt2
  }
  }

  for (let it = 0; it < ITERATIONS; it++) {
    for (let k = 0; k < r.ropes; k++) {
      const s0 = r.start[k]
      const n = r.segments[k]
      // The knot rides its branch.
      const kx = r.knot[k * 3], ky = r.knot[k * 3 + 1], kz = r.knot[k * 3 + 2]
      const bend = B * ky * ky
      pos[s0 * 3] = kx + bend
      pos[s0 * 3 + 1] = ky
      pos[s0 * 3 + 2] = kz + bend * 0.4
      for (let s = 0; s <= n; s++) {
        const a = s0 + s
        const b = a + 1
        const rest = s < n ? r.segLength[k] : r.paperHeight
        const ia = a * 3, ib = b * 3
        const dx = pos[ib] - pos[ia], dy = pos[ib + 1] - pos[ia + 1], dz = pos[ib + 2] - pos[ia + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6
        const wa = r.inv[a], wb = r.inv[b]
        const w = wa + wb
        if (w === 0) continue
        const diff = (d - rest) / (d * w)
        pos[ia] += dx * diff * wa
        pos[ia + 1] += dy * diff * wa
        pos[ia + 2] += dz * diff * wa
        pos[ib] -= dx * diff * wb
        pos[ib + 1] -= dy * diff * wb
        pos[ib + 2] -= dz * diff * wb
      }
    }
    // The wood, midway and always on the last pass, so nothing is left inside it.
    if (it === 1 || it === ITERATIONS - 1) collide(r, wood, B, foot)
  }
}

/** Push every point out of the wood it has swung into, and let the wood hold it. */
function collide(r: Ropes, wood: Wood, B: number, foot: readonly [number, number, number]) {
  const pos = r.pos
  const prev = r.prev
  const cap = wood.cap
  const bent = wood.bent
  for (let i = 0; i < r.count; i++) {
    if (r.inv[i] === 0) continue
    const j = i * 3
    const px = pos[j], py = pos[j + 1], pz = pos[j + 2]
    const pr = r.radius[i]
    // The meadow is solid too — only worth asking near it.
    if (py < 2.2) {
      const ground = groundHeight(foot[0] + px, foot[2] + pz) - foot[1] + 0.06
      if (py < ground) {
        pos[j + 1] = ground
        prev[j] = px - (px - prev[j]) * 0.4
        prev[j + 2] = pz - (pz - prev[j + 2]) * 0.4
      }
    }
    // Look the point up unbent: the wood's cells were laid before the wind.
    const back = B * py * py
    const list = wood.grid.get(keyOf(Math.floor((px - back) / CELL), Math.floor(py / CELL), Math.floor((pz - back * 0.4) / CELL)))
    if (!list) continue
    for (let c = 0; c < list.length; c++) {
      const q = list[c] * 8
      // Nowhere near this piece of wood: move on without the arithmetic.
      const mx = pos[j] - bent[q + 4], my = pos[j + 1] - bent[q + 5], mz = pos[j + 2] - bent[q + 6]
      if (mx * mx + my * my + mz * mz > bent[q + 7]) continue
      const o = list[c] * 7
      const ay = cap[o + 1], by = cap[o + 4]
      const ax = bent[q], az = bent[q + 1]
      const bx = bent[q + 2], bz = bent[q + 3]
      const abx = bx - ax, aby = by - ay, abz = bz - az
      const qx = pos[j] - ax, qy = pos[j + 1] - ay, qz = pos[j + 2] - az
      const len = abx * abx + aby * aby + abz * abz
      const t = len > 0 ? Math.max(0, Math.min(1, (qx * abx + qy * aby + qz * abz) / len)) : 0
      const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t
      let nx = pos[j] - cx, ny = pos[j + 1] - cy, nz = pos[j + 2] - cz
      const d = Math.sqrt(nx * nx + ny * ny + nz * nz)
      const min = cap[o + 6] + pr
      if (d >= min) continue
      if (d < 1e-5) {
        nx = 0; ny = 1; nz = 0
      } else {
        nx /= d; ny /= d; nz /= d
      }
      // Out onto the surface…
      pos[j] = cx + nx * min
      pos[j + 1] = cy + ny * min
      pos[j + 2] = cz + nz * min
      // …no more moving into it, and dragging along it rather than sliding free.
      let vx = pos[j] - prev[j], vy = pos[j + 1] - prev[j + 1], vz = pos[j + 2] - prev[j + 2]
      const vn = vx * nx + vy * ny + vz * nz
      if (vn < 0) {
        vx -= nx * vn; vy -= ny * vn; vz -= nz * vn
      }
      prev[j] = pos[j] - vx * FRICTION
      prev[j + 1] = pos[j + 1] - vy * FRICTION
      prev[j + 2] = pos[j + 2] - vz * FRICTION
    }
  }
}
