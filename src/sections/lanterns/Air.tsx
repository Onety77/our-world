/**
 * What drifts in the lantern light.
 *
 * ---------------------------------------------------------------------------
 * **A light in clear air is a bright rectangle. A light with something moving
 * in it is a lamp.**
 *
 * The room that stood here learned this and wrote it down: a shaft of coloured
 * light falling across a floor is *invisible* until something is floating in
 * it, which is why every photograph of a cathedral has dust in it. Out here it
 * matters more, not less — the whole place is now dark on purpose, so the only
 * things carrying the light are the halos, the pools on the ground, and this.
 *
 * Each mote belongs to a lantern and stays near it, taking its colour. That is
 * what makes them read as *this lamp's* air rather than as weather: they thin
 * out between lanterns exactly as the light does, and a long empty stretch of
 * lane has nothing floating over it because there is nothing lighting it.
 * ---------------------------------------------------------------------------
 *
 * Position is a function of time and the mote's own seed — no simulation, no
 * state, one draw call and nothing on the CPU. They rise, because warm air off
 * a lamp does, and they wrap rather than dying so nothing ever pops out.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import type { Memory } from '@/data/types'
import { makeRng, range, seedFrom } from '@/systems/rng'
import { LIGHT_COLORS, type SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { useLanternLight } from '@/systems/lanternLight'
import { hangingFor } from './layout'

/** Motes around each lantern. */
const EACH = 9

/** However long the walk gets, never more than this many. */
const MOST = 1400

/** How far from its lantern a mote wanders, in metres. */
const AROUND = 1.5

const VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iTint;
  attribute vec3 iSeed;
  attribute float iSize;

  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vFade;

  void main() {
    vUv = uv;
    vTint = iTint;

    /*
      Rising and wandering, on a loop with no beginning.

      Taking the fractional part of the rise is what makes it seamless: a mote
      reaching the top reappears at the bottom in the same breath, and because
      they all started at different heights nothing about that is visible.
    */
    float rise = fract(iSeed.y + uTime * 0.035);
    float wander = sin(uTime * 0.5 + iSeed.x * 41.0) * 0.5
                 + sin(uTime * 0.83 + iSeed.z * 27.0) * 0.28;

    vec3 at = iAt + vec3(
      (iSeed.x * 2.0 - 1.0) * ${AROUND.toFixed(2)} + wander * 0.35,
      (rise - 0.5) * 1.9,
      (iSeed.z * 2.0 - 1.0) * ${AROUND.toFixed(2)} + wander * 0.22
    );

    // Faint at the top and bottom of its travel, so they arrive and leave
    // rather than blinking on.
    vFade = smoothstep(0.0, 0.2, rise) * (1.0 - smoothstep(0.72, 1.0, rise));

    // Camera-facing, from the model-view matrix's own axes — a speck of light
    // has no orientation, and one that turns goes edge-on and disappears.
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 world = at + (right * position.x + up * position.y) * iSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision mediump float;
  uniform float uNight;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vFade;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float dot = 1.0 - smoothstep(0.2, 1.0, d);
    float a = dot * dot * vFade * uNight * 0.62;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(vTint * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Air({
  memories,
  palette,
  density = 1,
}: {
  memories: Memory[]
  palette: SkyPalette
  density?: number
}) {
  const lamps = useLanternLight((s) => s.lamps)
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const each = Math.max(2, Math.round(EACH * density))
    const count = Math.min(MOST, memories.length * each)
    const at = new Float32Array(Math.max(1, count) * 3)
    const tint = new Float32Array(Math.max(1, count) * 3)
    const seed = new Float32Array(Math.max(1, count) * 3)
    const size = new Float32Array(Math.max(1, count))

    const rng = makeRng(seedFrom('lanterns:air'))
    const colour = new Color()
    const warm = new Color(LIGHT_COLORS.warm)
    const cool = new Color(LIGHT_COLORS.cool)

    let n = 0
    for (let i = 0; i < memories.length && n < count; i++) {
      const hung = hangingFor(i)
      colour.set(memories[i].tint).lerp(memories[i].by === 'cool' ? cool : warm, 0.62)
      for (let k = 0; k < each && n < count; k++, n++) {
        at[n * 3] = hung.x
        at[n * 3 + 1] = hung.y
        at[n * 3 + 2] = hung.z
        tint[n * 3] = colour.r
        tint[n * 3 + 1] = colour.g
        tint[n * 3 + 2] = colour.b
        seed[n * 3] = rng()
        seed[n * 3 + 1] = rng()
        seed[n * 3 + 2] = rng()
        size[n] = range(rng, 0.014, 0.042)
      }
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iSeed', new InstancedBufferAttribute(seed, 3))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 1))
    geo.instanceCount = count
    quad.dispose()
    return geo
  }, [memories, density])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uTime: { value: 0 }, uNight: { value: 0.7 } },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    material.uniforms.uNight.value = (0.25 + 0.75 * (1 - ambientLightLevel(palette))) * lamps
  }, [material, palette, lamps])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  if (memories.length === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
}
