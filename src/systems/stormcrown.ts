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
  /** One visible stroke. The voice groups close repeats into one thunder body. */
  lightning(force: number, remoteness: number, below: boolean): void
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
}
if (import.meta.env.DEV) {
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

  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(out)

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
  function rainImpact(when: number, amount: number, fast: number) {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.playbackRate.value = 1.55 + Math.random() * 1.5
    const high = ctx.createBiquadFilter()
    high.type = 'highpass'
    high.frequency.value = 1450 + Math.random() * 2200 + fast * 900
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(0.018 + amount * 0.036, when + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.035 + Math.random() * 0.025)
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.6 - 0.8
    source.connect(high).connect(gain).connect(pan).connect(dry)
    source.start(when, Math.random() * Math.max(0.1, noiseSeconds - 0.15), 0.09)
    source.stop(when + 0.1)
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

    lightning(force, remoteness, below) {
      if (stopped) return
      const now = ctx.currentTime
      const amount = clamp(force)
      const far = clamp(remoteness)
      stormcrownSoundTelemetry.lightning++

      // Every visible stroke gets a tiny electrical tear. Repeated strokes in
      // one channel do not each get a full thunder body.
      if (now - lastElectric > 0.045) {
        lastElectric = now
        burst(now, 0.052 + amount * 0.085, 0.07, 'highpass', 1850 + amount * 1600, 0.48, 1.85)
        if (far < 0.2) burst(now, 0.035 + amount * 0.045, 0.1, 'bandpass', 620, 3.4, 1.1)
      }
      if (now - lastThunder < 0.72) return
      lastThunder = now

      const delay = 0.14 + far * 1.05
      const at = now + delay
      const body = (0.19 + amount * 0.19) * (1 - far * 0.28)
      // The first body is physical and near. The parallel mountain send is the
      // weather coming back from slopes after the direct sound has landed.
      burst(at, body * 0.78, 1.15 + far * 0.5, 'lowpass', 205 - far * 65, 0.7, 0.29)
      burst(at, body, 1.65 + far * 0.9, 'lowpass', 230 - far * 80, 0.72, 0.31, mountainSend)
      burst(at + 0.035, body * 0.62, 0.72, 'bandpass', 105 + (below ? 24 : 0), 1.35, 0.22, mountainSend)
      fallingTone(at, below ? 91 : 78, 34, body * 0.3, 1.25 + far * 0.5, dry)
      fallingTone(at, below ? 91 : 78, 34, body * 0.58, 1.4 + far * 0.5, mountainSend)
      // A slope answers later. It is deliberately not a copy of the first hit.
      burst(at + 0.42 + far * 0.36, body * 0.48, 1.45, 'lowpass', 135, 0.8, 0.18, mountainSend)
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
