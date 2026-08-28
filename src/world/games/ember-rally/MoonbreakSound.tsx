/**
 * The small bridge between the Moonbreak road and its synthesized soundscape.
 *
 * None of these values belongs in React state: distance, depth and speed move
 * every frame. The race already publishes distance/depth through `deep`, so
 * this component reads that same truth and hands a compact description of the
 * current place to the audio voice.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ambience } from '../../../systems/ambience'
import {
  createMoonbreakVoice,
  type MoonbreakSoundState,
  type MoonbreakVoice,
} from '../../../systems/moonbreak'
import { deep } from './depth'
import { useRace } from './session'
import { MOONBREAK, type Track } from './track'

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

function smoothstep(from: number, to: number, value: number) {
  const at = clamp((value - from) / Math.max(0.0001, to - from))
  return at * at * (3 - 2 * at)
}

/** A soft-edged authored district, so its voice arrives before its geometry. */
function district(s: number, from: number, to: number, fade = 28) {
  return smoothstep(from - fade, from + fade, s) * (1 - smoothstep(to - fade, to + fade, s))
}

export function MoonbreakSound({ track }: { track: Track }) {
  const voice = useRef<MoonbreakVoice | null>(null)
  const lastS = useRef(deep.s)
  const speed = useRef(0)
  const clock = useRef(0)
  const state = useRef<MoonbreakSoundState>({
    speed: 0,
    depth: 0,
    s: 0,
    orchard: 0,
    reeds: 0,
    exposed: 0,
    creature: 0,
    paused: true,
  })
  const arches = useMemo(
    () =>
      Array.from(
        new Set([
          ...MOONBREAK.arches,
          MOONBREAK.deep.under.in,
          MOONBREAK.deep.under.out,
          track.finishAt,
        ]),
      ).sort((a, b) => a - b),
    [track.finishAt],
  )

  useEffect(
    () => () => {
      voice.current?.stop()
      voice.current = null
    },
    [],
  )

  useFrame((_, rawDelta) => {
    const delta = Math.min(0.05, rawDelta)
    clock.current += delta

    // The shared AudioContext may only exist after the first gesture. Acquiring
    // lazily means loading the world silently first can never strand this road
    // with a permanently missing soundscape.
    if (!voice.current) {
      const bus = ambience.synthesisBus()
      if (bus) voice.current = createMoonbreakVoice(bus)
    }

    const s = deep.s
    const travelled = Math.abs(s - lastS.current)
    const race = useRace.getState()
    const active = race.phase === 'running' || race.phase === 'replay'
    // A restart/camera reset is a teleport, not an impossible gust of wind.
    const measured = active && travelled < 24 ? clamp(travelled / Math.max(0.001, delta), 0, 46) : 0
    speed.current += (measured - speed.current) * (1 - Math.exp(-(measured > speed.current ? 7 : 3.6) * delta))

    if (voice.current) {
      // `Deepwater` moves its large shadow on this exact twenty-one-second
      // crossing. Keeping the same clock makes the pressure arrive with the
      // silhouette instead of becoming an unrelated horror sting.
      const cycle = (clock.current % 21) / 21
      const along = 120 - cycle * 210
      const across = Math.cos(cycle * Math.PI * 2) * 26
      const above = 11.5 + Math.sin(cycle * Math.PI) * 3.5
      const creatureDistance = Math.hypot(along, across, above)
      const creature = Math.exp(-(creatureDistance * creatureDistance) / (2 * 43 * 43))

      const frame = state.current
      frame.speed = speed.current
      frame.depth = deep.at
      frame.s = s
      frame.orchard = district(s, MOONBREAK.orchard.from, MOONBREAK.orchard.to, 24)
      frame.reeds = district(s, MOONBREAK.reeds.from, MOONBREAK.reeds.to, 34)
      frame.exposed = Math.max(
        district(s, MOONBREAK.orchard.to, MOONBREAK.hard.approach, 34),
        district(s, MOONBREAK.stair.from, MOONBREAK.veryHard.exit, 45),
      )
      frame.creature = creature * smoothstep(0.28, 0.78, deep.at)
      frame.paused = race.paused || race.phase === 'finished' || race.phase === 'ready'
      voice.current.set(frame)

      const forward = s >= lastS.current
      if (forward && travelled < 60) {
        for (const arch of arches) {
          if (lastS.current < arch && s >= arch) voice.current.arch(speed.current / 42)
        }
      }
    }

    lastS.current = s
  })

  return null
}
