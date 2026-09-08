/**
 * The light each lantern throws down onto the lane.
 *
 * ---------------------------------------------------------------------------
 * **Without this the lanterns are bright rectangles, not lights.**
 *
 * A lamp is only read as a lamp when you can see what it is lighting. The first
 * build of this place had eighteen lit panes hanging over ground that was
 * evenly lit by the sky — so nothing on the path owed anything to them, and the
 * chain read as coloured signage rather than as the thing holding the darkness
 * off. Dimming the place was half the fix; this is the other half.
 *
 * Each pool is one flat additive quad at its lantern's foot, in that memory's
 * own colour pulled towards its keeper's light. Overlapping pools on a bend
 * add, which is exactly right: the middle of a busy stretch of lane genuinely
 * is brighter than its ends, and that is the thing the eye reads as *many*.
 * ---------------------------------------------------------------------------
 *
 * One draw call for the whole walk. They do not move — the lane does — so the
 * buffers are built once per change to the memories and then left alone.
 */

import { useEffect, useMemo } from 'react'
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
import { LIGHT_COLORS, type SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { useLanternLight } from '@/systems/lanternLight'
import { WALK_Y, hangingFor } from './layout'

/** Longest walk this lights. */
const MOST = 600

/**
 * How wide a pool is, in metres.
 *
 * Wider than feels right on paper. A tight pool under a lamp is what a bright
 * lamp does to tarmac at midnight; these are soft lights in mist over grass,
 * and the reason to draw them at all is to join up along the lane rather than
 * to make eighteen separate discs.
 */
const WIDE = 5.2

/** How far above the ground the quad lies, to stay out of its depth. */
const LIFT = 0.02

const VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iTint;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vDepth;

  void main() {
    vUv = uv;
    vTint = iTint;
    // Flat on the ground: the quad arrives upright, so its y becomes z.
    vec3 local = vec3(position.x, 0.0, position.y) * ${WIDE.toFixed(2)};
    vec4 eye = modelViewMatrix * vec4(iAt + local, 1.0);
    vDepth = -eye.z;
    gl_Position = projectionMatrix * eye;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform float uNight;
  uniform float uFogFar;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vDepth;

  void main() {
    float d = length(vUv - 0.5) * 2.0;

    /*
      Falling off as a square rather than linearly.

      Light does, and the difference is the whole character of the thing: a
      linear pool has a visible rim and reads as a painted circle, while this
      has a bright middle that fades to nothing and reads as light. Squared
      twice at the centre so there is a genuine hot spot under the lamp.
    */
    float fall = 1.0 - smoothstep(0.0, 1.0, d);
    float pool = fall * fall * (0.55 + 0.45 * fall);

    float a = pool * uNight * 0.42;
    // Pools far enough away are past anything the eye can separate, and adding
    // hundreds of them into the fog turns the far lane into a glowing band.
    a *= 1.0 - smoothstep(uFogFar * 0.35, uFogFar * 0.85, vDepth);
    if (a <= 0.003) discard;

    gl_FragColor = vec4(vTint * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Pools({ memories, palette }: { memories: Memory[]; palette: SkyPalette }) {
  const lamps = useLanternLight((s) => s.lamps)
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const count = Math.min(MOST, memories.length)
    const at = new Float32Array(Math.max(1, count) * 3)
    const tint = new Float32Array(Math.max(1, count) * 3)
    const colour = new Color()
    const warm = new Color(LIGHT_COLORS.warm)
    const cool = new Color(LIGHT_COLORS.cool)

    for (let i = 0; i < count; i++) {
      const hung = hangingFor(i)
      at[i * 3] = hung.x
      at[i * 3 + 1] = WALK_Y + LIFT
      at[i * 3 + 2] = hung.z
      /*
        The picture's colour, pulled well towards its keeper's light.

        On the pane the photograph should win, because you are looking at the
        photograph. On the ground it is the *lamp* you are seeing the effect of,
        and a lamp is warm or cool depending on which of you lit it — which
        makes the floor of the lane say who has been along it, in the same
        breath as the footprints.
      */
      colour.set(memories[i].tint).lerp(memories[i].by === 'cool' ? cool : warm, 0.62)
      tint[i * 3] = colour.r
      tint[i * 3 + 1] = colour.g
      tint[i * 3 + 2] = colour.b
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.instanceCount = count
    quad.dispose()
    return geo
  }, [memories])

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
        uniforms: { uNight: { value: 0.6 }, uFogFar: { value: 120 } },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    // Never nothing, even at noon under the canopy: a lit lamp still puts a
    // little colour on the ground, and none at all reads as switched off.
    material.uniforms.uNight.value = (0.3 + 0.7 * (1 - ambientLightLevel(palette))) * lamps
    material.uniforms.uFogFar.value = palette.fogFar
  }, [material, palette, lamps])

  if (memories.length === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />
}
