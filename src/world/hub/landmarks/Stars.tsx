/**
 * The Stars, seen from the garden.
 *
 * The hardest of the four to preview, because the place it opens into *is* a
 * sky — and you cannot put a sky inside a meadow that already has one. So this
 * shows the idea instead of the view: two lights on a leaning stone, one warm
 * and one cool, close but not touching, with the ground between them lit by
 * both at once.
 *
 * That is the whole section in one object. When it is night for one of you it
 * is morning for the other, and the two lights are never the same colour at
 * the same time — which is the fact the place exists to make bearable rather
 * than sad.
 *
 * What it replaced was a grey torus with two balls stuck to it.
 *
 * The lights are additive and never occlude each other, so at any hour they
 * read as light rather than as two spheres painted different colours.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  IcosahedronGeometry,
  MeshBasicMaterial,
  Vector3,
  type Mesh,
} from 'three'
import { makeRng, pick, range, seedFrom } from '@/systems/rng'
import { localHourIn } from '@/systems/time'
import { useData, useWorldSlice } from '@/data/provider'
import { useSceneEnv } from '@/world/SceneEnv'
import { buildInstanced, useFormMaterial, type FormInstance } from '@/world/forms'

const STONE = ['#585a63', '#4c4e57', '#63646d', '#44464e'] as const

/** The two of you. Deliberately unequal and deliberately not level. */
const LIGHTS = [
  { x: -0.72, y: 2.62, z: 0.12, size: 0.38 },
  { x: 0.66, y: 2.16, z: -0.2, size: 0.29 },
] as const

/**
 * Which way round the two lights are.
 *
 * Warm is whoever is in daylight. This is read from the two real timezones in
 * the profiles, not decided here — if she is in her morning, hers is the warm
 * one, and the garden should not have an opinion about which of you that is.
 */
function warmth(hour: number): number {
  // 1 in the middle of the day, 0 in the middle of the night
  const t = Math.cos(((hour - 13) / 24) * Math.PI * 2)
  return Math.max(0, Math.min(1, t * 0.5 + 0.5))
}

export function StarsLandmark() {
  const { palette } = useSceneEnv()
  const me = useData().me
  const profiles = useWorldSlice((s) => s.profiles)

  /** The cairn the two lights stand over. Leaning, never stacked square. */
  const stone = useMemo(() => {
    const rng = makeRng(seedFrom('hub:stars:cairn'))
    const items: FormInstance[] = []

    // a low ring of boulders, open toward the viewer
    for (let i = 0; i < 22; i++) {
      const angle = range(rng, -Math.PI, Math.PI)
      const radius = range(rng, 2.4, 4.6)
      const size = range(rng, 0.35, 1.05)
      items.push({
        offset: [
          Math.cos(angle) * radius,
          range(rng, -0.1, 0.35),
          Math.sin(angle) * radius * 0.8 - 0.5,
        ],
        scale: [size * range(rng, 1.1, 1.7), size * range(rng, 0.5, 0.9), size * range(rng, 1.0, 1.5)],
        rot: rng() * Math.PI * 2,
        lean: [range(rng, -0.4, 0.4), range(rng, -0.4, 0.4)],
        phase: rng() * 6.28,
        color: pick(rng, STONE),
      })
    }

    // the pillar the lights sit above — three slabs, each off true
    let height = 0
    for (let i = 0; i < 4; i++) {
      const size = 0.95 - i * 0.16
      const thickness = range(rng, 0.28, 0.46)
      items.push({
        offset: [range(rng, -0.16, 0.16), height + thickness * 0.5, range(rng, -0.16, 0.16)],
        scale: [size * range(rng, 0.9, 1.2), thickness, size * range(rng, 0.9, 1.2)],
        rot: rng() * Math.PI * 2,
        lean: [range(rng, -0.13, 0.13), range(rng, -0.13, 0.13)],
        phase: rng() * 6.28,
        color: pick(rng, STONE),
      })
      height += thickness
    }

    const base = new IcosahedronGeometry(1, 0)
    const built = buildInstanced(base, items)
    base.dispose()
    return built
  }, [])

  useEffect(() => () => stone.dispose(), [stone])

  const stoneMat = useFormMaterial(palette, { sway: 0 })

  /*
    The cairn is lit by the two lights standing on it.

    Nothing in the garden reads scene lights — see the note in forms.ts — so
    the pair of three.js point lights that used to sit here lit precisely
    nothing and the stone stayed the same grey at every hour. The form shader
    has room for one local light, so the two are averaged into a single ember
    at their midpoint: at this size the cairn is a hand's width on screen and
    nobody can tell one warm-plus-cool light from two.
  */
  useEffect(() => {
    const u = stoneMat.uniforms as Record<string, { value: unknown }>
    ;(u.uEmberPos.value as Vector3).set(0, 2.4, 0.2)
    u.uEmberRange.value = 5.5
    u.uEmberPower.value = 1.15
  }, [stoneMat])

  /**
   * Two materials per light — the core and the halo around it — kept out of
   * React so their colours can be nudged every frame without a re-render.
   * The halo is much fainter and much larger; sharing one material would give
   * the light a hard edge at whatever radius the bigger sphere happened to be.
   */
  const glows = useMemo(
    () =>
      [0, 1].map(() => ({
        core: new MeshBasicMaterial({
          transparent: true,
          opacity: 0.9,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
        halo: new MeshBasicMaterial({
          transparent: true,
          opacity: 0.16,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      })),
    [],
  )

  useEffect(
    () => () =>
      glows.forEach((g) => {
        g.core.dispose()
        g.halo.dispose()
      }),
    [glows],
  )

  const lights = useRef<(Mesh | null)[]>([null, null])
  const t = useRef(0)
  const warm = useMemo(() => new Color('#ffb765'), [])
  const cool = useMemo(() => new Color('#8fb4ff'), [])
  const mixed = useMemo(() => new Color(), [])
  const blended = useMemo(() => new Color(), [])

  const mine = profiles[me]
  const theirs = profiles[me === 'warm' ? 'cool' : 'warm']

  /**
   * The two local hours, re-read every twenty seconds rather than every frame.
   *
   * `localHourIn` goes through Intl.DateTimeFormat.formatToParts, which is far
   * too heavy to run twice a frame for a value that changes once a minute.
   */
  const hours = useRef<[number, number]>([12, 0])
  const sinceClock = useRef(Infinity)

  useFrame((_, delta) => {
    t.current += delta
    sinceClock.current += delta

    if (sinceClock.current > 20) {
      sinceClock.current = 0
      const now = Date.now()
      hours.current = [localHourIn(mine.timeZone, now), localHourIn(theirs.timeZone, now)]
    }

    blended.setRGB(0, 0, 0)

    lights.current.forEach((light, i) => {
      if (!light) return
      // Each light takes the colour of its own person's hour.
      mixed.copy(cool).lerp(warm, warmth(hours.current[i]))
      glows[i].core.color.copy(mixed)
      glows[i].halo.color.copy(mixed)
      blended.add(mixed)

      // breathing, slightly out of step with each other
      const own = t.current * 0.7 + i * 2.4
      const breath = 1 + Math.sin(own) * 0.06 + Math.sin(own * 1.7) * 0.03
      light.scale.setScalar(breath)
      light.position.y = LIGHTS[i].y + Math.sin(own * 0.8) * 0.05
    })

    // what the two of them together do to the stone underneath
    const ember = stoneMat.uniforms.uEmberColor.value as Color
    ember.copy(blended).multiplyScalar(0.5)
  })

  return (
    <group>
      <mesh geometry={stone} material={stoneMat} frustumCulled={false} />

      {/* Near enough to be a pair, far enough apart to be two — and never
          level with each other. Two equal glows side by side at the same
          height read unmistakably as a face, which is not the feeling this
          place is for. One sits higher, larger and nearer; the other hangs
          back. */}
      {LIGHTS.map(({ x, y, z, size }, i) => (
        <mesh
          key={i}
          ref={(m) => {
            lights.current[i] = m
          }}
          position={[x, y, z]}
          material={glows[i].core}
        >
          <sphereGeometry args={[size, 18, 12]} />
        </mesh>
      ))}

      {/* A wider, fainter halo around each, so the light has somewhere to fall
          off to instead of ending at the edge of a sphere. */}
      {LIGHTS.map(({ x, y, z, size }, i) => (
        <mesh key={`halo-${i}`} position={[x, y, z]} material={glows[i].halo} scale={3.0}>
          <sphereGeometry args={[size, 12, 8]} />
        </mesh>
      ))}

    </group>
  )
}
