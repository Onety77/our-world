/**
 * The far shore — everything the Moonbreak can see and will never reach.
 *
 * ---------------------------------------------------------------------------
 * The causeway had nothing past its own verge: sky, sea, and the edge of the
 * sea, in every direction, from every point on nearly four kilometres of road.
 * That is not open, it is *empty* — a road laid on a flat colour rather than a
 * place with a geography — and because the horizon is in every frame, it is a
 * large part of why every frame looked plain.
 *
 * Two layers, doing different jobs:
 *
 *   **the ranges** — mountains all the way round, carried with the camera like
 *   the sky, because a thing two kilometres off does not move when you drive
 *   and the honest way to draw that is not to move it. Open to the sea under
 *   the moon, so its road of light on the water runs all the way out.
 *
 *   **the drowned garden** — towers, a glasshouse dome, colonnades, broken
 *   aqueducts and wooded islands, standing in the sea between a quarter of a
 *   kilometre and a kilometre and a half off. Fixed in the world, so they slide
 *   across one another as the road turns, which is what turns a backdrop into
 *   distance. This is the garden the road has always been said to cross; until
 *   now you had to take its word for it.
 *
 * Neither goes through the shared light block, on purpose. All of it is well
 * past the fog, which would flatten every piece to the same dark card; instead
 * it dissolves into the *sky* — the same `nightSky` the dome and the sea draw —
 * so the further a thing is the more it is made of the night behind it, and a
 * tower at a kilometre is visibly paler than one at three hundred metres.
 *
 * Placed from a fixed seed rather than the day's. The road is one to learn, and
 * the shape of its horizon is part of what you learn: the dome is always off
 * the orchard, the great tree always stands where the Fall begins to drop.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { random } from './model'
import { basisAt } from './geometry'
import { MOON, MOON_DIR, MOONLIGHT, NIGHT } from './moonlight'
import { MOONBREAK, WATER_Y, emptyRoad, roadAt, type Track } from './track'
import { deep } from './depth'

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

const STONE = new Color('#6b7077')
const STONE_PALE = new Color('#858a8e')
const IRON = new Color('#2b3137')
const GLASS = new Color('#6d86a0')
const MOUND = new Color('#2d3631')
const PINE = new Color('#1d2925')
const BLOSSOM = new Color('#a1929f')

/** Flat-faced solids, every face with its own vertices so every edge stays an edge. */
class Solids {
  readonly position: number[] = []
  readonly color: number[] = []
  readonly index: number[] = []
  private readonly u = new Vector3()
  private readonly v = new Vector3()
  private readonly n = new Vector3()
  private readonly mid = new Vector3()

  /** One convex polygon, wound to face away from `inside`. */
  face(corners: Vector3[], inside: Vector3, color: Color) {
    this.u.subVectors(corners[1], corners[0])
    this.v.subVectors(corners[2], corners[0])
    this.n.crossVectors(this.u, this.v)
    this.mid.set(0, 0, 0)
    for (const corner of corners) this.mid.add(corner)
    this.mid.divideScalar(corners.length).sub(inside)
    const outward = this.n.dot(this.mid) >= 0
    const base = this.position.length / 3
    for (const corner of corners) {
      this.position.push(corner.x, corner.y, corner.z)
      this.color.push(color.r, color.g, color.b)
    }
    for (let i = 1; i < corners.length - 1; i++) {
      if (outward) this.index.push(base, base + i, base + i + 1)
      else this.index.push(base, base + i + 1, base + i)
    }
  }

  /**
   * A prism standing on `foot`: `sides` around, `r0` across the bottom and `r1`
   * across the top. Three sides is a spire, four a tower, eight a column.
   */
  prism(foot: Vector3, height: number, r0: number, r1: number, sides: number, turn: number, color: Color) {
    const bottom: Vector3[] = []
    const top: Vector3[] = []
    for (let k = 0; k < sides; k++) {
      const angle = turn + (k / sides) * Math.PI * 2
      bottom.push(new Vector3(foot.x + Math.cos(angle) * r0, foot.y, foot.z + Math.sin(angle) * r0))
      top.push(new Vector3(foot.x + Math.cos(angle) * r1, foot.y + height, foot.z + Math.sin(angle) * r1))
    }
    const inside = new Vector3(foot.x, foot.y + height * 0.5, foot.z)
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides
      this.face([bottom[k], bottom[next], top[next], top[k]], inside, color)
    }
    if (r1 > 0.05) this.face(top, inside, color)
  }

  /** A square beam from `a` to `b`, `thick` across. Ribs, lintels, arches, fallen things. */
  beam(a: Vector3, b: Vector3, thick: number, color: Color) {
    const along = new Vector3().subVectors(b, a).normalize()
    const helper = Math.abs(along.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
    const side = new Vector3().crossVectors(along, helper).normalize().multiplyScalar(thick / 2)
    const lift = new Vector3().crossVectors(side, along).normalize().multiplyScalar(thick / 2)
    const ring = (p: Vector3) => [
      p.clone().add(side).add(lift),
      p.clone().sub(side).add(lift),
      p.clone().sub(side).sub(lift),
      p.clone().add(side).sub(lift),
    ]
    const ra = ring(a)
    const rb = ring(b)
    const inside = new Vector3().addVectors(a, b).multiplyScalar(0.5)
    for (let k = 0; k < 4; k++) {
      const next = (k + 1) % 4
      this.face([ra[k], ra[next], rb[next], rb[k]], inside, color)
    }
    this.face(ra, inside, color)
    this.face(rb, inside, color)
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3))
    geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(this.color), 3))
    geometry.setIndex(this.index)
    geometry.computeVertexNormals()
    if (this.position.length) geometry.computeBoundingSphere()
    else geometry.boundingSphere = new Sphere()
    return geometry
  }
}

const shade = (color: Color, rng: () => number, spread = 0.22) =>
  color.clone().multiplyScalar(1 - spread / 2 + rng() * spread)

/** A watchtower, in three stages stepping in, and a broken crown. */
function tower(solids: Solids, at: Vector3, rng: () => number) {
  const width = 6 + rng() * 5
  const height = 26 + rng() * 40
  const turn = rng() * Math.PI
  const color = shade(STONE, rng)
  let y = WATER_Y - 6
  let across = width
  for (const share of [0.52, 0.3, 0.18]) {
    const h = (height + 6) * share
    solids.prism(new Vector3(at.x, y, at.z), h, across * 0.72, across * 0.68, 4, turn, color)
    y += h
    across *= 0.8
  }
  for (let tooth = 0; tooth < 4; tooth++) {
    if (rng() < 0.35) continue
    const angle = turn + (tooth / 4) * Math.PI * 2
    const r = across * 0.4
    const foot = new Vector3(at.x + Math.cos(angle) * r, y, at.z + Math.sin(angle) * r)
    solids.prism(foot, 1.5 + rng() * 4, across * 0.2, across * 0.18, 4, turn, color)
  }
}

/** A needle of dressed stone, with a point on it. */
function obelisk(solids: Solids, at: Vector3, rng: () => number) {
  const height = 22 + rng() * 22
  const r = 2 + rng() * 1.2
  const turn = rng() * Math.PI
  const color = shade(STONE_PALE, rng)
  const lean = new Vector3((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06)
  solids.prism(new Vector3(at.x, WATER_Y - 3, at.z), height, r, r * 0.62, 4, turn, color)
  solids.prism(
    new Vector3(at.x + lean.x * height, WATER_Y - 3 + height, at.z + lean.z * height),
    r * 1.6,
    r * 0.62,
    0.01,
    4,
    turn,
    color,
  )
}

/**
 * The drowned glasshouse: an iron drum, the ribs of a dome with most of the glass
 * gone, and a few panes still in that catch the moon. The garden has one of these
 * standing whole in its meadow; this is what one looks like after the sea.
 */
function glasshouse(solids: Solids, at: Vector3, rng: () => number) {
  const radius = 13 + rng() * 6
  const floor = WATER_Y - 2
  const drum = 6 + rng() * 3
  solids.prism(new Vector3(at.x, floor, at.z), drum, radius, radius * 0.97, 14, 0, IRON)
  const ribs = 14
  const crown = new Vector3(at.x, floor + drum + radius * 0.95, at.z)
  const points: Vector3[][] = []
  for (let rib = 0; rib < ribs; rib++) {
    const angle = (rib / ribs) * Math.PI * 2
    const arc: Vector3[] = []
    for (let k = 0; k <= 6; k++) {
      const phi = (k / 6) * (Math.PI / 2)
      arc.push(
        new Vector3(
          at.x + Math.cos(angle) * radius * 0.97 * Math.cos(phi),
          floor + drum + Math.sin(phi) * radius * 0.95,
          at.z + Math.sin(angle) * radius * 0.97 * Math.cos(phi),
        ),
      )
    }
    points.push(arc)
    // Some ribs have fallen part of the way; one or two are gone.
    const breaks = rng() < 0.18 ? 0 : rng() < 0.3 ? 2 + Math.floor(rng() * 3) : 6
    for (let k = 0; k < breaks; k++) solids.beam(arc[k], arc[k + 1], 0.55, IRON)
  }
  // The glass that is left, low down where the ribs are still whole.
  for (let rib = 0; rib < ribs; rib++) {
    if (rng() < 0.55) continue
    const next = (rib + 1) % ribs
    const k = Math.floor(rng() * 3)
    solids.face([points[rib][k], points[next][k], points[next][k + 1], points[rib][k + 1]], crown.clone().setY(floor + drum), GLASS)
  }
  solids.prism(crown.clone().setY(crown.y - 0.5), 3, 2.2, 1.6, 8, 0, IRON)
}

/** A row of columns, some of them broken, with a lintel where two still stand together. */
function colonnade(solids: Solids, at: Vector3, rng: () => number) {
  const yaw = rng() * Math.PI
  const dx = Math.cos(yaw)
  const dz = Math.sin(yaw)
  const count = 6 + Math.floor(rng() * 5)
  const gap = 6.5 + rng() * 2
  const height = 10 + rng() * 7
  const color = shade(STONE_PALE, rng)
  const standing: (Vector3 | null)[] = []
  for (let k = 0; k < count; k++) {
    const along = (k - (count - 1) / 2) * gap
    const foot = new Vector3(at.x + dx * along, WATER_Y - 2, at.z + dz * along)
    const whole = rng() > 0.3
    const h = whole ? height : height * (0.25 + rng() * 0.45)
    solids.prism(foot, h, 1.15, 0.95, 8, 0, color)
    if (whole) {
      solids.prism(new Vector3(foot.x, foot.y + h, foot.z), 0.9, 1.6, 1.6, 4, yaw + Math.PI / 4, color)
      standing.push(new Vector3(foot.x, foot.y + h + 1.3, foot.z))
    } else {
      standing.push(null)
    }
  }
  for (let k = 0; k < count - 1; k++) {
    const a = standing[k]
    const b = standing[k + 1]
    if (a && b && rng() < 0.75) solids.beam(a, b, 1.3, color)
  }
}

/** An aqueduct running out across the water, arched, and broken off in the middle. */
function aqueduct(solids: Solids, at: Vector3, rng: () => number) {
  const yaw = rng() * Math.PI
  const dx = Math.cos(yaw)
  const dz = Math.sin(yaw)
  const count = 5 + Math.floor(rng() * 5)
  const span = 15 + rng() * 5
  const height = 13 + rng() * 9
  const broken = 1 + Math.floor(rng() * (count - 2))
  const color = shade(STONE, rng)
  const floor = WATER_Y - 4
  const pierAt = (k: number) => {
    const along = (k - (count - 1) / 2) * span
    return new Vector3(at.x + dx * along, floor, at.z + dz * along)
  }
  for (let k = 0; k < count; k++) {
    if (k === broken) continue
    const foot = pierAt(k)
    const stump = k === broken + 1 || k === broken - 1 ? 0.55 + rng() * 0.3 : 1
    solids.prism(foot, (height + 4) * stump, 2.4, 2.1, 4, yaw + Math.PI / 4, color)
    if (k === count - 1 || k + 1 === broken || stump < 1) continue
    const next = pierAt(k + 1)
    if (k + 1 < count && (k + 1 === broken + 1)) continue
    // The arch, in five voussoirs, and the channel on top.
    const spring = floor + height - span * 0.42
    let previous: Vector3 | null = null
    for (let v = 0; v <= 5; v++) {
      const t = v / 5
      const angle = Math.PI * (1 - t)
      const point = new Vector3()
        .lerpVectors(foot, next, 0.5 + Math.cos(angle) * 0.5)
        .setY(spring + Math.sin(angle) * span * 0.42)
      if (previous) solids.beam(previous, point, 1.6, color)
      previous = point
    }
    solids.beam(
      new Vector3(foot.x, floor + height + 3, foot.z),
      new Vector3(next.x, floor + height + 3, next.z),
      2.6,
      color,
    )
  }
}

/** A low island with a stand of trees on it. `great` is the one landmark tree. */
function island(solids: Solids, at: Vector3, rng: () => number, great = false) {
  const radius = great ? 46 : 18 + rng() * 26
  const rise = great ? 7 : 2.5 + rng() * 4
  solids.prism(new Vector3(at.x, WATER_Y - 2, at.z), rise + 2, radius, radius * 0.5, 11, rng(), shade(MOUND, rng))
  const trees = great ? 5 : 3 + Math.floor(rng() * 5)
  for (let t = 0; t < trees; t++) {
    const angle = rng() * Math.PI * 2
    const out = (great && t === 0 ? 0 : 0.2 + rng() * 0.4) * radius * 0.5
    const foot = new Vector3(at.x + Math.cos(angle) * out, WATER_Y + rise - 0.5, at.z + Math.sin(angle) * out)
    if (great && t === 0) {
      /*
        The great tree. The Tree of Thoughts has its whole meadow to itself; this
        is the same idea standing up to its knees in the sea — a trunk you can
        read from a kilometre off and a broad crown with pale blossom in it, the
        only blossom out here, lit from the moon's side.
      */
      solids.prism(foot, 26, 3.4, 1.8, 7, 0, IRON)
      const crownAt = new Vector3(foot.x, foot.y + 24, foot.z)
      for (let bough = 0; bough < 9; bough++) {
        const heading = (bough / 9) * Math.PI * 2 + rng() * 0.4
        const reach = 10 + rng() * 12
        const tip = new Vector3(crownAt.x + Math.cos(heading) * reach, crownAt.y + 3 + rng() * 9, crownAt.z + Math.sin(heading) * reach)
        solids.beam(crownAt, tip, 1.2, IRON)
        const leaf = bough % 3 === 0 ? BLOSSOM : PINE
        solids.prism(tip.clone().setY(tip.y - 2), 4.5 + rng() * 2, 7 + rng() * 5, 3 + rng() * 2, 7, rng(), shade(leaf, rng))
      }
      solids.prism(crownAt.clone().setY(crownAt.y + 6), 6, 13, 5, 9, 0, shade(PINE, rng))
      continue
    }
    const tall = 6 + rng() * 8
    solids.prism(foot, tall, 0.55, 0.3, 5, 0, IRON)
    // Umbrella pine or cypress, by a coin toss, which is what makes a stand read as trees.
    if (rng() < 0.5) {
      solids.prism(foot.clone().setY(foot.y + tall - 1), 3.2, 4 + rng() * 2.5, 1.2, 7, rng(), shade(PINE, rng))
    } else {
      solids.prism(foot.clone().setY(foot.y + tall * 0.25), tall * 1.2, 2.2, 0.01, 6, rng(), shade(PINE, rng))
    }
  }
}

/**
 * How much larger than life the drowned garden is built.
 *
 * Every piece was first made at the size it would be — a colonnade of ten-metre
 * columns, a watchtower of forty — and at six hundred metres over the sea they
 * read as fence posts and scaffolding. Distance takes size away faster than
 * instinct allows for, and these are the landmarks of a place, so they are
 * built as the landmarks of a place: grown about their own feet, so nothing
 * that stood in the water comes up out of it.
 */
const GRAND = 1.65

function grow(solids: Solids, from: number, at: Vector3, by: number) {
  const p = solids.position
  for (let i = from; i < p.length; i += 3) {
    p[i] = at.x + (p[i] - at.x) * by
    p[i + 1] = WATER_Y + (p[i + 1] - WATER_Y) * by
    p[i + 2] = at.z + (p[i + 2] - at.z) * by
  }
}

/**
 * Where the drowned garden stands.
 *
 * Every candidate is kept at least a couple of hundred metres from every metre
 * of road, and away from every other piece, so nothing is ever close enough to
 * be mistaken for scenery you could reach — and nothing stands in front of the
 * moon's path on the water, which is the one view out here that must stay open.
 */
function buildDrownedGarden(track: Track): BufferGeometry {
  const solids = new Solids()
  const rng = random(0x6d6f6f6e)
  const road = emptyRoad()
  const samples: { x: number; z: number }[] = []
  for (let s = 0; s < track.length; s += 12) {
    roadAt(track, s, road)
    samples.push({ x: road.x, z: road.z })
  }
  const placed: { x: number; z: number; r: number }[] = []
  const clearOfRoad = (x: number, z: number, keep: number) =>
    samples.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > keep * keep)
  const clearOfOthers = (x: number, z: number, r: number) =>
    placed.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > (p.r + r) ** 2)

  const outFrom = (s: number, side: number, distance: number) => {
    roadAt(track, s, road)
    const basis = basisAt(road)
    return new Vector3(road.x + basis.rx * side * distance, WATER_Y, road.z + basis.rz * side * distance)
  }

  // The two named pieces first, so the random ones have to fit round them.
  for (const [s, distance, build, r] of [
    [MOONBREAK.orchard.from + 60, 360, glasshouse, 40],
    [MOONBREAK.stair.to + 30, 420, (sol: Solids, at: Vector3, rand: () => number) => island(sol, at, rand, true), 70],
  ] as const) {
    for (const side of [1, -1]) {
      const at = outFrom(s, side, distance)
      if (!clearOfRoad(at.x, at.z, 230) || !clearOfOthers(at.x, at.z, r * GRAND)) continue
      const from = solids.position.length
      build(solids, at, rng)
      grow(solids, from, at, GRAND)
      placed.push({ x: at.x, z: at.z, r: r * GRAND })
      break
    }
  }

  const kinds: [(sol: Solids, at: Vector3, rand: () => number) => void, number, number][] = [
    [tower, 5, 30],
    [obelisk, 4, 20],
    [colonnade, 5, 45],
    [aqueduct, 3, 90],
    [island, 8, 55],
    [glasshouse, 1, 40],
  ]
  const moonBearing = Math.atan2(MOON.x, MOON.z)
  for (const [build, count, r] of kinds) {
    let made = 0
    for (let attempt = 0; attempt < 400 && made < count; attempt++) {
      const s = rng() * track.length
      const side = rng() < 0.5 ? -1 : 1
      const distance = 250 + Math.pow(rng(), 1.5) * 1000
      const at = outFrom(s, side, distance)
      if (!clearOfRoad(at.x, at.z, 190 + r * GRAND) || !clearOfOthers(at.x, at.z, r * GRAND + 30)) continue
      // Keep the moon's road on the water clear from wherever the car is likely to be.
      const fromMiddle = Math.atan2(at.x - samples[Math.floor(s / 12)].x, at.z - samples[Math.floor(s / 12)].z)
      const offMoon = Math.abs(((fromMiddle - moonBearing + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
      if (offMoon < 0.2) continue
      const from = solids.position.length
      build(solids, at, rng)
      grow(solids, from, at, GRAND)
      placed.push({ x: at.x, z: at.z, r: r * GRAND })
      made++
    }
  }
  return solids.build()
}

/**
 * A ring of mountains, carried with the camera.
 *
 * The ridge is a sum of sines at frequencies that share nothing, so it never
 * repeats round the circle, raised to a power so the range is mostly shoulders
 * with a few peaks. It leans away from you as it rises, which gives the faces
 * a slope for the moonlight to find. And it drops into the sea on either side of
 * the moon's bearing, leaving the path of light on the water open to the edge.
 */
function buildRange(radius: number, low: number, high: number, gap: number, seed: number, top: Color, foot: Color) {
  const rng = random(seed)
  const phases = Array.from({ length: 6 }, () => rng() * Math.PI * 2)
  const moonBearing = Math.atan2(MOON.x, MOON.z)
  const SEGMENTS = 360
  const position: number[] = []
  const color: number[] = []
  const index: number[] = []
  for (let i = 0; i <= SEGMENTS; i++) {
    const bearing = (i / SEGMENTS) * Math.PI * 2
    const ridge =
      0.5 * Math.sin(bearing * 2 + phases[0]) +
      0.24 * Math.sin(bearing * 5 + phases[1]) +
      0.13 * Math.sin(bearing * 13 + phases[2]) +
      0.07 * Math.sin(bearing * 31 + phases[3]) +
      0.04 * Math.sin(bearing * 67 + phases[4]) +
      0.02 * Math.sin(bearing * 149 + phases[5])
    const off = Math.abs(((bearing - moonBearing + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    const open = Math.min(1, Math.max(0, (off - gap) / 0.35))
    const height = (low + Math.pow(ridge * 0.5 + 0.5, 1.7) * (high - low)) * open * open * (3 - 2 * open) - 8
    const x = Math.sin(bearing)
    const z = Math.cos(bearing)
    position.push(x * radius, -60, z * radius)
    color.push(foot.r, foot.g, foot.b)
    position.push(x * (radius + 140), height, z * (radius + 140))
    color.push(top.r, top.g, top.b)
    if (i < SEGMENTS) {
      const a = i * 2
      index.push(a, a + 2, a + 3, a, a + 3, a + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(color), 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  geometry.boundingSphere = new Sphere(new Vector3(), radius + 200)
  return geometry
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const FAR_VERT = /* glsl */ `
  attribute vec3 aColor;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vColor = aColor;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/*
  Lit by the moon alone, then given back to the night.

  A face turned to the moon goes pale; a face turned away is nearly black, and
  its edges go silver where the moon is behind it, which is most of what a
  silhouette against a moonlit sky actually is. Then the whole thing is mixed
  toward the sky in the direction you are looking — more with distance, more
  still near the water, where the air holds the mist — so it sits *in* the night
  rather than in front of it.
*/
const FAR_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying vec3 vNormal;
  uniform vec3 uMoonLight;
  uniform float uDeep;
  uniform vec3 uFogColor;
  uniform float uHazeNear;
  uniform float uHazeFar;
  uniform float uHazeFloor;
  ${NIGHT}
  void main() {
    vec3 toward = vWorld - cameraPosition;
    float range = length(toward);
    vec3 d = toward / range;
    vec3 n = normalize(vNormal);
    if (dot(n, d) > 0.0) n = -n;
    float lit = max(0.0, dot(n, uMoonDir));
    vec3 colour = vColor * (vec3(0.012, 0.016, 0.026) + uMoonLight * lit * 0.55);
    float edge = pow(1.0 - abs(dot(n, d)), 3.0) * pow(max(0.0, dot(d, uMoonDir)), 3.0);
    colour += vec3(0.07, 0.08, 0.1) * edge;
    float haze = uHazeFloor + (1.0 - uHazeFloor) * smoothstep(uHazeNear, uHazeFar, range);
    float mist = (1.0 - smoothstep(0.0, 18.0, vWorld.y - (${WATER_Y.toFixed(2)}))) * 0.45;
    colour = mix(colour, nightSky(d), clamp(haze + mist * (1.0 - haze), 0.0, 1.0));
    colour = mix(colour, uFogColor, uDeep);
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function farMaterial(near: number, far: number, floor: number) {
  return new ShaderMaterial({
    vertexShader: FAR_VERT,
    fragmentShader: FAR_FRAG,
    side: DoubleSide,
    uniforms: {
      uMoonDir: { value: MOON_DIR },
      uMoonLight: { value: MOONLIGHT },
      uDeep: { value: 0 },
      uFogColor: { value: new Color('#04161c') },
      uHazeNear: { value: near },
      uHazeFar: { value: far },
      uHazeFloor: { value: floor },
    },
  })
}

export function Moonshore({ track }: { track: Track }) {
  const rangesRef = useRef<Mesh[]>([])
  const garden = useMemo(() => buildDrownedGarden(track), [track])
  const ranges = useMemo(
    () => [
      buildRange(2000, 60, 230, 0.26, 0x51a7, new Color('#58606e'), new Color('#1c212a')),
      buildRange(1480, 18, 105, 0.42, 0x93c1, new Color('#3d4450'), new Color('#12161d')),
    ],
    [],
  )
  const gardenMaterial = useMemo(() => farMaterial(160, 2150, 0.12), [])
  // The ranges are always the same distance off, so their haze is a constant:
  // a smoothstep that never starts, and only the floor.
  const rangeMaterials = useMemo(() => [farMaterial(1e6, 2e6, 0.62), farMaterial(1e6, 2e6, 0.38)], [])

  useEffect(
    () => () => {
      garden.dispose()
      ranges.forEach((range) => range.dispose())
      gardenMaterial.dispose()
      rangeMaterials.forEach((material) => material.dispose())
    },
    [garden, ranges, gardenMaterial, rangeMaterials],
  )

  useFrame(({ camera }) => {
    for (const mesh of rangesRef.current) mesh?.position.set(camera.position.x, WATER_Y, camera.position.z)
    for (const material of [gardenMaterial, ...rangeMaterials]) {
      material.uniforms.uDeep.value = deep.at
      material.uniforms.uFogColor.value.copy(deep.fog)
    }
  })

  return (
    <>
      {ranges.map((range, i) => (
        <mesh
          key={i}
          ref={(node) => {
            if (node) rangesRef.current[i] = node
          }}
          geometry={range}
          material={rangeMaterials[i]}
          frustumCulled={false}
        />
      ))}
      <mesh geometry={garden} material={gardenMaterial} frustumCulled={false} />
    </>
  )
}
