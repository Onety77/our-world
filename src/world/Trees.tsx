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
import { buildTiles, useFormMaterial, type FormInstance } from './forms'
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
  /**
   * How many cards each crown is made of, as a fraction — see `leafDetail` in
   * `world/tree`.
   *
   * A wood is the one place in the garden where this is worth turning down,
   * and it is worth turning down a *long* way. Nothing here is nearer than
   * thirty metres and most of it is past sixty with the fog through it; the
   * cards grow to keep the crown's area, so what changes is the triangle count
   * and not the tree. This alone was a third of everything the garden drew.
   */
  leafDetail?: number
  /**
   * How much of the *branchwork* to draw — see `woodDetail` in `world/tree`.
   *
   * The companion to `leafDetail`, and the one that was missing. A wood is
   * exactly the place to turn it down, and further than feels reasonable: at
   * these distances a branch is about a pixel across and the outermost limbs
   * are *inside* their own leaves. Nothing about the tree moves — the tips,
   * the splits and the sprays are identical — so what goes is triangles and
   * not shape.
   */
  woodDetail?: number
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
  leafDetail = 1,
  woodDetail = 1,
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
        leafDetail,
        woodDetail,
      })
      woodItems.push(...parts.wood)
      leafItems.push(...parts.leaves)
      placed++
    }

    /*
      Five sides, and no ends on it.

      A wood is sixteen thousand of these. Six sides to five is invisible at
      any range a treeline is ever seen from, and the caps are invisible at
      *every* range: each limb is two overlapping segments and every segment
      begins inside something wider than the tip it grows from, so the flat
      discs at both ends of the tube have never once been on screen. Together
      they are more than half the wood's triangles.

      Not the great tree, and not the landmark. Those are stood under.
    */
    const woodBase = new CylinderGeometry(0.7, 1, 1, 5, 1, true)
    woodBase.translate(0, 0.5, 0) // foot at the origin, not the middle
    const leafBase = leafGeometry()

    /*
      Cut into tiles so the wood behind you is not drawn.

      A treeline is a *ring*, which is the shape this helps most: whatever you
      are looking at, the far side of the ring is directly behind your head.
      Twenty-four metres to a tile puts a hundred and thirty trees into roughly
      a dozen pieces — a dozen draw calls where there was one, against a place
      that renders in eighteen — and the frustum then throws away the two
      thirds of them that are behind and beside you before a single vertex is
      transformed.
    */
    const built = {
      wood: buildTiles(woodBase, woodItems, { tile: 24, sway: 2 }),
      leaves: buildTiles(leafBase, leafItems, { tile: 24, sway: 3 }),
    }
    woodBase.dispose()
    leafBase.dispose()
    return built
    // openingKey and centreKey stand in for the arrays so a new array holding
    // the same numbers doesn't regrow the whole wood on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    seed,
    count,
    centreKey,
    innerRadius,
    outerRadius,
    openingKey,
    gapWidth,
    heights,
    leafDetail,
    woodDetail,
  ])

  useEffect(
    () => () => {
      for (const tile of wood) tile.dispose()
      for (const tile of leaves) tile.dispose()
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

  /*
    Culled, at last — no `frustumCulled={false}` on either of these.

    That flag was on every field in the garden and it is what this whole change
    is about: it does not mean "do not cull this", it means "this cannot be
    culled correctly", and it was true right up until the tiles above got real
    bounding volumes. See `buildTiles`.
  */
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
