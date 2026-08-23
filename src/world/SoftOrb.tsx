/**
 * A soft glowing disc that always faces the camera.
 *
 * Used for both moons and for the other person's light — they are the same
 * object at different scales, which is deliberate: the thing in the sky and the
 * thing standing next to you are both "someone, somewhere".
 */

import { useEffect, useMemo } from 'react'
import { AdditiveBlending, Color, NormalBlending, ShaderMaterial } from 'three'

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Billboard by rebuilding the quad from the view matrix's right/up axes,
    // so it faces the camera without a per-frame CPU lookAt.
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 offset = right * position.x + up * position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(offset, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uCore;
  uniform vec3 uHalo;
  uniform float uOpacity;
  uniform float uCoreSize;
  uniform float uHaloStrength;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;

    // Soft-edged disc rather than a hard one. The falloff is deliberately wide
    // relative to the disc: at this distance a sharp edge is two pixels of
    // aliasing, and it reads as a sticker rather than as light.
    float core = 1.0 - smoothstep(uCoreSize * 0.68, uCoreSize * 1.12, d);
    float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 3.0);

    vec3 col = mix(uHalo, uCore, core);
    float a = clamp(core + halo * uHaloStrength, 0.0, 1.0) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * `additive` is right for a light *in* the garden — it brightens whatever it
 * sits in front of. It is wrong for something in the sky: adding to an already
 * bright daytime sky does nothing at all, and the moons vanish by day. Those
 * use normal blending so they read against any sky.
 */
export type OrbBlend = 'additive' | 'normal'

export function useSoftOrbMaterial(opts: {
  core: string
  halo: string
  coreSize?: number
  depthTest?: boolean
  blend?: OrbBlend
  haloStrength?: number
}) {
  const {
    core,
    halo,
    coreSize = 0.42,
    depthTest = true,
    blend = 'additive',
    haloStrength = 0.6,
  } = opts

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest,
        blending: blend === 'additive' ? AdditiveBlending : NormalBlending,
        uniforms: {
          uCore: { value: new Color(core) },
          uHalo: { value: new Color(halo) },
          uOpacity: { value: 1 },
          uCoreSize: { value: coreSize },
          uHaloStrength: { value: haloStrength },
        },
      }),
    [depthTest, coreSize, core, halo, blend, haloStrength],
  )

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    material.uniforms.uCore.value.set(core)
    material.uniforms.uHalo.value.set(halo)
  }, [material, core, halo])

  return material
}

export function SoftOrb({
  position,
  size,
  core,
  halo,
  opacity = 1,
  coreSize = 0.42,
  depthTest = true,
  renderOrder = 0,
  blend = 'additive',
  haloStrength = 0.6,
}: {
  position: [number, number, number]
  size: number
  core: string
  halo: string
  opacity?: number
  coreSize?: number
  depthTest?: boolean
  renderOrder?: number
  blend?: OrbBlend
  haloStrength?: number
}) {
  const material = useSoftOrbMaterial({
    core,
    halo,
    coreSize,
    depthTest,
    blend,
    haloStrength,
  })

  useEffect(() => {
    material.uniforms.uOpacity.value = opacity
  }, [material, opacity])

  return (
    <mesh
      position={position}
      material={material}
      renderOrder={renderOrder}
      frustumCulled={false}
    >
      <planeGeometry args={[size, size]} />
    </mesh>
  )
}
