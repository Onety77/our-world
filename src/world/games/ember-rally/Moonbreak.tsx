/**
 * The Moonbreak — an open road over the drowned high garden.
 *
 * This file owns only what is different from the Rootway: the causeway, its
 * arches and orchard, and the sky and water around them. Cars, tyres, ghosts,
 * controls, cameras, particles and race timing remain in `Race.tsx` and do not
 * know which road they are on.
 */

import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { random } from './model'
import { basisAt, roadPoint, type RoadBasis, type TunnelChunk } from './geometry'
import { MOONBREAK, WATER_Y, emptyRoad, roadAt, vergeWidth, type Track } from './track'
import { Deepwater } from './Deepwater'
import { deep } from './depth'
import { MoonbreakSound } from './MoonbreakSound'



const RING = 2
const CHUNK = 50
const PROFILE = 13
const ROAD = new Color('#777973')
const ROAD_WORN = new Color('#4f5452')
const ROAD_MIRROR = new Color('#788687')
const ROAD_REED = new Color('#626e68')
const ROAD_HIGH = new Color('#858187')
const MOSS = new Color('#40564a')
const REED = new Color('#637263')
const REED_PALE = new Color('#899078')
const BANK = new Color('#273d3b')
const BANK_LOW = new Color('#172b2f')
const PALE_STONE = new Color('#a8aaa0')
const MIRROR_STONE = new Color('#798c91')
const BARK = new Color('#4d403d')
const BARK_PALE = new Color('#766861')
const LEAVES = [new Color('#344d48'), new Color('#485546'), new Color('#5a4b57')]
/** Down in the Drowned Mile, where the only green left is the kind that likes it. */
const KELP = new Color('#3c6b52')
const KELP_DARK = new Color('#26493f')

function hash3(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

class CourseMesh {
  readonly position: number[] = []
  readonly color: number[] = []
  readonly surface: number[] = []
  readonly index: number[] = []

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
const tint = new Color()

function addBox(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  y: number,
  along: number,
  across: number,
  high: number,
  color: Color,
  rough = 0.7,
) {
  const base = mesh.count
  for (const ds of [-along, along]) {
    for (const dy of [0, high]) {
      for (const dn of [-across, across]) {
        roadPoint(road, n + dn, y + dy, point, basis)
        point.x += basis.fx * ds
        point.y += basis.fy * ds
        point.z += basis.fz * ds
        mesh.vertex(point, color, 0.18, rough)
      }
    }
  }
  // indices: ds,dy,dn => 000 001 010 011 100 101 110 111
  mesh.quad(base, base + 4, base + 5, base + 1)
  mesh.quad(base + 2, base + 3, base + 7, base + 6)
  mesh.quad(base, base + 2, base + 6, base + 4)
  mesh.quad(base + 1, base + 5, base + 7, base + 3)
  mesh.quad(base + 4, base + 6, base + 7, base + 5)
  mesh.quad(base, base + 1, base + 3, base + 2)
}

function addTube(mesh: CourseMesh, path: Vector3[], radius: number, color: Color) {
  const sides = 6
  const base = mesh.count
  const forward = new Vector3()
  const right = new Vector3()
  const up = new Vector3()
  const reference = new Vector3(0, 1, 0)

  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)]
    const b = path[Math.min(path.length - 1, i + 1)]
    forward.subVectors(b, a).normalize()
    reference.set(Math.abs(forward.y) > 0.94 ? 1 : 0, Math.abs(forward.y) > 0.94 ? 0 : 1, 0)
    right.crossVectors(forward, reference).normalize()
    up.crossVectors(right, forward).normalize()
    const taper = 0.82 + Math.sin((i / (path.length - 1)) * Math.PI) * 0.18
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2
      point
        .copy(path[i])
        .addScaledVector(right, Math.cos(angle) * radius * taper)
        .addScaledVector(up, Math.sin(angle) * radius * taper)
      mesh.vertex(point, color, 0.2, 0.62)
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides
      mesh.quad(
        base + i * sides + k,
        base + i * sides + next,
        base + (i + 1) * sides + next,
        base + (i + 1) * sides + k,
      )
    }
  }
}

function addCrown(mesh: CourseMesh, at: Vector3, radius: number, seed: number) {
  const rings = 3
  const sides = 7
  const base = mesh.count
  const color = LEAVES[seed % LEAVES.length]
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2
      const r = radius * (0.76 + hash3(seed, i, k) * 0.42)
      tint.copy(color).multiplyScalar(0.78 + hash3(seed + 7, i, k) * 0.34)
      point.set(
        at.x + Math.sin(phi) * Math.cos(angle) * r,
        at.y + Math.cos(phi) * r * 0.7,
        at.z + Math.sin(phi) * Math.sin(angle) * r,
      )
      mesh.vertex(point, tint, 0.12, 1)
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides
      mesh.quad(
        base + i * sides + k,
        base + i * sides + next,
        base + (i + 1) * sides + next,
        base + (i + 1) * sides + k,
      )
    }
  }
}

function addArch(mesh: CourseMesh, track: Track, s: number) {
  const road = roadAt(track, s)
  const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
  const span = road.width + 1.55
  const path = Array.from({ length: 13 }, (_, index) => {
    const t = index / 12
    const angle = Math.PI * (1 - t)
    const n = Math.cos(angle) * span
    const y = 0.16 + Math.sin(angle) * (span * 0.72 + 2.4)
    return roadPoint(road, n, y, new Vector3(), basis)
  })
  addTube(mesh, path, 0.19, PALE_STONE)

  // A second broken rib half a metre behind it gives the gate depth while
  // leaving enough missing glass for the sky to remain the important surface.
  const second = path.map((p, index) =>
    index > 4 && index < 8
      ? p.clone().addScaledVector(new Vector3(basis.fx, basis.fy, basis.fz), -0.7)
      : p.clone().addScaledVector(new Vector3(basis.fx, basis.fy, basis.fz), -0.45),
  )
  addTube(mesh, second, 0.08, BARK_PALE)
}

function addTree(mesh: CourseMesh, track: Track, s: number, side: number, seed: number) {
  const road = roadAt(track, s)
  const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
  const n = side * (road.width + vergeWidth(road.room) + 1.6 + hash3(seed, 2, 1) * 3.8)
  const height = 3.8 + hash3(seed, 4, 5) * 3.2
  const lean = -side * (0.45 + hash3(seed, 7, 3) * 0.75)
  const trunk = Array.from({ length: 5 }, (_, index) => {
    const t = index / 4
    return roadPoint(
      road,
      n + lean * t * t,
      0.05 + height * t,
      new Vector3(),
      basis,
    ).addScaledVector(new Vector3(basis.fx, basis.fy, basis.fz), Math.sin(t * 2.7 + seed) * 0.35)
  })
  addTube(mesh, trunk, 0.18 + height * 0.018, BARK)
  const crown = trunk.at(-1)!.clone().addScaledVector(new Vector3(basis.rx, basis.ry, basis.rz), -side * 0.45)
  addCrown(mesh, crown, 1.55 + hash3(seed, 8, 9) * 1.25, seed)
}

/** Small drowned reed colonies: motionless geometry shaped as if wind bent it. */
function addReeds(mesh: CourseMesh, track: Track, s: number, side: number, seed: number) {
  const road = roadAt(track, s)
  const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
  const outside = road.width + vergeWidth(road.room) + 0.45
  const forward = new Vector3(basis.fx, basis.fy, basis.fz)
  for (let stem = 0; stem < 5; stem++) {
    const jitter = (hash3(seed, stem, 2) - 0.5) * 1.4
    const n = side * (outside + hash3(seed, stem, 4) * 1.15) + jitter
    const high = 0.85 + hash3(seed, stem, 8) * 1.25
    const root = roadPoint(road, n, -0.16, new Vector3(), basis)
      .addScaledVector(forward, (stem - 2) * 0.42)
    const middle = roadPoint(road, n - side * 0.08, high * 0.54, new Vector3(), basis)
      .addScaledVector(forward, (stem - 2) * 0.42 + 0.08)
    const tip = roadPoint(road, n - side * (0.2 + high * 0.08), high, new Vector3(), basis)
      .addScaledVector(forward, (stem - 2) * 0.42 + 0.22)
    addTube(mesh, [root, middle, tip], 0.026, stem % 3 === 0 ? REED_PALE : REED)
  }
}

/** The causeway in the same chunk format the race already knows how to cull. */
export function buildMoonbreak(track: Track): TunnelChunk[] {
  const rings = Math.floor(track.length / RING) + 1
  const chunkCount = Math.ceil(track.length / CHUNK)
  const meshes = Array.from({ length: chunkCount }, () => new CourseMesh())
  const spans: { from: number; to: number }[] = []
  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }

  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const mesh = meshes[chunk]
    const first = Math.floor((chunk * CHUNK) / RING)
    const last = Math.min(rings - 1, Math.floor(((chunk + 1) * CHUNK) / RING))
    spans.push({ from: first * RING, to: last * RING })

    for (let ring = first; ring <= last; ring++) {
      const s = ring * RING
      roadAt(track, s, road)
      basisAt(road, basis)
      const wall = road.width + vergeWidth(road.room)
      const offsets = [
        -wall, -wall, -road.width, -road.width * 0.92, -road.width * 0.62,
        -road.width * 0.31, 0,
        road.width * 0.31, road.width * 0.62, road.width * 0.92, road.width,
        wall, wall,
      ]
      const heights = [
        -1.15, 0.08, 0.035, 0.045, 0.055, 0.064, 0.07,
        0.064, 0.055, 0.045, 0.035, 0.08, -1.15,
      ]
      const base = mesh.count

      for (let k = 0; k < PROFILE; k++) {
        roadPoint(road, offsets[k], heights[k], point, basis)
        const roadSurface = k >= 2 && k <= 10
        const roadEdge = k === 2 || k === 10
        const bankTop = k === 1 || k === 11
        let color = BANK_LOW
        let wet = road.wet * 0.48
        let rough = 0.9
        if (roadEdge) {
          tint.copy(PALE_STONE).multiplyScalar(0.78 + hash3(ring, k, 4) * 0.18)
          color = tint
          wet = road.wet * 0.72
          rough = 0.24
        } else if (roadSurface) {
          const away = Math.abs(offsets[k] - road.line)
          const worn = 1 - Math.min(1, Math.max(0, (away - 0.35) / 1.2))
          const district =
            s >= MOONBREAK.mirror.from && s < MOONBREAK.mirror.to
              ? ROAD_MIRROR
              : s >= MOONBREAK.reeds.from && s < MOONBREAK.reeds.to
                ? ROAD_REED
                : s >= MOONBREAK.stair.from && s < MOONBREAK.veryHard.exit
                  ? ROAD_HIGH
                  : ROAD
          tint.copy(district).lerp(ROAD_WORN, worn * 0.46)
          // One darker transverse joint every ten metres. It is part of the
          // old paving, but at speed it becomes an honest visual metronome.
          const joint = ring % 5 === 0 ? 0.72 : 1
          tint.multiplyScalar((0.92 + hash3(ring, k, 17) * 0.13) * joint)
          color = tint
          wet = road.wet
          rough = 0.08
        } else if (bankTop) {
          tint.copy(MOSS).multiplyScalar(0.82 + hash3(ring, k, 8) * 0.25)
          color = tint
        } else if (k === 0 || k === 10) {
          color = BANK
        }
        mesh.vertex(point, color, wet, rough)
      }

      if (ring > first) {
        const previous = base - PROFILE
        for (let k = 0; k < PROFILE - 1; k++) {
          mesh.quad(previous + k, previous + k + 1, base + k + 1, base + k)
        }
      }
    }
  }

  const chunkFor = (s: number) => Math.max(0, Math.min(chunkCount - 1, Math.floor(s / CHUNK)))

  // Low pale stones mark the drop without turning the high road into a modern
  // guardrail. Their rhythm is what makes acceleration visible in open space.
  for (let s = 26; s < track.finishAt - 24; s += 15) {
    const at = roadAt(track, s)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    for (const side of [-1, 1]) {
      addBox(
        meshes[chunkFor(s)],
        at,
        frame,
        side * (at.width + vergeWidth(at.room) - 0.18),
        0.02,
        0.22,
        0.17,
        0.46 + (Math.floor(s / 15) % 3 === 0 ? 0.24 : 0),
        PALE_STONE,
      )
    }
  }

  for (const s of MOONBREAK.arches) {
    if (s < track.length) addArch(meshes[chunkFor(s)], track, s)
  }

  /*
    The two mouths, which are the same arch built three times over.

    Going under has to be an *event*, and an event needs a threshold — the
    moment the sky is cut off is the moment the whole thing lands, and a tube
    that simply begins in open water gives you nothing to cross. So each mouth
    is three ribs half a metre apart at exactly the waterline, which from a car
    at forty metres a second reads as one heavy stone collar going over the
    roof, and then the light changes.
  */
  for (const s of [MOONBREAK.deep.under.in, MOONBREAK.deep.under.out]) {
    for (const nudge of [-0.55, 0, 0.55]) {
      addArch(meshes[chunkFor(s + nudge)], track, s + nudge)
    }
  }
  addArch(meshes[chunkFor(track.finishAt)], track, track.finishAt)
  addArch(meshes[chunkFor(track.length - 24)], track, track.length - 24)

  const rng = random(track.seed ^ 0x431f27)
  let treeSeed = 1
  for (let s = 38; s < track.finishAt - 42; s += 31 + rng() * 31) {
    const orchard = s > MOONBREAK.orchard.from && s < MOONBREAK.orchard.to
    const highRoad = s > MOONBREAK.stair.from && s < MOONBREAK.veryHard.exit
    /*
      Nothing with leaves on it grows in the Drowned Mile.

      A drowned orchard is a tree standing in water with its crown in the air,
      which is the whole idea of the causeway above — and nineteen metres down
      it would be a tree standing on the sea floor with its crown in the dark,
      which is a different and much sillier idea. Down there the verge gets
      kelp instead, and the tall stones that used to mark the Mirror Flats.
    */
    if (s > MOONBREAK.deep.from - 30 && s < MOONBREAK.deep.to + 30) continue
    if (highRoad && rng() < 0.52) continue
    addTree(meshes[chunkFor(s)], track, s, rng() < 0.5 ? -1 : 1, treeSeed++)
    if (orchard || rng() > 0.78) {
      const other = Math.min(track.finishAt - 35, s + 9 + rng() * 13)
      addTree(meshes[chunkFor(other)], track, other, rng() < 0.5 ? -1 : 1, treeSeed++)
    }
  }

  /*
    The survey stones, which are now on the sea floor.

    They were the Mirror Flats' one piece of scenery: tall pale markers that
    pass like slow clock hands in peripheral vision and make speed legible on a
    road with nothing close to it. That job did not go away when the flats went
    under — it got harder, because water takes the far distance away and leaves
    even less to measure against — so they are still here, standing *outside*
    the glass where they read as something the causeway was built past rather
    than as furniture on the road.

    Taller and further out than they were above water. Close to the tube they
    fought the ribs for the same rhythm; at four and a half metres clear they
    loom instead, which is what a thing seen through glass in bad light should
    do. Both sides now rather than alternating: a drowned avenue.
  */
  let mirrorSide = -1
  for (let s = MOONBREAK.deep.from + 120; s < MOONBREAK.deep.to - 110; s += 44) {
    const at = roadAt(track, s)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    mirrorSide *= -1
    for (const side of [-1, 1]) {
      if (side === mirrorSide && hash3(s, 9, 2) < 0.42) continue
      addBox(
        meshes[chunkFor(s)],
        at,
        frame,
        side * (at.width + vergeWidth(at.room) + 4.5 + hash3(s, side + 2, 3) * 2.6),
        -0.3,
        0.44,
        0.36,
        4.2 + hash3(s, 4, 7) * 4.6,
        MIRROR_STONE,
        0.82,
      )
    }
  }

  /*
    And kelp, which is the only thing down here that is alive and still.

    Tapered blades leaning off the true, in clumps, close enough to the glass
    that they pass fast. They do not move — everything in these chunks is baked
    once and never touched again, which is what lets a kilometre of causeway be
    six draw calls — and it turns out not to matter at all, because the shoals
    and the silt in `Deepwater` are doing the moving and the eye is happy to
    lend that motion to anything nearby.
  */
  for (let s = MOONBREAK.deep.from + 90; s < MOONBREAK.deep.to - 80; s += 13) {
    const at = roadAt(track, s)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    const side = hash3(s, 3, 11) < 0.5 ? -1 : 1
    const out = at.width + vergeWidth(at.room) + 2.9
    for (let blade = 0; blade < 2; blade++) {
      const seed = s * 7 + blade
      const n = side * (out + hash3(seed, blade, 5) * 3.4)
      const high = 2.2 + hash3(seed, 2, blade) * 3.4
      /*
        Bent one way and then the other, rather than leaning straight over.
        A stalk that leans is a stick; a stalk with an S in it is something
        that has spent a long time being pushed about by water, and it is the
        only cue available for a current in a place where nothing moves.
      */
      const lean = (hash3(seed, 6, 1) - 0.5) * 2.6
      const stalk = Array.from({ length: 6 }, (_, index) => {
        const t = index / 5
        const sway = lean * t * t + Math.sin(t * 3.1 + seed) * 0.55 * t
        return roadPoint(at, n + sway, -0.35 + high * t, new Vector3(), frame)
      })
      addTube(meshes[chunkFor(s)], stalk, 0.16 + hash3(seed, 1, 1) * 0.1, blade % 2 ? KELP : KELP_DARK)
    }
  }

  let reedSeed = 1000
  for (let s = MOONBREAK.reeds.from + 12; s < MOONBREAK.reeds.to - 12; s += 11) {
    if (s > MOONBREAK.deep.from && s < MOONBREAK.deep.to) continue
    addReeds(meshes[chunkFor(s)], track, s, (reedSeed++ % 2) * 2 - 1, reedSeed)
  }

  for (const stone of track.gate) {
    const at = roadAt(track, stone.s)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    addBox(meshes[chunkFor(stone.s)], at, frame, stone.n, 0.02, 0.55, 0.42, 3.25, PALE_STONE)
  }

  return meshes.map((mesh, index) => {
    const geometry = mesh.build()
    if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere()
    return { ...spans[index], geometry }
  })
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vDirection;
  uniform float uDeep;
  uniform vec3 uFogColor;
  float hash(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDirection);
    float h = d.y * 0.5 + 0.5;
    vec3 horizon = vec3(0.20, 0.24, 0.34);
    vec3 zenith = vec3(0.025, 0.045, 0.10);
    vec3 colour = mix(horizon, zenith, smoothstep(0.22, 0.82, h));
    float stars = step(0.9992, hash(d * 460.0)) * smoothstep(0.5, 0.78, h);
    colour += vec3(0.72, 0.82, 1.0) * stars * 0.72;
    /*
      Under the water there is no sky, and what is behind everything instead is
      the fog — the exact same colour, not a colour chosen to look like it.

      -------------------------------------------------------------------------
      This was a hand-picked dark teal for about ten minutes and it drew a hard
      horizontal seam right across the middle of the Drowned Mile, at the line
      where the underside of the surface stopped and the dome behind it began.
      Everything in the scene fades to uFogColor at distance; the dome does
      not fade to anything, because it *is* the distance. So the only value it
      can possibly be is that one. Anything else is a join, and a join in the
      middle of the horizon is the first thing the eye finds.

      The stars go with it, and they go first: one star seen through twenty
      metres of water undoes the whole thing on its own.
      -------------------------------------------------------------------------
    */
    colour = mix(colour, uFogColor, uDeep);
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const WATER_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/*
  The same plane, from both sides, and they are not the same picture.

  From above it is what it always was: dark, with a moon-glint riding the
  ripples. From underneath it is the **ceiling of the world** — the only bright
  thing left, the place all the light is coming from, and the one direction
  that still has a sky behind it. Getting that right is most of what makes the
  Drowned Mile feel like being under something rather than inside something.

  Three things change when you go under. It gets much brighter, because you are
  now looking at a lit surface rather than at a dark one. It gains a hard
  bright disc where the moon is, smeared by the ripple, which is the single cue
  that says "that is the sky, and it is up there, and it is far away". And it
  goes almost totally reflective near the horizon — real water is a mirror from
  below past about forty-nine degrees, and that band of silvered nothing at the
  edges is what stops the surface reading as a flat blue lid.

  `uDeep` rather than a test on the camera's height, because the two mouths of
  the tube sit exactly *at* the waterline: keying off the camera would flip the
  whole surface between two very different pictures on the frame the car's nose
  crossed it, several times, while diving.
*/
const WATER_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vWorld;
  uniform float uTime;
  uniform float uDeep;
  uniform vec3 uMoon;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  void main() {
    float a = sin(vWorld.x * 0.055 + uTime * 0.42);
    float b = sin(vWorld.z * 0.071 - uTime * 0.31);
    float c = sin((vWorld.x + vWorld.z) * 0.025 + uTime * 0.18);
    float ripple = a * 0.35 + b * 0.28 + c * 0.37;
    float glint = pow(max(0.0, ripple * 0.5 + 0.5), 9.0);
    float thread = 1.0 - smoothstep(0.0, 0.055, abs(sin(vWorld.x * 0.08 + vWorld.z * 0.11 + uTime * 0.35)));

    // --- from above ---
    vec3 over = mix(vec3(0.035, 0.105, 0.14), vec3(0.18, 0.29, 0.38), glint * 0.72);
    over += vec3(0.15, 0.24, 0.28) * thread * 0.14;
    /*
      Opaque at distance, not transparent.

      This had it exactly backwards and it showed: the surface faded out with
      range, so the far half of the lake was a window and the drowned avenue
      nineteen metres below it came through as one dark fogged lump on the
      horizon — which read as an island, and gave away the whole surprise of
      the dive before you reached the mouth.

      Water does the opposite. Looked at from nearly edge-on it stops being a
      window and becomes a mirror, which is why you can see your feet in a pond
      and not the far bank. So the alpha *climbs* toward one with distance, and
      what is under the water stays under it until you are over it.
    */
    float overFade = 1.0 - smoothstep(30.0, 260.0, distance(cameraPosition, vWorld));
    float overAlpha = 1.0 - overFade * 0.34;

    /*
      --- from below ---

      The first version of this was a flat pale sheet and it was the single
      worst thing in the Drowned Mile: it filled the top half of the frame
      with one colour, which read as a painted lid rather than as a very large
      amount of water with a sky somewhere on the other side of it.

      Three things fix that, and all three are about *structure*.

      It is dark. Much darker than instinct says a lit ceiling should be —
      almost the colour of the fog — because what makes a surface read as
      bright is not its own value, it is having something dark beside it.

      It has a grain that runs the right way. The ripple is squeezed hard
      through a power curve so it is mostly dark with narrow bright veins in
      it, which is what light coming through moving water actually looks like
      from underneath, and it is what gives the ceiling a *direction*.

      And it goes away with distance. It is the one surface in the scene big
      enough to reach the fog on its own, so the far half of it dissolves into
      exactly the green everything else dissolves into, and the near half is
      the only part with any light in it. That is what puts a roof over the
      car instead of a wall in front of it.
    */
    vec3 toEye = cameraPosition - vWorld;
    float away = length(toEye);
    float flat_ = clamp(abs(normalize(toEye).y), 0.0, 1.0);
    // Past the critical angle the surface silvers over and stops being a window.
    float mirror = 1.0 - smoothstep(0.05, 0.42, flat_);
    // The moon, seen up through moving water.
    float toMoon = distance(vWorld.xz, uMoon.xz);
    float moon = smoothstep(240.0, 30.0, toMoon) * (0.4 + ripple * 0.6);
    // Narrow bright veins on a dark field, rather than an even glow.
    float veins = pow(max(0.0, ripple * 0.5 + 0.5), 3.4);
    float fine = pow(1.0 - smoothstep(0.0, 0.12, abs(sin(vWorld.x * 0.19 - vWorld.z * 0.13 + uTime * 0.5))), 2.0);

    vec3 under = vec3(0.014, 0.055, 0.066);
    under += vec3(0.10, 0.30, 0.33) * veins * 0.55;
    under += vec3(0.34, 0.62, 0.66) * fine * 0.30;
    under += vec3(0.80, 0.92, 0.95) * moon * moon * 0.85;
    // Silvered at grazing angles: the horizon of the water is a mirror, and a
    // mirror down here has almost nothing to reflect.
    under = mix(under, vec3(0.020, 0.062, 0.074), mirror * 0.8);

    // Into the murk, with the same numbers as everything else.
    float underFog = smoothstep(uFogNear, uFogFar, away);
    under = mix(under, uFogColor, underFog);
    float underAlpha = 1.0;

    vec3 colour = mix(over, under, uDeep);
    gl_FragColor = vec4(colour, mix(overAlpha, underAlpha, uDeep));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** The moon, which two shaders need to agree about. */
const MOON = new Vector3(-420, 245, 980)

/** Sky, moon and the water all the causeway pieces rise out of — or go under. */
export function MoonbreakWorld({ track }: { track: Track }) {
  const sky = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: BackSide,
        uniforms: { uDeep: { value: 0 }, uFogColor: { value: new Color('#04161c') } },
      }),
    [],
  )
  const water = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: 0 },
          uMoon: { value: MOON },
          uFogColor: { value: new Color('#04161c') },
          uFogNear: { value: 12 },
          uFogFar: { value: 78 },
        },
      }),
    [],
  )

  useEffect(() => () => {
    sky.dispose()
    water.dispose()
  }, [sky, water])

  useFrame((_, delta) => {
    water.uniforms.uTime.value += Math.min(0.05, delta)
    water.uniforms.uDeep.value = deep.at
    water.uniforms.uFogColor.value.copy(deep.fog)
    water.uniforms.uFogNear.value = deep.near
    water.uniforms.uFogFar.value = deep.far
    sky.uniforms.uDeep.value = deep.at
    sky.uniforms.uFogColor.value.copy(deep.fog)
  })

  return (
    <>
      <MoonbreakSound track={track} />
      <mesh frustumCulled={false} material={sky}>
        <sphereGeometry args={[2400, 28, 16]} />
      </mesh>
      <mesh position={[0, WATER_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false} material={water}>
        <planeGeometry args={[4200, 4200]} />
      </mesh>
      <mesh position={MOON.toArray()} frustumCulled={false}>
        <sphereGeometry args={[54, 24, 18]} />
        <meshBasicMaterial color="#d9dfd3" fog={false} />
      </mesh>
      <Deepwater track={track} />
    </>
  )
}
