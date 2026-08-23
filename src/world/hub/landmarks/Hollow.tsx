/**
 * The Hollow, seen from the garden.
 *
 * A mouth in a rocky rise with a fire burning just inside it. Everything about
 * this one is the light: the place it opens into is a cave lit by a fire, and
 * the only thing that can promise "there is something warm in there" from
 * across a meadow is warmth actually falling on the stone.
 *
 * **The trap that ate the first two attempts.** Nothing in the garden is lit
 * by scene lights. Grass, ground, trees, stone and landmark all use custom
 * shaders that take an ambient level and a sun colour and nothing else — which
 * is how a hundred and fifty trees cost two draw calls. So a three.js point
 * light dropped next to the fire did *nothing*, silently, and the cave mouth
 * rendered as a grey heap of rubble at every hour of the day. The fix was to
 * give the shared form shader room for exactly one local light; see uEmber in
 * `world/forms.ts`. That light is driven from here, off the same flicker as
 * the flame, so the stone brightens on the beat the fire does.
 *
 * The shape is a horseshoe with the front left open, not a ring. A ring of
 * boulders put rocks between the viewer and the fire and hid the entire point
 * of the landmark behind its own scenery.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  IcosahedronGeometry,
  Vector3,
  type Mesh,
  type ShaderMaterial,
} from 'three'
import { makeRng, pick, range, seedFrom } from '@/systems/rng'
import { useSceneEnv } from '@/world/SceneEnv'
import { buildInstanced, useFormMaterial, type FormInstance } from '@/world/forms'

const ROCK = ['#6b6459', '#5d574d', '#787060', '#544e46', '#827a68'] as const

/**
 * The stone down the throat.
 *
 * Dark rock, not a black hole. The first cut put a plain black sphere behind
 * the mouth to stand for the dark, and it read as exactly that: a shape with
 * no surface, punched through the picture. Real depth is stone that keeps
 * being stone as it goes back and simply stops catching the fire — so the
 * throat is built of the same boulders in a much darker set, and the ember's
 * falloff does the rest.
 */
const DEEP_ROCK = ['#2b2724', '#211e1c', '#332d28', '#1a1817'] as const

/** Where the fire sits, in the landmark's own space. The ember light uses this. */
const FIRE = new Vector3(0, 0.95, -0.35)

/**
 * How wide the approach is kept clear, in radians either side of straight on.
 * Nothing from the mound is allowed inside this wedge.
 */
const MOUTH_CLEAR = 0.62

export function HollowLandmark() {
  const { palette } = useSceneEnv()

  const rock = useMemo(() => {
    const rng = makeRng(seedFrom('hub:hollow:rock'))
    const items: FormInstance[] = []

    const push = (
      offset: [number, number, number],
      size: number,
      squash = 1,
      palette: readonly string[] = ROCK,
    ) => {
      items.push({
        offset,
        scale: [
          size * range(rng, 0.85, 1.45),
          size * squash * range(rng, 0.7, 1.25),
          size * range(rng, 0.85, 1.4),
        ],
        rot: rng() * Math.PI * 2,
        lean: [range(rng, -0.45, 0.45), range(rng, -0.45, 0.45)],
        phase: rng() * 6.28,
        color: pick(rng, palette),
      })
    }

    // --- the mound: a horseshoe, open toward the viewer -------------------
    for (let i = 0; i < 60; i++) {
      // bearing measured from straight ahead (+z), so the gap is easy to state
      const bearing = range(rng, MOUTH_CLEAR, Math.PI * 2 - MOUTH_CLEAR)
      const radius = range(rng, 4.2, 7.8)
      const x = Math.sin(bearing) * radius
      const z = Math.cos(bearing) * radius

      // higher round the back, so it is a hill the mouth is cut into
      const rise = Math.max(0, -z) * 0.72
      push([x, rise + range(rng, -0.4, 0.7), z], range(rng, 0.85, 1.9), 0.8)
    }

    // --- the jambs: the two shoulders of stone the mouth sits between ------
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const up = (i / 8) * 3.1
        push(
          [
            side * range(rng, 2.5, 3.6),
            up + range(rng, -0.25, 0.25),
            range(rng, -0.6, 0.7),
          ],
          range(rng, 0.7, 1.35),
        )
      }
    }

    // --- the lintel: what the mouth is arched under -----------------------
    for (let i = 0; i < 9; i++) {
      const t = i / 8
      const angle = Math.PI * (0.16 + t * 0.68)
      push(
        [
          Math.cos(angle) * 3.2,
          Math.sin(angle) * 3.0 + 1.0,
          range(rng, -0.5, 0.6),
        ],
        range(rng, 0.65, 1.25),
      )
    }

    /*
      The throat — three rings of dark stone going back.

      Overlapping and staggered in depth so there is never a line of sight
      straight through to the sky behind the mound. That is what a black
      backing plate was standing in for, and stone does it without ever
      looking like a hole.
    */
    for (let ring = 0; ring < 3; ring++) {
      const z = -2.4 - ring * 1.15
      const radius = 2.5 - ring * 0.4
      for (let i = 0; i < 13; i++) {
        const angle = Math.PI * (0.02 + (i / 12) * 0.96)
        push(
          [
            Math.cos(angle) * radius,
            Math.sin(angle) * (radius + 0.2) + 0.1,
            z + range(rng, -0.35, 0.35),
          ],
          range(rng, 0.95, 1.7),
          1,
          DEEP_ROCK,
        )
      }
    }
    // the back wall
    for (let i = 0; i < 10; i++) {
      push(
        [range(rng, -2.6, 2.6), range(rng, 0.1, 3.0), range(rng, -6.2, -5.2)],
        range(rng, 1.2, 2.0),
        1,
        DEEP_ROCK,
      )
    }

    // --- stones on the floor, for the firelight to have somewhere to land --
    for (let i = 0; i < 14; i++) {
      const angle = rng() * Math.PI * 2
      const radius = range(rng, 0.8, 2.0)
      push(
        [
          Math.cos(angle) * radius,
          range(rng, 0.02, 0.26),
          Math.sin(angle) * radius * 0.7 - 0.3,
        ],
        range(rng, 0.18, 0.42),
      )
    }

    const base = new IcosahedronGeometry(1, 0)
    const built = buildInstanced(base, items)
    base.dispose()
    return built
  }, [])

  useEffect(() => () => rock.dispose(), [rock])

  const rockMat = useFormMaterial(palette, { sway: 0 })

  // Hand the stone its fire. Range is generous — it has to reach the jambs and
  // the lintel three metres up, or only the floor looks lit.
  useEffect(() => {
    const u = rockMat.uniforms as Record<string, { value: unknown }>
    ;(u.uEmberPos.value as Vector3).copy(FIRE)
    ;(u.uEmberColor.value as { set(c: string): void }).set('#ff8438')
    u.uEmberRange.value = 7.5
  }, [rockMat])

  const tongues = useRef<(Mesh | null)[]>([null, null, null])
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current += delta
    const time = t.current

    /*
      Three frequencies with no common period, so the flicker never visibly
      loops. A single sine is the giveaway: at any distance a fire pulsing on
      an obvious beat reads as an animation rather than as a fire.
    */
    const flicker =
      Math.sin(time * 7.3) * 0.16 +
      Math.sin(time * 11.9 + 1.3) * 0.1 +
      Math.sin(time * 3.1) * 0.07

    // The stone and the flame are lit by the same number, so they agree.
    ;(rockMat as ShaderMaterial).uniforms.uEmberPower.value = 1.5 * (1 + flicker)

    tongues.current.forEach((tongue, i) => {
      if (!tongue) return
      const own = time * (5.5 + i * 1.7) + i * 2.1
      // taller and thinner as it licks up, which is the shape of a flame
      const lick = 0.75 + Math.sin(own) * 0.25 + Math.sin(own * 2.3) * 0.1
      tongue.scale.set(1 / Math.sqrt(lick), lick, 1 / Math.sqrt(lick))
      tongue.position.x = Math.sin(own * 0.7) * 0.07
      tongue.position.z = FIRE.z + Math.cos(own * 0.9) * 0.06
    })
  })

  return (
    <group>
      <mesh geometry={rock} material={rockMat} frustumCulled={false} />

      {/* The flame. Additive and depth-write off so the three tongues blend
          into one body of light instead of cutting each other out. */}
      {[
        { size: 0.55, height: 1.9, y: 0.5, x: 0, color: '#ff8b3a' },
        { size: 0.34, height: 1.35, y: 0.45, x: 0.24, color: '#ffb257' },
        { size: 0.22, height: 0.95, y: 0.5, x: -0.2, color: '#ffd89a' },
      ].map((tongue, i) => (
        <mesh
          key={i}
          ref={(m) => {
            tongues.current[i] = m
          }}
          position={[tongue.x, tongue.y, FIRE.z]}
        >
          <coneGeometry args={[tongue.size, tongue.height, 6]} />
          <meshBasicMaterial
            color={tongue.color}
            transparent
            opacity={0.85}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
