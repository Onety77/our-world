/**
 * The wood around the garden.
 *
 * Two instanced meshes for the whole thing — wood and leaf — so a hundred and
 * fifty trees still cost two draw calls. Gaps are carved where the garden
 * needs to be seen out of, so the treeline is a backdrop rather than a fence.
 *
 * The trees themselves are grown by `world/tree.ts`, which the Tree of
 * Thoughts also uses. That sharing is the point: the landmark is the same
 * species as the treeline behind it, grown heavier, rather than a separate
 * idea of what a tree looks like standing next to a hundred counter-examples.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderGeometry } from 'three'
import type { SkyPalette } from '@/systems/palette'
import { makeRng, range, seedFrom } from '@/systems/rng'
import { groundHeight } from '@/systems/terrain'
import { buildInstanced, useFormMaterial, type FormInstance } from './forms'
import { growTree, leafGeometry, speciesFor } from './tree'

export interface TreesProps {
  palette: SkyPalette
  /** Angles, in radians, where the treeline opens so the garden can be seen. */
  openings: number[]
  seed: string
  count?: number
  /** What the ring is a ring *around*. Defaults to the origin. */
  centre?: [number, number]
  innerRadius?: number
  outerRadius?: number
  /** 0..1 — pushes toward flat silhouette, for the band on the horizon. */
  flatten?: number
  /** How wide the gaps in the treeline are, in radians. 0 closes them. */
  gapWidth?: number
  /**
   * How tall the trees in this wood run, in metres.
   *
   * A place with one great tree in it needs its treeline *smaller* than the
   * default, or the thing the place is named for stands in a crowd of its own
   * size and stops being great.
   */
  heights?: [number, number]
}

export function Trees({
  palette,
  openings,
  seed,
  count = 130,
  centre = [0, 0],
  innerRadius = 46,
  outerRadius = 104,
  flatten = 0,
  gapWidth = 0.2,
  heights = [5.2, 11.4],
}: TreesProps) {
  const openingKey = openings.map((o) => o.toFixed(3)).join(',')
  const centreKey = `${centre[0]},${centre[1]}`

  const { wood, leaves } = useMemo(() => {
    const rng = makeRng(seedFrom(seed))
    const woodItems: FormInstance[] = []
    const leafItems: FormInstance[] = []

    let placed = 0
    let guard = 0
    while (placed < count && guard++ < count * 14) {
      const angle = rng() * Math.PI * 2

      const inGap =
        gapWidth > 0 &&
        openings.some((o) => {
          const d = Math.abs(((angle - o + Math.PI) % (Math.PI * 2)) - Math.PI)
          return d < gapWidth
        })
      if (inGap) continue

      // sqrt so the ring fills evenly by area rather than crowding the inside
      const r = Math.sqrt(range(rng, (innerRadius / outerRadius) ** 2, 1)) * outerRadius
      const x = centre[0] + Math.cos(angle) * r
      const z = centre[1] + Math.sin(angle) * r

      const parts = growTree({
        at: [x, groundHeight(x, z), z],
        height: range(rng, heights[0], heights[1]),
        species: speciesFor(rng),
        rng,
      })
      woodItems.push(...parts.wood)
      leafItems.push(...parts.leaves)
      placed++
    }

    const woodBase = new CylinderGeometry(0.7, 1, 1, 6, 1)
    woodBase.translate(0, 0.5, 0) // foot at the origin, not the middle
    const leafBase = leafGeometry()

    const built = {
      wood: buildInstanced(woodBase, woodItems),
      leaves: buildInstanced(leafBase, leafItems),
    }
    woodBase.dispose()
    leafBase.dispose()
    return built
    // openingKey and centreKey stand in for the arrays so a new array holding
    // the same numbers doesn't regrow the whole wood on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, count, centreKey, innerRadius, outerRadius, openingKey, gapWidth, heights])

  useEffect(
    () => () => {
      wood.dispose()
      leaves.dispose()
    },
    [wood, leaves],
  )

  // Metres of travel at ten metres up. The bole holds; the leaf mass, hung out
  // on the ends of the limbs, goes nearly twice as far.
  const woodMat = useFormMaterial(palette, { sway: 0.32, flatten })
  const leafMat = useFormMaterial(palette, { sway: 0.58, flatten, doubleSided: true })

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    woodMat.uniforms.uTime.value = t.current
    leafMat.uniforms.uTime.value = t.current
  })

  return (
    <>
      <mesh geometry={wood} material={woodMat} frustumCulled={false} />
      <mesh geometry={leaves} material={leafMat} frustumCulled={false} />
    </>
  )
}
