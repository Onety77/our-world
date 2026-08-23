/**
 * The great tree, up close.
 *
 * Grown by the same generator as everything else with bark on it
 * (`world/tree`), at the size of something that has been standing a very long
 * time. That sharing is the whole reason this file is thirty lines of assembly
 * instead of four hundred lines of its own geometry and its own shader: the
 * tree you see from the garden, the hundred and fifty in the wood behind it
 * and this one are now the same species, and a change to how a tree is built
 * reaches all of them at once.
 *
 * What it replaced was a hand-rolled trunk with a handful of very large smooth
 * spheres on top. Read from twenty metres it was a brown pillar under a green
 * cloud — no limbs to speak of, no depth in the crown, and conspicuously not
 * the tree that had just been on screen out in the meadow.
 *
 * It is handed a grown tree rather than growing one, because the letters that
 * hang in it have to come off the same branches — see `sections/tree/greatTree`,
 * which grows it once and both read from.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderGeometry } from 'three'
import type { SkyPalette } from '@/systems/palette'
import { buildInstanced, useFormMaterial } from './forms'
import { leafGeometry, type TreeParts } from './tree'

/**
 * How big the tree is.
 *
 * Read at nineteen metres with the camera looking at the middle of the bole,
 * so it wants to fill most of the frame without the crown running out of the
 * top of it. Density is high — this is the oldest thing in the world and the
 * one tree anybody will ever stand under.
 */
export function TreeOfLetters({
  parts,
  palette,
}: {
  parts: TreeParts
  palette: SkyPalette
}) {
  const { wood, leaves } = useMemo(() => {
    // More faces on the bole than the wood gets: this one is read from close
    // enough that a six-sided trunk shows its flats.
    const woodBase = new CylinderGeometry(0.7, 1, 1, 10, 1)
    woodBase.translate(0, 0.5, 0)
    const leafBase = leafGeometry()

    const built = {
      wood: buildInstanced(woodBase, parts.wood),
      leaves: buildInstanced(leafBase, parts.leaves),
    }
    woodBase.dispose()
    leafBase.dispose()
    return built
  }, [parts])

  useEffect(
    () => () => {
      wood.dispose()
      leaves.dispose()
    },
    [wood, leaves],
  )

  const woodMat = useFormMaterial(palette, { sway: 0.28 })
  const leafMat = useFormMaterial(palette, { sway: 0.52, doubleSided: true })

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
