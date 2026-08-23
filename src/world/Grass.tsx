/**
 * The meadow. Tens of thousands of blades in a single draw call, and it never
 * runs out however far you walk.
 *
 * Every blade is the same four-segment strip. Instance attributes give each one
 * a position *within a tile*, plus its own height, twist and wind phase; the
 * vertex shader wraps that tile to whichever copy of it is nearest the camera,
 * roots the blade at the terrain height, and bends it. So the field follows you
 * for free — walking never costs another instance, and there is no edge to find.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  Vector2,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { makeRng, seedFrom } from '@/systems/rng'
import { meadowRadiusFor } from '@/systems/terrain'
import { TERRAIN_GLSL, TILE_GLSL } from './terrainShader'

const SEGMENTS = 4

/** One blade: a strip that tapers to a near-point, origin at the root. */
function bladeArrays() {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= SEGMENTS; i++) {
    const v = i / SEGMENTS
    const halfWidth = 0.5 * Math.pow(1 - v, 0.75)
    positions.push(-halfWidth, v, 0, halfWidth, v, 0)
    uvs.push(0, v, 1, v)
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  return { positions, uvs, indices }
}

function buildGeometry(count: number, tile: number): InstancedBufferGeometry {
  const { positions, uvs, indices } = bladeArrays()
  const geo = new InstancedBufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geo.setIndex(new Uint16BufferAttribute(indices, 1))

  const pos = new Float32Array(count * 2)
  const scale = new Float32Array(count * 2)
  const rot = new Float32Array(count)
  const phase = new Float32Array(count)
  const tint = new Float32Array(count)
  const rng = makeRng(seedFrom('meadow'))

  // Grass grows in tufts. Scattering every blade independently gives an even
  // sprinkle that reads as artificial; snapping them to a lattice (the obvious
  // fix) is worse, because a lattice puts visible aisles through the field that
  // line up whenever you look down one. So: pick tuft centres at random inside
  // the tile, then grow a handful of blades around each.
  const BLADES_PER_TUFT = 11
  const tufts = Math.max(1, Math.ceil(count / BLADES_PER_TUFT))
  let i = 0

  for (let t = 0; t < tufts && i < count; t++) {
    // uniform across the tile — the shader turns this into a disc around you
    const tx = rng() * tile
    const tz = rng() * tile
    const spread = 0.22 + rng() * 0.55
    const vigour = 0.72 + rng() * 0.5

    const inThisTuft = Math.min(count - i, 5 + ((rng() * (BLADES_PER_TUFT * 1.6)) | 0))

    for (let b = 0; b < inThisTuft; b++, i++) {
      // gaussian-ish jitter: two uniforms averaged clusters toward the middle
      pos[i * 2] = tx + (rng() + rng() - 1) * spread
      pos[i * 2 + 1] = tz + (rng() + rng() - 1) * spread

      scale[i * 2] = (0.22 + rng() * 0.4) * vigour
      scale[i * 2 + 1] = 0.028 + rng() * 0.038

      rot[i] = rng() * Math.PI
      phase[i] = rng() * Math.PI * 2
      tint[i] = rng()
    }
  }

  for (; i < count; i++) scale[i * 2] = 0

  geo.setAttribute('iPos', new InstancedBufferAttribute(pos, 2))
  geo.setAttribute('iScale', new InstancedBufferAttribute(scale, 2))
  geo.setAttribute('iRot', new InstancedBufferAttribute(rot, 1))
  geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
  geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 1))
  geo.instanceCount = count
  return geo
}

const VERT = /* glsl */ `
  ${TERRAIN_GLSL}
  ${TILE_GLSL}

  attribute vec2 iPos;     // position inside the tile
  attribute vec2 iScale;   // x = height, y = width
  attribute float iRot;
  attribute float iPhase;
  attribute float iTint;

  uniform float uTime;
  uniform float uWind;
  uniform vec2 uCentre;    // camera, on the ground plane
  uniform float uTile;
  uniform float uFadeStart;
  uniform float uFadeEnd;

  varying float vH;
  varying float vTint;
  varying float vDepth;
  varying float vLean;

  void main() {
    vH = uv.y;
    vTint = iTint;

    vec2 world = tileAround(iPos, uCentre, uTile);

    // Fade to nothing at the rim rather than stopping at a line — a hard edge
    // is what would give away that the meadow is a disc following you around.
    float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(world, uCentre));
    // nothing grows in the river
    float height = iScale.x * fade * dryLand(world);

    vec3 p = position;
    p.x *= iScale.y;
    p.y *= height;

    // Broad gusts roll across the field, so the whole meadow moves as weather
    // rather than every blade twitching independently.
    float gust = sin(uTime * 0.42 + world.x * 0.055 + world.y * 0.041) * 0.5 + 0.5;
    float gust2 = sin(uTime * 0.19 - world.x * 0.021 + world.y * 0.017) * 0.5 + 0.5;
    float sway = sin(uTime * 1.55 + iPhase) * 0.36
               + sin(uTime * 2.9 + iPhase * 1.7) * 0.13;

    float bend = sway * (0.3 + gust * 0.75 + gust2 * 0.4) * uWind;
    float lean = pow(uv.y, 1.7);

    p.x += bend * lean * height;
    p.z += bend * 0.35 * lean * height;
    // the tip travels on an arc, so the blade shortens as it bends
    p.y -= lean * bend * bend * 0.55 * height;

    vLean = bend;

    float c = cos(iRot);
    float s = sin(iRot);
    vec3 spun = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);

    vec3 root = vec3(world.x, gardenHeight(world) - 0.03, world.y);

    vec4 mv = modelViewMatrix * vec4(spun + root, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uFogColor;
  uniform vec3 uSunColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uSun;

  varying float vH;
  varying float vTint;
  varying float vDepth;
  varying float vLean;

  void main() {
    vec3 col = mix(uBase, uTip, pow(vH, 0.72));

    // per-blade variation, so no two blades are the same green
    col *= 0.80 + vTint * 0.42;

    // blades leaning into the light catch it
    col += uSunColor * (abs(vLean) * 0.10 * uSun * vH);

    // sunlight warms the tips only
    col = mix(col, col * uSunColor * 1.18, 0.30 * uSun * pow(vH, 1.4));

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Grass({ count, palette }: { count: number; palette: SkyPalette }) {
  const radius = meadowRadiusFor(count)
  const tile = radius * 2

  const geometry = useMemo(() => buildGeometry(count, tile), [count, tile])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: 1 },
          uCentre: { value: new Vector2() },
          uTile: { value: tile },
          uFadeStart: { value: radius * 0.72 },
          uFadeEnd: { value: radius * 0.98 },
          uBase: { value: new Color('#485139') },
          uTip: { value: new Color('#a7ab72') },
          uFogColor: { value: new Color('#c3cebe') },
          uSunColor: { value: new Color('#fff2d8') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uSun: { value: 1 },
        },
      }),
    [tile, radius],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    u.uBase.value.set(palette.grassBase)
    u.uTip.value.set(palette.grassTip)
    u.uFogColor.value.set(palette.fogColor)
    u.uSunColor.value.set(palette.sunColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uSun.value = Math.min(1, palette.sunIntensity)
    u.uWind.value = palette.wind
  }, [material, palette])

  const t = useRef(0)
  useFrame(({ camera }, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
    material.uniforms.uCentre.value.set(camera.position.x, camera.position.z)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
