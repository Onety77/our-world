/**
 * The ground under the Nightfall — the garden's own.
 *
 * ---------------------------------------------------------------------------
 * Built out of the road the way the Harmattan's plain and the Stormcrown's
 * mountain are, and shaped by the five places the road goes through:
 *
 *   **the Meadow** is level with the road and rolls very gently — a meadow,
 *   not a plain — and is grass;
 *
 *   **the Wellspring** is a valley the road goes down into: the meadow stays
 *   at its own height on both banks while the road drops six metres to the
 *   water, so the banks are real cut earth, and the river runs down the valley
 *   beside the road, crossing it at the two fords;
 *
 *   **the Hollow** is a knoll. The cave runs under it, so the ground here is
 *   raised over the passages and the room, and carved down to the road only at
 *   the two mouths, where the way in is a cutting into the hillside;
 *
 *   **the Stars** is the dark plain, flat and open to the whole sky;
 *
 *   **the Lantern Walk** is the wood's floor, level with the lane.
 *
 * Same machinery as `harmattanLand` — a grid, a distance sweep from the road,
 * the big shapes as cones, a ledge carved for the road, tiles — with the
 * places' own levels and colours. `heightAt` is what everything standing on the
 * ground is stood with, and `riverAt` is where the water is.
 * ---------------------------------------------------------------------------
 */

import { BufferAttribute, BufferGeometry, Color, Sphere, Vector3 } from 'three'
import { basisAt, roadPoint, type RoadBasis } from './geometry'
import { NIGHTFALL, emptyRoad, roadAt, vergeWidth, type RoadAt, type Track } from './track'

/** Metres between heights. */
const CELL = 5
/** How far the ground reaches past the road. The fog is in long before. */
const MARGIN = 210
/** Cells along a tile's side. */
const TILE = 24
const FLOOR = -30
/** Where the drawn road stops, past the verge. */
const EDGE = 2.0
/** How far the drawn edge's skirt reaches down at the least. */
export const NIGHTFALL_SKIRT = 1.1
/** How far below the road the river's surface lies at the fords, and how deep its bed is cut. */
export const RIVER_DROP = 0.35
const RIVER_BED = 1.4
/** Half the river's width. */
export const RIVER_HALF = 5.5

/* ---- the colours of the ground --------------------------------------------- */

/** Meadow grass in the last light: the garden's muted greens. */
const MEADOW = new Color('#4f5a3c')
const MEADOW_DRY = new Color('#6b6a4a')
/** Cut earth of the valley banks, and the gravel of the bed. */
const BANK = new Color('#5a5044')
const GRAVEL = new Color('#5e5f58')
/** The knoll over the Hollow: rock and dry grass. */
const KNOLL = new Color('#5c5449')
/** The dark plain under the Stars. */
const PLAIN = new Color('#3a3d44')
const PLAIN_PALE = new Color('#484a50')
/** The wood's floor: leaf litter over dark earth. */
const LITTER = new Color('#3f3a2c')
const MOSS = new Color('#3a4630')

/** An integer hash, 0..1. */
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

function fbm(x: number, z: number): number {
  return noise2(x / 150, z / 150) * 0.55 + noise2(x / 55, z / 55) * 0.3 + noise2(x / 21, z / 21) * 0.15
}

function smooth(from: number, to: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

function mixInto(out: Float32Array, at: number, colour: Color, t: number) {
  out[at] += (colour.r - out[at]) * t
  out[at + 1] += (colour.g - out[at + 1]) * t
  out[at + 2] += (colour.b - out[at + 2]) * t
}

/** Which place a metre of road is in. */
export type Place = 'meadow' | 'wellspring' | 'hollow' | 'stars' | 'walk'
export function placeAt(s: number): Place {
  const M = NIGHTFALL
  if (s < M.meadow.to) return 'meadow'
  if (s < M.wellspring.to) return 'wellspring'
  if (s < M.hollow.to) return 'hollow'
  if (s < M.stars.to) return 'stars'
  return 'walk'
}

/** Where the road is under a roof: the passages and the room, not the mouths. */
export function underground(s: number): boolean {
  return s > NIGHTFALL.hollow.from + 22 && s < NIGHTFALL.hollow.to - 22
}

/**
 * Where the drawn road stops, and how it gets there: the road, a verge of
 * loose ground sloping up a little, and the edge the skirt goes down from.
 */
export function nightfallVerge(road: RoadAt, s: number) {
  const wall = road.width + vergeWidth(road.room)
  const cave = underground(s)
  const edge = cave ? wall + 0.4 : wall + EDGE
  const rise = cave ? 0.1 : 0.26
  return {
    wall,
    edge,
    cave,
    /** The height of the drawn surface at an offset. */
    grade: (n: number) => 0.02 + rise * Math.max(0, Math.min(1, (Math.abs(n) - road.width) / Math.max(0.01, edge - road.width))),
  }
}

/**
 * Where the river runs, beside the road: metres right of the middle. It keeps
 * to the left bank going in, crosses at the first ford, runs down the right,
 * and crosses back at the second — so the road is on one bank or the other
 * and wet where it is in the water.
 */
export function riverOffset(s: number): number {
  const M = NIGHTFALL
  const [one, two] = M.fords
  const far = 16
  const cross = (at: number, width: number) => smooth(at - width, at + width, s)
  const wander = Math.sin(s * 0.021) * 3 + Math.sin(s * 0.047) * 1.5
  // Left, then over to the right across the first ford, then back across the second.
  const side = -1 + 2 * cross(one + 20, 24) - 2 * cross(two + 22, 26)
  return side * far + wander
}

/** Whether the river is here at all: from above the first ford's approach to below the second. */
export function riverSpan(): { from: number; to: number } {
  return { from: NIGHTFALL.wellspring.from + 20, to: NIGHTFALL.wellspring.to - 60 }
}

export interface LandTile {
  geometry: BufferGeometry
  centre: Vector3
  radius: number
}

export interface Land {
  tiles: LandTile[]
  heightAt(x: number, z: number): number
  slopeAt(x: number, z: number): number
  roadDistance(x: number, z: number): number
  colourAt(x: number, z: number, out: Color): Color
  /** Where the river's surface is, in the world, as points along it with the water's height. */
  river: { x: number; y: number; z: number; s: number }[]
}

const cache = new WeakMap<Track, Land>()

export function landFor(track: Track): Land {
  const cached = cache.get(track)
  if (cached) return cached
  const land = buildLand(track)
  cache.set(track, land)
  return land
}

interface Grid {
  nx: number
  nz: number
  x0: number
  z0: number
  H: Float32Array
  NEAR: Float32Array
  LEVEL: Float32Array
  WALLS: Float32Array
  /** Which place the nearest road is in, as 0..4. */
  PLACE: Float32Array
  /** The nearest road's metre. */
  SROAD: Float32Array
  /** How far from the river's middle, where there is one. */
  RIVER: Float32Array
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
    nx, nz, x0: minX - MARGIN, z0: minZ - MARGIN,
    H: new Float32Array(cells),
    NEAR: new Float32Array(cells).fill(Infinity),
    LEVEL: new Float32Array(cells),
    WALLS: new Float32Array(cells),
    PLACE: new Float32Array(cells),
    SROAD: new Float32Array(cells),
    RIVER: new Float32Array(cells).fill(Infinity),
  }
}

/** Carry the nearest road's distance, level, verge and place to every cell. */
function sweep(grid: Grid) {
  const { nx, nz, NEAR, LEVEL, WALLS, PLACE, SROAD } = grid
  const straight = CELL
  const diagonal = CELL * Math.SQRT2
  const take = (k: number, from: number, step: number) => {
    const d = NEAR[from] + step
    if (d < NEAR[k]) {
      NEAR[k] = d
      LEVEL[k] = LEVEL[from]
      WALLS[k] = WALLS[from]
      PLACE[k] = PLACE[from]
      SROAD[k] = SROAD[from]
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      if (i > 0) take(k, k - 1, straight)
      if (j > 0) {
        take(k, k - nx, straight)
        if (i > 0) take(k, k - nx - 1, diagonal)
        if (i < nx - 1) take(k, k - nx + 1, diagonal)
      }
    }
  }
  for (let j = nz - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i
      if (i < nx - 1) take(k, k + 1, straight)
      if (j < nz - 1) {
        take(k, k + nx, straight)
        if (i < nx - 1) take(k, k + nx + 1, diagonal)
        if (i > 0) take(k, k + nx - 1, diagonal)
      }
    }
  }
}

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
      if (add < length) { sum += field[first + add * stride]; count++ }
      if (drop >= 0) { sum -= field[first + drop * stride]; count-- }
    }
    for (let t = 0; t < length; t++) field[first + t * stride] = scratch[t]
  }
}

/** Raise the ground to a cone: flat for `flat` metres, then falling at `k`. */
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

/** Lower the ground to a trough: `depth` below `level` for `flat` metres, rising at `k`. */
function trough(grid: Grid, x: number, z: number, level: number, flat: number, k: number, depth: number) {
  const { nx, nz, x0, z0, H } = grid
  const reach = flat + depth / k
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
      const h = level - depth + k * Math.max(0, d - flat)
      const cell = j * nx + i
      if (h < H[cell]) H[cell] = h
      const r = Math.max(0, d - flat)
      if (r < grid.RIVER[cell]) grid.RIVER[cell] = r
    }
  }
}

const PLACE_INDEX: Record<Place, number> = { meadow: 0, wellspring: 1, hollow: 2, stars: 3, walk: 4 }

function buildLand(track: Track): Land {
  const grid = makeGrid(track)
  const { nx, nz, x0, z0 } = grid
  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }
  const point = new Vector3()
  const M = NIGHTFALL

  const yAt = (s: number) => roadAt(track, s).y
  const meadowEnd = yAt(M.wellspring.from)
  const hollowStart = yAt(M.hollow.from)
  const hollowEnd = yAt(M.hollow.to)
  /**
   * The level of the ground beside a metre of road. The road's own height,
   * except down the valley — where the banks stay up and the road goes down to
   * the water — and through the Hollow, where the knoll stands over the cave.
   */
  const plainLevel = (s: number, y: number) => {
    if (s < M.wellspring.from) return y
    if (s < M.hollow.from) {
      const t = (s - M.wellspring.from) / (M.hollow.from - M.wellspring.from)
      return meadowEnd + (hollowStart - meadowEnd) * t
    }
    if (s < M.hollow.to) {
      const t = (s - M.hollow.from) / (M.hollow.to - M.hollow.from)
      return hollowStart + (hollowEnd - hollowStart) * t
    }
    return y
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
      grid.PLACE[k] = PLACE_INDEX[placeAt(s)]
      grid.SROAD[k] = s
    }
  }
  sweep(grid)
  const scratch = new Float32Array(Math.max(nx, nz))
  blur(grid.LEVEL, nx, nz, 5, true, scratch)
  blur(grid.LEVEL, nx, nz, 5, false, scratch)

  // The ground: level beside the road, and settling very gently away from it —
  // then falling away over the last fifty metres before the margin, so the
  // land ends by curving out of sight under the treeline rather than as a
  // ledge with a ruler's edge, which is what a cliff to the floor looked like.
  const { H, NEAR, LEVEL, WALLS, PLACE } = grid
  for (let k = 0; k < H.length; k++) {
    if (NEAR[k] > MARGIN + CELL) {
      H[k] = FLOOR
      continue
    }
    const fall = smooth(MARGIN - 50, MARGIN + CELL, NEAR[k])
    H[k] = LEVEL[k] - 0.15 - 0.01 * Math.max(0, NEAR[k] - (WALLS[k] + 30)) - fall * fall * 14
  }

  // The knoll over the Hollow, high enough to hold the room and the passages.
  for (let s = M.hollow.from + 10; s < M.hollow.to - 10; s += 5) {
    roadAt(track, s, road)
    const top = road.y + road.ceiling + 3.5 + smooth(30, 120, Math.min(s - M.hollow.from, M.hollow.to - s)) * 4
    cone(grid, road.x, road.z, top, 12 + road.room * 10, 0.55, FLOOR)
  }
  {
    // And a summit over the room itself, so the knoll reads as a hill and not a tube of ground.
    const mid = (M.ring.from + M.ring.to) / 2
    roadAt(track, mid, road)
    roadPoint(road, 15, 0, point, basisAt(road, basis))
    cone(grid, point.x, point.z, road.y + 16 + 9, 22, 0.42, FLOOR)
  }

  // The ground rolls, once it is off the verge: most in the meadow, least on the plain.
  for (let k = 0; k < H.length; k++) {
    if (NEAR[k] > MARGIN + CELL) continue
    const away = smooth(12, 60, NEAR[k])
    if (away <= 0) continue
    const i = k % nx
    const x = x0 + i * CELL
    const z = z0 + ((k - i) / nx) * CELL
    const place = PLACE[k]
    const amount = place === 3 ? 1.2 : place === 0 ? 3.2 : 2.2
    H[k] += ((fbm(x, z) - 0.5) * amount + (noise2(x / 8, z / 8) - 0.5) * 0.35) * away
  }
  /*
    The knoll is a hill, not a tent. Two cones meeting made straight ridges
    and flat flanks that read as folded card; this breaks them with noise in
    proportion to how high the ground stands over the road's level — only
    ever *upward*, so nothing here can bring the hillside down onto the vault
    it is holding up, and only where the rise is, so the meadow either side
    of it is untouched.
  */
  for (let k = 0; k < H.length; k++) {
    if (NEAR[k] > MARGIN + CELL || PLACE[k] !== 2) continue
    const rise = H[k] - LEVEL[k]
    if (rise <= 1) continue
    const i = k % nx
    const x = x0 + i * CELL
    const z = z0 + ((k - i) / nx) * CELL
    const knead = noise2(x / 23 + 11, z / 23) * 0.6 + noise2(x / 9 + 5, z / 9) * 0.4
    H[k] += knead * Math.min(rise, 12) * 0.32
  }

  // The river: a bed cut beside the road down the valley, with its own wander.
  // After the ground has rolled, or the roll would fill the bed back in.
  const river: Land['river'] = []
  {
    const { from, to } = riverSpan()
    for (let s = from; s <= to; s += 3) {
      roadAt(track, s, road)
      basisAt(road, basis)
      const n = riverOffset(s)
      roadPoint(road, n, 0, point, basis)
      // Where it crosses, the water runs *over* the road — a ford, with the
      // crown just showing through — and lies well below the bank beside it.
      const crossing = Math.abs(n) < road.width + 4
      const surface = crossing ? road.y + 0.05 : road.y - RIVER_DROP - 0.6
      river.push({ x: point.x, y: surface, z: point.z, s })
    }
  }

  // The ledge the road is cut into — not where it is under a roof.
  const RING = 2
  const ringCount = Math.floor(track.length / RING) + 1
  const ringX = new Float32Array(ringCount)
  const ringZ = new Float32Array(ringCount)
  const ringRX = new Float32Array(ringCount)
  const ringRZ = new Float32Array(ringCount)
  const ringLeft = new Float32Array(ringCount)
  const ringRight = new Float32Array(ringCount)
  const ringEdge = new Float32Array(ringCount)
  const ringOpen = new Uint8Array(ringCount)
  const under: number[] = []
  for (let r = 0; r < ringCount; r++) {
    const s = r * RING
    roadAt(track, s, road)
    basisAt(road, basis)
    const verge = nightfallVerge(road, s)
    const horizontal = Math.hypot(basis.rx, basis.rz) || 1
    roadPoint(road, verge.edge, verge.grade(verge.edge), point, basis)
    ringRight[r] = point.y
    roadPoint(road, -verge.edge, verge.grade(verge.edge), point, basis)
    ringLeft[r] = point.y
    ringX[r] = road.x
    ringZ[r] = road.z
    ringRX[r] = basis.rx / horizontal
    ringRZ[r] = basis.rz / horizontal
    ringEdge[r] = verge.edge
    ringOpen[r] = underground(s) ? 0 : 1
    if (!ringOpen[r]) continue
    const steps = Math.ceil((verge.edge * 2) / 1.5)
    for (let k = 0; k <= steps; k++) {
      const n = -verge.edge + (k / steps) * verge.edge * 2
      roadPoint(road, n, verge.grade(n), point, basis)
      under.push(point.x, point.z, point.y - 0.7)
    }
  }
  const span = (x: number, z: number, reach: number) => [
    Math.max(0, Math.floor((x - reach - x0) / CELL)),
    Math.min(nx - 1, Math.ceil((x + reach - x0) / CELL)),
    Math.max(0, Math.floor((z - reach - z0) / CELL)),
    Math.min(nz - 1, Math.ceil((z + reach - z0) / CELL)),
  ]
  // A floor just past the edge, at that side's height.
  for (let r = 0; r < ringCount; r++) {
    if (!ringOpen[r]) continue
    const edge = ringEdge[r]
    const reach = edge + CELL * 1.6
    const [i0, i1, j0, j1] = span(ringX[r], ringZ[r], reach)
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + j * CELL - ringZ[r]
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * CELL - ringX[r]
        const d2 = dx * dx + dz * dz
        if (d2 > reach * reach || d2 < (edge - 1) * (edge - 1)) continue
        const floor = (dx * ringRX[r] + dz * ringRZ[r] >= 0 ? ringRight[r] : ringLeft[r]) - 0.8
        const k = j * nx + i
        if (H[k] < floor) H[k] = floor
      }
    }
  }
  /*
    The river's bed, cut after that floor, or the floor fills it in: on the
    inside of a bend the water runs within the floor's reach of the road for
    the whole bend. Cut here, the bed only ever lowers the ground, which the
    two passes below never raise.
  */
  for (const r of river) trough(grid, r.x, r.z, r.y, RIVER_HALF, 0.7, RIVER_BED)
  // A cutting beyond it: the valley banks are steep, the rest gentle. The
  // mouths of the cave are cut below, their own way.
  for (let r = 0; r < ringCount; r += 2) {
    if (!ringOpen[r]) continue
    const s = r * RING
    const place = placeAt(s)
    if (place === 'hollow') continue
    const steep = place === 'wellspring' ? 2.2 : 1.1
    const edge = ringEdge[r]
    const reach = edge + 44
    const [i0, i1, j0, j1] = span(ringX[r], ringZ[r], reach)
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + j * CELL - ringZ[r]
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * CELL - ringX[r]
        const d2 = dx * dx + dz * dz
        if (d2 > reach * reach || d2 < edge * edge) continue
        const lip = (dx * ringRX[r] + dz * ringRZ[r] >= 0 ? ringRight[r] : ringLeft[r]) - 0.35
        const allowed = lip + steep * Math.max(0, Math.sqrt(d2) - edge - CELL)
        const k = j * nx + i
        if (H[k] > allowed) H[k] = allowed
      }
    }
  }
  /*
    The mouths: a cutting into the hillside, steep, and smooth along the
    road. Cut by each cell's own distance to the road rather than by discs
    round each ring — discs a few metres across, reaching only a little way
    into a hill, left a scalloped ridge along both cuttings. And only where
    the nearest road is in the open: a cell whose nearest metre of road is
    under the knoll is the knoll's roof, and the roof stays.
  */
  for (let k = 0; k < H.length; k++) {
    if (PLACE[k] !== 2 || NEAR[k] > MARGIN) continue
    const s = grid.SROAD[k]
    if (underground(s)) {
      // The first metres of roof: cleared over the road's own strip only, so
      // a cell straddling the mouth cannot stand across the last open ring.
      const into = Math.min(s - (M.hollow.from + 22), M.hollow.to - 22 - s)
      if (into > 7 || NEAR[k] > WALLS[k] + EDGE + 1.5) continue
    }
    const allowed = LEVEL[k] - 0.05 + 2.2 * Math.max(0, NEAR[k] - WALLS[k] - CELL * 0.6)
    if (H[k] > allowed) H[k] = allowed
  }
  // And under the drawn road itself.
  {
    const reach = CELL * 0.85
    for (let u = 0; u < under.length; u += 3) {
      const [i0, i1, j0, j1] = span(under[u], under[u + 1], reach)
      for (let j = j0; j <= j1; j++) {
        const dz = z0 + j * CELL - under[u + 1]
        for (let i = i0; i <= i1; i++) {
          const dx = x0 + i * CELL - under[u]
          if (dx * dx + dz * dz > reach * reach) continue
          const k = j * nx + i
          if (H[k] > under[u + 2]) H[k] = under[u + 2]
        }
      }
    }
  }

  // Slopes and colour.
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
  const COL = new Float32Array(H.length * 3)
  for (let k = 0; k < H.length; k++) {
    if (NEAR[k] > MARGIN + CELL) continue
    const i = k % nx
    const j = (k - i) / nx
    const x = x0 + i * CELL
    const z = z0 + j * CELL
    const c = k * 3
    const place = PLACE[k]
    const steep = STEEP[k]
    // The meadow's grass, the wood's floor, the plain: by the nearest road's place, blended at the seams.
    const base = place === 3 ? PLAIN : place === 4 ? LITTER : MEADOW
    COL[c] = base.r
    COL[c + 1] = base.g
    COL[c + 2] = base.b
    if (place === 0 || place === 1) mixInto(COL, c, MEADOW_DRY, smooth(0.5, 0.75, noise2(x / 33, z / 33)) * 0.7)
    if (place === 3) mixInto(COL, c, PLAIN_PALE, smooth(0.55, 0.8, noise2(x / 41 + 7, z / 41)) * 0.6)
    if (place === 4) mixInto(COL, c, MOSS, smooth(0.45, 0.7, noise2(x / 24 + 3, z / 24)) * 0.7)
    // The valley: banks of earth, and gravel down by the water.
    if (place === 1 || place === 2) mixInto(COL, c, BANK, steep * 0.9)
    if (place === 2) mixInto(COL, c, KNOLL, smooth(0.3, 0.9, steep) * 0.8 + 0.25)
    if (grid.RIVER[k] < 9) mixInto(COL, c, GRAVEL, 1 - smooth(4, 9, grid.RIVER[k]))
    const grain = 0.9 + hash2(i, j) * 0.18
    COL[c] *= grain
    COL[c + 1] *= grain
    COL[c + 2] *= grain
  }

  // Tiles.
  const tiles: LandTile[] = []
  const reach = MARGIN - 8
  const heightOf = (i: number, j: number) => H[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))]
  void heightOf
  for (let jFrom = 0; jFrom < nz - 1; jFrom += TILE) {
    for (let iFrom = 0; iFrom < nx - 1; iFrom += TILE) {
      const iTo = Math.min(nx - 1, iFrom + TILE)
      const jTo = Math.min(nz - 1, jFrom + TILE)
      const w = iTo - iFrom + 1
      const h = jTo - jFrom + 1
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
      if (kept === 0) continue
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
          const gx = GX[k]
          const gz = GZ[k]
          const length = Math.sqrt(gx * gx + 4 * CELL * CELL + gz * gz)
          normal[v * 3] = gx / length
          normal[v * 3 + 1] = (2 * CELL) / length
          normal[v * 3 + 2] = gz / length
          col[v * 3] = COL[k * 3]
          col[v * 3 + 1] = COL[k * 3 + 1]
          col[v * 3 + 2] = COL[k * 3 + 2]
          // Grass and litter are matt; the knoll's rock takes the shader's grain.
          surface[v * 2 + 1] = PLACE[k] === 2 ? 0.55 + STEEP[k] * 0.2 : 0.2
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
      tiles.push({ geometry, centre, radius })
    }
  }

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

  return { tiles, heightAt, slopeAt, roadDistance, colourAt, river }
}
