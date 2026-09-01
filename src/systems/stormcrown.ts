/**
 * The Stormcrown, as heard from the car.
 *
 * The mountain has one trick no other road can use: it changes which side of
 * the weather the driver is on. Rainwood is close and wet, the climb disappears
 * inside cloud, the crown opens into thin clear air above the storm, and the
 * descent drives back into all of it. This voice follows that vertical story;
 * it is not a rain loop laid over the engine.
 */

import type { SynthesisBus } from './ambience'

export interface StormcrownSoundState {
  speed: number
  s: number
  /**
   * How hard it is raining, 0..1 — the same number the drops are drawn from.
   *
   * Not worked out again here, on purpose. The ear used to hold its own
   * opinion (`0.92 + cloud × 0.24 …`) while the drops held none at all, so
   * the rain you heard and the rain you saw were two different weathers. See
   * the note on `rain` in `ember-rally/weather.ts`.
   */
  rain: number
  inCloud: number
  above: number
  forest: number
  exposed: number
  stair: number
  eye: number
  stormfall: number
  waterfall: number
  waterfallPan: number
  paused: boolean
}

export interface StormcrownVoice {
  set(state: StormcrownSoundState): void
  /**
   * One visible stroke. The voice groups close repeats into one thunder body.
   *
   * Returns **when the sound will arrive** — seconds from now, and how close it
   * was, 0..1 — or null when this stroke was folded into one already rolling.
   * The flash and the bang are separated by as much as eight seconds here, so
   * anything that wants to react to the *thunder* rather than to the lightning
   * cannot use the moment of the call. See `storm.thunder` in `weather.ts`.
   */
  lightning(force: number, remoteness: number, below: boolean): { in: number; near: number } | null
  /** The old metal landmark passing the car. */
  rod(force: number, charged: number): void
  stop(): void
}

/** Live diagnostic values for `/dev7731` work and automated browser checks. */
export const stormcrownSoundTelemetry = {
  rms: 0,
  peak: 0,
  rain: 0,
  wind: 0,
  waterfall: 0,
  lightning: 0,
  /** Metres to the last stroke, and its flash-to-bang gap in seconds. */
  distance: 0,
  gap: 0,
}
/* Optional, so `npm run sound` can import this file into Node, where Vite's
   `import.meta.env` does not exist. Same reason as `rootway.ts`. */
if (import.meta.env?.DEV) {
  const host = globalThis as typeof globalThis & { __rallySound?: Record<string, unknown> }
  host.__rallySound ??= {}
  host.__rallySound.stormcrown = stormcrownSoundTelemetry
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

function smoothstep(from: number, to: number, value: number) {
  const at = clamp((value - from) / Math.max(0.0001, to - from))
  return at * at * (3 - 2 * at)
}

/** A long, irregular mountain return without a bright tiled-room tail. */
function mountainImpulse(ctx: AudioContext) {
  const seconds = 2.75
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let low = 0
    for (let i = 0; i < length; i++) {
      const life = 1 - i / length
      low = low * 0.91 + (Math.random() * 2 - 1) * 0.09
      const broken = 0.62 + Math.sin(i * (channel ? 0.00131 : 0.00117)) * 0.2
      data[i] = low * Math.pow(life, 2.7) * broken * 0.26
    }
    // Three unequal slope returns. Their asymmetry is what makes this outdoors.
    for (const [at, level] of [[0.13, 0.34], [0.31, -0.22], [0.68, 0.14]] as const) {
      const index = Math.floor(at * ctx.sampleRate * (channel ? 1.13 : 1))
      if (index < length) data[index] += level
    }
  }
  return buffer
}

export function createStormcrownVoice(bus: SynthesisBus): StormcrownVoice {
  const { context: ctx, output, noise, noiseSeconds } = bus
  const born = ctx.currentTime

  const out = ctx.createGain()
  out.gain.value = 0.0001
  const speakerCut = ctx.createBiquadFilter()
  speakerCut.type = 'highpass'
  speakerCut.frequency.value = 33
  speakerCut.Q.value = 0.65
  const safety = ctx.createDynamicsCompressor()
  safety.threshold.value = -11
  safety.knee.value = 16
  safety.ratio.value = 2.8
  safety.attack.value = 0.004
  safety.release.value = 0.3
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.45
  const meterSamples = new Float32Array(analyser.fftSize)
  let meterFrame = 0
  out.connect(speakerCut).connect(safety).connect(analyser).connect(output)

  /*
    Two buses, and the split exists for one reason: **the thunder has to be
    able to duck everything that is not the thunder.**

    A real close strike does not sit politely on top of the rain — it takes the
    whole soundstage for about a fifth of a second, and everything else comes
    back underneath it. Mixed flat, the crack has to be made *loud* to be heard
    over the weather, which is how you get a sound effect that hurts on
    headphones and still does not feel powerful. Ducked, it can be no louder
    than before and land twice as hard, because the ear reads the hole around it.

    `weather` is everything continuous — rain, wind, cedars, cloud, the falls —
    plus the small events that belong to the road. `strike` is the thunder's
    direct path and is never ducked. The mountain return is not ducked either:
    the slopes answering *is* the thunder.

    It only reaches this road's own layers. The car is a separate voice on the
    effects bus and reaching across to it from here would be a layering
    violation for a few tenths of a decibel — the rain and the wind dropping
    away is the part the ear actually reads.
  */
  const weather = ctx.createGain()
  weather.gain.value = 1
  weather.connect(out)

  const strike = ctx.createGain()
  strike.gain.value = 1
  strike.connect(out)

  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(weather)

  const mountain = ctx.createConvolver()
  mountain.buffer = mountainImpulse(ctx)
  const mountainSend = ctx.createGain()
  mountainSend.gain.value = 0.28
  const mountainReturn = ctx.createGain()
  mountainReturn.gain.value = 0.76
  mountainSend.connect(mountain).connect(mountainReturn).connect(out)

  function loop(rate: number) {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.loop = true
    source.playbackRate.value = rate
    source.start()
    return source
  }

  // Rain striking the car and the road immediately around it. Two bands stop
  // it becoming one sheet of laptop-speaker hiss.
  const rainSource = loop(1.16)
  const rainHigh = ctx.createBiquadFilter()
  rainHigh.type = 'highpass'
  rainHigh.frequency.value = 720
  const rainLow = ctx.createBiquadFilter()
  rainLow.type = 'lowpass'
  rainLow.frequency.value = 6200
  const rainGain = ctx.createGain()
  rainGain.gain.value = 0.0001
  rainSource.connect(rainHigh).connect(rainLow).connect(rainGain).connect(dry)

  const dropsSource = loop(1.93)
  const dropsBand = ctx.createBiquadFilter()
  dropsBand.type = 'bandpass'
  dropsBand.frequency.value = 3300
  dropsBand.Q.value = 0.72
  const dropsGain = ctx.createGain()
  dropsGain.gain.value = 0.0001
  dropsSource.connect(dropsBand).connect(dropsGain).connect(dry)

  // Crosswind has a broad body and a separate low buffet. The latter grows at
  // Gale Bend and the crown edge; it is movement across the car, not bass music.
  const windSource = loop(0.86)
  const windBand = ctx.createBiquadFilter()
  windBand.type = 'bandpass'
  windBand.frequency.value = 980
  windBand.Q.value = 0.42
  const windGain = ctx.createGain()
  windGain.gain.value = 0.0001
  const windPan = ctx.createStereoPanner()
  windSource.connect(windBand).connect(windGain).connect(windPan).connect(dry)

  const buffetSource = loop(0.24)
  const buffetLow = ctx.createBiquadFilter()
  buffetLow.type = 'lowpass'
  buffetLow.frequency.value = 150
  buffetLow.Q.value = 1.1
  const buffetGain = ctx.createGain()
  buffetGain.gain.value = 0.0001
  buffetSource.connect(buffetLow).connect(buffetGain).connect(dry)

  // Cedar boughs are close and coarse in Rainwood, then return only after the
  // descent has paid back the mountain's height.
  const cedarSource = loop(1.34)
  const cedarBand = ctx.createBiquadFilter()
  cedarBand.type = 'bandpass'
  cedarBand.frequency.value = 1250
  cedarBand.Q.value = 0.88
  const cedarGain = ctx.createGain()
  cedarGain.gain.value = 0.0001
  cedarSource.connect(cedarBand).connect(cedarGain).connect(dry)

  // Inside cloud, the world loses edges. A middle-heavy moving wash and a very
  // low pressure mode replace the far landscape without pretending it is a cave.
  const cloudSource = loop(0.52)
  const cloudLow = ctx.createBiquadFilter()
  cloudLow.type = 'lowpass'
  cloudLow.frequency.value = 780
  cloudLow.Q.value = 0.7
  const cloudGain = ctx.createGain()
  cloudGain.gain.value = 0.0001
  cloudSource.connect(cloudLow).connect(cloudGain).connect(dry)

  const cloudTone = ctx.createOscillator()
  cloudTone.type = 'sine'
  cloudTone.frequency.value = 51
  const cloudToneGain = ctx.createGain()
  cloudToneGain.gain.value = 0.0001
  cloudTone.connect(cloudToneGain).connect(mountainSend)
  cloudTone.start()

  // Above the storm: less sound, not no sound. Thin air hisses over the car and
  // the weather below remains as a very distant, slow floor.
  const highSource = loop(1.61)
  const highPass = ctx.createBiquadFilter()
  highPass.type = 'highpass'
  highPass.frequency.value = 1850
  const highLow = ctx.createBiquadFilter()
  highLow.type = 'lowpass'
  highLow.frequency.value = 4800
  const highGain = ctx.createGain()
  highGain.gain.value = 0.0001
  highSource.connect(highPass).connect(highLow).connect(highGain).connect(dry)

  const stormSource = loop(0.16)
  const stormLow = ctx.createBiquadFilter()
  stormLow.type = 'lowpass'
  stormLow.frequency.value = 92
  stormLow.Q.value = 0.85
  const stormGain = ctx.createGain()
  stormGain.gain.value = 0.0001
  stormSource.connect(stormLow).connect(stormGain).connect(mountainSend)

  // All three falls share one moving roar because only one is ever close. Pan
  // is authored from the actual side on which each ribbon was placed.
  const fallSource = loop(0.44)
  const fallLow = ctx.createBiquadFilter()
  fallLow.type = 'lowpass'
  fallLow.frequency.value = 1350
  const fallGain = ctx.createGain()
  fallGain.gain.value = 0.0001
  const fallPan = ctx.createStereoPanner()
  fallSource.connect(fallLow).connect(fallGain).connect(fallPan).connect(dry)

  const fallSpraySource = loop(1.42)
  const fallSprayHigh = ctx.createBiquadFilter()
  fallSprayHigh.type = 'highpass'
  fallSprayHigh.frequency.value = 1650
  const fallSprayGain = ctx.createGain()
  fallSprayGain.gain.value = 0.0001
  fallSpraySource.connect(fallSprayHigh).connect(fallSprayGain).connect(fallPan)

  let stopped = false
  let lastThunder = -10
  let lastElectric = -10
  let rainDue = born

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
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + Math.min(0.018, length * 0.12))
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
    source.connect(filter).connect(gain).connect(into)
    source.start(when, Math.random() * Math.max(0.1, noiseSeconds - 0.6), length + 0.06)
    source.stop(when + length + 0.08)
  }

  function fallingTone(when: number, from: number, to: number, peak: number, length: number, into: AudioNode) {
    const tone = ctx.createOscillator()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(from, when)
    tone.frequency.exponentialRampToValueAtTime(to, when + length)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
    tone.connect(gain).connect(into)
    tone.start(when)
    tone.stop(when + length + 0.05)
  }

  /** Individual drops hitting metal/glass keep the rain from becoming hiss. */
  /**
   * One drop, big or small.
   *
   * ---------------------------------------------------------------------------
   * **Drops have a size now, and that is the whole change.** Every drop used to
   * be the same drop: one high-passed tick at 1.45 kHz and up, 35–60 ms long.
   * Which is a fine drop — and eleven of them a second, all identical in
   * everything but pitch, is a *texture*, not weather. The ear stops hearing
   * individual water almost immediately and starts hearing a mechanism.
   *
   * Rain is not graded. A few of them are fat, and a fat one landing on a metal
   * panel is a different event: it has a low thock under the splash, it lasts
   * three times as long, and you notice it. That is what makes the small ones
   * read as small rather than as filler — one big drop every second or so gives
   * the ear a scale to measure the rest against.
   *
   * `size` is skewed hard toward small, because rain is.
   * ---------------------------------------------------------------------------
   */
  function rainImpact(when: number, amount: number, fast: number) {
    const roll = Math.random()
    const size = roll * roll * roll
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.6 - 0.8
    pan.connect(dry)

    // The splash. Brighter and shorter the smaller it is.
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.playbackRate.value = 1.55 + Math.random() * 1.5 - size * 0.55
    const high = ctx.createBiquadFilter()
    high.type = 'highpass'
    high.frequency.value = (1450 + Math.random() * 2200 + fast * 900) * (1 - size * 0.55)
    const gain = ctx.createGain()
    const life = 0.035 + Math.random() * 0.025 + size * 0.07
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime((0.018 + amount * 0.036) * (1 + size * 1.5), when + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + life)
    source.connect(high).connect(gain).connect(pan)
    source.start(when, Math.random() * Math.max(0.1, noiseSeconds - 0.2), life + 0.05)
    source.stop(when + life + 0.06)

    /*
      And the panel it landed on, for the big ones only.

      A short low ring rather than more noise: what you are hearing is the car's
      own bodywork answering, which has a pitch, and the pitch is what says
      *metal* instead of *more rain*.
    */
    if (size > 0.25) {
      const thock = ctx.createOscillator()
      thock.type = 'sine'
      const base = 150 + Math.random() * 130
      thock.frequency.setValueAtTime(base, when)
      thock.frequency.exponentialRampToValueAtTime(base * 0.55, when + 0.06)
      const body = ctx.createGain()
      body.gain.setValueAtTime(0.0001, when)
      body.gain.exponentialRampToValueAtTime(size * (0.02 + amount * 0.03), when + 0.003)
      body.gain.exponentialRampToValueAtTime(0.0001, when + 0.07)
      thock.connect(body).connect(pan)
      thock.start(when)
      thock.stop(when + 0.09)
    }
  }

  out.gain.setTargetAtTime(1.06, born, 0.32)

  return {
    set(state) {
      if (stopped) return
      const now = ctx.currentTime
      const speed = clamp(state.speed, 0, 46)
      const fast = smoothstep(3, 40, speed)
      const moving = smoothstep(1.5, 12, speed)
      const cloud = clamp(state.inCloud)
      const above = clamp(state.above)
      const eye = clamp(state.eye)
      const fall = clamp(state.stormfall)
      const exposed = clamp(state.exposed)
      const paused = state.paused ? 0.14 : 1

      out.gain.setTargetAtTime(1.06 * paused, now, state.paused ? 0.08 : 0.26)

      /*
        Straight from the world, plus a little for the places that catch it.

        The falls throw water about and the eye of the storm is the one hole in
        it, so those two still colour the sound — but the *body* of it is now
        the same number the drops are drawn from, which means rain arrives in
        the ear on the frame it arrives on screen, and is gone once you have
        climbed out of the top.
      */
      const rain = clamp(state.rain * (1 + fall * 0.22) * (1 - eye * 0.18))
      rainHigh.frequency.setTargetAtTime(650 + fast * 750 + cloud * 260, now, 0.2)
      rainLow.frequency.setTargetAtTime(4700 + fast * 2600, now, 0.24)
      rainGain.gain.setTargetAtTime(rain * (0.2 + moving * 0.2), now, 0.16)
      dropsBand.frequency.setTargetAtTime(2600 + fast * 2300, now, 0.18)
      dropsGain.gain.setTargetAtTime(rain * (0.075 + moving * 0.09 + fast * 0.075), now, 0.11)
      if (!state.paused && now >= rainDue) {
        rainImpact(now, clamp(rain), fast)
        // Faster travel meets more drops; never dense enough to become a buzz.
        rainDue = now + 0.075 + Math.random() * (0.075 - fast * 0.035)
      }

      const wind = moving * (0.35 + exposed * 0.65) * (0.78 + above * 0.28 + fall * 0.1)
      windBand.frequency.setTargetAtTime(620 + fast * 2100 + above * 420, now, 0.18)
      windGain.gain.setTargetAtTime(wind * (0.1 + fast * 0.2), now, 0.13)
      windPan.pan.setTargetAtTime(Math.sin(now * 0.37) * (0.28 + exposed * 0.62), now, 0.32)
      buffetLow.frequency.setTargetAtTime(92 + fast * 105, now, 0.24)
      const buffet = moving * exposed * (0.07 + fast * 0.15) * (1 - cloud * 0.25)
      buffetGain.gain.setTargetAtTime(buffet * (0.72 + Math.sin(now * 1.7) * 0.28), now, 0.12)

      cedarBand.frequency.setTargetAtTime(930 + fast * 1650, now, 0.18)
      cedarGain.gain.setTargetAtTime(clamp(state.forest) * (0.035 + moving * (0.06 + fast * 0.09)), now, 0.13)

      cloudLow.frequency.setTargetAtTime(560 + fast * 720, now, 0.24)
      cloudGain.gain.setTargetAtTime(cloud * (0.11 + fast * 0.14), now, 0.2)
      cloudTone.frequency.setTargetAtTime(47 + fast * 13 + state.stair * 4, now, 0.4)
      cloudToneGain.gain.setTargetAtTime(cloud * (0.009 + state.stair * 0.015), now, 0.3)

      highPass.frequency.setTargetAtTime(1550 + fast * 1850, now, 0.2)
      highGain.gain.setTargetAtTime(above * moving * (0.05 + fast * 0.095), now, 0.18)
      stormLow.frequency.setTargetAtTime(68 + cloud * 45 + (1 - above) * 16, now, 0.4)
      stormGain.gain.setTargetAtTime(0.055 + cloud * 0.065 + above * 0.028 + fall * 0.03, now, 0.38)

      const waterfall = clamp(state.waterfall)
      fallLow.frequency.setTargetAtTime(720 + waterfall * 920 + fast * 420, now, 0.2)
      fallGain.gain.setTargetAtTime(waterfall * (0.18 + fast * 0.19), now, 0.13)
      fallSprayGain.gain.setTargetAtTime(waterfall * (0.075 + moving * 0.1 + fast * 0.07), now, 0.11)
      fallPan.pan.setTargetAtTime(clamp(state.waterfallPan, -1, 1) * waterfall * 0.82, now, 0.16)

      mountainSend.gain.setTargetAtTime(
        0.23 + exposed * 0.22 + above * 0.14 + state.stair * 0.11 + fall * 0.08,
        now,
        0.45,
      )

      stormcrownSoundTelemetry.rain = rain
      stormcrownSoundTelemetry.wind = wind
      stormcrownSoundTelemetry.waterfall = waterfall
      if (++meterFrame % 6 === 0) {
        analyser.getFloatTimeDomainData(meterSamples)
        let energy = 0
        let peak = 0
        for (let i = 0; i < meterSamples.length; i++) {
          const sample = meterSamples[i]
          energy += sample * sample
          peak = Math.max(peak, Math.abs(sample))
        }
        stormcrownSoundTelemetry.rms = Math.sqrt(energy / meterSamples.length)
        stormcrownSoundTelemetry.peak = peak
      }
    },

    /*
      =========================================================================
      Thunder, from the distance up.

      The version this replaced was a thump: one low burst, a falling tone, and
      one late slope return, all inside about two and a half seconds, with a
      flash-to-bang gap that never exceeded 1.2 s. Four things were wrong with
      it and all four are the same mistake — it was written as a *sound effect*
      rather than as a distance.

      **1. The gap is the distance, and it was capped far too short.** Sound
      covers 343 m in a second and everybody on earth knows this sound: you
      count between the flash and the bang. Capping it at 1.2 s put every
      stroke inside four hundred metres, so a storm you were supposed to be
      climbing out of was permanently on top of you and the flash meant nothing.
      It is worked out from a real distance now, and the far end runs to eight
      seconds. That is a long time to wait, and waiting is the point.

      **2. Distance eats the top, and that is what a rumble *is*.** Air absorbs
      high frequencies with distance far faster than low ones. A strike two
      kilometres off has no crack in it at all — not a quiet crack, *none* —
      which is why distant thunder rumbles and near thunder tears. One
      exponential on the filter cutoff gives the whole family, and it means the
      close and far sounds are the same synthesiser rather than two presets.

      **3. There was no crack.** The old bright transient fired on the *flash*,
      which is to say at the speed of light, so it arrived with the light and
      not with the sound. A close strike now gets a stepped-leader crackle a few
      milliseconds ahead of the shock front, and then the front itself: a
      near-instant attack, gone in under a fifth of a second.

      **4. Thunder is not one event.** A channel is kilometres long and crooked,
      so different parts of it arrive at different times from different
      directions, and each bend sends a separate peal. That irregular sequence
      of swells is the difference between thunder and a drum. There are five to
      nine of them here, unevenly spaced, each with its own level, colour and
      side — and they are why this now lasts as long as it does.
      =========================================================================
    */
    lightning(force, remoteness, below) {
      if (stopped) return null
      const now = ctx.currentTime
      const amount = clamp(force)
      const far = clamp(remoteness)

      /*
        Where it actually was.

        Squared, so most strokes land in the near half of the range and the far
        end stretches — which matches both the shape of a storm and the fact
        that `remoteness` is mostly driven by how far above the cloud you have
        climbed. The top is a little under three kilometres rather than the ten
        a real storm can manage: eight seconds of waiting is already the far
        edge of what reads as connected to the flash you saw.
      */
      const metres = 140 + far * far * 2600
      const delay = metres / 343
      const at = now + delay

      /*
        Air absorption, as one number.

        Everything below is filtered by this, and the fall-off is what turns the
        same construction into a tear at a hundred metres and a rumble at two
        and a half kilometres. The floor stops the far end disappearing entirely
        into inaudible sub.
      */
      const air = Math.max(150, 9000 * Math.exp(-metres / 700))
      const near = clamp(1 - metres / 900)

      stormcrownSoundTelemetry.lightning++
      stormcrownSoundTelemetry.distance = metres
      stormcrownSoundTelemetry.gap = delay

      /*
        The stepped leader, which is the only part that is *not* delayed by much
        — it is the last few tens of metres of channel forming right beside you,
        so it is only heard when the strike is genuinely close. Sparse ticks,
        never a rhythm.
      */
      if (near > 0.55 && now - lastElectric > 0.045) {
        lastElectric = now
        const ticks = 2 + Math.floor(Math.random() * 4)
        for (let i = 0; i < ticks; i++) {
          const tick = at - 0.012 * (ticks - i) - Math.random() * 0.01
          if (tick <= now) continue
          burst(tick, near * (0.012 + Math.random() * 0.03), 0.012,
            'bandpass', 2600 + Math.random() * 4200, 1.1, 2.2, strike)
        }
      }

      if (now - lastThunder < 0.72) return null
      lastThunder = now

      const body = (0.2 + amount * 0.2) * (0.55 + near * 0.45)

      /*
        The shock front. Only close, and it is the fastest thing in the road:
        an attack measured in a millisecond or two and gone before the body
        underneath it has finished arriving.
      */
      if (near > 0.12) {
        const crack = near * near * (0.22 + amount * 0.2)
        burst(at, crack, 0.055, 'highpass', Math.min(air, 2200), 0.5, 2.4, strike)
        burst(at + 0.004, crack * 0.8, 0.16, 'bandpass', Math.min(air, 900), 0.8, 1.5, strike)
      }

      // The clap: the main body of it, straight at you.
      burst(at, body * 0.9, 0.42 + far * 0.5, 'lowpass', Math.min(air, 420), 0.7, 0.34, strike)
      burst(at + 0.02, body * 0.7, 0.9 + far * 0.7, 'lowpass', Math.min(air, 240), 0.72, 0.26, mountainSend)
      fallingTone(at, below ? 94 : 80, 32, body * 0.34, 1.1 + far * 0.7, strike)

      /*
        And then the peals.

        Unevenly spaced on purpose — `gap` grows as it goes so the roll spreads
        out rather than ticking, and every one of them gets its own level,
        colour and side. A distant strike gets more of them over a longer window
        because there is more crooked channel between you and it, which is the
        physical reason distant thunder rolls for longer than near thunder does.
      */
      const peals = 5 + Math.floor(Math.random() * 5)
      let when = at + 0.18 + Math.random() * 0.12
      for (let i = 0; i < peals; i++) {
        const life = i / peals
        // Loud early, but never monotonically: a roll that only decays is a
        // reverb tail, and the swells are the whole character of the thing.
        const level = body * (0.5 - life * 0.34) * (0.45 + Math.random())
        const colour = Math.min(air, 90 + Math.random() * 260 * (0.4 + near * 0.6))
        burst(when, Math.max(0.002, level), 0.35 + Math.random() * (0.6 + far * 1.1),
          'lowpass', colour, 0.65 + Math.random() * 0.5, 0.16 + Math.random() * 0.16,
          Math.random() < 0.45 ? strike : mountainSend)
        when += (0.12 + Math.random() * 0.4) * (1 + life * (1.4 + far * 2.2))
      }

      /*
        The duck.

        Only when it is close enough to be the loudest thing on the mountain.
        Down about three decibels as the front lands, then most of a second
        coming back — fast enough to be the crack making room for itself,
        slow enough that nobody hears a compressor.
      */
      if (near > 0.35) {
        const depth = 1 - 0.29 * near
        weather.gain.setTargetAtTime(depth, at, 0.05)
        weather.gain.setTargetAtTime(1, at + 0.22, 0.34)
      }

      // So anything outside this graph can meet the thunder when it lands
      // rather than when the sky lit up. See `storm.thunder`.
      return { in: delay, near }
    },

    rod(force, charged) {
      if (stopped) return
      const now = ctx.currentTime
      const amount = clamp(force)
      const charge = clamp(charged)
      // Air catches the thin pole, then a small metal note trails behind it.
      burst(now, 0.03 + amount * 0.045, 0.16, 'bandpass', 1250 + amount * 1100, 2.2, 1.35)
      const ring = ctx.createOscillator()
      ring.type = 'triangle'
      ring.frequency.setValueAtTime(510 + amount * 190 + charge * 170, now)
      ring.frequency.exponentialRampToValueAtTime(265 + charge * 90, now + 0.32)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.025 + amount * 0.03 + charge * 0.026, now + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36)
      ring.connect(gain).connect(mountainSend)
      ring.start(now)
      ring.stop(now + 0.4)
    },

    stop() {
      if (stopped) return
      stopped = true
      const now = ctx.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setTargetAtTime(0.0001, now, 0.16)
      mountainReturn.gain.setTargetAtTime(0.0001, now, 0.25)
      globalThis.setTimeout(() => {
        for (const node of [
          rainSource,
          dropsSource,
          windSource,
          buffetSource,
          cedarSource,
          cloudSource,
          cloudTone,
          highSource,
          stormSource,
          fallSource,
          fallSpraySource,
        ]) {
          try {
            node.stop()
          } catch {
            /* already stopped */
          }
        }
        out.disconnect()
        mountainReturn.disconnect()
        stormcrownSoundTelemetry.rms = 0
        stormcrownSoundTelemetry.peak = 0
      }, 950)
    },
  }
}
