/**
 * The two ponds.
 *
 * The terrain already dips where these sit (see PONDS in systems/terrain.ts),
 * so the water fills a hollow rather than being a disc laid on flat ground —
 * which is the difference between a pond and a swimming pool.
 *
 * The surface is crossed by a few overlapping wave sets at angles that don't
 * divide into each other, so the pattern never visibly repeats. Nothing here is
 * a real reflection: it takes the sky's colour and adds a moving glint, which
 * is most of what a reflection does at this distance for none of the cost.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CircleGeometry, Color, DoubleSide, ShaderMaterial } from 'three'
import type { SkyPalette } from '@/systems/palette'

const VERT = /* glsl */ `
  // qualified because the fragment stage is mediump — an unqualified float
  // would be highp here and the two declarations would not match
  uniform highp float uTime;
  varying vec2 vLocal;
  varying float vDepth;
  varying float vLift;

  void main() {
    vLocal = position.xy;

    // the surface itself moves a little, so the rim laps at the bank
    float lift =
        sin(position.x * 0.9 + uTime * 1.1) * 0.012
      + sin(position.y * 1.15 - uTime * 0.8) * 0.010;
    vLift = lift;

    vec3 p = vec3(position.x, position.y, position.z + lift);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform highp float uTime;
  uniform float uRadius;
  uniform float uSun;

  varying vec2 vLocal;
  varying float vDepth;
  varying float vLift;

  void main() {
    vec2 p = vLocal;

    // Three wave sets at angles that aren't multiples of each other. Two would
    // beat against each other and show a grid; these never line up.
    float w1 = sin(p.x * 1.30 + p.y * 0.42 + uTime * 1.30);
    float w2 = sin(p.x * -0.61 + p.y * 1.53 - uTime * 0.95);
    float w3 = sin(p.x * 0.94 - p.y * 0.88 + uTime * 1.72);
    float ripple = (w1 + w2 * 0.8 + w3 * 0.55) / 2.35;

    // deeper in the middle, shallower and warmer at the bank
    float toEdge = clamp(length(p) / uRadius, 0.0, 1.0);
    vec3 col = mix(uDeep, uSky, 0.35 + ripple * 0.10);
    col = mix(col, uSky, pow(toEdge, 3.0) * 0.35);

    // glints — only the crests, only in sunlight
    float crest = smoothstep(0.72, 0.98, ripple);
    col += uSky * crest * 0.5 * uSun;

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    // fade out at the rim so the disc's edge never shows as a hard circle
    float alpha = 1.0 - smoothstep(0.82, 1.0, toEdge);
    gl_FragColor = vec4(col, alpha * 0.93);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * One sheet of water. Exported because the Pond is the same surface at a
 * different size — duplicating the shader so the big one could differ by a
 * couple of constants would guarantee they drifted apart.
 */
export function WaterSurface({
  x,
  z,
  radius,
  surface,
  palette,
}: {
  x: number
  z: number
  radius: number
  /** World height of the waterline. */
  surface: number
  palette: SkyPalette
}) {
  const geometry = useMemo(() => new CircleGeometry(radius, 48), [radius])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        side: DoubleSide,
        uniforms: {
          uDeep: { value: new Color('#22333a') },
          uSky: { value: new Color('#c8d2c4') },
          uFogColor: { value: new Color('#c3cebe') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uTime: { value: 0 },
          uRadius: { value: radius },
          uSun: { value: 1 },
        },
      }),
    [radius],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    // the water takes its colour from the sky, which is what actually sells it
    u.uSky.value.set(palette.skyBottom)
    u.uFogColor.value.set(palette.fogColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uSun.value = Math.min(1, palette.sunIntensity)
  }, [material, palette])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[x, surface, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
      renderOrder={2}
    />
  )
}
