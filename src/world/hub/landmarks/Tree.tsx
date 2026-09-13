/**
 * The Tree of Thoughts, seen from the garden.
 *
 * **The same tree you stand under when you go in** — grown from the same seed,
 * by the same code — at a lower leaf detail, because here it is one landmark
 * among five. It used to be a separate tree from a separate seed, built the
 * wood's way with balls for leaves, so the preview promised one tree and the
 * place delivered another.
 *
 * What makes it *the* tree rather than a large one is what is underneath it:
 * the flowers. Every thought either of you has ever written is one of them, so
 * the ring at its foot is the only part of the garden that grows by itself
 * over months. Here they are only a promise of that — the real ones live in
 * the section, keyed to real letters.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { IcosahedronGeometry } from 'three'
import { makeRng, pick, range, seedFrom } from '@/systems/rng'
import { FLOWER_COLORS } from '@/systems/palette'
import { useSceneEnv } from '@/world/SceneEnv'
import { buildInstanced, useFormMaterial, type FormInstance } from '@/world/forms'
import { TreeOfLetters } from '@/world/TreeOfLetters'
import { GREAT_TREE_SEED, growAncientTree } from '@/sections/tree/greatTree'

/**
 * The same key as the meadow's own flowers, plus two warmer ones so the ring
 * under the tree is a little richer than the field around it.
 */
const BLOOM = [...FLOWER_COLORS, '#cdae86', '#c4a08f'] as const

/** Grown once, in the landmark's own space: foot at the origin, ground flat. */
let landmarkTree: ReturnType<typeof growAncientTree> | null = null
function theTree() {
  landmarkTree ??= growAncientTree(GREAT_TREE_SEED, [0, 0, 0], () => 0)
  return landmarkTree
}

export function TreeLandmark() {
  const { palette } = useSceneEnv()
  const tree = useMemo(theTree, [])

  /**
   * The flowers at its foot.
   *
   * Scattered on a golden angle so they never form a ring or a row, thinning
   * outward the way something that has been accumulating for months would —
   * and starting outside the roots, which the old tree did not have.
   */
  const flowers = useMemo(() => {
    const rng = makeRng(seedFrom('hub:tree-of-thoughts:flowers'))
    const items: FormInstance[] = []

    for (let i = 0; i < 62; i++) {
      const angle = i * 2.399 + range(rng, -0.25, 0.25)
      const radius = 3.0 + Math.sqrt(i) * range(rng, 0.42, 0.68)
      const size = range(rng, 0.13, 0.23)

      items.push({
        offset: [Math.cos(angle) * radius, range(rng, 0.16, 0.4), Math.sin(angle) * radius],
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

  // A flower head is a third of a metre up; see the note on uSway in forms.ts.
  const bloomMat = useFormMaterial(palette, { sway: 26 })

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    bloomMat.uniforms.uTime.value = t.current
  })

  return (
    <group>
      <TreeOfLetters tree={tree} palette={palette} detail={0.45} shaded={false} />
      <mesh geometry={flowers} material={bloomMat} frustumCulled={false} />
    </group>
  )
}
