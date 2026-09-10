/**
 * What is alive on the Moonbreak above the water.
 *
 * ---------------------------------------------------------------------------
 * Everything `Moonbreak` builds is baked once into the road and never moves,
 * which is what lets nearly four kilometres of causeway be a handful of draw
 * calls — and it is also why the open road, for all its sky and sea, felt like
 * a model of a place. The Drowned Mile had fish and falling silt; up in the air
 * there was nothing that was not the car.
 *
 * Three small living things, each doing one job:
 *
 *   **lilies** on the sea beside the low causeway, drifting and turning a
 *   little, and one in five in flower. The blooms hold a faint light of their
 *   own — not a lantern's, which is information, but the pale kind a white
 *   flower seems to have at night — so the water near the road has points of
 *   light in it out to a hundred metres, and the dark between them reads as
 *   distance rather than as nothing.
 *
 *   **fireflies** over the orchard, the reeds and the two terraces, blinking.
 *
 *   **petals** falling in the orchard, which is in flower.
 *
 * All of it counted, like the Drowned Mile's: four instanced draws and two
 * point clouds, thinned on the lower quality tiers, and the clouds drawn at a
 * size of nought wherever their district is not.
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
import { useQuality } from '../../../systems/quality'
import { basisAt, roadPoint } from './geometry'
import { deep } from './depth'
import { random } from './model'
import { MOON_DIR, MOONLIGHT } from './moonlight'
import { wallEdge } from './moonGarden'
import { MOONBREAK, WATER_Y, emptyRoad, roadAt, type Track } from './track'

function hash3(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const smooth = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from))
  return t * t * (3 - 2 * t)
}
/** 1 inside a stretch of road, easing in and out over `fade` metres either end. */
const district = (s: number, from: number, to: number, fade: number) =>
  smooth(from - fade, from + fade, s) * (1 - smooth(to - fade, to + fade, s))

// ---------------------------------------------------------------------------
// Lilies
// ---------------------------------------------------------------------------

/** A pad: a disc with the notch cut out of it, lying flat, facing up. */
function padShape(): BufferGeometry {
  const position = [0, 0, 0]
  const index: number[] = []
  const RIM = 12
  for (let k = 0; k <= RIM; k++) {
    const angle = 0.32 + (k / RIM) * (Math.PI * 2 - 0.64)
    position.push(Math.cos(angle), 0, Math.sin(angle))
    if (k > 0) index.push(0, k + 1, k)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  return geometry
}

/** A bloom: an outer ring of six petals opening wide and an inner ring standing up. */
function bloomShape(): BufferGeometry {
  const position: number[] = []
  const index: number[] = []
  for (const [count, reach, rise, width, turn] of [
    [6, 1, 0.55, 0.34, 0],
    [6, 0.6, 0.85, 0.24, Math.PI / 6],
  ]) {
    for (let p = 0; p < count; p++) {
      const angle = turn + (p / count) * Math.PI * 2
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      const at = (r: number, y: number, w: number) => [c * r - s * w, y, s * r + c * w]
      const base = position.length / 3
      position.push(...at(0.1, 0.05, -width * 0.4), ...at(0.1, 0.05, width * 0.4), ...at(reach, rise, width), ...at(reach, rise, -width))
      index.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  return geometry
}

function instanced(shape: BufferGeometry, at: number[], shapeData: number[]): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.index = shape.index
  geometry.setAttribute('position', shape.getAttribute('position'))
  if (shape.getAttribute('uv')) geometry.setAttribute('uv', shape.getAttribute('uv'))
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 3))
  geometry.setAttribute('iShape', new InstancedBufferAttribute(new Float32Array(shapeData), 3))
  geometry.instanceCount = at.length / 3
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

/**
 * Where the lilies float: in clusters, beside the causeway wherever it lies low
 * over open sea — not in the cuttings, where the sea is behind a wall, and not
 * near the Drowned Mile, where the road is about to be under them.
 *
 * Laid from the day's seed, like the trees, and thinned for the quality tier by
 * a hash of each cluster rather than by drawing fewer random numbers, so a
 * phone sees the same lilies as a laptop, only fewer of them.
 */
function plantLilies(track: Track, share: number) {
  const rng = random(track.seed ^ 0x11e5)
  const road = emptyRoad()
  const pads: number[] = []
  const padShapes: number[] = []
  const blooms: number[] = []
  const bloomShapes: number[] = []
  const centre = new Vector3()
  for (let s = 24; s < track.length - 10; s += 7) {
    const keep = rng()
    const side = rng() < 0.5 ? -1 : 1
    const out = rng()
    const spread = 1.2 + rng() * 2.4
    const count = 3 + Math.floor(rng() * 7)
    const drift = rng()
    if (keep > 0.55 || hash3(s, 3, 9) > share) continue
    const at = s + (drift - 0.5) * 6
    roadAt(track, at, road)
    if (road.y < WATER_Y + 0.45 || road.y - WATER_Y > 3.2) continue
    if (at > MOONBREAK.deep.from - 30 && at < MOONBREAK.deep.to + 30) continue
    roadPoint(road, side * (wallEdge(road) + 2.6 + Math.pow(out, 1.6) * 30), 0, centre, basisAt(road))
    for (let p = 0; p < count; p++) {
      const angle = hash3(s, p, 1) * Math.PI * 2
      const r = spread * Math.sqrt(hash3(s, p, 2))
      const x = centre.x + Math.cos(angle) * r
      const z = centre.z + Math.sin(angle) * r
      const radius = 0.32 + hash3(s, p, 3) * 0.6
      const phase = hash3(s, p, 4)
      pads.push(x, WATER_Y + 0.02, z)
      padShapes.push(radius, hash3(s, p, 5) * Math.PI * 2, phase)
      if (hash3(s, p, 6) < 0.2) {
        blooms.push(x + radius * 0.2, WATER_Y + 0.03, z - radius * 0.15)
        bloomShapes.push(0.2 + hash3(s, p, 7) * 0.13, hash3(s, p, 8) * Math.PI, phase)
      }
    }
  }
  const pad = padShape()
  const bloom = bloomShape()
  const glow = new PlaneGeometry(1, 1)
  const result = {
    pads: instanced(pad, pads, padShapes),
    blooms: instanced(bloom, blooms, bloomShapes),
    glows: instanced(glow, blooms, bloomShapes),
  }
  pad.dispose()
  bloom.dispose()
  glow.dispose()
  return result
}

/** Where a floating thing is this frame: turning slowly, and riding the swell. */
const FLOAT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iShape;
  uniform float uTime;
  vec3 floating(vec3 local) {
    float turn = iShape.y + sin(uTime * 0.13 + iShape.z * 6.0) * 0.25;
    float c = cos(turn);
    float s = sin(turn);
    vec3 world = iAt + vec3(local.x * c - local.z * s, local.y, local.x * s + local.z * c) * iShape.x;
    world.y += sin(uTime * 0.8 + iShape.z * 9.0 + iAt.x * 0.2) * 0.025;
    return world;
  }
`

const PAD_VERT = /* glsl */ `
  ${FLOAT}
  varying vec3 vWorld;
  varying float vRim;
  varying float vShade;
  void main() {
    vec3 world = floating(position);
    vWorld = world;
    vRim = length(position.xz);
    vShade = fract(iShape.z * 13.7);
    vec4 view = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * view;
    // Past the fog there is nothing to see; throw the whole pad off screen.
    if (-view.z > 200.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`

const PAD_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonLight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;
  varying float vRim;
  varying float vShade;
  void main() {
    vec3 base = mix(vec3(0.020, 0.045, 0.030), vec3(0.040, 0.060, 0.032), vShade);
    // Waxy: a pad is a small mirror for the moon, which is how you find one on dark water.
    vec3 eye = normalize(cameraPosition - vWorld);
    vec3 bounce = reflect(-eye, vec3(0.0, 1.0, 0.0));
    float sheen = pow(max(dot(bounce, uMoonDir), 0.0), 24.0);
    vec3 colour = base * (0.4 + uMoonLight * 0.8) + uMoonLight * sheen * 0.16;
    colour *= 1.0 + smoothstep(0.84, 1.0, vRim) * 0.6;
    float fog = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vWorld));
    gl_FragColor = vec4(mix(colour, uFogColor, fog), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const BLOOM_VERT = /* glsl */ `
  ${FLOAT}
  varying vec3 vWorld;
  varying float vHeart;
  varying float vBreath;
  void main() {
    vec3 world = floating(position);
    vWorld = world;
    vHeart = 1.0 - clamp(length(position.xz), 0.0, 1.0);
    vBreath = 0.8 + 0.2 * sin(uTime * 0.6 + iShape.z * 17.0);
    vec4 view = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * view;
    if (-view.z > 200.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`

/*
  Pale, and a little brighter than the moon alone would make it — the one
  liberty taken with the light out here, and a small one: a white flower on
  black water at night looks lit from inside, and one that does not reads as a
  scrap of paper floating on it. Warmer at the heart.
*/
const BLOOM_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uMoonLight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;
  varying float vHeart;
  varying float vBreath;
  void main() {
    vec3 petal = vec3(0.26, 0.24, 0.31) * vBreath + uMoonLight * 0.12;
    vec3 colour = mix(petal, vec3(0.42, 0.37, 0.24), smoothstep(0.55, 0.95, vHeart));
    float fog = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vWorld));
    gl_FragColor = vec4(mix(colour, uFogColor, fog), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const GLOW_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iShape;
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vUv = uv;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float size = iShape.x * 4.5 * (0.85 + 0.15 * sin(uTime * 0.6 + iShape.z * 17.0));
    vec3 world = iAt + vec3(0.0, iShape.x * 0.7, 0.0) + (right * position.x + up * position.y) * size;
    world.y += sin(uTime * 0.8 + iShape.z * 9.0 + iAt.x * 0.2) * 0.025;
    vec4 view = viewMatrix * vec4(world, 1.0);
    vFade = 1.0 - smoothstep(70.0, 160.0, -view.z);
    gl_Position = projectionMatrix * view;
  }
`

const GLOW_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float glow = pow(max(0.0, 1.0 - r), 2.5) * vFade;
    if (glow < 0.003) discard;
    gl_FragColor = vec4(vec3(0.30, 0.28, 0.42) * glow * 0.9, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// ---------------------------------------------------------------------------
// Fireflies and petals
// ---------------------------------------------------------------------------

/** A cloud of points held in a box that wraps round the camera, so a few hundred cover the whole road. */
function cloud(count: number, seed: number): BufferGeometry {
  const rng = random(seed)
  const data = new Float32Array(count * 3)
  for (let i = 0; i < data.length; i++) data[i] = rng()
  const geometry = new BufferGeometry()
  geometry.setAttribute('aSeed', new BufferAttribute(data, 3))
  // Points are counted off `position`; see the silt in Deepwater for the evening that cost.
  geometry.setAttribute('position', new BufferAttribute(data.slice(), 3))
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

const FIREFLY_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec3 uAt;
  uniform float uAmount;
  uniform float uPixel;
  varying float vGlow;
  void main() {
    vec3 box = vec3(70.0, 6.0, 70.0);
    vec3 p = aSeed * box;
    p.x += sin(uTime * (0.2 + aSeed.y * 0.3) + aSeed.z * 20.0) * 2.0;
    p.z += cos(uTime * (0.17 + aSeed.x * 0.3) + aSeed.y * 20.0) * 2.0;
    p.y += sin(uTime * 0.5 + aSeed.x * 30.0) * 0.6;
    vec3 world = vec3(
      uAt.x + mod(p.x - uAt.x, box.x) - box.x * 0.5,
      uAt.y + p.y - box.y * 0.5,
      uAt.z + mod(p.z - uAt.z, box.z) - box.z * 0.5
    );
    vec4 view = viewMatrix * vec4(world, 1.0);
    float blink = pow(max(0.0, sin(uTime * (0.9 + aSeed.z * 1.3) + aSeed.x * 40.0)), 5.0);
    float away = length(view.xyz);
    // Gone before it reaches the lens: one drifting into the camera was a blob of light the size of a thumb.
    vGlow = blink * uAmount * (1.0 - smoothstep(20.0, 34.0, away)) * smoothstep(3.0, 7.0, away);
    gl_PointSize = vGlow > 0.001 ? min((3.0 + aSeed.y * 3.0) * (20.0 / max(2.0, -view.z)), 9.0) * uPixel : 0.0;
    gl_Position = projectionMatrix * view;
  }
`

const FIREFLY_FRAG = /* glsl */ `
  precision highp float;
  varying float vGlow;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float core = pow(1.0 - r, 2.2);
    gl_FragColor = vec4(vec3(0.78, 1.0, 0.45) * core * vGlow * 1.6, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const PETAL_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec3 uAt;
  uniform float uAmount;
  uniform float uPixel;
  varying float vAlpha;
  varying float vSpin;
  void main() {
    vec3 box = vec3(36.0, 12.0, 36.0);
    vec3 p = aSeed * box;
    p.y -= uTime * (0.35 + aSeed.z * 0.3);
    p.x += sin(uTime * 1.3 + aSeed.y * 30.0) * 0.6 + uTime * 0.25;
    p.z += cos(uTime * 1.1 + aSeed.x * 30.0) * 0.4;
    vec3 world = uAt + mod(p - uAt, box) - box * 0.5;
    vec4 view = viewMatrix * vec4(world, 1.0);
    float away = length(view.xyz);
    // Small, and never at the lens, or a petal reads as a snowflake.
    vAlpha = uAmount * (1.0 - smoothstep(10.0, 18.0, away)) * smoothstep(2.0, 5.0, away);
    vSpin = uTime * (1.5 + aSeed.x * 2.0) + aSeed.z * 10.0;
    gl_PointSize = vAlpha > 0.001 ? min((3.0 + aSeed.y * 2.0) * (12.0 / max(1.5, -view.z)), 6.0) * uPixel : 0.0;
    gl_Position = projectionMatrix * view;
  }
`

const PETAL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uMoonLight;
  varying float vAlpha;
  varying float vSpin;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vSpin);
    float s = sin(vSpin);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    // A petal tumbling is a petal seen edge-on half the time.
    q.x /= 0.3 + 0.7 * abs(sin(vSpin * 0.7));
    float d = length(q * 2.0);
    if (d > 1.0) discard;
    vec3 colour = vec3(0.62, 0.40, 0.52) * (0.35 + uMoonLight * 0.5);
    gl_FragColor = vec4(colour, vAlpha * (1.0 - smoothstep(0.6, 1.0, d)) * 0.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// ---------------------------------------------------------------------------

export function Moonlife({ track }: { track: Track }) {
  const tier = useQuality((q) => q.tier)
  const share = tier === 'low' ? 0.5 : tier === 'medium' ? 0.8 : 1
  const lilies = useMemo(() => plantLilies(track, share), [track, share])
  const fireflies = useMemo(() => cloud(Math.round(150 * share), 0x0f1f), [share])
  const petals = useMemo(() => cloud(Math.round(200 * share), 0x9e7a), [share])
  const lilyMeshes = useRef<Mesh[]>([])

  const materials = useMemo(() => {
    const fog = () => ({
      uFogColor: { value: new Color('#2a3244') },
      uFogNear: { value: 62 },
      uFogFar: { value: 235 },
    })
    return {
      pad: new ShaderMaterial({
        vertexShader: PAD_VERT,
        fragmentShader: PAD_FRAG,
        uniforms: { uTime: { value: 0 }, uMoonDir: { value: MOON_DIR }, uMoonLight: { value: MOONLIGHT }, ...fog() },
      }),
      bloom: new ShaderMaterial({
        vertexShader: BLOOM_VERT,
        fragmentShader: BLOOM_FRAG,
        side: DoubleSide,
        uniforms: { uTime: { value: 0 }, uMoonLight: { value: MOONLIGHT }, ...fog() },
      }),
      glow: new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
      }),
      firefly: new ShaderMaterial({
        vertexShader: FIREFLY_VERT,
        fragmentShader: FIREFLY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uAt: { value: new Vector3() }, uAmount: { value: 0 }, uPixel: { value: 1 } },
      }),
      petal: new ShaderMaterial({
        vertexShader: PETAL_VERT,
        fragmentShader: PETAL_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAt: { value: new Vector3() },
          uAmount: { value: 0 },
          uPixel: { value: 1 },
          uMoonLight: { value: MOONLIGHT },
        },
      }),
    }
  }, [])

  useEffect(
    () => () => {
      lilies.pads.dispose()
      lilies.blooms.dispose()
      lilies.glows.dispose()
    },
    [lilies],
  )
  useEffect(() => () => fireflies.dispose(), [fireflies])
  useEffect(() => () => petals.dispose(), [petals])
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials])

  const lastArch = MOONBREAK.arches[MOONBREAK.arches.length - 1]
  const clock = useRef(0)

  useFrame((state, delta) => {
    clock.current += Math.min(0.05, delta)
    const t = clock.current
    const s = deep.s
    const dry = 1 - smooth(0.02, 0.2, deep.at)
    const orchard = district(s, MOONBREAK.orchard.from - 30, MOONBREAK.orchard.to + 50, 30)
    const reeds = district(s, MOONBREAK.reeds.from, MOONBREAK.reeds.to, 30)
    const home = Math.max(1 - smooth(90, 150, s), smooth(lastArch - 60, lastArch, s))
    const camera = state.camera.position
    const pixel = state.gl.getPixelRatio()

    for (const material of [materials.pad, materials.bloom]) {
      material.uniforms.uTime.value = t
      material.uniforms.uFogColor.value.copy(deep.fog)
      material.uniforms.uFogNear.value = deep.near
      material.uniforms.uFogFar.value = deep.far
    }
    materials.glow.uniforms.uTime.value = t
    for (const mesh of lilyMeshes.current) if (mesh) mesh.visible = dry > 0.5

    const fly = materials.firefly.uniforms
    fly.uTime.value = t
    fly.uAmount.value = Math.max(orchard, reeds, home * 0.8) * dry
    fly.uAt.value.set(camera.x, camera.y - 1.3, camera.z)
    fly.uPixel.value = pixel

    const fall = materials.petal.uniforms
    fall.uTime.value = t
    fall.uAmount.value = orchard * dry
    fall.uAt.value.copy(camera)
    fall.uPixel.value = pixel
  })

  const keep = (i: number) => (node: Mesh | null) => {
    if (node) lilyMeshes.current[i] = node
  }

  return (
    <>
      <mesh ref={keep(0)} geometry={lilies.pads} material={materials.pad} frustumCulled={false} />
      <mesh ref={keep(1)} geometry={lilies.blooms} material={materials.bloom} frustumCulled={false} />
      <mesh ref={keep(2)} geometry={lilies.glows} material={materials.glow} frustumCulled={false} renderOrder={3} />
      <points geometry={fireflies} material={materials.firefly} frustumCulled={false} renderOrder={4} />
      <points geometry={petals} material={materials.petal} frustumCulled={false} renderOrder={4} />
    </>
  )
}
