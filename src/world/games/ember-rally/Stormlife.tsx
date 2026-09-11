/**
 * What the storm does to the mountain, and what grows and burns on it.
 *
 * ---------------------------------------------------------------------------
 * `stormLand` builds the ground. This is everything that stands on it or falls
 * out of the sky onto it, and all of it is placed by the ground or the road
 * rather than by a table of metres:
 *
 *   **the forest** — cedars on every slope below the cloud, thick near the road
 *   and thinning away from it, leaning in the gale. They were a few flat cones
 *   along the verge, and a forest of cones is a Christmas-tree lot.
 *
 *   **the lightning, as bolts** — the flash was the whole of it: the world went
 *   white and nothing in the sky caused it. A stroke you can see is the storm;
 *   one you cannot is a camera fault. Under the cloud they come down out of its
 *   base, and now and then onto the old lightning rod standing just ahead of
 *   you, which is what the rods are *for*. Above it they crawl through the top of
 *   the cloud sea, underneath you.
 *
 *   **the waterfalls, down the rock** — draped down the real face of the crag
 *   over each ford, with spray where they land and the water running on across
 *   the road. They were flat blue rectangles standing in the fog.
 *
 *   **the stormfire** at either end, which the finish avenue has always been
 *   walking you toward and which was never drawn.
 *
 * Everything that is lit reads the road's own light block — handed in as the
 * rock material — so a flash lights a cedar at the same instant as the stone.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { Fire } from '@/world/Fire'
import { useQuality } from '../../../systems/quality'
import { basisAt, roadPoint } from './geometry'
import { random } from './model'
import type { Mountain } from './stormLand'
import { CLOUD_BASE, CLOUD_TOP, STORMCROWN, emptyRoad, roadAt, vergeWidth, type Track } from './track'
import { storm } from './weather'

/*
  Under `?shot=1`, the storm is on the window, so a screenshot script can raise
  the flash and catch a bolt — a stroke lasts a few frames, and a still taken at
  a random moment almost never has one in it. The same switch that publishes the
  car to `window.__rally`; nothing reads this in play.
*/
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('shot') === '1') {
  ;(globalThis as unknown as Record<string, unknown>).__storm = storm
}

function hash(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

// ---------------------------------------------------------------------------
// The forest
// ---------------------------------------------------------------------------

const NEEDLE = new Color('#20392f')
const NEEDLE_TIP = new Color('#3a5a4b')
const BARK = new Color('#2e2724')

/**
 * One cedar, a unit tall: a trunk and five drooping tiers, each a ragged skirt
 * closed underneath. The rim of every tier is jagged and hangs lower than its
 * crown, which is what separates a conifer from a stack of lampshades.
 */
function cedarShape(): BufferGeometry {
  const position: number[] = []
  const color: number[] = []
  const index: number[] = []
  const push = (x: number, y: number, z: number, c: Color) => {
    position.push(x, y, z)
    color.push(c.r, c.g, c.b)
    return position.length / 3 - 1
  }

  // Trunk.
  const SIDES = 5
  const base = position.length / 3
  for (const [y, r] of [[-0.05, 0.028], [0.45, 0.016]] as const) {
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2
      push(Math.cos(a) * r, y, Math.sin(a) * r, BARK)
    }
  }
  for (let k = 0; k < SIDES; k++) {
    const next = (k + 1) % SIDES
    index.push(base + k, base + SIDES + k, base + SIDES + next, base + k, base + SIDES + next, base + next)
  }

  const TIERS = 5
  const RIM = 9
  for (let tier = 0; tier < TIERS; tier++) {
    const t = tier / (TIERS - 1)
    const y = 0.16 + t * 0.7
    const radius = 0.34 * (1 - t) + 0.07
    const tint = NEEDLE.clone().lerp(NEEDLE_TIP, 0.2 + t * 0.5)
    const crown = push(0, y + 0.2 - t * 0.04, 0, tint)
    const under = push(0, y - 0.03, 0, NEEDLE)
    const rim: number[] = []
    for (let k = 0; k < RIM; k++) {
      const a = (k / RIM) * Math.PI * 2 + tier
      const jag = k % 2 === 0 ? 1 : 0.72
      const r = radius * jag * (0.9 + hash(tier, k, 1) * 0.2)
      rim.push(push(Math.cos(a) * r, y - 0.06 * jag, Math.sin(a) * r, NEEDLE.clone().lerp(NEEDLE_TIP, jag * 0.4)))
    }
    for (let k = 0; k < RIM; k++) {
      const next = (k + 1) % RIM
      index.push(crown, rim[next], rim[k])
      index.push(under, rim[k], rim[next])
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(color), 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

const FOREST_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute vec3 iAt;
  attribute vec3 iShape;
  attribute float iTint;
  uniform float uClock;
  uniform float uWind;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    float c = cos(iShape.z);
    float s = sin(iShape.z);
    vec3 p = position;
    // Width is a share of the height: scaled by the share alone, a fifteen-metre
    // cedar came out thirty centimetres across — a forest of needles.
    vec3 local = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c) * vec3(iShape.x * iShape.y, iShape.x, iShape.x * iShape.y);
    // Leaning in the gale, the tops most, each tree out of step with the next.
    float gust = sin(uClock * 1.3 + iAt.x * 0.07 + iAt.z * 0.05) * 0.5 + 0.5;
    float lean = (0.25 + gust * 0.75) * uWind * p.y * p.y * 0.07 * iShape.x;
    local.x += lean;
    local.z += lean * 0.5;
    vec3 world = iAt + local;
    vNormal = normalize(vec3(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c));
    vColor = aColor * (0.82 + iTint * 0.36);
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/*
  The road's light, cut down to what a tree needs: the fill (which carries the
  lightning), one headlamp cone for the trees at the edge of the road, and the
  fog. Written out rather than borrowed from the rock shader because that one is
  built for surfaces with per-vertex wetness and veins, and a forest has neither.
*/
const FOREST_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uHeadLeft;
  uniform vec3 uHeadDir;
  uniform float uHeadPower;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vec3 n = normalize(vNormal);
    float up = n.y * 0.5 + 0.5;
    vec3 colour = vColor * uAmbient * (0.35 + 0.65 * up);
    vec3 toLamp = uHeadLeft - vWorld;
    float dist = length(toLamp);
    vec3 dir = toLamp / max(dist, 0.001);
    float cone = smoothstep(0.55, 0.92, dot(-dir, uHeadDir));
    colour += vColor * vec3(1.0, 0.84, 0.62) * cone * uHeadPower * (0.45 + 0.55 * max(0.0, dot(n, dir))) / (1.0 + dist * dist * 0.0021);
    colour = mix(colour, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

interface Grove {
  geometry: InstancedBufferGeometry
  centre: Vector3
  radius: number
}

/** Metres a side of one grove of instances, which is what gets culled. */
const GROVE = 140

/**
 * Where the forest grows: below the cloud, off the road, not on cliffs, thick
 * near the road and thinning with distance, and thinned again by the quality
 * tier with a hash of each tree rather than a different random stream, so a
 * phone has the same trees as a laptop, only fewer.
 */
function plantForest(track: Track, mountain: Mountain, share: number): Grove[] {
  const shape = cedarShape()
  const road = emptyRoad()
  // A coarse map of how far every cell is from the road.
  const CELL = 16
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < track.x.length; i += 8) {
    minX = Math.min(minX, track.x[i])
    maxX = Math.max(maxX, track.x[i])
    minZ = Math.min(minZ, track.z[i])
    maxZ = Math.max(maxZ, track.z[i])
  }
  // Far enough to be a forest round the road, not so far that a phone draws a valley of it.
  const REACH = 170
  const x0 = minX - REACH
  const z0 = minZ - REACH
  const nx = Math.ceil((maxX - minX + REACH * 2) / CELL) + 1
  const nz = Math.ceil((maxZ - minZ + REACH * 2) / CELL) + 1
  const near = new Float32Array(nx * nz).fill(Infinity)
  const wallNear = new Float32Array(nx * nz).fill(6)
  for (let s = 0; s < track.length; s += 8) {
    roadAt(track, s, road)
    const wall = road.width + vergeWidth(road.room)
    const ci = Math.round((road.x - x0) / CELL)
    const cj = Math.round((road.z - z0) / CELL)
    const r = Math.ceil(REACH / CELL)
    for (let j = Math.max(0, cj - r); j <= Math.min(nz - 1, cj + r); j++) {
      for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) {
        const d = Math.hypot(x0 + i * CELL - road.x, z0 + j * CELL - road.z)
        const k = j * nx + i
        if (d < near[k]) {
          near[k] = d
          wallNear[k] = wall
        }
      }
    }
  }
  const distanceAt = (x: number, z: number) => {
    const i = Math.max(0, Math.min(nx - 1, Math.round((x - x0) / CELL)))
    const j = Math.max(0, Math.min(nz - 1, Math.round((z - z0) / CELL)))
    return [near[j * nx + i], wallNear[j * nx + i]]
  }

  const rng = random(track.seed ^ 0x3ed4)
  const groves = new Map<string, { at: number[]; shape: number[]; tint: number[] }>()
  const cloudFloor = CLOUD_BASE + 4
  const STEP = 8
  for (let z = minZ - REACH; z < maxZ + REACH; z += STEP) {
    for (let x = minX - REACH; x < maxX + REACH; x += STEP) {
      const jx = x + (rng() - 0.5) * STEP
      const jz = z + (rng() - 0.5) * STEP
      const roll = rng()
      const [d, wall] = distanceAt(jx, jz)
      if (d > REACH || d < wall + 5) continue
      const keep = (d < 50 ? 0.5 : 0.5 - (d - 50) / 300) * share
      if (roll > keep || hash(Math.round(jx), Math.round(jz), 5) > 0.8 + share * 0.2) continue
      const y = mountain.heightAt(jx, jz)
      if (y > cloudFloor || mountain.slopeAt(jx, jz) > 0.95) continue
      const key = `${Math.floor(jx / GROVE)},${Math.floor(jz / GROVE)}`
      let grove = groves.get(key)
      if (!grove) {
        grove = { at: [], shape: [], tint: [] }
        groves.set(key, grove)
      }
      grove.at.push(jx, y - 0.4, jz)
      grove.shape.push(9 + rng() * 10, 0.8 + rng() * 0.35, rng() * Math.PI * 2)
      grove.tint.push(rng())
    }
  }

  const out: Grove[] = []
  for (const grove of groves.values()) {
    const count = grove.at.length / 3
    const geometry = new InstancedBufferGeometry()
    geometry.index = shape.index
    geometry.setAttribute('position', shape.getAttribute('position'))
    geometry.setAttribute('normal', shape.getAttribute('normal'))
    geometry.setAttribute('aColor', shape.getAttribute('aColor'))
    geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(grove.at), 3))
    geometry.setAttribute('iShape', new InstancedBufferAttribute(new Float32Array(grove.shape), 3))
    geometry.setAttribute('iTint', new InstancedBufferAttribute(new Float32Array(grove.tint), 1))
    geometry.instanceCount = count
    const centre = new Vector3()
    let top = 0
    for (let i = 0; i < count; i++) {
      centre.x += grove.at[i * 3]
      centre.y += grove.at[i * 3 + 1]
      centre.z += grove.at[i * 3 + 2]
      top = Math.max(top, grove.shape[i * 3])
    }
    centre.divideScalar(count)
    const radius = GROVE * 0.72 + top
    geometry.boundingSphere = new Sphere(centre.clone(), radius)
    out.push({ geometry, centre, radius })
  }
  return out
}

// ---------------------------------------------------------------------------
// Lightning
// ---------------------------------------------------------------------------

/** How many pieces of bolt can be drawn at once. */
const SEGMENTS = 140

const BOLT_VERT = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec3 aCorner;
  varying float vAcross;
  varying float vBright;
  void main() {
    vec3 p = mix(aFrom, aTo, aCorner.x);
    vec3 along = normalize(aTo - aFrom + vec3(0.0, 0.00001, 0.0));
    vec3 toCamera = normalize(cameraPosition - p);
    vec3 side = normalize(cross(along, toCamera) + vec3(0.00001, 0.0, 0.0));
    // Never thinner than about two pixels, or a far stroke flickers out between frames.
    float width = max(aCorner.z, distance(cameraPosition, p) * 0.003);
    vAcross = aCorner.y;
    vBright = aCorner.z > 0.0 ? 1.0 : 0.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(p + side * aCorner.y * width, 1.0);
  }
`

const BOLT_FRAG = /* glsl */ `
  precision highp float;
  uniform float uFlash;
  varying float vAcross;
  varying float vBright;
  void main() {
    float core = 1.0 - smoothstep(0.0, 0.35, abs(vAcross));
    float glow = 1.0 - smoothstep(0.2, 1.0, abs(vAcross));
    vec3 colour = vec3(0.85, 0.9, 1.0) * core * 3.0 + vec3(0.45, 0.5, 0.95) * glow * 0.8;
    gl_FragColor = vec4(colour * uFlash * vBright, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function boltGeometry(): BufferGeometry {
  const from = new Float32Array(SEGMENTS * 4 * 3)
  const to = new Float32Array(SEGMENTS * 4 * 3)
  const corner = new Float32Array(SEGMENTS * 4 * 3)
  const index: number[] = []
  for (let i = 0; i < SEGMENTS; i++) {
    const base = i * 4
    const corners = [[0, -1], [1, -1], [1, 1], [0, 1]]
    corners.forEach(([x, y], k) => {
      corner[(base + k) * 3] = x
      corner[(base + k) * 3 + 1] = y
    })
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('aFrom', new BufferAttribute(from, 3))
  geometry.setAttribute('aTo', new BufferAttribute(to, 3))
  geometry.setAttribute('aCorner', new BufferAttribute(corner, 3))
  // Three.js draws by position; the shader never reads it.
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(SEGMENTS * 4 * 3), 3))
  geometry.setIndex(index)
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

/**
 * Lay a jagged stroke from `a` to `b` into the geometry, with a couple of
 * branches off it, starting at segment `first`. Returns the next free segment.
 */
function layStroke(geometry: BufferGeometry, a: Vector3, b: Vector3, width: number, first: number, branches: number): number {
  const from = geometry.getAttribute('aFrom') as BufferAttribute
  const to = geometry.getAttribute('aTo') as BufferAttribute
  const corner = geometry.getAttribute('aCorner') as BufferAttribute
  const points: Vector3[] = [a.clone(), b.clone()]
  const length = a.distanceTo(b)
  // Midpoint displacement: each pass halves the pieces and the wander.
  for (let pass = 0, wander = length * 0.22; pass < 5; pass++, wander *= 0.52) {
    const next: Vector3[] = [points[0]]
    for (let i = 1; i < points.length; i++) {
      const mid = points[i - 1].clone().lerp(points[i], 0.5)
      mid.x += (Math.random() - 0.5) * wander
      mid.y += (Math.random() - 0.5) * wander * 0.4
      mid.z += (Math.random() - 0.5) * wander
      next.push(mid, points[i])
    }
    points.splice(0, points.length, ...next)
  }
  let segment = first
  for (let i = 1; i < points.length && segment < SEGMENTS; i++, segment++) {
    const taper = width * (1 - (i / points.length) * 0.5)
    for (let k = 0; k < 4; k++) {
      const v = segment * 4 + k
      from.setXYZ(v, points[i - 1].x, points[i - 1].y, points[i - 1].z)
      to.setXYZ(v, points[i].x, points[i].y, points[i].z)
      corner.setZ(v, taper)
    }
  }
  for (let b2 = 0; b2 < branches && segment < SEGMENTS - 8; b2++) {
    const at = points[Math.floor(points.length * (0.2 + Math.random() * 0.5))]
    const end = at.clone().add(new Vector3((Math.random() - 0.5) * length * 0.4, -length * (0.1 + Math.random() * 0.2), (Math.random() - 0.5) * length * 0.4))
    segment = layStroke(geometry, at, end, width * 0.45, segment, 0)
  }
  return segment
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

const FALL_VERT = /* glsl */ `
  attribute vec2 aFlow;
  varying vec2 vFlow;
  varying vec3 vWorld;
  void main() {
    vFlow = aFlow;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/*
  White water, in threads that each fall at their own pace, softer at the edges
  of the fall, and thicker toward the foot where it has gathered. aFlow.x runs
  across the fall, aFlow.y from the lip (0) to the road (1); past 1 it is the
  sheet running on across the stone.
*/
const FALL_FRAG = /* glsl */ `
  precision highp float;
  uniform float uClock;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFlash;
  varying vec2 vFlow;
  varying vec3 vWorld;
  float hash11(float x) { return fract(sin(x * 91.7 + 3.1) * 43758.5453); }
  void main() {
    float across = vFlow.x * 9.0;
    float lane = floor(across);
    float within = fract(across);
    float thread = smoothstep(0.0, 0.5, within) * (1.0 - smoothstep(0.5, 1.0, within));
    float pace = 1.2 + hash11(lane) * 1.1;
    float flow = fract(vFlow.y * 3.0 - uClock * pace + hash11(lane * 7.3));
    float streak = 0.45 + 0.55 * smoothstep(0.0, 0.5, flow) * (1.0 - smoothstep(0.5, 1.0, flow));
    float sides = smoothstep(0.0, 0.18, vFlow.x) * (1.0 - smoothstep(0.82, 1.0, vFlow.x));
    float foot = smoothstep(0.75, 1.0, vFlow.y);
    float alpha = sides * (0.22 + thread * streak * 0.55 + foot * 0.15);
    vec3 colour = vec3(0.58, 0.64, 0.68) * (0.55 + thread * streak * 0.8 + foot * 0.3) + vec3(0.6, 0.66, 0.75) * uFlash * 0.5;
    float fog = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vWorld));
    gl_FragColor = vec4(mix(colour, uFogColor, fog), alpha * (1.0 - fog * 0.8));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Each fall draped down the ground above its ford, then run across the road. */
function buildFalls(track: Track, mountain: Mountain): BufferGeometry {
  const position: number[] = []
  const flow: number[] = []
  const index: number[] = []
  const road = emptyRoad()
  const point = new Vector3()
  STORMCROWN.waterfalls.forEach((s, fallIndex) => {
    const side = fallIndex % 2 === 0 ? -1 : 1
    const half = 2.4 + fallIndex * 0.6
    const STEPS = 16
    const start = position.length / 3
    /*
      Down the face only. A sheet run on across the road went in too and came out
      as broad grey stripes over the bottom of the frame at every ford; the road
      there is already at its wettest, and the shine on it says water better.
    */
    const rowsTotal = STEPS + 1
    for (let r = 0; r < rowsTotal; r++) {
      for (const [along, u] of [[-half, 0], [half, 1]] as const) {
        roadAt(track, s + along, road)
        const basis = basisAt(road)
        const wall = road.width + vergeWidth(road.room)
        // From well up the crag to the edge of the road.
        const t = r / STEPS
        const n = side * (wall + 34 * (1 - t) + 0.6)
        roadPoint(road, n, 0, point, basis)
        const ground = r === STEPS ? road.y + 0.12 : mountain.heightAt(point.x, point.z) + 0.35
        position.push(point.x, ground, point.z)
        flow.push(u, t)
      }
    }
    for (let r = 0; r < rowsTotal - 1; r++) {
      const a = start + r * 2
      index.push(a, a + 2, a + 3, a, a + 3, a + 1)
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('aFlow', new BufferAttribute(new Float32Array(flow), 2))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return geometry
}

const SPRAY_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute float iSeed;
  uniform float uClock;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    vUv = uv;
    float t = fract(uClock * (0.35 + iSeed * 0.3) + iSeed);
    vLife = sin(t * 3.14159);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float size = 2.0 + t * 3.5;
    vec3 centre = iAt + vec3(sin(iSeed * 40.0) * t * 1.6, t * 2.2, cos(iSeed * 40.0) * t * 1.6);
    gl_Position = projectionMatrix * viewMatrix * vec4(centre + (right * position.x + up * position.y) * size, 1.0);
  }
`

const SPRAY_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vec3(0.55, 0.62, 0.66), pow(1.0 - r, 2.0) * vLife * 0.16);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function buildSpray(track: Track): InstancedBufferGeometry {
  const base = new PlaneGeometry(1, 1)
  const geometry = new InstancedBufferGeometry()
  geometry.index = base.index
  geometry.setAttribute('position', base.getAttribute('position'))
  geometry.setAttribute('uv', base.getAttribute('uv'))
  const at: number[] = []
  const seed: number[] = []
  const road = emptyRoad()
  const point = new Vector3()
  STORMCROWN.waterfalls.forEach((s, fallIndex) => {
    const side = fallIndex % 2 === 0 ? -1 : 1
    for (let k = 0; k < 7; k++) {
      roadAt(track, s + (hash(fallIndex, k, 1) - 0.5) * 5, road)
      roadPoint(road, side * (road.width + vergeWidth(road.room) + hash(fallIndex, k, 2) * 2), 0.3, point, basisAt(road))
      at.push(point.x, point.y, point.z)
      seed.push(hash(fallIndex, k, 3))
    }
  })
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 3))
  geometry.setAttribute('iSeed', new InstancedBufferAttribute(new Float32Array(seed), 1))
  geometry.instanceCount = seed.length
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  base.dispose()
  return geometry
}

// ---------------------------------------------------------------------------

export function Stormlife({ track, mountain, rock }: { track: Track; mountain: Mountain; rock: ShaderMaterial }) {
  const tier = useQuality((q) => q.tier)
  const share = tier === 'low' ? 0.45 : tier === 'medium' ? 0.75 : 1
  const groves = useMemo(() => plantForest(track, mountain, share), [track, mountain, share])
  const bolt = useMemo(() => boltGeometry(), [])
  const falls = useMemo(() => buildFalls(track, mountain), [track, mountain])
  const spray = useMemo(() => buildSpray(track), [track])
  const groveRefs = useRef<Mesh[]>([])

  const materials = useMemo(() => {
    const u = rock.uniforms
    return {
      forest: new ShaderMaterial({
        vertexShader: FOREST_VERT,
        fragmentShader: FOREST_FRAG,
        uniforms: {
          uClock: { value: 0 },
          uWind: { value: 0 },
          uAmbient: u.uAmbient,
          uFogColor: u.uFogColor,
          uFogNear: u.uFogNear,
          uFogFar: u.uFogFar,
          uHeadLeft: u.uHeadLeft,
          uHeadDir: u.uHeadDir,
          uHeadPower: u.uHeadPower,
        },
      }),
      bolt: new ShaderMaterial({
        vertexShader: BOLT_VERT,
        fragmentShader: BOLT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uFlash: { value: 0 } },
      }),
      fall: new ShaderMaterial({
        vertexShader: FALL_VERT,
        fragmentShader: FALL_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uClock: { value: 0 },
          uFlash: { value: 0 },
          uFogColor: u.uFogColor,
          uFogNear: u.uFogNear,
          uFogFar: u.uFogFar,
        },
      }),
      spray: new ShaderMaterial({
        vertexShader: SPRAY_VERT,
        fragmentShader: SPRAY_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: { uClock: { value: 0 } },
      }),
    }
  }, [rock])

  useEffect(() => () => groves.forEach((grove) => grove.geometry.dispose()), [groves])
  useEffect(() => () => bolt.dispose(), [bolt])
  useEffect(() => () => falls.dispose(), [falls])
  useEffect(() => () => spray.dispose(), [spray])
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  const hearths = useMemo(() => {
    const road = emptyRoad()
    return track.hearths.map((hearth) => {
      roadAt(track, hearth.s, road)
      return roadPoint(road, hearth.n, 0.1, new Vector3(), basisAt(road)).toArray() as [number, number, number]
    })
  }, [track])

  const clock = useRef(0)
  const lastFlash = useRef(0)
  const boltMesh = useRef<Mesh>(null)
  const rodPoint = useMemo(() => new Vector3(), [])
  const ahead = useMemo(() => new Vector3(), [])

  useFrame(({ camera }, delta) => {
    const step = Math.min(0.05, delta)
    clock.current += step
    const far = rock.uniforms.uFogFar.value as number

    materials.forest.uniforms.uClock.value = clock.current
    materials.forest.uniforms.uWind.value = storm.wind
    for (let i = 0; i < groves.length; i++) {
      const mesh = groveRefs.current[i]
      if (!mesh) continue
      const grove = groves[i]
      mesh.visible = camera.position.distanceTo(grove.centre) - grove.radius < far && storm.above < 0.6
    }

    materials.fall.uniforms.uClock.value = clock.current
    materials.fall.uniforms.uFlash.value = storm.flash
    materials.spray.uniforms.uClock.value = clock.current

    /*
      A new stroke is a sharp rise in the flash — the same test the soundscape
      uses, so the bolt, the light and the thunder are one event.
    */
    if (storm.flash > lastFlash.current + 0.16 && storm.flash > 0.32 && storm.inCloud < 0.6) {
      const position = bolt.getAttribute('aFrom') as BufferAttribute
      const corner = bolt.getAttribute('aCorner') as BufferAttribute
      for (let v = 0; v < SEGMENTS * 4; v++) corner.setZ(v, 0)
      let used = 0
      /*
        Somewhere you can see. The first cut threw strokes at any bearing, and
        most of them landed behind the camera or behind the hillside the road was
        bending round — a flash with nothing in the sky to cause it, which is the
        thing the bolts were built to stop.
      */
      camera.getWorldDirection(ahead)
      ahead.y = 0
      ahead.normalize()
      const facing = Math.atan2(ahead.x, ahead.z)
      if (storm.above > 0.5) {
        // Above the weather: a stroke crawling through the top of the cloud sea, below you.
        const bearing = facing + (Math.random() - 0.5) * 1.6
        const out = 300 + Math.random() * 500
        const start = new Vector3(camera.position.x + Math.sin(bearing) * out, CLOUD_TOP - 6, camera.position.z + Math.cos(bearing) * out)
        const end = start.clone().add(new Vector3((Math.random() - 0.5) * 260, -20 - Math.random() * 20, (Math.random() - 0.5) * 260))
        used = layStroke(bolt, start, end, 1.8, 0, 3)
      } else {
        const road = emptyRoad()
        const rods = STORMCROWN.lightningRods.filter((s) => s > storm.s + 30 && s < storm.s + 260)
        let end: Vector3 | null = null
        if (rods.length && Math.random() < 0.5) {
          // Onto the rod standing just ahead, which is what it is there for — if it is in view.
          const s = rods[0]
          roadAt(track, s, road)
          const side = Math.floor(s / 100) % 2 === 0 ? -1 : 1
          const rod = roadPoint(road, side * (road.width + 2.2), 5.8, rodPoint, basisAt(road))
          const toward = rod.clone().sub(camera.position).setY(0).normalize()
          if (toward.dot(ahead) > 0.55) end = rod.clone()
        }
        if (!end) {
          const bearing = facing + (Math.random() - 0.5) * 1.1
          const out = 110 + Math.random() * 220
          const x = camera.position.x + Math.sin(bearing) * out
          const z = camera.position.z + Math.cos(bearing) * out
          end = new Vector3(x, mountain.heightAt(x, z), z)
        }
        const start = end.clone().add(new Vector3((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80))
        start.y = Math.max(end.y + 45, CLOUD_BASE)
        used = layStroke(bolt, start, end, 1.3, 0, 3)
      }
      position.needsUpdate = true
      ;(bolt.getAttribute('aTo') as BufferAttribute).needsUpdate = true
      corner.needsUpdate = true
      bolt.setDrawRange(0, used * 6)
    }
    lastFlash.current = storm.flash
    materials.bolt.uniforms.uFlash.value = storm.flash
    if (boltMesh.current) boltMesh.current.visible = storm.flash > 0.02
  })

  return (
    <>
      {groves.map((grove, i) => (
        <mesh
          key={`grove-${i}`}
          ref={(node) => {
            if (node) groveRefs.current[i] = node
          }}
          geometry={grove.geometry}
          material={materials.forest}
        />
      ))}
      <mesh ref={boltMesh} geometry={bolt} material={materials.bolt} frustumCulled={false} renderOrder={5} />
      <mesh geometry={falls} material={materials.fall} renderOrder={2} />
      <mesh geometry={spray} material={materials.spray} frustumCulled={false} renderOrder={3} />
      {hearths.map((at, i) => (
        <Fire
          key={`stormfire-${i}`}
          position={at}
          height={i === hearths.length - 1 ? 4.2 : 3}
          width={i === hearths.length - 1 ? 2.1 : 1.5}
          intensity={0}
          night={0}
        />
      ))}
    </>
  )
}
