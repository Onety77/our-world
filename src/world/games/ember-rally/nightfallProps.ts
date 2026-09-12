/**
 * What stands on the Nightfall — built in the world, on the ground where it is.
 *
 * ---------------------------------------------------------------------------
 * Baked into the road's own chunk meshes, drawn with the road's rock material
 * and culled with the road, exactly as the Harmattan's `sahelProps` are. Every
 * piece here is a thing the garden has, taken from the place it belongs to:
 *
 *   **the Wellspring's banks** — boulders down both sides of the water and
 *   scree behind them, stones sitting *across* the waterline rather than
 *   beside it, and the spring itself, a stone-rimmed pool where the water
 *   rises (`world/hub/landmarks/River`, `sections/river`);
 *
 *   **the knoll's outcrops** — lumps of rock where the hillside is steep, so it
 *   is a hill of stone with grass on it rather than a green cone;
 *
 *   **the passages** — stalactites hanging from the vault, and roots of the
 *   wood above coming through the roof, never lower than four metres over the
 *   road;
 *
 *   **the room's seats** — flat stones round the hearth, a stride back from
 *   the fire, on the floor of the bowl;
 *
 *   **the cairn** — the Stars' own landmark: a low ring of boulders and a
 *   leaning pillar of slabs, the two lights over it, warm and cool, close and
 *   never touching (`world/hub/landmarks/Stars`);
 *
 *   **the waymarkers** — pale stones along the plain's verges, alternating,
 *   so a road under starlight has an edge the headlamps can find;
 *
 *   **the gateway** — two heavy uprights and a lintel where the walk begins,
 *   the only built timber on the road (`world/hub/landmarks/LanternWalk`);
 *
 *   **the gate** — the two stone stacks the finish runs between, with the
 *   fire on top, as every road has.
 *
 * Nothing here is inside the verge the physics stops at, and nothing is over
 * the road lower than the car's own height and a good deal more.
 * ---------------------------------------------------------------------------
 */

import { Color, Vector3 } from 'three'
import { basisAt, roadPoint, type RoadBasis } from './geometry'
import { random } from './model'
import { GATE_HEIGHT, NIGHTFALL, emptyRoad, roadAt, vergeWidth, type Track } from './track'
import { RIVER_HALF, underground, type Land } from './nightfallLand'
import type { Room } from './Nightfall'

/** The part of a course mesh a prop needs: vertices, triangles. */
export interface Baker {
  readonly count: number
  vertex(point: Vector3, colour: Color, wet?: number, rough?: number): void
  tri(a: number, b: number, c: number): void
  quad(a: number, b: number, c: number, d: number): void
}

/* ---- the palette ------------------------------------------------------------ */

const ROCK = new Color('#5a5249')
const ROCK_LOW = new Color('#4a433c')
const ROCK_HIGH = new Color('#66605a')
/** The Wellspring's stone: dry above the water, dark where it is wet. */
const DRY_STONE = ['#8a857a', '#7b766c', '#948e81', '#6f6a61', '#a09889'].map((c) => new Color(c))
const WET_STONE = ['#5c584f', '#514e46', '#66625a'].map((c) => new Color(c))
/** The Stars' stone, cool and pale. */
const STAR_STONE = ['#585a63', '#4c4e57', '#63646d', '#44464e'].map((c) => new Color(c))
/** The plain's waymarkers: pale enough to catch a headlamp. */
const WAYMARK = new Color('#a8a397')
/** The knoll's rock. */
const KNOLL_ROCK = ['#5c5449', '#4e4840', '#6a6156', '#57504a'].map((c) => new Color(c))
/** Root wood, and the walk's timber. */
const ROOT = new Color('#3b2f24')
const ROOT_PALE = new Color('#5a4a3a')
const TIMBER = new Color('#1a140f')
/** A willow's strands: grey-green, paler at the top. */
const WILLOW_HIGH = new Color('#6f7a4e')
const WILLOW_LOW = new Color('#4e5a3a')
/** Stalactite: the vault's stone, wet at the tip. */
const DRIP = new Color('#5e564c')
const DRIP_TIP = new Color('#3e3a36')

const point = new Vector3()
const tint = new Color()

function hash3(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

/* ---- the shapes ------------------------------------------------------------- */

/**
 * A lump of stone sitting in the ground: a lathe of three rings and seven
 * sides, lumpy per seed. `squash` flattens it (a slab, a seat), and the
 * colour runs from `low` at the base to `high` on top.
 */
export function stone(mesh: Baker, x: number, y: number, z: number, size: number, seed: number, low = ROCK_LOW, high = ROCK_HIGH, squash = 1, wet = 0) {
  const RINGS = 3
  const SIDES = 7
  const base = mesh.count
  for (let i = 0; i <= RINGS; i++) {
    const phi = (-0.3 + (i / RINGS) * 1.3) * (Math.PI / 2)
    const r = Math.cos(phi)
    tint.copy(low).lerp(high, i / RINGS).multiplyScalar(0.85 + hash3(seed, i, 1) * 0.3)
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2 + seed
      const lumpy = 0.8 + hash3(seed, i, k) * 0.4
      point.set(x + Math.cos(a) * size * r * lumpy, y + (Math.sin(phi) * size * 0.7 - size * 0.2) * squash, z + Math.sin(a) * size * 0.85 * r * lumpy)
      mesh.vertex(point, tint, wet, 0.8)
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < SIDES; k++) {
      const a = base + i * SIDES + k
      const next = base + i * SIDES + ((k + 1) % SIDES)
      mesh.quad(a, a + SIDES, next + SIDES, next)
    }
  }
}

/** An axis-aligned box in a frame: for timber. */
function box(mesh: Baker, at: Vector3, frame: RoadBasis, n: number, y: number, along: number, hx: number, hy: number, hz: number, colour: Color) {
  const base = mesh.count
  for (const dz of [-hz, hz]) for (const dy of [0, hy]) for (const dx of [-hx, hx]) {
    point.set(
      at.x + frame.rx * (n + dx) + frame.fx * (along + dz) + frame.ux * (y + dy),
      at.y + frame.ry * (n + dx) + frame.fy * (along + dz) + frame.uy * (y + dy),
      at.z + frame.rz * (n + dx) + frame.fz * (along + dz) + frame.uz * (y + dy),
    )
    tint.copy(colour).multiplyScalar(0.9 + hash3(base, dx, dy) * 0.2)
    mesh.vertex(point, tint, 0, 0.7)
  }
  mesh.quad(base, base + 2, base + 3, base + 1)
  mesh.quad(base + 4, base + 5, base + 7, base + 6)
  mesh.quad(base, base + 1, base + 5, base + 4)
  mesh.quad(base + 2, base + 6, base + 7, base + 3)
  mesh.quad(base + 1, base + 3, base + 7, base + 5)
  mesh.quad(base, base + 4, base + 6, base + 2)
}

/**
 * A tapered tube between two points, six-sided, for a root or a stalactite.
 * Open at both ends; a chain of them shares no vertices, which is fine for
 * something seen from a car.
 */
function tube(mesh: Baker, from: Vector3, to: Vector3, r0: number, r1: number, colour0: Color, colour1: Color, seed: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const len = Math.hypot(dx, dy, dz) || 1
  const ax = dx / len, ay = dy / len, az = dz / len
  // Two perpendiculars.
  let px = 0, py = 1, pz = 0
  if (Math.abs(ay) > 0.9) { px = 1; py = 0 }
  let qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px
  const ql = Math.hypot(qx, qy, qz) || 1
  qx /= ql; qy /= ql; qz /= ql
  px = qy * az - qz * ay; py = qz * ax - qx * az; pz = qx * ay - qy * ax
  const base = mesh.count
  for (const [c, r, colour] of [[from, r0, colour0], [to, r1, colour1]] as const) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      const lump = 0.85 + hash3(seed, k, c === from ? 1 : 2) * 0.3
      point.set(c.x + (Math.cos(a) * px + Math.sin(a) * qx) * r * lump, c.y + (Math.cos(a) * py + Math.sin(a) * qy) * r * lump, c.z + (Math.cos(a) * pz + Math.sin(a) * qz) * r * lump)
      tint.copy(colour).multiplyScalar(0.9 + hash3(seed, k, 3) * 0.2)
      mesh.vertex(point, tint, 0, 0.75)
    }
  }
  for (let k = 0; k < 6; k++) {
    const k2 = (k + 1) % 6
    mesh.quad(base + k, base + k2, base + 6 + k2, base + 6 + k)
  }
}

/** A cone hanging from a point: a stalactite. */
function drip(mesh: Baker, x: number, y: number, z: number, length: number, radius: number, seed: number) {
  const base = mesh.count
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    const lump = 0.8 + hash3(seed, k, 1) * 0.4
    point.set(x + Math.cos(a) * radius * lump, y + 0.15, z + Math.sin(a) * radius * lump)
    tint.copy(DRIP).multiplyScalar(0.85 + hash3(seed, k, 2) * 0.3)
    mesh.vertex(point, tint, 0.2, 0.8)
  }
  point.set(x + (hash3(seed, 7, 1) - 0.5) * 0.2, y - length, z + (hash3(seed, 7, 2) - 0.5) * 0.2)
  mesh.vertex(point, DRIP_TIP, 0.6, 0.6)
  for (let k = 0; k < 6; k++) mesh.tri(base + k, base + 6, base + ((k + 1) % 6))
}

/* ---- the places ------------------------------------------------------------- */

export interface PropSites {
  /** Where the cairn's pillar tops out, for the two lights over it. */
  cairnTop: Vector3
}

/**
 * Lay everything. `meshFor(s)` is the chunk a metre of road is drawn in, so
 * each prop is culled with the road beside it.
 */
export function layProps(track: Track, land: Land, room: Room, meshFor: (s: number) => Baker): PropSites {
  const rng = random(track.seed ^ 0x6e1f7)
  const M = NIGHTFALL
  const road = emptyRoad()
  const frame: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }
  const wallAt = (s: number) => {
    roadAt(track, s, road)
    return road.width + vergeWidth(road.room)
  }
  /**
   * How far a point is from the road's middle, exactly, against the road's
   * own metre samples within forty metres of `s` — the land's own distance is
   * read off five-metre cells, which is not good enough for a stone that must
   * be a stride outside the verge rather than on it.
   */
  const exactDistance = (s: number, x: number, z: number) => {
    const from = Math.max(0, Math.round(s) - 40)
    const to = Math.min(track.x.length - 1, Math.round(s) + 40)
    let best = Infinity
    for (let i = from; i <= to; i++) {
      const d = Math.hypot(track.x[i] - x, track.z[i] - z)
      if (d < best) best = d
    }
    return best
  }
  /** A point beside the road, and whether it is clear of the drawn road. */
  const beside = (s: number, n: number, along = 0): { x: number; z: number; clear: boolean } => {
    roadAt(track, s, road)
    basisAt(road, frame)
    const h = Math.hypot(frame.rx, frame.rz) || 1
    const x = road.x + (frame.rx / h) * n + frame.fx * along
    const z = road.z + (frame.rz / h) * n + frame.fz * along
    return { x, z, clear: exactDistance(s, x, z) > road.width + vergeWidth(road.room) + 0.6 }
  }

  /*
    The Wellspring's banks.

    Down both sides of the water: boulders at the bank, scree behind them, and
    stones standing in the shallows with their heads above the water. Dry stone
    up the bank, wet stone in the water — the same two sets the garden's river
    is built of. Never on the road, which the river crosses twice.
  */
  {
    const pts = land.river
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[Math.min(pts.length - 1, i + 1)]
      const o = pts[Math.max(0, i - 1)]
      let dx = q.x - o.x
      let dz = q.z - o.z
      const len = Math.hypot(dx, dz) || 1
      dx /= len
      dz /= len
      const mesh = meshFor(p.s)
      roadAt(track, p.s, road)
      const clear = road.width + vergeWidth(road.room) + 0.8
      for (const side of [-1, 1]) {
        // The bank: a boulder or two.
        if (rng() < 0.55) {
          const d = RIVER_HALF + 0.4 + rng() * 2.4
          const x = p.x - dz * d * side + dx * (rng() - 0.5) * 3
          const z = p.z + dx * d * side + dz * (rng() - 0.5) * 3
          if (exactDistance(p.s, x, z) > clear) {
            const size = 0.5 + rng() * rng() * 1.7
            const c = DRY_STONE[Math.floor(rng() * DRY_STONE.length)]
            stone(mesh, x, land.heightAt(x, z) - size * 0.2, z, size, i * 3 + side, c.clone().multiplyScalar(0.8), c, 0.85 + rng() * 0.3)
          }
        }
        // Scree behind it.
        for (let k = 0; k < 2; k++) {
          if (rng() > 0.5) continue
          const d = RIVER_HALF + 2 + rng() * 5
          const x = p.x - dz * d * side + dx * (rng() - 0.5) * 3
          const z = p.z + dx * d * side + dz * (rng() - 0.5) * 3
          if (exactDistance(p.s, x, z) < clear) continue
          const size = 0.15 + rng() * 0.3
          const c = DRY_STONE[Math.floor(rng() * DRY_STONE.length)]
          stone(mesh, x, land.heightAt(x, z) - size * 0.3, z, size, i * 5 + side + k, c.clone().multiplyScalar(0.85), c)
        }
      }
      // In the water: a stone across the waterline, its head above it.
      if (rng() < 0.3) {
        const d = (rng() - 0.5) * RIVER_HALF * 1.3
        const x = p.x - dz * d + dx * (rng() - 0.5) * 2
        const z = p.z + dx * d + dz * (rng() - 0.5) * 2
        if (exactDistance(p.s, x, z) > clear + 1) {
          const size = 0.45 + rng() * 0.8
          const c = WET_STONE[Math.floor(rng() * WET_STONE.length)]
          stone(mesh, x, p.y - size * 0.35, z, size, i * 7, c.clone().multiplyScalar(0.8), DRY_STONE[1], 1, 0.7)
        }
      }
    }
    // Willows along the water: a leaning trunk and a fall of long strands to
    // just over the surface. The wood's generator has no weeping species, so
    // this is the one tree on the road built by hand — a few, on the bank
    // away from the road, where a willow stands.
    for (let i = 4; i < pts.length - 4; i += 9 + Math.floor(rng() * 8)) {
      const p = pts[i]
      const q = pts[i + 1]
      let dx = q.x - p.x
      let dz = q.z - p.z
      const len = Math.hypot(dx, dz) || 1
      dx /= len
      dz /= len
      // On whichever bank is farther from the road: `away` is the sign that puts (-dz, dx) on that side.
      const away = exactDistance(p.s, p.x - dz * (RIVER_HALF + 3), p.z + dx * (RIVER_HALF + 3)) > exactDistance(p.s, p.x + dz * (RIVER_HALF + 3), p.z - dx * (RIVER_HALF + 3)) ? 1 : -1
      // At the water's edge, feet in the wet bank, not up the valley wall behind it.
      const d = RIVER_HALF + 0.2 + rng() * 0.9
      const x = p.x - dz * d * away
      const z = p.z + dx * d * away
      if (exactDistance(p.s, x, z) < wallAt(p.s) + 5) continue
      const mesh = meshFor(p.s)
      const foot = new Vector3(x, Math.min(land.heightAt(x, z), p.y + 0.6) - 0.3, z)
      const height = 4.5 + rng() * 2.5
      // The trunk leans over the water.
      const crown = new Vector3(x + dz * away * 1.4, foot.y + height, z - dx * away * 1.4)
      tube(mesh, foot, crown, 0.32, 0.18, ROOT, ROOT_PALE, 300 + i)
      // Strands fanning out from near the crown and drooping outward, in two
      // pieces each so they bow rather than hang like a comb.
      const strands = 26 + Math.floor(rng() * 10)
      for (let k = 0; k < strands; k++) {
        const a = rng() * Math.PI * 2
        const reach = 1.4 + rng() * 2.6
        const top = crown.y + 0.4 - rng() * 0.6
        const bottom = Math.max(p.y + 0.3, top - 3.5 - rng() * 3)
        const w = 0.05 + rng() * 0.05
        // Three points down the strand: out from the crown, over, and down.
        const px = (t: number) => crown.x + Math.cos(a) * reach * Math.sin(t * Math.PI * 0.5)
        const pz = (t: number) => crown.z + Math.sin(a) * reach * Math.sin(t * Math.PI * 0.5)
        const py = (t: number) => top - (top - bottom) * (1 - Math.cos(t * Math.PI * 0.5))
        const base = mesh.count
        for (const [t, c] of [[0, WILLOW_HIGH], [0.45, WILLOW_HIGH], [1, WILLOW_LOW]] as const) {
          for (const side of [-1, 1]) {
            point.set(px(t) - Math.sin(a) * w * side, py(t), pz(t) + Math.cos(a) * w * side)
            tint.copy(c).multiplyScalar(0.85 + rng() * 0.3)
            mesh.vertex(point, tint, 0, 0.6)
          }
        }
        // Both faces: the road's material draws front faces only.
        mesh.quad(base, base + 1, base + 3, base + 2)
        mesh.quad(base + 2, base + 3, base + 5, base + 4)
        mesh.quad(base + 2, base + 3, base + 1, base)
        mesh.quad(base + 4, base + 5, base + 3, base + 2)
      }
    }

    // The spring: where the water rises, a ring of stones round a pool, and one standing.
    if (pts.length) {
      const p = pts[0]
      const mesh = meshFor(p.s)
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * Math.PI * 2
        const r = RIVER_HALF * 0.9 + rng() * 1.2
        const x = p.x + Math.cos(a) * r
        const z = p.z + Math.sin(a) * r
        if (exactDistance(p.s, x, z) < wallAt(p.s) + 0.8) continue
        const size = 0.5 + rng() * 0.7
        const c = k % 3 === 0 ? WET_STONE[k % WET_STONE.length] : DRY_STONE[k % DRY_STONE.length]
        stone(mesh, x, Math.max(p.y - 0.1, land.heightAt(x, z) - size * 0.2), z, size, 900 + k, c.clone().multiplyScalar(0.8), c)
      }
      const x = p.x - 2.5
      const z = p.z + 1.5
      if (exactDistance(p.s, x, z) > wallAt(p.s) + 0.8) stone(mesh, x, p.y + 0.3, z, 1.1, 950, WET_STONE[0], DRY_STONE[2], 1.8, 0.4)
    }
  }

  /*
    The valley's own cutting: scree at the foot of the bank the road is cut
    into, and the odd boulder come down it — the bank was a smooth green slope
    with a ruler's top, and a cut bank sheds stone.
  */
  for (let s = M.wellspring.from + 10; s < M.hollow.from - 10; s += 3) {
    for (const side of [-1, 1]) {
      if (rng() > 0.45) continue
      const out = wallAt(s) + 0.9 + rng() * rng() * 6
      const { x, z, clear } = beside(s, side * out, rng() * 3)
      if (!clear) continue
      const big = rng() < 0.12
      const size = big ? 0.6 + rng() * 0.9 : 0.14 + rng() * 0.3
      const c = DRY_STONE[Math.floor(rng() * DRY_STONE.length)]
      stone(meshFor(s), x, land.heightAt(x, z) - size * 0.3, z, size, Math.round(s * 2) + side, c.clone().multiplyScalar(0.7), c, 0.8 + rng() * 0.4)
    }
  }

  /*
    The knoll's outcrops: rock where the hillside is steep, and the summit over
    the room broken with a few big ones. Kept well off the road and off the
    mouths' cuttings, and never over the room's dome.
  */
  {
    for (let s = M.hollow.from - 40; s < M.hollow.to + 40; s += 7) {
      for (const side of [-1, 1]) {
        if (rng() > 0.6) continue
        const out = wallAt(s) + 10 + rng() * rng() * 60
        const { x, z, clear } = beside(s, side * out, rng() * 6)
        if (!clear) continue
        const slope = land.slopeAt(x, z)
        if (slope < 0.22 && rng() > 0.25) continue
        // Not through the dome.
        if (Math.hypot(x - room.x, z - room.z) < room.rim + 6 && land.heightAt(x, z) < room.y + room.height + 6) continue
        const size = 0.8 + rng() * rng() * 2.4
        const c = KNOLL_ROCK[Math.floor(rng() * KNOLL_ROCK.length)]
        stone(meshFor(s), x, land.heightAt(x, z) - size * 0.3, z, size, Math.round(s) + side, c.clone().multiplyScalar(0.75), c, 0.7 + rng() * 0.5)
      }
    }
  }

  /*
    The passages: stalactites from the vault, and the wood's roots through it.

    The roof at an offset `n` is about `ceiling * (1 - 0.08 * |n| / (0.62 * wall))`
    — see `vaultProfile`. Nothing hangs lower than four metres over the road,
    which is twice the car and more than the camera.
  */
  {
    const CLEAR = 4
    for (let s = M.hollow.from + 30; s < M.hollow.to - 30; s += 4 + rng() * 6) {
      if (!underground(s) || (s > M.ring.from - 34 && s < M.ring.to + 34)) continue
      roadAt(track, s, road)
      basisAt(road, frame)
      const wall = road.width + vergeWidth(road.room)
      const n = (rng() - 0.5) * wall * 1.1
      const roof = road.ceiling * (1 - (0.08 * Math.abs(n)) / (0.62 * wall)) - 0.1
      const mesh = meshFor(s)
      if (rng() < 0.7) {
        const length = Math.min(roof - CLEAR, 0.5 + rng() * rng() * 2.4)
        if (length > 0.35) {
          roadPoint(road, n, roof, point, frame)
          drip(mesh, point.x, point.y, point.z, length, 0.12 + rng() * 0.28, Math.round(s * 3))
        }
      } else {
        // A root: out of the roof and down in a slow curve, six short pieces,
        // wandering sideways and thinning to a pale tip.
        let from = roadPoint(road, n, roof + 0.2, new Vector3(), frame)
        let r = 0.14 + rng() * 0.12
        const pieces = 6
        const drift = (rng() - 0.5) * 2.4
        const drop = Math.min(roof - CLEAR, 1.5 + rng() * 2.5)
        const wobble = rng() * 6.28
        for (let b = 0; b < pieces; b++) {
          const t = (b + 1) / pieces
          const ease = t * t * (3 - 2 * t)
          const to = roadPoint(road, n + drift * ease + Math.sin(t * 5 + wobble) * 0.25, roof + 0.2 - drop * (1 - Math.cos(t * Math.PI * 0.5)), new Vector3(), frame)
          tube(mesh, from, to, r, r * 0.82, ROOT, b === pieces - 1 ? ROOT_PALE : ROOT, Math.round(s) + b)
          from = to
          r *= 0.82
        }
      }
    }
  }

  /*
    The room's seats: flat stones round the hearth, a stride back from the
    fire, on the floor of the bowl. Not evenly spaced, not all one size.
  */
  {
    const mesh = meshFor((M.ring.from + M.ring.to) / 2)
    for (let k = 0; k < 13; k++) {
      const a = (k / 13) * Math.PI * 2 + rng() * 0.3
      const r = 4.2 + rng() * 2.6
      const x = room.hearth.x + Math.cos(a) * r
      const z = room.hearth.z + Math.sin(a) * r
      const size = 0.45 + rng() * 0.4
      stone(mesh, x, room.floorAt(x, z) + size * 0.1, z, size, 700 + k, ROCK_LOW, ROCK_HIGH, 0.55)
    }
  }

  /*
    The cairn, on the inside of the plain's one bend: a low ring of boulders
    open toward the road, and the pillar the two lights stand over — four
    slabs, each off true.
  */
  const cairnTop = new Vector3()
  {
    const s = M.starsBend + 30
    const at = roadAt(track, s, emptyRoad())
    const wall = at.width + vergeWidth(at.room)
    // The bend turns left, so its inside is the negative side.
    const centre = beside(s, -(wall + 14))
    const cy = land.heightAt(centre.x, centre.z)
    const mesh = meshFor(s)
    for (let k = 0; k < 20; k++) {
      const a = rng() * Math.PI * 2
      const r = 2.4 + rng() * 2.2
      const x = centre.x + Math.cos(a) * r
      const z = centre.z + Math.sin(a) * r * 0.8
      if (exactDistance(s, x, z) < wall + 0.6) continue
      const size = 0.35 + rng() * 0.7
      const c = STAR_STONE[Math.floor(rng() * STAR_STONE.length)]
      stone(mesh, x, land.heightAt(x, z) - size * 0.25, z, size, 800 + k, c.clone().multiplyScalar(0.75), c, 0.6 + rng() * 0.4)
    }
    let height = cy
    for (let i = 0; i < 4; i++) {
      const size = 0.95 - i * 0.16
      const thickness = 0.28 + rng() * 0.18
      const c = STAR_STONE[i % STAR_STONE.length]
      stone(mesh, centre.x + (rng() - 0.5) * 0.3, height + thickness * 0.5, centre.z + (rng() - 0.5) * 0.3, size, 850 + i, c.clone().multiplyScalar(0.8), c, thickness / (size * 0.7))
      height += thickness
    }
    cairnTop.set(centre.x, height, centre.z)
  }

  /*
    The waymarkers: pale stones along both verges of the plain, alternating,
    every thirty metres or so — closer through the bend. Just outside the
    verge, where the physics never lets the car go.
  */
  {
    let side = 1
    for (let s = M.stars.from + 20; s < M.stars.to - 10; s += 22 + rng() * 14) {
      roadAt(track, s, road)
      const near = Math.abs(s - M.starsBend - 35) < 60
      const wall = road.width + vergeWidth(road.room)
      const { x, z } = beside(s, side * (wall + 0.35))
      const size = 0.28 + rng() * 0.16
      stone(meshFor(s), x, land.heightAt(x, z) - size * 0.15, z, size, Math.round(s), WAYMARK.clone().multiplyScalar(0.7), WAYMARK, 0.9)
      side = -side
      if (near) s -= 8
    }
  }

  /*
    The gateway, where the walk begins: two heavy uprights either side of the
    lane and a lintel across, high over anything on the road.
  */
  {
    const s = M.walk.from + 12
    roadAt(track, s, road)
    basisAt(road, frame)
    const wall = road.width + vergeWidth(road.room)
    const mesh = meshFor(s)
    const at = new Vector3(road.x, road.y, road.z)
    for (const side of [-1, 1]) box(mesh, at, frame, side * (wall + 0.9), -0.4, 0, 0.19, 5.1, 0.19, TIMBER)
    box(mesh, at, frame, 0, 4.4, 0, wall + 1.25, 0.3, 0.22, TIMBER)
    // And a short rail either side, which is what says fence rather than post.
    for (const side of [-1, 1]) box(mesh, at, frame, side * (wall + 2.2), 0.9, 0, 1.3, 0.12, 0.09, TIMBER)
  }

  /*
    The gate the finish runs between: two stacks of stone, the fire on top of
    each — `track.gate` gives where, and the lanterns already carry the fire.
  */
  for (const g of track.gate) {
    roadAt(track, g.s, road)
    basisAt(road, frame)
    const mesh = meshFor(g.s)
    const seed = Math.floor(Math.abs(g.n) * 97 + g.s)
    for (let i = 0; i < 5; i++) {
      const t = i / 4
      const lean = Math.sin(t * 2.1 + seed * 0.7) * 0.13
      roadPoint(road, g.n + lean, GATE_HEIGHT * (0.12 + t * 0.83), point, frame)
      const c = i === 4 ? WAYMARK : ROCK
      stone(mesh, point.x, point.y, point.z, 0.6 - t * 0.2, seed * 7 + i, c.clone().multiplyScalar(0.7), c, 0.9)
    }
  }

  // The two hearths — the fire you leave and the one you come back to — each in a ring of stones.
  for (const h of track.hearths) {
    roadAt(track, h.s, road)
    basisAt(road, frame)
    roadPoint(road, h.n, 0, point, frame)
    const cx = point.x
    const cz = point.z
    const mesh = meshFor(h.s)
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rng() * 0.3
      const x = cx + Math.cos(a) * 1.3
      const z = cz + Math.sin(a) * 1.3
      stone(mesh, x, land.heightAt(x, z) - 0.02, z, 0.3 + rng() * 0.16, Math.round(h.s) + k, ROCK_LOW, ROCK_HIGH)
    }
  }

  return { cairnTop }
}
