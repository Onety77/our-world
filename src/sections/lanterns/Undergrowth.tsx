/**
 * What grows along the lane — and it is lit by the lanterns.
 *
 * ---------------------------------------------------------------------------
 * **The ground here was a coloured plane, and that was the largest thing wrong
 * with the place.**
 *
 * Every other part of this garden stands on something growing: the meadow runs
 * twenty-two thousand blades, and it is most of why the world reads as a place
 * rather than as a diagram. The lane had none, because it carries its own
 * ground and the world's grass is wrapped around the *camera* using the shared
 * height function — it cannot sit on a graded shelf. So the shelf got nothing,
 * and a smooth gradient with a path painted down it is exactly what it looked
 * like.
 *
 * **The light is baked, which is the whole trick.** A lantern never moves, and
 * neither does a blade of grass, so how much light this blade gets from that
 * lantern is a fact that can be worked out once and stored on the vertex. Every
 * blade near the lane carries the summed colour of the lamps around it, and the
 * fragment shader adds it. The result is grass that genuinely glows warm under
 * a warm lantern and cool under hers, with pools of dark between them — for one
 * float3 per blade and no runtime cost at all.
 *
 * Doing it any other way means either a real light per lantern, which is dozens
 * of forward lights, or a distance loop in the shader over an array of lamp
 * positions. Both are expensive, and both would recompute every frame an answer
 * that cannot change.
 * ---------------------------------------------------------------------------
 *
 * One draw call for the grass and one for the clumps. Nothing is drawn on the
 * worn path itself, which is what keeps the path a path.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  BufferGeometry,
  ShaderMaterial,
} from 'three'
import type { Memory } from '@/data/types'
import { makeRng, range, seedFrom } from '@/systems/rng'
import { LIGHT_COLORS, type SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { useLanternLight } from '@/systems/lanternLight'
import { SPACING, WALK_Y, hangingFor, pathAt } from './layout'

/** Blades per metre of lane. Thinned by the quality tier before it hurts. */
const DENSITY = 320

/** However long the walk gets, never more than this many blades. */
const MOST = 34000

/** How far either side of the centreline anything grows. */
const SPREAD = 7.5

/** The worn path, kept bare — the same half-width `Lane` wears. */
const BARE = 1.15

/**
 * How far a lantern's light reaches across the ground, in metres.
 *
 * Generous. This is not the pool you can see on the path — that is `Pools`, and
 * it is drawn — this is how far the *grass* still knows there is a lamp above
 * it. Cutting it short leaves a hard rim of lit grass, which is the one thing
 * that would give the bake away.
 */
const REACH = 6.5

const VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iGlow;
  attribute float iYaw;
  attribute float iTall;
  attribute float iLean;
  attribute float iPhase;

  uniform float uTime;
  uniform float uWind;

  varying vec2 vUv;
  varying vec3 vGlow;
  varying float vDepth;
  varying float vUp;

  void main() {
    vUv = uv;
    vGlow = iGlow;
    vUp = uv.y;

    /*
      The blade, bent over as it rises.

      'uv.y' runs from the root to the tip, so everything that should happen
      more at the top is simply multiplied by it, or by its square where the
      bend wants to be gentler at the bottom than a straight line gives.
    */
    float up = uv.y;
    float bend = up * up;

    // Wind: one slow travelling wave, offset per blade so the field never
    // moves as one sheet.
    float gust = sin(uTime * 1.35 + iPhase + iAt.x * 0.22 + iAt.z * 0.18);
    float sway = (iLean + gust * uWind * 0.42) * bend;

    vec3 local = vec3(position.x * 0.013, up * iTall, 0.0);
    local.x += sway * 0.5;
    local.z += sway * 0.34;

    float c = cos(iYaw);
    float s = sin(iYaw);
    vec3 turned = vec3(local.x * c - local.z * s, local.y, local.x * s + local.z * c);

    vec4 eye = modelViewMatrix * vec4(iAt + turned, 1.0);
    vDepth = -eye.z;
    gl_Position = projectionMatrix * eye;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform float uLight;
  uniform float uLamps;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec2 vUv;
  varying vec3 vGlow;
  varying float vDepth;
  varying float vUp;

  void main() {
    vec3 col = mix(uBase, uTip, vUp * vUp) * (0.4 + 0.6 * uLight);

    /*
      And the lanterns, baked in.

      Added rather than mixed, because this is light arriving — a blade under a
      warm lamp is its own green *plus* that lamp, which is why the grass by a
      lantern goes golden at the tip and stays green in the shadow at its root.
      Stronger after dark for the same reason everything else here is: the sun
      has stopped competing.
    */
    float night = 1.0 - uLight;
    col += vGlow * uLamps * (0.45 + 0.85 * night) * (0.35 + 0.65 * vUp);

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** A tapered blade, two segments, no index waste. */
function bladeGeometry(): BufferGeometry {
  const segments = 2
  const position: number[] = []
  const uv: number[] = []
  const index: number[] = []
  for (let i = 0; i <= segments; i++) {
    const v = i / segments
    const half = Math.pow(1 - v, 0.7)
    position.push(-half, v, 0, half, v, 0)
    uv.push(0, v, 1, v)
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geo.setIndex(index)
  return geo
}

export function Undergrowth({
  memories,
  length,
  palette,
  density = 1,
}: {
  memories: Memory[]
  length: number
  palette: SkyPalette
  /** Scaled by the quality tier, before frame rate is. */
  density?: number
}) {
  const lampGain = useLanternLight((s) => s.lamps)
  /*
    The lanterns, as points of light with a colour, worked out once.

    Held apart from the blade loop so a blade only has to look at the handful of
    lamps that could possibly reach it, rather than at all two hundred.
  */
  const lamps = useMemo(() => {
    const warm = new Color(LIGHT_COLORS.warm)
    const cool = new Color(LIGHT_COLORS.cool)
    const tint = new Color()
    return memories.map((memory, i) => {
      const hung = hangingFor(i)
      tint.set(memory.tint).lerp(memory.by === 'cool' ? cool : warm, 0.55)
      return { x: hung.x, y: hung.y, z: hung.z, r: tint.r, g: tint.g, b: tint.b }
    })
  }, [memories])

  const geometry = useMemo(() => {
    const blade = bladeGeometry()
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', blade.attributes.position)
    geo.setAttribute('uv', blade.attributes.uv)
    if (blade.index) geo.setIndex(blade.index)

    const grown = length + 24
    const count = Math.min(MOST, Math.round(grown * DENSITY * density))
    const at = new Float32Array(Math.max(1, count) * 3)
    const glow = new Float32Array(Math.max(1, count) * 3)
    const yaw = new Float32Array(Math.max(1, count))
    const tall = new Float32Array(Math.max(1, count))
    const lean = new Float32Array(Math.max(1, count))
    const phase = new Float32Array(Math.max(1, count))

    const rng = makeRng(seedFrom('lanterns:undergrowth'))

    for (let n = 0; n < count; n++) {
      const s = range(rng, -12, grown)
      const here = pathAt(s)

      /*
        Off the path, and thickening as it goes out.

        A square-rooted spread pushes blades away from the centre by area rather
        than by distance, so the verge is dense and the trodden edge is thin —
        which is what a path through grass actually looks like, and it means the
        few blades that do sit near the edge read as strays rather than as a
        hedge with a hole in it.
      */
      const side = rng() < 0.5 ? -1 : 1
      const lat = side * (BARE + Math.sqrt(rng()) * (SPREAD - BARE))

      const x = here.x + Math.cos(here.yaw) * lat
      const z = here.z + Math.sin(here.yaw) * lat

      at[n * 3] = x
      at[n * 3 + 1] = WALK_Y
      at[n * 3 + 2] = z

      /*
        Every lamp that can reach this blade, summed.

        Only the ones within a couple of spacings along the lane are worth
        asking about — a lantern six metres away in `s` is already past `REACH`
        even standing on the path — so this is a handful of tests per blade
        rather than one per memory. A hundred memories costs the same as ten.
      */
      let r = 0
      let g = 0
      let b = 0
      const first = Math.max(0, Math.floor((s - REACH) / SPACING) - 1)
      const last = Math.min(lamps.length - 1, Math.ceil((s + REACH) / SPACING) + 1)
      for (let i = first; i <= last; i++) {
        const lamp = lamps[i]
        if (!lamp) continue
        const dx = lamp.x - x
        const dy = lamp.y - WALK_Y
        const dz = lamp.z - z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d >= REACH) continue
        // Squared falloff, so the light has a bright foot and a long soft edge.
        const fall = (1 - d / REACH) ** 2
        r += lamp.r * fall
        g += lamp.g * fall
        b += lamp.b * fall
      }
      // Clamped, because three lanterns close together on a bend would
      // otherwise burn the grass between them to white.
      glow[n * 3] = Math.min(0.85, r)
      glow[n * 3 + 1] = Math.min(0.85, g)
      glow[n * 3 + 2] = Math.min(0.85, b)

      yaw[n] = rng() * Math.PI
      tall[n] = range(rng, 0.16, 0.40)
      lean[n] = range(rng, -0.22, 0.22)
      phase[n] = rng() * Math.PI * 2
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iGlow', new InstancedBufferAttribute(glow, 3))
    geo.setAttribute('iYaw', new InstancedBufferAttribute(yaw, 1))
    geo.setAttribute('iTall', new InstancedBufferAttribute(tall, 1))
    geo.setAttribute('iLean', new InstancedBufferAttribute(lean, 1))
    geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
    geo.instanceCount = count
    blade.dispose()
    return geo
  }, [length, density, lamps])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: 0.5 },
          uBase: { value: new Color('#2b3a24') },
          uTip: { value: new Color('#4d5c33') },
          uLight: { value: 1 },
          uLamps: { value: 1 },
          uFogColor: { value: new Color('#cfd8dc') },
          uFogNear: { value: 30 },
          uFogFar: { value: 150 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    ;(u.uBase.value as Color).set(palette.grassBase)
    ;(u.uTip.value as Color).set(palette.grassTip)
    u.uLight.value = ambientLightLevel(palette)
    u.uLamps.value = lampGain
    ;(u.uFogColor.value as Color).set(palette.fogColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uWind.value = palette.wind
  }, [material, palette, lampGain])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />
}
