/**
 * The Moonbreak, as heard from the car.
 *
 * This is not another engine voice. The car already knows how it sounds; this
 * is everything that proves there is a world around it: exposed air over the
 * causeway, water below, wet growth close to the road, broken arches passing
 * overhead, and the pressure and resonant glass of the Drowned Mile.
 *
 * Every continuous layer is filtered noise from the garden's existing shared
 * buffer. There are no loops to download and no second AudioContext. More
 * importantly, every layer can be steered from the actual road state: speed,
 * depth, sector and the twenty-one-second creature pass outside the tube.
 */

import type { SynthesisBus } from './ambience'

export interface MoonbreakSoundState {
  /** Metres per second, inferred from the chase camera and smoothed. */
  speed: number
  /** 0 above the surface, 1 deep in the Drowned Mile. */
  depth: number
  /** Metres along the authored road. */
  s: number
  /** Wet branches close to the car in the drowned orchard. */
  orchard: number
  /** Reeds close to the road after resurfacing. */
  reeds: number
  /** Open, narrow stone with water fully exposed on both sides. */
  exposed: number
  /** The large shadow's nearest part of its twenty-one-second crossing. */
  creature: number
  paused: boolean
}

export interface MoonbreakVoice {
  set(state: MoonbreakSoundState): void
  /** A broken stone arch passing over the car. */
  arch(force: number): void
  stop(): void
}

/** Live diagnostic values for mix checks; never used to drive rendering. */
export const moonbreakSoundTelemetry = {
  rms: 0,
  peak: 0,
  depth: 0,
  creature: 0,
  arches: 0,
}
if (import.meta.env.DEV) {
  const host = globalThis as typeof globalThis & { __rallySound?: Record<string, unknown> }
  host.__rallySound ??= {}
  host.__rallySound.moonbreak = moonbreakSoundTelemetry
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

function smoothstep(from: number, to: number, value: number) {
  const at = clamp((value - from) / Math.max(0.0001, to - from))
  return at * at * (3 - 2 * at)
}

/** Short, dark reflections: glass and water, not the Rootway's stone tail. */
function tubeImpulse(ctx: AudioContext) {
  const seconds = 1.15
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let low = 0
    for (let i = 0; i < length; i++) {
      const life = 1 - i / length
      low = low * 0.76 + (Math.random() * 2 - 1) * 0.24
      data[i] = low * Math.pow(life, 4.2) * 0.32
    }
    for (const [at, level] of [[0.014, 0.72], [0.029, -0.46], [0.061, 0.28]] as const) {
      const i = Math.floor(at * ctx.sampleRate * (channel ? 1.09 : 1))
      if (i < length) data[i] += level
    }
  }
  return buffer
}

export function createMoonbreakVoice(bus: SynthesisBus): MoonbreakVoice {
  const { context: ctx, output, noise, noiseSeconds } = bus
  const born = ctx.currentTime

  /* One safe envelope for the whole place. Environment may be large without
     ever summing a plunge, an arch and the engine into a laptop-speaker crack. */
  const out = ctx.createGain()
  out.gain.value = 0.0001
  const speakerCut = ctx.createBiquadFilter()
  speakerCut.type = 'highpass'
  speakerCut.frequency.value = 34
  speakerCut.Q.value = 0.6
  const safety = ctx.createDynamicsCompressor()
  safety.threshold.value = -11
  safety.knee.value = 16
  safety.ratio.value = 2.8
  safety.attack.value = 0.006
  safety.release.value = 0.22
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.45
  const meterSamples = new Float32Array(analyser.fftSize)
  let meterFrame = 0
  out.connect(speakerCut).connect(safety).connect(analyser).connect(output)

  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(out)

  const verb = ctx.createConvolver()
  verb.buffer = tubeImpulse(ctx)
  const verbSend = ctx.createGain()
  verbSend.gain.value = 0.0001
  const verbReturn = ctx.createGain()
  verbReturn.gain.value = 0.74
  verbSend.connect(verb).connect(verbReturn).connect(out)

  function loop(rate: number) {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.loop = true
    source.playbackRate.value = rate
    source.start()
    return source
  }

  // Air laid horizontally across the causeway. It opens as the road narrows.
  const windSource = loop(1.18)
  const windHigh = ctx.createBiquadFilter()
  windHigh.type = 'highpass'
  windHigh.frequency.value = 430
  const windLow = ctx.createBiquadFilter()
  windLow.type = 'lowpass'
  windLow.frequency.value = 4800
  const windGain = ctx.createGain()
  windGain.gain.value = 0.0001
  const windPan = ctx.createStereoPanner()
  windSource.connect(windHigh).connect(windLow).connect(windGain).connect(windPan).connect(dry)

  // The body of water below the road. Broad and distant above; everywhere
  // around the glass once submerged.
  const waterSource = loop(0.42)
  const waterLow = ctx.createBiquadFilter()
  waterLow.type = 'lowpass'
  waterLow.frequency.value = 720
  waterLow.Q.value = 0.55
  const waterGain = ctx.createGain()
  waterGain.gain.value = 0.0001
  waterSource.connect(waterLow).connect(waterGain).connect(dry)

  // Fine spray and air tearing off the wet edges at speed.
  const spraySource = loop(1.82)
  const sprayBand = ctx.createBiquadFilter()
  sprayBand.type = 'bandpass'
  sprayBand.frequency.value = 2100
  sprayBand.Q.value = 0.52
  const sprayGain = ctx.createGain()
  sprayGain.gain.value = 0.0001
  spraySource.connect(sprayBand).connect(sprayGain).connect(dry)

  // Fast water moving along the outside of the tube. Kept separate from the
  // pressure floor so speed can rise without turning the whole mix louder.
  const flowSource = loop(0.67)
  const flowHigh = ctx.createBiquadFilter()
  flowHigh.type = 'highpass'
  flowHigh.frequency.value = 78
  const flowLow = ctx.createBiquadFilter()
  flowLow.type = 'lowpass'
  flowLow.frequency.value = 1250
  const flowGain = ctx.createGain()
  flowGain.gain.value = 0.0001
  flowSource.connect(flowHigh).connect(flowLow).connect(flowGain).connect(dry)

  const pressureSource = loop(0.19)
  const pressureLow = ctx.createBiquadFilter()
  pressureLow.type = 'lowpass'
  pressureLow.frequency.value = 118
  pressureLow.Q.value = 0.9
  const pressureGain = ctx.createGain()
  pressureGain.gain.value = 0.0001
  pressureSource.connect(pressureLow).connect(pressureGain).connect(dry)

  // The tube does not hum constantly at one pitch. Noise finds a narrow glass
  // resonance and two very low structural modes move beneath it.
  const glassSource = loop(1.46)
  const glassBand = ctx.createBiquadFilter()
  glassBand.type = 'bandpass'
  glassBand.frequency.value = 1180
  glassBand.Q.value = 8.5
  const glassGain = ctx.createGain()
  glassGain.gain.value = 0.0001
  glassSource.connect(glassBand).connect(glassGain).connect(verbSend)

  const tubeA = ctx.createOscillator()
  tubeA.type = 'sine'
  tubeA.frequency.value = 46
  const tubeB = ctx.createOscillator()
  tubeB.type = 'triangle'
  tubeB.frequency.value = 73
  const tubeGain = ctx.createGain()
  tubeGain.gain.value = 0.0001
  tubeA.connect(tubeGain)
  tubeB.connect(tubeGain)
  tubeGain.connect(verbSend)
  tubeA.start()
  tubeB.start()

  // Leaves and reeds share a voice but not a colour. The filter moves lower
  // and rougher in the orchard, higher and papery beside the reeds.
  const growthSource = loop(1.31)
  const growthBand = ctx.createBiquadFilter()
  growthBand.type = 'bandpass'
  growthBand.frequency.value = 1450
  growthBand.Q.value = 0.75
  const growthGain = ctx.createGain()
  growthGain.gain.value = 0.0001
  growthSource.connect(growthBand).connect(growthGain).connect(dry)

  // Not a monster call: pressure in the water and a sympathetic shiver in the
  // glass while the large shadow crosses above the tube.
  const creatureTone = ctx.createOscillator()
  creatureTone.type = 'sine'
  creatureTone.frequency.value = 37
  const creatureGain = ctx.createGain()
  creatureGain.gain.value = 0.0001
  creatureTone.connect(creatureGain).connect(verbSend)
  creatureTone.start()

  let stopped = false
  let lastDepth = 0
  let lastS = 0
  let lastRib = -1
  let waterDue = born + 1.2
  let creakDue = born + 2.4

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
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
    source.connect(filter).connect(gain).connect(into)
    source.start(when, Math.random() * Math.max(0.1, noiseSeconds - 0.5), length + 0.05)
    source.stop(when + length + 0.06)
  }

  function pitchDrop(when: number, from: number, to: number, peak: number, length: number) {
    const voice = ctx.createOscillator()
    voice.type = 'sine'
    voice.frequency.setValueAtTime(from, when)
    voice.frequency.exponentialRampToValueAtTime(to, when + length)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
    voice.connect(gain).connect(verbSend)
    voice.start(when)
    voice.stop(when + length + 0.04)
  }

  out.gain.setTargetAtTime(1.1, born, 0.3)

  return {
    set(state) {
      if (stopped) return
      const now = ctx.currentTime
      const depth = clamp(state.depth)
      const surface = 1 - depth
      const speed = clamp(state.speed, 0, 46)
      const fast = smoothstep(3, 40, speed)
      const paused = state.paused ? 0.16 : 1
      const moving = smoothstep(1.5, 13, speed)

      out.gain.setTargetAtTime(1.1 * paused, now, state.paused ? 0.08 : 0.28)

      const open = surface * (0.46 + clamp(state.exposed) * 0.54)
      windHigh.frequency.setTargetAtTime(360 + fast * 820, now, 0.16)
      windLow.frequency.setTargetAtTime(3300 + fast * 2700, now, 0.2)
      windGain.gain.setTargetAtTime(open * moving * (0.18 + fast * 0.35), now, 0.13)
      windPan.pan.setTargetAtTime(Math.sin(now * 0.43) * (0.25 + state.exposed * 0.5), now, 0.35)

      waterLow.frequency.setTargetAtTime(520 + fast * 520 + depth * 260, now, 0.3)
      waterGain.gain.setTargetAtTime(
        surface * (0.22 + fast * 0.22) + depth * (0.1 + fast * 0.09),
        now,
        0.2,
      )

      sprayBand.frequency.setTargetAtTime(1700 + fast * 2300, now, 0.18)
      sprayGain.gain.setTargetAtTime(surface * moving * (0.12 + fast * 0.18 + state.exposed * 0.12), now, 0.11)

      flowLow.frequency.setTargetAtTime(680 + fast * 1250, now, 0.2)
      flowGain.gain.setTargetAtTime(depth * moving * (0.13 + fast * 0.24), now, 0.14)
      pressureLow.frequency.setTargetAtTime(82 + depth * 72 + fast * 25, now, 0.35)
      pressureGain.gain.setTargetAtTime(depth * (0.09 + fast * 0.11), now, 0.24)

      glassBand.frequency.setTargetAtTime(820 + fast * 1350 + state.creature * 160, now, 0.22)
      glassGain.gain.setTargetAtTime(depth * (0.02 + fast * 0.065 + state.creature * 0.062), now, 0.16)
      tubeA.frequency.setTargetAtTime(44 + fast * 11, now, 0.4)
      tubeB.frequency.setTargetAtTime(71 + fast * 17, now, 0.4)
      tubeGain.gain.setTargetAtTime(depth * (0.006 + fast * 0.012 + state.creature * 0.022), now, 0.28)
      verbSend.gain.setTargetAtTime(0.13 + depth * 0.5, now, 0.36)

      const growth = clamp(state.orchard + state.reeds)
      growthBand.frequency.setTargetAtTime(1150 + state.reeds * 1700 + fast * 620, now, 0.18)
      growthGain.gain.setTargetAtTime(surface * growth * moving * (0.12 + fast * 0.2), now, 0.1)

      creatureTone.frequency.setTargetAtTime(34 + fast * 8, now, 0.4)
      creatureGain.gain.setTargetAtTime(depth * clamp(state.creature) * 0.095, now, 0.22)

      moonbreakSoundTelemetry.depth = depth
      moonbreakSoundTelemetry.creature = clamp(state.creature)
      if (++meterFrame % 6 === 0) {
        analyser.getFloatTimeDomainData(meterSamples)
        let energy = 0
        let peak = 0
        for (let i = 0; i < meterSamples.length; i++) {
          const sample = meterSamples[i]
          energy += sample * sample
          peak = Math.max(peak, Math.abs(sample))
        }
        moonbreakSoundTelemetry.rms = Math.sqrt(energy / meterSamples.length)
        moonbreakSoundTelemetry.peak = peak
      }

      // Water remains a place above the surface too. Irregular low slaps below
      // the causeway stop the broad bed becoming anonymous wind noise.
      if (!state.paused && surface > 0.72 && moving > 0.2 && now >= waterDue) {
        burst(now, 0.038 + fast * 0.035, 0.32, 'lowpass', 330 + fast * 170, 0.72, 0.46)
        burst(now + 0.018, 0.018 + fast * 0.022, 0.18, 'bandpass', 880, 0.8, 0.9)
        waterDue = now + 1.25 + Math.random() * 1.7
      }

      // The tube is under pressure, not acoustically inert. These sparse glass
      // complaints are separated by seconds and move in pitch, so they read as
      // structure taking load rather than a repeating spooky sound effect.
      if (!state.paused && depth > 0.62 && moving > 0.15 && now >= creakDue) {
        burst(now, 0.026 + fast * 0.028, 0.42, 'bandpass', 540 + Math.random() * 620, 5.8, 0.82, verbSend)
        pitchDrop(now + 0.025, 520 + Math.random() * 260, 145 + Math.random() * 70, 0.035 + fast * 0.025, 0.62)
        creakDue = now + 2.6 + Math.random() * 4.2
      }

      const forward = state.s >= lastS
      // The plunge is one event with three scales: water hitting the body, a
      // sheet of spray passing the ear, and pressure arriving underneath it.
      if (forward && lastDepth < 0.09 && depth >= 0.09) {
        const force = 0.65 + fast * 0.35
        burst(now, 0.2 * force, 0.72, 'lowpass', 430, 0.7, 0.48)
        burst(now + 0.015, 0.15 * force, 0.92, 'highpass', 1050, 0.5, 1.65)
        pitchDrop(now, 112, 43, 0.13 * force, 0.78)
      }
      if (forward && lastDepth < 0.72 && depth >= 0.72) {
        burst(now, 0.075 + fast * 0.055, 0.55, 'bandpass', 720, 2.8, 0.8, verbSend)
        pitchDrop(now, 76, 48, 0.075, 0.62)
      }
      if (forward && lastDepth > 0.12 && depth <= 0.12 && state.s > 1700) {
        burst(now, 0.18 + fast * 0.07, 0.82, 'highpass', 820, 0.45, 1.8)
        burst(now + 0.025, 0.12, 0.48, 'bandpass', 680, 0.8, 0.72)
        pitchDrop(now, 54, 126, 0.085, 0.68)
      }

      // Tube ribs are audible markers of speed. One restrained glass/stone
      // knock every eighteen metres; skipped ribs never queue into a machinegun
      // after a camera cut or a backgrounded frame.
      const rib = Math.floor(state.s / 18)
      if (forward && depth > 0.38 && speed > 7 && rib !== lastRib) {
        lastRib = rib
        burst(now, 0.032 + fast * 0.045, 0.065, 'bandpass', 780 + fast * 760, 4.5, 1.25, verbSend)
        burst(now, 0.022 + fast * 0.028, 0.08, 'lowpass', 230, 0.85, 0.5)
      } else if (depth <= 0.38) {
        lastRib = rib
      }

      // A restart is a reset, not a violent resurfacing event.
      if (!forward && lastS - state.s > 50) {
        lastDepth = depth
        lastRib = rib
      } else {
        lastDepth = depth
      }
      lastS = state.s
    },

    arch(force) {
      if (stopped) return
      moonbreakSoundTelemetry.arches++
      const now = ctx.currentTime
      const amount = clamp(force)
      // Air is compressed under the rib first; stone answers a fraction later
      // and the glass/water tail puts its size behind the car.
      burst(now, 0.075 + amount * 0.095, 0.22, 'bandpass', 520 + amount * 540, 0.7, 0.92)
      burst(now + 0.035, 0.05 + amount * 0.08, 0.15, 'lowpass', 260, 1.1, 0.55)
      burst(now + 0.02, 0.035 + amount * 0.052, 0.44, 'highpass', 1500, 0.55, 1.9, verbSend)
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
          windSource,
          waterSource,
          spraySource,
          flowSource,
          pressureSource,
          glassSource,
          growthSource,
          tubeA,
          tubeB,
          creatureTone,
        ]) {
          try {
            node.stop()
          } catch {
            /* already stopped */
          }
        }
        out.disconnect()
        verbReturn.disconnect()
        moonbreakSoundTelemetry.rms = 0
        moonbreakSoundTelemetry.peak = 0
      }, 850)
    },
  }
}
