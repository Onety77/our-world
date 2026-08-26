/**
 * What's beyond the wood.
 *
 * A range on the far horizon, and its whole job is to be *far*. The version
 * this replaced was built from boxes three hundred metres tall at six hundred
 * metres out, pale enough to read almost white — which gave the garden a grey
 * skyline of flat-topped slabs with hard vertical edges standing over the
 * trees. It looked like a city, and it was the single most artificial thing in
 * the frame.
 *
 * Three things fix that, and they are all about restraint:
 *
 *  1. **Further and lower.** Tops sit six to ten degrees above the horizon
 *     rather than twenty-six, so the range settles just over the treeline
 *     instead of towering behind it.
 *  2. **Lumps, not peaks, and heavily overlapped.** Massifs are built from
 *     tilted icosahedra. Boxes gave hard plumb edges and flat tops, which read
 *     as architecture however they were rotated. The obvious correction —
 *     something that comes to a point — is the older trap this file has warned
 *     about from the beginning: anything with an apex gives you a row of party
 *     hats, and an octahedron is two pyramids glued together, so it walks
 *     straight into it. A twenty-faced lump has no apex and no plumb edge, and
 *     spacing them closer together than they are wide means what you see is
 *     the ragged top of a *mass* rather than a line of separate hills.
 *  3. **Darker than the sky, never lighter, and nearly flat.** Aerial
 *     perspective takes distant land *toward* the sky's colour but stops short
 *     of it, and land that out-brightens its own sky is the giveaway that it
 *     isn't land. Just as important: at ten degrees of elevation and a
 *     kilometre away, a real range has almost no internal contrast. Shading
 *     its facets the way you would shade a rock in the meadow turns it into
 *     crumpled foil.
 *
 * **There is no snow.** Every attempt at it produced white peaks that took
 * over the frame — first as icing on flat-topped slabs, then as a field of
 * bright shards. It is also the wrong register: this is a warm meadow world of
 * moss and ochre, not somewhere alpine. The range is a quiet blue-grey band
 * over the treeline and that is all it needs to be.
 */

import { useEffect, useMemo } from 'react'
import {
  Color,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from './forms'
import { makeRng, range, seedFrom } from '@/systems/rng'

/** Everything is based below the meadow, so the range rises out of the haze. */
const BASE_Y = -60

const VERT = /* glsl */ `
  varying float vDepth;
  varying vec3 vNormal;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uRock;
  uniform vec3 uShadow;
  uniform vec3 uSky;
  uniform vec3 uSunColor;
  uniform float uSun;

  varying float vDepth;
  varying vec3 vNormal;

  void main() {
    float up = clamp(vNormal.y, 0.0, 1.0);

    /*
      Very little separation between a lit face and a shadowed one.

      Distance eats contrast long before it eats colour, so a range this far
      off is nearly a flat silhouette with a hint of form in it. Shading it
      like nearby rock — which is what the previous two attempts did — is what
      turned it into faceted metal both times.
    */
    vec3 col = mix(uShadow, uRock, 0.55 + up * 0.45);

    // one warm key, barely there, so the sunward side is not quite the same
    float key = clamp(vNormal.x * 0.5 + vNormal.y * 0.5 + 0.5, 0.0, 1.0);
    col *= 0.93 + key * 0.12;
    col = mix(col, col * uSunColor * 1.1, 0.16 * uSun * up);

    /*
      Aerial perspective, stopping short of the sky.

      The cap at 0.86 is the whole point: haze takes distant land most of the
      way to the colour of the air in front of it and never all the way, so a
      range always sits a shade darker than the sky it is cut against. Let it
      reach 1.0 and the mountains start glowing at dusk and at night.
    */
    float away = clamp((vDepth - 400.0) / 1400.0, 0.0, 1.0);
    col = mix(col, uSky, pow(away, 0.6) * 0.88);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

interface Block {
  geometry: BufferGeometry
}

function buildRange(): BufferGeometry {
  const rng = makeRng(seedFrom('horizon:ranges:low'))
  const blocks: Block[] = []

  // Detail 0 — twenty faces, none of them plumb, and no apex to catch the eye
  // as a peak. See the note at the top about why this is neither a box nor a
  // cone; both have been tried and both are worse.
  const unit = new IcosahedronGeometry(1, 0)

  const push = (position: Vector3, rotation: Euler, scale: Vector3) => {
    // IcosahedronGeometry is already non-indexed in current Three versions.
    // Calling toNonIndexed anyway emitted one warning for every mountain lump
    // (466 lines every time the open world mounted) and did no useful work.
    const clone = unit.clone()
    const g = clone.index ? clone.toNonIndexed() : clone
    if (g !== clone) clone.dispose()
    g.applyMatrix4(
      new Matrix4().compose(position, new Quaternion().setFromEuler(rotation), scale),
    )
    blocks.push({ geometry: g })
  }

  const MASSIFS = 14
  for (let m = 0; m < MASSIFS; m++) {
    const bearing = (m / MASSIFS) * Math.PI * 2 + range(rng, -0.2, 0.2)
    // three ranks, so the range overlaps itself rather than forming a fence
    const rank = m % 3
    const distance = 980 + rank * 260 + range(rng, -140, 140)

    const centreX = Math.cos(bearing) * distance
    const centreZ = Math.sin(bearing) * distance

    // the ridge runs across the line of sight, which is what makes it read as
    // a wall of rock rather than a single lump
    const along = bearing + Math.PI / 2 + range(rng, -0.55, 0.55)
    const length = range(rng, 420, 820)

    /*
      Height, chosen as an angle rather than a number.

      What matters is how much sky the range covers from where you stand, and
      that is height over distance. Six to ten degrees puts the crest just
      above the treeline — present, unmistakably far, and never competing with
      what is happening in the meadow.
    */
    const elevation = range(rng, 0.105, 0.185) + rank * 0.012
    const crest = BASE_Y + distance * elevation

    /*
      Enough lumps that they overlap heavily.

      This is the number that decides whether it reads as a range or as a row.
      Each lump is around two hundred metres across and they are set down every
      sixty or so, so any one of them is buried in its neighbours and only the
      ragged upper edge of the pile survives as silhouette.
    */
    const count = 12 + ((rng() * 8) | 0)
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1) - 0.5
      // tallest in the middle, falling away at the shoulders
      const profile = Math.cos(t * Math.PI) * 0.5 + 0.5
      // Heights wander hard. Lumps of a similar height put a level line along
      // the top of the range, which is the other way to look artificial.
      const height = (crest - BASE_Y) * (0.34 + profile * 0.66) * range(rng, 0.62, 1.16)

      const width = range(rng, 170, 320)
      const depth = range(rng, 150, 280)

      const x = centreX + Math.cos(along) * t * length + range(rng, -55, 55)
      const z = centreZ + Math.sin(along) * t * length + range(rng, -55, 55)

      // Squat: wider than it is tall, and sunk so only its top half is a hill.
      push(
        new Vector3(x, BASE_Y + height * 0.1, z),
        new Euler(range(rng, -0.3, 0.3), rng() * Math.PI, range(rng, -0.34, 0.34)),
        new Vector3(width, height * 1.6, depth),
      )
    }
  }

  for (const block of blocks) block.geometry.deleteAttribute('uv')

  const merged = mergeGeometries(
    blocks.map((b) => b.geometry),
    false,
  )
  for (const b of blocks) b.geometry.dispose()
  unit.dispose()

  if (!merged) throw new Error('The horizon failed to merge.')
  merged.computeVertexNormals()
  return merged
}

export function Horizon({ palette }: { palette: SkyPalette }) {
  const geometry = useMemo(() => buildRange(), [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uRock: { value: new Color('#5d6474') },
          uShadow: { value: new Color('#474e60') },
          uSky: { value: new Color('#c8d2c4') },
          uSunColor: { value: new Color('#fff2d8') },
          uSun: { value: 1 },
        },
      }),
    [],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    // they take the colour of the sky at their own height, near the horizon
    u.uSky.value.set(palette.skyBottom)
    u.uSunColor.value.set(palette.sunColor)
    u.uSun.value = Math.min(1, palette.sunIntensity)

    /*
      Darkened by the same one number the trees and the meadow use, so the
      range goes to night with everything else. The old one scaled only by sun
      intensity, which at one in the morning still left it half lit — pale
      lavender mountains standing over a black field.
    */
    const lit = 0.22 + ambientLightLevel(palette) * 0.78
    u.uRock.value.set('#5d6474').multiplyScalar(lit)
    u.uShadow.value.set('#474e60').multiplyScalar(lit)
  }, [material, palette])

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
