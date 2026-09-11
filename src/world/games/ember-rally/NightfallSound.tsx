/**
 * The Nightfall's soundscape: the garden's own ambient bed, driven through.
 *
 * Nothing is synthesised here — see `garden.ts` for why. This bridge tells the
 * bed which place the car is passing through and puts it back where it was
 * when the road is left, so the garden behind the race sounds like the place
 * you were standing in before you drove off.
 */

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ambience, type Place } from '../../../systems/ambience'
import { useRace } from './session'
import { garden, nightfallSoundTelemetry } from './garden'
import type { Track } from './track'

export function NightfallSound({ track }: { track: Track }) {
  const before = useRef<Place | null>(null)
  const told = useRef<Place | null>(null)

  useEffect(() => {
    before.current = ambience.hearing().place
    return () => {
      if (before.current) ambience.setPlace(before.current)
      told.current = null
    }
  }, [])

  useFrame(() => {
    const race = useRace.getState()
    // Before the green light the car is on the Meadow, which is the garden; a
    // pause or the flag leave the bed where it is rather than snapping it.
    if (race.paused || race.phase === 'finished') return
    const want = race.phase === 'ready' ? 'garden' : garden.place
    if (told.current === want) return
    told.current = want
    ambience.setPlace(want)
    nightfallSoundTelemetry.place = want
    nightfallSoundTelemetry.changes++
  })

  void track
  return null
}
