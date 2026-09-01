/**
 * The car, as a sound.
 *
 * Synthesised, for the same reason everything else in the garden is: it
 * *steers*. A recorded loop cannot rise through a gear, cut on the shift, pop
 * on the overrun, light the rears up under boost, squeal at one end of the car
 * and not the other, or open out when the tunnel does — and those are most of
 * what tells you how fast you are going, because the race deliberately has no
 * speedometer anywhere on the screen.
 *
 * **It runs on the garden's one AudioContext**, handed in from `ambience`.
 * Browsers cap how many a page may have and a second one needs its own gesture
 * to unlock, so a racer that made its own would be silent on a phone with no
 * way to tell from the code that it would be.
 *
 * ---------------------------------------------------------------------------
 * **The layers, and what each one is for.**
 *
 *   engine     a finite-harmonic combustion wave through a soft clipper and a
 *              filter that opens with load, supported by filtered combustion
 *              texture and quiet mechanical detail
 *   exhaust    a separate low path, so the boom is not something the filter
 *              can take away from you at the top of a gear
 *   induction  a whine that rises with revs and load. The turbo
 *   road       broadband, riding speed. Changes character off the stone, so
 *              running wide is *audible* before it is visible
 *   wind       rises with the square of speed, and whistles where the rock
 *              closes in. This is the main speed cue above about 30 m/s
 *   scrub ×2   front and rear separately, because understeer and oversteer are
 *              different sounds and knowing which one you have is the game
 *   squeal     a narrow resonant peak riding the scrub. Stone, so it is a
 *              roar with a pitch in it rather than a track-day shriek
 *   brakes     a thin squeal under heavy braking at low speed
 *   reverb     a cave, made out of decaying noise. Everything above goes
 *              through it, and it is the single thing that makes the tunnel
 *              sound like a tunnel
 *
 * Events — shifts, blow-off, backfire, the handbrake's ratchet, a rev limiter
 * — are all derived from *edges in the state*, not from extra methods the
 * racer has to remember to call. There is one entry point per frame.
 * ---------------------------------------------------------------------------
 */

/** What the car is doing, as far as the ear is concerned. */
export interface EngineState {
  /** Metres per second. */
  speed: number
  /** 0..1 — engine speed, idle to the limiter. */
  revs: number
  /** Which ratio, 0-based. Only its *changes* are heard. */
  gear: number
  /** 0..1 — 1 while the torque is cut for a shift. */
  shifting: number
  /** 0..1 — how much of it is being asked for. */
  throttle: number
  /** 0..1 — the brake pedal. */
  brake: number
  /** The handbrake, which is the drift. */
  handbrake: boolean
  /** 0..1 — lateral scrub at each axle. Different sounds, deliberately. */
  scrubFront: number
  scrubRear: number
  /** 0..1 — rears turning faster than the road. */
  wheelspin: number
  /** 0..1 — wheels turning slower than the road. */
  lockup: number
  /** 0..1 — off the stone and into the loose. */
  rough: number
  /** 0..1 — wet stone. */
  wet: number
  /** 0..1 — how close the rock is. Whistles the wind. */
  tight: number
  boost: boolean
  /**
   * 1 the instant it lights, 0 as it dies. Not `boost` again in a dress.
   *
   * The whole reason the old nitro read as a switch is that a boolean is all
   * the ear was given, so the rush could only ever be on or off — the same
   * flat hiss for four and a half seconds and then nothing. A burn has a
   * *shape*: it hits, it swells, it pulls, and it sags before it lets go. None
   * of that can be synthesised from a bit.
   */
  boostLeft: number
}

/** Development-only mix reference for balancing the world against the car. */
export const engineSoundTelemetry = { rms: 0, peak: 0 }
if (import.meta.env?.DEV) {
  const host = globalThis as typeof globalThis & { __rallySound?: Record<string, unknown> }
  host.__rallySound ??= {}
  host.__rallySound.engine = engineSoundTelemetry
}

export interface EngineVoice {
  /** Called every frame. */
  set(state: EngineState): void
  /** Stone, or rock. 0..1. */
  hit(force: number): void
  /** Roots, leaves and old web brushing over the body. 0..1. */
  brush(force: number): void
  /** A drift let go of cleanly. Tier 1 or 2. */
  chirp(tier: number): void
  /**
   * The chase.
   *
   * 0 when she is nowhere near, 1 when she is alongside. A slow low pulse
   * fades up underneath everything — the only music in the race, and the only
   * thing anywhere in the game that says "she is right there" without words.
   */
  pressure(amount: number): void
  stop(): void
}

/**
 * Inline-four firing frequency: RPM / 30. The physics runs from 1100 to 7200
 * RPM, so these values are the actual engine rather than an unrelated musical
 * range laid over it.
 */
const IDLE_HZ = 1100 / 30
const LIMIT_HZ = 7200 / 30

/** A rounded combustion wave: strong low orders, no sawtooth's endless fizz. */
function combustionWave(ctx: BaseAudioContext, dark = false): PeriodicWave {
  const harmonics = dark
    ? [0, 1, 0.48, 0.24, 0.13, 0.08, 0.045, 0.025]
    : [0, 1, 0.62, 0.4, 0.29, 0.21, 0.15, 0.105, 0.074, 0.052, 0.036, 0.025]
  const real = new Float32Array(harmonics.length)
  const imag = new Float32Array(harmonics.length)
  for (let i = 1; i < harmonics.length; i++) {
    // Small deterministic phase offsets stop every partial peaking together.
    // That single shared peak is the brittle edge of a synthetic saw stack.
    const phase = Math.sin(i * 2.17) * 0.36
    real[i] = harmonics[i] * Math.sin(phase)
    imag[i] = harmonics[i] * Math.cos(phase)
  }
  return ctx.createPeriodicWave(real, imag)
}

function softClip(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(513)
  const norm = Math.tanh(drive)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * drive) / norm
  }
  return curve
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/**
 * A cave, as an impulse response.
 *
 * Decaying noise with a handful of discrete early reflections punched into it.
 * The reflections are what make it a *place* rather than a wash: a smooth
 * exponential decay is a reverb plug-in, and a few hard slaps at four to
 * forty milliseconds is a tunnel with walls at a stateable distance.
 */
function caveImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.floor(rate * seconds)
  const buffer = ctx.createBuffer(2, length, rate)

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    // The tail. Low-passed by integration, because stone eats the top end.
    let last = 0
    for (let i = 0; i < length; i++) {
      const t = i / length
      const white = Math.random() * 2 - 1
      last = last * 0.62 + white * 0.38
      data[i] = last * Math.pow(1 - t, decay)
    }
    // The walls. Slightly different per channel, which is the whole width of
    // the image — a tunnel where both ears hear the same slap is a pipe.
    const taps = [0.004, 0.009, 0.017, 0.026, 0.041, 0.063]
    for (let k = 0; k < taps.length; k++) {
      const at = Math.floor(taps[k] * rate * (channel === 0 ? 1 : 1.13))
      if (at < length) data[at] += (k % 2 === 0 ? 1 : -1) * (0.62 - k * 0.09)
    }
  }
  return buffer
}

export function createEngineVoice(
  ctx: AudioContext,
  master: GainNode,
  grain: AudioBuffer,
  grainSeconds: number,
  onStop: () => void,
): EngineVoice {
  const bornAt = ctx.currentTime

  // Keep the complete car inside a speaker-safe envelope. The previous voice
  // could sum phase-aligned oscillators, sub-bass and collision transients
  // directly into the master output.
  const out = ctx.createGain()
  out.gain.value = 0.0001
  const speakerCut = ctx.createBiquadFilter()
  speakerCut.type = 'highpass'
  speakerCut.frequency.value = 42
  speakerCut.Q.value = 0.7
  const safety = ctx.createDynamicsCompressor()
  safety.threshold.value = -13
  safety.knee.value = 16
  safety.ratio.value = 4
  safety.attack.value = 0.004
  safety.release.value = 0.16
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.45
  const meterSamples = new Float32Array(analyser.fftSize)
  let meterFrame = 0
  out.connect(speakerCut).connect(safety).connect(analyser).connect(master)

  /*
    The tunnel.

    A parallel send rather than everything in series, so the dry car stays
    present and close while the tail of it goes down the road ahead of you.
    Wound up as the rock closes in.
  */
  const verb = ctx.createConvolver()
  verb.buffer = caveImpulse(ctx, 1.7, 2.6)
  const verbSend = ctx.createGain()
  verbSend.gain.value = 0.26
  const verbReturn = ctx.createGain()
  verbReturn.gain.value = 0.9
  verbSend.connect(verb).connect(verbReturn).connect(speakerCut)

  /** Everything mechanical goes to both. */
  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(out)
  dry.connect(verbSend)

  // --- the engine ------------------------------------------------------------

  const clip = ctx.createWaveShaper()
  // A little bark under load. Kept well below the old saw-stack distortion,
  // but no longer so polished that the car sounds electrically perfect.
  clip.curve = softClip(1.7)
  clip.oversample = '2x'

  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 620
  tone.Q.value = 0.72

  const presence = ctx.createBiquadFilter()
  presence.type = 'bandpass'
  presence.frequency.value = 520
  presence.Q.value = 1.05
  const presenceGain = ctx.createGain()
  presenceGain.gain.value = 0.0001

  const engineGain = ctx.createGain()
  engineGain.gain.value = 0.0001

  // One phase-coherent combustion voice replaces the detuned saw/square
  // stack. Its finite harmonic series carries an inline-four's body without
  // the beating, fizzy edge of several primitive oscillators fighting.
  const combustion = ctx.createOscillator()
  combustion.setPeriodicWave(combustionWave(ctx))
  const combustionLevel = ctx.createGain()
  combustionLevel.gain.value = 0.82
  combustion.connect(combustionLevel).connect(tone).connect(clip).connect(engineGain)
  combustion.connect(presence).connect(presenceGain).connect(engineGain)

  // Valve-train detail is quiet at idle and arrives under load. It adds
  // mechanical urgency without becoming a separate, piercing note.
  const mechanical = ctx.createOscillator()
  mechanical.type = 'triangle'
  const mechanicalBand = ctx.createBiquadFilter()
  mechanicalBand.type = 'bandpass'
  mechanicalBand.frequency.value = 620
  mechanicalBand.Q.value = 0.8
  const mechanicalGain = ctx.createGain()
  mechanicalGain.gain.value = 0.0001
  mechanical.connect(mechanicalBand).connect(mechanicalGain).connect(engineGain)
  engineGain.connect(dry)

  // Filtered combustion texture stops the held tone from sounding perfectly
  // mathematical. Its gain is always positive: no phase inversion, no crack.
  const textureSource = ctx.createBufferSource()
  textureSource.buffer = grain
  textureSource.loop = true
  textureSource.playbackRate.value = 0.72
  const textureBand = ctx.createBiquadFilter()
  textureBand.type = 'bandpass'
  textureBand.frequency.value = 260
  textureBand.Q.value = 0.75
  const textureGain = ctx.createGain()
  textureGain.gain.value = 0.0001
  textureSource.connect(textureBand).connect(textureGain).connect(engineGain)

  // --- the exhaust -----------------------------------------------------------
  // A darker copy of the firing order gives weight without a subsonic octave.
  const exhaust = ctx.createOscillator()
  exhaust.setPeriodicWave(combustionWave(ctx, true))
  const exhaustShape = ctx.createBiquadFilter()
  exhaustShape.type = 'lowpass'
  exhaustShape.frequency.value = 230
  exhaustShape.Q.value = 0.8
  const exhaustGain = ctx.createGain()
  exhaustGain.gain.value = 0.0001
  exhaust.connect(exhaustShape).connect(exhaustGain).connect(dry)

  // --- induction -------------------------------------------------------------
  const intakeSource = ctx.createBufferSource()
  intakeSource.buffer = grain
  intakeSource.loop = true
  intakeSource.playbackRate.value = 1.1
  const intakeBand = ctx.createBiquadFilter()
  intakeBand.type = 'bandpass'
  intakeBand.frequency.value = 900
  intakeBand.Q.value = 0.65
  const intakeGain = ctx.createGain()
  intakeGain.gain.value = 0.0001
  intakeSource.connect(intakeBand).connect(intakeGain).connect(dry)

  /*
    ==========================================================================
    THE EMBER
    ==========================================================================

    **Three layers, because a rush on its own is an air conditioner.** That is
    the whole of what was wrong before: one wide band of filtered noise, held
    at one level for the length of the burn, with a thump at the front. It is a
    perfectly good *hiss*. It is not a shove, and the ear knows the difference
    immediately even when it cannot say why.

    What is actually being listened for, in order of how much each one carries:

      the sweep    a resonant peak climbing through the burn. This is the
                   layer that reads as *acceleration* rather than as noise,
                   and it was the missing one. Pitch going up is the only
                   thing in sound that means "faster" without argument
      the rush     the wide column of air. Loud, but it is scenery — on its
                   own it says "something is open", not "something is pushing"
      the sub      a low tone under all of it. Never heard as a note, felt as
                   pressure, and the reason the burn has weight on a phone
                   speaker that reproduces none of it

    All three are steered by `boostLeft` rather than by the boolean, so the
    burn rises, pulls, and audibly sags before it lets go — which also makes it
    the only place in the race that tells you the ember is nearly out without
    looking away from the road at the bar.
  */
  const boostSource = ctx.createBufferSource()
  boostSource.buffer = grain
  boostSource.loop = true
  boostSource.playbackRate.value = 1.85
  const boostHigh = ctx.createBiquadFilter()
  boostHigh.type = 'highpass'
  boostHigh.frequency.value = 620
  boostHigh.Q.value = 0.55
  const boostLow = ctx.createBiquadFilter()
  boostLow.type = 'lowpass'
  boostLow.frequency.value = 4300
  boostLow.Q.value = 0.72
  const boostGain = ctx.createGain()
  boostGain.gain.value = 0.0001
  boostSource.connect(boostHigh).connect(boostLow).connect(boostGain).connect(dry)

  /*
    The sweep: the same noise through a narrow resonant peak that climbs.

    Fed from the rush's own source rather than a second one, so the two are
    phase-coherent and read as one object being pushed harder — two
    independent noise loops read as two separate things happening at once,
    which is exactly the thin, doubled quality the old one had.
  */
  const boostPeak = ctx.createBiquadFilter()
  boostPeak.type = 'bandpass'
  boostPeak.frequency.value = 420
  boostPeak.Q.value = 3.4
  const boostPeakGain = ctx.createGain()
  boostPeakGain.gain.value = 0.0001
  boostHigh.connect(boostPeak).connect(boostPeakGain).connect(dry)

  /*
    The sub. A triangle, not a sine: a sine at 46 Hz is inaudible on anything
    without a woofer, and the triangle's third and fifth harmonics land where a
    phone speaker can still carry them, so the weight survives the trip.
  */
  const boostSub = ctx.createOscillator()
  boostSub.type = 'triangle'
  boostSub.frequency.value = 46
  const boostSubLow = ctx.createBiquadFilter()
  boostSubLow.type = 'lowpass'
  boostSubLow.frequency.value = 240
  boostSubLow.Q.value = 0.8
  const boostSubGain = ctx.createGain()
  boostSubGain.gain.value = 0.0001
  boostSub.connect(boostSubLow).connect(boostSubGain).connect(out)

  const turbo = ctx.createOscillator()
  turbo.type = 'sine'
  const turboBand = ctx.createBiquadFilter()
  turboBand.type = 'bandpass'
  turboBand.frequency.value = 2200
  turboBand.Q.value = 0.7
  const turboGain = ctx.createGain()
  turboGain.gain.value = 0.0001
  turbo.connect(turboBand).connect(turboGain).connect(dry)

  // --- the road --------------------------------------------------------------
  const roadSource = ctx.createBufferSource()
  roadSource.buffer = grain
  roadSource.loop = true
  const roadBand = ctx.createBiquadFilter()
  roadBand.type = 'bandpass'
  roadBand.frequency.value = 500
  roadBand.Q.value = 0.7
  const roadGain = ctx.createGain()
  roadGain.gain.value = 0.0001
  roadSource.connect(roadBand).connect(roadGain).connect(dry)

  /*
    --- the wind ------------------------------------------------------------

    Rises with the *square* of speed, which is both what air actually does and
    the reason this is the cue that reads at the top end: the engine note is
    already at the top of its gear and cannot get any more urgent, and the
    wind can. The whistle band on top of it is tied to how close the rock is,
    so threading a narrow section sounds like threading a narrow section.
  */
  const windSource = ctx.createBufferSource()
  windSource.buffer = grain
  windSource.loop = true
  windSource.playbackRate.value = 1.25
  const windShape = ctx.createBiquadFilter()
  windShape.type = 'highpass'
  windShape.frequency.value = 500
  windShape.Q.value = 0.5
  const whistle = ctx.createBiquadFilter()
  whistle.type = 'peaking'
  whistle.frequency.value = 2200
  whistle.Q.value = 3.4
  whistle.gain.value = 0
  const windGain = ctx.createGain()
  windGain.gain.value = 0.0001
  windSource.connect(windShape).connect(whistle).connect(windGain)
  // Wind is around you, not down the tunnel — it stays dry.
  windGain.connect(out)

  // --- the tyres -------------------------------------------------------------

  /** One axle's worth of scrub: a broad roar with a resonance riding it. */
  function scrubVoice(rate: number, centre: number) {
    const source = ctx.createBufferSource()
    source.buffer = grain
    source.loop = true
    source.playbackRate.value = rate

    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = centre
    band.Q.value = 1.2

    const cry = ctx.createBiquadFilter()
    cry.type = 'peaking'
    cry.frequency.value = centre * 1.6
    cry.Q.value = 11
    cry.gain.value = 0

    const gain = ctx.createGain()
    gain.gain.value = 0.0001

    source.connect(band).connect(cry).connect(gain).connect(dry)
    return { source, band, cry, gain }
  }

  const front = scrubVoice(1.5, 780)
  const rear = scrubVoice(1.75, 640)

  // --- the brakes ------------------------------------------------------------
  const brakeCry = ctx.createOscillator()
  brakeCry.type = 'triangle'
  brakeCry.frequency.value = 1750
  const brakeBand = ctx.createBiquadFilter()
  brakeBand.type = 'bandpass'
  brakeBand.frequency.value = 1750
  brakeBand.Q.value = 3.5
  const brakeGain = ctx.createGain()
  brakeGain.gain.value = 0.0001
  brakeCry.connect(brakeBand).connect(brakeGain).connect(dry)

  for (const node of [combustion, mechanical, exhaust, turbo, brakeCry]) {
    node.start()
  }
  textureSource.start()
  intakeSource.start()
  boostSource.start()
  boostSub.start()
  roadSource.start()
  windSource.start()
  front.source.start()
  rear.source.start()
  out.gain.setTargetAtTime(1, bornAt, 0.24)

  // --- state carried between frames -----------------------------------------
  let stopped = false
  let lastAt = ctx.currentTime
  let lastGear = 0
  let lastThrottle = 1
  let lastHandbrake = false
  let overrun = 0
  let gritDue = 0
  let popDue = 0
  let pulseDue = 0
  let pressureAmount = 0
  let limiter = 0
  let lastBoost = false

  /** A short shaped bite of noise. Everything percussive is one of these. */
  function noiseBurst(
    when: number,
    peak: number,
    length: number,
    type: BiquadFilterType,
    frequency: number,
    Q: number,
    rate: number,
    into: AudioNode = dry,
  ) {
    const source = ctx.createBufferSource()
    source.buffer = grain
    source.playbackRate.value = rate
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = Q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
    source.connect(filter).connect(gain).connect(into)
    source.start(when, Math.random() * (grainSeconds - 0.3), length + 0.05)
    source.stop(when + length + 0.06)
  }

  /**
   * A bang out of the exhaust.
   *
   * Two parts, and both are needed: a low thud that you feel, and a sharp
   * crack over it that carries. One alone is either a door closing or a twig
   * snapping.
   */
  function bang(now: number, size: number) {
    noiseBurst(now, 0.04 + size * 0.13, 0.05 + size * 0.06, 'lowpass', 190 + size * 170, 0.9, 0.4)
    noiseBurst(now, 0.018 + size * 0.07, 0.035, 'bandpass', 1300 + size * 1900, 1.2, 2.1)
  }

  // Starter motor, compression strokes, then the first clean catch. This is
  // deliberately a short one-shot scene rather than part of the looping idle.
  const starter = ctx.createOscillator()
  starter.type = 'triangle'
  const starterFilter = ctx.createBiquadFilter()
  starterFilter.type = 'bandpass'
  starterFilter.frequency.value = 240
  starterFilter.Q.value = 0.75
  const starterGain = ctx.createGain()
  starter.frequency.setValueAtTime(72, bornAt)
  starter.frequency.exponentialRampToValueAtTime(112, bornAt + 0.56)
  starterGain.gain.setValueAtTime(0.0001, bornAt)
  starterGain.gain.exponentialRampToValueAtTime(0.026, bornAt + 0.045)
  starterGain.gain.setValueAtTime(0.023, bornAt + 0.46)
  starterGain.gain.exponentialRampToValueAtTime(0.0001, bornAt + 0.63)
  starter.connect(starterFilter).connect(starterGain).connect(dry)
  starter.start(bornAt)
  starter.stop(bornAt + 0.66)
  noiseBurst(bornAt + 0.05, 0.018, 0.5, 'bandpass', 540, 0.8, 0.78)
  noiseBurst(bornAt + 0.49, 0.048, 0.11, 'lowpass', 210, 0.75, 0.52)

  return {
    set(state) {
      if (stopped) return
      const now = ctx.currentTime
      const dt = Math.min(0.1, Math.max(0, now - lastAt))
      lastAt = now

      if (++meterFrame % 6 === 0) {
        analyser.getFloatTimeDomainData(meterSamples)
        let energy = 0
        let peak = 0
        for (let i = 0; i < meterSamples.length; i++) {
          const sample = meterSamples[i]
          energy += sample * sample
          peak = Math.max(peak, Math.abs(sample))
        }
        engineSoundTelemetry.rms = Math.sqrt(energy / meterSamples.length)
        engineSoundTelemetry.peak = peak
      }

      const v = Math.max(0, state.speed)
      const revs = Math.max(0, Math.min(1.04, state.revs))
      const throttle = Math.max(0, Math.min(1, state.throttle))
      const cut = Math.max(0, Math.min(1, state.shifting))

      /*
        --- standing still ------------------------------------------------

        Idle should breathe, but it should never call attention to itself.
        Three very small, incommensurate wobbles keep it alive without making
        the pitch seasick. There is no sub-octave oscillator or bipolar gain
        modulation here: both were spending speaker travel below a laptop's
        useful range and were the source of the old crackling putter.
      */
      const idleness = (1 - Math.min(1, revs / 0.2)) * (1 - Math.min(1, throttle * 3))
      const hunt =
        Math.sin(now * 1.07) * 0.5 +
        Math.sin(now * 0.41 + 1.3) * 0.34 +
        Math.sin(now * 2.29 + 0.7) * 0.16

      // --- the note ----------------------------------------------------------
      const fundamental =
        (IDLE_HZ + (LIMIT_HZ - IDLE_HZ) * revs) *
        (1 + hunt * 0.012 * idleness) *
        (state.boost ? 1.04 : 1)

      /*
        The limiter.

        A real engine at its ceiling does not sit there smoothly — it bounces
        off the cut, several times a second. Without this the top of the last
        gear is a held note, which is the one place a synthesised engine
        always gives itself away.
      */
      limiter = revs > 0.985 ? 1 : Math.max(0, limiter - dt * 6)
      // A shallow, rounded torque cut communicates the limiter. Hard binary
      // gating was the abrasive buzz at maximum speed.
      const bounce = 1 - limiter * (0.1 + (Math.sin(now * 58) * 0.5 + 0.5) * 0.12)

      combustion.frequency.setTargetAtTime(fundamental, now, 0.028)
      mechanical.frequency.setTargetAtTime(fundamental * 2, now, 0.035)
      exhaust.frequency.setTargetAtTime(fundamental, now, 0.04)

      presence.frequency.setTargetAtTime(fundamental * 2.25 + 170, now, 0.06)
      presenceGain.gain.setTargetAtTime(0.035 + throttle * 0.2 + revs * 0.055, now, 0.08)

      mechanicalBand.frequency.setTargetAtTime(430 + revs * 1250, now, 0.08)
      mechanicalGain.gain.setTargetAtTime(0.006 + revs * 0.022 + throttle * 0.03, now, 0.08)

      textureBand.frequency.setTargetAtTime(180 + revs * 820 + throttle * 260, now, 0.07)
      textureGain.gain.setTargetAtTime(0.018 + throttle * 0.066 + revs * 0.02, now, 0.08)

      tone.frequency.setTargetAtTime(
        430 + revs * 1450 + throttle * 780 + (state.boost ? 380 : 0),
        now,
        0.065,
      )

      /*
        The shift is a *hole*, not a crossfade.

        `shifting` comes straight from the gearbox in the physics, so the note
        drops out for exactly as long as the torque does. It is the single
        clearest thing in the whole soundscape and it costs one multiply.
      */
      /*
        And the body of the note gets out of the way at idle.

        Quiet enough to sit beneath the cave, with just enough slow movement
        that it never becomes a test tone.
      */
      const wake = smoothstep(0.3, 0.86, now - bornAt)
      const body = 0.026 + revs * 0.018 + throttle * 0.056 + hunt * idleness * 0.0012
      const power = body * (1 - cut * 0.82) * bounce * wake
      engineGain.gain.setTargetAtTime(power, now, 0.025)

      exhaustShape.frequency.setTargetAtTime(180 + revs * 430 + throttle * 160, now, 0.08)
      exhaustGain.gain.setTargetAtTime(
        (0.007 + revs * 0.017 + throttle * 0.041 + (state.boost ? 0.016 : 0)) *
          (1 - cut * 0.86) * wake,
        now,
        0.055,
      )

      // --- induction ---------------------------------------------------------
      const spool = throttle * revs
      intakeBand.frequency.setTargetAtTime(620 + revs * 1800 + throttle * 720, now, 0.1)
      intakeGain.gain.setTargetAtTime(
        (0.001 + throttle * (0.014 + revs * 0.038)) * (1 - cut * 0.75) * wake,
        now,
        0.07,
      )
      turbo.frequency.setTargetAtTime(1050 + revs * 3100 + (state.boost ? 500 : 0), now, 0.14)
      turboBand.frequency.setTargetAtTime(1200 + revs * 2800, now, 0.15)
      turboGain.gain.setTargetAtTime(
        (spool * 0.012 + (state.boost ? 0.04 : 0)) * (1 - cut * 0.7) * wake,
        now,
        state.boost ? 0.055 : 0.12,
      )
      /*
        The shape of the burn, out of one number.

          climb   0 at the press, 1 by the time two thirds of it is gone.
                  Everything that rises rides this
          sag     1 for most of the burn, falling to 0 through the last
                  fifth. Everything that dies rides this

        Two curves rather than one, because the burn has to *keep pulling*
        while it is also running out — a single envelope makes it either fade
        the whole way (no shove) or cut off a cliff (no warning).
      */
      const left = Math.max(0, Math.min(1, state.boostLeft))
      const climb = state.boost ? smoothstep(1, 0.34, left) : 0
      const sag = smoothstep(0, 0.2, left)
      const burn = state.boost ? sag : 0

      boostHigh.frequency.setTargetAtTime(580 + revs * 620, now, 0.08)
      boostLow.frequency.setTargetAtTime(3300 + revs * 2200 + climb * 1400, now, 0.1)
      boostGain.gain.setTargetAtTime(
        burn * (0.086 + throttle * 0.032) * wake,
        now,
        // Slower in than the old 0.024: the rush is allowed a fifth of a
        // second to arrive *behind* the crack, which is what makes the crack
        // read as the front of something rather than as a separate click.
        state.boost ? 0.055 : 0.11,
      )

      // The layer that does the work. Climbs about two octaves through the
      // burn and keeps a little of the engine in it so the two stay one car.
      boostPeak.frequency.setTargetAtTime(430 + climb * 1180 + revs * 560, now, 0.09)
      boostPeak.Q.setTargetAtTime(3.4 + climb * 2.6, now, 0.2)
      boostPeakGain.gain.setTargetAtTime(burn * (0.05 + climb * 0.055) * wake, now, 0.07)

      // And the weight under it, rising a little as it goes so the pressure
      // builds rather than sitting there.
      boostSub.frequency.setTargetAtTime(44 + climb * 15 + revs * 9, now, 0.18)
      boostSubGain.gain.setTargetAtTime(burn * 0.058 * wake, now, state.boost ? 0.04 : 0.13)

      if (state.boost && !lastBoost) {
        /*
          The catch, in three parts that must land in this order.

          A press that arrives as one sound is a click. What makes it a *hit*
          is that the parts are staggered by a few milliseconds each and cover
          three registers: stone-hard on top, a body underneath, and a sweep
          climbing out of it that hands over to the sustained peak above.
        */
        // Top: the pressure crack. Short, bright, and the only genuinely
        // sharp thing in the whole car — everything else here is round.
        noiseBurst(now, 0.1, 0.055, 'highpass', 3100, 0.6, 2.9, out)
        // Body: the shove through the exhaust.
        noiseBurst(now + 0.008, 0.15, 0.26, 'bandpass', 700, 0.7, 0.78)
        // And the column of air opening out behind it.
        noiseBurst(now + 0.02, 0.075, 0.42, 'highpass', 1450, 0.5, 2.3, out)

        /*
          The sweep out of the hit.

          A bandpass climbing 300 → 2400 in a third of a second, which is the
          single most recognisable "boost" gesture there is and was the thing
          missing entirely. It hands over to `boostPeak` just as it fades, so
          the press and the burn are one continuous rise rather than an event
          followed by a texture.
        */
        const sweepSource = ctx.createBufferSource()
        sweepSource.buffer = grain
        sweepSource.playbackRate.value = 1.5
        const sweepBand = ctx.createBiquadFilter()
        sweepBand.type = 'bandpass'
        sweepBand.Q.value = 5.5
        sweepBand.frequency.setValueAtTime(300, now)
        sweepBand.frequency.exponentialRampToValueAtTime(2400, now + 0.34)
        const sweepGain = ctx.createGain()
        sweepGain.gain.setValueAtTime(0.0001, now)
        sweepGain.gain.exponentialRampToValueAtTime(0.11, now + 0.05)
        sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
        sweepSource.connect(sweepBand).connect(sweepGain).connect(dry)
        sweepSource.start(now, Math.random() * (grainSeconds - 0.5), 0.46)
        sweepSource.stop(now + 0.46)

        // Bottom: the thump you feel. Deeper and longer than it was, because
        // it is now holding the floor until the sub layer has faded up.
        const catchTone = ctx.createOscillator()
        catchTone.type = 'triangle'
        const catchGain = ctx.createGain()
        catchTone.frequency.setValueAtTime(148, now)
        catchTone.frequency.exponentialRampToValueAtTime(52, now + 0.22)
        catchGain.gain.setValueAtTime(0.0001, now)
        catchGain.gain.exponentialRampToValueAtTime(0.095, now + 0.01)
        catchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34)
        catchTone.connect(catchGain).connect(dry)
        catchTone.start(now)
        catchTone.stop(now + 0.36)
      } else if (!state.boost && lastBoost) {
        /*
          Letting go, which used to be one small tick.

          A blow-off is a *falling* hiss — the mirror of the sweep going in —
          and giving the burn a proper end is most of what makes it feel like
          it was a thing you spent rather than a thing that stopped.
        */
        const offSource = ctx.createBufferSource()
        offSource.buffer = grain
        offSource.playbackRate.value = 2.1
        const offBand = ctx.createBiquadFilter()
        offBand.type = 'bandpass'
        offBand.Q.value = 3.2
        offBand.frequency.setValueAtTime(2600, now)
        offBand.frequency.exponentialRampToValueAtTime(680, now + 0.3)
        const offGain = ctx.createGain()
        offGain.gain.setValueAtTime(0.0001, now)
        offGain.gain.exponentialRampToValueAtTime(0.07, now + 0.012)
        offGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34)
        offSource.connect(offBand).connect(offGain).connect(out)
        offSource.start(now, Math.random() * (grainSeconds - 0.5), 0.4)
        offSource.stop(now + 0.4)
        // And the flutter of the valve underneath it.
        noiseBurst(now + 0.02, 0.03, 0.14, 'lowpass', 320, 1.1, 0.5)
      }
      lastBoost = state.boost

      // --- road and wind -----------------------------------------------------
      const fast = Math.min(1.2, v / 44)
      roadBand.frequency.setTargetAtTime(240 + fast * 760 + state.rough * 420, now, 0.1)
      roadBand.Q.setTargetAtTime(state.rough > 0.5 ? 0.4 : 0.9, now, 0.2)
      roadGain.gain.setTargetAtTime(
        fast * fast * 0.055 + state.rough * fast * 0.075 + state.wet * fast * 0.025,
        now,
        0.1,
      )

      windShape.frequency.setTargetAtTime(420 + fast * 900, now, 0.15)
      whistle.frequency.setTargetAtTime(1700 + state.tight * 1900, now, 0.2)
      whistle.gain.setTargetAtTime(state.tight * 11 * fast, now, 0.25)
      windGain.gain.setTargetAtTime(fast * fast * 0.072, now, 0.12)

      // The tunnel closes around you as the rock does.
      verbSend.gain.setTargetAtTime(0.18 + state.tight * 0.3, now, 0.4)

      // --- the tyres ---------------------------------------------------------
      /*
        Front and rear are separate voices, and that is the point.

        Understeer and oversteer are the two mistakes in this game and they
        need to *sound* different, or the only way to know which one you have
        is to look at the car — by which time you have had it. The front is
        pitched higher and thinner; the rear is broader, lower and louder, and
        under the handbrake it takes over completely.
      */
      const spin = Math.max(state.wheelspin, state.handbrake ? 0.7 : 0)
      const rearScrub = Math.min(1.4, state.scrubRear + spin * 0.9)
      const frontScrub = Math.min(1.2, state.scrubFront + state.lockup * 0.7)
      // Loose stone roars, it does not squeal — a wet-day shriek off gravel is
      // the sound of a different game.
      const dry_ = 1 - state.rough * 0.75

      front.band.frequency.setTargetAtTime(700 + frontScrub * 640, now, 0.06)
      front.cry.frequency.setTargetAtTime(1250 + frontScrub * 700, now, 0.08)
      front.cry.gain.setTargetAtTime(frontScrub * 13 * dry_, now, 0.1)
      front.gain.gain.setTargetAtTime(frontScrub * fast * 0.085, now, 0.05)

      rear.band.frequency.setTargetAtTime(540 + rearScrub * 520, now, 0.06)
      rear.cry.frequency.setTargetAtTime(980 + rearScrub * 620, now, 0.08)
      rear.cry.gain.setTargetAtTime(rearScrub * 15 * dry_, now, 0.1)
      rear.gain.gain.setTargetAtTime(rearScrub * fast * 0.13, now, 0.05)

      // --- the brakes --------------------------------------------------------
      // Discs cry when they are hot and slow, not when you are flat out.
      const slow = Math.max(0, 1 - v / 26)
      brakeCry.frequency.setTargetAtTime(1500 + slow * 700, now, 0.2)
      brakeBand.frequency.setTargetAtTime(1500 + slow * 700, now, 0.2)
      brakeGain.gain.setTargetAtTime(state.brake * slow * 0.007, now, 0.08)

      // --- edges -------------------------------------------------------------
      if (state.gear !== lastGear) {
        const up = state.gear > lastGear
        lastGear = state.gear
        // The lever, and the clutch. Mechanical, close, and dry.
        noiseBurst(now, 0.08, 0.018, 'bandpass', 2400 + Math.random() * 900, 3.4, 2.2, out)
        noiseBurst(now + 0.01, 0.05, 0.03, 'lowpass', 420, 1.2, 0.8, out)
        /*
          The blow-off.

          Only upward, only under load, and this is the sound that tells you
          the car has just made a lot of power — a falling hiss as the boost
          the engine was breathing gets dumped.
        */
        if (up && throttle > 0.5) {
          const hiss = ctx.createBufferSource()
          hiss.buffer = grain
          hiss.playbackRate.value = 2.4
          const band = ctx.createBiquadFilter()
          band.type = 'bandpass'
          band.frequency.setValueAtTime(4200, now)
          band.frequency.exponentialRampToValueAtTime(900, now + 0.22)
          band.Q.value = 1.6
          const gain = ctx.createGain()
          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26)
          hiss.connect(band).connect(gain).connect(dry)
          hiss.start(now, Math.random() * (grainSeconds - 0.4), 0.32)
          hiss.stop(now + 0.34)
        }
      }

      /*
        The overrun.

        Coming off the power at high revs, unburnt fuel goes off in the pipe
        for a second or so afterwards. It is the sound of *lifting*, which is
        otherwise silent, and it is why braking into a corner in this game has
        a voice at all.
      */
      if (lastThrottle > 0.4 && throttle < 0.15 && revs > 0.45) overrun = 0.9 + revs * 0.7
      lastThrottle = throttle
      if (overrun > 0) {
        overrun = Math.max(0, overrun - dt)
        popDue -= dt * (3.5 + revs * 7)
        while (popDue < 0) {
          popDue += 1
          if (Math.random() < 0.16) bang(now, 0.25 + Math.random() * 0.24)
          else noiseBurst(now, 0.012 + Math.random() * 0.025, 0.025, 'bandpass', 850 + Math.random() * 1700, 1.8, 1.3)
        }
      }

      if (state.handbrake && !lastHandbrake) {
        // The ratchet. Three fast clicks, then the rears let go.
        for (let i = 0; i < 3; i++) {
          noiseBurst(now + i * 0.026, 0.06, 0.01, 'bandpass', 3200, 6, 2.6, out)
        }
      }
      lastHandbrake = state.handbrake

      // Grit off the underside. Only where there is loose ground to pick up.
      if (state.rough > 0.4) {
        gritDue -= dt * (4 + fast * 26)
        while (gritDue < 0) {
          gritDue += 1
          noiseBurst(
            now,
            0.045 + Math.random() * 0.055,
            0.035,
            'lowpass',
            220 + Math.random() * 260,
            1,
            0.5 + Math.random(),
          )
        }
      }

      // --- the chase ---------------------------------------------------------
      if (pressureAmount > 0.02) {
        pulseDue -= dt
        if (pulseDue <= 0) {
          pulseDue = 0.58
          const osc = ctx.createOscillator()
          osc.type = 'sine'
          const gain = ctx.createGain()
          const peak = 0.025 + pressureAmount * 0.075
          osc.frequency.setValueAtTime(96, now)
          osc.frequency.exponentialRampToValueAtTime(41, now + 0.16)
          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.exponentialRampToValueAtTime(peak, now + 0.012)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
          osc.connect(gain).connect(out)
          osc.start(now)
          osc.stop(now + 0.46)
          noiseBurst(now, peak * 0.4, 0.05, 'bandpass', 2400, 1.4, 1.6, out)
        }
      }
    },

    hit(force) {
      if (stopped) return
      const now = ctx.currentTime
      const f = Math.min(1, Math.max(0, force))
      // The body, the panel, and the tail of it down the tunnel.
      noiseBurst(now, 0.05 + f * 0.24, 0.07 + f * 0.14, 'lowpass', 150 + f * 260, 1.2, 0.4)
      noiseBurst(now, 0.03 + f * 0.16, 0.09, 'bandpass', 1800 + f * 2200, 1.1, 2.2)
      noiseBurst(now, 0.02 + f * 0.1, 0.2, 'highpass', 3200, 0.7, 2.8, verbSend)
    },

    brush(force) {
      if (stopped) return
      const now = ctx.currentTime
      const f = Math.min(1, Math.max(0, force))
      // A dry tear first, then leaves and fibres whispering down the body. No
      // low impact band: this must never sound like the car struck rock.
      noiseBurst(now, 0.045 + f * 0.075, 0.11, 'bandpass', 720 + f * 520, 0.75, 0.8)
      noiseBurst(now + 0.018, 0.026 + f * 0.055, 0.24, 'highpass', 1900, 0.48, 2.1)
      noiseBurst(now + 0.07, 0.018 + f * 0.034, 0.34, 'bandpass', 1050, 0.5, 1.5, verbSend)
    },

    chirp(tier) {
      if (stopped) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      const gain = ctx.createGain()
      const top = tier > 1 ? 940 : 620
      osc.frequency.setValueAtTime(top * 0.35, now)
      osc.frequency.exponentialRampToValueAtTime(top, now + 0.13)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.05 + tier * 0.035, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26)
      osc.connect(gain).connect(dry)
      osc.start(now)
      osc.stop(now + 0.3)
      noiseBurst(now, 0.06 + tier * 0.05, 0.16, 'bandpass', 900, 0.8, 1.1)
      // And the shove itself, out of the pipe.
      bang(now, 0.25 + tier * 0.2)
    },

    pressure(amount) {
      pressureAmount = Math.min(1, Math.max(0, amount))
    },

    stop() {
      if (stopped) return
      stopped = true
      onStop()
      const now = ctx.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setTargetAtTime(0.0001, now, 0.12)
      verbReturn.gain.setTargetAtTime(0.0001, now, 0.2)
      // Let the fade finish before tearing the graph down, or the last thing
      // you hear at the end of a race is a click.
      window.setTimeout(() => {
        for (const node of [
          combustion, mechanical, exhaust, turbo, brakeCry,
          textureSource, intakeSource, boostSource, boostSub, roadSource, windSource, front.source, rear.source,
        ]) {
          try {
            node.stop()
          } catch {
            /* already stopped */
          }
        }
        out.disconnect()
        verbReturn.disconnect()
        engineSoundTelemetry.rms = 0
        engineSoundTelemetry.peak = 0
      }, 900)
    },
  }
}
