/**
 * Stones, and the small stuff underfoot.
 *
 * Scattered across a wide area rather than a ring, because now that you can
 * walk there has to be something out there to walk toward. Half-buried and
 * squashed — a lump sitting proud on the ground reads as a prop dropped onto
 * the terrain rather than something that has been there a long time.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { IcosahedronGeometry } from 'three'
import type { SkyPalette } from '@/systems/palette'
import { makeRng, pick, range, seedFrom } from '@/systems/rng'
import { groundHeight } from '@/systems/terrain'
import { buildInstanced, useFormMaterial, type FormInstance } from './forms'

// Authored for the unified pipeline: these render as written now. The old
// values were near-black greys chosen to survive a shader path that displayed
// everything dark — under honest lighting they read as holes in the meadow.
const STONE = ['#8a857a', '#98938a', '#7b7a6e', '#a49e90', '#83877c'] as const

export interface RocksProps {
  palette: SkyPalette
  seed: string
  count?: number
  /**
   * What the ring is a ring *around*, in world metres. It defaults to the
   * middle of the garden, which is right for the scatter across the meadow and
   * was silently wrong for everything else: the Wellspring asked for a kerb
   * round its pool and got one round the centre of the world, seventy metres
   * away, which is why the place looked like an empty field.
   */
  centre?: [number, number]
  innerRadius?: number
  outerRadius?: number
  /** Metres. Boulders at 3+, pebbles under 1. */
  minSize?: number
  maxSize?: number
}

export function Rocks({
  palette,
  seed,
  count = 90,
  centre = [0, 0],
  innerRadius = 6,
  outerRadius = 150,
  minSize = 0.5,
  maxSize = 3.4,
}: RocksProps) {
  const geometry = useMemo(() => {
    const rng = makeRng(seedFrom(seed))
    const items: FormInstance[] = []

    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2
      // sqrt keeps them from bunching in the middle
      const r = innerRadius + (outerRadius - innerRadius) * Math.sqrt(rng())
      const x = centre[0] + Math.cos(angle) * r
      const z = centre[1] + Math.sin(angle) * r
      const bulk = range(rng, minSize, maxSize)

      items.push({
        // sunk by a third or so, so they sit *in* the ground
        offset: [x, groundHeight(x, z) - bulk * range(rng, 0.18, 0.42), z],
        scale: [
          bulk * range(rng, 0.9, 1.5),
          bulk * range(rng, 0.45, 0.85),
          bulk * range(rng, 0.9, 1.5),
        ],
        rot: rng() * Math.PI,
        phase: 0,
        color: pick(rng, STONE),
      })
    }

    const base = new IcosahedronGeometry(1, 1)
    const geo = buildInstanced(base, items)
    base.dispose()
    return geo
  }, [seed, count, centre, innerRadius, outerRadius, minSize, maxSize])

  useEffect(() => () => geometry.dispose(), [geometry])

  // sway 0 — stones do not move in the wind, and a rock that breathes is the
  // sort of detail that reads as wrong without anyone being able to say why
  const material = useFormMaterial(palette, { sway: 0 })

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
