/**
 * A fire, anywhere one is needed.
 *
 * A handful of instanced billboard tongues that rise, narrow and fade on
 * offset phases, plus the point light that does most of the convincing.
 * Extracted from the Hollow so the cave under it burns with the same flame.
 *
 * Hard lessons preserved from the first version, in order of how long each
 * one took to find:
 *  - per-tongue values must be *instanced* attributes; a plain attribute is
 *    read per vertex, and three of a quad's four corners get garbage.
 *  - reversed-edge smoothstep is undefined in GLSL and returns zero.
 *  - a uniform read by both stages at two precisions fails to LINK, silently;
 *    hence vLife is computed in the vertex stage and passed down.
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

const FIRE_VERT = /* glsl */ `
  attribute float iPhase;
  attribute float iScale;
  varying vec2 vUv;
  varying float vLife;

  uniform float uTime;
  uniform float uHeight;
  uniform float uWidth;

  void main() {
    vUv = uv;

    float t = fract(uTime * 0.55 + iPhase);
    vLife = sin(t * 3.14159);

    vec3 p = position;
    p.x *= (1.0 - t * 0.55) * iScale * uWidth;
    p.y = (p.y + 0.5) * iScale * (uHeight * (0.55 + t));

    // lean, so it never looks like a stack of identical tongues
    p.x += sin(uTime * 2.1 + iPhase * 9.0) * t * 0.42;

    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 local = right * p.x + up * p.y;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
  }
`

const FIRE_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  varying float vLife;

  void main() {
    // white-hot at the base, orange through the middle, gone at the top
    vec3 hot = vec3(1.0, 0.93, 0.72);
    vec3 mid = vec3(1.0, 0.55, 0.16);
    vec3 col = mix(hot, mid, clamp(vUv.y * 1.4, 0.0, 1.0));

    float body = 1.0 - smoothstep(0.1, 0.95, abs(vUv.x - 0.5) * 2.0);
    float top = 1.0 - smoothstep(0.35, 1.0, vUv.y);

    float a = body * top * vLife * 0.27;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const TONGUES = 11

export interface FireProps {
  position: [number, number, number]
  /** Metres of flame above the base. */
  height?: number
  width?: number
  /** The glow it throws on everything around it. */
  intensity?: number
  lightDistance?: number
  /** Scales the whole light, for day/night. 1 = full night presence. */
  night?: number
}

export function Fire({
  position,
  height = 2.4,
  width = 1.05,
  intensity = 10,
  lightDistance = 26,
  night = 1,
}: FireProps) {
  const geometry = useMemo(() => {
    const base = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('uv', base.attributes.uv)
    if (base.index) geo.setIndex(base.index)

    const phase = new Float32Array(TONGUES)
    const scale = new Float32Array(TONGUES)
    for (let i = 0; i < TONGUES; i++) {
      phase[i] = i / TONGUES
      scale[i] = 0.5 + ((i * 37) % 11) / 20
    }
    geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
    geo.setAttribute('iScale', new InstancedBufferAttribute(scale, 1))
    geo.instanceCount = TONGUES
    base.dispose()
    return geo
  }, [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FIRE_VERT,
        fragmentShader: FIRE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uHeight: { value: height },
          uWidth: { value: width },
        },
      }),
    [height, width],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  const t = useRef(Math.random() * 20)
  const flicker = useRef(1)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
    // the light breathes a little, which is what firelight does
    flicker.current =
      0.92 +
      Math.sin(t.current * 7.3) * 0.04 +
      Math.sin(t.current * 13.7) * 0.04
  })

  const lightRef = useRef<{ intensity: number } | null>(null)
  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.intensity = (intensity + night * intensity * 1.6) * flicker.current
    }
  })

  return (
    <group position={position}>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />
      <pointLight
        ref={lightRef as never}
        color={new Color('#ffb066')}
        intensity={intensity}
        distance={lightDistance}
        decay={2}
        position={[0, 0.8, 0]}
      />
    </group>
  )
}
