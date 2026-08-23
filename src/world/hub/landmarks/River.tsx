/**
 * The Wellspring, seen from the garden.
 *
 * A stream running through a stony cut. It has to read as *moving water* from
 * twenty-odd metres away without being entered, because the whole meaning of
 * the place is that the river runs fuller and faster the more the two of you
 * have actually put by — and a preview that looks like a puddle previews
 * nothing.
 *
 * What it replaced was a flat cyan rectangle with eighteen grey pebbles laid
 * beside it in two straight lines.
 *
 * Three ribbons of the same curve, stacked: wet gravel at the bottom, the
 * water above it, and stones sitting *across* the waterline rather than
 * beside it. Sharing one centreline is what keeps the shore from sliding off
 * the stream — see `bankAt` in world/water.
 *
 * The meadow is told to leave a gap here; see HUB_STREAM in the hub layout.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { IcosahedronGeometry } from 'three'
import { makeRng, pick, range, seedFrom } from '@/systems/rng'
import { groundHeight } from '@/systems/terrain'
import { useSceneEnv } from '@/world/SceneEnv'
import { buildInstanced, useFormMaterial, type FormInstance } from '@/world/forms'
import {
  bankAt,
  makeWaterMaterial,
  ribbonGeometry,
  tuneWater,
  type RibbonOptions,
} from '@/world/water'
import { ANCHORS } from '../layout'

/** Which anchor in the row this is. The stream has to know where it stands. */
const HERE = ANCHORS[1]

/**
 * The stream's shape. Shared by the water, the bed and everything on the bank,
 * so the shore cannot drift off the water it is supposed to be holding.
 *
 * It rides the meadow rather than lying flat on it — see `lift` in water.ts
 * for why the surface is *above* the ground and not cut into it.
 */
const STREAM: RibbonOptions = {
  length: 26,
  rows: 80,
  meander: 1.9,
  width: [1.9, 3.1],
  origin: [HERE.x, HERE.z],
  baseY: HERE.y,
  heightAt: groundHeight,
  lift: 0.05,
}

/**
 * The bed. Only a little wider than the water, so what shows past the edge is
 * a hand's width of wet gravel rather than a grey apron — a wide one reads as
 * a decal laid on the grass, which is what the first attempt looked like.
 */
const BED: RibbonOptions = { ...STREAM, width: [2.08, 3.3], lift: 0.015 }

const DRY_STONE = ['#8a857a', '#7b766c', '#948e81', '#6f6a61', '#a09889'] as const
const WET_STONE = ['#5c584f', '#514e46', '#66625a'] as const
const REED = ['#4a5539', '#3f4a33', '#57603e', '#6a6b44'] as const

export function RiverLandmark() {
  const { palette } = useSceneEnv()

  const water = useMemo(() => ribbonGeometry(STREAM), [])
  const waterMat = useMemo(() => makeWaterMaterial({ flow: 0.55, chop: 0.85, length: STREAM.length }), [])

  useEffect(() => () => water.dispose(), [water])
  useEffect(() => () => waterMat.dispose(), [waterMat])
  useEffect(() => tuneWater(waterMat, palette), [waterMat, palette])

  /** The gravel bed, as a single instance so it shares the world's fog. */
  const bed = useMemo(() => {
    const ribbon = ribbonGeometry(BED)
    const built = buildInstanced(ribbon, [
      { offset: [0, 0, 0], scale: [1, 1, 1], rot: 0, phase: 0, color: '#5b564c' },
    ])
    ribbon.dispose()
    return built
  }, [])

  useEffect(() => () => bed.dispose(), [bed])

  /** Stones: lining both banks, and a few standing in the current. */
  const stones = useMemo(() => {
    const rng = makeRng(seedFrom('hub:wellspring:stones'))
    const items: FormInstance[] = []

    for (let i = 0; i < 74; i++) {
      const t = rng()
      const { x, z, y, half } = bankAt(t, STREAM)
      const side = rng() < 0.5 ? -1 : 1
      // Straddling the waterline, not set back from it. Stones are what hold
      // an edge; ones laid politely alongside leave the cut showing.
      const out = half + range(rng, -0.3, 0.95)
      const size = range(rng, 0.16, 0.46)

      items.push({
        offset: [x + side * out, y - 0.05 + size * 0.25, z + range(rng, -0.3, 0.3)],
        scale: [
          size * range(rng, 1.1, 1.7),
          size * range(rng, 0.5, 0.85),
          size * range(rng, 1.0, 1.5),
        ],
        rot: rng() * Math.PI,
        lean: [range(rng, -0.35, 0.35), range(rng, -0.35, 0.35)],
        phase: rng() * 6.28,
        color: out < half + 0.25 ? pick(rng, WET_STONE) : pick(rng, DRY_STONE),
      })
    }

    // in the water, for the current to break white around
    for (let i = 0; i < 11; i++) {
      const t = rng()
      const { x, z, y, half } = bankAt(t, STREAM)
      const size = range(rng, 0.2, 0.4)
      items.push({
        offset: [
          x + range(rng, -half * 0.55, half * 0.55),
          y + size * 0.06,
          z + range(rng, -0.4, 0.4),
        ],
        scale: [size * 1.3, size * 0.95, size * 1.15],
        rot: rng() * Math.PI,
        lean: [range(rng, -0.3, 0.3), range(rng, -0.3, 0.3)],
        phase: rng() * 6.28,
        color: pick(rng, WET_STONE),
      })
    }

    const base = new IcosahedronGeometry(1, 0)
    const built = buildInstanced(base, items)
    base.dispose()
    return built
  }, [])

  useEffect(() => () => stones.dispose(), [stones])

  /** Reeds standing back from the water, where the gravel gives way. */
  const reeds = useMemo(() => {
    const rng = makeRng(seedFrom('hub:wellspring:reeds'))
    const items: FormInstance[] = []

    for (let i = 0; i < 170; i++) {
      const t = rng()
      const { x, z, y, half } = bankAt(t, STREAM)
      const side = rng() < 0.5 ? -1 : 1
      const out = half + range(rng, 0.4, 1.9)

      items.push({
        offset: [x + side * out, y - 0.06, z + range(rng, -0.35, 0.35)],
        scale: [range(rng, 0.02, 0.045), range(rng, 0.55, 1.6), range(rng, 0.02, 0.045)],
        rot: rng() * Math.PI * 2,
        lean: [range(rng, -0.24, 0.24), range(rng, -0.24, 0.24)],
        anchorY: 0,
        phase: rng() * 6.28,
        color: pick(rng, REED),
      })
    }

    // A spindle standing on the ground: squashed to a unit height, then lifted
    // so its foot is at the origin and iScale.y reads as the reed's height.
    const base = new IcosahedronGeometry(1, 0)
    base.scale(1, 0.5, 1)
    base.translate(0, 0.5, 0)
    const built = buildInstanced(base, items)
    base.dispose()
    return built
  }, [])

  useEffect(() => () => reeds.dispose(), [reeds])

  const bedMat = useFormMaterial(palette, { sway: 0 })
  const stoneMat = useFormMaterial(palette, { sway: 0 })
  // A reed is a metre tall and the bend is quadratic in height, so it needs a
  // far larger number than a tree to move at all. See uSway in forms.ts.
  const reedMat = useFormMaterial(palette, { sway: 9 })

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    waterMat.uniforms.uTime.value = t.current
    reedMat.uniforms.uTime.value = t.current
  })

  return (
    <group>
      <mesh geometry={bed} material={bedMat} frustumCulled={false} />
      <mesh geometry={water} material={waterMat} frustumCulled={false} />
      <mesh geometry={stones} material={stoneMat} frustumCulled={false} />
      <mesh geometry={reeds} material={reedMat} frustumCulled={false} />
    </group>
  )
}
