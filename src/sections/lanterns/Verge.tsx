/**
 * The wood the lane runs through.
 *
 * ---------------------------------------------------------------------------
 * **This exists so the photographs have something to be seen against.**
 *
 * A lit picture on open sky is a bright rectangle on a bright background, and
 * at dusk — which is most of when this place is worth being in — the sky is the
 * one thing still holding light. Trees behind the lanterns give every
 * photograph a dark ground to sit on, which is the whole reason a gallery
 * paints its walls down rather than up.
 *
 * It is also what makes the lane a lane. A path across open meadow is a line on
 * a field; the same path with trees either side is somewhere you are *inside*,
 * and going through something is what was asked for.
 *
 * The canopy is deliberately not closed. Gaps let the sky and the meadow
 * through, so you can still tell what time of day it is and the walk never
 * becomes a tunnel — and the far end, past the oldest memory, opens out.
 * ---------------------------------------------------------------------------
 *
 * Grown with the garden's own `growTree` and cut into tiles by `buildTiles`, so
 * this is the same wood the rest of the world is made of and gets the same
 * frustum culling. `leafDetail` and `woodDetail` are turned a long way down: at
 * these distances a branch is about a pixel across and the outer limbs are
 * inside their own leaves.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderGeometry } from 'three'
import { makeRng, range, seedFrom } from '@/systems/rng'
import type { SkyPalette } from '@/systems/palette'
import {
  buildTiles,
  useFormMaterial,
  type FormInstance,
} from '@/world/forms'
import { growTree, leafGeometry, speciesFor } from '@/world/tree'
import { SPACING, WALK_Y, pathAt } from './layout'

/** Trees per metre of lane, both verges together. */
const DENSITY = 0.34

/** However long the walk gets, never more than this many trees. */
const MOST = 260

/** How far back from the centreline the trunks start and stop. */
const NEAR_VERGE = 4.2
const FAR_VERGE = 15.5

export function Verge({ length, palette }: { length: number; palette: SkyPalette }) {
  /*
    Rounded before it becomes a dependency.

    The lane's length changes by one spacing when a memory is kept, and regrowing
    a wood is not free. Rounding to the nearest few spacings means the trees are
    regrown occasionally rather than on every arrival, and because the seed is
    fixed the trees that were already there come back identical.
  */
  const grown = Math.ceil((length + 26) / (SPACING * 4)) * (SPACING * 4)

  const { wood, leaves } = useMemo(() => {
    const rng = makeRng(seedFrom('lanterns:verge'))
    const woodItems: FormInstance[] = []
    const leafItems: FormInstance[] = []

    const count = Math.min(MOST, Math.round(grown * DENSITY))
    for (let i = 0; i < count; i++) {
      // Along the lane, a little past both ends so it never stops abruptly.
      const s = range(rng, -12, grown)
      const here = pathAt(s)
      const side = rng() < 0.5 ? -1 : 1

      /*
        Square to the lane rather than along X.

        On a bend those differ by several metres, which is the difference
        between a tree standing on the verge and one standing in the path.
      */
      const out = range(rng, NEAR_VERGE, FAR_VERGE)
      const x = here.x + Math.cos(here.yaw) * side * out
      const z = here.z + Math.sin(here.yaw) * side * out

      const parts = growTree({
        at: [x, WALK_Y, z],
        /*
          Shorter nearest the path and taller further back, so the canopy lifts
          away from the lanterns instead of leaning over them. A tree the same
          height as the light it stands behind hides the light.
        */
        height: range(rng, 5.4, 7.2) + (out - NEAR_VERGE) * 0.42,
        species: speciesFor(rng),
        rng,
        leafDetail: 0.34,
        woodDetail: 0.3,
      })
      woodItems.push(...parts.wood)
      leafItems.push(...parts.leaves)
    }

    /*
      Five sides, and no ends on it — the same economy the treeline makes, for
      the same reason. Each limb begins inside something wider than the tip it
      grows from, so the caps at both ends have never once been on screen.
    */
    const woodBase = new CylinderGeometry(0.7, 1, 1, 5, 1, true)
    woodBase.translate(0, 0.5, 0)
    const leafBase = leafGeometry()

    const built = {
      wood: buildTiles(woodBase, woodItems, { tile: 22, sway: 2 }),
      leaves: buildTiles(leafBase, leafItems, { tile: 22, sway: 3 }),
    }
    woodBase.dispose()
    leafBase.dispose()
    return built
  }, [grown])

  useEffect(
    () => () => {
      for (const tile of wood) tile.dispose()
      for (const tile of leaves) tile.dispose()
    },
    [wood, leaves],
  )

  const woodMat = useFormMaterial(palette, { sway: 0.32 })
  const leafMat = useFormMaterial(palette, { sway: 0.58, doubleSided: true })

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    woodMat.uniforms.uTime.value = t.current
    leafMat.uniforms.uTime.value = t.current
  })

  return (
    <>
      {wood.map((tile, i) => (
        <mesh key={`w${i}`} geometry={tile} material={woodMat} />
      ))}
      {leaves.map((tile, i) => (
        <mesh key={`l${i}`} geometry={tile} material={leafMat} />
      ))}
    </>
  )
}
