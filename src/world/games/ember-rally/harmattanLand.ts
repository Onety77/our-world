/**
 * The ground under the Harmattan.
 *
 * ---------------------------------------------------------------------------
 * **The road was a strip with the sky under its edges.** The drawn road ran
 * twenty to thirty-five metres out either side and stopped, and past it was
 * nothing. The haze is the colour of the sky, so on the open plain that passed
 * for a horizon; on a bend the edge of the world showed as a pale band under
 * the ground, and on the scarp — where the switchbacks stack twenty metres over
 * each other — every shelf of road hung in the air with a dark wedge under it.
 * The escarpment the last kilometre is named for was a bare orange ramp.
 *
 * So this builds the land the road crosses, and builds it *out of the road*,
 * as the Stormcrown's mountain is, for the same reason: the road is authored,
 * and the ground has to agree with every metre of it.
 *
 *   **the plain**, level with the road for forty metres either side and
 *   rolling gently beyond, patched with dry grass and bare laterite;
 *
 *   **the wadi**, cut into the plain. The road runs down into the bed and the
 *   plain stays at its old level on both banks, so the bed is a real trench;
 *
 *   **the escarpment**, a steep slope under every metre of the climb, so the
 *   switchbacks are cut into one face instead of floating past each other, a
 *   **plateau** on top where the last village is, and the scarp running away
 *   on both sides of it into the haze;
 *
 *   **and a ledge for the road**, carved last, so nothing raised above ever
 *   lies across the road or its verge.
 *
 * The drawn road now stops a couple of metres past the verge, in a graded berm,
 * and this carries on from there — see `harmattanVerge`. Things beside the road
 * are stood on this ground with `heightAt`, so a granary thirty metres out is on
 * the plain rather than on an imaginary extension of the road.
 *
 * Built once per race, on the phone, behind the loading screen — so every phase
 * is its own small function over flat typed arrays. Written first as one long
 * function, it was too big for the JavaScript engine to optimise and every loop
 * in it ran at the slow tier: most of a second on a laptop.
 * ---------------------------------------------------------------------------
 */

import { BufferAttribute, BufferGeometry, Color, Sphere, Vector3 } from 'three'
import { basisAt, roadPoint, type RoadBasis } from './geometry'
import { harmattanProfile } from './harmattanSurface'
import { HARMATTAN, emptyRoad, roadAt, vergeWidth, type RoadAt, type Track } from './track'

/** Metres between heights. Fine enough for a wadi bank and a berm's lip. */
const CELL = 5
/** How far the ground reaches past the road. The haze has closed long before. */
const MARGIN = 190
/** Cells along a tile's side. */
const TILE = 24
const FLOOR = -16
/** Where the drawn road stops, past the verge. The berm is inside it. */
const EDGE = 2.4
/** How high the grader's windrow stands. */
const BERM = 0.32
/** How far the drawn edge's skirt reaches down at the least. It goes further wherever the ground does. */
export const HARMATTAN_SKIRT = 1.2

/* ---- the colours of the ground, which is dust over iron ------------------ */

/** The plain: dust, and the colour everything else here stands on. */
const DUST = new Color('#a58c6c')
/** Last season's grass, bleached to straw and still standing. */
const STRAW = new Color('#b39e76')
/** Bare laterite, where the wind has taken the dust off the iron. */
const LATERITE = new Color('#98603f')
/** Blown sand, in the bed of the wadi. */
const SAND = new Color('#c8b18a')
/** The escarpment's face: sandstone, banded. */
const SANDSTONE = new Color('#a0714f')
/** Ironstone, the hard cap along the lip of the plateau. */
const CAPROCK = new Color('#6f4d37')

/** An integer hash, 0..1. A sine hash was a sixth of the build. */
function hash2(x: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
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

/** Ground that rolls at three scales, 0..1. */
function fbm(x: number, z: number): number {
  return noise2(x / 160, z / 160) * 0.55 + noise2(x / 60, z / 60) * 0.3 + noise2(x / 23, z / 23) * 0.15
}

function smooth(from: number, to: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/** Mix a colour into three floats of a typed array. */
function mixInto(out: Float32Array, at: number, colour: Color, t: number) {
  out[at] += (colour.r - out[at]) * t
  out[at + 1] += (colour.g - out[at + 1]) * t
  out[at + 2] += (colour.b - out[at + 2]) * t
}

/**
 * Where the drawn road stops, and what it does on the way.
 *
 * The wheels are held up by `harmattanProfile` — a plane from the road's edge
 * out to the end of that profile — and this keeps to that plane across the
 * whole verge, so a wheel on the loose ground sits on exactly what is drawn.
 * Only past the verge, where the physics never lets the car go, does the berm
 * rise and the ground take over.
 *
 * No berm in the town, where the street runs to the house fronts, or in the
 * wadi, where the banks stand at the edge of the verge.
 */
export function harmattanVerge(road: RoadAt, s: number) {
  const { offsets, heights } = harmattanProfile(road, s)
  const out = -offsets[0]
  const top = heights[1]
  const town = s > HARMATTAN.gateAt - 20 && s < HARMATTAN.gateOut + 12
  const wadi = s > HARMATTAN.riverBed.from - 30 && s < HARMATTAN.riverBed.to + 40
  const wall = road.width + vergeWidth(road.room)
  const span = Math.max(0.01, out - road.width)
  return {
    wall,
    edge: town ? out : Math.min(out, wall + EDGE),
    berm: town || wadi ? 0 : BERM,
    town,
    wadi,
    /** The height of the supporting plane at an offset. */
    grade: (n: number) => 0.02 + (top - 0.02) * Math.max(0, Math.min(1, (Math.abs(n) - road.width) / span)),
  }
}

export interface LandTile {
  geometry: BufferGeometry
  centre: Vector3
  radius: number
}

export interface Land {
  tiles: LandTile[]
  /** The height of the ground at a point in the world. */
  heightAt(x: number, z: number): number
  /** How steep the ground is there: rise over run. */
  slopeAt(x: number, z: number): number
  /** Metres from a point to the middle of the nearest road. */
  roadDistance(x: number, z: number): number
  /** The ground's own colour at a point, so what stands on it can match it. */
  colourAt(x: number, z: number, out: Color): Color
}

const cache = new WeakMap<Track, Land>()

/** One land per track, shared by the road's chunks and the world drawn round it. */
export function landFor(track: Track): Land {
  const cached = cache.get(track)
  if (cached) return cached
  const land = buildLand(track)
  cache.set(track, land)
  return land
}

/* ---- the grid, and one small function per thing done to it ---------------- */

interface Grid {
  nx: number
  nz: number
  x0: number
  z0: number
  /** The ground's height. */
  H: Float32Array
  /** The plain's level before anything was cut into it — the wadi is wherever the ground is well under this. */
  PLAIN: Float32Array
  /** Metres to the nearest road. */
  NEAR: Float32Array
  /** The plain's level beside that road. */
  LEVEL: Float32Array
  /** And how wide its road and verge are. */
  WALLS: Float32Array
}

/** Every few metres of road, with what the ledge needs to know about it. */
interface Rings {
  count: number
  x: Float32Array
  z: Float32Array
  rx: Float32Array
  rz: Float32Array
  left: Float32Array
  right: Float32Array
  edge: Float32Array
  slope: Float32Array
  /** Points across the drawn road: x, z, and the height the ground must stay under there. */
  under: Float32Array
}

function makeGrid(track: Track): Grid {
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
  const nx = Math.ceil((maxX - minX + MARGIN * 2) / CELL) + 1
  const nz = Math.ceil((maxZ - minZ + MARGIN * 2) / CELL) + 1
  const cells = nx * nz
  return {
    nx,
    nz,
    x0: minX - MARGIN,
    z0: minZ - MARGIN,
    H: new Float32Array(cells),
    PLAIN: new Float32Array(cells),
    NEAR: new Float32Array(cells).fill(Infinity),
    LEVEL: new Float32Array(cells),
    WALLS: new Float32Array(cells),
  }
}

/*
  How far every cell is from the road, and the level of that road. A distance
  sweep rather than a cone round every few metres: the cells the road runs
  through are seeded, then two passes across the grid carry the nearest road's
  distance, level and verge to every cell. Chamfered, so a little generous on
  the diagonals, which nothing here can see.
*/
function sweep(grid: Grid) {
  const { nx, nz, NEAR, LEVEL, WALLS } = grid
  const straight = CELL
  const diagonal = CELL * Math.SQRT2
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      let best = NEAR[k]
      let from = -1
      if (i > 0 && NEAR[k - 1] + straight < best) { best = NEAR[k - 1] + straight; from = k - 1 }
      if (j > 0) {
        if (NEAR[k - nx] + straight < best) { best = NEAR[k - nx] + straight; from = k - nx }
        if (i > 0 && NEAR[k - nx - 1] + diagonal < best) { best = NEAR[k - nx - 1] + diagonal; from = k - nx - 1 }
        if (i < nx - 1 && NEAR[k - nx + 1] + diagonal < best) { best = NEAR[k - nx + 1] + diagonal; from = k - nx + 1 }
      }
      if (from >= 0) {
        NEAR[k] = best
        LEVEL[k] = LEVEL[from]
        WALLS[k] = WALLS[from]
      }
    }
  }
  for (let j = nz - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i
      let best = NEAR[k]
      let from = -1
      if (i < nx - 1 && NEAR[k + 1] + straight < best) { best = NEAR[k + 1] + straight; from = k + 1 }
      if (j < nz - 1) {
        if (NEAR[k + nx] + straight < best) { best = NEAR[k + nx] + straight; from = k + nx }
        if (i < nx - 1 && NEAR[k + nx + 1] + diagonal < best) { best = NEAR[k + nx + 1] + diagonal; from = k + nx + 1 }
        if (i > 0 && NEAR[k + nx - 1] + diagonal < best) { best = NEAR[k + nx - 1] + diagonal; from = k + nx - 1 }
      }
      if (from >= 0) {
        NEAR[k] = best
        LEVEL[k] = LEVEL[from]
        WALLS[k] = WALLS[from]
      }
    }
  }
}

/** A box blur along one axis of the grid, in place through a scratch row. */
function blur(field: Float32Array, nx: number, nz: number, radius: number, alongX: boolean, scratch: Float32Array) {
  const lines = alongX ? nz : nx
  const length = alongX ? nx : nz
  const stride = alongX ? 1 : nx
  for (let line = 0; line < lines; line++) {
    const first = alongX ? line * nx : line
    let sum = 0
    let count = 0
    for (let t = 0; t <= Math.min(length - 1, radius); t++) {
      sum += field[first + t * stride]
      count++
    }
    for (let t = 0; t < length; t++) {
      scratch[t] = sum / count
      const add = t + radius + 1
      const drop = t - radius
      if (add < length) {
        sum += field[first + add * stride]
        count++
      }
      if (drop >= 0) {
        sum -= field[first + drop * stride]
        count--
      }
    }
    for (let t = 0; t < length; t++) field[first + t * stride] = scratch[t]
  }
}

/** The plain, level with its road for forty metres and falling very gently away. */
function plain(grid: Grid) {
  const { H, NEAR, LEVEL, WALLS } = grid
  for (let k = 0; k < H.length; k++) {
    H[k] = NEAR[k] > MARGIN + CELL ? FLOOR : LEVEL[k] - 0.15 - 0.012 * Math.max(0, NEAR[k] - (WALLS[k] + 40))
  }
  grid.PLAIN.set(H)
}

/** Raise the ground to a cone round a point: flat for `flat` metres, then falling at `k` down to `bottom`. */
function cone(grid: Grid, x: number, z: number, top: number, flat: number, k: number, bottom: number) {
  const { nx, nz, x0, z0, H } = grid
  const reach = flat + Math.max(0, top - bottom) / k
  const i0 = Math.max(0, Math.floor((x - reach - x0) / CELL))
  const i1 = Math.min(nx - 1, Math.ceil((x + reach - x0) / CELL))
  const j0 = Math.max(0, Math.floor((z - reach - z0) / CELL))
  const j1 = Math.min(nz - 1, Math.ceil((z + reach - z0) / CELL))
  for (let j = j0; j <= j1; j++) {
    const dz = z0 + j * CELL - z
    for (let i = i0; i <= i1; i++) {
      const dx = x0 + i * CELL - x
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d > reach) continue
      const h = top - k * Math.max(0, d - flat)
      const cell = j * nx + i
      if (h > H[cell]) H[cell] = h
    }
  }
}

/** The ground rolls, once it is well away from the road. */
function roll(grid: Grid) {
  const { nx, x0, z0, H, NEAR } = grid
  for (let k = 0; k < H.length; k++) {
    if (NEAR[k] > MARGIN + CELL) continue
    const away = smooth(30, 95, NEAR[k])
    if (away <= 0) continue
    const i = k % nx
    const x = x0 + i * CELL
    const z = z0 + ((k - i) / nx) * CELL
    H[k] += ((fbm(x, z) - 0.5) * 4.2 + (noise2(x / 9, z / 9) - 0.5) * 0.5) * away
  }
}

function measureRings(track: Track): Rings {
  const STEP = 2
  const count = Math.floor(track.length / STEP) + 1
  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }
  const point = new Vector3()
  const rings: Rings = {
    count,
    x: new Float32Array(count),
    z: new Float32Array(count),
    rx: new Float32Array(count),
    rz: new Float32Array(count),
    left: new Float32Array(count),
    right: new Float32Array(count),
    edge: new Float32Array(count),
    slope: new Float32Array(count),
    under: new Float32Array(0),
  }
  const under: number[] = []
  for (let r = 0; r < count; r++) {
    const s = r * STEP
    roadAt(track, s, road)
    basisAt(road, basis)
    const verge = harmattanVerge(road, s)
    const horizontal = Math.hypot(basis.rx, basis.rz) || 1
    roadPoint(road, verge.edge, verge.grade(verge.edge), point, basis)
    rings.right[r] = point.y
    roadPoint(road, -verge.edge, verge.grade(verge.edge), point, basis)
    rings.left[r] = point.y
    rings.x[r] = road.x
    rings.z[r] = road.z
    rings.rx[r] = basis.rx / horizontal
    rings.rz[r] = basis.rz / horizontal
    rings.edge[r] = verge.edge
    // Steep in the wadi, where a bank is a bank.
    rings.slope[r] = verge.wadi ? 2.6 : 1.35
    const steps = Math.ceil((verge.edge * 2) / 1.5)
    for (let k = 0; k <= steps; k++) {
      const n = -verge.edge + (k / steps) * verge.edge * 2
      roadPoint(road, n, verge.grade(n), point, basis)
      under.push(point.x, point.z, point.y - 0.75)
    }
  }
  rings.under = new Float32Array(under)
  return rings
}

/*
  A floor just past the drawn edge, at the height of *that side's* edge: on a
  banked corner the high side stands well above the middle of the road, and
  ground measured from the middle left a slot of sky under it.
*/
function floorEdges(grid: Grid, rings: Rings) {
  const { nx, nz, x0, z0, H } = grid
  for (let r = 0; r < rings.count; r++) {
    const edge = rings.edge[r]
    const reach = edge + CELL * 1.6
    const inner = (edge - 1) * (edge - 1)
    const rx = rings.x[r]
    const rz = rings.z[r]
    const i0 = Math.max(0, Math.floor((rx - reach - x0) / CELL))
    const i1 = Math.min(nx - 1, Math.ceil((rx + reach - x0) / CELL))
    const j0 = Math.max(0, Math.floor((rz - reach - z0) / CELL))
    const j1 = Math.min(nz - 1, Math.ceil((rz + reach - z0) / CELL))
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + j * CELL - rz
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * CELL - rx
        const d2 = dx * dx + dz * dz
        if (d2 > reach * reach || d2 < inner) continue
        const floor = (dx * rings.rx[r] + dz * rings.rz[r] >= 0 ? rings.right[r] : rings.left[r]) - 0.9
        const k = j * nx + i
        if (H[k] < floor) H[k] = floor
      }
    }
  }
}

/*
  A cutting beyond the edge, from the same side's height: a full cell of level
  shelf, and then up at a cutting's angle. The shelf is not decoration. Without
  it a steep bank bled up through the drawn edge between two heights five
  metres apart.
*/
function cutLedge(grid: Grid, rings: Rings) {
  const { nx, nz, x0, z0, H } = grid
  for (let r = 0; r < rings.count; r += 2) {
    const edge = rings.edge[r]
    const reach = edge + 42
    const rx = rings.x[r]
    const rz = rings.z[r]
    const i0 = Math.max(0, Math.floor((rx - reach - x0) / CELL))
    const i1 = Math.min(nx - 1, Math.ceil((rx + reach - x0) / CELL))
    const j0 = Math.max(0, Math.floor((rz - reach - z0) / CELL))
    const j1 = Math.min(nz - 1, Math.ceil((rz + reach - z0) / CELL))
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + j * CELL - rz
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * CELL - rx
        const d2 = dx * dx + dz * dz
        if (d2 > reach * reach || d2 < edge * edge) continue
        const lip = (dx * rings.rx[r] + dz * rings.rz[r] >= 0 ? rings.right[r] : rings.left[r]) - 0.4
        const allowed = lip + rings.slope[r] * Math.max(0, Math.sqrt(d2) - edge - CELL)
        const k = j * nx + i
        if (H[k] > allowed) H[k] = allowed
      }
    }
  }
}

/** And under the drawn road itself, sampled across it in the road's own frame. */
function clearUnder(grid: Grid, rings: Rings) {
  const { nx, nz, x0, z0, H } = grid
  const { under } = rings
  const reach = CELL * 0.85
  for (let u = 0; u < under.length; u += 3) {
    const x = under[u]
    const z = under[u + 1]
    const most = under[u + 2]
    const i0 = Math.max(0, Math.floor((x - reach - x0) / CELL))
    const i1 = Math.min(nx - 1, Math.ceil((x + reach - x0) / CELL))
    const j0 = Math.max(0, Math.floor((z - reach - z0) / CELL))
    const j1 = Math.min(nz - 1, Math.ceil((z + reach - z0) / CELL))
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + j * CELL - z
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * CELL - x
        if (dx * dx + dz * dz > reach * reach) continue
        const k = j * nx + i
        if (H[k] > most) H[k] = most
      }
    }
  }
}

/** How the ground slopes, once, for the colour and the normals. */
function slopes(grid: Grid) {
  const { nx, nz, H } = grid
  const GX = new Float32Array(H.length)
  const GZ = new Float32Array(H.length)
  const STEEP = new Float32Array(H.length)
  for (let j = 0; j < nz; j++) {
    const back = j > 0 ? -nx : 0
    const on = j < nz - 1 ? nx : 0
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const gx = H[k + (i > 0 ? -1 : 0)] - H[k + (i < nx - 1 ? 1 : 0)]
      const gz = H[k + back] - H[k + on]
      GX[k] = gx
      GZ[k] = gz
      STEEP[k] = smooth(0.45, 1.05, Math.sqrt(gx * gx + gz * gz) / (2 * CELL))
    }
  }
  return { GX, GZ, STEEP }
}

function colours(grid: Grid, STEEP: Float32Array, footLevel: number): Float32Array {
  const { nx, x0, z0, H, NEAR, PLAIN } = grid
  const COL = new Float32Array(H.length * 3)
  for (let k = 0; k < H.length; k++) {
    if (NEAR[k] > MARGIN + CELL) continue
    const i = k % nx
    const j = (k - i) / nx
    const x = x0 + i * CELL
    const z = z0 + j * CELL
    const steep = STEEP[k]
    const c = k * 3
    COL[c] = DUST.r
    COL[c + 1] = DUST.g
    COL[c + 2] = DUST.b
    // Grass in drifts, bare laterite in patches where the wind has scoured it.
    mixInto(COL, c, STRAW, smooth(0.45, 0.7, noise2(x / 38, z / 38)) * 0.8)
    mixInto(COL, c, LATERITE, smooth(0.6, 0.78, noise2(x / 27 + 40, z / 27)) * 0.75)
    // The bed of the wadi, wherever the ground is well down in the plain.
    mixInto(COL, c, SAND, smooth(1.5, 3.5, PLAIN[k] - H[k]) * (1 - steep))
    mixInto(COL, c, SANDSTONE, steep)
    // The ironstone cap, in the top few metres of any high face.
    mixInto(COL, c, CAPROCK, steep * smooth(footLevel + 26, footLevel + 36, H[k]) * 0.8)
    const grain = 0.9 + hash2(i, j) * 0.18
    COL[c] *= grain
    COL[c + 1] *= grain
    COL[c + 2] *= grain
  }
  return COL
}

function tile(grid: Grid, iFrom: number, jFrom: number, GX: Float32Array, GZ: Float32Array, STEEP: Float32Array, COL: Float32Array): LandTile | null {
  const { nx, nz, x0, z0, H, NEAR } = grid
  const iTo = Math.min(nx - 1, iFrom + TILE)
  const jTo = Math.min(nz - 1, jFrom + TILE)
  const w = iTo - iFrom + 1
  const h = jTo - jFrom + 1
  const reach = MARGIN - 8
  // Nothing out past the ground anybody can see from the road.
  const keep = new Uint8Array((w - 1) * (h - 1))
  let kept = 0
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const ka = (jFrom + j) * nx + iFrom + i
      if (Math.min(NEAR[ka], NEAR[ka + 1], NEAR[ka + nx], NEAR[ka + nx + 1]) <= reach) {
        keep[j * (w - 1) + i] = 1
        kept++
      }
    }
  }
  if (kept === 0) return null
  const index = new Uint16Array(kept * 6)
  let o = 0
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      if (!keep[j * (w - 1) + i]) continue
      const a = j * w + i
      const d = a + w
      index[o++] = a
      index[o++] = d
      index[o++] = d + 1
      index[o++] = a
      index[o++] = d + 1
      index[o++] = a + 1
    }
  }
  const count = w * h
  const position = new Float32Array(count * 3)
  const normal = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const surface = new Float32Array(count * 2)
  let sumY = 0
  let top = -Infinity
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = j * w + i
      const k = (jFrom + j) * nx + iFrom + i
      const y = H[k]
      position[v * 3] = x0 + (iFrom + i) * CELL
      position[v * 3 + 1] = y
      position[v * 3 + 2] = z0 + (jFrom + j) * CELL
      sumY += y
      if (y > top) top = y
      // Normals off the whole field, so no tile has a seam where its edge is.
      const gx = GX[k]
      const gz = GZ[k]
      const length = Math.sqrt(gx * gx + 4 * CELL * CELL + gz * gz)
      normal[v * 3] = gx / length
      normal[v * 3 + 1] = (2 * CELL) / length
      normal[v * 3 + 2] = gz / length
      col[v * 3] = COL[k * 3]
      col[v * 3 + 1] = COL[k * 3 + 1]
      col[v * 3 + 2] = COL[k * 3 + 2]
      /*
        Rough enough for the rock shader's grain, and on a steep face rough
        enough for its beds — which on this road stop short of anything as
        rough as a mud wall, see `uStrataTop`.
      */
      surface[v * 2 + 1] = 0.5 + STEEP[k] * 0.2
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  geometry.setAttribute('aColor', new BufferAttribute(col, 3))
  geometry.setAttribute('aSurface', new BufferAttribute(surface, 2))
  geometry.setIndex(new BufferAttribute(index, 1))
  const centre = new Vector3(x0 + ((iFrom + iTo) / 2) * CELL, sumY / count, z0 + ((jFrom + jTo) / 2) * CELL)
  const radius = Math.hypot((iTo - iFrom) * CELL, (jTo - jFrom) * CELL) / 2 + Math.max(10, top - centre.y)
  geometry.boundingSphere = new Sphere(centre.clone(), radius)
  return { geometry, centre, radius }
}

function buildLand(track: Track): Land {
  const grid = makeGrid(track)
  const { nx, nz, x0, z0 } = grid
  const road = emptyRoad()
  const M = HARMATTAN

  const yAt = (s: number) => roadAt(track, s).y
  const riverLevel = yAt(M.river.from)
  const townLevel = yAt(M.gateAt)
  const footLevel = yAt(M.scarp.from)
  /**
   * The level of the plain beside a metre of road — which is the road's own
   * height except where the road has gone down into the wadi or up the scarp.
   * Across the wadi it runs straight from the bank the road went down to the
   * bank it comes up on.
   */
  const plainLevel = (s: number, y: number) => {
    if (s < M.river.from) return y
    if (s < M.gateAt) return riverLevel + ((townLevel - riverLevel) * (s - M.river.from)) / (M.gateAt - M.river.from)
    if (s < M.scarp.from) return y
    return footLevel
  }

  for (let s = 0; s <= track.length; s += 2) {
    roadAt(track, s, road)
    const i = Math.round((road.x - x0) / CELL)
    const j = Math.round((road.z - z0) / CELL)
    const k = j * nx + i
    const d = Math.hypot(x0 + i * CELL - road.x, z0 + j * CELL - road.z)
    if (d < grid.NEAR[k]) {
      grid.NEAR[k] = d
      grid.LEVEL[k] = plainLevel(s, road.y)
      grid.WALLS[k] = road.width + vergeWidth(road.room)
    }
  }
  sweep(grid)
  // Where two stretches of road at different levels meet, blend rather than step.
  const scratch = new Float32Array(Math.max(nx, nz))
  blur(grid.LEVEL, nx, nz, 4, true, scratch)
  blur(grid.LEVEL, nx, nz, 4, false, scratch)
  plain(grid)

  // The escarpment, under every metre of the climb.
  for (let s = M.scarp.from - 10; s <= track.length; s += 4) {
    roadAt(track, s, road)
    if (road.y < footLevel + 1) continue
    cone(grid, road.x, road.z, road.y - 0.3, road.width + vergeWidth(road.room) + 5, 0.7 + noise2(s / 90, 1.3) * 0.5, footLevel - 2)
  }
  /*
    The plateau on top — tight round the road. Wide, it swallowed the second
    hairpin: the corner that is meant to hang on the face with the plain below
    it came out at the bottom of a cutting fifteen metres deep.
  */
  for (let s = M.home.from - 30; s <= track.length; s += 6) {
    roadAt(track, s, road)
    cone(grid, road.x, road.z, road.y - 0.3, 25 + noise2(s / 60, 7.7) * 20, 1.25, footLevel - 2)
  }
  /*
    A plateau round the finish alone is a mesa, and a mesa is a thing you drive
    up and off. An escarpment is a *line* — it runs across the country as far as
    you can see — so the lip carries on either side, across the direction the
    road climbs, lower as it goes, and kept well clear of the road below it.
  */
  {
    const from = roadAt(track, M.scarp.from)
    const to = roadAt(track, track.length - 1)
    const climb = Math.hypot(to.x - from.x, to.z - from.z)
    const acrossX = (to.z - from.z) / climb
    const acrossZ = -(to.x - from.x) / climb
    const centre = roadAt(track, M.home.from)
    const below: number[] = []
    for (let s = 0; s < M.home.from - 30; s += 8) {
      roadAt(track, s, road)
      below.push(road.x, road.z)
    }
    for (const side of [-1, 1]) {
      for (let t = 70; t <= 440; t += 10) {
        const x = centre.x + acrossX * side * t
        const z = centre.z + acrossZ * side * t
        let clear = Infinity
        for (let b = 0; b < below.length; b += 2) {
          clear = Math.min(clear, (below[b] - x) ** 2 + (below[b + 1] - z) ** 2)
        }
        if (clear < 95 * 95) continue
        const top = centre.y - 1 - t * 0.02 + (noise2(t / 40, side * 5) - 0.5) * 6
        cone(grid, x, z, top, 20 + noise2(t / 55, side * 9) * 22, 1.2, footLevel - 2)
      }
    }
  }
  roll(grid)

  /*
    The ledge, in three passes and in this order, because each can only undo
    the one before in the direction that is safe.
  */
  const rings = measureRings(track)
  floorEdges(grid, rings)
  cutLedge(grid, rings)
  clearUnder(grid, rings)

  const { GX, GZ, STEEP } = slopes(grid)
  const COL = colours(grid, STEEP, footLevel)
  const tiles: LandTile[] = []
  for (let jFrom = 0; jFrom < nz - 1; jFrom += TILE) {
    for (let iFrom = 0; iFrom < nx - 1; iFrom += TILE) {
      const made = tile(grid, iFrom, jFrom, GX, GZ, STEEP, COL)
      if (made) tiles.push(made)
    }
  }

  const { H, NEAR } = grid
  const heightAt = (x: number, z: number) => {
    const fi = (x - x0) / CELL
    const fj = (z - z0) / CELL
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fi)))
    const j = Math.max(0, Math.min(nz - 2, Math.floor(fj)))
    const u = Math.max(0, Math.min(1, fi - i))
    const v = Math.max(0, Math.min(1, fj - j))
    const a = H[j * nx + i]
    const b = H[j * nx + i + 1]
    const c = H[(j + 1) * nx + i]
    const d = H[(j + 1) * nx + i + 1]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  const slopeAt = (x: number, z: number) => {
    const dx = heightAt(x + CELL, z) - heightAt(x - CELL, z)
    const dz = heightAt(x, z + CELL) - heightAt(x, z - CELL)
    return Math.hypot(dx, dz) / (2 * CELL)
  }
  const cellOf = (x: number, z: number) =>
    Math.max(0, Math.min(nz - 1, Math.round((z - z0) / CELL))) * nx + Math.max(0, Math.min(nx - 1, Math.round((x - x0) / CELL)))
  const roadDistance = (x: number, z: number) => NEAR[cellOf(x, z)]
  const colourAt = (x: number, z: number, out: Color) => {
    const k = cellOf(x, z) * 3
    return out.setRGB(COL[k], COL[k + 1], COL[k + 2])
  }

  return { tiles, heightAt, slopeAt, roadDistance, colourAt }
}
