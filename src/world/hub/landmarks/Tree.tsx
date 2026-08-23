/**
 * The Tree of Thoughts, seen from the garden.
 *
 * The same tree the wood is made of, grown much heavier and much older — not a
 * different model. That matters more than it sounds: the landmark stands with
 * a hundred and fifty trees behind it, and a landmark built to its own rules
 * reads as pasted on top of a photograph of somewhere else.
 *
 * What makes it *the* tree rather than a large one is what is underneath it:
 * the flowers. Every thought either of you has ever written is one of them, so
 * the ring at its foot is the only part of the garden that grows by itself
 * over months. Here they are only a promise of that — the real ones live in
 * the section, keyed to real letters.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderGeometry, IcosahedronGeometry } from 'three'
import { makeRng, pick, range, seedFrom } from '@/systems/rng'
import { FLOWER_COLORS } from '@/systems/palette'
import { useSceneEnv } from '@/world/SceneEnv'
import { buildInstanced, useFormMaterial, type FormInstance } from '@/world/forms'
import { growTree } from '@/world/tree'

/**
 * The same key as the meadow's own flowers, plus two warmer ones so the ring
 * under the tree is a little richer than the field around it.
 *
 * Reusing FLOWER_COLORS is the point. A separate, more saturated palette was
 * tried and read as confetti scattered on the grass — the flowers at the foot
 * of this tree are supposed to be *thoughts*, and thoughts should look like
 * they grew here rather than like they were dropped.
 */
const BLOOM = [...FLOWER_COLORS, '#cdae86', '#c4a08f'] as const

export function TreeLandmark() {
  const { palette } = useSceneEnv()

  const { wood, leaves } = useMemo(() => {
    const rng = makeRng(seedFrom('hub:tree-of-thoughts'))
    // Broad and heavy — the tree you would sit under, which is the whole idea
    // of the place.
    const parts = growTree({
      at: [0, 0, 0],
      height: 13.5,
      species: 'broad',
      rng,
      girth: 2.3,
      density: 2.1,
    })

    const woodBase = new CylinderGeometry(0.7, 1, 1, 8, 1)
    woodBase.translate(0, 0.5, 0)
    const leafBase = new IcosahedronGeometry(1, 1)
    const built = {
      wood: buildInstanced(woodBase, parts.wood),
      leaves: buildInstanced(leafBase, parts.leaves),
    }
    woodBase.dispose()
    leafBase.dispose()
    return built
  }, [])

  useEffect(
    () => () => {
      wood.dispose()
      leaves.dispose()
    },
    [wood, leaves],
  )

  /**
   * The flowers at its foot.
   *
   * Scattered on a golden angle so they never form a ring or a row, thinning
   * outward the way something that has been accumulating for months would —
   * dense where it started, sparse at the edge of where it has got to.
   */
  const flowers = useMemo(() => {
    const rng = makeRng(seedFrom('hub:tree-of-thoughts:flowers'))
    const items: FormInstance[] = []

    for (let i = 0; i < 62; i++) {
      const angle = i * 2.399 + range(rng, -0.25, 0.25)
      const radius = 2.2 + Math.sqrt(i) * range(rng, 0.42, 0.68)
      const size = range(rng, 0.13, 0.23)

      items.push({
        offset: [
          Math.cos(angle) * radius,
          range(rng, 0.16, 0.4),
          Math.sin(angle) * radius,
        ],
        scale: [size, size * range(rng, 0.7, 1.1), size],
        rot: rng() * Math.PI * 2,
        lean: [range(rng, -0.5, 0.5), range(rng, -0.5, 0.5)],
        anchorY: 0.3,
        phase: rng() * 6.28,
        color: pick(rng, BLOOM),
      })
    }

    const base = new IcosahedronGeometry(1, 0)
    const built = buildInstanced(base, items)
    base.dispose()
    return built
  }, [])

  useEffect(() => () => flowers.dispose(), [flowers])

  const woodMat = useFormMaterial(palette, { sway: 0.3 })
  const leafMat = useFormMaterial(palette, { sway: 0.55 })
  // A flower head is a third of a metre up; see the note on uSway in forms.ts.
  const bloomMat = useFormMaterial(palette, { sway: 26 })

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    woodMat.uniforms.uTime.value = t.current
    leafMat.uniforms.uTime.value = t.current
    bloomMat.uniforms.uTime.value = t.current
  })

  return (
    <group>
      <mesh geometry={wood} material={woodMat} frustumCulled={false} />
      <mesh geometry={leaves} material={leafMat} frustumCulled={false} />
      <mesh geometry={flowers} material={bloomMat} frustumCulled={false} />
    </group>
  )
}
