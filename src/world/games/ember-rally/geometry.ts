/**
 * Turning the road into rock.
 *
 * One cross-section, twenty-two points around, swept along the centreline and
 * kneaded so it reads as dug rather than extruded. The roots, the loose stone
 * and the little cairns under the lanterns go into the same buffers, so the
 * whole tunnel is a handful of meshes sharing one material and one lighting
 * model — which is the only reason a cave this long runs on a phone.
 *
 * **It is built in chunks of forty metres, and that is not an optimisation
 * detail.** You are *inside* this mesh. Drawn as one object, every ring in the
 * tunnel projects into the middle of the screen and the far end of the road is
 * painted first, so the near rock is drawn over the top of five hundred metres
 * of already-shaded fragments. Chunked, three.js sorts them front to back, the
 * depth test throws the far ones away, and anything past the fog is skipped
 * entirely.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Sphere,
  Vector3,
} from 'three'
import {
  GATE_HEIGHT,
  shortcutRoadAt,
  vergeWidth,
} from './track'
import { random, SAMPLE_MS, SAMPLE_SHORTCUT, type RallyRun } from './model'
import { emptyRoad, roadAt, roadAtRoute, type RoadAt, type Track } from './track'

/** Metres between cross-sections. */
const RING = 1.6
/** Metres of road per drawn object. */
const CHUNK = 40
/** Points around one cross-section. */
const PROFILE = 22
/** Where the road stops and the loose verge begins, as profile indices. */
const ROAD_POINTS = 9

// ---------------------------------------------------------------------------
// The frame the road carries with it
// ---------------------------------------------------------------------------

export interface RoadBasis {
  /** Down the road. */
  fx: number
  fy: number
  fz: number
  /** Out of its right-hand side, rolled with the banking. */
  rx: number
  ry: number
  rz: number
  /** Out of the road surface, rolled with it. */
  ux: number
  uy: number
  uz: number
}

const scratchBasis: RoadBasis = {
  fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0,
}

/**
 * The road's own axes at a point.
 *
 * Shared by the geometry, the car, the camera and the lights, so that "two
 * metres to the right, a metre up" means exactly one place and everything
 * agrees where it is — including on a banked corner, where the right-hand
 * direction is genuinely tilted and a car sitting on the outside really is
 * higher than one on the inside.
 */
export function basisAt(road: RoadAt, out: RoadBasis = scratchBasis): RoadBasis {
  const sh = Math.sin(road.heading)
  const ch = Math.cos(road.heading)
  const cb = Math.cos(road.bank)
  const sb = Math.sin(road.bank)
  out.fx = sh
  out.fy = road.grade
  out.fz = ch
  // flat right-hand normal, then rolled about the forward axis
  out.rx = -ch * cb
  out.ry = sb
  out.rz = sh * cb
  out.ux = ch * sb
  out.uy = cb
  out.uz = -sh * sb
  return out
}

/** A point on or above the road, in the world. */
export function roadPoint(
  road: RoadAt,
  n: number,
  y: number,
  out: Vector3,
  basis: RoadBasis = basisAt(road),
): Vector3 {
  out.set(
    road.x + basis.rx * n + basis.ux * y,
    road.y + basis.ry * n + basis.uy * y,
    road.z + basis.rz * n + basis.uz * y,
  )
  return out
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** A stable hash. The tunnel must come out the same on both phones. */
function hash3(a: number, b: number, c: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return s - Math.floor(s)
}

class Mesh {
  readonly position: number[] = []
  readonly color: number[] = []
  readonly surface: number[] = []
  readonly index: number[] = []

  get count(): number {
    return this.position.length / 3
  }

  vertex(x: number, y: number, z: number, col: Color, wet: number, rough: number) {
    this.position.push(x, y, z)
    this.color.push(col.r, col.g, col.b)
    this.surface.push(wet, rough)
  }

  quad(a: number, b: number, c: number, d: number) {
    this.index.push(a, b, c, a, c, d)
  }

  /** For the one place a ring closes onto a single point — see `capEnd`. */
  tri(a: number, b: number, c: number) {
    this.index.push(a, b, c)
  }

  build(): BufferGeometry {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3))
    geo.setAttribute('aColor', new BufferAttribute(new Float32Array(this.color), 3))
    geo.setAttribute('aSurface', new BufferAttribute(new Float32Array(this.surface), 2))
    geo.setIndex(this.index)
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    return geo
  }
}

// --- colours ---------------------------------------------------------------

const STONE_ROAD = new Color('#6a6158')
const STONE_WORN = new Color('#3a332e')
const EARTH = new Color('#4b3b26')
const MOSS = new Color('#3b4a2b')
const ROCK_LOW = new Color('#332a23')
const ROCK_MID = new Color('#3d3125')
const ROCK_HIGH = new Color('#282523')
const ROOT_BARK = new Color('#4e3722')
const ROOT_TIP = new Color('#6d5231')
const CAIRN = new Color('#4a4239')
const SHORTCUT_STONE = new Color('#4b4238')
const ROOTWAKE_MOUTH = new Color('#71583f')
const CHASM_WALL = new Color('#171310')
const ROOTWAKE_OCHRE = new Color('#6e452d')
const ROOTWAKE_QUARTZ = new Color('#736b5d')
// Firstlight is sun-warmed cut stone, not another brown cave. These stay muted
// enough for the headlamps and amber guidance stones to remain readable.
const FIRSTLIGHT_ROAD = new Color('#8c7560')
const FIRSTLIGHT_WORN = new Color('#58473a')
const FIRSTLIGHT_SAND = new Color('#74513a')
const FIRSTLIGHT_EDGE = new Color('#8f6848')
const FIRSTLIGHT_LOW = new Color('#5b3e32')
const FIRSTLIGHT_MID = new Color('#8a5d43')
const FIRSTLIGHT_HIGH = new Color('#b07d58')
const FIRSTLIGHT_WASH = new Color('#5a4238')
const FIRSTLIGHT_SCAR = new Color('#d0a36e')

const scratchColor = new Color()
const scratchPoint = new Vector3()

/**
 * One cross-section, as offsets and heights in the road's own frame.
 *
 * Filled into flat arrays rather than returned, because this runs twenty-two
 * times a ring and a thousand rings a road, and a garbage collector pause in
 * the middle of building a tunnel is a black screen.
 */
function crossSection(
  road: RoadAt,
  ring: number,
  offset: Float64Array,
  height: Float64Array,
) {
  const w = road.width
  const g = vergeWidth(road.room)
  const wall = w + g
  const ceil = road.ceiling
  const flare = 0.5 + road.room * 1.7

  // the road itself, crowned very slightly so water runs off it
  for (let k = 0; k < ROAD_POINTS; k++) {
    const t = (k / (ROAD_POINTS - 1)) * 2 - 1
    offset[k] = t * w
    height[k] = 0.055 * (1 - t * t) + (hash3(ring, k, 3) - 0.5) * 0.035
  }

  offset[9] = wall - g * 0.5
  height[9] = 0.09 + road.room * 0.07
  offset[10] = wall
  height[10] = 0.26 + road.room * 0.18

  offset[11] = wall + flare * 0.42
  height[11] = ceil * 0.26
  offset[12] = wall + flare * 0.58
  height[12] = ceil * 0.55
  offset[13] = wall + flare * 0.3
  height[13] = ceil * 0.8

  offset[14] = wall * 0.6
  height[14] = ceil * 0.955
  offset[15] = 0
  height[15] = ceil
  offset[16] = -wall * 0.6
  height[16] = ceil * 0.955

  offset[17] = -(wall + flare * 0.3)
  height[17] = ceil * 0.8
  offset[18] = -(wall + flare * 0.58)
  height[18] = ceil * 0.55
  offset[19] = -(wall + flare * 0.42)
  height[19] = ceil * 0.26

  offset[20] = -wall
  height[20] = 0.26 + road.room * 0.18
  offset[21] = -(wall - g * 0.5)
  height[21] = 0.09 + road.room * 0.07

  /*
    Knead it.

    A swept profile is a pipe, and a pipe is the single clearest tell that a
    tunnel was extruded. Two frequencies: a slow one that survives across
    several rings, which gives the walls bulges and pinches you can see coming,
    and a fast per-vertex one that gives the surface itself some tooth.
  */
  const centre = ceil * 0.45
  for (let k = ROAD_POINTS; k < PROFILE; k++) {
    const dn = offset[k]
    const dy = height[k] - centre
    const len = Math.hypot(dn, dy) || 1
    const slow = hash3(Math.floor(ring / 5), k, 11) - 0.5
    const slowNext = hash3(Math.floor(ring / 5) + 1, k, 11) - 0.5
    const blend = (ring % 5) / 5
    const wide = slow * (1 - blend) + slowNext * blend
    const fine = hash3(ring, k, 29) - 0.5
    const amount = wide * (0.5 + road.room * 1.5) + fine * (0.3 + road.room * 0.26)
    offset[k] += (dn / len) * amount
    height[k] += (dy / len) * amount

    /*
      The rock may never come inside the wall the physics stops at, or the car
      stops against thin air a foot short of a stone it can plainly see.

      Only the rock, though. Indices 9 and 21 are the *floor* of the verge and
      they sit well inside the wall by design — clamping those too pushed the
      loose shelf out until it was flush with the rock, and the road went
      straight from stone to wall with nothing to run wide onto.
    */
    if (k !== 9 && k !== 21 && Math.abs(offset[k]) < wall) {
      offset[k] = Math.sign(offset[k] || 1) * wall
    }
    height[k] = Math.max(k > 10 && k < 20 ? 0.6 : 0.2, height[k])
  }
  // and never let the vault come down onto the car
  for (let k = 13; k <= 17; k++) height[k] = Math.max(height[k], 2.5)
}

/** How wet a patch of road is, once the puddles have had their say. */
function wetnessAt(track: Track, s: number, n: number, base: number): number {
  let wet = base
  for (const puddle of track.puddles) {
    const ds = puddle.s - s
    if (ds > puddle.radius || ds < -puddle.radius) continue
    const dn = puddle.n - n
    const d = Math.hypot(ds, dn)
    if (d > puddle.radius) continue
    wet = Math.max(wet, 1 - (d / puddle.radius) * 0.75)
  }
  return Math.min(1, wet)
}

// --- the pieces that are not the tunnel ------------------------------------

/**
 * A root: a tapering tube along a path.
 *
 * Six sides, which is enough at the size these are and half the vertices of
 * eight. The tube is built by carrying a reference vector along the path
 * rather than by a Frenet frame, because a Frenet frame flips over at every
 * inflection and puts a visible twist in the middle of a root.
 */
function addTube(
  mesh: Mesh,
  path: Vector3[],
  radiusAt: (t: number) => number,
  colorAt: (t: number) => Color,
  /** How wet the surface is. Stone teeth are where the water comes through. */
  wet = 0.22,
) {
  const SIDES = 6
  const base = mesh.count
  const forward = new Vector3()
  const right = new Vector3()
  const up = new Vector3()
  const reference = new Vector3(0, 1, 0)

  for (let i = 0; i < path.length; i++) {
    const t = i / (path.length - 1)
    const a = path[Math.max(0, i - 1)]
    const b = path[Math.min(path.length - 1, i + 1)]
    forward.subVectors(b, a).normalize()
    if (Math.abs(forward.y) > 0.94) reference.set(1, 0, 0)
    else reference.set(0, 1, 0)
    right.crossVectors(forward, reference).normalize()
    up.crossVectors(right, forward).normalize()

    const r = radiusAt(t)
    const col = colorAt(t)
    for (let k = 0; k < SIDES; k++) {
      const a2 = (k / SIDES) * Math.PI * 2
      const cx = Math.cos(a2) * r
      const cy = Math.sin(a2) * r
      mesh.vertex(
        path[i].x + right.x * cx + up.x * cy,
        path[i].y + right.y * cx + up.y * cy,
        path[i].z + right.z * cx + up.z * cy,
        col,
        wet,
        0.5,
      )
    }
  }

  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < SIDES; k++) {
      const k2 = (k + 1) % SIDES
      mesh.quad(
        base + i * SIDES + k,
        base + i * SIDES + k2,
        base + (i + 1) * SIDES + k2,
        base + (i + 1) * SIDES + k,
      )
    }
  }
}

/** A lump of stone: a low-resolution sphere pushed about. */
function addBlob(
  mesh: Mesh,
  at: Vector3,
  radius: number,
  squash: number,
  seed: number,
  color: Color,
  wet: number,
) {
  const RINGS = 5
  const SIDES = 7
  const base = mesh.count
  for (let i = 0; i <= RINGS; i++) {
    const phi = (i / RINGS) * Math.PI
    for (let k = 0; k < SIDES; k++) {
      const theta = (k / SIDES) * Math.PI * 2
      const bump = 0.72 + hash3(seed, i, k) * 0.5
      const r = radius * bump
      scratchColor.copy(color).multiplyScalar(0.82 + hash3(seed + 1, i, k) * 0.34)
      mesh.vertex(
        at.x + Math.sin(phi) * Math.cos(theta) * r,
        at.y + Math.cos(phi) * r * squash,
        at.z + Math.sin(phi) * Math.sin(theta) * r,
        scratchColor,
        wet,
        0.7,
      )
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < SIDES; k++) {
      const k2 = (k + 1) % SIDES
      mesh.quad(
        base + i * SIDES + k,
        base + i * SIDES + k2,
        base + (i + 1) * SIDES + k2,
        base + (i + 1) * SIDES + k,
      )
    }
  }
}

/**
 * Closing an end of the tunnel with rock.
 *
 * **The road used to stop mid-air.** The sweep laid its last cross-section and
 * ended, which leaves a hole the exact shape of the tunnel's mouth — and since
 * you are inside the mesh looking down it, what that reads as is a black
 * rectangle hanging across the end of the road. It was the last thing you saw
 * of every single race, because the car ran out of road on every single race
 * (see `COAST` in `track`) and came to rest with its nose in it.
 *
 * So the sweep carries on for a few more rings with the section shrinking
 * toward a point and travelling forward as it goes, and closes on an apex.
 * That is an apse: a rounded end wall, made of the same profile as the tunnel
 * and therefore lit, coloured and kneaded like the rest of it, rather than a
 * flat disc glued over the hole. It costs six rings.
 *
 * Both ends get one. The near end is behind the camera for the whole race and
 * would never have been noticed — but `?rally=car` orbits, the replay cuts to
 * shots that look back up the road, and a hole is a hole.
 */
const CAP_RINGS = 5

function capEnd(mesh: Mesh, track: Track, s: number, direction: 1 | -1) {
  const road = emptyRoad()
  const basis: RoadBasis = { ...scratchBasis }
  const offset = new Float64Array(PROFILE)
  const height = new Float64Array(PROFILE)
  const point = new Vector3()

  roadAt(track, s, road)
  basisAt(road, basis)
  crossSection(road, Math.round(s / RING), offset, height)

  // Where the dome closes to, and how far into the rock it reaches. Tied to
  // the section rather than fixed, so a low throat gets a shallow apse and the
  // thirteen-metre hall at the end gets a real one.
  const apexY = road.ceiling * 0.42
  const depth = road.ceiling * 0.5 + road.width * 0.3

  const push = (n: number, y: number, along: number) => {
    roadPoint(road, n, y, point, basis)
    point.x += basis.fx * along
    point.y += basis.fy * along
    point.z += basis.fz * along
    return point
  }

  let previous = -1
  for (let j = 0; j <= CAP_RINGS; j++) {
    // Never reaches one: the apex closes the last of it, so no ring is ever
    // a set of twenty-two vertices all at the same point.
    const t = j / (CAP_RINGS + 1)
    const shrink = Math.cos((t * Math.PI) / 2)
    const along = Math.sin((t * Math.PI) / 2) * depth * direction
    const base = mesh.count

    for (let k = 0; k < PROFILE; k++) {
      const at = push(offset[k] * shrink, apexY + (height[k] - apexY) * shrink, along)
      const up = Math.min(1, (apexY + (height[k] - apexY) * shrink) / Math.max(1, road.ceiling))
      scratchColor.copy(ROCK_LOW).lerp(ROCK_MID, Math.min(1, up * 1.8))
      if (up > 0.5) scratchColor.lerp(ROCK_HIGH, (up - 0.5) * 1.6)
      // Darker the deeper into the recess, so the wall has somewhere to be.
      scratchColor.multiplyScalar((0.84 + hash3(j, k, 17) * 0.3) * (1 - t * 0.34))
      mesh.vertex(at.x, at.y, at.z, scratchColor, road.wet * 0.7, 0.6)
    }

    if (previous >= 0) {
      for (let k = 0; k < PROFILE; k++) {
        const k2 = (k + 1) % PROFILE
        // The far cap runs the way the road does and takes the tunnel's own
        // winding; the near one is its mirror, so its faces have to be turned
        // round or the whole apse is inside out and invisible.
        if (direction > 0) mesh.quad(previous + k, previous + k2, base + k2, base + k)
        else mesh.quad(base + k, base + k2, previous + k2, previous + k)
      }
    }
    previous = base
  }

  const at = push(0, apexY, depth * direction)
  const apex = mesh.count
  scratchColor.copy(ROCK_LOW).multiplyScalar(0.6)
  mesh.vertex(at.x, at.y, at.z, scratchColor, road.wet * 0.7, 0.6)
  for (let k = 0; k < PROFILE; k++) {
    const k2 = (k + 1) % PROFILE
    if (direction > 0) mesh.tri(previous + k, previous + k2, apex)
    else mesh.tri(previous + k2, previous + k, apex)
  }
}

/**
 * One of the two stones the finish runs between.
 *
 * A stack of boulders rather than a pillar, because a pillar is a made thing
 * and nothing else down here is made — the lanterns sit on cairns, and this is
 * the same idea built taller and given a fire. The lean comes off its own
 * position, so the pair are not a matched set.
 *
 * The light is not built here: it goes into `track.lanterns` with `fire` set,
 * which is what gets it drawn as a glow *and* picked up by the light window
 * with no special case anywhere. See the gate block in `dressTrack`.
 */
function buildGate(mesh: Mesh, track: Track, stone: { s: number; n: number }) {
  const road = emptyRoad()
  const basis: RoadBasis = { ...scratchBasis }
  const point = new Vector3()

  roadAt(track, stone.s, road)
  basisAt(road, basis)

  const seed = Math.floor(Math.abs(stone.n) * 97 + stone.s)
  const COURSES = 5
  for (let i = 0; i < COURSES; i++) {
    const t = i / (COURSES - 1)
    const lean = Math.sin(t * 2.1 + seed * 0.7) * 0.13
    roadPoint(road, stone.n + lean, GATE_HEIGHT * (0.12 + t * 0.83), point, basis)
    addBlob(
      mesh,
      point,
      0.6 - t * 0.24,
      0.6 + t * 0.22,
      seed * 7 + i,
      // The top course is the one the fire sits in, and it is the paler stone
      // every other lantern in the road stands on.
      i === COURSES - 1 ? CAIRN : ROCK_MID,
      road.wet * 0.4,
    )
  }
}

// ---------------------------------------------------------------------------

export interface TunnelChunk {
  /** Metres along the road this chunk starts and ends at. */
  from: number
  to: number
  geometry: BufferGeometry
  /** Present only on the Rootway, so the other tunnel can be culled. */
  shortcut?: boolean
}

export function buildTunnel(track: Track): TunnelChunk[] {
  const rings = Math.floor(track.length / RING) + 1
  const chunkCount = Math.ceil(track.length / CHUNK)
  const meshes: Mesh[] = Array.from({ length: chunkCount }, () => new Mesh())

  const offset = new Float64Array(PROFILE)
  const height = new Float64Array(PROFILE)
  const road = emptyRoad()
  const basis: RoadBasis = { ...scratchBasis }
  const point = new Vector3()
  const rng = random(track.seed ^ 0x2b7f11)
  const firstlight = track.stage === 'firstlight'

  const chunkOf = (s: number) =>
    Math.max(0, Math.min(chunkCount - 1, Math.floor(s / CHUNK)))

  /*
    --- the tunnel ---------------------------------------------------------

    Chunk by chunk rather than ring by ring, and every chunk owns both of its
    end rings. The alternative — assigning each ring to one chunk — leaves a
    ring's worth of nothing at every boundary, and in a tunnel a hole in the
    wall is a slot of pure black every forty metres. Twenty-two duplicated
    vertices per join is a much better trade than a seam.
  */
  const span: { from: number; to: number }[] = []
  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const mesh = meshes[chunk]
    const first = Math.floor((chunk * CHUNK) / RING)
    const last = Math.min(rings - 1, Math.floor(((chunk + 1) * CHUNK) / RING))
    span.push({ from: first * RING, to: last * RING })

    for (let i = first; i <= last; i++) {
      const s = i * RING
      roadAt(track, s, road)
      basisAt(road, basis)
      crossSection(road, i, offset, height)
      const base = mesh.count

      for (let k = 0; k < PROFILE; k++) {
        const n = offset[k]
        const y = height[k]
        roadPoint(road, n, y, point, basis)

        let wet = road.wet
        let rough = 0
        if (k < ROAD_POINTS) {
          wet = wetnessAt(track, s, n, road.wet * 0.55)
          // Tyre marks. There is no line painted on this road and no arrow
          // anywhere in the game, so the darker stone where everybody has
          // already been is doing real work: it is the only thing that tells
          // you where the corner wants the car.
          const away = Math.abs(n - road.line)
          const worn =
            (1 - Math.min(1, Math.max(0, (away - 0.4) / 0.95))) *
            (0.3 + Math.min(1, Math.abs(road.curv) * 95) * 0.7)
          scratchColor
            .copy(firstlight ? FIRSTLIGHT_ROAD : STONE_ROAD)
            .lerp(firstlight ? FIRSTLIGHT_WORN : STONE_WORN, worn * 0.7)
          // dirt gathers at the edges of any road
          const edge = Math.min(1, Math.max(0, (Math.abs(n) / road.width - 0.68) / 0.32))
          scratchColor.lerp(firstlight ? FIRSTLIGHT_SAND : EARTH, edge * 0.45)
        } else if (k === 9 || k === 10 || k === 20 || k === 21) {
          rough = 1
          wet = road.wet * 0.5
          scratchColor
            .copy(firstlight ? FIRSTLIGHT_SAND : EARTH)
            .lerp(firstlight ? FIRSTLIGHT_EDGE : MOSS, hash3(i, k, 7) * 0.55)
        } else {
          const up = Math.min(1, y / Math.max(1, road.ceiling))
          rough = 0.6
          wet = road.wet * 0.7
          scratchColor
            .copy(firstlight ? FIRSTLIGHT_LOW : ROCK_LOW)
            .lerp(firstlight ? FIRSTLIGHT_MID : ROCK_MID, Math.min(1, up * 1.8))
          if (up > 0.5) {
            scratchColor.lerp(firstlight ? FIRSTLIGHT_HIGH : ROCK_HIGH, (up - 0.5) * 1.6)
          }
          scratchColor.multiplyScalar(0.84 + hash3(i, k, 17) * 0.3)
        }

        mesh.vertex(point.x, point.y, point.z, scratchColor, wet, rough)
      }

      if (i > first) {
        const previous = base - PROFILE
        for (let k = 0; k < PROFILE; k++) {
          const k2 = (k + 1) % PROFILE
          const junctionOpen = track.split && (
            (s >= track.split.commitAt - 2 &&
              s <= track.split.separateAt + (firstlight ? 86 : 12)) ||
            (s >= track.split.rejoinAt - 48 && s <= track.split.to + 5)
          )
          // The right wall opens twice: into the hidden throat and where that
          // throat returns. Everywhere between, this remains a closed cave.
          if (junctionOpen && k >= 9 && k <= 13) continue
          // Tall Firstlight sections are real open canyon. Lower bands retain
          // their roof and become the Gallery; the change is visible and also
          // lets sunlight guide the exposed road without a fake glowing line.
          if (firstlight && road.ceiling >= 22 && k >= 13 && k <= 16) continue
          mesh.quad(previous + k, previous + k2, base + k2, base + k)
        }
      }
    }
  }

  // --- and both ends are rock ----------------------------------------------
  capEnd(meshes[0], track, 0, -1)
  capEnd(meshes[chunkCount - 1], track, (rings - 1) * RING, 1)

  const shortcutChunks: TunnelChunk[] = []

  /* The Rootwake is now a second swept cave, not a strip inside this one. */
  if (track.split) {
    const split = track.split
    for (let chunk = 0; chunk < chunkCount; chunk++) {
      const from = Math.max(split.from, span[chunk].from)
      const to = Math.min(split.to, span[chunk].to)
      if (to <= from) continue

      const mesh = new Mesh()
      let previous = -1
      const first = Math.ceil(from / RING) * RING
      for (let s = first; s <= to + 0.001; s += RING) {
        shortcutRoadAt(split, s, road)
        basisAt(road, basis)
        crossSection(road, Math.round(s / RING) + 17000, offset, height)
        const base = mesh.count
        const hardScar = Math.max(0, 1 - Math.abs(s - split.hardAt) / 12)
        const blindScar = Math.max(0, 1 - Math.abs(s - split.veryHardAt) / 7)

        for (let k = 0; k < PROFILE; k++) {
          const n = offset[k]
          const y = height[k]
          roadPoint(road, n, y, point, basis)
          let colour = firstlight ? FIRSTLIGHT_LOW : CHASM_WALL
          let wet = road.wet * 0.72
          let rough = 0.95
          if (k < ROAD_POINTS) {
            const edge = Math.min(1, Math.max(0, (Math.abs(n) / road.width - 0.62) / 0.38))
            const inMouth = s < split.separateAt
            scratchColor
              .copy(firstlight ? FIRSTLIGHT_WASH : inMouth ? ROOTWAKE_MOUTH : SHORTCUT_STONE)
              .lerp(firstlight ? FIRSTLIGHT_SAND : EARTH, edge * 0.52)
            const worn = Math.max(0, 1 - Math.abs(n - road.line) / 1.25)
            scratchColor.lerp(firstlight ? FIRSTLIGHT_WORN : STONE_WORN, worn * 0.38)
            scratchColor.multiplyScalar(
              (inMouth ? 0.92 : 0.74) + hash3(Math.round(s), k, 91) * (inMouth ? 0.12 : 0.22),
            )
            colour = scratchColor
            wet = road.wet
            rough = 0.42
          } else if (k === 9 || k === 10 || k === 20 || k === 21) {
            scratchColor
              .copy(firstlight ? FIRSTLIGHT_SAND : EARTH)
              .multiplyScalar(0.58 + hash3(Math.round(s), k, 72) * 0.2)
            colour = scratchColor
          } else {
            const inMouth = s < split.separateAt
            scratchColor
              .copy(firstlight ? FIRSTLIGHT_LOW : inMouth ? ROCK_LOW : CHASM_WALL)
              .lerp(
                firstlight ? FIRSTLIGHT_MID : ROCK_MID,
                hash3(Math.round(s / 2), k, 63) * (inMouth ? 0.52 : 0.38),
              )
            // Headlights catch two natural scars before the demanding bends:
            // ochre through the hard S, one cold quartz rib at the blind
            // reverse. They are landmarks, not a luminous racing line.
            if (hardScar > 0) {
              scratchColor.lerp(firstlight ? FIRSTLIGHT_SCAR : ROOTWAKE_OCHRE, hardScar * 0.54)
            }
            if (blindScar > 0) {
              scratchColor.lerp(firstlight ? FIRSTLIGHT_HIGH : ROOTWAKE_QUARTZ, blindScar * 0.68)
            }
            colour = scratchColor
          }
          mesh.vertex(point.x, point.y, point.z, colour, wet, rough)
        }

        if (previous >= 0) {
          for (let k = 0; k < PROFILE; k++) {
            const k2 = (k + 1) % PROFILE
            // The broad main chamber is the only floor until the right-hand
            // lane has actually moved beyond its edge.
            if (s < split.commitAt) continue
            // Firstlight stays an open ledge beyond the sandstone island. Its
            // lower-wash walls begin after the ledge has curved out of view,
            // so no sliced-off cross-section is presented at the route choice.
            const entranceOpen = s < split.separateAt + (firstlight ? 22 : 0)
            const exitOpen = s >= split.rejoinAt - 48
            /*
              While the lane is leaving the chamber, draw only its outer half:
              half a worn deck and the outside wall. The inner half is still
              the common floor, and drawing it twice is the overlap that made
              flat black polygons appear across the road.

              Once the centres are thirteen metres apart the full tunnel closes
              around Rootwake, with its inside wall left open briefly to make a
              natural junction rather than a capped tube.
            */
            // Only the outer half-shell exists in the open chamber: half the
            // worn deck, its wall, and the roof up to the shared centre seam.
            // The missing inner half is supplied by the main cave.
            if (entranceOpen) {
              if (firstlight) {
                // Firstlight begins as one broad, continuous canyon floor. Do
                // not grow the wash's outer wall and half-roof while that floor
                // is still inside the main road — those faces formed the tall
                // hanging slab that made the choice look broken. The wall rises
                // only once the two centrelines are genuinely separate.
                if (k > 8) continue
              } else if (k < 4 || k >= 16) continue
            }
            if (
              !firstlight &&
              s >= split.separateAt &&
              s < split.separateAt + 14 &&
              k >= 16 && k <= 21
            ) continue
            // At the far merge only the branch's inside half needs to open.
            if (exitOpen && k >= 16 && k <= 21) continue
            if (firstlight && k >= 13 && k <= 16) continue
            mesh.quad(previous + k, previous + k2, base + k2, base + k)
          }
        }
        previous = base
      }

      const geometry = mesh.build()
      if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere()
      shortcutChunks.push({ from, to, geometry, shortcut: true })
    }
  }

  // --- the finish, as two standing stones ----------------------------------
  for (const stone of track.gate) {
    buildGate(meshes[chunkOf(stone.s)], track, stone)
  }

  // --- roots ---------------------------------------------------------------
  const path: Vector3[] = Array.from({ length: 9 }, () => new Vector3())
  for (const root of track.roots) {
    const mesh = meshes[chunkOf(root.s)]
    roadAt(track, root.s, road)
    basisAt(road, basis)
    const wall = road.width + vergeWidth(road.room)
    const ceil = road.ceiling
    const arch = Math.abs(root.side) < 0.45

    for (let i = 0; i < path.length; i++) {
      const t = i / (path.length - 1)
      let n: number
      let y: number
      if (arch) {
        // Over the vault, wall to wall, dipping in the middle. These are the
        // ones the headlights sweep along as you pass under them.
        const sway = Math.sin(root.twist + t * 2.4) * 0.35
        n = (t * 2 - 1) * wall * 0.95 + sway
        y = ceil * (0.98 - Math.sin(t * Math.PI) * root.reach * 0.42)
      } else {
        // Down a wall, curling in at the tip.
        const side = Math.sign(root.side)
        n = side * wall * (0.99 + Math.sin(root.twist + t * 3.1) * 0.06 - t * root.reach * 0.22)
        y = ceil * (0.99 - t * root.reach)
      }
      const alongS = root.s + Math.sin(root.twist * 2 + t * 4.2) * (0.6 + t * 1.5)
      roadAt(track, alongS, road)
      basisAt(road, basis)
      roadPoint(road, n, y, path[i], basis)
    }

    addTube(
      mesh,
      path,
      (t) => root.thickness * (arch ? 1 - Math.abs(t - 0.5) * 0.5 : 1 - t * 0.62),
      (t) => scratchColor.copy(ROOT_BARK).lerp(ROOT_TIP, t * 0.6 + hash3(root.seed, 0, 0) * 0.2),
    )
  }

  /*
    --- stone teeth ---------------------------------------------------------

    Stalactites off the vault and stalagmites on the verge. Swept as tubes that
    taper to a point, with a lean and a kink in them so no two are the same
    spindle — a cave full of identical cones is a cave full of traffic cones.

    The hanging ones are what the roof is *for*. A smooth vault at forty metres
    a second is a dark ceiling and nothing more; a vault with teeth in it has
    your own headlamps finding one, sweeping along it, and letting it go, over
    and over, which is the whole sensation of being underground at speed.
  */
  const spine: Vector3[] = Array.from({ length: 6 }, () => new Vector3())
  for (const spike of track.spikes) {
    const mesh = meshes[chunkOf(spike.s)]
    roadAt(track, spike.s, road)
    basisAt(road, basis)

    const lean = (hash3(spike.seed, 1, 3) - 0.5) * 0.55
    const twist = hash3(spike.seed, 2, 9) * Math.PI * 2
    for (let i = 0; i < spine.length; i++) {
      const t = i / (spine.length - 1)
      // A little sway, so it hangs like something that grew rather than a peg.
      const wobble = Math.sin(twist + t * 2.6) * spike.thickness * 0.9
      const n = spike.n + lean * t * spike.length + wobble
      const y = spike.hanging
        ? road.ceiling * 0.995 - t * spike.length
        : t * spike.length
      roadPoint(road, n, y, spine[i], basis)
    }

    addTube(
      mesh,
      spine,
      // Fat at the root, a point at the tip — and never quite zero, because a
      // tube of radius zero is a fan of degenerate triangles with no normals.
      (t) => Math.max(0.012, spike.thickness * Math.pow(1 - t, 0.75)),
      (t) =>
        scratchColor
          .copy(spike.hanging ? ROCK_HIGH : ROCK_LOW)
          .lerp(ROCK_MID, t * 0.5 + hash3(spike.seed, 3, 1) * 0.3),
      // Wet, and more so at the tip: this is where the water comes through.
      road.wet * 0.5 + 0.25,
    )
  }

  // --- loose stone ---------------------------------------------------------
  for (const boulder of track.boulders) {
    const mesh = meshes[chunkOf(boulder.s)]
    roadAt(track, boulder.s, road)
    basisAt(road, basis)
    roadPoint(road, boulder.n, boulder.size * 0.34, scratchPoint, basis)
    addBlob(
      mesh,
      scratchPoint,
      boulder.size,
      0.62,
      boulder.seed,
      firstlight ? FIRSTLIGHT_MID : ROCK_MID,
      road.wet * 0.6,
    )
  }

  // --- something under every lantern that sits on the ground ----------------
  for (const lantern of track.lanterns) {
    if (lantern.y > 1.1) continue
    // Rootwake's mouth markers are luminous stones in the wall. Their sprites
    // and light use the hidden centreline; a base added to a main-road chunk
    // would disappear as soon as route culling closes the junction.
    if (lantern.shortcut) continue
    const mesh = meshes[chunkOf(lantern.s)]
    roadAt(track, lantern.s, road)
    basisAt(road, basis)
    roadPoint(road, lantern.n, 0.05, scratchPoint, basis)
    addBlob(
      mesh,
      scratchPoint,
      Math.min(0.62, 0.3 + lantern.size * 0.26),
      1.35 + rng() * 0.8,
      Math.floor(lantern.s * 13),
      CAIRN,
      road.wet * 0.5,
    )
  }

  const mainChunks = meshes.map((mesh, i) => {
    const geometry = mesh.build()
    // The sphere the vertices imply is generous for something forty metres
    // long, and that is fine: it is a coarse "is this anywhere near the
    // frame", and the real saving is the per-frame fog cut in the Stage.
    if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere()
    return { from: span[i].from, to: span[i].to, geometry, shortcut: false }
  })
  return [...mainChunks, ...shortcutChunks]
}

export function buildTrail(track: Track, run: RallyRun, halfWidth = 0.26): BufferGeometry {
  const samples = Math.floor(run.path.length / 4)
  const position = new Float32Array(samples * 6)
  const time = new Float32Array(samples * 2)
  const index: number[] = []

  const road = emptyRoad()
  const basis: RoadBasis = { ...scratchBasis }
  const point = new Vector3()

  for (let i = 0; i < samples; i++) {
    const n = run.path[i * 4] / 1000
    const s = run.path[i * 4 + 1] / 100
    const at = (i * SAMPLE_MS) / 1000

    const shortcut = (run.path[i * 4 + 3] & SAMPLE_SHORTCUT) !== 0
    roadAtRoute(track, s, shortcut, road)
    basisAt(road, basis)
    for (let side = 0; side < 2; side++) {
      const offset = side === 0 ? -halfWidth : halfWidth
      /*
        Clear of the stone.

        The road is crowned in the middle and its vertices carry a couple of
        centimetres of noise, so a ribbon laid a few millimetres above the
        *smoothed* centreline is under the actual mesh half the time — and what
        that renders as is a dashed line, which reads as a deliberate
        decoration rather than as a car having been here.
      */
      roadPoint(road, n + offset, 0.13, point, basis)
      const v = (i * 2 + side) * 3
      position[v] = point.x
      position[v + 1] = point.y
      position[v + 2] = point.z
      time[i * 2 + side] = at
    }
    if (i > 0) {
      const a = (i - 1) * 2
      const b = i * 2
      index.push(a, a + 1, b + 1, a, b + 1, b)
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(position, 3))
  geo.setAttribute('aTime', new BufferAttribute(time, 1))
  geo.setIndex(index)
  geo.computeBoundingSphere()
  return geo
}
