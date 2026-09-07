/**
 * The ground the walk is on: a graded shelf, and the path worn down the middle
 * of it.
 *
 * ---------------------------------------------------------------------------
 * **This place carries its own ground, and it has to.**
 *
 * The world's meadow is one plane that follows the *camera*, displaced from
 * world coordinates by the shared height function. Travel here works the way it
 * does everywhere in the garden — the place slides past a camera that never
 * moves — so the terrain under the lane is a fixed patch that does not slide
 * with it. Anything bedded into that terrain rises and sinks as the lane goes
 * by, which is exactly what the first build of this did: a post hanging in the
 * air a metre above the grass.
 *
 * The room that stood here met the same wall and answered it with a plinth and
 * a flagstone floor. A path gets the honest version of the same answer: it is
 * graded, it carries its own surface, and the surface travels with it. The
 * Hollow has rock and the Stars has its own night — this is the third place
 * that owns what is under your feet, and `World` knows not to draw the meadow
 * over the top of it.
 * ---------------------------------------------------------------------------
 *
 * One mesh, built once per length, with the colour baked into the vertices.
 * There is no lighting to do — everything out here is lit by the sky and by the
 * lanterns — so a shader that reads a vertex colour, fogs it and stops is the
 * whole of it.
 */

import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  ShaderMaterial,
} from 'three'
import { makeRng, seedFrom } from '@/systems/rng'
import type { SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { SPACING, WALK_Y, pathAt } from './layout'

/** How far either side of the lane the shelf reaches before it falls away. */
const SHELF = 30

/** And how far out the ground goes in total, which wants to be past the fog. */
const REACH = 96

/** How far the outer ground sits below the shelf, so the rim is not a cliff. */
const FALL = 3.2

/** Half the width of the trodden part, in metres. */
const WORN = 1.15

/** Steps along the lane. One per metre is plenty for a flat surface. */
const STEP = 2.4

/**
 * The cross-section, as offsets from the centreline.
 *
 * Tight through the middle where the path is and the eye is, wide and sparse
 * outside it where nothing changes but the colour. Twelve points a rib rather
 * than a regular grid, which would spend nine tenths of its vertices on empty
 * grass.
 */
const RIBS = [-REACH, -62, -SHELF, -14, -5.5, -WORN, 0, WORN, 5.5, 14, SHELF, 62, REACH]

export function Lane({
  length,
  trodden,
  palette,
}: {
  /** How far the ground is built, in metres. */
  length: number
  /** How much of it has been walked — the worn part stops here. */
  trodden: number
  palette: SkyPalette
}) {
  const built = useMemo(() => Math.ceil((length + 40) / (SPACING * 4)) * (SPACING * 4), [length])

  const geometry = useMemo(() => {
    const rng = makeRng(seedFrom('lanterns:lane'))
    const rows = Math.ceil((built + 30) / STEP) + 1
    const cols = RIBS.length

    const position = new Float32Array(rows * cols * 3)
    const colour = new Float32Array(rows * cols * 3)

    const grass = new Color(palette.grassBase)
    const tip = new Color(palette.grassTip)
    const earth = new Color('#3a3026')
    const mix = new Color()

    for (let r = 0; r < rows; r++) {
      const s = -18 + r * STEP
      const here = pathAt(s)
      for (let c = 0; c < cols; c++) {
        const lat = RIBS[c]
        const out = Math.abs(lat)

        // Square to the lane, so the shelf bends with it rather than shearing.
        const x = here.x + Math.cos(here.yaw) * lat
        const z = here.z + Math.sin(here.yaw) * lat

        /*
          Flat where you walk, falling away outside the shelf.

          The fall is what keeps the horizon from being a ruled line: past the
          shelf the ground drops and the far edge sits below the eye, so what
          you see at the end of the lane is a rim of meadow against the sky
          rather than a table top.
        */
        const drop = FALL * Math.pow(Math.max(0, out - SHELF) / (REACH - SHELF), 1.5)
        const i = (r * cols + c) * 3
        position[i] = x
        position[i + 1] = WALK_Y - drop
        position[i + 2] = z

        /*
          The worn path, and it only exists where somebody has walked.

          This is the same fact the footprints carry, said at the scale you read
          from a distance: the lane ahead of the newest memory is grass, and it
          becomes a path behind it. Softened at the edge over half a metre,
          because a path does not have a kerb.
        */
        const walked = s > -2 && s < trodden + SPACING * 0.5
        const wear = walked ? 1 - Math.min(1, Math.max(0, (out - WORN * 0.55) / (WORN * 0.9))) : 0

        mix.copy(grass).lerp(tip, 0.35 + rng() * 0.3)
        // A little darker further out, which reads as distance more cheaply
        // than any amount of fog does.
        mix.multiplyScalar(1 - Math.min(0.28, out / REACH) * 0.9)
        mix.lerp(earth, wear * 0.82)

        colour[i] = mix.r
        colour[i + 1] = mix.g
        colour[i + 2] = mix.b
      }
    }

    const index: number[] = []
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c
        const b = a + 1
        const d = a + cols
        const e = d + 1
        index.push(a, d, b, b, d, e)
      }
    }

    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(position, 3))
    geo.setAttribute('color', new BufferAttribute(colour, 3))
    geo.setIndex(index)
    geo.computeBoundingSphere()
    return geo
    // Rebuilt when the walk gets longer or the light changes character enough
    // to have baked different grass into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, trodden, palette.grassBase, palette.grassTip])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec3 color;
          varying vec3 vColor;
          varying float vDepth;
          void main() {
            vColor = color;
            vec4 eye = modelViewMatrix * vec4(position, 1.0);
            vDepth = -eye.z;
            gl_Position = projectionMatrix * eye;
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform float uLight;
          uniform vec3 uFogColor;
          uniform float uFogNear;
          uniform float uFogFar;
          varying vec3 vColor;
          varying float vDepth;
          void main() {
            vec3 col = vColor * (0.62 + 0.38 * uLight);
            float fog = smoothstep(uFogNear, uFogFar, vDepth);
            gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
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

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={0} />
}
