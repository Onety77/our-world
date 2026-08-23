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
 * **Ten voices, and what each one is for.**
 *
 *   engine     four oscillators through a soft clipper and a filter that opens
 *              with load. Amplitude-modulated at half the firing rate, which
 *              is the whole difference between an engine and a synthesiser
 *              playing a note
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
}

export interface EngineVoice {
  /** Called every frame. */
  set(state: EngineState): void
  /** Stone, or rock. 0..1. */
  hit(force: number): void
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

/** Idle, and the limiter, in Hz of firing fundamental. */
const IDLE_HZ = 34
const LIMIT_HZ = 232

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
  const out = ctx.createGain()
  out.gain.value = 0.0001
  out.connect(master)

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
  verbSend.connect(verb).connect(verbReturn).connect(master)

  /** Everything mechanical goes to both. */
  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(out)
  dry.connect(verbSend)

  // --- the engine ------------------------------------------------------------

  const clip = ctx.createWaveShaper()
  {
    const curve = new Float32Array(257)
    for (let i = 0; i <= 256; i++) {
      const x = i / 128 - 1
      curve[i] = Math.tanh(x * 2.6)
    }
    clip.curve = curve
  }

  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 700
  tone.Q.value = 1.6

  /*
    The bark.

    A resonant peak an octave or so over the fundamental, in parallel with the
    lowpass. Rally cars are loud in a very specific band and this is it — take
    it out and the engine is a well-behaved hum that never sounds like it is
    working, however high the note goes.
  */
  const bark = ctx.createBiquadFilter()
  bark.type = 'bandpass'
  bark.frequency.value = 340
  bark.Q.value = 2.6
  const barkGain = ctx.createGain()
  barkGain.gain.value = 0.5

  const engineGain = ctx.createGain()
  engineGain.gain.value = 0.0001

  const oscA = ctx.createOscillator()
  oscA.type = 'sawtooth'
  const oscB = ctx.createOscillator()
  oscB.type = 'sawtooth'
  oscB.detune.value = 13
  // An octave down, square — this is the weight of it.
  const oscC = ctx.createOscillator()
  oscC.type = 'square'
  // A fifth over, which makes the firing sound uneven and the engine angry.
  const oscD = ctx.createOscillator()
  oscD.type = 'sawtooth'

  const mixA = ctx.createGain()
  mixA.gain.value = 0.5
  const mixB = ctx.createGain()
  mixB.gain.value = 0.42
  const mixC = ctx.createGain()
  mixC.gain.value = 0.5
  const mixD = ctx.createGain()
  mixD.gain.value = 0.16

  const stack = ctx.createGain()
  oscA.connect(mixA).connect(stack)
  oscB.connect(mixB).connect(stack)
  oscC.connect(mixC).connect(stack)
  oscD.connect(mixD).connect(stack)
  stack.connect(tone)
  stack.connect(bark).connect(barkGain).connect(engineGain)
  tone.connect(clip).connect(engineGain)
  engineGain.connect(dry)

  // the putter: a slow ring on the engine's own gain, at half the firing rate
  const firing = ctx.createOscillator()
  firing.type = 'sawtooth'
  const firingDepth = ctx.createGain()
  firingDepth.gain.value = 0.35
  firing.connect(firingDepth).connect(engineGain.gain)

  // --- the exhaust -----------------------------------------------------------
  // Its own path, below the filter, so the bottom end never disappears.
  const exhaust = ctx.createOscillator()
  exhaust.type = 'triangle'
  const exhaustShape = ctx.createBiquadFilter()
  exhaustShape.type = 'lowpass'
  exhaustShape.frequency.value = 260
  exhaustShape.Q.value = 3.2
  const exhaustGain = ctx.createGain()
  exhaustGain.gain.value = 0.0001
  exhaust.connect(exhaustShape).connect(exhaustGain).connect(dry)

  // --- induction -------------------------------------------------------------
  const turbo = ctx.createOscillator()
  turbo.type = 'sine'
  const turboBand = ctx.createBiquadFilter()
  turboBand.type = 'bandpass'
  turboBand.frequency.value = 2600
  turboBand.Q.value = 1.4
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
  brakeCry.type = 'sawtooth'
  brakeCry.frequency.value = 1750
  const brakeBand = ctx.createBiquadFilter()
  brakeBand.type = 'bandpass'
  brakeBand.frequency.value = 1750
  brakeBand.Q.value = 9
  const brakeGain = ctx.createGain()
  brakeGain.gain.value = 0.0001
  brakeCry.connect(brakeBand).connect(brakeGain).connect(dry)

  for (const node of [oscA, oscB, oscC, oscD, firing, exhaust, turbo, brakeCry]) {
    node.start()
  }
  roadSource.start()
  windSource.start()
  front.source.start()
  rear.source.start()
  out.gain.setTargetAtTime(1, ctx.currentTime, 0.35)

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
    noiseBurst(now, 0.06 + size * 0.2, 0.05 + size * 0.06, 'lowpass', 170 + size * 200, 1.1, 0.4)
    noiseBurst(now, 0.03 + size * 0.13, 0.03, 'bandpass', 1500 + size * 2400, 1.6, 2.4)
  }

  return {
    set(state) {
      if (stopped) return
      const now = ctx.currentTime
      const dt = Math.min(0.1, Math.max(0, now - lastAt))
      lastAt = now

      const v = Math.max(0, state.speed)
      const revs = Math.max(0, Math.min(1.04, state.revs))
      const throttle = Math.max(0, Math.min(1, state.throttle))
      const cut = Math.max(0, Math.min(1, state.shifting))

      // --- the note ----------------------------------------------------------
      const fundamental =
        (IDLE_HZ + (LIMIT_HZ - IDLE_HZ) * revs) * (state.boost ? 1.04 : 1)

      /*
        The limiter.

        A real engine at its ceiling does not sit there smoothly — it bounces
        off the cut, several times a second. Without this the top of the last
        gear is a held note, which is the one place a synthesised engine
        always gives itself away.
      */
      limiter = revs > 0.985 ? 1 : Math.max(0, limiter - dt * 6)
      const bounce = limiter > 0 ? (Math.sin(now * 92) > 0 ? 1 : 0.62) : 1

      oscA.frequency.setTargetAtTime(fundamental, now, 0.03)
      oscB.frequency.setTargetAtTime(fundamental * 1.004, now, 0.03)
      oscC.frequency.setTargetAtTime(fundamental * 0.5, now, 0.045)
      oscD.frequency.setTargetAtTime(fundamental * 1.5, now, 0.04)
      firing.frequency.setTargetAtTime(fundamental * 0.5, now, 0.05)
      // The putter is a low-revs thing. At the top of a gear it would be a
      // tremolo, and no engine has one.
      firingDepth.gain.setTargetAtTime(0.42 - revs * 0.3, now, 0.15)

      bark.frequency.setTargetAtTime(fundamental * 2.1, now, 0.05)
      barkGain.gain.setTargetAtTime(0.22 + throttle * 0.5, now, 0.1)

      tone.frequency.setTargetAtTime(
        340 + revs * 1150 + throttle * 900 + (state.boost ? 800 : 0),
        now,
        0.05,
      )

      /*
        The shift is a *hole*, not a crossfade.

        `shifting` comes straight from the gearbox in the physics, so the note
        drops out for exactly as long as the torque does. It is the single
        clearest thing in the whole soundscape and it costs one multiply.
      */
      const power = (0.06 + throttle * 0.075) * (1 - cut * 0.88) * bounce
      engineGain.gain.setTargetAtTime(power, now, 0.02)

      exhaust.frequency.setTargetAtTime(fundamental * 0.5, now, 0.04)
      exhaustShape.frequency.setTargetAtTime(140 + revs * 220, now, 0.08)
      exhaustGain.gain.setTargetAtTime(
        (0.03 + throttle * 0.05 + (state.boost ? 0.03 : 0)) * (1 - cut * 0.9),
        now,
        0.04,
      )

      // --- induction ---------------------------------------------------------
      const spool = throttle * revs
      turbo.frequency.setTargetAtTime(900 + revs * 4200 + (state.boost ? 900 : 0), now, 0.12)
      turboGain.gain.setTargetAtTime(
        (0.004 + spool * 0.026 + (state.boost ? 0.03 : 0)) * (1 - cut * 0.7),
        now,
        0.09,
      )

      // --- road and wind -----------------------------------------------------
      const fast = Math.min(1.2, v / 44)
      roadBand.frequency.setTargetAtTime(240 + fast * 760 + state.rough * 420, now, 0.1)
      roadBand.Q.setTargetAtTime(state.rough > 0.5 ? 0.4 : 0.9, now, 0.2)
      roadGain.gain.setTargetAtTime(
        0.007 + fast * fast * 0.06 + state.rough * fast * 0.085 + state.wet * fast * 0.03,
        now,
        0.1,
      )

      windShape.frequency.setTargetAtTime(420 + fast * 900, now, 0.15)
      whistle.frequency.setTargetAtTime(1700 + state.tight * 1900, now, 0.2)
      whistle.gain.setTargetAtTime(state.tight * 11 * fast, now, 0.25)
      windGain.gain.setTargetAtTime(0.004 + fast * fast * 0.085, now, 0.12)

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
      front.gain.gain.setTargetAtTime(0.0004 + frontScrub * fast * 0.085, now, 0.05)

      rear.band.frequency.setTargetAtTime(540 + rearScrub * 520, now, 0.06)
      rear.cry.frequency.setTargetAtTime(980 + rearScrub * 620, now, 0.08)
      rear.cry.gain.setTargetAtTime(rearScrub * 15 * dry_, now, 0.1)
      rear.gain.gain.setTargetAtTime(0.0005 + rearScrub * fast * 0.13, now, 0.05)

      // --- the brakes --------------------------------------------------------
      // Discs cry when they are hot and slow, not when you are flat out.
      const slow = Math.max(0, 1 - v / 26)
      brakeCry.frequency.setTargetAtTime(1500 + slow * 700, now, 0.2)
      brakeBand.frequency.setTargetAtTime(1500 + slow * 700, now, 0.2)
      brakeGain.gain.setTargetAtTime(state.brake * slow * 0.02, now, 0.08)

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
          gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012)
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
        popDue -= dt * (7 + revs * 16)
        while (popDue < 0) {
          popDue += 1
          if (Math.random() < 0.22) bang(now, 0.35 + Math.random() * 0.3)
          else noiseBurst(now, 0.02 + Math.random() * 0.05, 0.02, 'bandpass', 900 + Math.random() * 2400, 3, 1.4)
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
          const peak = 0.05 + pressureAmount * 0.16
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
          oscA, oscB, oscC, oscD, firing, exhaust, turbo, brakeCry,
          roadSource, windSource, front.source, rear.source,
        ]) {
          try {
            node.stop()
          } catch {
            /* already stopped */
          }
        }
        out.disconnect()
        verbReturn.disconnect()
      }, 900)
    },
  }
}
