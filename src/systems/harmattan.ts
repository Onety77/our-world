/**
 * The Harmattan's voice: a wind that never stops, and the ground under it.
 *
 * =============================================================================
 * **The other three roads are made of events. This one is made of a drone.**
 *
 * The Rootway drips and creaks, the Stormcrown cracks and peals, the Moonbreak
 * has water moving under a bridge. All three are *things happening* against a
 * quiet bed. A harmattan is the opposite kind of sound: it is one enormous
 * continuous noise that has been going for six weeks and will still be going
 * tomorrow, and everything else on the road is a hole punched in it.
 *
 * That inverts how the mix is built. Instead of a bed plus events, this is a
 * **wall plus absences**, and the loudest moment on the road is the one where
 * the wall stops — coming through the gate into the town, where two storeys of
 * earth take the wind away in about a second and a half. There is nothing to
 * hear in there but the engine and the wheels, and after two kilometres of
 * being shouted at, that silence is the best thing on the road.
 *
 * Four voices:
 *
 *   **the wind** — filtered noise, and the filter is where the character is.
 *   Open on the plain it is broad and low, a rush with no pitch in it. Between
 *   the mounds it narrows and starts to whistle, because that is what air does
 *   round a four-metre spire. On the scarp it is loudest and highest, because
 *   there is a cliff edge to tear over.
 *
 *   **the grit** — the sound of what the wind is carrying, and the reason a
 *   harmattan is not just a gale: a fine hiss of sand striking the car, which
 *   rises with speed because most of the closing speed is yours.
 *
 *   **the surface** — the road itself, which on this road has a voice. Sand
 *   under the tyres is a soft roar; corrugation is a hard rattle whose pitch is
 *   the wheels crossing the ripples, so it climbs with speed. This is the one
 *   soundscape here that is *derived from the physics* rather than from where
 *   you are: `rumble` comes straight off the car.
 *
 *   **the town** — a bell of shade. Not a sound: a filter. Everything above is
 *   ducked and rolled off inside the walls, which is what a wall does.
 * =============================================================================
 */

import type { SynthesisBus } from './ambience'

export interface HarmattanSoundState {
  /** Metres per second. */
  speed: number
  /** Metres along the authored road. */
  s: number
  /** 0..1 — how exposed to the wind this piece of road is. `Band.gale`. */
  exposed: number
  /** 0..1 — how deep the sand under the car is. `Band.sand`. */
  sand: number
  /** 0..1 — how hard the corrugation is shaking the car. `CarState.rumble`. */
  rumble: number
  /** 0..1 — between the mounds, where the wind starts to whistle. */
  mounds: number
  /** 0..1 — inside the walls, where all of it stops. */
  town: number
  /** 0..1 — out on the scarp with the cliff edge under the wind. */
  scarp: number
  paused: boolean
}

export interface HarmattanVoice {
  set(state: HarmattanSoundState): void
  stop(): void
}

/** Live diagnostic values for mix checks; never used to drive rendering. */
export const harmattanSoundTelemetry = {
  rms: 0,
  peak: 0,
  wind: 0,
  grit: 0,
  surface: 0,
  town: 0,
}

if (import.meta.env?.DEV) {
  const host = globalThis as typeof globalThis & { __rallySound?: Record<string, unknown> }
  host.__rallySound = host.__rallySound ?? {}
  host.__rallySound.harmattan = harmattanSoundTelemetry
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

export function createHarmattanVoice(bus: SynthesisBus): HarmattanVoice {
  const { context: ctx, output, noise } = bus

  /*
    One safe envelope for the whole place, as on the other three roads. A gust
    arriving while the car drops into a drift while the corrugation is at its
    worst must never sum into a crack on a phone speaker.
  */
  const out = ctx.createGain()
  out.gain.value = 0.0001
  const speakerCut = ctx.createBiquadFilter()
  speakerCut.type = 'highpass'
  speakerCut.frequency.value = 32
  speakerCut.Q.value = 0.6
  const safety = ctx.createDynamicsCompressor()
  safety.threshold.value = -14
  safety.knee.value = 26
  safety.ratio.value = 5
  safety.attack.value = 0.004
  safety.release.value = 0.19
  out.connect(speakerCut)
  speakerCut.connect(safety)
  safety.connect(output)

  /*
    The town filter, and everything goes through it.

    A lowpass rather than a level: a wall does not turn a wind down, it takes
    the top off it. Wide open on the road and down at seven hundred hertz
    inside, which is roughly what two storeys of earth do to a rush of air —
    and the ear reads that as *shelter* rather than as somebody moving a fader.
  */
  const shelter = ctx.createBiquadFilter()
  shelter.type = 'lowpass'
  shelter.frequency.value = 18_000
  shelter.Q.value = 0.4
  shelter.connect(out)

  // --- the wind ------------------------------------------------------------
  const windSource = ctx.createBufferSource()
  windSource.buffer = noise
  windSource.loop = true

  /*
    Two filters in series, and they do different jobs.

    The first is a bandpass that *is* the wind's pitch: broad and low over open
    ground, tight and high between the mounds. The second is a gentle lowpass
    that keeps the very top off, so nothing in here ever turns into hiss — a
    wind that hisses is a tape, not air.
  */
  const windBody = ctx.createBiquadFilter()
  windBody.type = 'bandpass'
  windBody.frequency.value = 320
  windBody.Q.value = 0.5
  const windTop = ctx.createBiquadFilter()
  windTop.type = 'lowpass'
  windTop.frequency.value = 2600
  const windGain = ctx.createGain()
  windGain.gain.value = 0.0001
  windSource.connect(windBody)
  windBody.connect(windTop)
  windTop.connect(windGain)
  windGain.connect(shelter)

  /*
    And a second, lower layer with no top at all: the weight underneath a big
    wind, which is what separates a gale from a draught. It is nearly all below
    two hundred hertz and it is most of why the plain feels open.
  */
  const weightSource = ctx.createBufferSource()
  weightSource.buffer = noise
  weightSource.loop = true
  const weightBody = ctx.createBiquadFilter()
  weightBody.type = 'lowpass'
  weightBody.frequency.value = 190
  weightBody.Q.value = 0.7
  const weightGain = ctx.createGain()
  weightGain.gain.value = 0.0001
  weightSource.connect(weightBody)
  weightBody.connect(weightGain)
  weightGain.connect(shelter)

  // --- the grit ------------------------------------------------------------
  /*
    Sand hitting the car. High, thin, and it belongs to *speed* rather than to
    the wind: standing still in a harmattan you hear the wind, and driving
    through one you hear the paint being taken off.
  */
  const gritSource = ctx.createBufferSource()
  gritSource.buffer = noise
  gritSource.loop = true
  const gritBody = ctx.createBiquadFilter()
  gritBody.type = 'highpass'
  gritBody.frequency.value = 3400
  gritBody.Q.value = 0.5
  const gritGain = ctx.createGain()
  gritGain.gain.value = 0.0001
  gritSource.connect(gritBody)
  gritBody.connect(gritGain)
  gritGain.connect(shelter)

  // --- the surface ---------------------------------------------------------
  /*
    Sand under the tyres: a soft, wide roar with no edge on it.
  */
  const sandSource = ctx.createBufferSource()
  sandSource.buffer = noise
  sandSource.loop = true
  const sandBody = ctx.createBiquadFilter()
  sandBody.type = 'bandpass'
  sandBody.frequency.value = 620
  sandBody.Q.value = 0.35
  const sandGain = ctx.createGain()
  sandGain.gain.value = 0.0001
  sandSource.connect(sandBody)
  sandBody.connect(sandGain)
  sandGain.connect(shelter)

  /*
    And the corrugation, which is the one voice on this road with a *pitch*.

    A washboard is periodic — ripples a fixed distance apart — so the frequency
    a wheel crosses them at is speed over spacing, and that is a note that
    climbs as you accelerate. It is modelled here as a resonant filter on noise
    rather than as a tone, because the real thing is a rattle with a pitch in it
    and not a hum: a hum would sound like a fault in the car.

    This is the only part of any road's soundscape that is driven by the tyre
    model rather than by position — `rumble` is written every step by
    `physics.ts`. Which means it goes quiet when you slow down for a corner,
    exactly as the real thing does, without anybody arranging for that.
  */
  const rumbleSource = ctx.createBufferSource()
  rumbleSource.buffer = noise
  rumbleSource.loop = true
  const rumbleBody = ctx.createBiquadFilter()
  rumbleBody.type = 'bandpass'
  rumbleBody.frequency.value = 60
  rumbleBody.Q.value = 3.2
  const rumbleGain = ctx.createGain()
  rumbleGain.gain.value = 0.0001
  rumbleSource.connect(rumbleBody)
  rumbleBody.connect(rumbleGain)
  rumbleGain.connect(shelter)

  for (const source of [windSource, weightSource, gritSource, sandSource, rumbleSource]) {
    source.start()
  }

  let alive = true
  let faded = false

  const ease = (param: AudioParam, to: number, over: number) => {
    const value = Number.isFinite(to) ? to : 0
    param.setTargetAtTime(Math.max(0.00001, value), ctx.currentTime, over)
  }

  return {
    set(state) {
      if (!alive) return
      const now = ctx.currentTime

      if (state.paused) {
        if (!faded) {
          faded = true
          out.gain.setTargetAtTime(0.0001, now, 0.16)
        }
        return
      }
      if (faded) faded = false
      out.gain.setTargetAtTime(0.85, now, 0.22)

      const fast = clamp(state.speed / 34)
      const sheltered = clamp(state.town)
      const open = 1 - sheltered

      /*
        The wind's level and its colour.

        Exposure decides how much, the mounds and the scarp decide what kind.
        The scarp is the loudest place on the road and it is also the highest:
        wind over a cliff edge is a sharper sound than wind over a plain, and
        the two together are what make the last kilometre feel like the end of
        something rather than more of the same.
      */
      const blowing = clamp(state.exposed) * open
      ease(windGain.gain, 0.055 + blowing * 0.4, 0.5)
      ease(weightGain.gain, blowing * 0.3, 0.7)

      const whistling = clamp(state.mounds)
      const edge = clamp(state.scarp)
      ease(windBody.frequency, 260 + whistling * 520 + edge * 300, 0.6)
      // Narrower between the mounds: a resonance is a whistle, and a spire is
      // a thing air whistles round.
      ease(windBody.Q, 0.45 + whistling * 3.4 + edge * 0.5, 0.6)
      ease(windTop.frequency, 2000 + blowing * 2400, 0.6)
      ease(weightBody.frequency, 150 + blowing * 90, 0.7)

      // Grit: what the wind is carrying, met at whatever speed you are doing.
      ease(gritGain.gain, blowing * (0.05 + fast * 0.2), 0.35)
      ease(gritBody.frequency, 2800 + fast * 2600, 0.4)

      // The ground.
      const under = clamp(state.sand)
      ease(sandGain.gain, under * (0.06 + fast * 0.34), 0.24)
      ease(sandBody.frequency, 480 + fast * 420, 0.3)

      /*
        The corrugation's note. Ripples about half a metre apart, so the wheel
        crosses them at roughly two per metre travelled — which lands the
        fundamental in the low tens of hertz at a crawl and around a hundred and
        forty flat out. Floored well above nothing so it never becomes a thump.
      */
      const shaking = clamp(state.rumble)
      ease(rumbleGain.gain, shaking * 0.42, 0.12)
      ease(rumbleBody.frequency, 34 + state.speed * 3.6, 0.1)
      ease(rumbleBody.Q, 2.4 + shaking * 3.4, 0.2)

      /*
        And the walls. Fast enough to be an event — driving through a gate is
        about a second — but not so fast that it clicks.
      */
      ease(shelter.frequency, 700 + open * 17_300, 0.5)

      harmattanSoundTelemetry.wind = blowing
      harmattanSoundTelemetry.grit = blowing * fast
      harmattanSoundTelemetry.surface = Math.max(under * fast, shaking)
      harmattanSoundTelemetry.town = sheltered
    },

    stop() {
      if (!alive) return
      alive = false
      const now = ctx.currentTime
      out.gain.setTargetAtTime(0.0001, now, 0.12)
      window.setTimeout(() => {
        for (const source of [windSource, weightSource, gritSource, sandSource, rumbleSource]) {
          try { source.stop() } catch { /* already stopped */ }
          source.disconnect()
        }
        out.disconnect()
        speakerCut.disconnect()
        safety.disconnect()
        shelter.disconnect()
        harmattanSoundTelemetry.rms = 0
        harmattanSoundTelemetry.peak = 0
        harmattanSoundTelemetry.wind = 0
        harmattanSoundTelemetry.grit = 0
        harmattanSoundTelemetry.surface = 0
        harmattanSoundTelemetry.town = 0
      }, 420)
    },
  }
}
