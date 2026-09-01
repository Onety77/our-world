/**
 * Dust in the light.
 *
 * The one thing in the brief's list of atmosphere that genuinely earns its
 * frame time. A shaft of coloured light falling across a stone floor is
 * *invisible* until something is floating in it — that is how light in air
 * works, and it is why every photograph of a cathedral has dust in it. Without
 * this the pools on the floor read as paint.
 *
 * One instanced quad each, drifting on a loop with no state and no simulation:
 * position is a function of time and the mote's own seed, so this costs one
 * draw call and no CPU at all. They rise, because warm air in a glasshouse
 * does, and they wrap rather than dying so nothing ever pops out of existence.
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
import { makeRng, range, seedFrom } from '@/systems/rng'
import type { SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { HALF, RIDGE } from './layout'

/** However long the Glasshouse gets, never more than this. */
const MOST = 900

const VERT = /* glsl */ `
  attribute vec3 iSeed;
  attribute float iSize;

  uniform float uTime;
  uniform float uLength;

  varying float vFade;
  varying vec2 vUv;

  void main() {
    vUv = uv;

    /*
      Rising and wandering, on a loop that never ends.

      Taking the fractional part of the rise is what makes it seamless: a mote
      reaching the ridge reappears at the floor in the same breath, and because
      they all started at different heights nothing about that is visible.
    */
    float rise = fract(iSeed.y + uTime * 0.016);
    float y = rise * ${RIDGE.toFixed(2)};

    float wander = sin(uTime * 0.24 + iSeed.x * 40.0) * 0.5
      + sin(uTime * 0.41 + iSeed.z * 27.0) * 0.28;

    vec3 at = vec3(
      (iSeed.x * 2.0 - 1.0) * ${HALF.toFixed(2)} + wander * 0.5,
      y,
      iSeed.z * uLength
    );

    // Faint at the floor and at the ridge, so they arrive and leave rather
    // than blinking on.
    vFade = smoothstep(0.0, 0.18, rise) * (1.0 - smoothstep(0.72, 1.0, rise));

    /*
      Camera-facing, and done here rather than with a billboard matrix: taking
      the model-view matrix's own right and up vectors turns the quad toward
      the eye for free, whatever the camera is doing.
    */
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 world = at + (right * position.x + up * position.y) * iSize;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uLight;
  varying float vFade;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float dot = 1.0 - smoothstep(0.25, 1.0, d);
    float a = dot * dot * vFade * 0.5 * max(0.2, uLight);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(uColor * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Motes({
  length,
  palette,
  density = 2.2,
}: {
  length: number
  palette: SkyPalette
  /** Motes per metre. Quality tiers thin these before dropping frame rate. */
  density?: number
}) {
  const count = Math.min(MOST, Math.round(length * density))

  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const rng = makeRng(seedFrom('glasshouse:motes'))
    const n = Math.max(1, count)
    const seed = new Float32Array(n * 3)
    const size = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      seed[i * 3] = rng()
      seed[i * 3 + 1] = rng()
      seed[i * 3 + 2] = rng()
      size[i] = range(rng, 0.012, 0.034)
    }
    geo.setAttribute('iSeed', new InstancedBufferAttribute(seed, 3))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 1))
    geo.instanceCount = count
    quad.dispose()
    return geo
  }, [count])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        // Built from the view matrix's own right and up vectors, which is a
        // remap — see the note on the pools. A camera-facing quad culled by
        // winding is invisible from exactly half the angles.
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uLength: { value: 40 },
          uColor: { value: new Color('#e8dcc4') },
          uLight: { value: 1 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    material.uniforms.uLength.value = length
    material.uniforms.uLight.value = ambientLightLevel(palette)
    // Dust takes the colour of whatever is lighting it, which at dusk in here
    // is mostly the glass.
    ;(material.uniforms.uColor.value as Color).set(palette.sunColor)
  }, [material, length, palette])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  if (count === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
