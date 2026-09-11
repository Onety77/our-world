/**
 * What is alive on the Nightfall, and what the two of you have put there.
 *
 * ---------------------------------------------------------------------------
 * `Nightfall.tsx` builds the road, the room and the ground. This is everything
 * that grows, burns, flows and shines along it — and the part that makes it
 * *the* garden rather than a garden:
 *
 *   **a flower for every thought**, in the spiral the Tree of Thoughts keeps
 *   them in, round the great tree's foot — and a paper for each one hanging
 *   from its real branches, on threads, as they hang there;
 *
 *   **the river**, the Wellspring's, running down the valley and across the
 *   fords;
 *
 *   **the hearth**, the Hollow's fire in the middle of the room, and its
 *   embers climbing;
 *
 *   **a light in the sky for every message**, low over her dawn and climbing
 *   away into the stars as the Stars hang them — and the two lights, warm and
 *   cool, over the plain;
 *
 *   **a lit pane for every memory** in the lanterns of the walk, in that
 *   picture's own colour, and the wood the lane runs through.
 *
 * The counts are the garden's own data, read live; nothing is invented to fill
 * a gap. Two thoughts is two flowers. Everything lit reads the road's light
 * block, so it is dusk here and night there exactly as the road is.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { Fire } from '@/world/Fire'
import { useWorldSlice } from '@/data/provider'
import { useMemories } from '@/systems/memories'
import { useTalking } from '@/systems/talking'
import { useQuality } from '@/systems/quality'
import { FLOWER_COLORS, LIGHT_COLORS } from '@/systems/palette'
import { growTree, leafGeometry, speciesFor } from '@/world/tree'
import type { FormInstance } from '@/world/forms'
import { makeRng, seedFrom } from '@/systems/rng'
import { basisAt, roadPoint } from './geometry'
import { random } from './model'
import { NIGHTFALL, emptyRoad, roadAt, vergeWidth, type Track } from './track'
import { RIVER_HALF, placeAt, type Land } from './nightfallLand'
import { dawnBearing, greatTreeAt, roomAt } from './Nightfall'

function hash(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

const flatBasis = () => ({ fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })

// ---------------------------------------------------------------------------
// Light, for everything that is not the road
// ---------------------------------------------------------------------------

/** The road's daylight and its fill, double-sided, for leaves, petals and paper. */
const LIT_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uAmbient;
  uniform float uDaylight;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uEmberPos;
  uniform vec3 uEmberColor;
  uniform float uEmberPower;
  uniform vec4 uLamps[10];
  uniform vec3 uLampColors[10];
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  varying float vGlow;
  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    float up = n.y * 0.5 + 0.5;
    vec3 colour = vColor * uAmbient * (0.35 + 0.65 * up);
    float facing = max(0.0, dot(n, uSunDir));
    vec3 day = vColor * (uSunColor * (0.3 + 0.7 * facing) + uSkyColor * (0.34 + 0.3 * up));
    colour = mix(colour, colour * 0.25 + day, uDaylight);
    // The lanterns and the fires, as the road has them.
    for (int i = 0; i < 10; i++) {
      if (uLamps[i].w < 0.01) continue;
      vec3 toward = uLamps[i].xyz - vWorld;
      float dist = length(toward);
      float fall = max(0.0, 1.0 - dist / uLamps[i].w);
      fall *= fall;
      float lambert = max(dot(n, toward / max(dist, 0.001)), 0.0);
      colour += vColor * uLampColors[i] * fall * (0.3 + lambert * 0.7);
    }
    vec3 toEmber = uEmberPos - vWorld;
    float emberFall = max(0.0, 1.0 - length(toEmber) / 17.0);
    colour += vColor * uEmberColor * emberFall * emberFall * uEmberPower * 0.6;
    colour += vColor * vGlow;
    colour = mix(colour, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** A shape instanced at points, turned, scaled, and leaning in the wind. */
const PLANT_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute vec3 iAt;
  attribute vec3 iShape;
  attribute float iTint;
  attribute vec3 iBloom;
  uniform float uClock;
  uniform float uBend;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  varying float vGlow;
  void main() {
    float c = cos(iShape.z);
    float s = sin(iShape.z);
    vec3 p = position;
    vec3 local = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c) * vec3(iShape.x * iShape.y, iShape.x, iShape.x * iShape.y);
    // The garden's breeze: a slow gust across the ground and each thing swaying to its own phase.
    float gust = sin(uClock * 0.31 + iAt.x * 0.03 + iAt.z * 0.024) * 0.5 + 0.5;
    float sway = sin(uClock * 0.61 + iTint * 6.28) * 0.6 + sin(uClock * 1.13 + iTint * 8.8) * 0.25;
    float bend = sway * (0.35 + gust * 0.8) * uBend * p.y * p.y * iShape.x;
    local.x += bend;
    local.z += bend * 0.4;
    vec3 world = iAt + local;
    vNormal = vec3(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c);
    // A flower's petals are white in the shape and coloured by the instance.
    vColor = aColor * iBloom * (0.86 + iTint * 0.28);
    vWorld = world;
    vGlow = 0.0;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/** Small things that face you: petals, papers, panes. `iFace` is a colour and a glow of their own. */
const CARD_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iFace;
  /** x: width, y: height, z: yaw, w: glow. */
  attribute vec4 iCard;
  uniform float uClock;
  uniform float uFlutter;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  varying float vGlow;
  void main() {
    float c = cos(iCard.z);
    float s = sin(iCard.z);
    vec3 p = vec3(position.x * iCard.x, position.y * iCard.y, 0.0);
    // Paper on a thread turns a little in the air; a pane in a frame does not.
    float turn = sin(uClock * 0.9 + iAt.x * 1.3 + iAt.z * 0.7) * uFlutter;
    float ct = cos(turn);
    float st = sin(turn);
    p = vec3(p.x * ct, p.y, p.x * st);
    vec3 local = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
    vec3 n = vec3(-s * ct, 0.0, c * ct);
    vNormal = n;
    vColor = iFace;
    vGlow = iCard.w;
    vWorld = iAt + local;
    vec4 mv = viewMatrix * vec4(vWorld, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/** Points of light: message-lights over the dawn, embers off the hearth, fireflies. */
const SPARK_VERT = /* glsl */ `
  attribute vec3 iAt;
  /** x: size, y: phase, z: rise per second (0 for a light that hangs), w: warmth. */
  attribute vec4 iSpark;
  uniform float uClock;
  varying float vWarm;
  varying float vFade;
  void main() {
    vec3 p = iAt;
    float life = fract(iSpark.y + uClock * 0.11 * step(0.01, iSpark.z));
    // Embers: up, wavering, and gone. Lights: hanging, breathing.
    p.y += iSpark.z * life * 9.0;
    p.x += sin(uClock * 1.3 + iSpark.y * 20.0) * 0.4 * step(0.01, iSpark.z) * life;
    p.z += cos(uClock * 1.1 + iSpark.y * 17.0) * 0.4 * step(0.01, iSpark.z) * life;
    float breathe = 0.75 + 0.25 * sin(uClock * 0.7 + iSpark.y * 30.0);
    vFade = mix(breathe, (1.0 - life) * smoothstep(0.0, 0.08, life), step(0.01, iSpark.z));
    vWarm = iSpark.w;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_PointSize = iSpark.x * (260.0 / max(2.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

const SPARK_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  varying float vWarm;
  varying float vFade;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float core = 1.0 - smoothstep(0.0, 0.16, r);
    float halo = 1.0 - smoothstep(0.1, 0.5, r);
    vec3 colour = mix(uCool, uWarm, vWarm);
    gl_FragColor = vec4(colour * (core * 1.6 + halo * 0.35) * vFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/*
  The river.

  Dark water with the sky in it: the dusk's warmth going out of it as the night
  comes in, ripples running down the valley, and a pale shallows where it goes
  over the fords. Lit and fogged as the road is.
*/
const RIVER_VERT = /* glsl */ `
  attribute float aAlong;
  attribute float aAcross;
  uniform float uClock;
  varying vec3 vWorld;
  varying float vAlong;
  varying float vAcross;
  varying float vDepth;
  void main() {
    vec3 p = position;
    float run = aAlong;
    p.y += sin(run * 0.9 - uClock * 2.1 + aAcross * 3.0) * 0.03 + sin(run * 2.3 - uClock * 3.4 - aAcross * 5.0) * 0.015;
    vWorld = p;
    vAlong = run;
    vAcross = aAcross;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const RIVER_FRAG = /* glsl */ `
  precision highp float;
  uniform float uClock;
  uniform float uDaylight;
  uniform vec3 uSkyColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec4 uLamps[10];
  uniform vec3 uLampColors[10];
  varying vec3 vWorld;
  varying float vAlong;
  varying float vAcross;
  varying float vDepth;
  void main() {
    // Ripples, as a normal built from the same waves the vertices ride.
    float dA = cos(vAlong * 0.9 - uClock * 2.1 + vAcross * 3.0) * 0.9 * 0.03 + cos(vAlong * 2.3 - uClock * 3.4 - vAcross * 5.0) * 2.3 * 0.015;
    float dX = cos(vAlong * 0.9 - uClock * 2.1 + vAcross * 3.0) * 3.0 * 0.03 - cos(vAlong * 2.3 - uClock * 3.4 - vAcross * 5.0) * 5.0 * 0.015;
    vec3 n = normalize(vec3(-dX * 2.0, 1.0, -dA * 2.0));
    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(0.0, dot(n, view)), 3.0);
    // The Wellspring's water: dark teal with the sky lying on it, more at a low angle.
    vec3 deep = vec3(0.05, 0.085, 0.095);
    vec3 skyIn = mix(uAmbient * 0.45, uSkyColor * 0.55 + uSunColor * 0.1, uDaylight);
    vec3 colour = mix(deep * (uAmbient * 2.5 + uDaylight * 0.8), skyIn, 0.15 + fresnel * 0.45);
    // The sun on the water, while there is one.
    vec3 h = normalize(uSunDir + view);
    colour += uSunColor * pow(max(0.0, dot(n, h)), 90.0) * uDaylight * 0.8;
    // A lamp on the water.
    for (int i = 0; i < 10; i++) {
      if (uLamps[i].w < 0.01) continue;
      vec3 toward = uLamps[i].xyz - vWorld;
      float dist = length(toward);
      float fall = max(0.0, 1.0 - dist / uLamps[i].w);
      vec3 hl = normalize(toward / max(dist, 0.001) + view);
      colour += uLampColors[i] * (fall * fall * 0.12 + pow(max(0.0, dot(n, hl)), 60.0) * fall * 0.6);
    }
    // The shallows: paler, and broken, toward the banks.
    float bank = smoothstep(0.55, 1.0, abs(vAcross));
    colour = mix(colour, colour + vec3(0.06, 0.07, 0.07) * (uAmbient * 3.0 + uDaylight), bank * 0.6);
    float alpha = 0.92 - bank * 0.5;
    colour = mix(colour, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(colour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** A grown tree, as one geometry with a colour a vertex: limbs, and leaves laid both ways. */
function bakeTree(parts: { wood: FormInstance[]; leaves: FormInstance[] }): BufferGeometry {
  const limb = new CylinderGeometry(0.7, 1, 1, 5, 1, true)
  limb.translate(0, 0.5, 0)
  const leaf = leafGeometry()
  const position: number[] = []
  const colour: number[] = []
  const index: number[] = []
  const tint = new Color()
  const lay = (base: BufferGeometry, items: FormInstance[], shade: number) => {
    const p = base.getAttribute('position')
    const idx = base.getIndex()
    for (const item of items) {
      tint.set(item.color).multiplyScalar(shade)
      const [lx, lz] = item.lean ?? [0, 0]
      const cx = Math.cos(lx), sx = Math.sin(lx), cz = Math.cos(lz), sz = Math.sin(lz), cy = Math.cos(item.rot), sy = Math.sin(item.rot)
      const first = position.length / 3
      for (let v = 0; v < p.count; v++) {
        let x = p.getX(v) * item.scale[0]
        let y = p.getY(v) * item.scale[1]
        let z = p.getZ(v) * item.scale[2]
        const y1 = y * cx - z * sx
        z = y * sx + z * cx
        y = y1
        const x2 = x * cz - y * sz
        y = x * sz + y * cz
        x = x2
        const x3 = x * cy - z * sy
        z = x * sy + z * cy
        x = x3
        position.push(x + item.offset[0], y + item.offset[1], z + item.offset[2])
        colour.push(tint.r, tint.g, tint.b)
      }
      const faces = idx ? idx.count : p.count
      for (let f = 0; f + 2 < faces; f += 3) {
        const a = first + (idx ? idx.getX(f) : f)
        const b = first + (idx ? idx.getX(f + 1) : f + 1)
        const c = first + (idx ? idx.getX(f + 2) : f + 2)
        index.push(a, b, c)
      }
    }
  }
  // Leaves are laid once: the wood's material draws both sides, and a second
  // winding on the same vertices only cancelled their normals and doubled the
  // count of what is drawn by the hundred.
  lay(limb, parts.wood, 1.15)
  lay(leaf, parts.leaves, 1.1)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(colour), 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** A flower: a stem, and five petals round a centre, a unit tall. */
function flowerShape(): BufferGeometry {
  const position: number[] = []
  const colour: number[] = []
  const index: number[] = []
  const stem = new Color('#4f5b3a')
  const push = (x: number, y: number, z: number, c: Color) => {
    position.push(x, y, z)
    colour.push(c.r, c.g, c.b)
    return position.length / 3 - 1
  }
  const white = new Color('#ffffff')
  // The stem, two triangles crossed.
  for (const a of [0, Math.PI / 2]) {
    const dx = Math.cos(a) * 0.03
    const dz = Math.sin(a) * 0.03
    const i = push(-dx, 0, -dz, stem)
    push(dx, 0, dz, stem)
    push(0, 0.72, 0, stem)
    index.push(i, i + 1, i + 2, i, i + 2, i + 1)
  }
  // The head: petals as a fan, tinted white so the instance colour is the flower's.
  const centre = push(0, 0.74, 0, white)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const b = ((k + 0.5) / 5) * Math.PI * 2
    const tip = push(Math.cos(a) * 0.22, 0.78, Math.sin(a) * 0.22, white)
    const next = push(Math.cos(b) * 0.2, 0.77, Math.sin(b) * 0.2, white)
    index.push(centre, tip, next, centre, next, tip)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(colour), 3))
  geometry.setIndex(index)
  const normal = new Float32Array(position.length)
  for (let i = 1; i < normal.length; i += 3) normal[i] = 1
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  return geometry
}

/** A tuft of the meadow's grass. */
function grassShape(): BufferGeometry {
  const position: number[] = []
  const colour: number[] = []
  const index: number[] = []
  const foot = new Color('#45532f')
  const tip = new Color('#8a9260')
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + hash(k, 1, 1) * 0.7
    const lean = 0.1 + hash(k, 1, 2) * 0.22
    const tall = 0.55 + hash(k, 1, 3) * 0.45
    const cx = Math.cos(a), cz = Math.sin(a)
    const i = position.length / 3
    position.push(cx * 0.03 - cz * 0.03, 0, cz * 0.03 + cx * 0.03, cx * 0.03 + cz * 0.03, 0, cz * 0.03 - cx * 0.03, cx * lean, tall, cz * lean)
    colour.push(foot.r, foot.g, foot.b, foot.r, foot.g, foot.b, tip.r, tip.g, tip.b)
    index.push(i, i + 1, i + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(colour), 3))
  geometry.setIndex(index)
  const normal = new Float32Array(position.length)
  for (let i = 1; i < normal.length; i += 3) normal[i] = 1
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  return geometry
}

/** A reed: three tall blades. */
function reedShape(): BufferGeometry {
  const position: number[] = []
  const colour: number[] = []
  const index: number[] = []
  const foot = new Color('#3f4a2e')
  const tip = new Color('#7c7a52')
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    const cx = Math.cos(a), cz = Math.sin(a)
    const i = position.length / 3
    position.push(cx * 0.05 - cz * 0.04, 0, cz * 0.05 + cx * 0.04, cx * 0.05 + cz * 0.04, 0, cz * 0.05 - cx * 0.04, cx * 0.16, 1, cz * 0.16)
    colour.push(foot.r, foot.g, foot.b, foot.r, foot.g, foot.b, tip.r, tip.g, tip.b)
    index.push(i, i + 1, i + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(colour), 3))
  geometry.setIndex(index)
  const normal = new Float32Array(position.length)
  for (let i = 1; i < normal.length; i += 3) normal[i] = 1
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  return geometry
}

interface Batch {
  geometry: InstancedBufferGeometry
  centre: Vector3
  radius: number
}

function batchOf(shape: BufferGeometry, at: number[], shapes: number[], tints: number[], tallest: number, bloom?: number[]): Batch | null {
  const count = tints.length
  if (count === 0) return null
  const geometry = new InstancedBufferGeometry()
  geometry.index = shape.index
  geometry.setAttribute('position', shape.getAttribute('position'))
  geometry.setAttribute('normal', shape.getAttribute('normal'))
  geometry.setAttribute('aColor', shape.getAttribute('aColor'))
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 3))
  geometry.setAttribute('iShape', new InstancedBufferAttribute(new Float32Array(shapes), 3))
  geometry.setAttribute('iTint', new InstancedBufferAttribute(new Float32Array(tints), 1))
  geometry.setAttribute('iBloom', new InstancedBufferAttribute(new Float32Array(bloom ?? Array(count * 3).fill(1)), 3))
  geometry.instanceCount = count
  const centre = new Vector3()
  let reach = 0
  for (let i = 0; i < count; i++) centre.add(new Vector3(at[i * 3], at[i * 3 + 1], at[i * 3 + 2]))
  centre.divideScalar(count)
  for (let i = 0; i < count; i++) reach = Math.max(reach, centre.distanceTo(new Vector3(at[i * 3], at[i * 3 + 1], at[i * 3 + 2])))
  geometry.boundingSphere = new Sphere(centre.clone(), reach + tallest)
  return { geometry, centre, radius: reach + tallest }
}

/** Cut a planting into batches by a cell of the ground, each culled on its own. */
function batched(shape: BufferGeometry, at: number[], shapes: number[], tints: number[], cell: number, tallest: number, bloom?: number[]): Batch[] {
  const groups = new Map<string, { at: number[]; shapes: number[]; tints: number[]; bloom: number[] }>()
  for (let i = 0; i < tints.length; i++) {
    const key = `${Math.floor(at[i * 3] / cell)},${Math.floor(at[i * 3 + 2] / cell)}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { at: [], shapes: [], tints: [], bloom: [] }))
    g.at.push(at[i * 3], at[i * 3 + 1], at[i * 3 + 2])
    g.shapes.push(shapes[i * 3], shapes[i * 3 + 1], shapes[i * 3 + 2])
    g.tints.push(tints[i])
    if (bloom) g.bloom.push(bloom[i * 3], bloom[i * 3 + 1], bloom[i * 3 + 2])
  }
  const out: Batch[] = []
  for (const g of groups.values()) {
    const b = batchOf(shape, g.at, g.shapes, g.tints, tallest, bloom ? g.bloom : undefined)
    if (b) out.push(b)
  }
  return out
}

// ---------------------------------------------------------------------------
// Planting
// ---------------------------------------------------------------------------

/**
 * The woods: along the walk, close and on both sides; along the meadow's
 * edges, further off; on the valley's rim. Six trees grown by the garden's
 * generator and instanced, thinned by the quality tier with a hash of the
 * place so a phone has the same trees, only fewer.
 */
function plantWoods(track: Track, land: Land, share: number) {
  const treeRng = makeRng(seedFrom('nightfall:the-wood'))
  /*
    Cheap trees, and it matters: the wood is drawn by the hundred. A quarter of
    the leaves, grown larger to keep the crown's mass, and the outermost limbs
    left inside their sprays — under a thousand triangles a tree where the full
    tree is five thousand, at a range where nobody counts leaves.
  */
  const kinds = Array.from({ length: 6 }, () => bakeTree(growTree({
    at: [0, 0, 0],
    height: 1,
    species: speciesFor(treeRng),
    rng: treeRng,
    leafDetail: 0.22,
    woodDetail: 0.3,
  })))
  const rng = random(track.seed ^ 0x2fe91)
  const road = emptyRoad()
  const basis = flatBasis()
  const point = new Vector3()
  const plantings = kinds.map(() => ({ at: [] as number[], shapes: [] as number[], tints: [] as number[] }))
  const plant = (s: number, side: number, out: number, along: number, height: number) => {
    roadAt(track, s, road)
    basisAt(road, basis)
    const h = Math.hypot(basis.rx, basis.rz) || 1
    const x = road.x + (basis.rx / h) * side * out + basis.fx * along
    const z = road.z + (basis.rz / h) * side * out + basis.fz * along
    if (land.roadDistance(x, z) < Math.min(out - 3, 9)) return
    if (land.slopeAt(x, z) > 0.8) return
    if (hash(Math.round(x), Math.round(z), 3) > share) return
    const kind = Math.floor(rng() * kinds.length)
    const p = plantings[kind]
    p.at.push(x, land.heightAt(x, z) - 0.15, z)
    p.shapes.push(height, 0.9 + rng() * 0.25, rng() * Math.PI * 2)
    p.tints.push(rng())
  }
  const M = NIGHTFALL
  // The walk: a wood, thick and close.
  for (let s = M.walk.from - 60; s < track.length - 20; s += 4) {
    roadAt(track, s, road)
    const wall = road.width + vergeWidth(road.room)
    for (const side of [-1, 1]) {
      if (rng() < 0.55) plant(s, side, wall + 4 + rng() * rng() * 10, rng() * 3, 7 + rng() * 6)
      if (rng() < 0.45) plant(s, side, wall + 14 + rng() * 40, rng() * 3, 8 + rng() * 7)
    }
  }
  // The meadow's edge, and the plain's far edge, thin and far.
  for (let s = 20; s < M.meadow.to; s += 9) {
    roadAt(track, s, road)
    const wall = road.width + vergeWidth(road.room)
    for (const side of [-1, 1]) {
      if (rng() < 0.3) plant(s, side, wall + 45 + rng() * 90, rng() * 6, 8 + rng() * 6)
    }
  }
  // The valley's rim.
  for (let s = M.wellspring.from; s < M.hollow.from; s += 7) {
    roadAt(track, s, road)
    const wall = road.width + vergeWidth(road.room)
    for (const side of [-1, 1]) {
      if (rng() < 0.4) plant(s, side, wall + 22 + rng() * 30, rng() * 4, 7 + rng() * 5)
    }
  }
  // Round the knoll, and a few on the plain's far edges.
  for (let s = M.hollow.from - 40; s < M.hollow.to + 40; s += 8) {
    roadAt(track, s, road)
    const wall = road.width + vergeWidth(road.room)
    for (const side of [-1, 1]) if (rng() < 0.35) plant(s, side, wall + 18 + rng() * 40, rng() * 4, 6 + rng() * 5)
  }
  for (let s = M.stars.from + 40; s < M.stars.to; s += 12) {
    roadAt(track, s, road)
    for (const side of [-1, 1]) if (rng() < 0.12) plant(s, side, 90 + rng() * 90, rng() * 8, 7 + rng() * 5)
  }
  void point
  return kinds.map((kind, i) => batched(kind, plantings[i].at, plantings[i].shapes, plantings[i].tints, 120, 14)).flat()
}

/** The meadow's grass and the valley's reeds. */
function plantGround(track: Track, land: Land, share: number) {
  const rng = random(track.seed ^ 0x77bd2)
  const road = emptyRoad()
  const basis = flatBasis()
  const grass = { at: [] as number[], shapes: [] as number[], tints: [] as number[] }
  const reeds = { at: [] as number[], shapes: [] as number[], tints: [] as number[] }
  const M = NIGHTFALL
  const put = (into: typeof grass, s: number, side: number, out: number, tall: number, wide: number) => {
    roadAt(track, s, road)
    basisAt(road, basis)
    const h = Math.hypot(basis.rx, basis.rz) || 1
    const along = rng() * 3
    const x = road.x + (basis.rx / h) * side * out + basis.fx * along
    const z = road.z + (basis.rz / h) * side * out + basis.fz * along
    if (land.roadDistance(x, z) < road.width + vergeWidth(road.room) + 0.3) return
    if (hash(Math.round(x * 3), Math.round(z * 3), 9) > share) return
    into.at.push(x, land.heightAt(x, z) - 0.03, z)
    into.shapes.push(tall, wide, rng() * Math.PI * 2)
    into.tints.push(rng())
  }
  for (let s = 6; s < track.length - 6; s += 3) {
    const place = placeAt(s)
    roadAt(track, s, road)
    const wall = road.width + vergeWidth(road.room)
    const want = place === 'meadow' ? 1 : place === 'walk' ? 0.4 : place === 'stars' ? 0.5 : place === 'wellspring' ? 0.5 : 0
    if (want === 0) continue
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) if (rng() < want) put(grass, s, side, wall + 0.6 + rng() * rng() * 30, 0.35 + rng() * 0.5, 1)
    }
  }
  // Reeds along the water.
  for (let i = 0; i < land.river.length; i++) {
    const r = land.river[i]
    const s = r.s
    if (s < M.wellspring.from + 30) continue
    for (let k = 0; k < 3; k++) {
      if (rng() > 0.7) continue
      const a = rng() * Math.PI * 2
      const d = RIVER_HALF + 1 + rng() * 5
      const x = r.x + Math.cos(a) * d
      const z = r.z + Math.sin(a) * d
      roadAt(track, s, road)
      if (land.roadDistance(x, z) < road.width + vergeWidth(road.room) + 0.5) continue
      if (hash(Math.round(x * 3), Math.round(z * 3), 11) > share) continue
      reeds.at.push(x, land.heightAt(x, z) - 0.05, z)
      reeds.shapes.push(1.4 + rng() * 1.1, 1, rng() * Math.PI * 2)
      reeds.tints.push(rng())
    }
  }
  return {
    grass: batched(grassShape(), grass.at, grass.shapes, grass.tints, 60, 1),
    reeds: batched(reedShape(), reeds.at, reeds.shapes, reeds.tints, 60, 2.5),
  }
}

/**
 * The flowers at the tree's foot, one for every thought, in the spiral the
 * Tree of Thoughts keeps them in: the oldest nearest the trunk, the newest
 * ringing the edge. And the meadow's own scattered flowers, which are scenery
 * and say nothing.
 */
function plantFlowers(track: Track, land: Land, foot: [number, number, number], thoughts: number, share: number) {
  const rng = random(track.seed ^ 0x19a4c)
  const at: number[] = []
  const shapes: number[] = []
  const tints: number[] = []
  const colours: number[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  const colour = new Color()
  for (let i = 0; i < Math.min(thoughts, 600); i++) {
    const r = 2.2 + Math.sqrt(i) * 0.75
    const a = i * golden
    const x = foot[0] + Math.cos(a) * r
    const z = foot[2] + Math.sin(a) * r
    at.push(x, land.heightAt(x, z) - 0.02, z)
    shapes.push(0.55 + hash(i, 2, 1) * 0.35, 1, hash(i, 2, 2) * 6.28)
    tints.push(hash(i, 2, 3))
    colour.set(FLOWER_COLORS[i % FLOWER_COLORS.length])
    colours.push(colour.r, colour.g, colour.b)
  }
  // The meadow's own, thin, everywhere the grass is.
  const road = emptyRoad()
  const basis = flatBasis()
  for (let s = 10; s < NIGHTFALL.meadow.to; s += 5) {
    roadAt(track, s, road)
    basisAt(road, basis)
    const wall = road.width + vergeWidth(road.room)
    for (const side of [-1, 1]) {
      if (rng() > 0.5 * share) continue
      const out = wall + 1 + rng() * rng() * 34
      const h = Math.hypot(basis.rx, basis.rz) || 1
      const x = road.x + (basis.rx / h) * side * out + basis.fx * rng() * 4
      const z = road.z + (basis.rz / h) * side * out + basis.fz * rng() * 4
      if (Math.hypot(x - foot[0], z - foot[2]) < 2.2 + Math.sqrt(thoughts) * 0.75 + 2) continue
      if (land.roadDistance(x, z) < wall + 0.5) continue
      at.push(x, land.heightAt(x, z) - 0.02, z)
      shapes.push(0.4 + rng() * 0.3, 1, rng() * 6.28)
      tints.push(rng())
      colour.set(FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)])
      colours.push(colour.r, colour.g, colour.b)
    }
  }
  // The petals take the instance's colour: the shape's are white.
  return batched(flowerShape(), at, shapes, tints, 80, 1, colours)
}

// ---------------------------------------------------------------------------

/** Instanced cards: papers, panes. */
function cards(at: number[], face: number[], card: number[]): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 3))
  geometry.setAttribute('iFace', new InstancedBufferAttribute(new Float32Array(face), 3))
  geometry.setAttribute('iCard', new InstancedBufferAttribute(new Float32Array(card), 4))
  geometry.instanceCount = card.length / 4
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

function sparks(at: number[], spark: number[]): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 3))
  geometry.setAttribute('iSpark', new InstancedBufferAttribute(new Float32Array(spark), 4))
  geometry.instanceCount = spark.length / 4
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

/** The river as a ribbon along the land's own line of it. */
function riverRibbon(land: Land): BufferGeometry {
  const position: number[] = []
  const along: number[] = []
  const across: number[] = []
  const index: number[] = []
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
    const half = RIVER_HALF + 1.5
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      position.push(p.x - dz * half * t, p.y, p.z + dx * half * t)
      along.push(i * 3)
      across.push(t)
    }
    if (i > 0) {
      const a = (i - 1) * 5
      for (let k = 0; k < 4; k++) index.push(a + k, a + k + 5, a + k + 6, a + k, a + k + 6, a + k + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1))
  geometry.setAttribute('aAcross', new BufferAttribute(new Float32Array(across), 1))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return geometry
}

// ---------------------------------------------------------------------------

/** What of the garden's own is on the road: how many thoughts, which memories (their tints), how many messages. */
export interface GardenCounts {
  thoughts: number
  memories: readonly { at: number; tint: string }[]
  messages: number
}

/** The life, read live from the garden's data. The race mounts this. */
export function NightlifeLive(props: { track: Track; rock: ShaderMaterial; land: Land }) {
  const thoughts = useWorldSlice((s) => s.letters.length)
  const memories = useMemories((m) => m.all)
  const messages = useTalking((t) => t.messages.length)
  return <Nightlife {...props} garden={{ thoughts, memories, messages }} />
}

export function Nightlife({ track, rock, land, garden }: { track: Track; rock: ShaderMaterial; land: Land; garden: GardenCounts }) {
  const tier = useQuality((q) => q.tier)
  const share = tier === 'low' ? 0.45 : tier === 'medium' ? 0.72 : 1
  const { thoughts, memories, messages } = garden

  const tree = useMemo(() => greatTreeAt(track, land), [track, land])
  const woods = useMemo(() => plantWoods(track, land, share), [track, land, share])
  const ground = useMemo(() => plantGround(track, land, share), [track, land, share])
  const flowers = useMemo(() => plantFlowers(track, land, tree.foot, thoughts, share), [track, land, tree, thoughts, share])
  const river = useMemo(() => riverRibbon(land), [land])
  const room = useMemo(() => roomAt(track), [track])
  const dawn = useMemo(() => dawnBearing(track), [track])

  // The papers: one per thought, from the tree's own hang points, on threads.
  const papers = useMemo(() => {
    const at: number[] = []
    const face: number[] = []
    const card: number[] = []
    const thread: number[] = []
    const hangs = tree.parts.hangs
    const paper = new Color('#efe6d2')
    const count = Math.min(thoughts, hangs.length)
    for (let i = 0; i < count; i++) {
      const [hx, hy, hz] = hangs[(i * 7) % hangs.length]
      // Down into the clear air under the crown, as the Tree hangs them.
      const y = tree.foot[1] + 4.2 + hash(i, 4, 1) * 1.6
      at.push(hx, y, hz)
      face.push(paper.r, paper.g, paper.b)
      card.push(0.26, 0.34, hash(i, 4, 2) * 6.28, 0.04)
      thread.push(hx, hy, hz, hx, y + 0.17, hz)
    }
    const threads = new BufferGeometry()
    threads.setAttribute('position', new BufferAttribute(new Float32Array(thread), 3))
    return { geometry: cards(at, face, card), threads, count }
  }, [tree, thoughts])

  // The panes: one lantern of the walk per memory, in its own colour; the rest pale.
  const panes = useMemo(() => {
    const at: number[] = []
    const face: number[] = []
    const card: number[] = []
    const road = emptyRoad()
    const basis = flatBasis()
    const point = new Vector3()
    const posts = track.lanterns.filter((l) => l.s > NIGHTFALL.walk.from && l.s < NIGHTFALL.walk.to)
    const sorted = [...memories].sort((a, b) => a.at - b.at)
    const plain = new Color('#c9a874')
    const tint = new Color()
    posts.forEach((l, i) => {
      roadAt(track, l.s, road)
      basisAt(road, basis)
      roadPoint(road, l.n, 0, point, basis)
      const memory = sorted[i]
      if (memory) tint.set(memory.tint).lerp(plain, 0.15)
      else tint.copy(plain)
      const glow = memory ? 0.55 : 0.28
      // Four panes round the head, facing out; the head's glass is centred a
      // little under the lamp itself (`lanternPost` in Nightfall.tsx).
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2
        at.push(point.x + Math.cos(a) * 0.155, point.y + l.y - 0.12, point.z + Math.sin(a) * 0.155)
        face.push(tint.r, tint.g, tint.b)
        card.push(0.26, 0.34, a + Math.PI / 2, glow)
      }
    })
    return { geometry: cards(at, face, card), lit: Math.min(sorted.length, posts.length), posts: posts.length }
  }, [track, memories])

  // The lights in the sky: one per message, low over her dawn and climbing away.
  const skyLights = useMemo(() => {
    const at: number[] = []
    const spark: number[] = []
    const count = Math.min(messages, 400)
    const centre = roadAt(track, NIGHTFALL.stars.from + 400)
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1)
      // The newest hang low; the oldest are nearly stars.
      const age = 1 - t
      const spread = (hash(i, 6, 1) - 0.5) * (0.5 + age * 0.9)
      const a = Math.atan2(dawn.x, dawn.z) + spread
      const distance = 460 + age * 760
      const y = centre.y + 4 + age * 220 + hash(i, 6, 2) * 12
      at.push(centre.x + Math.sin(a) * distance, y, centre.z + Math.cos(a) * distance)
      // The newest are lanterns, plainly; the oldest are one more star.
      spark.push(2.0 + (1 - age) * 3.6, hash(i, 6, 3), 0, hash(i, 6, 4) > 0.5 ? 1 : 0)
    }
    return { geometry: sparks(at, spark), count }
  }, [track, dawn, messages])

  // The hearth's embers, and the fireflies of the meadow at dusk.
  const embers = useMemo(() => {
    const at: number[] = []
    const spark: number[] = []
    const rng = random(track.seed ^ 0x3bc71)
    for (let i = 0; i < 90; i++) {
      at.push(room.hearth.x + (rng() - 0.5) * 1.4, room.hearth.y + 0.4, room.hearth.z + (rng() - 0.5) * 1.4)
      spark.push(0.5 + rng() * 0.6, rng(), 0.5 + rng() * 0.6, 1)
    }
    return sparks(at, spark)
  }, [track, room])
  const fireflies = useMemo(() => {
    const at: number[] = []
    const spark: number[] = []
    const rng = random(track.seed ^ 0x5d21e)
    const road = emptyRoad()
    const basis = flatBasis()
    for (let s = 60; s < NIGHTFALL.meadow.to; s += 6) {
      if (rng() > 0.5 * share) continue
      roadAt(track, s, road)
      basisAt(road, basis)
      const side = rng() < 0.5 ? -1 : 1
      const out = road.width + 3 + rng() * 26
      const h = Math.hypot(basis.rx, basis.rz) || 1
      const x = road.x + (basis.rx / h) * side * out
      const z = road.z + (basis.rz / h) * side * out
      at.push(x, land.heightAt(x, z) + 0.5 + rng() * 1.6, z)
      spark.push(0.55 + rng() * 0.3, rng(), 0, 1)
    }
    return sparks(at, spark)
  }, [track, land, share])

  const clock = useMemo(() => ({ value: 0 }), [])
  const materials = useMemo(() => {
    const u = rock.uniforms
    const light = {
      uAmbient: u.uAmbient, uDaylight: u.uDaylight, uSunDir: u.uSunDir, uSunColor: u.uSunColor, uSkyColor: u.uSkyColor,
      uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar,
      uEmberPos: u.uEmberPos, uEmberColor: u.uEmberColor, uEmberPower: u.uEmberPower, uLamps: u.uLamps, uLampColors: u.uLampColors,
    }
    const plant = (bend: number) => new ShaderMaterial({ vertexShader: PLANT_VERT, fragmentShader: LIT_FRAG, side: DoubleSide, uniforms: { ...light, uClock: clock, uBend: { value: bend } } })
    return {
      tree: plant(0.008),
      grass: plant(0.5),
      reed: plant(0.12),
      flower: plant(0.25),
      paper: new ShaderMaterial({ vertexShader: CARD_VERT, fragmentShader: LIT_FRAG, side: DoubleSide, uniforms: { ...light, uClock: clock, uFlutter: { value: 0.35 } } }),
      pane: new ShaderMaterial({ vertexShader: CARD_VERT, fragmentShader: LIT_FRAG, side: DoubleSide, uniforms: { ...light, uClock: clock, uFlutter: { value: 0 } } }),
      spark: new ShaderMaterial({
        vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
        uniforms: { uClock: clock, uWarm: { value: new Color(LIGHT_COLORS.warm) }, uCool: { value: new Color(LIGHT_COLORS.cool) } },
      }),
      ember: new ShaderMaterial({
        vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
        uniforms: { uClock: clock, uWarm: { value: new Color('#ff8a3a') }, uCool: { value: new Color('#ffc46a') } },
      }),
      firefly: new ShaderMaterial({
        vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
        uniforms: { uClock: clock, uWarm: { value: new Color('#d8f08a') }, uCool: { value: new Color('#d8f08a') } },
      }),
      river: new ShaderMaterial({ vertexShader: RIVER_VERT, fragmentShader: RIVER_FRAG, transparent: true, depthWrite: false, side: DoubleSide, uniforms: { ...light, uClock: clock } }),
      thread: new ShaderMaterial({
        vertexShader: 'varying float vDepth; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'precision highp float; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; varying float vDepth; void main() { vec3 c = mix(vec3(0.35, 0.32, 0.28), uFogColor, smoothstep(uFogNear, uFogFar, vDepth)); gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
        uniforms: { uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar },
      }),
    }
  }, [rock, clock])

  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])
  useEffect(() => () => {
    woods.forEach((b) => b.geometry.dispose())
    ground.grass.forEach((b) => b.geometry.dispose())
    ground.reeds.forEach((b) => b.geometry.dispose())
    flowers.forEach((b) => b.geometry.dispose())
  }, [woods, ground, flowers])
  useEffect(() => () => { river.dispose(); papers.geometry.dispose(); papers.threads.dispose(); panes.geometry.dispose(); skyLights.geometry.dispose(); embers.dispose(); fireflies.dispose() },
    [river, papers, panes, skyLights, embers, fireflies])

  const refs = useRef<Mesh[]>([])
  const allBatches = useMemo(() => [...woods, ...ground.grass, ...ground.reeds, ...flowers], [woods, ground, flowers])
  const fires = useMemo(() => {
    const point = new Vector3()
    const out: { at: [number, number, number]; big: boolean }[] = []
    let hearth = false
    for (const l of track.lanterns) {
      if (l.s < NIGHTFALL.ring.from - 30 || l.s > NIGHTFALL.ring.to + 30) continue
      // The hearth is three lights in one place; one flame, on the bowl's floor.
      if (l.fire && hearth) continue
      if (l.fire) {
        hearth = true
        out.push({ at: [room.hearth.x, room.hearth.y + 0.15, room.hearth.z], big: true })
        continue
      }
      const road = roadAt(track, l.s)
      roadPoint(road, l.n, 0, point, basisAt(road, flatBasis()))
      out.push({ at: [point.x, room.floorAt(point.x, point.z) + 0.15, point.z], big: false })
    }
    for (const h of track.hearths) {
      const road = roadAt(track, h.s)
      roadPoint(road, h.n, 0, point, basisAt(road, flatBasis()))
      out.push({ at: [point.x, point.y, point.z], big: false })
    }
    return out
  }, [track, room])

  useFrame(({ camera }, delta) => {
    clock.value += Math.min(0.05, delta)
    // Only what the fog leaves, and never a wood a quarter of a mile off: past
    // three hundred metres a tree is a silhouette the ground already makes.
    const far = Math.min(300, rock.uniforms.uFogFar.value as number)
    for (let i = 0; i < allBatches.length; i++) {
      const mesh = refs.current[i]
      if (!mesh) continue
      const reach = i < woods.length ? far : Math.min(far, 110)
      mesh.visible = camera.position.distanceTo(allBatches[i].centre) - allBatches[i].radius < reach
    }
  })

  return (
    <>
      {allBatches.map((b, i) => (
        <mesh
          key={`life-${i}`}
          ref={(node) => { if (node) refs.current[i] = node }}
          geometry={b.geometry}
          material={i < woods.length ? materials.tree : i < woods.length + ground.grass.length ? materials.grass : i < woods.length + ground.grass.length + ground.reeds.length ? materials.reed : materials.flower}
        />
      ))}
      <mesh geometry={river} material={materials.river} renderOrder={1} />
      {papers.count > 0 ? <mesh geometry={papers.geometry} material={materials.paper} frustumCulled={false} /> : null}
      {papers.count > 0 ? <lineSegments geometry={papers.threads} material={materials.thread} frustumCulled={false} /> : null}
      {panes.posts > 0 ? <mesh geometry={panes.geometry} material={materials.pane} frustumCulled={false} /> : null}
      {skyLights.count > 0 ? <points geometry={skyLights.geometry} material={materials.spark} frustumCulled={false} /> : null}
      <points geometry={embers} material={materials.ember} frustumCulled={false} />
      <points geometry={fireflies} material={materials.firefly} frustumCulled={false} />
      {fires.map((fire, i) => (
        <Fire key={`fire-${i}`} position={fire.at} height={fire.big ? 5 : 1.4} width={fire.big ? 2.8 : 0.9} intensity={0} night={0} />
      ))}
    </>
  )
}
