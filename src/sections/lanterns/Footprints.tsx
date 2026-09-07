/**
 * The path is only worn where the two of you have walked.
 *
 * ---------------------------------------------------------------------------
 * **This is the record, not a decoration on top of one.**
 *
 * Every other way of saying "there are forty memories here" is a label, a
 * counter, or a row of rectangles — the garden does none of those. A trodden
 * path says it without a number, and says two more things a number cannot: how
 * far back it goes, and *who went*. Each memory lays a short stride of prints
 * in its author's own light, warm or cool, so a stretch of lane kept mostly by
 * one of you reads as theirs at a glance, and a lane the two of you have filled
 * together is genuinely mixed underfoot.
 *
 * It also fixes the thing that was backwards about the room this replaced. That
 * building was at its full size on the first day and slowly filled in, so an
 * empty archive was a large dead structure. A path that does not exist until
 * somebody walks it starts at nothing and grows, which is what the place is
 * actually doing.
 *
 * The lane is exactly as long as the walking: memory `i` wears the stretch from
 * its own place to the next one, so the trodden length is always `headFor(n)`
 * and the untrodden lane ahead of you is grass.
 * ---------------------------------------------------------------------------
 *
 * One instanced quad per print, lying flat, shaped in the fragment shader. No
 * texture, no atlas, one draw call for the whole walk — two hundred memories is
 * twelve hundred prints and still one call.
 */

import { useEffect, useMemo } from 'react'
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { makeRng, range, seedFrom } from '@/systems/rng'
import { LIGHT_COLORS, type SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import type { UserId } from '@/data/types'
import { SPACING, WALK_Y, pathAt } from './layout'

/**
 * Prints laid by one memory.
 *
 * Six, which is three strides. Fewer and the stretches read as separate
 * clusters with gaps between them rather than as one continuous path; more and
 * the prints start overlapping into a smear at this spacing, which reads as mud
 * rather than as footfalls.
 */
const PER_MEMORY = 6

/** Half the distance between the two feet, in metres. */
const STRIDE_HALF = 0.17

/** How far above the ground they sit, to stay out of the terrain's own depth. */
const LIFT = 0.014

/** Longest walk this will draw. Beyond it the far prints are past the fog. */
const MOST = 2400

const VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iTint;
  attribute float iYaw;
  attribute float iSize;
  attribute float iAge;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vAge;
  varying float vDepth;

  void main() {
    vUv = uv;
    vTint = iTint;
    vAge = iAge;

    /*
      Flat on the ground, turned to the way the walker was going.

      The quad arrives standing up — a PlaneGeometry faces +Z — so it is laid
      down first and then spun about the vertical. Written out rather than built
      with a matrix because it is two sines and a cosine against a 4x4 multiply,
      per print, per frame.
    */
    float c = cos(iYaw);
    float s = sin(iYaw);
    vec3 local = vec3(
      position.x * c + position.y * s,
      0.0,
      -position.x * s + position.y * c
    ) * iSize;

    vec4 world = modelMatrix * vec4(iAt + local, 1.0);
    vec4 eye = viewMatrix * world;
    vDepth = -eye.z;
    gl_Position = projectionMatrix * eye;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform float uLight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vAge;
  varying float vDepth;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;

    /*
      A foot, as two overlapping ellipses.

      The heel is narrow and behind, the ball is wider and forward, and the
      union of the two is read as a footprint at any size worth drawing — which
      matters, because most of these are eight pixels long. A literal sole with
      toes would be invisible at that size and would cost a texture to say
      nothing.
    */
    float heel = length(vec2(p.x / 0.50, (p.y + 0.46) / 0.44));
    float ball = length(vec2(p.x / 0.64, (p.y - 0.30) / 0.64));
    float d = min(heel, ball);
    float foot = 1.0 - smoothstep(0.74, 1.0, d);
    if (foot <= 0.004) discard;

    /*
      Pressed earth, taking a little of whoever pressed it.

      Mostly a darkening — a print is grass pushed aside and soil showing, and
      soil is darker than everything around it. The author's light is a fifth of
      the colour and no more: enough that a stretch reads as warm or cool when
      you look for it, quiet enough that the path never turns into two coloured
      lanes.
    */
    /*
      Written *linear*, which is why these numbers look far too dark to read as
      earth.

      Everything here goes out through 'colorspace_fragment', so what is written
      is converted up to sRGB on the way to the screen — 0.03 linear arrives at
      about 0.19, and the first version of this, written as though it were
      already sRGB, put pale sand-coloured blobs down a night lane.
    */
    vec3 soil = vec3(0.030, 0.024, 0.017);
    vec3 col = mix(soil, vTint * 0.28, 0.22);

    /*
      Older prints have had longer to grow back over.

      Never all the way: the oldest end of the walk is the one you had to come
      furthest to see, and fading it out entirely would be the archive quietly
      deleting itself. A third of the way is enough to read as age.
    */
    float worn = 1.0 - vAge * 0.34;

    // Deeper at dusk, when the lanterns rake across the ground and a print has
    // a shadow in it; flatter at noon, when everything does.
    float relief = mix(0.86, 0.55, uLight);

    float a = foot * worn * relief;
    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    a *= 1.0 - fog;
    if (a <= 0.004) discard;

    gl_FragColor = vec4(mix(col, uFogColor, fog * 0.5), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Footprints({
  by,
  palette,
}: {
  /** Who kept each memory, oldest first. One stride of prints each. */
  by: UserId[]
  palette: SkyPalette
}) {
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const count = Math.min(MOST, by.length * PER_MEMORY)
    const at = new Float32Array(Math.max(1, count) * 3)
    const tint = new Float32Array(Math.max(1, count) * 3)
    const yaw = new Float32Array(Math.max(1, count))
    const size = new Float32Array(Math.max(1, count))
    const age = new Float32Array(Math.max(1, count))

    const warm = new Color(LIGHT_COLORS.warm)
    const cool = new Color(LIGHT_COLORS.cool)

    /*
      Seeded per print rather than per run, so the walk is the same walk every
      time it is opened. A path whose prints move when you come back is not a
      path anybody made.
    */
    let n = 0
    for (let i = 0; i < by.length && n < count; i++) {
      const rng = makeRng(seedFrom('lanterns:prints:' + i))
      const mine = by[i] === 'warm' ? warm : cool
      for (let k = 0; k < PER_MEMORY && n < count; k++, n++) {
        // Evenly through this memory's own stretch of lane.
        const s = i * SPACING + ((k + 0.5) / PER_MEMORY) * SPACING
        const here = pathAt(s)

        // Alternating feet, square to the way the walker was heading.
        const side = k % 2 === 0 ? -1 : 1
        const nx = Math.cos(here.yaw) * side
        const nz = Math.sin(here.yaw) * side
        const wobble = range(rng, -0.055, 0.055)
        const x = here.x + nx * (STRIDE_HALF + wobble)
        const z = here.z + nz * (STRIDE_HALF + wobble)

        at[n * 3] = x
        at[n * 3 + 1] = WALK_Y + LIFT
        at[n * 3 + 2] = z

        tint[n * 3] = mine.r
        tint[n * 3 + 1] = mine.g
        tint[n * 3 + 2] = mine.b

        // Nobody walks in a perfectly straight line, and a print that is
        // exactly square to the path is the one thing that reads as printed.
        yaw[n] = here.yaw + range(rng, -0.2, 0.2)
        size[n] = range(rng, 0.17, 0.21)
        age[n] = by.length <= 1 ? 0 : 1 - i / (by.length - 1)
      }
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iYaw', new InstancedBufferAttribute(yaw, 1))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 1))
    geo.setAttribute('iAge', new InstancedBufferAttribute(age, 1))
    geo.instanceCount = count
    quad.dispose()
    return geo
  }, [by])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        // Flat on the ground and never written to depth: prints lie on the
        // meadow rather than in it, and two of them overlapping should darken
        // rather than fight.
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uLight: { value: 1 },
          uFogColor: { value: new Color('#cfd8dc') },
          uFogNear: { value: 30 },
          uFogFar: { value: 150 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    material.uniforms.uLight.value = ambientLightLevel(palette)
    ;(material.uniforms.uFogColor.value as Color).set(palette.fogColor)
    material.uniforms.uFogNear.value = palette.fogNear
    material.uniforms.uFogFar.value = palette.fogFar
  }, [material, palette])

  if (by.length === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
}
