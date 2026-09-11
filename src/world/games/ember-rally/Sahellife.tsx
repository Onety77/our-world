/**
 * What lives on the Harmattan, and what the wind does to it.
 *
 * ---------------------------------------------------------------------------
 * `harmattanLand` builds the ground and `Harmattan.tsx` builds everything
 * people made. This is everything else — the things that grow, walk, fly and
 * blow — and it is the difference between a set and a place. The road had a
 * wind that was only ever heard: nothing on screen moved in it but the dust in
 * front of your face.
 *
 *   **the trees and the grass.** Acacias, flat-topped, standing alone on the
 *   plain the way they do — the winter thorn is the one tree in the Sahel that
 *   comes *into* leaf in harmattan, which is why it is the only real green on
 *   the road. Grey-green bush between them, and last season's grass standing in
 *   straw-coloured tufts that all lean the same way;
 *
 *   **the banners, as cloth.** They were stiff blue planks. Now they fly: one
 *   steady wind, a slow swing and a flutter running down the cloth, harder where
 *   the road is exposed — and dyed, with the resist-pattern circles of adire,
 *   because indigo on this road is always something somebody made;
 *
 *   **the caravans.** Camels on the plain beside the Red Mile, on the way to
 *   the Kofar Dutse gate, and down on the flat under the scarp — pacing, as
 *   camels do, both legs on one side together, some carrying riders veiled in
 *   indigo. Kano was the southern end of the trans-Saharan road; this is the
 *   harmattan's own traffic;
 *
 *   **the vultures**, turning over the ruin, the wadi and the scarp;
 *
 *   **dust devils**, rising off the open ground ahead and walking downwind;
 *
 *   **cooking smoke** from the compounds, bent flat by the same wind; and
 *
 *   **fire**, at both hearths and in the caster's furnace at the top.
 *
 * Everything lit reads the road's own light block — handed in as the rock
 * material — so the town's shade and the haze fall on a camel exactly as they
 * fall on the wall it walks past. Nothing is on the road, and nothing is solid.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { Fire } from '@/world/Fire'
import { useQuality } from '../../../systems/quality'
import { dust } from './dust'
import { basisAt, roadPoint, type RoadBasis } from './geometry'
import { harmattanVerge, landFor, type Land } from './harmattanLand'
import { random } from './model'
import { HARMATTAN, STEP, emptyRoad, roadAt, vergeWidth, type Track } from './track'

/** The screenshot switch that also publishes the car to `window.__rally`. Nothing reads what it publishes in play. */
const SHOT = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shot') === '1'

/** Where the harmattan blows toward, across the whole road: down off the Sahara, one way, for six weeks. */
const WIND_X = 0.6
const WIND_Z = -0.8

/** The same hash `Harmattan.tsx` places its banner poles with, so the cloth lands on the poles. */
function hash3(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

const smooth = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

const flatBasis = (): RoadBasis => ({ fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

type Point = [number, number, number]

/** A little mesh builder with the two extra channels a walking camel needs. */
class Shape {
  readonly position: number[] = []
  readonly color: number[] = []
  readonly swing: number[] = []
  readonly rider: number[] = []
  readonly index: number[] = []
  /** Written into every vertex added while set: which way the limb swings, and the height of its joint. */
  swingNow: [number, number] = [0, 0]
  riderNow = 0

  vertex(x: number, y: number, z: number, c: Color): number {
    this.position.push(x, y, z)
    this.color.push(c.r, c.g, c.b)
    this.swing.push(this.swingNow[0], this.swingNow[1])
    this.rider.push(this.riderNow)
    return this.position.length / 3 - 1
  }

  tri(a: number, b: number, c: number) {
    this.index.push(a, b, c)
  }

  /** A tapered tube from `a` to `b`, capped at `b`. */
  tube(a: Point, b: Point, ra: number, rb: number, sides: number, c: Color) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const dz = b[2] - a[2]
    const length = Math.hypot(dx, dy, dz) || 1
    const d = [dx / length, dy / length, dz / length]
    const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    let ux = d[1] * ref[2] - d[2] * ref[1]
    let uy = d[2] * ref[0] - d[0] * ref[2]
    let uz = d[0] * ref[1] - d[1] * ref[0]
    const ul = Math.hypot(ux, uy, uz) || 1
    ux /= ul
    uy /= ul
    uz /= ul
    const wx = d[1] * uz - d[2] * uy
    const wy = d[2] * ux - d[0] * uz
    const wz = d[0] * uy - d[1] * ux
    const base = this.position.length / 3
    for (const [p, r] of [[a, ra], [b, rb]] as const) {
      for (let k = 0; k < sides; k++) {
        const t = (k / sides) * Math.PI * 2
        const cs = Math.cos(t) * r
        const sn = Math.sin(t) * r
        this.vertex(p[0] + ux * cs + wx * sn, p[1] + uy * cs + wy * sn, p[2] + uz * cs + wz * sn, c)
      }
    }
    for (let k = 0; k < sides; k++) {
      const n = (k + 1) % sides
      this.index.push(base + k, base + sides + k, base + sides + n, base + k, base + sides + n, base + n)
    }
    for (let k = 1; k < sides - 1; k++) this.index.push(base + sides, base + sides + k + 1, base + sides + k)
  }

  /** An ellipsoid. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: Color, rings = 4, sides = 7, jitter = 0, seed = 0) {
    const base = this.position.length / 3
    for (let i = 0; i <= rings; i++) {
      const phi = -Math.PI / 2 + (i / rings) * Math.PI
      const y = cy + Math.sin(phi) * ry
      const r = Math.cos(phi)
      for (let k = 0; k < sides; k++) {
        const t = (k / sides) * Math.PI * 2
        const lump = 1 + (hash3(seed, i, k) - 0.5) * jitter
        this.vertex(cx + Math.cos(t) * r * rx * lump, y, cz + Math.sin(t) * r * rz * lump, c)
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let k = 0; k < sides; k++) {
        const a = base + i * sides + k
        const b = base + i * sides + ((k + 1) % sides)
        this.index.push(a, a + sides, b + sides, a, b + sides, b)
      }
    }
  }

  build(upright = false): BufferGeometry {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3))
    geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(this.color), 3))
    geometry.setAttribute('aSwing', new BufferAttribute(new Float32Array(this.swing), 2))
    geometry.setAttribute('aRider', new BufferAttribute(new Float32Array(this.rider), 1))
    geometry.setIndex(this.index)
    if (upright) {
      // Grass is lit like the ground it stands in, not like a row of blades edge-on to the sun.
      const normal = new Float32Array(this.position.length)
      for (let i = 1; i < normal.length; i += 3) normal[i] = 1
      geometry.setAttribute('normal', new BufferAttribute(normal, 3))
    } else {
      geometry.computeVertexNormals()
    }
    return geometry
  }
}

const BARK = new Color('#5c4f45')
/** Winter thorn in leaf: the one real green on the road, and still a dusty one. */
const LEAF = new Color('#7d7c55')
const LEAF_RIM = new Color('#6c6b49')
const LEAF_UNDER = new Color('#4d4a35')
/*
  Darker and greener than the ground by a clear step. Paler, they came out the
  same value as the dust with flat facets, and a field of them read as rocks.
*/
const BUSH = new Color('#5f5f44')
const BUSH_DRY = new Color('#766c52')
const GRASS_FOOT = new Color('#8e7b58')
const GRASS_TIP = new Color('#cdb98d')

/**
 * An acacia, a unit tall: a leaning trunk, three limbs forking up and out, and
 * a flat umbrella of crown with smaller umbrellas under its rim. Wider than it
 * is tall, and flat on top — that one shape is the savanna.
 */
function acaciaShape(): BufferGeometry {
  const s = new Shape()
  s.tube([0, -0.05, 0], [0.05, 0.42, 0.02], 0.034, 0.022, 5, BARK)
  const umbrella = (cx: number, cz: number, radius: number, under: number, over: number, seed: number) => {
    const RIM = 11
    const crown = s.vertex(cx, over, cz, LEAF)
    const belly = s.vertex(cx, under, cz, LEAF_UNDER)
    const top: number[] = []
    const bottom: number[] = []
    for (let k = 0; k < RIM; k++) {
      const a = (k / RIM) * Math.PI * 2 + hash3(seed, k, 1) * 0.3
      const r = radius * (0.8 + hash3(seed, k, 2) * 0.35)
      const y = (under + over) * 0.5 - 0.015 + hash3(seed, k, 3) * 0.03
      top.push(s.vertex(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, LEAF_RIM))
      bottom.push(s.vertex(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, LEAF_UNDER))
    }
    for (let k = 0; k < RIM; k++) {
      const next = (k + 1) % RIM
      s.tri(crown, top[next], top[k])
      s.tri(belly, bottom[k], bottom[next])
    }
  }
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.4
    const tx = 0.05 + Math.cos(a) * 0.3
    const tz = 0.02 + Math.sin(a) * 0.3
    s.tube([0.05, 0.4, 0.02], [tx, 0.74, tz], 0.02, 0.011, 4, BARK)
    umbrella(tx * 1.2, tz * 1.2, 0.36, 0.72, 0.8, k + 10)
  }
  umbrella(0.05, 0.02, 0.74, 0.8, 0.9, 3)
  return s.build()
}

/** A grey-green bush, a unit tall: two lumps. */
function bushShape(): BufferGeometry {
  const s = new Shape()
  // Three rounded lumps, not two faceted ones: a bush is a mass with a soft edge.
  // A hundred triangles, not a hundred and sixty: bushes were the heaviest thing in the frame.
  s.blob(0, 0.45, 0, 0.55, 0.52, 0.5, BUSH, 3, 7, 0.22, 1)
  s.blob(0.4, 0.32, 0.18, 0.38, 0.36, 0.36, BUSH_DRY, 3, 6, 0.22, 2)
  s.blob(-0.32, 0.28, -0.24, 0.32, 0.3, 0.3, BUSH, 2, 6, 0.22, 3)
  return s.build()
}

/** A tuft of dry grass, a unit tall: seven blades fanning out. */
function tuftShape(): BufferGeometry {
  const s = new Shape()
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + hash3(k, 3, 1) * 0.6
    const lean = 0.12 + hash3(k, 3, 2) * 0.22
    const tall = 0.6 + hash3(k, 3, 3) * 0.4
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    const foot = s.vertex(cx * 0.04 - cz * 0.035, 0, cz * 0.04 + cx * 0.035, GRASS_FOOT)
    const foot2 = s.vertex(cx * 0.04 + cz * 0.035, 0, cz * 0.04 - cx * 0.035, GRASS_FOOT)
    const tip = s.vertex(cx * lean, tall, cz * lean, GRASS_TIP)
    s.tri(foot, foot2, tip)
  }
  return s.build(true)
}

const COAT = new Color('#b39776')
const COAT_DARK = new Color('#8c7359')
const ROBE = new Color('#27396b')
const VEIL = new Color('#1d2a52')

/**
 * A dromedary, in metres, facing +x, with or without a rider.
 *
 * The legs carry which way they swing and where their joint is; the rider's
 * parts are marked so a camel with no rider folds them away. Camels *pace* —
 * both legs on one side move together — and that rolling, side-to-side walk is
 * most of what makes a line of them read as camels rather than as horses.
 */
function camelShape(): BufferGeometry {
  const s = new Shape()
  s.blob(0, 1.38, 0, 0.8, 0.36, 0.34, COAT, 4, 8)
  s.blob(-0.06, 1.72, 0, 0.44, 0.33, 0.27, COAT, 3, 7)
  // The neck dips before it rises: the swan-neck is the silhouette.
  s.tube([0.64, 1.45, 0], [1.02, 1.16, 0], 0.19, 0.14, 6, COAT)
  s.tube([1.02, 1.16, 0], [1.28, 1.55, 0], 0.14, 0.11, 6, COAT)
  s.tube([1.28, 1.55, 0], [1.36, 1.88, 0], 0.11, 0.1, 6, COAT)
  s.tube([1.3, 1.92, 0], [1.74, 1.78, 0], 0.12, 0.07, 6, COAT)
  s.tube([-0.78, 1.42, 0], [-0.88, 0.95, 0], 0.04, 0.02, 4, COAT_DARK)
  for (const [x, z] of [[0.52, 0.2], [0.52, -0.2], [-0.5, 0.22], [-0.5, -0.22]]) {
    s.swingNow = [z > 0 ? 1 : -1, 1.18]
    s.tube([x, 1.22, z], [x + 0.03, 0.56, z], 0.085, 0.06, 5, COAT)
    s.tube([x + 0.03, 0.56, z], [x, 0, z], 0.055, 0.045, 5, COAT_DARK)
    s.swingNow = [0, 0]
  }
  // The rider: a robe, a veil, and legs down the camel's shoulder.
  s.riderNow = 1
  s.tube([-0.12, 1.9, 0], [-0.06, 2.55, 0], 0.3, 0.15, 7, ROBE)
  s.blob(-0.04, 2.72, 0, 0.13, 0.15, 0.13, VEIL, 3, 6)
  for (const z of [-0.3, 0.3]) s.tube([-0.1, 1.98, z * 0.8], [0.1, 1.5, z * 1.1], 0.09, 0.07, 5, ROBE)
  s.riderNow = 0
  return s.build()
}

/** A vulture, in metres, facing +x with its wings along z: a body and two broad fingered wings. */
function vultureShape(): BufferGeometry {
  const s = new Shape()
  const FEATHER = new Color('#3a2f28')
  const QUILL = new Color('#2a221d')
  s.tube([-0.42, 0, 0], [0.45, 0.02, 0], 0.11, 0.06, 5, FEATHER)
  s.blob(0.55, 0.03, 0, 0.09, 0.07, 0.07, new Color('#6a5a4c'), 2, 5)
  for (const side of [-1, 1]) {
    const root = s.vertex(0.26, 0, side * 0.08, FEATHER)
    const back = s.vertex(-0.2, 0, side * 0.08, FEATHER)
    const elbow = s.vertex(0.2, 0.02, side * 0.62, FEATHER)
    const trail = s.vertex(-0.28, 0.02, side * 0.62, FEATHER)
    s.tri(root, elbow, trail)
    s.tri(root, trail, back)
    // The fingers at the tip, splayed.
    let previous = elbow
    for (let f = 0; f < 4; f++) {
      const x = 0.16 - f * 0.13
      const tip = s.vertex(x + 0.02, 0.06, side * (1.12 - f * 0.05), QUILL)
      const next = f === 3 ? trail : s.vertex(x - 0.08, 0.03, side * 0.66, FEATHER)
      s.tri(previous, tip, next)
      previous = next
    }
  }
  const tail = s.vertex(-0.42, 0, 0, FEATHER)
  s.tri(tail, s.vertex(-0.72, 0, 0.18, QUILL), s.vertex(-0.72, 0, -0.18, QUILL))
  return s.build()
}

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------

/*
  The road's daylight, for everything that is not the road: the same sun term,
  the same strong fill from the dust overhead, the same ease into the town's
  shade (`uDaylight`) and the same haze. Double-sided, so a leaf or a blade of
  grass seen from behind is lit from the side you are looking at.
*/
const SUN_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uAmbient;
  uniform float uDaylight;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    float up = n.y * 0.5 + 0.5;
    vec3 shade = vColor * uAmbient * (0.3 + 0.7 * up);
    float facing = max(0.0, dot(n, uSunDir));
    vec3 day = vColor * (uSunColor * (0.3 + 0.7 * facing) + uSkyColor * (0.34 + 0.3 * up));
    vec3 colour = mix(shade, shade * 0.25 + day, uDaylight);
    colour = mix(colour, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const PLANT_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute vec3 iAt;
  attribute vec3 iShape;
  attribute float iTint;
  uniform float uClock;
  uniform vec3 uWind;
  uniform float uBend;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    float c = cos(iShape.z);
    float s = sin(iShape.z);
    vec3 p = position;
    vec3 local = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c) * vec3(iShape.x * iShape.y, iShape.x, iShape.x * iShape.y);
    // Bent downwind, the tops most: a steady lean with gusts running across the plain.
    float gust = 0.65 + 0.35 * sin(uClock * 1.6 + iAt.x * 0.11 + iAt.z * 0.07) + 0.2 * sin(uClock * 5.1 + iAt.x * 0.9 + iAt.z * 0.6);
    vec2 bend = uWind.xz * uBend * p.y * p.y * gust * iShape.x;
    local.x += bend.x;
    local.z += bend.y;
    vec3 world = iAt + local;
    vNormal = vec3(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c);
    vColor = aColor * (0.84 + iTint * 0.32);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const CAMEL_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute vec2 aSwing;
  attribute float aRider;
  attribute vec3 iAt;
  /** x: heading, y: step phase, z: 1 if it carries a rider. */
  attribute vec3 iMove;
  uniform float uClock;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    vec3 p = position;
    float stride = sin(uClock * 2.3 + iMove.y);
    if (aSwing.y > 0.0) {
      float a = stride * aSwing.x * 0.34;
      float dy = aSwing.y - p.y;
      p.x += dy * sin(a);
      p.y = aSwing.y - dy * cos(a);
    } else {
      // The pace rolls the body from side to side, and it rises a little each step.
      p.y += abs(stride) * 0.05;
      p.z += stride * 0.04 * p.y;
    }
    if (aRider > 0.5 && iMove.z < 0.5) p = vec3(0.0, 1.4, 0.0);
    float c = cos(iMove.x);
    float s = sin(iMove.x);
    vec3 world = iAt + vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
    vNormal = vec3(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c);
    vColor = aColor;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const BIRD_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute vec3 iCentre;
  /** x: radius, y: turn rate (signed), z: phase, w: size. */
  attribute vec4 iOrbit;
  uniform float uClock;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    float turn = uClock * iOrbit.y + iOrbit.z;
    vec3 at = iCentre + vec3(cos(turn) * iOrbit.x, sin(turn * 0.5 + iOrbit.z) * 2.5, sin(turn) * iOrbit.x);
    vec3 forward = normalize(vec3(-sin(turn), 0.0, cos(turn))) * sign(iOrbit.y);
    vec3 side = vec3(-forward.z, 0.0, forward.x);
    vec3 p = position * iOrbit.w;
    // Wings held in a shallow V, flexing now and then; banked into the turn.
    p.y += abs(p.z) * (0.12 + 0.08 * sin(uClock * 1.4 + iOrbit.z * 3.0));
    float roll = 0.32;
    vec3 q = vec3(p.x, p.y * cos(roll) - p.z * sin(roll), p.y * sin(roll) + p.z * cos(roll));
    vec3 world = at + forward * q.x + vec3(0.0, q.y, 0.0) + side * q.z;
    vNormal = vec3(0.0, 1.0, 0.0);
    vColor = aColor;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const CLOTH_VERT = /* glsl */ `
  attribute vec3 iTop;
  /** x: width, y: drop, z: how exposed the road is there. */
  attribute vec3 iCloth;
  attribute float iPhase;
  uniform float uClock;
  uniform vec3 uWind;
  varying vec3 vNormal;
  varying vec2 vCloth;
  varying float vDepth;
  void main() {
    float a = position.x;
    float t = position.y;
    vec3 wind = normalize(vec3(uWind.x, 0.0, uWind.z));
    vec3 across = vec3(-wind.z, 0.0, wind.x);
    float exposed = iCloth.z;
    float lean = 0.3 + exposed * 0.8 + sin(uClock * 1.1 + iPhase) * 0.07;
    vec3 down = vec3(0.0, -cos(lean), 0.0) + wind * sin(lean);
    vec3 face = normalize(cross(across, down));
    float flutter = sin(uClock * (5.5 + exposed * 3.0) + iPhase - t * 5.0 + a * 1.4) * (0.05 + exposed * 0.12) * t;
    vec3 world = iTop + across * a * iCloth.x + down * t * iCloth.y + face * flutter * iCloth.y * 0.5;
    vNormal = normalize(face + down * cos(uClock * (5.5 + exposed * 3.0) + iPhase - t * 5.0) * 0.4 * t);
    vCloth = vec2(a + 0.5, t);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/*
  Indigo, with adire on it: rows of pale resist-dyed rings between pale bands.
  At thirty metres it is a texture, not a pattern — which is the right amount.
*/
const CLOTH_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uAmbient;
  uniform float uDaylight;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uIndigo;
  uniform vec3 uIndigoLit;
  uniform vec3 uResist;
  varying vec3 vNormal;
  varying vec2 vCloth;
  varying float vDepth;
  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    // Cells about a hand across on a long narrow cloth: at the size of the first
    // pass the rings were dinner plates and the banner read as a towel.
    vec2 cell = vec2(vCloth.x * 3.0, vCloth.y * 12.0);
    vec2 f = fract(cell) - 0.5;
    float ring = 1.0 - smoothstep(0.04, 0.09, abs(length(f) - 0.26));
    float band = 1.0 - smoothstep(0.03, 0.07, abs(fract(vCloth.y * 3.0) - 0.03));
    vec3 albedo = mix(uIndigoLit, uIndigo, vCloth.y);
    albedo = mix(albedo, uResist, max(ring * 0.8, band) * 0.3);
    float up = n.y * 0.5 + 0.5;
    vec3 shade = albedo * uAmbient * (0.3 + 0.7 * up);
    float facing = abs(dot(n, uSunDir));
    vec3 day = albedo * (uSunColor * (0.3 + 0.7 * facing) + uSkyColor * (0.34 + 0.3 * up));
    vec3 colour = mix(shade, shade * 0.25 + day, uDaylight);
    colour = mix(colour, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const DEVIL_VERT = /* glsl */ `
  attribute vec3 iAt;
  /** x: height, y: width, z: how present (0 gone, 1 full), w: seed. */
  attribute vec4 iDevil;
  uniform float uClock;
  varying float vUp;
  varying float vAround;
  varying float vFade;
  varying float vDepth;
  varying float vEdge;
  void main() {
    float t = position.y;
    float r = mix(0.14, 1.0, pow(t, 0.75)) * iDevil.y;
    // A column that snakes: the top wanders off the foot and back.
    vec3 wander = vec3(sin(t * 2.6 + uClock * 1.3 + iDevil.w), 0.0, cos(t * 2.1 + uClock * 1.1 + iDevil.w)) * t * iDevil.x * 0.06;
    vec3 world = iAt + vec3(position.x * r, t * iDevil.x, position.z * r) + wander;
    vec3 around = normalize(vec3(position.x, 0.0, position.z));
    vEdge = 1.0 - abs(dot(around, normalize(cameraPosition - world)));
    vUp = t;
    vAround = atan(position.z, position.x);
    vFade = iDevil.z;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const DEVIL_FRAG = /* glsl */ `
  precision highp float;
  uniform float uClock;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying float vUp;
  varying float vAround;
  varying float vFade;
  varying float vDepth;
  varying float vEdge;
  void main() {
    float swirl = sin(vAround * 3.0 + vUp * 9.0 - uClock * 7.0) * 0.5 + 0.5;
    float grit = sin(vAround * 7.0 - vUp * 23.0 - uClock * 11.0) * 0.5 + 0.5;
    // Thick at the foot, where it is picking the ground up, and thinning into the haze.
    float body = smoothstep(0.0, 0.03, vUp) * (1.0 - smoothstep(0.35, 1.0, vUp));
    float alpha = (0.35 + 0.65 * swirl * mix(0.65, 1.0, grit)) * body * (0.35 + 0.65 * vEdge) * vFade * 0.62;
    /*
      Darker than the haze it stands in: a column of lifted ground, not of air.
      The first pass was the haze's own colour at under half strength, and not
      one frame caught a devil in it.
    */
    vec3 colour = vec3(0.46, 0.38, 0.29) * (uSunColor * 0.55 + uSkyColor * 0.7);
    float fog = smoothstep(uFogNear, uFogFar * 1.6, vDepth);
    colour = mix(colour, uFogColor, fog * 0.8);
    gl_FragColor = vec4(colour, alpha * (1.0 - fog * 0.45));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const SMOKE_VERT = /* glsl */ `
  attribute vec3 iAt;
  /** x: height, y: width, z: phase. */
  attribute vec3 iSmoke;
  uniform float uClock;
  uniform vec3 uWind;
  varying vec2 vPuff;
  varying float vDepth;
  void main() {
    float a = position.x;
    float t = position.y;
    vec3 base = iAt;
    vec3 toCamera = cameraPosition - base;
    vec3 right = normalize(vec3(toCamera.z, 0.0, -toCamera.x));
    vec3 wind = normalize(vec3(uWind.x, 0.0, uWind.z));
    float wide = iSmoke.y * (0.35 + t * 1.6);
    vec3 world = base + vec3(0.0, t * iSmoke.x, 0.0) + wind * t * t * iSmoke.x * 0.55 + right * a * wide;
    vPuff = vec2(a, t);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const SMOKE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uClock;
  uniform vec3 uSkyColor;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec2 vPuff;
  varying float vDepth;
  void main() {
    float across = 1.0 - smoothstep(0.15, 0.5, abs(vPuff.x));
    float wisps = 0.55 + 0.45 * sin(vPuff.y * 9.0 - uClock * 1.4 + vPuff.x * 5.0) * sin(vPuff.y * 4.0 - uClock * 0.7);
    float alpha = across * smoothstep(0.0, 0.08, vPuff.y) * (1.0 - vPuff.y) * wisps * 0.45;
    // Wood smoke is grey against this sky, not white: pale smoke on a pale haze was invisible.
    vec3 colour = vec3(0.42, 0.4, 0.38) * (uSkyColor * 0.8 + uSunColor * 0.45);
    float fog = smoothstep(uFogNear, uFogFar * 1.6, vDepth);
    gl_FragColor = vec4(mix(colour, uFogColor, fog * 0.8), alpha * (1.0 - fog * 0.5));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// ---------------------------------------------------------------------------
// Planting
// ---------------------------------------------------------------------------

interface Planting {
  at: number[]
  shape: number[]
  tint: number[]
}

interface Batch {
  geometry: InstancedBufferGeometry
  centre: Vector3
  radius: number
}

/** Cut a planting into square batches, which are what gets culled. */
function batch(shape: BufferGeometry, planting: Planting, cell: number, tallest: number): Batch[] {
  const groups = new Map<string, Planting>()
  for (let i = 0; i < planting.tint.length; i++) {
    const key = `${Math.floor(planting.at[i * 3] / cell)},${Math.floor(planting.at[i * 3 + 2] / cell)}`
    let group = groups.get(key)
    if (!group) {
      group = { at: [], shape: [], tint: [] }
      groups.set(key, group)
    }
    group.at.push(planting.at[i * 3], planting.at[i * 3 + 1], planting.at[i * 3 + 2])
    group.shape.push(planting.shape[i * 3], planting.shape[i * 3 + 1], planting.shape[i * 3 + 2])
    group.tint.push(planting.tint[i])
  }
  const out: Batch[] = []
  for (const group of groups.values()) {
    const count = group.tint.length
    const geometry = new InstancedBufferGeometry()
    geometry.index = shape.index
    geometry.setAttribute('position', shape.getAttribute('position'))
    geometry.setAttribute('normal', shape.getAttribute('normal'))
    geometry.setAttribute('aColor', shape.getAttribute('aColor'))
    geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(group.at), 3))
    geometry.setAttribute('iShape', new InstancedBufferAttribute(new Float32Array(group.shape), 3))
    geometry.setAttribute('iTint', new InstancedBufferAttribute(new Float32Array(group.tint), 1))
    geometry.instanceCount = count
    const centre = new Vector3()
    for (let i = 0; i < count; i++) centre.add(new Vector3(group.at[i * 3], group.at[i * 3 + 1], group.at[i * 3 + 2]))
    centre.divideScalar(count)
    const radius = cell * 0.75 + tallest
    geometry.boundingSphere = new Sphere(centre.clone(), radius)
    out.push({ geometry, centre, radius })
  }
  return out
}

type Stretch = 'mile' | 'mounds' | 'wadi' | 'town' | 'pits' | 'scarp' | 'home'

function stretchAt(s: number): Stretch {
  const M = HARMATTAN
  if (s < M.cathedrals.from) return 'mile'
  if (s < M.river.from) return 'mounds'
  if (s < M.gateAt - 12) return 'wadi'
  if (s < M.gateOut + 12) return 'town'
  if (s < M.scarp.from) return 'pits'
  if (s < M.home.from) return 'scarp'
  return 'home'
}

/** Chances per side, per three metres of road, before the quality tier thins them. */
const GROWTH: Record<Stretch, { tree: number; bush: number; grass: number }> = {
  mile: { tree: 0.09, bush: 0.4, grass: 1 },
  mounds: { tree: 0.03, bush: 0.22, grass: 0.5 },
  wadi: { tree: 0.11, bush: 0.45, grass: 0.55 },
  town: { tree: 0, bush: 0, grass: 0 },
  pits: { tree: 0.04, bush: 0.25, grass: 0.5 },
  scarp: { tree: 0.05, bush: 0.35, grass: 0.65 },
  home: { tree: 0.08, bush: 0.35, grass: 0.9 },
}

/**
 * Where things grow: along the road, beyond the drawn edge, on ground that is
 * not a cliff and not another stretch of road, and thinned by a hash of each
 * plant rather than a different random stream — so a phone has the same trees
 * as a laptop, only fewer.
 */
function plantSahel(track: Track, land: Land, share: number) {
  const trees: Planting = { at: [], shape: [], tint: [] }
  const bushes: Planting = { at: [], shape: [], tint: [] }
  const grass: Planting = { at: [], shape: [], tint: [] }
  const road = emptyRoad()
  const basis = flatBasis()
  const rng = random(track.seed ^ 0x5a4e1)

  const place = (into: Planting, side: number, n: number, along: number, tall: number, wide: number, steepest: number, seed: number) => {
    if (hash3(seed, n, 7) > share) return
    const h = Math.hypot(basis.rx, basis.rz) || 1
    const x = road.x + (basis.rx / h) * side * n + basis.fx * along
    const z = road.z + (basis.rz / h) * side * n + basis.fz * along
    // Not nearer another stretch of road than its own drawn edge could be.
    const d = land.roadDistance(x, z)
    if (d < Math.min(n - 2, 11)) return
    if (land.slopeAt(x, z) > steepest) return
    into.at.push(x, land.heightAt(x, z) - 0.05, z)
    into.shape.push(tall, wide, rng() * Math.PI * 2)
    into.tint.push(rng())
  }

  for (let s = 12; s < track.length - 12; s += 3) {
    roadAt(track, s, road)
    basisAt(road, basis)
    const verge = harmattanVerge(road, s)
    const stretch = stretchAt(s)
    const growth = GROWTH[stretch]
    if (verge.town) continue
    // Nothing in the bed of the wadi itself, which is sand.
    const bed = verge.wadi ? 16 : 0
    for (const side of [-1, 1]) {
      if (rng() < growth.tree) {
        // Well back from the wadi's bank tops: a canopy five metres wide growing at the foot of one came up through it.
        place(trees, side, verge.edge + Math.max(bed * 1.8, 8) + rng() * rng() * 95, rng() * 3, 5.5 + rng() * 3.5, 0.85 + rng() * 0.3, 0.7, s * 7 + side)
      }
      for (let k = 0; k < 2; k++) {
        if (rng() < growth.bush) {
          place(bushes, side, verge.edge + Math.max(bed, 1.5) + rng() * rng() * 60, rng() * 3, 0.8 + rng() * 0.9, 1.2 + rng() * 0.6, 0.9, s * 11 + side * 3 + k)
        }
      }
      for (let k = 0; k < 4; k++) {
        if (rng() < growth.grass) {
          place(grass, side, verge.edge + Math.max(bed, 0.4) + rng() * rng() * 42, rng() * 3, 0.45 + rng() * 0.6, 1, 0.85, s * 13 + side * 5 + k)
        }
      }
    }
  }
  return {
    trees: batch(acaciaShape(), trees, 160, 10),
    bushes: batch(bushShape(), bushes, 120, 2),
    grass: batch(tuftShape(), grass, 60, 1.2),
  }
}

// ---------------------------------------------------------------------------
// The banners
// ---------------------------------------------------------------------------

function bannerCloths(track: Track): InstancedBufferGeometry {
  const top: number[] = []
  const cloth: number[] = []
  const phase: number[] = []
  const point = new Vector3()
  for (const s of HARMATTAN.banners) {
    if (s >= track.length) continue
    const at = roadAt(track, s)
    const frame = basisAt(at, flatBasis())
    const side = at.curv === 0 ? 1 : Math.sign(at.curv)
    // The pole `addBanner` drew, to the centimetre.
    const high = 4.6 + hash3(s, 5, 1) * 1.1
    roadPoint(at, side * (at.width + 1.6), high - 0.12, point, frame)
    top.push(point.x, point.y, point.z)
    // A long, narrow length of cloth: square, it read as a towel on a line.
    cloth.push(0.95, 3.4 + hash3(s, 5, 2) * 1.0, at.gale)
    phase.push(hash3(s, 5, 3) * 6.28)
  }
  const COLUMNS = 3
  const ROWS = 10
  const position: number[] = []
  const index: number[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) position.push(c / (COLUMNS - 1) - 0.5, r / (ROWS - 1), 0)
  }
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLUMNS - 1; c++) {
      const a = r * COLUMNS + c
      index.push(a, a + COLUMNS, a + COLUMNS + 1, a, a + COLUMNS + 1, a + 1)
    }
  }
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  geometry.setAttribute('iTop', new InstancedBufferAttribute(new Float32Array(top), 3))
  geometry.setAttribute('iCloth', new InstancedBufferAttribute(new Float32Array(cloth), 3))
  geometry.setAttribute('iPhase', new InstancedBufferAttribute(new Float32Array(phase), 1))
  geometry.instanceCount = phase.length
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

// ---------------------------------------------------------------------------
// The caravans
// ---------------------------------------------------------------------------

interface Caravan {
  /** The path, as x, z pairs. */
  path: Float32Array
  /** Metres along the path at each point. */
  along: Float32Array
  length: number
  camels: number
  riders: Set<number>
  /** Where the lead camel is at the start of the race, as a share of the path. */
  start: number
  speed: number
}

/**
 * A path on the plain beside a stretch of road, coming in out of the haze at
 * one end and going back into it at the other — so the wrap from the far end
 * back to the near one happens where nobody can see it.
 */
function pathBeside(track: Track, land: Land, from: number, to: number, side: number, out: number): { path: Float32Array; along: Float32Array; length: number } {
  const points: number[] = []
  const road = emptyRoad()
  const basis = flatBasis()
  for (let s = from; s <= to; s += 8) {
    roadAt(track, s, road)
    basisAt(road, basis)
    const t = (s - from) / (to - from)
    const n = out + (190 - out) * (1 - smooth(0, 0.2, t) * (1 - smooth(0.8, 1, t)))
    const h = Math.hypot(basis.rx, basis.rz) || 1
    let x = road.x + (basis.rx / h) * side * n
    let z = road.z + (basis.rz / h) * side * n
    // Never walked across another stretch of road.
    for (let push = 0; push < 12 && land.roadDistance(x, z) < 22; push++) {
      x += (basis.rx / h) * side * 6
      z += (basis.rz / h) * side * 6
    }
    points.push(x, z)
  }
  const along = new Float32Array(points.length / 2)
  for (let i = 1; i < along.length; i++) {
    along[i] = along[i - 1] + Math.hypot(points[i * 2] - points[i * 2 - 2], points[i * 2 + 1] - points[i * 2 - 1])
  }
  return { path: new Float32Array(points), along, length: along[along.length - 1] }
}

function layCaravans(track: Track, land: Land): { caravans: Caravan[]; geometry: InstancedBufferGeometry } {
  const M = HARMATTAN
  const caravans: Caravan[] = [
    // Beside the Red Mile, where there is the most plain to see them on.
    /*
      Close enough to be seen. At sixty metres the haze had more than half of
      them and a line of camels was a line of nothing; a caravan keeps its
      distance from a road, but not that much.
    */
    // Beside the Red Mile, where there is the most plain to see them on.
    { ...pathBeside(track, land, 40, M.cathedrals.from + 20, 1, 36), camels: 7, riders: new Set([0, 4]), start: 0.4, speed: 1.25 },
    // Coming in to Kofar Dutse: across the plain beyond the wadi's far bank, toward the town.
    { ...pathBeside(track, land, M.riverBed.to - 20, M.town.from + 110, -1, 32), camels: 6, riders: new Set([0, 3]), start: 0.45, speed: 1.15 },
    // Down on the flat below the scarp, seen from the switchbacks above.
    { ...pathBeside(track, land, M.pits.from + 60, M.scarp.from + 160, 1, 58), camels: 5, riders: new Set([1]), start: 0.5, speed: 1.2 },
  ]
  const shape = camelShape()
  const count = caravans.reduce((sum, c) => sum + c.camels, 0)
  const geometry = new InstancedBufferGeometry()
  geometry.index = shape.index
  for (const name of ['position', 'normal', 'aColor', 'aSwing', 'aRider']) geometry.setAttribute(name, shape.getAttribute(name))
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(count * 3), 3))
  const move = new Float32Array(count * 3)
  let i = 0
  for (const caravan of caravans) {
    for (let k = 0; k < caravan.camels; k++, i++) {
      move[i * 3 + 1] = k * 1.7 + caravan.length * 0.01
      move[i * 3 + 2] = caravan.riders.has(k) ? 1 : 0
    }
  }
  geometry.setAttribute('iMove', new InstancedBufferAttribute(move, 3))
  geometry.instanceCount = count
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return { caravans, geometry }
}

// ---------------------------------------------------------------------------
// Vultures, dust devils, smoke and fire
// ---------------------------------------------------------------------------

function flockVultures(track: Track, land: Land, share: number): InstancedBufferGeometry {
  const M = HARMATTAN
  const spots: [number, number, number, number][] = [
    // over the ruin in the termite country
    [(M.cathedrals.from + M.cathedrals.to) * 0.5, -1, 16, 17],
    // over the wadi
    [(M.riverBed.from + M.riverBed.to) * 0.5, 1, 24, 15],
    // off the face of the scarp
    [M.hairpins[1] + 40, -1, 50, 14],
    /*
      Low enough to be in the frame. The chase camera looks along the road, and
      at thirty metres up a vulture turned over your head and never once on
      screen.
    */
  ]
  const centre: number[] = []
  const orbit: number[] = []
  const point = new Vector3()
  spots.forEach(([s, side, out, high], spot) => {
    const at = roadAt(track, s)
    roadPoint(at, side * (at.width + vergeWidth(at.room) + out), 0, point, basisAt(at, flatBasis()))
    const ground = land.heightAt(point.x, point.z)
    const birds = Math.max(2, Math.round(4 * share))
    for (let b = 0; b < birds; b++) {
      centre.push(point.x, Math.max(ground, at.y) + high + b * 3, point.z)
      orbit.push(12 + hash3(spot, b, 1) * 16, (0.22 + hash3(spot, b, 2) * 0.14) * (hash3(spot, b, 5) > 0.3 ? 1 : -1), hash3(spot, b, 3) * 6.28, 1.15 + hash3(spot, b, 4) * 0.3)
    }
  })
  const shape = vultureShape()
  const geometry = new InstancedBufferGeometry()
  geometry.index = shape.index
  geometry.setAttribute('position', shape.getAttribute('position'))
  geometry.setAttribute('aColor', shape.getAttribute('aColor'))
  geometry.setAttribute('iCentre', new InstancedBufferAttribute(new Float32Array(centre), 3))
  geometry.setAttribute('iOrbit', new InstancedBufferAttribute(new Float32Array(orbit), 4))
  geometry.instanceCount = orbit.length / 4
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

/** How many dust devils can be up at once. */
const DEVILS = 3

function devilGeometry(): InstancedBufferGeometry {
  const SIDES = 12
  const RINGS = 11
  const position: number[] = []
  const index: number[] = []
  for (let r = 0; r < RINGS; r++) {
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2
      position.push(Math.cos(a), r / (RINGS - 1), Math.sin(a))
    }
  }
  for (let r = 0; r < RINGS - 1; r++) {
    for (let k = 0; k < SIDES; k++) {
      const a = r * SIDES + k
      const b = r * SIDES + ((k + 1) % SIDES)
      index.push(a, a + SIDES, b + SIDES, a, b + SIDES, b)
    }
  }
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(DEVILS * 3), 3))
  geometry.setAttribute('iDevil', new InstancedBufferAttribute(new Float32Array(DEVILS * 4), 4))
  geometry.instanceCount = DEVILS
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

/** Smoke from the compounds: at home, among the farms, and off the dyers' fires. */
function laySmoke(track: Track, land: Land): InstancedBufferGeometry {
  const M = HARMATTAN
  const places: [number, number, number][] = []
  for (let s = M.home.from + 30; s < track.length - 40; s += 46) places.push([s, places.length % 2 === 0 ? 1 : -1, 10])
  for (const s of [150, 430, 640]) places.push([s, s === 430 ? -1 : 1, 16])
  places.push([M.pits.from + 60, 1, 9], [M.pits.from + 190, -1, 9])
  // The brassfire's furnace, just off the road at the top of the scarp.
  places.push([M.home.to - 34, -1, 1.5])
  const at: number[] = []
  const smoke: number[] = []
  const point = new Vector3()
  places.forEach(([s, side, out], i) => {
    const road = roadAt(track, s)
    roadPoint(road, side * (road.width + vergeWidth(road.room) + out), 0, point, basisAt(road, flatBasis()))
    at.push(point.x, land.heightAt(point.x, point.z), point.z)
    smoke.push(9 + hash3(i, 2, 1) * 6, 1.1 + hash3(i, 2, 2) * 0.8, hash3(i, 2, 3) * 6.28)
  })
  const position: number[] = []
  const index: number[] = []
  const ROWS = 9
  for (let r = 0; r < ROWS; r++) for (const a of [-0.5, 0, 0.5]) position.push(a, r / (ROWS - 1), 0)
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < 2; c++) {
      const a = r * 3 + c
      index.push(a, a + 3, a + 4, a, a + 4, a + 1)
    }
  }
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 3))
  geometry.setAttribute('iSmoke', new InstancedBufferAttribute(new Float32Array(smoke), 3))
  geometry.instanceCount = smoke.length / 3
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

// ---------------------------------------------------------------------------

interface Devil {
  x: number
  z: number
  age: number
  life: number
  height: number
  width: number
  seed: number
}

export function Sahellife({ track, rock }: { track: Track; rock: ShaderMaterial }) {
  const tier = useQuality((q) => q.tier)
  const share = tier === 'low' ? 0.45 : tier === 'medium' ? 0.75 : 1
  const land = useMemo(() => landFor(track), [track])
  const plants = useMemo(() => plantSahel(track, land, share), [track, land, share])
  const cloth = useMemo(() => bannerCloths(track), [track])
  const walking = useMemo(() => layCaravans(track, land), [track, land])
  const birds = useMemo(() => flockVultures(track, land, share), [track, land, share])
  const devils = useMemo(() => devilGeometry(), [])
  const smoke = useMemo(() => laySmoke(track, land), [track, land])

  const fires = useMemo(() => {
    const point = new Vector3()
    /*
      The hearth you leave from, and only that one. A flame in harmattan noon is
      a pale thing, and additive fire far off in the glare came out as white
      spikes standing in the road — the finish hearth is in the middle of it.
      The brassfire at the top shows as its smoke instead: see `laySmoke`.
    */
    const places: { s: number; n: number; big: boolean }[] = track.hearths
      .filter((h) => Math.abs(h.n) > 2)
      .map((h) => ({ s: h.s, n: h.n, big: false }))
    return places.map(({ s, n, big }) => {
      const road = roadAt(track, s)
      roadPoint(road, n, 0, point, basisAt(road, flatBasis()))
      return { at: [point.x, point.y, point.z] as [number, number, number], big }
    })
  }, [track])

  const clock = useMemo(() => ({ value: 0 }), [])
  const wind = useMemo(() => ({ value: new Vector3(WIND_X, 0, WIND_Z) }), [])
  const materials = useMemo(() => {
    const u = rock.uniforms
    const light = {
      uAmbient: u.uAmbient,
      uDaylight: u.uDaylight,
      uSunDir: u.uSunDir,
      uSunColor: u.uSunColor,
      uSkyColor: u.uSkyColor,
      uFogColor: u.uFogColor,
      uFogNear: u.uFogNear,
      uFogFar: u.uFogFar,
    }
    const plant = (bend: number) => new ShaderMaterial({
      vertexShader: PLANT_VERT,
      fragmentShader: SUN_FRAG,
      side: DoubleSide,
      uniforms: { ...light, uClock: clock, uWind: wind, uBend: { value: bend } },
    })
    return {
      tree: plant(0.025),
      bush: plant(0.07),
      grass: plant(0.4),
      camel: new ShaderMaterial({ vertexShader: CAMEL_VERT, fragmentShader: SUN_FRAG, side: DoubleSide, uniforms: { ...light, uClock: clock } }),
      bird: new ShaderMaterial({ vertexShader: BIRD_VERT, fragmentShader: SUN_FRAG, side: DoubleSide, uniforms: { ...light, uClock: clock } }),
      cloth: new ShaderMaterial({
        vertexShader: CLOTH_VERT,
        fragmentShader: CLOTH_FRAG,
        side: DoubleSide,
        uniforms: {
          ...light,
          uClock: clock,
          uWind: wind,
          // Deeper than the first pass: in this sun a mid indigo came out as a swimming-pool blue.
          uIndigo: { value: new Color('#1f3160') },
          uIndigoLit: { value: new Color('#2d4684') },
          uResist: { value: new Color('#8c99bb') },
        },
      }),
      devil: new ShaderMaterial({
        vertexShader: DEVIL_VERT,
        fragmentShader: DEVIL_FRAG,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: { ...light, uClock: clock },
      }),
      smoke: new ShaderMaterial({
        vertexShader: SMOKE_VERT,
        fragmentShader: SMOKE_FRAG,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: { ...light, uClock: clock, uWind: wind },
      }),
    }
  }, [rock, clock, wind])

  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])
  useEffect(() => () => {
    for (const list of [plants.trees, plants.bushes, plants.grass]) list.forEach((b) => b.geometry.dispose())
  }, [plants])
  useEffect(() => () => {
    cloth.dispose()
    walking.geometry.dispose()
    birds.dispose()
    devils.dispose()
    smoke.dispose()
  }, [cloth, walking, birds, devils, smoke])

  const treeRefs = useRef<Mesh[]>([])
  const bushRefs = useRef<Mesh[]>([])
  const grassRefs = useRef<Mesh[]>([])
  const swarm = useRef<Devil[]>([])
  const ahead = useMemo(() => new Vector3(), [])

  useFrame(({ camera }, delta) => {
    const step = Math.min(0.05, delta)
    clock.value += step
    // The grass bends harder where the road is exposed.
    const gale = 0.5 + dust.exposed * 0.9
    wind.value.set(WIND_X * gale, 0, WIND_Z * gale)

    const far = rock.uniforms.uFogFar.value as number
    const cull = (list: Batch[], refs: Mesh[], limit: number) => {
      for (let i = 0; i < list.length; i++) {
        const mesh = refs[i]
        if (mesh) mesh.visible = camera.position.distanceTo(list[i].centre) - list[i].radius < limit
      }
    }
    cull(plants.trees, treeRefs.current, far * 1.05)
    cull(plants.bushes, bushRefs.current, far * 1.05)
    cull(plants.grass, grassRefs.current, Math.min(75, far))

    // The caravans walk.
    const at = walking.geometry.getAttribute('iAt') as InstancedBufferAttribute
    const move = walking.geometry.getAttribute('iMove') as InstancedBufferAttribute
    let i = 0
    for (const caravan of walking.caravans) {
      for (let k = 0; k < caravan.camels; k++, i++) {
        const length = caravan.length
        let d = (caravan.start * length + clock.value * caravan.speed - k * 3.8) % length
        if (d < 0) d += length
        let p = 1
        while (p < caravan.along.length - 1 && caravan.along[p] < d) p++
        const span = Math.max(0.001, caravan.along[p] - caravan.along[p - 1])
        const t = Math.max(0, Math.min(1, (d - caravan.along[p - 1]) / span))
        const x0 = caravan.path[(p - 1) * 2]
        const z0 = caravan.path[(p - 1) * 2 + 1]
        const x1 = caravan.path[p * 2]
        const z1 = caravan.path[p * 2 + 1]
        const x = x0 + (x1 - x0) * t
        const z = z0 + (z1 - z0) * t
        at.setXYZ(i, x, land.heightAt(x, z) - 0.05, z)
        move.setX(i, Math.atan2(z1 - z0, x1 - x0))
      }
    }
    at.needsUpdate = true
    move.needsUpdate = true

    /*
      Dust devils: raised on open, exposed ground ahead of you, walked downwind,
      and let go. Never in the town or the wadi, where there is no wind to make
      one, and never within reach of the road.
    */
    const list = swarm.current
    const devilAt = devils.getAttribute('iAt') as InstancedBufferAttribute
    const devil = devils.getAttribute('iDevil') as InstancedBufferAttribute
    camera.getWorldDirection(ahead)
    const facing = Math.atan2(ahead.z, ahead.x)
    for (let k = 0; k < DEVILS; k++) {
      let one = list[k]
      if (!one || one.age > one.life) {
        const open = dust.exposed > 0.3
        /*
          Off to one side of the way ahead. Aimed anywhere near straight ahead,
          nearly every one landed on or beside the road and was refused, and a
          whole run of stills went by with no devil in any of them.
        */
        const bearing = facing + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.55)
        // Inside the haze's reach: at over a hundred metres a devil was a faint smudge the fog finished off.
        const distance = 40 + Math.random() * 45
        const x = camera.position.x + Math.cos(bearing) * distance
        const z = camera.position.z + Math.sin(bearing) * distance
        const clear = land.roadDistance(x, z) > 14 && land.slopeAt(x, z) < 0.4
        one = {
          x, z,
          age: 0,
          // A dud slot waits a while before trying again, so they do not all rise together.
          life: open && clear && Math.random() < 0.8 ? 10 + Math.random() * 9 : 2 + Math.random() * 4,
          height: open && clear ? 16 + Math.random() * 20 : 0,
          width: 1.6 + Math.random() * 2.2,
          seed: Math.random() * 20,
        }
        list[k] = one
      }
      one.age += step
      one.x += WIND_X * 2.6 * step + Math.sin(clock.value * 0.7 + one.seed) * 0.8 * step
      one.z += WIND_Z * 2.6 * step + Math.cos(clock.value * 0.6 + one.seed) * 0.8 * step
      const presence = one.height > 0 ? smooth(0, 2.5, one.age) * (1 - smooth(one.life - 3, one.life, one.age)) : 0
      devilAt.setXYZ(k, one.x, land.heightAt(one.x, one.z) - 0.3, one.z)
      devil.setXYZW(k, Math.max(0.01, one.height), one.width, presence, one.seed)
    }
    devilAt.needsUpdate = true
    devil.needsUpdate = true

    /*
      Under `?shot=1`, where the caravans and the devils are, so a screenshot
      script can stand the car where one is in view — a still taken at a chosen
      metre almost never has a walking caravan in it by chance.
    */
    if (SHOT) {
      const caravans: { s: number; away: number }[] = []
      let first = 0
      for (const caravan of walking.caravans) {
        const x = at.getX(first)
        const z = at.getZ(first)
        let best = Infinity
        let bestAt = 0
        for (let q = 0; q < track.x.length; q += 2) {
          const d = (track.x[q] - x) ** 2 + (track.z[q] - z) ** 2
          if (d < best) {
            best = d
            bestAt = q
          }
        }
        caravans.push({ s: Math.round(bestAt * STEP), away: Math.round(Math.sqrt(best)) })
        first += caravan.camels
      }
      ;(globalThis as unknown as Record<string, unknown>).__sahel = {
        caravans,
        devils: list.filter((d) => d.height > 0 && d.age < d.life).length,
      }
    }
  })

  return (
    <>
      {plants.trees.map((b, i) => (
        <mesh key={`tree-${i}`} ref={(node) => { if (node) treeRefs.current[i] = node }} geometry={b.geometry} material={materials.tree} />
      ))}
      {plants.bushes.map((b, i) => (
        <mesh key={`bush-${i}`} ref={(node) => { if (node) bushRefs.current[i] = node }} geometry={b.geometry} material={materials.bush} />
      ))}
      {plants.grass.map((b, i) => (
        <mesh key={`grass-${i}`} ref={(node) => { if (node) grassRefs.current[i] = node }} geometry={b.geometry} material={materials.grass} />
      ))}
      <mesh geometry={cloth} material={materials.cloth} frustumCulled={false} />
      <mesh geometry={walking.geometry} material={materials.camel} frustumCulled={false} />
      <mesh geometry={birds} material={materials.bird} frustumCulled={false} />
      <mesh geometry={smoke} material={materials.smoke} frustumCulled={false} renderOrder={2} />
      <mesh geometry={devils} material={materials.devil} frustumCulled={false} renderOrder={3} />
      {fires.map((fire, i) => (
        <Fire
          key={`fire-${i}`}
          position={fire.at}
          height={fire.big ? 3.4 : 2.4}
          width={fire.big ? 1.8 : 1.2}
          intensity={0}
          night={0}
        />
      ))}
    </>
  )
}
