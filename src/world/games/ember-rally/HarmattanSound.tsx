/** Live, allocation-free bridge from the dust road to its soundscape. */

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ambience } from '../../../systems/ambience'
import {
  createHarmattanVoice,
  type HarmattanSoundState,
  type HarmattanVoice,
} from '../../../systems/harmattan'
import { useRace } from './session'
import { dust, district } from './dust'
import { HARMATTAN, type Track } from './track'

export function HarmattanSound({ track }: { track: Track }) {
  const voice = useRef<HarmattanVoice | null>(null)
  /*
    One state object for the life of the component, mutated in place.

    Sixty allocations a second of a nine-field object is not expensive and is
    exactly the kind of thing that ends up in a profile of a course this long,
    so it is done the way the other three roads do it.
  */
  const frame = useRef<HarmattanSoundState>({
    speed: 0,
    s: 0,
    exposed: 0,
    sand: 0,
    rumble: 0,
    mounds: 0,
    town: 0,
    scarp: 0,
    paused: true,
  })

  useEffect(
    () => () => {
      voice.current?.stop()
      voice.current = null
    },
    [],
  )

  useFrame(() => {
    if (!voice.current) {
      const bus = ambience.synthesisBus()
      if (bus) voice.current = createHarmattanVoice(bus)
    }
    const ear = voice.current
    if (!ear) return

    const race = useRace.getState()
    const s = dust.s
    const now = frame.current
    now.speed = dust.speed
    now.s = s
    now.exposed = dust.exposed
    now.sand = dust.sand
    now.rumble = dust.rumble
    /*
      Where you are, as three overlapping windows rather than as a section id.

      A hard boundary would mean the wind changes character in one metre, which
      reads as a switch being thrown. These fade over tens of metres, which is
      how far it actually takes to get out from behind a termite mound.
    */
    now.mounds = district(s, HARMATTAN.cathedrals.from, HARMATTAN.cathedrals.to, 40)
    now.scarp = district(s, HARMATTAN.scarp.from, HARMATTAN.scarp.to, 55)
    /*
      The town, and this one is narrow on purpose.

      Everything else here eases. The walls do not: you go through a gate, and
      on the other side of it the loudest thing on the road has stopped. Twelve
      metres of fade is about a car length and a half at the speed anyone gets
      through there, which is fast enough to be an event and slow enough not to
      click. It is the best moment on the road and it is made of this number.
    */
    now.town = district(s, HARMATTAN.gateAt, HARMATTAN.gateOut, 12)
    now.paused = race.paused || race.phase === 'ready' || race.phase === 'finished'
    ear.set(now)
  })

  void track
  return null
}
