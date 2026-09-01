/**
 * The Rootway, as heard from the car.
 *
 * ---------------------------------------------------------------------------
 * The other two roads had a voice and this one did not, which meant driving
 * underground played the *garden's* ambient bed — open-meadow air, in a cave.
 * That is worse than silence: the ear knows a tunnel is not windy, and a
 * soundscape that ignores where you are standing quietly says the place is not
 * real. See the note at the top of `ambience.ts`, which is where that argument
 * was first won and then not applied here.
 *
 * **What this is not.** It is not the car — `engine.ts` already owns the
 * engine, the tyres, the wind over the body and the cave reverb the *car* sits
 * in, and it already whistles where the rock closes in (`EngineState.tight`).
 * Everything below is the room the car is in: the air standing in it, the water
 * coming through the roof, the fire on the walls, and the size of the space.
 *
 * **The subject is enclosure.** The Moonbreak dives and the Stormcrown climbs
 * out of the weather; the Rootway opens and closes. A chamber is thirteen
 * metres to the vault, the throat before the arrival hall is under four, and
 * the road spends its whole length moving between them. So `enclosed` is the
 * one number nearly everything here is hung off — the reverb send, the colour
 * of the draught, how much of your own dust comes back off the wall, and the
 * pressure underneath all of it. Coming out of a throat into the hall is meant
 * to be the loudest thing that happens on the road without anything getting
 * louder.
 *
 * Every continuous layer is filtered noise off the garden's existing shared
 * buffer. Nothing is downloaded, there is no second `AudioContext`, and every
 * layer is steered by the road's own sampled arrays rather than by a table of
 * distances — which matters more here than anywhere else, because the Rootway
 * is dealt from a bag of pieces on a daily seed and no two days are the same
 * road.
 * ---------------------------------------------------------------------------
 */

import type { SynthesisBus } from './ambience'

export interface RootwaySoundState {
  /** Metres per second. */
  speed: number
  /** Metres along the authored road. */
  s: number
  /** 0 in the great halls, 1 in the tightest throat. See `tunnel.ts`. */
  enclosed: number
  /** Metres to the vault above the road. */
  ceiling: number
  /** 0..1 — wet stone. The drips, and the sheen they come off. */
  wet: number
  /** 0..1 — how close the nearest real flame is. Lanterns and the two hearths. */
  fire: number
  /** 0..1 — how much old timber is coming through the rock just here. */
  roots: number
  paused: boolean
}

export interface RootwayVoice {
  set(state: RootwaySoundState): void
  stop(): void
}

/** Live diagnostic values for mix checks; never used to drive rendering. */
export const rootwaySoundTelemetry = {
  rms: 0,
  peak: 0,
  enclosed: 0,
  wet: 0,
  fire: 0,
  drips: 0,
  mouths: 0,
}
/*
  Optional, unlike its two neighbours, and deliberately.

  `npm run sound` imports this file into Node and drives it over a real lap
  against a stub Web Audio API. Vite's `import.meta.env` does not exist there,
  so the bare read the other road voices use would throw on the import line and
  the check could never run at all.
*/
if (import.meta.env?.DEV) {
  const host = globalThis as typeof globalThis & { __rallySound?: Record<string, unknown> }
  host.__rallySound ??= {}
  host.__rallySound.rootway = rootwaySoundTelemetry
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

function smoothstep(from: number, to: number, value: number) {
  const at = clamp((value - from) / Math.max(0.0001, to - from))
  return at * at * (3 - 2 * at)
}

/**
 * Stone: a long dark tail with hard early reflections close in front of it.
 *
 * Deliberately not the Moonbreak's `tubeImpulse`, which is short and bright
 * because glass and water are. Rock under a garden returns late, returns dark,
 * and — the part that actually reads as a cave — returns *twice* early, off two
 * walls that are only a few metres away. The three discrete taps below are
 * those walls; their unevenness is what stops it sounding like a plate.
 */
function stoneImpulse(ctx: AudioContext) {
  const seconds = 1.9
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let low = 0
    for (let i = 0; i < length; i++) {
      const life = 1 - i / length
      // Heavier smoothing than glass: rock eats the top of everything it
      // returns, so the tail has to arrive already dark rather than be
      // filtered dark afterwards.
      low = low * 0.88 + (Math.random() * 2 - 1) * 0.12
      data[i] = low * Math.pow(life, 3.1) * 0.3
    }
    for (const [at, level] of [[0.011, 0.58], [0.023, -0.37], [0.048, 0.22]] as const) {
      const i = Math.floor(at * ctx.sampleRate * (channel ? 1.16 : 1))
      if (i < length) data[i] += level
    }
  }
  return buffer
}

export function createRootwayVoice(bus: SynthesisBus): RootwayVoice {
  const { context: ctx, output, noise, noiseSeconds } = bus
  const born = ctx.currentTime

  /* One safe envelope for the whole place, as on the other two roads. A hall
     opening while a drip lands while the fire is close must never sum into a
     crack on a phone speaker. */
  const out = ctx.createGain()
  out.gain.value = 0.0001
  const speakerCut = ctx.createBiquadFilter()
  speakerCut.type = 'highpass'
  speakerCut.frequency.value = 30
  speakerCut.Q.value = 0.6
  const safety = ctx.createDynamicsCompressor()
  safety.threshold.value = -12
  safety.knee.value = 16
  safety.ratio.value = 2.9
  safety.attack.value = 0.006
  safety.release.value = 0.24
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.45
  const meterSamples = new Float32Array(analyser.fftSize)
  let meterFrame = 0
  out.connect(speakerCut).connect(safety).connect(analyser).connect(output)

  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(out)

  /*
    The stone tail, and the one filter in front of it that does most of the work.

    A convolver cannot change its impulse cheaply, so the *room* is changed by
    what is allowed into it instead: in a throat the send is small and the
    pre-filter is shut down to a few hundred hertz, so the walls answer close
    and dull; in a hall the send opens and brightens and the same tail suddenly
    reads as distance. That is the whole trick, and it costs two AudioParams.
  */
  const verb = ctx.createConvolver()
  verb.buffer = stoneImpulse(ctx)
  const verbTone = ctx.createBiquadFilter()
  verbTone.type = 'lowpass'
  verbTone.frequency.value = 900
  verbTone.Q.value = 0.5
  const verbSend = ctx.createGain()
  verbSend.gain.value = 0.0001
  const verbReturn = ctx.createGain()
  verbReturn.gain.value = 0.8
  verbSend.connect(verbTone).connect(verb).connect(verbReturn).connect(out)

  function loop(rate: number) {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.loop = true
    source.playbackRate.value = rate
    source.start()
    return source
  }

  /*
    The room itself: the near-sub of being inside several million tonnes of rock.

    This is the layer that is doing the work when you think nothing is playing.
    It has almost no top, it barely moves, and it is the difference between a
    dark screen and a dark screen you are underneath.
  */
  const roomSource = loop(0.17)
  const roomLow = ctx.createBiquadFilter()
  roomLow.type = 'lowpass'
  roomLow.frequency.value = 150
  roomLow.Q.value = 0.85
  const roomGain = ctx.createGain()
  roomGain.gain.value = 0.0001
  roomSource.connect(roomLow).connect(roomGain).connect(dry)

  /*
    Air standing in the tunnel, and what the tunnel does to it.

    Not the wind over the car — that is the engine's, and it rises with the
    square of speed. This is the draught the *road* has: it whistles where the
    rock closes in and it loses its edge in the halls, so the narrowing is
    audible half a second before the walls arrive in the headlights.
  */
  const draughtSource = loop(0.94)
  const draughtBand = ctx.createBiquadFilter()
  draughtBand.type = 'bandpass'
  draughtBand.frequency.value = 620
  draughtBand.Q.value = 0.8
  const draughtGain = ctx.createGain()
  draughtGain.gain.value = 0.0001
  const draughtPan = ctx.createStereoPanner()
  draughtSource.connect(draughtBand).connect(draughtGain).connect(draughtPan).connect(dry)

  /*
    Your own dust, coming back off a wall that is close enough to return it.

    The Rootway is `loose: 0.85` — earth over rock, end to end — so there is
    always dust in the air behind the car. In a hall it goes away from you and
    is never heard again. In a throat the wall is two metres off the mirror and
    it comes straight back, which is why tight sections feel *dirty* rather than
    merely narrow. Speed and enclosure both, multiplied: neither alone is it.
  */
  const gritSource = loop(1.64)
  const gritBand = ctx.createBiquadFilter()
  gritBand.type = 'bandpass'
  gritBand.frequency.value = 2400
  gritBand.Q.value = 0.5
  const gritGain = ctx.createGain()
  gritGain.gain.value = 0.0001
  gritSource.connect(gritBand).connect(gritGain).connect(dry)

  /* Wet stone, before any single drop of it lands. A fine trickle running in
     the dark, high and quiet, so the drips below have something to come out of
     rather than arriving from nowhere. */
  const seepSource = loop(1.28)
  const seepBand = ctx.createBiquadFilter()
  seepBand.type = 'bandpass'
  seepBand.frequency.value = 3100
  seepBand.Q.value = 1.15
  const seepGain = ctx.createGain()
  seepGain.gain.value = 0.0001
  seepSource.connect(seepBand).connect(seepGain).connect(verbSend)

  /* Lantern fire: a low roar, with the crackles scheduled separately below.
     Fire that is only a roar is a gas burner. */
  const fireSource = loop(0.55)
  const fireLow = ctx.createBiquadFilter()
  fireLow.type = 'lowpass'
  fireLow.frequency.value = 700
  fireLow.Q.value = 0.7
  const fireGain = ctx.createGain()
  fireGain.gain.value = 0.0001
  fireSource.connect(fireLow).connect(fireGain).connect(dry)

  /*
    The rock taking its own weight.

    Two very low modes, slightly detuned against each other so they beat over
    about a dozen seconds rather than sitting still. Only really present in the
    tight sections, where the load is genuinely on the roof.
  */
  const pressA = ctx.createOscillator()
  pressA.type = 'sine'
  pressA.frequency.value = 38
  const pressB = ctx.createOscillator()
  pressB.type = 'sine'
  pressB.frequency.value = 51
  const pressGain = ctx.createGain()
  pressGain.gain.value = 0.0001
  pressA.connect(pressGain)
  pressB.connect(pressGain)
  pressGain.connect(dry)
  pressA.start()
  pressB.start()

  let stopped = false
  let lastS = 0
  let lastEnclosed = 0
  let dripDue = born + 1.4
  let crackleDue = born + 0.9
  let creakDue = born + 5.5
  let fallDue = born + 9

  function burst(
    when: number,
    peak: number,
    length: number,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    rate: number,
    into: AudioNode = dry,
  ) {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.playbackRate.value = rate
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
    source.connect(filter).connect(gain).connect(into)
    source.start(when, Math.random() * Math.max(0.1, noiseSeconds - 0.5), length + 0.05)
    source.stop(when + length + 0.06)
  }

  /** A struck body with a pitch in it: a drip's ring, a root's groan. */
  function ring(
    when: number,
    from: number,
    to: number,
    peak: number,
    length: number,
    into: AudioNode = verbSend,
  ) {
    const voice = ctx.createOscillator()
    voice.type = 'sine'
    voice.frequency.setValueAtTime(from, when)
    voice.frequency.exponentialRampToValueAtTime(Math.max(20, to), when + length)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
    voice.connect(gain).connect(into)
    voice.start(when)
    voice.stop(when + length + 0.04)
  }

  out.gain.setTargetAtTime(1.05, born, 0.3)

  return {
    set(state) {
      if (stopped) return
      const now = ctx.currentTime
      const enclosed = clamp(state.enclosed)
      const openness = 1 - enclosed
      const speed = clamp(state.speed, 0, 46)
      const fast = smoothstep(3, 40, speed)
      const moving = smoothstep(1.2, 12, speed)
      const wet = clamp(state.wet)
      const fire = clamp(state.fire)
      const paused = state.paused ? 0.16 : 1

      out.gain.setTargetAtTime(1.05 * paused, now, state.paused ? 0.08 : 0.28)

      /*
        The room, and the only place the *raw* ceiling is used rather than the
        normalised enclosure. A thirteen-metre vault genuinely resonates lower
        than a four-metre one, and that is a pitch rather than a level.
      */
      const vault = clamp((state.ceiling - 3.4) / 9.6)
      roomLow.frequency.setTargetAtTime(96 + (1 - vault) * 120 + fast * 30, now, 0.4)
      roomGain.gain.setTargetAtTime(0.2 + enclosed * 0.17, now, 0.45)

      draughtBand.frequency.setTargetAtTime(430 + enclosed * 1150 + fast * 340, now, 0.2)
      // The narrower it is, the more the draught becomes a note rather than a
      // hiss. This is the single most legible cue on the road.
      draughtBand.Q.setTargetAtTime(0.7 + enclosed * enclosed * 5.4, now, 0.3)
      draughtGain.gain.setTargetAtTime(
        (0.05 + moving * 0.11 + fast * 0.14) * (0.42 + enclosed * 0.58),
        now,
        0.16,
      )
      // Slow, and never fully to one side: a tunnel is around you.
      draughtPan.pan.setTargetAtTime(Math.sin(now * 0.31) * (0.14 + openness * 0.3), now, 0.4)

      gritBand.frequency.setTargetAtTime(1800 + fast * 2100, now, 0.2)
      gritGain.gain.setTargetAtTime(moving * fast * enclosed * 0.26, now, 0.13)

      seepBand.frequency.setTargetAtTime(2500 + wet * 1400, now, 0.25)
      seepGain.gain.setTargetAtTime(wet * (0.07 + enclosed * 0.06), now, 0.3)

      fireLow.frequency.setTargetAtTime(560 + fire * 320, now, 0.25)
      fireGain.gain.setTargetAtTime(fire * fire * 0.3, now, 0.18)

      pressA.frequency.setTargetAtTime(36 + enclosed * 7, now, 0.5)
      pressB.frequency.setTargetAtTime(49 + enclosed * 9, now, 0.5)
      pressGain.gain.setTargetAtTime(enclosed * enclosed * 0.055, now, 0.4)

      /*
        And the room the whole thing is heard in.

        Both halves move together on purpose — a hall sends *more* into the
        tail and sends it *brighter*, and doing only one of the two reads as a
        volume change rather than as a bigger space.
      */
      verbSend.gain.setTargetAtTime(0.1 + openness * 0.42, now, 0.4)
      verbTone.frequency.setTargetAtTime(520 + openness * 2100, now, 0.4)

      rootwaySoundTelemetry.enclosed = enclosed
      rootwaySoundTelemetry.wet = wet
      rootwaySoundTelemetry.fire = fire
      if (++meterFrame % 6 === 0) {
        analyser.getFloatTimeDomainData(meterSamples)
        let energy = 0
        let peak = 0
        for (let i = 0; i < meterSamples.length; i++) {
          const sample = meterSamples[i]
          energy += sample * sample
          peak = Math.max(peak, Math.abs(sample))
        }
        rootwaySoundTelemetry.rms = Math.sqrt(energy / meterSamples.length)
        rootwaySoundTelemetry.peak = peak
      }

      const forward = state.s >= lastS
      const jumped = !forward && lastS - state.s > 50

      if (!state.paused) {
        /*
          Water off the roof — the signature of the place.

          Three distances, chosen per drop rather than layered: a near one is
          bright, loud and barely reverberant; a far one is dull, quiet and
          almost entirely tail. Picking one at random each time is what makes a
          cave sound *deep*, because the ear places the walls from the spread
          rather than from any single drop. Gated on wet stone, so the dry
          chambers are genuinely dry.
        */
        if (wet > 0.16 && now >= dripDue) {
          const near = Math.random()
          const close = near * near
          const pitch = 760 + Math.random() * 1500 * (0.4 + close * 0.6)
          ring(now, pitch, pitch * 0.42, (0.02 + close * 0.075) * (0.5 + wet * 0.5), 0.1 + close * 0.06)
          burst(
            now,
            (0.012 + close * 0.03) * (0.5 + wet * 0.5),
            0.035,
            'bandpass',
            pitch * 1.6,
            2.2,
            1.5,
            close > 0.55 ? dry : verbSend,
          )
          rootwaySoundTelemetry.drips++
          // Faster where it is wetter, and never regular: a metronome in a cave
          // is a tap, not a roof.
          dripDue = now + (0.22 + Math.random() * 1.5) / (0.25 + wet)
        }

        /* Fire, close enough to have detail in it. */
        if (fire > 0.2 && now >= crackleDue) {
          burst(now, fire * (0.02 + Math.random() * 0.05), 0.045, 'bandpass', 1500 + Math.random() * 2300, 1.6, 1.35)
          crackleDue = now + 0.05 + Math.random() * 0.32 / Math.max(0.2, fire)
        }

        /*
          Old timber in the rock. Rare, low, and slow — the Rootway is named for
          these and a root that creaked every few seconds would be a floorboard.
        */
        if (state.roots > 0.35 && moving > 0.2 && now >= creakDue) {
          const base = 78 + Math.random() * 90
          ring(now, base, base * 0.55, 0.028 + state.roots * 0.03, 0.5 + Math.random() * 0.5)
          burst(now + 0.03, 0.012 + state.roots * 0.016, 0.3, 'bandpass', 340 + Math.random() * 260, 3.4, 0.6, verbSend)
          creakDue = now + 4 + Math.random() * 9
        }

        /*
          Something small letting go of a wall. Much likelier where the rock is
          close, because that is where you are disturbing it.
        */
        if (moving > 0.3 && now >= fallDue) {
          const size = Math.random()
          burst(now, 0.018 + size * 0.03, 0.09, 'bandpass', 900 + Math.random() * 900, 1.8, 1.1, verbSend)
          burst(now + 0.06 + size * 0.08, 0.014 + size * 0.026, 0.14, 'lowpass', 380, 0.9, 0.7, verbSend)
          burst(now + 0.19 + size * 0.2, 0.008 + size * 0.016, 0.22, 'bandpass', 620, 1.2, 0.9, verbSend)
          fallDue = now + (7 + Math.random() * 16) / (0.35 + enclosed)
        }
      }

      /*
        --- and the road opening ------------------------------------------

        The one authored event on the Rootway, derived from the state rather
        than announced by the racer: everything needed to know it happened is
        already here, and an edge is cheaper than an API the bridge has to
        remember to call. Same law as the gearbox in `engine.ts`.

        Out of a throat into a hall the air ahead of the car lets go — a soft
        broadband swell straight into the tail, so what you hear is the room
        arriving rather than a sound effect playing. Into a throat it is the
        opposite and much shorter: the space shuts, low and close.

        Skipped on a teleport, because a restart is not a doorway.
      */
      if (forward && !jumped && moving > 0.15) {
        if (lastEnclosed > 0.52 && enclosed <= 0.52) {
          rootwaySoundTelemetry.mouths++
          burst(now, 0.055 + fast * 0.06, 0.9, 'bandpass', 480, 0.5, 0.62, verbSend)
          burst(now + 0.04, 0.028 + fast * 0.03, 0.55, 'highpass', 1300, 0.45, 1.5, verbSend)
          ring(now, 62, 34, 0.035 + fast * 0.03, 0.85)
        } else if (lastEnclosed < 0.62 && enclosed >= 0.62) {
          rootwaySoundTelemetry.mouths++
          burst(now, 0.05 + fast * 0.055, 0.28, 'lowpass', 340, 0.8, 0.5)
          burst(now + 0.02, 0.022 + fast * 0.026, 0.16, 'bandpass', 820, 1.4, 0.95)
        }
      }

      lastEnclosed = enclosed
      lastS = state.s
    },

    stop() {
      if (stopped) return
      stopped = true
      const now = ctx.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setTargetAtTime(0.0001, now, 0.14)
      verbReturn.gain.setTargetAtTime(0.0001, now, 0.2)
      globalThis.setTimeout(() => {
        for (const node of [
          roomSource,
          draughtSource,
          gritSource,
          seepSource,
          fireSource,
          pressA,
          pressB,
        ]) {
          try {
            node.stop()
          } catch {
            /* already stopped */
          }
        }
        out.disconnect()
        verbReturn.disconnect()
        rootwaySoundTelemetry.rms = 0
        rootwaySoundTelemetry.peak = 0
      }, 850)
    },
  }
}
