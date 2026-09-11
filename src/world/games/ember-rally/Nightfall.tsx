/**
 * The Nightfall — the garden itself, as a road.
 *
 * =============================================================================
 * **The fifth road is the place the other four are under, beside and above.**
 * The Rootway is a cave beneath the garden, the Moonbreak a causeway off its
 * shore, the Stormcrown and the Harmattan somewhere else entirely. This one
 * runs *through* it: the meadow under the Tree of Thoughts, the Wellspring's
 * valley, the Hollow's firelit room, the plain under the Stars, and the Lantern
 * Walk — in the order you browse them, from the last of the light to the dark.
 *
 * Everything here is built the garden's way, out of the garden's own pieces:
 *
 *   **the great tree** is grown by `growTree`, the same generator that grows
 *   the Tree of Thoughts and every tree in the wood, and stands at the centre
 *   of the Tree Turn with the road going round it;
 *
 *   **the river** is `world/water`, the Wellspring's own shader;
 *
 *   **the room** is the Hollow's: a domed chamber with the hearth in the
 *   middle of it and small fires against the walls;
 *
 *   **the sky** is the Stars': a night with a band of her dawn on one horizon;
 *
 *   **the lanterns** are the Lantern Walk's posts with their glass, and their
 *   halos.
 *
 * And what the two of you have put in the garden is on it — see `Nightlife`:
 * a flower for every thought, a paper for each of them hanging from the tree,
 * a light in the sky for every message, a lit pane for every memory. Not a
 * picture of the garden; the garden's own data, driven through.
 *
 * The light is the road's own story. `Race` eases the shared light block from
 * the Meadow's low sun to the valley's dusk, to no daylight at all under the
 * Hollow, to the deep night of the plain and the lantern-lit wood — one road,
 * the day going with it.
 *
 * Four rules, from the Harmattan: nothing over the road that the car could
 * meet, nothing solid inside the verge, silhouette before detail, and the
 * road's colour law here is the garden's — muted greens, dust, dark earth,
 * and the two lights.
 * =============================================================================
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { growTree, leafGeometry, speciesFor } from '@/world/tree'
import type { FormInstance } from '@/world/forms'
import { makeRng, seedFrom } from '@/systems/rng'
import { basisAt, roadPoint, type RoadBasis, type TunnelChunk } from './geometry'
import { random } from './model'
import { HEARTH_RISE, NIGHTFALL, emptyRoad, roadAt, vergeWidth, type RoadAt, type Track } from './track'
import { landFor, nightfallVerge, placeAt, underground, type Land, type Place } from './nightfallLand'
import { Nightlife, NightlifeLive, type GardenCounts } from './Nightlife'

const RING = 2
const CHUNK = 50

/* ---- the palette: the garden's, at dusk ------------------------------------ */

/** The meadow's path: earth worn through the grass. */
const PATH = new Color('#6b5a46')
const PATH_WORN = new Color('#7c6a55')
/** The valley track: river gravel. */
const GRAVEL = new Color('#63645c')
const GRAVEL_WORN = new Color('#737468')
/** The cave's floor: the Rootway's stone, lit by fire. */
const STONE = new Color('#5f5850')
const STONE_WORN = new Color('#3f3833')
/** The plain: dark packed earth. */
const DARK = new Color('#454750')
const DARK_WORN = new Color('#55565e')
/** The lane: trodden, with the litter kicked off it. */
const LANE = new Color('#5c4f3f')
const LANE_WORN = new Color('#6d5f4d')
/** Verges by place. */
const VERGE_GRASS = new Color('#4b5838')
const VERGE_BANK = new Color('#585044')
const VERGE_CAVE = new Color('#4b3f33')
const VERGE_PLAIN = new Color('#3c3e46')
const VERGE_LITTER = new Color('#3d382b')
/** Rock: the cave, the mouths, the meadow's stones. */
const ROCK = new Color('#5a5249')
const ROCK_LOW = new Color('#4a433c')
const ROCK_HIGH = new Color('#66605a')
/** Lantern posts, iron; and their frames. */
const IRON = new Color('#2e2b28')

function hash3(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

const smooth01 = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

class CourseMesh {
  readonly position: number[] = []
  readonly color: number[] = []
  readonly surface: number[] = []
  readonly index: number[] = []
  readonly tread: number[] = []

  get count() {
    return this.position.length / 3
  }

  vertex(point: Vector3, color: Color, wet = 0, rough = 0.5) {
    this.position.push(point.x, point.y, point.z)
    this.color.push(color.r, color.g, color.b)
    this.surface.push(wet, rough)
  }

  quad(a: number, b: number, c: number, d: number) {
    this.index.push(a, b, c, a, c, d)
  }

  tri(a: number, b: number, c: number) {
    this.index.push(a, b, c)
  }

  /** A triangle wound to face a point — for stitching, where the winding is not obvious. Returns whether it was flipped. */
  triToward(a: number, b: number, c: number, toward: Vector3): boolean {
    const p = this.position
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2]
    const bx = p[b * 3] - ax, by = p[b * 3 + 1] - ay, bz = p[b * 3 + 2] - az
    const cx = p[c * 3] - ax, cy = p[c * 3 + 1] - ay, cz = p[c * 3 + 2] - az
    const nx = by * cz - bz * cy
    const ny = bz * cx - bx * cz
    const nz = bx * cy - by * cx
    const tx = toward.x - (ax + p[b * 3] + p[c * 3]) / 3
    const ty = toward.y - (ay + p[b * 3 + 1] + p[c * 3 + 1]) / 3
    const tz = toward.z - (az + p[b * 3 + 2] + p[c * 3 + 2]) / 3
    if (nx * tx + ny * ty + nz * tz >= 0) {
      this.index.push(a, b, c)
      return false
    }
    this.index.push(a, c, b)
    return true
  }

  /** A copy of a vertex, for a back face with its own normal. */
  copy(index: number) {
    const p = this.position
    const c = this.color
    const s = this.surface
    this.position.push(p[index * 3], p[index * 3 + 1], p[index * 3 + 2])
    this.color.push(c[index * 3], c[index * 3 + 1], c[index * 3 + 2])
    this.surface.push(s[index * 2], s[index * 2 + 1])
    return this.count - 1
  }

  quadToward(a: number, b: number, c: number, d: number, toward: Vector3) {
    this.triToward(a, b, c, toward)
    this.triToward(a, c, d, toward)
  }

  /** A quad a wheel may stand on. See `roadSurface`. */
  deck(a: number, b: number, c: number, d: number) {
    const at = this.index.length
    this.quad(a, b, c, d)
    this.standOn(at)
  }

  standOn(from: number) {
    const to = this.index.length
    if (to <= from) return
    if (this.tread.length && this.tread[this.tread.length - 1] === from) this.tread[this.tread.length - 1] = to
    else this.tread.push(from, to)
  }

  build() {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3))
    geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(this.color), 3))
    geometry.setAttribute('aSurface', new BufferAttribute(new Float32Array(this.surface), 2))
    geometry.setIndex(this.index)
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    return geometry
  }
}

const point = new Vector3()
const roomToward = new Vector3()
const tint = new Color()

/* ---- the garden's own shapes, baked into the road's mesh ------------------ */

/**
 * Lay a set of the garden's form instances into a course mesh.
 *
 * The garden draws these instanced through its own form shader; here they are
 * baked, with the same transform in the same order — scale, lean about X then
 * Z, spin about Y, offset — so a tree grown by `growTree` is the same tree
 * here that it is there. Thin things are laid twice, back to back, because the
 * road's material draws front faces only.
 */
function bakeForms(mesh: CourseMesh, base: BufferGeometry, items: FormInstance[], rough: number, thin: boolean, shade = 1) {
  const positions = base.getAttribute('position')
  const index = base.getIndex()
  const count = positions.count
  const local = new Vector3()
  for (const item of items) {
    tint.set(item.color).multiplyScalar(shade)
    const [lx, lz] = item.lean ?? [0, 0]
    const cx = Math.cos(lx)
    const sx = Math.sin(lx)
    const cz = Math.cos(lz)
    const sz = Math.sin(lz)
    const cy = Math.cos(item.rot)
    const sy = Math.sin(item.rot)
    const first = mesh.count
    for (let v = 0; v < count; v++) {
      local.set(positions.getX(v) * item.scale[0], positions.getY(v) * item.scale[1], positions.getZ(v) * item.scale[2])
      // rotX
      let y = local.y * cx - local.z * sx
      let z = local.y * sx + local.z * cx
      let x = local.x
      // rotZ
      const x2 = x * cz - y * sz
      y = x * sz + y * cz
      x = x2
      // rotY
      const x3 = x * cy - z * sy
      z = x * sy + z * cy
      x = x3
      point.set(x + item.offset[0], y + item.offset[1], z + item.offset[2])
      mesh.vertex(point, tint, 0, rough)
    }
    const faces = index ? index.count : count
    for (let f = 0; f + 2 < faces; f += 3) {
      const a = first + (index ? index.getX(f) : f)
      const b = first + (index ? index.getX(f + 1) : f + 1)
      const c = first + (index ? index.getX(f + 2) : f + 2)
      mesh.tri(a, b, c)
    }
    if (thin) {
      // The same faces the other way round, on their own vertices, so each side has its own normal.
      const back = mesh.count
      for (let v = 0; v < count; v++) {
        const at = (first + v) * 3
        point.set(mesh.position[at], mesh.position[at + 1], mesh.position[at + 2])
        mesh.vertex(point, tint, 0, rough)
      }
      for (let f = 0; f + 2 < faces; f += 3) {
        const a = back + (index ? index.getX(f) : f)
        const b = back + (index ? index.getX(f + 1) : f + 1)
        const c = back + (index ? index.getX(f + 2) : f + 2)
        mesh.tri(a, c, b)
      }
    }
  }
}

/** The wood's limb, the same five-sided open tube the garden's woods are made of. */
let limbBase: BufferGeometry | null = null
let leafBase: BufferGeometry | null = null
function limb() {
  if (!limbBase) {
    limbBase = new CylinderGeometry(0.7, 1, 1, 5, 1, true)
    limbBase.translate(0, 0.5, 0)
  }
  return limbBase
}
function leaf() {
  leafBase ??= leafGeometry()
  return leafBase
}

/**
 * The great tree, and where it stands.
 *
 * At the centre of the Tree Turn: the turn is two hundred degrees at
 * twenty-two metres with the tree on the inside, so the trunk is twenty-two
 * metres in from the road's middle at the turn's apex, and the crown — seven
 * metres up and thirty across — hangs over the inside of the corner. Grown
 * exactly as the Tree of Thoughts is, from a seed of its own, so it is the same
 * species and the same weight and not the same tree.
 */
export function greatTreeAt(track: Track, land: Land) {
  const mid = (NIGHTFALL.treeTurn.from + NIGHTFALL.treeTurn.to) / 2
  const road = roadAt(track, mid)
  // The turn is to the left, so its inside is the negative side.
  roadPoint(road, -22, 0, point, basisAt(road))
  const foot: [number, number, number] = [point.x, land.heightAt(point.x, point.z) - 0.2, point.z]
  return {
    foot,
    parts: growTree({
      at: foot,
      height: 16,
      species: 'broad',
      rng: makeRng(seedFrom('nightfall:the-tree')),
      girth: 1.6,
      density: 2.6,
      leafDetail: 0.55,
      woodDetail: 0.75,
    }),
  }
}

/** A lump of the meadow's stone, sitting in the ground. */
function stone(mesh: CourseMesh, x: number, y: number, z: number, size: number, seed: number) {
  const RINGS = 3
  const SIDES = 7
  const base = mesh.count
  for (let i = 0; i <= RINGS; i++) {
    const phi = (-0.3 + (i / RINGS) * 1.3) * (Math.PI / 2)
    const r = Math.cos(phi)
    tint.copy(ROCK_LOW).lerp(ROCK_HIGH, i / RINGS).multiplyScalar(0.85 + hash3(seed, i, 1) * 0.3)
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2 + seed
      const lumpy = 0.8 + hash3(seed, i, k) * 0.4
      point.set(x + Math.cos(a) * size * r * lumpy, y + Math.sin(phi) * size * 0.7 - size * 0.2, z + Math.sin(a) * size * 0.85 * r * lumpy)
      mesh.vertex(point, tint, 0, 0.8)
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

/**
 * A lantern post of the walk: an iron pole with a square head, four panes of
 * glass in it (drawn by `Nightlife`, coloured by a memory), and a little roof.
 */
function lanternPost(mesh: CourseMesh, x: number, y: number, z: number, top: number, seed: number) {
  const lean = (hash3(seed, 1, 1) - 0.5) * 0.06
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, colour: Color, rough: number) => {
    const base = mesh.count
    for (const dz of [-hz, hz]) for (const dy of [0, hy]) for (const dx of [-hx, hx]) {
      point.set(cx + dx + lean * dy, cy + dy, cz + dz)
      mesh.vertex(point, colour, 0, rough)
    }
    mesh.quad(base, base + 2, base + 3, base + 1)
    mesh.quad(base + 4, base + 5, base + 7, base + 6)
    mesh.quad(base, base + 1, base + 5, base + 4)
    mesh.quad(base + 2, base + 6, base + 7, base + 3)
    mesh.quad(base + 1, base + 3, base + 7, base + 5)
    mesh.quad(base, base + 4, base + 6, base + 2)
  }
  box(x, y - 0.1, z, 0.045, top - 0.4, 0.045, IRON, 0.7)
  // The head: an open frame the glass sits in, and a roof over it.
  box(x + lean * (top - 0.4), y + top - 0.42, z, 0.16, 0.05, 0.16, IRON, 0.7)
  box(x + lean * (top - 0.4), y + top + 0.02, z, 0.19, 0.06, 0.19, IRON, 0.7)
  for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [0.15, 0.15], [-0.15, 0.15]] as const) {
    box(x + dx + lean * (top - 0.4), y + top - 0.37, z + dz, 0.014, 0.4, 0.014, IRON, 0.7)
  }
}

/* ---- the cross-sections ------------------------------------------------------ */

/** Thirteen across, outside in: skirt, edge, verge, then the road's own seven, and back. */
const DRAWN = 13
const ROAD_ACROSS = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1]
const ROAD_CROWN = [0.02, 0.05, 0.07, 0.08, 0.07, 0.05, 0.02]

/**
 * The cave's cross-section: the same floor, then walls that flare and a vault
 * over the top — the Rootway's shape, without its knead, so a passage here is
 * smoother and reads as the Hollow's rock rather than the Rootway's.
 */
const VAULT = 20
function vaultProfile(road: ReturnType<typeof emptyRoad>, ring: number, offsets: Float32Array, heights: Float32Array, calm = false) {
  const w = road.width
  const wall = w + vergeWidth(road.room)
  const ceil = road.ceiling
  const flare = 0.5 + road.room * 1.7
  // The floor: verge, the road's seven, verge.
  offsets[0] = -wall
  heights[0] = 0.14 + road.room * 0.1
  for (let k = 0; k < 7; k++) {
    offsets[1 + k] = ROAD_ACROSS[k] * w
    heights[1 + k] = ROAD_CROWN[k]
  }
  offsets[8] = wall
  heights[8] = 0.14 + road.room * 0.1
  // The right wall and half the vault, then the left, back down to the floor.
  const shape: [number, number][] = [
    [wall + flare * 0.4, ceil * 0.22], [wall + flare * 0.62, ceil * 0.5], [wall + flare * 0.36, ceil * 0.78],
    [wall * 0.62, ceil * 0.95], [0, ceil], [-wall * 0.62, ceil * 0.95],
    [-(wall + flare * 0.36), ceil * 0.78], [-(wall + flare * 0.62), ceil * 0.5], [-(wall + flare * 0.4), ceil * 0.22],
  ]
  shape.forEach(([n, y], i) => {
    const k = 9 + i
    // A little tooth in the rock, per ring, and a slow bulge every few — or
    // neither, for the smooth outer skin of a tube seen from the room.
    const slow = calm ? 0 : (hash3(Math.floor(ring / 6), k, 3) - 0.5) * (0.5 + road.room)
    const fine = calm ? 0 : (hash3(ring, k, 5) - 0.5) * 0.35
    const len = Math.hypot(n, y - ceil * 0.45) || 1
    offsets[k] = n + (n / len) * (slow + fine)
    heights[k] = y + ((y - ceil * 0.45) / len) * (slow + fine)
  })
  // Never inside the wall the physics stops at.
  for (let k = 9; k < VAULT; k++) {
    if (heights[k] < 1.6 && Math.abs(offsets[k]) < wall + 0.3) offsets[k] = Math.sign(offsets[k]) * (wall + 0.3)
  }
  // Closing on the verge again.
  offsets[18] = -(wall + flare * 0.4)
  heights[18] = ceil * 0.22
  offsets[19] = -wall - 0.25
  heights[19] = 0.6
}

/** Where the room is: the ring and its two ante-rooms. */
export function inRoom(s: number): boolean {
  return s > NIGHTFALL.ring.from - 30 && s < NIGHTFALL.ring.to + 30
}

/*
  =============================================================================
  THE ROOM, as a shape.

  The ring is banked twelve degrees toward the fire — the drawing rule for a
  corner that tight — so a flat floor would slice through it. The floor is a
  bowl instead: worn down to the hearth inside the ring, tangent to the road's
  bank at both edges, rising to the dome's foot outside it. Near the road it is
  the road: each point of the floor takes the height of the road beside it,
  faded out five metres past the verge, so the ribbon and the floor never
  disagree.

  The road crosses itself in here. The way in and the way out meet at grade
  twenty metres short of the ring on either side — a crossing, as a rallycross
  track has one — and two ribbons at different heights and banks would show
  as a step. So the road *as drawn* in the room is levelled through the
  crossing: both branches eased to one height and no bank, level for four
  metres either side of it and eased back to the model over the next twenty. The physics keeps the model's own numbers; the wheels
  stand on what is drawn, and the difference is a few centimetres.
  =============================================================================
*/
export interface Room {
  /** The centre of the room, and the height of the ring's road. */
  x: number
  y: number
  z: number
  radius: number
  height: number
  /** The dome's foot, a little outside `radius`. */
  rim: number
  /** The fire, on the floor of the bowl. */
  hearth: { x: number; y: number; z: number }
  /** The height of the floor anywhere under the dome. */
  floorAt(x: number, z: number): number
  /** The road as drawn here: `roadAt`, levelled through the crossing. */
  roadAt(s: number, out: RoadAt): RoadAt
  /** Where the two branches meet, in metres of each. */
  crossing: { a: number; b: number; y: number }
}

export function roomAt(track: Track): Room {
  const mid = (NIGHTFALL.ring.from + NIGHTFALL.ring.to) / 2
  const midRoad = roadAt(track, mid)
  const midBasis = basisAt(midRoad, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
  roadPoint(midRoad, 15, 0, point, midBasis)
  const x = point.x
  const z = point.z
  const y = midRoad.y
  const radius = 36
  const rim = radius * 1.08
  roadPoint(midRoad, 15, HEARTH_RISE, point, midBasis)
  const hearth = { x, y: point.y, z }

  // The crossing: the closest the way in comes to the way out.
  const crossing = { a: 0, b: 0, y: 0, d: 1e9 }
  {
    const A = emptyRoad()
    const B = emptyRoad()
    for (let a = NIGHTFALL.ring.from - 40; a < NIGHTFALL.ring.from - 4; a += 1) {
      roadAt(track, a, A)
      for (let b = NIGHTFALL.ring.to + 4; b < NIGHTFALL.ring.to + 40; b += 1) {
        roadAt(track, b, B)
        const d = Math.hypot(A.x - B.x, A.z - B.z)
        if (d < crossing.d) Object.assign(crossing, { a, b, d, y: (A.y + B.y) / 2 })
      }
    }
  }
  const drawnRoad = (s: number, out: RoadAt) => {
    roadAt(track, s, out)
    const near = Math.min(Math.abs(s - crossing.a), Math.abs(s - crossing.b))
    // Eased back to the model over twenty-odd metres: any quicker and the
    // bank comes on so fast past the crossing that the car visibly tips.
    if (near < 26) {
      const t = 1 - smooth01(4, 26, near)
      out.y += (crossing.y - out.y) * t
      out.bank *= 1 - t
    }
    return out
  }

  /*
    The bowl. The ring's road is a circle of about fifteen metres round the
    hearth, banked `slope` toward it; the bowl is the quadratic through the
    hearth that meets the bank at the inside verge. Outside the ring the
    floor leaves the outer verge at the bank's slope, lips over, and comes
    back down to the level of the ways in and out, which run a little over
    the ring's own height.
  */
  const slope = Math.sin(Math.abs(midRoad.bank))
  const half = midRoad.width + vergeWidth(midRoad.room)
  const R = 15
  const innerEdge = R - half
  const outerEdge = R + half
  const yInner = y - slope * half
  const yOuter = y + slope * half
  const LIP = 10
  const level = y + 0.1
  const bowl = (r: number) => {
    if (r <= innerEdge) {
      const v = r / innerEdge
      return hearth.y + (yInner - hearth.y) * v * v
    }
    if (r >= outerEdge) {
      const v = Math.min(1, (r - outerEdge) / LIP)
      // A Hermite curve: out of the verge at the bank's slope, flat by `LIP` metres.
      const h00 = 2 * v * v * v - 3 * v * v + 1
      const h10 = v * v * v - 2 * v * v + v
      const h01 = -2 * v * v * v + 3 * v * v
      return h00 * yOuter + h10 * slope * LIP + h01 * level
    }
    return y + slope * (r - R)
  }

  // The road beside a point: samples a metre apart through the whole room,
  // each with its flat right-hand normal and the drawn surface across it.
  const samples: { s: number; x: number; z: number; y: number; fx: number; fz: number; rx: number; rz: number; sb: number; width: number; wall: number; grade: (n: number) => number }[] = []
  {
    for (let s = NIGHTFALL.ring.from - 42; s <= NIGHTFALL.ring.to + 42; s += 1) {
      // Its own road object: the verge's grade reads it later.
      const road = drawnRoad(s, emptyRoad())
      const sh = Math.sin(road.heading)
      const ch = Math.cos(road.heading)
      const verge = nightfallVerge(road, s)
      samples.push({ s, x: road.x, z: road.z, y: road.y, fx: sh, fz: ch, rx: -ch, rz: sh, sb: Math.sin(road.bank), width: road.width, wall: verge.wall, grade: verge.grade })
    }
  }
  const crown = (n: number, width: number) => 0.08 - 0.06 * Math.min(1, (n / width) * (n / width))
  const floorAt = (px: number, pz: number) => {
    const r = Math.hypot(px - x, pz - z)
    let sum = 0
    let weight = 0
    let most = 0
    // The nearest sample of each branch: two at the crossing, one elsewhere.
    let lastS = -1e9
    let lastN = 1e9
    let lastH = 0
    const take = () => {
      if (lastS < -1e8) return
      const w = 1 - smooth01(lastWall + 0.5, lastWall + 5, Math.abs(lastN))
      sum += lastH * w
      weight += w
      most = Math.max(most, w)
    }
    let lastWall = 0
    for (const sample of samples) {
      const dx = px - sample.x
      const dz = pz - sample.z
      const along = dx * sample.fx + dz * sample.fz
      if (Math.abs(along) > 0.55) continue
      const n = dx * sample.rx + dz * sample.rz
      if (sample.s - lastS > 30) {
        take()
        lastS = sample.s
        lastN = 1e9
      }
      if (Math.abs(n) < Math.abs(lastN)) {
        lastS = sample.s
        lastN = n
        lastWall = sample.wall
        lastH = sample.y + sample.sb * n + (Math.abs(n) <= sample.width ? crown(n, sample.width) : sample.grade(n))
      }
    }
    take()
    const b = bowl(r)
    // Under the ribbon, a little under it; beside it, the bowl.
    return (sum + b * (1 - most)) / (weight + (1 - most)) - 0.05 * most
  }

  return { x, y, z, radius, height: 20, rim, hearth, floorAt, roadAt: drawnRoad, crossing: { a: crossing.a, b: crossing.b, y: crossing.y } }
}

/**
 * The colours of the road, by place, blended over forty metres at each seam.
 * Everything drawn here reads the place off the road's own metres, so a seam
 * is where the briefing says it is and nowhere else.
 */
const SEAMS: { at: number; before: Place; after: Place }[] = [
  { at: NIGHTFALL.meadow.to, before: 'meadow', after: 'wellspring' },
  { at: NIGHTFALL.wellspring.to, before: 'wellspring', after: 'hollow' },
  { at: NIGHTFALL.hollow.to, before: 'hollow', after: 'stars' },
  { at: NIGHTFALL.stars.to, before: 'stars', after: 'walk' },
]
const ROAD_OF: Record<Place, [Color, Color, Color]> = {
  meadow: [PATH, PATH_WORN, VERGE_GRASS],
  wellspring: [GRAVEL, GRAVEL_WORN, VERGE_BANK],
  hollow: [STONE, STONE_WORN, VERGE_CAVE],
  stars: [DARK, DARK_WORN, VERGE_PLAIN],
  walk: [LANE, LANE_WORN, VERGE_LITTER],
}
function roadColours(s: number): [Color, Color, Color] {
  const place = placeAt(s)
  const own = ROAD_OF[place]
  for (const seam of SEAMS) {
    if (Math.abs(s - seam.at) > 20) continue
    const t = smooth01(seam.at - 20, seam.at + 20, s)
    const a = ROAD_OF[seam.before]
    const b = ROAD_OF[seam.after]
    return [
      new Color().copy(a[0]).lerp(b[0], t),
      new Color().copy(a[1]).lerp(b[1], t),
      new Color().copy(a[2]).lerp(b[2], t),
    ]
  }
  return own
}

export function buildNightfall(track: Track): TunnelChunk[] {
  const rings = Math.floor(track.length / RING) + 1
  const chunkCount = Math.ceil(track.length / CHUNK)
  const meshes = Array.from({ length: chunkCount }, () => new CourseMesh())
  const spans: { from: number; to: number }[] = []
  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }
  const land = landFor(track)
  const room = roomAt(track)
  const offsets = new Float32Array(VAULT)
  const heights = new Float32Array(VAULT)
  const calmOffsets = new Float32Array(VAULT)
  const calmHeights = new Float32Array(VAULT)

  /*
    The portals: where each passage comes through the dome's foot. The vault
    is drawn single-sided, facing the road, so where it stands inside the room
    it gets a second skin facing out, and the dome is opened round it — see
    the room, below, which stitches the two together.
  */
  const portals = [NIGHTFALL.ring.from - 60, NIGHTFALL.ring.to + 60].map((from, i) => {
    let s = from
    const step = i === 0 ? 1 : -1
    while (Math.hypot(roadAt(track, s).x - room.x, roadAt(track, s).z - room.z) > room.rim) s += step
    return { s, side: i, loop: [] as Vector3[], profile: [] as Vector3[] }
  })
  const SKIN = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0]
  const skinnedAt = (s: number) => portals.some((p) => (p.side === 0 ? s >= p.s - 8 : s <= p.s + 8) && Math.abs(s - p.s) < 40)

  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const mesh = meshes[chunk]
    const first = Math.floor((chunk * CHUNK) / RING)
    const last = Math.min(rings - 1, Math.floor(((chunk + 1) * CHUNK) / RING))
    spans.push({ from: first * RING, to: last * RING })

    let previousKind = ''
    let previousSkin = -1
    // The previous ring's first vertex — not `base - VAULT`, because a ring
    // with an outer skin lays more than its profile.
    let previousBase = -1
    for (let ring = first; ring <= last; ring++) {
      const s = ring * RING
      room.roadAt(s, road)
      basisAt(road, basis)
      // Passages are vaulted; the mouths and the room are open sections (the room has its own roof).
      const vaulted = underground(s) && !inRoom(s) && s > NIGHTFALL.hollow.from + 14 && s < NIGHTFALL.hollow.to - 14
      const kind = vaulted ? 'vault' : 'open'
      const [roadColour, worn, vergeColour] = roadColours(s)
      const base = mesh.count

      if (vaulted) {
        vaultProfile(road, ring, offsets, heights)
        for (let k = 0; k < VAULT; k++) {
          roadPoint(road, offsets[k], heights[k], point, basis)
          const floor = k >= 1 && k <= 7
          const verge = k === 0 || k === 8 || k === 19
          let colour: Color
          let rough = 0.85
          let wet = road.wet * 0.5
          if (floor) {
            const away = Math.abs(offsets[k] - road.line)
            const wornBy = 1 - Math.min(1, Math.max(0, (away - 0.4) / 1.1))
            tint.copy(roadColour).lerp(worn, wornBy * 0.5).multiplyScalar(0.93 + hash3(ring, k, 2) * 0.12)
            colour = tint
            rough = 0.3
            wet = road.wet
          } else if (verge) {
            tint.copy(vergeColour).multiplyScalar(0.85 + hash3(ring, k, 4) * 0.2)
            colour = tint
          } else {
            const up = Math.min(1, heights[k] / Math.max(1, road.ceiling))
            tint.copy(ROCK_LOW).lerp(ROCK, Math.min(1, up * 1.6)).lerp(ROCK_HIGH, Math.max(0, up - 0.6) * 1.4)
            tint.multiplyScalar(0.84 + hash3(ring, k, 7) * 0.3)
            colour = tint
            rough = 0.75
          }
          mesh.vertex(point, colour, wet, rough)
        }
        if (ring > first && previousKind === 'vault') {
          const previous = previousBase
          for (let k = 0; k < VAULT; k++) {
            const k2 = (k + 1) % VAULT
            if (k <= 8 || k === 19) mesh.deck(previous + k, previous + k2, base + k2, base + k)
            else mesh.quad(previous + k, previous + k2, base + k2, base + k)
          }
        }
        // The outer skin, where the passage stands inside the room.
        let skin = -1
        if (skinnedAt(s)) {
          skin = mesh.count
          const portal = portals.find((p) => Math.abs(s - p.s) < 40)!
          // The one ring nearest the dome's foot lends its skin to the portal's collar.
          const atPortal = Math.abs(s - portal.s) <= RING / 2 && !portal.loop.length
          // Smooth, a little outside the wall, and its foot well under the
          // floor, which falls away from the road beside the portal.
          vaultProfile(road, ring, calmOffsets, calmHeights, true)
          for (const k of SKIN) {
            const low = calmHeights[k] < 1
            const n = calmOffsets[k] * 1.08 + Math.sign(calmOffsets[k]) * 0.45
            roadPoint(road, n, low ? -0.7 : calmHeights[k] + 0.5, point, basis)
            tint.copy(ROCK_LOW).lerp(ROCK, 0.5).multiplyScalar(0.8 + hash3(ring, k, 8) * 0.3)
            mesh.vertex(point, tint, 0, 0.8)
            if (atPortal) portal.loop.push(point.clone())
          }
          if (atPortal) {
            // The road's own floor closes the loop underneath.
            for (let k = 1; k <= 7; k++) portal.profile.push(new Vector3(mesh.position[(base + k) * 3], mesh.position[(base + k) * 3 + 1], mesh.position[(base + k) * 3 + 2]))
          }
          if (previousSkin >= 0) {
            for (let k = 0; k < SKIN.length - 1; k++) mesh.quad(previousSkin + k, skin + k, skin + k + 1, previousSkin + k + 1)
          }
          // The end of the tube, on the room's side, is closed between the skins.
          const roomEnd = portal.side === 0 ? !skinnedAt(s + RING) || !underground(s + RING) || inRoom(s + RING) : previousKind !== 'vault'
          if (roomEnd) {
            roadPoint(road, 0, 3, roomToward, basis)
            roomToward.addScaledVector(new Vector3(basis.fx, 0, basis.fz), portal.side === 0 ? 12 : -12)
            for (let k = 0; k < SKIN.length - 1; k++) {
              mesh.quadToward(base + SKIN[k], base + SKIN[k + 1], skin + k + 1, skin + k, roomToward)
            }
          }
        }
        previousSkin = skin
      } else {
        previousSkin = -1
        const verge = nightfallVerge(road, s)
        const across: number[] = []
        const up: number[] = []
        // Skirt, edge, verge on the left...
        across.push(-verge.edge, -verge.edge, -verge.wall)
        for (let k = 0; k < 7; k++) across.push(ROAD_ACROSS[k] * road.width)
        across.push(verge.wall, verge.edge, verge.edge)
        for (let k = 0; k < DRAWN; k++) {
          const n = across[k]
          const skirt = k === 0 || k === DRAWN - 1
          up.push(skirt ? 0 : k >= 3 && k <= 9 ? ROAD_CROWN[k - 3] : verge.grade(n))
        }
        for (let k = 0; k < DRAWN; k++) {
          roadPoint(road, across[k], up[k], point, basis)
          const skirt = k === 0 || k === DRAWN - 1
          const surface = k >= 3 && k <= 9
          if (skirt) {
            // Down to the ground — or in the room, to its floor.
            const ground = inRoom(s) ? room.floorAt(point.x, point.z) - 0.1 : Math.min(point.y - 0.3, land.heightAt(point.x, point.z) - 0.25)
            point.y = Math.max(point.y - 6, Math.min(point.y - 0.15, ground))
          }
          let colour: Color
          let rough = 0.9
          let wet = 0
          if (surface) {
            const away = Math.abs(across[k] - road.line)
            const wornBy = 1 - Math.min(1, Math.max(0, (away - 0.35) / 1.2))
            tint.copy(roadColour).lerp(worn, wornBy * 0.5).multiplyScalar(0.93 + hash3(ring, k, 2) * 0.12)
            colour = tint
            rough = 0.28
            wet = road.wet
          } else {
            tint.copy(vergeColour).multiplyScalar(0.86 + hash3(ring, k, 4) * 0.22)
            if (skirt && inRoom(s)) tint.copy(STONE).lerp(STONE_WORN, 0.4)
            else if (skirt) land.colourAt(point.x, point.z, tint).multiplyScalar(0.9)
            colour = tint
            wet = road.wet * 0.4
          }
          mesh.vertex(point, colour, wet, rough)
        }
        if (ring > first && previousKind === 'open') {
          const previous = previousBase
          for (let k = 0; k < DRAWN - 1; k++) {
            if (k === 0 || k === DRAWN - 2) mesh.quad(previous + k, previous + k + 1, base + k + 1, base + k)
            else mesh.deck(previous + k, previous + k + 1, base + k + 1, base + k)
          }
        }
      }
      /*
        Where an open ring meets a vaulted one — at each mouth, and at both
        ends of the room — the floors are joined across the change, verge to
        verge: the open section's nine middle vertices (verge, the road's
        seven, verge) against the vault's first nine. Without this the road
        has a two-metre hole at every transition, which the tyre-contact
        check found before anyone saw it.
      */
      if (ring > first && previousKind && previousKind !== kind) {
        const openFirst = kind === 'open' ? base + 2 : previousBase + 2
        const vaultFirst = kind === 'vault' ? base : previousBase
        const openIsNew = kind === 'open'
        for (let k = 0; k < 8; k++) {
          const o0 = openFirst + k
          const o1 = openFirst + k + 1
          const v0 = vaultFirst + k
          const v1 = vaultFirst + k + 1
          if (openIsNew) mesh.deck(v0, v1, o1, o0)
          else mesh.deck(o0, o1, v1, v0)
        }
      }
      previousKind = kind
      previousBase = base
    }
  }

  const chunkFor = (s: number) => Math.max(0, Math.min(chunkCount - 1, Math.floor(s / CHUNK)))
  const rng = random(track.seed ^ 0x51ab7)

  /*
    ===========================================================================
    THE ROOM — the Hollow's, with the road through it.

    A dome over a bowl, the hearth at the bottom of it. The dome is the
    Hollow's rock closing overhead; the floor is swept stone worn down to the
    fire, the road banked round it and crossing itself on the way out (see
    `roomAt` for the shape), and the wheels may stand on any of it. The two
    passages come through the dome's foot as tubes of rock, and the dome is
    opened round each and stitched to it.
    ===========================================================================
  */
  {
    const mid = (NIGHTFALL.ring.from + NIGHTFALL.ring.to) / 2
    const mesh = meshes[chunkFor(mid)]
    const SEG = 36
    const ROWS = 9
    const FLOOR_RINGS = 36
    const FLOOR_SEG = 72
    const centreY = room.hearth.y

    // The floor: a polar grid out past the dome's foot (which wanders a little
    // outside the rim, and so do the portals' feet), each point at the bowl's
    // height — or the road's, where the road runs.
    const floorBase = mesh.count
    point.set(room.x, centreY, room.z)
    tint.copy(STONE_WORN).multiplyScalar(0.7)
    mesh.vertex(point, tint, 0.05, 0.5)
    for (let i = 1; i <= FLOOR_RINGS; i++) {
      const r = (i / FLOOR_RINGS) * room.rim * 1.08
      for (let k = 0; k < FLOOR_SEG; k++) {
        const a = (k / FLOOR_SEG) * Math.PI * 2
        const x = room.x + Math.cos(a) * r
        const z = room.z + Math.sin(a) * r
        // Sooted round the hearth, worn pale where the ring runs, stone elsewhere.
        const soot = 1 - smooth01(2.5, 9, r)
        tint.copy(STONE).lerp(STONE_WORN, 0.35 + soot * 0.5).multiplyScalar(0.86 + hash3(i, k, 1) * 0.2)
        point.set(x, room.floorAt(x, z), z)
        mesh.vertex(point, tint, 0.05, 0.5)
      }
    }
    const laid = mesh.index.length
    for (let k = 0; k < FLOOR_SEG; k++) mesh.tri(floorBase, floorBase + 1 + ((k + 1) % FLOOR_SEG), floorBase + 1 + k)
    for (let i = 1; i < FLOOR_RINGS; i++) {
      const inner = floorBase + 1 + (i - 1) * FLOOR_SEG
      const outer = inner + FLOOR_SEG
      for (let k = 0; k < FLOOR_SEG; k++) {
        const k2 = (k + 1) % FLOOR_SEG
        mesh.quad(inner + k, inner + k2, outer + k2, outer + k)
      }
    }
    mesh.standOn(laid)

    // The dome: rows from the foot to the crown, faces turned inward. The
    // foot sits under the floor's edge; the rest stands on the bowl's rim height.
    const rimY = room.floorAt(room.x + room.rim, room.z)
    const base = mesh.count
    for (let r = 0; r <= ROWS; r++) {
      const t = r / ROWS
      const phi = t * (Math.PI / 2)
      const radius = room.rim * Math.cos(phi)
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2
        const bump = 1 + (hash3(r, k, 9) - 0.5) * 0.1 * (1 - t)
        const x = room.x + Math.cos(a) * radius * bump
        const z = room.z + Math.sin(a) * radius * bump
        const y = r === 0 ? room.floorAt(x, z) - 0.6 : rimY + 0.3 + Math.sin(phi) * room.height
        tint.copy(ROCK_LOW).lerp(ROCK, t * 1.2).lerp(ROCK_HIGH, Math.max(0, t - 0.6)).multiplyScalar(0.82 + hash3(r, k, 3) * 0.3)
        point.set(x, y, z)
        mesh.vertex(point, tint, 0.15, 0.8)
      }
    }
    // Which of the dome's segments each portal opens, in the lowest three rows
    // — up to ten metres, over any passage's roof, and no deeper into the room
    // than it must be, since the collar is a funnel from there to the tube.
    const HOLE_ROWS = 3
    const holes = portals.map((portal) => {
      // Its own road object: `roadAt` hands back a shared one otherwise, and both portals would read the last.
      const at = roadAt(track, portal.s, emptyRoad())
      const bearing = Math.atan2(at.z - room.z, at.x - room.x)
      const half = Math.atan2(at.width + vergeWidth(at.room) + 3.2, room.rim)
      const open: number[] = []
      for (let k = 0; k < SEG; k++) {
        const a = ((k + 0.5) / SEG) * Math.PI * 2
        let d = Math.abs(a - bearing) % (Math.PI * 2)
        if (d > Math.PI) d = Math.PI * 2 - d
        if (d <= half) open.push(k)
      }
      return { portal, open, at }
    })
    const opened = (r: number, k: number) => r < HOLE_ROWS && holes.some((h) => h.open.includes(k))
    for (let r = 0; r < ROWS; r++) {
      for (let k = 0; k < SEG; k++) {
        if (opened(r, k)) continue
        const a = base + r * SEG + k
        const next = base + r * SEG + ((k + 1) % SEG)
        mesh.quad(a, next, next + SEG, a + SEG)
      }
    }

    /*
      The portals. Round each hole, the dome's own boundary vertices are
      stitched to the tube's outer skin where it comes through the foot —
      two loops, both sorted by their angle about the passage, zipped
      together, every triangle wound to face the room.
    */
    const toward = new Vector3()
    for (const { portal, open, at } of holes) {
      if (!portal.loop.length || !open.length) continue
      // The hole's boundary, as dome vertex indices: along the foot, up one
      // side, back along the top, down the other.
      const sorted = [...open].sort((p, q) => p - q)
      // Contiguous mod SEG: rotate so the run starts after any wrap.
      let start = 0
      for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) start = i
      const run = [...sorted.slice(start), ...sorted.slice(0, start)]
      const kA = run[0]
      const kB = (run[run.length - 1] + 1) % SEG
      const outer: number[] = []
      for (const k of run) outer.push(base + k)
      for (let r = 0; r <= HOLE_ROWS; r++) outer.push(base + r * SEG + kB)
      for (let i = run.length - 1; i >= 0; i--) outer.push(base + HOLE_ROWS * SEG + run[i])
      for (let r = HOLE_ROWS - 1; r >= 1; r--) outer.push(base + r * SEG + kA)
      // Angles about the passage, in the road's own frame.
      const sh = Math.sin(at.heading)
      const ch = Math.cos(at.heading)
      const cy = at.y + at.ceiling * 0.45
      const into = portal.side === 0 ? 1 : -1
      // The collar is a funnel opening into the room; its inside faces a point
      // on the passage's axis well inside the room, so no triangle is marginal.
      toward.set(at.x + sh * 12 * into, cy, at.z + ch * 12 * into)
      // The tube's loop, copied in here: skin from one verge over to the other,
      // closed by the road's floor. And a lip between it and the dome — the
      // same loop flared out and a little into the room — so the funnel is a
      // rounded rock mouth rather than flat blades from the hole to the tube.
      const inner: number[] = []
      const lip: number[] = []
      for (const p of [...portal.loop, ...portal.profile]) {
        inner.push(mesh.count)
        tint.copy(ROCK_LOW).lerp(ROCK, 0.5).multiplyScalar(0.85)
        mesh.vertex(p, tint, 0, 0.8)
        lip.push(mesh.count)
        const dx = p.x - at.x
        const dy = p.y - cy
        const dz = p.z - at.z
        const across = -dx * ch + dz * sh
        // Only the part above the floor flares; the floor's own points stay put.
        const flare = dy > -at.ceiling * 0.4 ? 1.45 : 1
        point.set(at.x - ch * across * flare + sh * 2.2 * into, cy + dy * flare, at.z + sh * across * flare + ch * 2.2 * into)
        tint.copy(ROCK_LOW).lerp(ROCK, 0.4).multiplyScalar(0.8 + hash3(p.x, p.y, 4) * 0.2)
        mesh.vertex(point, tint, 0, 0.85)
      }
      const angle = (index: number) => {
        const px = mesh.position[index * 3] - at.x
        const py = mesh.position[index * 3 + 1] - cy
        const pz = mesh.position[index * 3 + 2] - at.z
        return Math.atan2(py, -px * ch + pz * sh)
      }
      const byAngle = (loop: number[]) => loop.map((index) => ({ index, a: angle(index) })).sort((p, q) => p.a - q.a)
      const O = byAngle(outer)
      const L = byAngle(lip)
      const I = byAngle(inner)
      const nextAngle = (loop: { a: number }[], i: number) => (i + 1 < loop.length ? loop[i + 1].a : loop[0].a + Math.PI * 2)
      // Both faces: a funnel is seen from inside the room and, at its lip,
      // from the passage, and no one reference point settles every triangle.
      // The back copy has vertices of its own so its normals are its own.
      const copies = new Map<number, number>()
      const twin = (index: number) => {
        let c = copies.get(index)
        if (c === undefined) {
          c = mesh.copy(index)
          copies.set(index, c)
        }
        return c
      }
      const bothWays = (a: number, b: number, c: number) => {
        const flipped = mesh.triToward(a, b, c, toward)
        if (flipped) mesh.tri(twin(a), twin(b), twin(c))
        else mesh.tri(twin(a), twin(c), twin(b))
      }
      const zip = (A: { index: number; a: number }[], B: { index: number; a: number }[]) => {
        let i = 0
        let j = 0
        while (i < A.length || j < B.length) {
          const a = A[i % A.length].index
          const b = B[j % B.length].index
          if (i < A.length && (j >= B.length || nextAngle(A, i) <= nextAngle(B, j))) {
            bothWays(a, A[(i + 1) % A.length].index, b)
            i++
          } else {
            bothWays(b, B[(j + 1) % B.length].index, a)
            j++
          }
        }
      }
      zip(O, L)
      zip(L, I)
    }

    // The hearth: a ring of stones round the fire, on the floor of the bowl.
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.3
      stone(mesh, room.x + Math.cos(a) * 1.9, room.hearth.y + 0.05, room.z + Math.sin(a) * 1.9, 0.45 + hash3(k, 5, 1) * 0.25, k * 7 + 1)
    }
    // And the small fires against the walls, on their own flat stones.
    for (const lantern of track.lanterns) {
      if (lantern.s < NIGHTFALL.ring.from - 30 || lantern.s > NIGHTFALL.ring.to + 30 || lantern.fire) continue
      const at = roadAt(track, lantern.s)
      roadPoint(at, lantern.n, 0, point, basisAt(at))
      stone(mesh, point.x, room.floorAt(point.x, point.z), point.z, 0.9, Math.round(lantern.s))
    }
  }

  /*
    ===========================================================================
    THE MOUTHS — rock over the way in and the way out.

    The passages are vaults inside the knoll; where they meet the open air the
    hillside is cut down to the road, and the rock of the vault stands proud of
    the cut as a lintel of stones, so the cave has a mouth rather than a hole.
    ===========================================================================
  */
  for (const mouth of [NIGHTFALL.hollow.from + 14, NIGHTFALL.hollow.to - 14]) {
    const at = roadAt(track, mouth)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    const mesh = meshes[chunkFor(mouth)]
    const wall = at.width + vergeWidth(at.room)
    for (let k = 0; k < 11; k++) {
      const t = k / 10
      const a = Math.PI * t
      const n = -Math.cos(a) * (wall + 2.2)
      const y = Math.sin(a) * (at.ceiling + 1.2) + 0.2
      roadPoint(at, n, y, point, frame)
      stone(mesh, point.x, point.y, point.z, 1.1 + hash3(k, 4, 2) * 0.8, k * 3 + Math.round(mouth))
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        roadPoint(at, side * (wall + 1.6 + k * 1.4), 0.2, point, frame)
        point.x += frame.fx * (k * 2.6 - 3)
        point.z += frame.fz * (k * 2.6 - 3)
        stone(mesh, point.x, land.heightAt(point.x, point.z), point.z, 0.8 + hash3(k, side, 6) * 0.9, k * 11 + side + Math.round(mouth))
      }
    }
  }

  // The great tree, at the centre of the Tree Turn.
  {
    const tree = greatTreeAt(track, land)
    const mesh = meshes[chunkFor((NIGHTFALL.treeTurn.from + NIGHTFALL.treeTurn.to) / 2)]
    bakeForms(mesh, limb(), tree.parts.wood, 0.85, false, 1.15)
    bakeForms(mesh, leaf(), tree.parts.leaves, 0.5, true, 1.1)
  }

  // A few more trees, grown the same way, where a meadow keeps them: near the
  // start, along the valley's rim, and the wood the walk runs through is
  // instanced by `Nightlife`, which is where the numbers are.
  {
    const treeRng = makeRng(seedFrom('nightfall:meadow-trees'))
    for (let s = 40; s < NIGHTFALL.meadow.to - 60; s += 90 + rng() * 70) {
      const at = roadAt(track, s)
      const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
      const side = rng() < 0.5 ? -1 : 1
      const n = side * (at.width + vergeWidth(at.room) + 16 + rng() * 22)
      roadPoint(at, n, 0, point, frame)
      // Not inside the Tree Turn, where the great tree is.
      if (s > NIGHTFALL.treeTurn.from - 40 && s < NIGHTFALL.treeTurn.to + 40 && side < 0) continue
      const foot: [number, number, number] = [point.x, land.heightAt(point.x, point.z) - 0.2, point.z]
      const parts = growTree({ at: foot, height: 9 + rng() * 4, species: speciesFor(treeRng), rng: treeRng, leafDetail: 0.4, woodDetail: 0.5 })
      const mesh = meshes[chunkFor(s)]
      bakeForms(mesh, limb(), parts.wood, 0.85, false, 1.15)
      bakeForms(mesh, leaf(), parts.leaves, 0.5, true, 1.1)
    }
  }

  // Stones: the meadow's, the valley's, and the plain's, from the track's own list.
  for (const b of track.boulders) {
    const at = roadAt(track, b.s)
    roadPoint(at, b.n, 0, point, basisAt(at))
    const verge = nightfallVerge(at, b.s)
    const y = Math.abs(b.n) > verge.edge ? land.heightAt(point.x, point.z) : point.y + verge.grade(b.n)
    stone(meshes[chunkFor(b.s)], point.x, y, point.z, b.size, b.seed)
  }
  // And bigger ones down by the water, where a river leaves them.
  for (let s = NIGHTFALL.wellspring.from + 30; s < NIGHTFALL.wellspring.to - 40; s += 14 + rng() * 18) {
    const at = roadAt(track, s)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    const side = rng() < 0.5 ? -1 : 1
    roadPoint(at, side * (at.width + vergeWidth(at.room) + 3 + rng() * 9), 0, point, frame)
    stone(meshes[chunkFor(s)], point.x, land.heightAt(point.x, point.z), point.z, 0.6 + rng() * 1.3, Math.round(s))
  }

  // The lantern posts of the walk, and the two lamps at the fords.
  for (const lantern of track.lanterns) {
    const onWalk = lantern.s > NIGHTFALL.walk.from && lantern.s < NIGHTFALL.walk.to
    const atFord = NIGHTFALL.fords.some((f) => Math.abs(lantern.s - (f - 6)) < 0.5)
    if (!onWalk && !atFord) continue
    const at = roadAt(track, lantern.s)
    roadPoint(at, lantern.n, 0, point, basisAt(at))
    const verge = nightfallVerge(at, lantern.s)
    // `lantern.y` is a height over the road at `n`; the post stands on the
    // verge under it, which may be a little above or below the road.
    const ground = point.y + verge.grade(lantern.n)
    lanternPost(meshes[chunkFor(lantern.s)], point.x, ground, point.z, lantern.y - verge.grade(lantern.n) + 0.05, Math.round(lantern.s))
  }

  return meshes.map((mesh, index) => {
    const geometry = mesh.build()
    if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere()
    return { ...spans[index], geometry, tread: mesh.tread }
  })
}

/* ---- the sky ------------------------------------------------------------------ */

const SKY_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/*
  The garden's sky at nightfall, and the Stars' split horizon.

  Dusk on the western edge fading as \`uNight\` rises; overhead the garden's own
  night blue with the stars coming out through it; and low on one horizon —
  \`uDawn\`'s bearing, which is where the plain runs — a band of dawn that is
  not this sky's: it is the other one's morning, the way the Stars are built.
  Colours are written in display terms and pushed back through the tone curve
  by the values below, so a navy sky keeps its horizon.
*/
const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDirection;
  uniform float uTime;
  uniform float uNight;
  uniform vec3 uDawn;
  uniform float uDawnStrength;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 27.13;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float up = clamp(dir.y, 0.0, 1.0);

    // Dusk: a warm west, a violet zenith. Night: the garden's deep blue.
    vec3 duskLow = vec3(0.86, 0.52, 0.34);
    vec3 duskHigh = vec3(0.24, 0.27, 0.43);
    vec3 nightLow = vec3(0.10, 0.13, 0.22);
    vec3 nightHigh = vec3(0.025, 0.045, 0.10);
    vec3 dusk = mix(duskLow, duskHigh, pow(up, 0.55));
    vec3 night = mix(nightLow, nightHigh, pow(up, 0.7));
    // The last of the sun is low in the west, which is behind you at the start.
    float west = max(0.0, dot(normalize(vec3(dir.x, 0.0, dir.z)), vec3(-0.55, 0.0, -0.83)));
    dusk = mix(dusk, duskLow * 1.1, west * west * (1.0 - up) * 0.6);
    vec3 sky = mix(dusk, night, uNight);

    // The stars, out as the dusk goes, and only up where the air is clear:
    // a point in one cell in three hundred, not the cell itself.
    vec3 cell = floor(dir * 260.0);
    vec3 within = fract(dir * 260.0) - 0.5;
    float dot_ = length(within);
    float star = step(0.9966, hash(cell)) * (1.0 - smoothstep(0.08, 0.3, dot_)) * smoothstep(0.02, 0.2, up);
    float twinkle = 0.7 + 0.3 * sin(uTime * 1.7 + hash(cell + 1.0) * 40.0);
    sky += vec3(0.85, 0.88, 1.0) * star * twinkle * uNight * 1.2;
    // A faint band of the galaxy, over the plain.
    float band = exp(-pow(dot(dir, normalize(vec3(0.3, 0.55, -0.78))), 2.0) * 9.0);
    sky += vec3(0.16, 0.19, 0.28) * band * up * uNight * 0.5;

    // Her dawn, low on the far edge: lit from under the horizon, and only there.
    float toward = max(0.0, dot(normalize(vec3(dir.x, 0.0, dir.z)), uDawn));
    float low = exp(-max(0.0, dir.y) * 9.0);
    vec3 dawn = mix(vec3(0.95, 0.58, 0.30), vec3(0.45, 0.40, 0.58), clamp(dir.y * 6.0, 0.0, 1.0));
    sky = mix(sky, dawn, pow(toward, 3.0) * low * uDawnStrength * uNight);

    // Written for the screen: back through the curve the road is drawn with.
    gl_FragColor = vec4(sky * 0.62, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Where her dawn is: the way the plain runs, so it is ahead when you are out on it. */
export function dawnBearing(track: Track) {
  const at = roadAt(track, NIGHTFALL.stars.from + 300)
  return new Vector3(Math.sin(at.heading), 0, Math.cos(at.heading)).normalize()
}

/**
 * The sky, the ground, the water, and everything alive on the road.
 *
 * The ground is drawn with the road's own material, so the sun going down, the
 * fog and the town's shade fall on the meadow exactly as on the path across it.
 */
export function NightfallWorld({ track, rock, garden }: { track: Track; rock: ShaderMaterial; garden?: GardenCounts }) {
  const skyRef = useRef<Mesh>(null)
  const land = useMemo(() => landFor(track), [track])
  const tileRefs = useRef<Mesh[]>([])
  const dawn = useMemo(() => dawnBearing(track), [track])

  const sky = useMemo(() => new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uDawn: { value: dawn },
      uDawnStrength: { value: 1 },
    },
  }), [dawn])
  useEffect(() => () => sky.dispose(), [sky])
  useEffect(() => () => land.tiles.forEach((tile) => tile.geometry.dispose()), [land])

  useFrame(({ camera }, delta) => {
    sky.uniforms.uTime.value += Math.min(0.05, delta)
    // How far into the night the road is: the same number `Race` drives the light with.
    sky.uniforms.uNight.value = 1 - (rock.uniforms.uDaylight.value as number) / 0.85
    if (skyRef.current) skyRef.current.position.copy(camera.position)
    const far = rock.uniforms.uFogFar.value as number
    for (let i = 0; i < land.tiles.length; i++) {
      const mesh = tileRefs.current[i]
      if (!mesh) continue
      const tile = land.tiles[i]
      mesh.visible = camera.position.distanceTo(tile.centre) - tile.radius < far * 1.05
    }
  })

  return (
    <group>
      <mesh ref={skyRef} frustumCulled={false} material={sky} renderOrder={-10}>
        <sphereGeometry args={[1500, 28, 16]} />
      </mesh>
      {land.tiles.map((tile, i) => (
        <mesh
          key={`ground-${i}`}
          ref={(node) => {
            if (node) tileRefs.current[i] = node
          }}
          geometry={tile.geometry}
          material={rock}
        />
      ))}
      {garden ? <Nightlife track={track} rock={rock} land={land} garden={garden} /> : <NightlifeLive track={track} rock={rock} land={land} />}
    </group>
  )
}
