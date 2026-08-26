/**
 * Flower heads scattered through the meadow. Same tiling trick as the grass, so
 * they follow you too, and the same wind, so they lean together rather than
 * drifting out of step.
 *
 * No stems — the grass hides where they meet the ground, and stems at this
 * density would cost more than they show.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  Vector2,
} from 'three'
import { FLOWER_COLORS, type SkyPalette } from '@/systems/palette'
import { makeRng, pick, seedFrom } from '@/systems/rng'
import { ambientLightLevel } from './forms'
import { TERRAIN_GLSL, TILE_GLSL } from './terrainShader'

const VERT = /* glsl */ `
  ${TERRAIN_GLSL}
  ${TILE_GLSL}

  attribute vec2 iPos;
  attribute float iScale;
  attribute float iStem;
  attribute float iPhase;
  attribute vec3 iColor;

  uniform float uTime;
  uniform float uWind;
  uniform vec2 uCentre;
  uniform vec2 uFacing;
  uniform float uTile;
  uniform float uFadeStart;
  uniform float uFadeEnd;

  varying vec3 vColor;
  varying float vDepth;
  varying float vFacing;

  void main() {
    vColor = iColor;

    vec2 world = tileAround(iPos, uCentre, uTile);
    // Nothing grows in the water. Flowers used to ignore this and the meadow
    // put blooms straight down the middle of the river.
    float fade = inTheView(world, uCentre, uFacing)
      * (1.0 - smoothstep(uFadeStart, uFadeEnd, distance(world, uCentre)))
               * dryLand(world);

    float gust = sin(uTime * 0.42 + world.x * 0.055 + world.y * 0.041) * 0.5 + 0.5;
    float sway = sin(uTime * 1.4 + iPhase) * 0.5 + sin(uTime * 2.6 + iPhase * 1.6) * 0.18;
    float bend = sway * (0.3 + gust * 0.7) * uWind;

    vec3 p = position * iScale * fade;
    vec3 head = vec3(
      world.x + bend * 0.13,
      gardenHeight(world) + iStem - abs(bend) * 0.03,
      world.y + bend * 0.05
    );

    // cheap top-lighting cue: which way this facet points
    vFacing = normalize(normal).y * 0.5 + 0.5;

    vec4 mv = modelViewMatrix * vec4(p + head, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uFogColor;
  uniform vec3 uSunColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uSun;
  uniform float uLight;

  varying vec3 vColor;
  varying float vDepth;
  varying float vFacing;

  void main() {
    // Flowers are pale, so without scaling by the ambient light level they stay
    // near full brightness after dark and the meadow looks like it's covered in
    // fairy lights. They should go grey at night, like everything else.
    vec3 col = vColor * (0.34 + vFacing * 0.5) * uLight;
    col = mix(col, col * uSunColor * 1.2, 0.35 * uSun);

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Flowers({
  count,
  palette,
  radius,
}: {
  count: number
  palette: SkyPalette
  radius: number
}) {
  const tile = radius * 2

  const geometry = useMemo(() => {
    const base = new IcosahedronGeometry(1, 0)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('normal', base.attributes.normal)
    if (base.index) geo.setIndex(base.index)
    base.dispose()

    const pos = new Float32Array(count * 2)
    const scale = new Float32Array(count)
    const stem = new Float32Array(count)
    const phase = new Float32Array(count)
    const color = new Float32Array(count * 3)
    const c = new Color()
    const rng = makeRng(seedFrom('flowers'))

    // Flowers gather in drifts rather than spreading evenly. The drifts are
    // laid out inside the tile, so they repeat as you walk — at this density
    // and scale that reads as "there are a lot of flowers", not as a pattern.
    const DRIFTS = 26
    const centres: [number, number][] = []
    for (let d = 0; d < DRIFTS; d++) centres.push([rng() * tile, rng() * tile])

    for (let i = 0; i < count; i++) {
      const [dx, dz] = centres[(rng() * DRIFTS) | 0]
      const spread = 3.4
      pos[i * 2] = dx + (rng() + rng() - 1) * spread
      pos[i * 2 + 1] = dz + (rng() + rng() - 1) * spread

      // sit them just below the top of the grass, so heads peek through it
      // rather than hovering above it like beads
      stem[i] = 0.14 + rng() * 0.3
      scale[i] = 0.022 + rng() * 0.03
      phase[i] = rng() * Math.PI * 2

      c.set(pick(rng, FLOWER_COLORS))
      color[i * 3] = c.r
      color[i * 3 + 1] = c.g
      color[i * 3 + 2] = c.b
    }

    geo.setAttribute('iPos', new InstancedBufferAttribute(pos, 2))
    geo.setAttribute('iScale', new InstancedBufferAttribute(scale, 1))
    geo.setAttribute('iStem', new InstancedBufferAttribute(stem, 1))
    geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
    geo.setAttribute('iColor', new InstancedBufferAttribute(color, 3))
    geo.instanceCount = count
    return geo
  }, [count, tile])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: 1 },
          uCentre: { value: new Vector2() },
      uFacing: { value: new Vector2(0, 1) },
                    uTile: { value: tile },
          uFadeStart: { value: radius * 0.7 },
          uFadeEnd: { value: radius * 0.96 },
          uFogColor: { value: new Color('#c3cebe') },
          uSunColor: { value: new Color('#fff2d8') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uSun: { value: 1 },
          uLight: { value: 1 },
        },
      }),
    [tile, radius],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    u.uFogColor.value.set(palette.fogColor)
    u.uSunColor.value.set(palette.sunColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uSun.value = Math.min(1, palette.sunIntensity)
    u.uLight.value = ambientLightLevel(palette)
    u.uWind.value = palette.wind
  }, [material, palette])

  const t = useRef(0)
  useFrame(({ camera }, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
    material.uniforms.uCentre.value.set(camera.position.x, camera.position.z)
    /*
      Which way the camera is looking, flattened onto the ground.

      The third column of a camera's world matrix is the direction it is
      looking *away* from, so this is negated. Taken from the matrix rather
      than from the rotation because the camera is aimed with lookAt and its
      Euler angles are a derived thing that has been wrong before.
    */
    const m = camera.matrixWorld.elements
    const fx = -m[8]
    const fz = -m[10]
    const len = Math.hypot(fx, fz) || 1
    material.uniforms.uFacing.value.set(fx / len, fz / len)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
