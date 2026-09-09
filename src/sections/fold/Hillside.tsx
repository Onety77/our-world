/**
 * The ground of the Fold, and everything rooted in it.
 *
 * One mesh for the hillside with its colour baked into the vertices, one
 * instanced field of blades over the top of it, one broken wall and a handful
 * of thorns on the ridge. Nothing here is lit by a scene light — the garden has
 * none — so the ground shader reads a vertex colour, fogs it and stops, and
 * everything else goes through the shared form material.
 *
 * **The wall and the thorns are on the far side on purpose.** They are what the
 * mist gives back first: a line of stone appearing across the middle distance
 * says the fold has a far side long before any animal on it can be made out,
 * which is what stops the early part of a session reading as an empty grey wash.
 */

import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  IcosahedronGeometry,
  ShaderMaterial,
} from 'three'
import { makeRng, pick, range, seedFrom } from '@/systems/rng'
import type { SkyPalette } from '@/systems/palette'
import { ambientLightLevel, buildTiles, useFormMaterial, type FormInstance } from '@/world/forms'
import { REACH, WALL_Z, foldHeight } from './layout'
import { useMisted, type MistRef } from './mist'

/** Metres between samples of the ground mesh. */
const STEP = 3.2

/**
 * The hillside.
 *
 * Sampled on a grid rather than radially: the fold is a shape in z with a
 * cross-slope in x, and a radial mesh would put its finest samples where the
 * ground is flattest and its coarsest along the ridge, which is the one edge
 * whose silhouette matters.
 */
export function Ground({ palette, mist }: { palette: SkyPalette; mist: MistRef }) {
  const geometry = useMemo(() => {
    const rng = makeRng(seedFrom('fold:ground'))
    const cols = Math.ceil((REACH * 2) / STEP) + 1
    const rows = Math.ceil((REACH * 1.6) / STEP) + 1

    const position = new Float32Array(cols * rows * 3)
    const colour = new Float32Array(cols * rows * 3)

    const grass = new Color(palette.grassBase)
    const tip = new Color(palette.grassTip)
    const earth = new Color(palette.ground)
    const mix = new Color()

    for (let r = 0; r < rows; r++) {
      const z = REACH * 0.35 - r * STEP
      for (let c = 0; c < cols; c++) {
        const x = -REACH + c * STEP
        const i = (r * cols + c) * 3
        position[i] = x
        position[i + 1] = foldHeight(x, z)
        position[i + 2] = z

        /*
          Baked light, not baked shading: the slope decides how much sky a patch
          of ground can see, and a hillside where the far bank is the same
          colour as the floor of the fold reads as a painted backdrop.
        */
        const up = 1 - Math.min(1, Math.abs(foldHeight(x + 2, z) - foldHeight(x - 2, z)) / 3)
        mix.copy(grass).lerp(tip, 0.12 + rng() * 0.22)
        /*
          Pulled a long way toward the bare earth colour. The first pass
          leaned on the grass tip and came out a saturated green that broke
          the art direction outright — moss, sage, ochre and dust, and nothing
          that reads as a screensaver. Hill grazing is more dust than lawn.
        */
        mix.lerp(earth, 0.34 + (1 - up) * 0.4)
        // Darker down in the bottom, where the light does not reach as far.
        const depth = Math.max(0, Math.min(1, (-foldHeight(x, z) + 1) / 6))
        mix.multiplyScalar(1 - depth * 0.22)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette.grassBase, palette.grassTip, palette.ground])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          precision mediump float;
          attribute vec3 color;
          varying vec3 vColor;
          varying float vDepth;
          varying vec2 vGround;
          void main() {
            vColor = color;
            // Where on the hill this is, for the mottle below. Two components,
            // because the ground is a height field and its y adds nothing.
            vGround = position.xz;
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
          varying vec2 vGround;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          /*
            Value noise, two octaves. Cheap, and it is here for one specific
            failure: the ground is sampled every three metres and its colour is
            interpolated between those samples, so the patch you are standing on
            is a single smooth wash of green. On a desktop that is a strip along
            the bottom of a wide frame. On a phone it is the bottom *half* of the
            picture, and it reads as an empty plane with a few blades stuck in
            it — which was the first thing wrong with the portrait screenshot.

            Breaking it up at a metre and at a third of a metre gives the near
            ground texture at the two scales you actually stand over, for no
            geometry and no second material.
          */
          float mottle(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          void main() {
            float grain = mottle(vGround * 0.9) * 0.66 + mottle(vGround * 3.1) * 0.34;
            // Small. Ground that visibly patterns is worse than ground that is
            // flat — this is only meant to stop the eye finding a plane.
            vec3 col = vColor * (0.6 + 0.4 * uLight) * (0.88 + grain * 0.24);
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
          uFogNear: { value: 8 },
          uFogFar: { value: 90 },
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

  useMisted(material, mist)

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={0} />
}

/**
 * A blade: five vertices, three triangles, with its spine lifted out of plane.
 *
 * The same lesson the leaves learned — a perfectly flat card has one normal and
 * therefore one shade, and a field of them reads as cut paper. Lifting the
 * middle by a couple of millimetres is enough for the two halves to catch the
 * sky differently.
 */
function blade(): BufferGeometry {
  const geo = new BufferGeometry()
  /*
    Four segments, not one, and it is what turns a shard into a blade.

    The first version was three triangles between two straight edges, and at
    the size real grass is drawn that reads as a *leaf* — a hard-edged green
    shape you can count the corners of. Grass is legible because it curves and
    tapers: each segment here is narrower than the last and set back a little
    further, so the blade arcs over and comes to a point instead of stopping at
    one. Same lesson the meadow's own blades record.

    The spine is lifted out of plane at every level for the reason the leaf
    cards are: a perfectly flat card has one normal and therefore exactly one
    shade, and a field of those reads as cut paper.
  */
  const LEVELS = [
    { up: 0.0, wide: 0.5, back: 0.0 },
    { up: 0.34, wide: 0.4, back: 0.03 },
    { up: 0.63, wide: 0.28, back: 0.09 },
    { up: 0.85, wide: 0.15, back: 0.17 },
  ]
  const position: number[] = []
  const normal: number[] = []
  for (const { up, wide, back } of LEVELS) {
    position.push(-wide, up, back, wide, up, back)
    normal.push(-0.25, 0.15, 0.95, 0.25, 0.15, 0.95)
  }
  // The tip: one vertex, so the blade ends in a point rather than a cut edge.
  position.push(0, 1, 0.28)
  normal.push(0, 0.3, 0.95)

  const index: number[] = []
  for (let i = 0; i < LEVELS.length - 1; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const last = (LEVELS.length - 1) * 2
  index.push(last, last + 1, last + 2)

  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3))
  geo.setIndex(index)
  return geo
}

/**
 * The grass, over the fold's own ground.
 *
 * `world/Grass` cannot be used here: it follows the *camera* and is displaced
 * by the shared `groundHeight`, so over a hillside this place lays itself it
 * would grow a second, flat meadow through the middle of the first one.
 *
 * Deliberately thinner than the meadow's, and it is the mist that makes that
 * affordable — past thirty metres almost nothing here is ever fully in view, so
 * the budget goes on the near band where you are actually standing.
 */
export function Turf({
  palette,
  count,
  mist,
  layer = 'near',
}: {
  palette: SkyPalette
  count: number
  mist: MistRef
  /**
   * Which band. **Two of these are mounted and both are needed.**
   *
   * One layer has to choose: thick enough to be turf underfoot and it runs out
   * at forty metres, leaving a visible ring with real grass inside it and bare
   * ground beyond — which is exactly what the first render of this place did,
   * and it draws a hard line across the middle of the fold. The far layer is
   * twice as tall, a fifth as dense and reaches the ridge; at that distance a
   * blade is a fraction of a pixel and a clump is a few, so it costs almost
   * nothing and there is no edge anywhere. `world/Grass` learned this across
   * the whole meadow.
   */
  layer?: 'near' | 'far'
}) {
  const geometry = useMemo(() => {
    const far = layer === 'far'
    const rng = makeRng(seedFrom(far ? 'fold:turf:far' : 'fold:turf'))
    const base = blade()
    const items: FormInstance[] = []

    const tips = [palette.grassBase, palette.grassTip, palette.ground]

    /*
      In tufts, and near, and short.

      The first build got all three wrong and the render said so immediately:
      blades up to a metre and a half, one to a square metre, spread evenly over
      a disc sixty-five metres across. What that draws is not grass, it is a
      field of dark spikes with the ground showing through — and it is the exact
      failure `world/Grass` has a long note about having made across the whole
      meadow.

      So: the same dimensions the meadow settled on (a fifth of a metre to a
      half, a few centimetres wide), clumped into tufts, and a radius biased
      hard toward the near band. The bias is the part the mist pays for — past
      thirty metres nothing here is ever fully in view, so spending the budget
      out there buys nothing at all.
    */
    const PER_TUFT = far ? 6 : 9
    for (let i = 0; i < count; ) {
      /*
        Near: `**1.5` rather than `sqrt`, which is the *opposite* bias — sqrt
        spreads evenly over a disc, this pulls the field in toward where you
        stand. Far: `sqrt`, which is the even spread, because out there the job
        is coverage rather than density.
      */
      const t = far ? Math.sqrt(rng()) : Math.pow(rng(), 1.5)
      const angle = range(rng, -Math.PI, Math.PI)
      /*
        The near field starts at nought, not at a metre and a half.

        A radius floor leaves an unplanted disc at the centre of the field, and
        because that centre sits just in front of where you stand it came out
        as a mown circle in the middle of the foreground — the one part of the
        picture nothing else covers. The far layer keeps its floor because the
        near layer is already growing there.
      */
      const radius = far ? 16 + t * 74 : t * 47
      const tx = Math.cos(angle) * radius
      /*
        ---------------------------------------------------------------------
        **The near field is centred where you stand, not out in the fold**, and
        this one line was the whole of the empty foreground.

        It was centred at z = −10, which is ten metres down the slope. The
        camera stands at about z = +7, and on a phone `backOffFor` puts it at
        +11 — so the *nearest* grass was twenty metres away, and everything
        between your feet and the middle distance was bare ground. On a wide
        screen that is a strip along the bottom. In portrait it was the bottom
        half of the picture, and it read as an unfinished section.

        Centred just in front of the lip instead, so the disc contains the
        camera at either aspect. Some of it falls behind the viewer and is never
        drawn — `buildTiles` culls it — which is a far cheaper mistake than a
        hole in front.
        ---------------------------------------------------------------------
      */
      const tz = Math.sin(angle) * radius + (far ? -22 : 4)
      const spread = far ? 1.6 + t * 3.2 : 0.5 + t * 1.4

      const inTuft = Math.min(count - i, 3 + ((rng() * PER_TUFT) | 0))
      for (let b = 0; b < inTuft; b++, i++) {
        // Two uniforms averaged: a gaussian-ish clump rather than a square patch.
        const x = tx + (rng() + rng() - 1) * spread
        const z = tz + (rng() + rng() - 1) * spread
        items.push({
          offset: [x, foldHeight(x, z), z],
          /*
            Narrow, and taller further out.

            At the width the first pass used, a blade two metres from the camera
            was a hand's breadth of solid colour across the frame. The far layer
            is twice the size in both directions: at fifty metres a blade of
            grazing height is a third of a pixel, and a field of those is a
            uniform smear rather than texture.
          */
          scale: far
            ? [range(rng, 0.05, 0.11), range(rng, 0.6, 1.25), 1]
            : /*
                Taller close in, not shorter.

                The intuition is backwards here and the portrait screenshot is
                what settled it: the camera stands about two and a half metres
                up looking fifteen degrees down, so the nearest ground it can
                see is four or five metres away — and grass a fifth of a metre
                high at five metres is a thin fringe with a plain green field
                behind it filling half a phone. Rough hill grazing right under
                you is knee-high. It is the *middle* distance that wants to be
                short, and it already is.
              */
              [
                range(rng, 0.013, 0.032),
                range(rng, 0.34, 0.66) * (1 + t * 0.5),
                1,
              ],
          rot: rng() * Math.PI * 2,
          lean: [range(rng, -0.24, 0.24), range(rng, -0.32, 0.32)],
          phase: rng() * 6.28,
          color: pick(rng, tips),
          // Blades bend from their own foot, which is what keeps grass moving
          // while a tree eight metres up moves much further.
          anchorY: 0,
        })
      }
    }

    const built = buildTiles(base, items, { tile: far ? 26 : 16, sway: 1 })
    base.dispose()
    return built
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, layer, palette.grassBase, palette.grassTip, palette.ground])

  useEffect(() => () => geometry.forEach((g) => g.dispose()), [geometry])

  const material = useFormMaterial(palette, { sway: 0.55, flatten: 0.4, doubleSided: true })
  useMisted(material, mist)

  return (
    <>
      {geometry.map((geo, i) => (
        <mesh key={i} geometry={geo} material={material} renderOrder={1} />
      ))}
    </>
  )
}

const STONE = ['#6b6a63', '#5c5b55', '#75736b', '#514f4a'] as const

/**
 * The broken drystone wall across the middle of the fold.
 *
 * Broken because a whole one would be a fence, and this place is emphatically
 * not divided in two — the animals walk through the gaps, and the far ones are
 * *past* it, which is what makes it read as distance rather than as a boundary.
 *
 * It is also the first thing the mist gives back. See the note at the top.
 */
export function Wall({ palette, mist }: { palette: SkyPalette; mist: MistRef }) {
  const geometry = useMemo(() => {
    const rng = makeRng(seedFrom('fold:wall'))
    const base = new IcosahedronGeometry(1, 0)
    const items: FormInstance[] = []

    for (let x = -54; x < 54; x += 0.62) {
      /*
        Two long gaps and a scatter of missing stones. Authored as a function of
        x rather than randomly, so the gaps are where they were put — a wall
        whose holes move when the seed changes is a wall nobody composed.
      */
      if (x > -16 && x < -9) continue
      if (x > 21 && x < 27) continue
      if (rng() < 0.09) continue

      // The wall follows the ground, and the ground is not level.
      const z = WALL_Z + Math.sin(x * 0.06) * 2.4
      const foot = foldHeight(x, z)
      // Lower where it has fallen in, taller where it has been kept up.
      const high = 0.72 + Math.sin(x * 0.11 + 1.2) * 0.22 + rng() * 0.2
      let up = 0
      while (up < high) {
        const thick = range(rng, 0.14, 0.26)
        items.push({
          offset: [x + range(rng, -0.06, 0.06), foot + up + thick * 0.5, z + range(rng, -0.1, 0.1)],
          scale: [range(rng, 0.2, 0.34), thick, range(rng, 0.2, 0.32)],
          rot: rng() * Math.PI * 2,
          lean: [range(rng, -0.2, 0.2), range(rng, -0.2, 0.2)],
          phase: rng() * 6.28,
          color: pick(rng, STONE),
        })
        up += thick
      }
    }

    const built = buildTiles(base, items, { tile: 22, sway: 0.1 })
    base.dispose()
    return built
  }, [])

  useEffect(() => () => geometry.forEach((g) => g.dispose()), [geometry])
  const material = useFormMaterial(palette, { sway: 0.02 })
  useMisted(material, mist)

  return (
    <>
      {geometry.map((geo, i) => (
        <mesh key={i} geometry={geo} material={material} renderOrder={2} />
      ))}
    </>
  )
}

const THORN_WOOD = ['#3a332c', '#443b31', '#332d27'] as const
const THORN_LEAF = ['#4c5443', '#5a6150', '#434a3c'] as const

/**
 * Wind-bent thorns along the ridge.
 *
 * Not `world/Trees`, which grows the garden's own wood on the world's terrain.
 * These are small, hard, leaning things standing on the fold's own ridge — and
 * they all lean the same way, which is the cheapest way to say a place is windy
 * without moving anything.
 */
export function Thorns({ palette, mist }: { palette: SkyPalette; mist: MistRef }) {
  const geometry = useMemo(() => {
    const rng = makeRng(seedFrom('fold:thorns'))
    const base = new IcosahedronGeometry(1, 0)
    const items: FormInstance[] = []

    for (let i = 0; i < 14; i++) {
      const x = range(rng, -60, 60)
      const z = range(rng, -70, -48)
      const foot = foldHeight(x, z)
      const tall = range(rng, 1.9, 3.4)
      // Every one of them leaning the same way. See above.
      const bend = 0.34 + rng() * 0.18

      items.push({
        offset: [x, foot + tall * 0.42, z],
        scale: [0.13, tall * 0.5, 0.13],
        rot: rng() * 6.28,
        lean: [0, bend],
        phase: rng() * 6.28,
        color: pick(rng, THORN_WOOD),
        anchorY: tall * 0.42,
      })
      for (let c = 0; c < 4; c++) {
        const up = tall * range(rng, 0.7, 1.05)
        items.push({
          offset: [
            x + Math.sin(bend) * up * 0.9 + range(rng, -0.6, 0.6),
            foot + up,
            z + range(rng, -0.6, 0.6),
          ],
          scale: [range(rng, 0.5, 0.95), range(rng, 0.3, 0.5), range(rng, 0.5, 0.9)],
          rot: rng() * 6.28,
          lean: [range(rng, -0.3, 0.3), range(rng, -0.3, 0.3)],
          phase: rng() * 6.28,
          color: pick(rng, THORN_LEAF),
          anchorY: up,
        })
      }
    }

    const built = buildTiles(base, items, { tile: 30, sway: 2.4 })
    base.dispose()
    return built
  }, [])

  useEffect(() => () => geometry.forEach((g) => g.dispose()), [geometry])
  const material = useFormMaterial(palette, { sway: 0.5 })
  useMisted(material, mist)

  return (
    <>
      {geometry.map((geo, i) => (
        <mesh key={i} geometry={geo} material={material} renderOrder={2} />
      ))}
    </>
  )
}
