/** Live, allocation-free bridge from the mountain road to its soundscape. */

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ambience } from '../../../systems/ambience'
import {
  createStormcrownVoice,
  type StormcrownSoundState,
  type StormcrownVoice,
} from '../../../systems/stormcrown'
import { useRace } from './session'
import { STORMCROWN, type Track } from './track'
import { storm } from './weather'

const RODS = STORMCROWN.lightningRods

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

function smoothstep(from: number, to: number, value: number) {
  const at = clamp((value - from) / Math.max(0.0001, to - from))
  return at * at * (3 - 2 * at)
}

function district(s: number, from: number, to: number, fade = 36) {
  return smoothstep(from - fade, from + fade, s) * (1 - smoothstep(to - fade, to + fade, s))
}

function nearby(s: number, landmark: number, reach: number) {
  return 1 - smoothstep(reach * 0.18, reach, Math.abs(s - landmark))
}

export function StormcrownSound({ track }: { track: Track }) {
  const voice = useRef<StormcrownVoice | null>(null)
  const lastS = useRef(storm.s)
  const lastFlash = useRef(storm.flash)
  /** Thunder that has been dealt and is still on its way here. */
  const pending = useRef<{ at: number; force: number }[]>([])
  const clock = useRef(0)
  const state = useRef<StormcrownSoundState>({
    speed: 0,
    s: 0,
    rain: 0,
    inCloud: 0,
    above: 0,
    forest: 0,
    exposed: 0,
    stair: 0,
    eye: 0,
    stormfall: 0,
    waterfall: 0,
    waterfallPan: 0,
    paused: true,
  })
  useEffect(
    () => () => {
      voice.current?.stop()
      voice.current = null
    },
    [],
  )

  useFrame((_, delta) => {
    if (!voice.current) {
      const bus = ambience.synthesisBus()
      if (bus) voice.current = createStormcrownVoice(bus)
    }

    const ear = voice.current
    const s = storm.s
    const race = useRace.getState()
    if (ear) {
      let waterfall = 0
      let waterfallPan = 0
      for (let index = 0; index < STORMCROWN.waterfalls.length; index++) {
        const amount = nearby(s, STORMCROWN.waterfalls[index], 145)
        if (amount > waterfall) {
          waterfall = amount
          waterfallPan = index % 2 === 0 ? -1 : 1
        }
      }

      const frame = state.current
      frame.speed = storm.speed
      frame.s = s
      frame.rain = storm.rain
      frame.inCloud = storm.inCloud
      frame.above = storm.above
      frame.forest = Math.max(
        district(s, STORMCROWN.rainwood.from, STORMCROWN.rainwood.to, 45),
        district(s, STORMCROWN.lastRun.from - 45, track.finishAt, 70),
      )
      frame.exposed = Math.max(
        district(s, STORMCROWN.galeBend.approach, STORMCROWN.galeBend.exit, 55),
        district(s, STORMCROWN.cloudShelf.from, STORMCROWN.cloudShelf.to, 50),
        district(s, STORMCROWN.eye.from + 300, STORMCROWN.eye.to, 45),
        district(s, STORMCROWN.stormfall.from, STORMCROWN.stormfall.to, 55),
      )
      frame.stair = district(
        s,
        STORMCROWN.thunderStair.approach,
        STORMCROWN.thunderStair.exit,
        52,
      )
      frame.eye = district(s, STORMCROWN.eye.from, STORMCROWN.eye.to, 58)
      frame.stormfall = district(s, STORMCROWN.stormfall.from, STORMCROWN.stormfall.to, 65)
      frame.waterfall = waterfall
      frame.waterfallPan = waterfallPan
      frame.paused = race.paused || race.phase === 'ready' || race.phase === 'finished'
      ear.set(frame)

      // The shader's stroke is the authority. A sharp rise means a new visible
      // channel; the voice itself groups the closely repeated strokes so only
      // one complete thunder roll follows a pair or triplet.
      if (storm.flash > lastFlash.current + 0.16 && storm.flash > 0.32) {
        const remoteness = clamp(0.06 + storm.above * 0.78 + (1 - storm.inCloud) * (1 - storm.above) * 0.2)
        const coming = ear.lightning(storm.flash, remoteness, storm.above > 0.45)
        /*
          Book the *arrival*, not the flash.

          The voice knows how far away it was and therefore when the sound gets
          here; nothing else does. Kept as a list because a distant roll can
          still be on its way when the next stroke is dealt, and dropping the
          earlier one would silently mean only the last strike in a storm was
          ever heard by anything outside the audio graph.
        */
        if (coming !== null) {
          pending.current.push({ at: clock.current + coming.in, force: coming.near })
        }
      }

      /*
        And the envelope it makes when it lands: a hard edge, then most of a
        second of decay. `storm.thunder` is what the music ducks under.
      */
      clock.current += Math.min(0.1, delta)
      let loudest = 0
      for (let i = pending.current.length - 1; i >= 0; i--) {
        const strike = pending.current[i]
        const age = clock.current - strike.at
        if (age < 0) continue
        if (age > 1.4) {
          pending.current.splice(i, 1)
          continue
        }
        loudest = Math.max(loudest, strike.force * Math.exp(-age * 2.6))
      }
      storm.thunder = loudest

      const travelled = s - lastS.current
      if (travelled >= 0 && travelled < 60) {
        for (const rod of RODS) {
          if (lastS.current < rod && s >= rod) ear.rod(storm.speed / 42, storm.flash)
        }
      }
    }

    lastFlash.current = storm.flash
    lastS.current = s
  })

  return null
}
