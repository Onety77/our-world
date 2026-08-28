/**
 * The small bridge between the Rootway and its soundscape.
 *
 * Same shape as `MoonbreakSound`, and for the same reasons: none of these
 * values belongs in React state, the AudioContext may not exist until the
 * first gesture, and the voice has to be torn down when the road is.
 *
 * The one difference is where the numbers come from. The Moonbreak's ear
 * reconstructs its own idea of speed from the chase camera, because depth and
 * distance were all it needed. The Rootway's ear needs the road — how tight
 * the rock is, what is running down it, what is overhead — so the race
 * publishes that through `around` and this reads it, rather than sampling a
 * track it would then have a second, slightly different opinion about.
 */

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ambience } from '../../../systems/ambience'
import { createRootwayVoice, type RootwayVoice } from '../../../systems/rootway'
import { around } from './around'
import { useRace } from './session'

export function RootwaySound() {
  const voice = useRef<RootwayVoice | null>(null)

  useEffect(
    () => () => {
      voice.current?.stop()
      voice.current = null
    },
    [],
  )

  useFrame(() => {
    // Acquired lazily: loading the world silently first must never strand this
    // road with a permanently missing soundscape.
    if (!voice.current) {
      const bus = ambience.synthesisBus()
      if (bus) voice.current = createRootwayVoice(bus)
    }
    const ear = voice.current
    if (!ear) return

    const race = useRace.getState()
    const idle = race.paused || race.phase === 'ready' || race.phase === 'finished'

    ear.set({
      speed: around.speed,
      tight: around.tight,
      wet: around.wet,
      rough: around.rough,
      wake: around.wake,
      roots: around.roots,
      lamp: around.lamp,
      fire: around.fire,
      water: around.water,
      scrape: around.scrape,
      /*
        Sitting on the line is not paused.

        The bed drops to a fifth while genuinely paused, but before the flag
        the cave should be at full — it is the only thing there is to listen to
        for those three seconds, and it is the best chance the whole race gets
        to establish that there is a mountain on top of you.
      */
      paused: race.paused,
    })

    /*
      Events, drained rather than edge-detected.

      The race and this component are two `useFrame` callbacks whose order is
      decided by mount order, so a rising edge on a shared number is a sound
      that plays on some frames and not others. The queue does not care who
      runs first. Drained even while idle, so a crash on the last frame before
      a finish is not still sitting there when the next run starts.
    */
    const events = around.events
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      if (idle) continue
      if (event.kind === 'crash') ear.crash(event.force)
      else ear.splash(event.force)
    }
    events.length = 0
  })

  return null
}
