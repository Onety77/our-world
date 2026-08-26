/**
 * The meadow. Tens of thousands of blades in three draw calls, and it never
 * runs out however far you look.
 *
 * Every blade is the same tapering strip. Instance attributes give each one
 * a position *within a tile*, plus its own height, twist and wind phase; the
 * vertex shader wraps that tile to whichever copy of it is nearest the camera,
 * roots the blade at the terrain height, and bends it. So the field follows you
 * for free — moving never costs another instance, and there is no edge to find.
 *
 * **It is three layers of decreasing density, and that is the whole design.**
 * The table in `LAYERS` says what each one is for and why two of them was not
 * enough; the short version is that a single layer has to choose between
 * covering the ground and reaching the treeline, and cannot do both.
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
import { TERRAIN_GLSL, TILE_GLSL } from './terrainShader'

/**
 * One layer of the meadow.
 *
 * `share` divides the blade budget; `density` then decides how far that share
 * reaches, rather than the other way round — spreading a fixed count over a
 * bigger disc thins it until the ground shows through, so the count buys
 * radius at a density chosen for the look and never dilutes it.
 */
interface Layer {
  seed: string
  /** Fraction of the blade budget this layer gets. */
  share: number
  /** Blades per square metre. */
  density: number
  /**
   * Segments per blade.
   *
   * Four is what a blade needs to bend through a smooth arc a couple of metres
   * from your eye. It is twice what one needs at fifty, where the whole blade
   * is a few pixels tall and the arc is two of them — and the far layer is
   * over twenty thousand blades, so this alone is eighty thousand triangles.
   */
  segments: number
  /** Multiplies the blade height and width the generator picks. */
  tall: number
  wide: number
  /** How many blades grow around one tuft centre. */
  perTuft: number
  /**
   * How far a tuft's blades scatter from its centre, as a multiplier.
   *
   * The one number that decides whether the far layer reads as *tussocks* or
   * as spikes. Scaled with the blade width it comes out at nearly two metres,
   * which is not a clump — it is seven separate blades standing a stride
   * apart, and that is exactly what the first cut looked like from thirty
   * metres. A tussock is a handful of blades out of one root.
   */
  clump: number
  /** Metres over which the layer fades in from the camera. 0 for none. */
  from: number
}

/**
 * The meadow, in three.
 *
 * **Two was not enough, and the failure was instructive.** Turf out to
 * eighteen metres and tussocks beyond it left a *gap in kind*: the near layer
 * was a continuous surface and the far one was a scatter of separate clumps at
 * one and a bit a square metre, and there was nothing in between. So the
 * middle distance — the part of the meadow you spend the most time looking at,
 * because it is where the horizon and the landmarks are — came out as polka
 * dots on bare ground. Reaching further had cost evenness, which is the wrong
 * trade: an even field that stops is better than a patchy one that does not.
 *
 * Three layers close it, and it is the *density* that steps down rather than
 * the layer suddenly changing character:
 *
 *   turf       thirty a square metre, four segments, out to about sixteen.
 *              A continuous surface. This is what you stand in.
 *   field      five and a half a square metre, half again as tall, out to
 *              thirty-odd. Not a surface any more and not clumps either —
 *              grass with ground showing between it, which is what a meadow
 *              at that range actually looks like.
 *   tussocks   one a square metre, twice as tall, out past sixty. By here a
 *              blade is a third of a pixel and only the clumps are legible,
 *              so the clumps are what is drawn.
 *
 * Each layer fades in where the one before it is thinning, so no ring is ever
 * a boundary. And it came out *cheaper* than the two-layer version it
 * replaces, because the two outer layers are two-segment blades: a blade at
 * thirty metres does not bend through an arc anybody can resolve.
 */
const LAYERS: Layer[] = [
  {
    seed: 'meadow',
    share: 0.4,
    density: 26,
    segments: 4,
    tall: 1,
    wide: 1,
    perTuft: 11,
    clump: 1,
    from: 0,
  },
  {
    /*
      The field.

      The layer that was missing, and the one doing most of the work. Tufts
      only a little tighter than the turf's and only half again as tall, so
      crossing from one to the other is a change of density and nothing else —
      which is the whole point. A layer that changes size *and* spacing *and*
      shape at a ring is a ring you can see.
    */
    seed: 'meadow:mid',
    share: 0.34,
    density: 5.5,
    segments: 2,
    tall: 1.5,
    wide: 1.45,
    perTuft: 7,
    clump: 0.8,
    from: 6,
  },
  {
    /*
      Tussocks.

      Bigger tufts of fewer, larger blades — and *not* tight ones. Pulling the
      clump in to a fifth of its spread is what turned these into polka dots:
      at that spacing a tussock is a solid dot of grass with two metres of bare
      ground round it, and a field of dots is the thing this is trying not to
      be. Half is loose enough to read as a clump of grass and tight enough
      not to read as seven separate blades.
    */
    seed: 'meadow:far',
    share: 0.26,
    density: 1.15,
    segments: 2,
    tall: 2.3,
    wide: 2.4,
    perTuft: 8,
    clump: 0.5,
    /*
      Nothing this big directly under the lens.

      The garden's eye is four and a half metres up and a metre-and-a-half
      tussock rooted straight below it fills a third of the frame with one
      blade. Fading them in costs nothing — the two layers inside own that
      ground — and keeps the bottom of the picture turf.
    */
    from: 20,
  },
]

/** How far a layer reaches, for its share of the budget at its density. */
function radiusFor(count: number, layer: Layer): number {
  return Math.max(9, Math.sqrt((count * layer.share) / (Math.PI * layer.density)))
}

/** One blade: a strip that tapers to a near-point, origin at the root. */
function bladeArrays(segments: number) {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= segments; i++) {
    const v = i / segments
    const halfWidth = 0.5 * Math.pow(1 - v, 0.75)
    positions.push(-halfWidth, v, 0, halfWidth, v, 0)
    uvs.push(0, v, 1, v)
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  return { positions, uvs, indices }
}

function buildGeometry(count: number, tile: number, layer: Layer): InstancedBufferGeometry {
  const { positions, uvs, indices } = bladeArrays(layer.segments)
  const geo = new InstancedBufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geo.setIndex(new Uint16BufferAttribute(indices, 1))

  const pos = new Float32Array(count * 2)
  const scale = new Float32Array(count * 2)
  const rot = new Float32Array(count)
  const phase = new Float32Array(count)
  const tint = new Float32Array(count)
  const rng = makeRng(seedFrom(layer.seed))

  // Grass grows in tufts. Scattering every blade independently gives an even
  // sprinkle that reads as artificial; snapping them to a lattice (the obvious
  // fix) is worse, because a lattice puts visible aisles through the field that
  // line up whenever you look down one. So: pick tuft centres at random inside
  // the tile, then grow a handful of blades around each.
  const tufts = Math.max(1, Math.ceil(count / layer.perTuft))
  let i = 0

  for (let t = 0; t < tufts && i < count; t++) {
    // uniform across the tile — the shader turns this into a disc around you
    const tx = rng() * tile
    const tz = rng() * tile
    const spread = (0.22 + rng() * 0.55) * layer.wide * layer.clump
    const vigour = 0.72 + rng() * 0.5

    const inThisTuft = Math.min(count - i, 3 + ((rng() * (layer.perTuft * 1.6)) | 0))

    for (let b = 0; b < inThisTuft; b++, i++) {
      // gaussian-ish jitter: two uniforms averaged clusters toward the middle
      pos[i * 2] = tx + (rng() + rng() - 1) * spread
      pos[i * 2 + 1] = tz + (rng() + rng() - 1) * spread

      scale[i * 2] = (0.22 + rng() * 0.4) * vigour * layer.tall
      scale[i * 2 + 1] = (0.028 + rng() * 0.038) * layer.wide

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
  uniform vec2 uFacing;    // and which way it is looking, on the same plane
  uniform float uTile;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  /** Metres over which the layer comes in from the camera. See Layer.from. */
  uniform float uFadeIn;

  varying float vH;
  varying float vTint;
  varying float vDepth;
  varying float vLean;

  void main() {
    vH = uv.y;
    vTint = iTint;

    vec2 world = tileAround(iPos, uCentre, uTile);
    float away = distance(world, uCentre);

    // Fade to nothing at the rim rather than stopping at a line — a hard edge
    // is what would give away that the meadow is a disc following you around.
    float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, away);
    // And nothing behind you at all. See inTheView.
    fade *= inTheView(world, uCentre, uFacing);
    // and, for the tussocks, up from nothing over the first few metres
    fade *= uFadeIn > 0.0 ? smoothstep(uFadeIn * 0.3, uFadeIn, away) : 1.0;
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

/** One layer of the meadow: its own instances, its own reach, one draw call. */
function Blades({
  count,
  layer,
  palette,
}: {
  count: number
  layer: Layer
  palette: SkyPalette
}) {
  const radius = radiusFor(count, layer)
  const tile = radius * 2
  const blades = Math.max(1, Math.round(count * layer.share))

  const geometry = useMemo(() => buildGeometry(blades, tile, layer), [blades, tile, layer])

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
      uFacing: { value: new Vector2(0, 1) },
                    uTile: { value: tile },
          uFadeStart: { value: radius * 0.72 },
          uFadeEnd: { value: radius * 0.98 },
          uFadeIn: { value: layer.from },
          uBase: { value: new Color('#485139') },
          uTip: { value: new Color('#a7ab72') },
          uFogColor: { value: new Color('#c3cebe') },
          uSunColor: { value: new Color('#fff2d8') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uSun: { value: 1 },
        },
      }),
    [tile, radius, layer],
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

/**
 * The meadow, both layers.
 *
 * Callers pass one blade budget and get turf underfoot and tussocks to the
 * treeline; how that budget is divided is this file's business and nowhere
 * else's, which is the only reason the split could be changed at all.
 */
export function Grass({ count, palette }: { count: number; palette: SkyPalette }) {
  return (
    <>
      {LAYERS.map((layer) => (
        <Blades key={layer.seed} count={count} layer={layer} palette={palette} />
      ))}
    </>
  )
}
