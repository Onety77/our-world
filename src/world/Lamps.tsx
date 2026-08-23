/**
 * Lamps along the paths, lit only after dark.
 *
 * Kept sparse and dim on purpose. A garden lined with bright lamps stops being
 * a garden at night and becomes a car park — what these are for is to give the
 * dark somewhere to be, not to abolish it.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  ShaderMaterial,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { daylightAt } from '@/systems/time'
import { groundHeight } from '@/systems/terrain'
import { buildInstanced, useFormMaterial, type FormInstance } from './forms'

const POST = '#2e2a26'
const LAMP_HEIGHT = 3.2
const FLAME = '#ffc978'

const SPOTS: [number, number][] = [
  [-14, 12],
  [15, 11],
  [-22, 20],
  [39, -14],
  [4, -24],
  [-18, -14],
  [26, 22],
  [-4, 30],
]

/** The glowing head and the pool of light it throws, both fading in at dusk. */
const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  uniform float uBillboard;
  void main() {
    vUv = uv;
    if (uBillboard > 0.5) {
      vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
      vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
      vec3 offset = right * position.x + up * position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(offset, 1.0);
    } else {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  }
`

const GLOW_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uCore;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float core = 1.0 - smoothstep(uCore * 0.6, uCore, d);
    float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 2.8);
    float a = clamp(core + halo * 0.7, 0.0, 1.0) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function useGlowMaterial(billboard: boolean, core: number) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uColor: { value: new Color(FLAME) },
          uOpacity: { value: 0 },
          uCore: { value: core },
          uBillboard: { value: billboard ? 1 : 0 },
        },
      }),
    [billboard, core],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

export function Lamps({
  palette,
  spots = SPOTS,
}: {
  palette: SkyPalette
  /** Defaults to the hand-placed ones; the decor system passes its own. */
  spots?: [number, number][]
}) {
  const posts = useMemo(() => {
    const parts: FormInstance[] = spots.map(([x, z]) => ({
      offset: [x, groundHeight(x, z) + LAMP_HEIGHT / 2, z],
      scale: [0.07, LAMP_HEIGHT, 0.07],
      rot: 0,
      phase: 0,
      color: POST,
    }))
    const base = new CylinderGeometry(1, 1.4, 1, 5, 1)
    const geo = buildInstanced(base, parts)
    base.dispose()
    return geo
  }, [spots])

  useEffect(() => () => posts.dispose(), [posts])

  const postMaterial = useFormMaterial(palette, { sway: 0 })
  const headMaterial = useGlowMaterial(true, 0.34)
  const poolMaterial = useGlowMaterial(false, 0.12)

  // Night is when these matter, and nothing else about them changes — so the
  // whole thing is one number driven off the hour.
  const lit = Math.pow(1 - daylightAt(palette.hour), 2.2)

  useEffect(() => {
    headMaterial.uniforms.uOpacity.value = lit
    poolMaterial.uniforms.uOpacity.value = lit * 0.5
  }, [headMaterial, poolMaterial, lit])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    postMaterial.uniforms.uTime.value = t.current
    // a slow unsteadiness, so they read as flame rather than as LEDs
    const flicker = 0.92 + Math.sin(t.current * 2.3) * 0.05 + Math.sin(t.current * 5.7) * 0.03
    headMaterial.uniforms.uOpacity.value = lit * flicker
    poolMaterial.uniforms.uOpacity.value = lit * 0.5 * flicker
  })

  return (
    <>
      <mesh geometry={posts} material={postMaterial} frustumCulled={false} />
      {lit > 0.01 &&
        spots.map(([x, z]) => {
          const y = groundHeight(x, z)
          return (
            <group key={`${x},${z}`}>
              <mesh
                position={[x, y + LAMP_HEIGHT, z]}
                material={headMaterial}
                frustumCulled={false}
                renderOrder={4}
              >
                <planeGeometry args={[2.4, 2.4]} />
              </mesh>
              <mesh
                position={[x, y + 0.05, z]}
                rotation={[-Math.PI / 2, 0, 0]}
                material={poolMaterial}
                renderOrder={3}
              >
                <planeGeometry args={[9, 9]} />
              </mesh>
            </group>
          )
        })}
    </>
  )
}
