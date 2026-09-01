/**
 * Live, allocation-free bridge from the Rootway to its soundscape.
 *
 * The race publishes the road's own dimensions through `tunnel`; what it does
 * not publish is where the *dressing* is, because nothing in the physics cares
 * how many lanterns are burning. The fire on the walls and the timber through
 * the roof both belong to the ear, so they are sampled into two coarse fields
 * once at mount — see `fireField` and `rootField` in `tunnel.ts`, which is
 * where they live so that `npm run sound` can drive this road with the real
 * lantern layout rather than a plausible-looking sweep.
 *
 * Reading one is a lerp. Nothing here allocates after the first frame.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ambience } from '../../../systems/ambience'
import {
  createRootwayVoice,
  type RootwaySoundState,
  type RootwayVoice,
} from '../../../systems/rootway'
import { useRace } from './session'
import { fieldAt, fireField, rootField, tunnel } from './tunnel'
import type { Track } from './track'

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

export function RootwaySound({ track }: { track: Track }) {
  const voice = useRef<RootwayVoice | null>(null)
  const state = useRef<RootwaySoundState>({
    speed: 0,
    s: 0,
    enclosed: 0,
    ceiling: 5.6,
    wet: 0,
    fire: 0,
    roots: 0,
    paused: true,
  })

  const fire = useMemo(() => fireField(track), [track])
  const roots = useMemo(() => rootField(track), [track])

  useEffect(
    () => () => {
      voice.current?.stop()
      voice.current = null
    },
    [],
  )

  useFrame(() => {
    // The shared AudioContext may only exist after the first gesture. Acquiring
    // lazily means loading the world silently first can never strand this road
    // with a permanently missing soundscape.
    if (!voice.current) {
      const bus = ambience.synthesisBus()
      if (bus) voice.current = createRootwayVoice(bus)
      if (!voice.current) return
    }

    const race = useRace.getState()
    const frame = state.current
    frame.s = tunnel.s
    frame.speed = tunnel.speed
    frame.enclosed = tunnel.enclosed
    frame.ceiling = tunnel.ceiling
    frame.wet = tunnel.wet
    frame.fire = clamp(fieldAt(fire, tunnel.s))
    frame.roots = clamp(fieldAt(roots, tunnel.s))
    frame.paused = race.paused || race.phase === 'finished' || race.phase === 'ready'
    voice.current.set(frame)
  })

  return null
}
