/**
 * The sound of the place, synthesised.
 *
 * Wind is filtered noise, and noise is free — so the entire ambient bed ships
 * as about three hundred lines instead of a few megabytes of loops, never has
 * a seam where it repeats, and can be steered by the same wind value that
 * bends the grass.
 *
 * Sound is half of the atmosphere and it is the thing that always gets left
 * until last and then never done. It's in Phase 00 for that reason.
 *
 * ---------------------------------------------------------------------------
 * **Every place has its own weather.**
 *
 * There used to be one bed — wind — and it played everywhere. So you carried
 * open-meadow wind down into a cave and out along a river, which is worse than
 * silence: the ear knows a cave is not windy, and a soundtrack that ignores
 * where you are standing quietly tells you the place is not real.
 *
 * Now there are six layers and every place is a *mix* of them. Moving between
 * places crossfades the mix rather than switching it, over about the length of
 * the visual fade, so the water comes up as the valley does.
 *
 *   air        the body of moving air. Loud in the open, thin under stars,
 *              nearly gone underground
 *   leaves     the faster rustle riding on top of it. Only where there are
 *              leaves
 *   water      the Wellspring: two bands of noise and a burble over stones
 *   fire       the Hollow: a low roar, and crackles
 *   room       the near-sub rumble of being inside something
 *   shimmer    the Stars: rare, very quiet tones, long enough to be a
 *              resonance rather than a note
 *
 * A place is set from `App`, which is the only thing that knows both which
 * section is on screen and whether you have gone into it. Adding a place is
 * adding a column to `MIX`.
 * ---------------------------------------------------------------------------
 */

import { createEngineVoice, type EngineVoice } from './engine'
import { gainOf, levelsNow } from './volume'
import { placeLevelsNow } from './outdoors'

export type { EngineState, EngineVoice } from './engine'

const NOISE_SECONDS = 4

/**
 * The garden's one unlocked audio graph, for place-specific synthesisers.
 *
 * A road soundscape must share this context and output with the engine: a
 * second `AudioContext` is commonly suspended on phones, ignores the garden's
 * visibility/master fade, and doubles the platform's scarcest audio resource.
 * The caller owns every node it connects and must stop it when its place
 * unmounts. This deliberately exposes no ambient layer controls.
 */
export interface SynthesisBus {
  context: AudioContext
  output: AudioNode
  noise: AudioBuffer
  noiseSeconds: number
}

/**
 * Where the ear is.
 *
 * `garden` is the open world — the row of places seen from outside, which is
 * the only view with real weather in it. The rest are the insides of the four
 * places, by section id.
 */
export type Place = 'garden' | 'tree' | 'river' | 'hollow' | 'stars' | 'glasshouse'

/** Short physical events that belong to the world rather than to interface chrome. */
export type WorldCue = 'root' | 'seal' | 'water' | 'glass' | 'ember' | 'paper'

/** Development evidence that world cues reached the shared Web Audio graph. */
export const worldSoundTelemetry = {
  rms: 0,
  peak: 0,
  last: '' as WorldCue | '',
  cues: 0,
}
if (import.meta.env.DEV) {
  const host = globalThis as typeof globalThis & { __gardenSound?: typeof worldSoundTelemetry }
  host.__gardenSound = worldSoundTelemetry
}

export interface AmbienceHandle {
  start(): Promise<void>
  stop(): void
  /** 0..1, follows the palette's wind so the sound matches what you can see. */
  setWind(value: number): void
  /** Crossfades the bed to whatever this place sounds like. */
  setPlace(place: Place): void
  /**
   * What the bed is currently playing, and how far through the crossfade.
   *
   * For the control room, and it exists because "I can still hear the garden
   * in here" is a question nobody could answer. The mix is a table of numbers
   * in this file, the crossfade is a variable nothing exposes, and the only
   * instrument available was somebody's ears on a phone in another country.
   * Two numbers on a screen settle it in a second: either the bed is on the
   * place you are standing in, in which case what you can hear is that place's
   * own sound and the argument is about the *mix*, or it is not, and there is
   * a bug.
   */
  hearing(): { place: Place; from: Place; blend: number; levels: Record<string, number> }
  /** 0..1, drops when the tab is hidden. */
  setMaster(value: number): void
  /** The world and effects faders. Music is applied at the player. */
  setLevels(levels: { world: number; effects: number }): void
  /**
   * One stroke of a pen on paper. Called per character while writing.
   *
   * `weight` 0..1 leans it from a light tick to a longer scratch; `back` is
   * for a character being taken away, which is duller and shorter than one
   * being put down.
   */
  nib(weight?: number, back?: boolean): void
  /**
   * A stone set down on stone.
   *
   * For the word game, where every letter lands on a pebble. `weight` 0..1
   * leans it from a small chip to a heavier one — the last letter of a word is
   * worth a bit more than the first.
   */
  chip(weight?: number): void
  /**
   * A message leaving, or one arriving.
   *
   * Two notes and nothing else — a small rising interval for something you
   * sent and a falling one for something she said, so the two are told apart
   * with the screen off and without either of them being a *chime*. A chat
   * notification tone is the single most application-like sound there is, and
   * this world does not have applications in it: what is wanted is the sound a
   * light makes going up.
   *
   * Deliberately quieter than a keystroke. It fires when the garden is not
   * being looked at as often as when it is.
   */
  said(mine: boolean): void
  /** A quiet, physical response to a meaningful act in one of the places. */
  cue(kind: WorldCue, weight?: number): void
  /** The shared graph for a self-contained, short-lived place soundscape. */
  synthesisBus(): SynthesisBus | null
  /**
   * A car, and the road under it. Returns null if nothing has unlocked the
   * audio context yet — which cannot happen in practice, because you have to
   * press "start the engine" to get to a road at all.
   *
   * While one of these is alive the whole ambient bed ducks away to almost
   * nothing. It is automatic rather than something the racer remembers to ask
   * for: you are in a tunnel forty metres a second, and meadow wind over the
   * top of that is the same mistake in a different room.
   */
  engine(): EngineVoice | null
  readonly running: boolean
}

// ---------------------------------------------------------------------------
// What each place is made of
// ---------------------------------------------------------------------------

/**
 * The mix, by place. One row per layer, and the numbers are multipliers on
 * that layer's own level rather than absolute gains — so a layer can be
 * retuned once and stay balanced everywhere it appears.
 */
/*
  A row per layer, and a column per place. Every place must appear in every
  row: a missing cell is `undefined`, which multiplies through to NaN and
  reaches an AudioParam as a non-finite value — which throws, once, and takes
  the whole ambient bed down with it. Adding a place means adding a column
  here, and nothing else in this file.

  **The Glasshouse is built entirely out of layers that already existed**, which
  is worth saying because the brief asked for "wind, distant birds, glass
  resonance and occasional water drops" and it sounds like four new
  synthesisers. It is not: it is the garden's wind heard from inside, the wood
  through the broken roof, the room tone of somewhere with walls, a little of
  the river for the wet floor, and the Stars' rare tones — which are struck
  glass already, and were only ever called shimmer because that is where they
  were first used.
*/
const MIX: Record<string, Record<Place, number>> = {
  //         garden  tree  river  hollow  stars  glasshouse
  air:      { garden: 1,   tree: 1,    river: 0.5,  hollow: 0.05, stars: 0.42, glasshouse: 0.55 },
  leaves:   { garden: 1,   tree: 1.3,  river: 0.28, hollow: 0,    stars: 0.1,  glasshouse: 0.72 },
  water:    { garden: 0,   tree: 0,    river: 1,    hollow: 0,    stars: 0,    glasshouse: 0.12 },
  fire:     { garden: 0,   tree: 0,    river: 0,    hollow: 1,    stars: 0,    glasshouse: 0 },
  room:     { garden: 0,   tree: 0.08, river: 0.14, hollow: 1,    stars: 0.3,  glasshouse: 0.78 },
  shimmer:  { garden: 0,   tree: 0,    river: 0,    hollow: 0,    stars: 1,    glasshouse: 0.5 },
}

/** How often the loose events fire, per second, at full strength. */
const BURBLE_RATE = 3.4
const CRACKLE_RATE = 6.5
const SHIMMER_RATE = 0.26

/** Seconds the bed takes to cross from one place to the next. */
const CROSSFADE = 1.6

/** A pentatonic set, two octaves, for the Stars. Hz. */
const SHIMMER_TONES = [
  523.25, 587.33, 698.46, 783.99, 880.0,
  1046.5, 1174.66, 1396.91, 1567.98, 1760.0,
]

export function createAmbience(): AmbienceHandle {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let limiter: DynamicsCompressorNode | null = null
  /** The place you are standing in. See `systems/volume`. */
  let worldBus: GainNode | null = null
  /** Things that happen because of you: the car, the stones, the pen. */
  let effectsBus: GainNode | null = null
  let running = false

  /** One gain per layer, kept so the place and the wind can steer them. */
  const beds: Record<string, GainNode | null> = {
    air: null,
    leaves: null,
    water: null,
    fire: null,
    room: null,
    shimmer: null,
  }
  /** Where the loose events are played into, so they ride the same fade. */
  let leafFilter: BiquadFilterNode | null = null
  let airFilter: BiquadFilterNode | null = null

  let targetWind = 0.6
  let currentWind = 0.6

  let place: Place = 'garden'
  /** Eases toward 1 for the current place and 0 for the one before it. */
  let blend = 1
  let from: Place = 'garden'

  /** 0 normally, 1 while something louder than the world is happening. */
  let duck = 0
  let engines = 0

  let raf = 0
  let lastTick = 0
  let burbleDue = 0
  let crackleDue = 0
  let shimmerDue = 0

  /** Kept so a pen stroke can be built without regenerating noise each time. */
  let grain: AudioBuffer | null = null
  /** Pen strokes bypass the wind's master so they stay audible under it. */
  let inkGain: GainNode | null = null
  let eventAnalyser: AnalyserNode | null = null
  let eventSamples: Float32Array<ArrayBuffer> | null = null
  let eventMeterFrame = 0

  /**
   * The one noise buffer everything in the world is made of.
   *
   * -------------------------------------------------------------------------
   * **The seam is crossfaded, not tapered, and the difference is the whole
   * point of this comment.**
   *
   * This used to fade the first and last 0.4 s down to zero, under a comment
   * saying it made the loop point inaudible. It did the exact opposite. A
   * looped buffer that is silent at both ends is not seamless — it has a hole
   * in it, 0.8 s wide, once per lap, and every continuous layer in the game
   * plays this buffer on a loop. Measured: the ends sat at 11% of the RMS of
   * the middle.
   *
   * What that sounds like depends only on `playbackRate`, because the period
   * is `NOISE_SECONDS / rate`:
   *
   *   the Stormcrown's droplets   rate 1.93  ->  a hole every 2.1 s
   *   its rain                    rate 1.16  ->  every 3.4 s
   *   the Moonbreak's water       rate 1.06  ->  every 3.8 s
   *
   * — which is heard, correctly, as a sound that keeps stopping and starting
   * rather than as an ocean. It was not a bug in either road's soundscape;
   * both of them were faithfully playing a bed with a hole in it.
   *
   * The fix is the standard one for looping noise: generate a little more than
   * is needed and fold the overrun back over the head with **equal-power**
   * weights. `cos` and `sin` rather than `t` and `1 − t`, because the two
   * signals being mixed are uncorrelated — linear weights would still dip 3 dB
   * in the middle of the crossfade, which is quieter than a hole and still a
   * pulse you can hear once you know it is there.
   * -------------------------------------------------------------------------
   */
  function noiseBuffer(context: AudioContext): AudioBuffer {
    const length = context.sampleRate * NOISE_SECONDS
    const fade = Math.floor(context.sampleRate * 0.4)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)

    // Brown-ish noise: integrating white noise tilts the spectrum downward,
    // which is what makes it read as air moving rather than as static. Run on
    // past the end of the loop, so there is a genuine continuation to fold in.
    const raw = new Float32Array(length + fade)
    let last = 0
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.021 * white) / 1.02
      raw[i] = last * 3.2
    }

    for (let i = 0; i < length; i++) data[i] = raw[i]

    /*
      Fold the overrun over the head.

      `raw[length + i]` is what genuinely came after the last sample of the
      loop, so at i = 0 the buffer is exactly that and the join is continuous;
      by the end of the crossfade it is the original head again, and the rest
      of the buffer is untouched. Constant power throughout.
    */
    for (let i = 0; i < fade; i++) {
      const t = (i / fade) * Math.PI * 0.5
      data[i] = raw[length + i] * Math.cos(t) + raw[i] * Math.sin(t)
    }
    return buffer
  }

  function layer(
    context: AudioContext,
    buffer: AudioBuffer,
    opts: {
      type: BiquadFilterType
      frequency: number
      Q: number
      gain: number
      rate: number
      lfoRate: number
      lfoDepth: number
    },
  ) {
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.playbackRate.value = opts.rate

    const filter = context.createBiquadFilter()
    filter.type = opts.type
    filter.frequency.value = opts.frequency
    filter.Q.value = opts.Q

    const gain = context.createGain()
    gain.gain.value = opts.gain

    // a slow LFO on the gain gives the wind its swell — without it the bed is
    // a flat hiss and the ear stops believing it after about ten seconds
    const lfo = context.createOscillator()
    lfo.frequency.value = opts.lfoRate
    const lfoGain = context.createGain()
    lfoGain.gain.value = opts.lfoDepth
    lfo.connect(lfoGain).connect(gain.gain)
    lfo.start()

    source.connect(filter).connect(gain)
    source.start()

    return { source, filter, gain, lfo }
  }

  /**
   * How much of a layer this place wants, including its published/draft place
   * level and blended exactly across the crossfade.
   */
  function levelOf(name: string): number {
    const row = MIX[name]
    if (!row) return 0
    const levels = placeLevelsNow()
    return (
      row[from] * (levels[from] ?? 1) * (1 - blend) +
      row[place] * (levels[place] ?? 1) * blend
    )
  }

  /**
   * A short shaped bite out of the noise. Everything loose — burbles,
   * crackles, grit — is one of these.
   */
  function burst(
    into: AudioNode,
    peak: number,
    length: number,
    type: BiquadFilterType,
    frequency: number,
    Q: number,
    rate: number,
  ) {
    if (!ctx || !grain) return
    const now = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = grain
    source.playbackRate.value = rate

    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = Q

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length)

    source.connect(filter).connect(gain).connect(into)
    source.start(now, Math.random() * (NOISE_SECONDS - 0.3), length + 0.05)
    source.stop(now + length + 0.06)
  }

  /**
   * One tone in the Stars.
   *
   * Slow in and long out, and quiet enough that you are never quite sure you
   * heard it. A fast attack here would be a notification; this is meant to be
   * the sound a very large cold sky would make if it made one.
   */
  function shimmer(into: AudioNode) {
    if (!ctx) return
    const now = ctx.currentTime
    const base = SHIMMER_TONES[Math.floor(Math.random() * SHIMMER_TONES.length)]
    const length = 3.4 + Math.random() * 2.6

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.014, now + 0.5)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length)
    gain.connect(into)

    // The tone, and a fifth over it at a third of the level — which is what
    // stops a sine sounding like a test tone.
    for (const [ratio, level] of [[1, 1], [1.5, 0.32], [2, 0.12]] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = base * ratio * (0.999 + Math.random() * 0.002)
      const voice = ctx.createGain()
      voice.gain.value = level
      osc.connect(voice).connect(gain)
      osc.start(now)
      osc.stop(now + length + 0.2)
    }
  }

  function tick() {
    raf = requestAnimationFrame(tick)
    if (!ctx || !master) return

    const now = ctx.currentTime
    const wall = performance.now()
    const dt = Math.min(0.1, Math.max(0, (wall - lastTick) / 1000))
    lastTick = wall

    currentWind += (targetWind - currentWind) * 0.02
    if (blend < 1) blend = Math.min(1, blend + dt / CROSSFADE)
    duck += ((engines > 0 ? 1 : 0) - duck) * (1 - Math.exp(-3.5 * dt))
    const open = 1 - duck * 0.94

    // --- the beds ------------------------------------------------------------
    const set = (name: string, value: number) => {
      const gain = beds[name]
      if (gain) gain.gain.setTargetAtTime(value * open, now, 0.35)
    }

    set('air', levelOf('air') * (0.1 + currentWind * 0.2))
    set('leaves', levelOf('leaves') * (0.012 + currentWind * 0.05))
    set('water', levelOf('water') * 0.19)
    set('fire', levelOf('fire') * 0.16)
    set('room', levelOf('room') * 0.13)
    // The shimmer bed is only a bus for its tones; it carries no noise itself.
    set('shimmer', levelOf('shimmer'))

    if (leafFilter) {
      leafFilter.frequency.setTargetAtTime(900 + currentWind * 1400, now, 0.9)
    }
    if (airFilter) {
      // Thinner where there is less of it. Under the stars the air is high and
      // far away; in the open it has a body to it.
      const body = levelOf('air')
      airFilter.frequency.setTargetAtTime(260 + body * 200, now, 1.2)
    }

    // --- the loose events ----------------------------------------------------
    const water = levelOf('water') * open
    if (water > 0.02 && beds.water) {
      burbleDue -= dt * BURBLE_RATE * water
      while (burbleDue < 0) {
        burbleDue += 1
        /*
          Water over stones is not hiss. The hiss is the two noise bands; this
          is the *pitch* in it — a short resonant knock somewhere in the low
          middle, at a rate slow enough to hear individually. Take these away
          and the Wellspring becomes a radio between stations.
        */
        burst(
          beds.water,
          0.02 + Math.random() * 0.05,
          0.05 + Math.random() * 0.13,
          'bandpass',
          260 + Math.random() * 900,
          3 + Math.random() * 7,
          0.5 + Math.random() * 0.7,
        )
      }
    }

    const fire = levelOf('fire') * open
    if (fire > 0.02 && beds.fire) {
      crackleDue -= dt * CRACKLE_RATE * fire
      while (crackleDue < 0) {
        crackleDue += 1
        // Mostly ticks, occasionally a proper pop with some low in it.
        const big = Math.random() < 0.13
        burst(
          beds.fire,
          big ? 0.09 + Math.random() * 0.09 : 0.02 + Math.random() * 0.035,
          big ? 0.06 + Math.random() * 0.06 : 0.008 + Math.random() * 0.02,
          'bandpass',
          big ? 700 + Math.random() * 900 : 1900 + Math.random() * 3400,
          big ? 1.4 : 2.5 + Math.random() * 4,
          big ? 0.8 : 1.7 + Math.random() * 1.4,
        )
      }
    }

    const sky = levelOf('shimmer') * open
    if (sky > 0.05 && beds.shimmer) {
      shimmerDue -= dt * SHIMMER_RATE * sky
      while (shimmerDue < 0) {
        shimmerDue += 1
        shimmer(beds.shimmer)
      }
    }

    if (eventAnalyser && eventSamples && ++eventMeterFrame % 6 === 0) {
      eventAnalyser.getFloatTimeDomainData(eventSamples)
      let energy = 0
      let peak = 0
      for (let i = 0; i < eventSamples.length; i++) {
        const sample = eventSamples[i]
        energy += sample * sample
        peak = Math.max(peak, Math.abs(sample))
      }
      worldSoundTelemetry.rms = Math.sqrt(energy / eventSamples.length)
      worldSoundTelemetry.peak = peak
    }
  }

  return {
    get running() {
      return running
    },

    async start() {
      if (running) return
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return

      ctx = new Ctor()
      // Safari hands back a suspended context even after a gesture.
      if (ctx.state === 'suspended') await ctx.resume()

      master = ctx.createGain()
      master.gain.value = 0
      // Cars and place soundscapes each protect their own output, but they are
      // summed here. One fast final limiter prevents a loud thunder/plunge over
      // full throttle from becoming the laptop-speaker crack this mix used to
      // produce, without flattening ordinary engine or garden dynamics.
      limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -4
      limiter.knee.value = 3
      limiter.ratio.value = 14
      limiter.attack.value = 0.002
      limiter.release.value = 0.13
      master.connect(limiter).connect(ctx.destination)

      /*
        Two buses under the master, so the balance is reachable.

        Everything used to sum straight into `master`, which left exactly one
        control over the whole mix — and if the car is too loud against the
        wind, turning the master down takes the wind with it. Splitting the sum
        by *where a sound comes from* is what makes "quieter car, same garden"
        a thing anybody can ask for. See `systems/volume`.

        The limiter stays where it is, after both. It is protecting the
        speaker, not the mix, and a limiter that can be turned down is not
        protecting anything.
      */
      worldBus = ctx.createGain()
      worldBus.gain.value = gainOf(levelsNow().world)
      worldBus.connect(master)

      effectsBus = ctx.createGain()
      effectsBus.gain.value = gainOf(levelsNow().effects)
      effectsBus.connect(master)

      const buffer = noiseBuffer(ctx)
      grain = buffer

      inkGain = ctx.createGain()
      inkGain.gain.value = 1
      if (import.meta.env.DEV) {
        eventAnalyser = ctx.createAnalyser()
        eventAnalyser.fftSize = 256
        eventAnalyser.smoothingTimeConstant = 0.35
        eventSamples = new Float32Array(eventAnalyser.fftSize)
        inkGain.connect(eventAnalyser).connect(effectsBus)
      } else {
        inkGain.connect(effectsBus)
      }

      // --- air, and the leaves on it -----------------------------------------
      const low = layer(ctx, buffer, {
        type: 'lowpass',
        frequency: 380,
        Q: 0.6,
        gain: 0.22,
        rate: 0.85,
        lfoRate: 0.055,
        lfoDepth: 0.1,
      })
      const leaves = layer(ctx, buffer, {
        type: 'bandpass',
        frequency: 1400,
        Q: 0.5,
        gain: 0.04,
        rate: 1.35,
        lfoRate: 0.13,
        lfoDepth: 0.03,
      })

      /*
        --- the river ---------------------------------------------------------

        Two bands and not one. A single band of noise is a shower; a river is a
        broad low rush with a much finer hiss riding on it, and the two swell
        against each other at different rates because the water is not doing
        one thing.
      */
      const rush = layer(ctx, buffer, {
        type: 'bandpass',
        frequency: 620,
        Q: 0.42,
        gain: 0.5,
        rate: 1.0,
        lfoRate: 0.075,
        lfoDepth: 0.13,
      })
      const riffle = layer(ctx, buffer, {
        type: 'bandpass',
        frequency: 2650,
        Q: 0.6,
        gain: 0.16,
        rate: 1.9,
        lfoRate: 0.115,
        lfoDepth: 0.05,
      })
      const water = ctx.createGain()
      water.gain.value = 0
      rush.gain.connect(water)
      riffle.gain.connect(water)
      water.connect(worldBus)

      /*
        --- the fire ----------------------------------------------------------

        The roar is nearly all low. What makes it a fire rather than a fan is
        the breath — a slow deep LFO, so it surges and settles — and the
        crackles, which are fired from `tick` rather than being in the loop.
      */
      const roar = layer(ctx, buffer, {
        type: 'lowpass',
        frequency: 250,
        Q: 0.9,
        gain: 0.75,
        rate: 0.5,
        lfoRate: 0.09,
        lfoDepth: 0.3,
      })
      const flame = layer(ctx, buffer, {
        type: 'bandpass',
        frequency: 720,
        Q: 0.45,
        gain: 0.2,
        rate: 0.95,
        lfoRate: 0.21,
        lfoDepth: 0.09,
      })
      const fire = ctx.createGain()
      fire.gain.value = 0
      roar.gain.connect(fire)
      flame.gain.connect(fire)
      fire.connect(worldBus)

      // --- the room ----------------------------------------------------------
      // Almost too low to hear on a phone, and the whole point of it: a cave
      // has a floor under the silence that an open field does not.
      const rumble = layer(ctx, buffer, {
        type: 'lowpass',
        frequency: 95,
        Q: 1.1,
        gain: 1,
        rate: 0.14,
        lfoRate: 0.037,
        lfoDepth: 0.22,
      })
      const room = ctx.createGain()
      room.gain.value = 0
      rumble.gain.connect(room)
      room.connect(worldBus)

      // --- the sky -----------------------------------------------------------
      const sky = ctx.createGain()
      sky.gain.value = 0
      sky.connect(worldBus)

      low.gain.connect(worldBus)
      leaves.gain.connect(worldBus)

      beds.air = low.gain
      beds.leaves = leaves.gain
      beds.water = water
      beds.fire = fire
      beds.room = room
      beds.shimmer = sky
      leafFilter = leaves.filter
      airFilter = low.filter

      // Whatever place was asked for before the door opened is where we start,
      // rather than fading in from the garden every time.
      blend = 1
      from = place

      // fade in over a few seconds — sound that snaps on is startling
      master.gain.setTargetAtTime(0.85, ctx.currentTime, 1.8)

      running = true
      lastTick = performance.now()
      tick()
    },

    stop() {
      cancelAnimationFrame(raf)
      raf = 0
      running = false
      void ctx?.close()
      ctx = null
      master = null
      limiter = null
      for (const key of Object.keys(beds)) beds[key] = null
      leafFilter = null
      airFilter = null
      grain = null
      inkGain = null
      eventAnalyser = null
      eventSamples = null
      worldSoundTelemetry.rms = 0
      worldSoundTelemetry.peak = 0
      engines = 0
      duck = 0
    },

    setWind(value) {
      targetWind = Math.max(0, Math.min(1, value))
    },

    setPlace(next) {
      if (next === place) return
      // Start the new fade from wherever the last one had got to, so swiping
      // quickly through three places does not snap back to the first.
      from = blend < 1 ? from : place
      place = next
      blend = 0
    },

    hearing() {
      const levels: Record<string, number> = {}
      for (const name of Object.keys(MIX)) {
        // `levelOf` already includes the section fader, so zero here genuinely
        // means the complete ambient room is sealed.
        levels[name] = Number(levelOf(name).toFixed(3))
      }
      return { place, from, blend: Number(blend.toFixed(2)), levels }
    },

    /**
     * Move the two faders that live in the audio graph.
     *
     * Music is not here: it is an `<audio>` element in the corner player and
     * never enters this context, so its fader is applied where it plays.
     */
    setLevels(levels) {
      if (!ctx) return
      const now = ctx.currentTime
      // Eased, because a fader dragged in the control room while the garden is
      // playing should not step.
      worldBus?.gain.setTargetAtTime(gainOf(levels.world), now, 0.08)
      effectsBus?.gain.setTargetAtTime(gainOf(levels.effects), now, 0.08)
    },

    setMaster(value) {
      if (!ctx || !master) return
      master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), ctx.currentTime, 0.4)
    },

    /*
      A pen on paper, not a keyboard.

      What you are looking at while this plays is a sheet of laid paper with
      ink on it, and a key click would say "you are typing into a computer" —
      which is the one thing the whole composer is built to make you forget.

      A nib stroke is a very short rasp of noise: the fibres of the paper
      catching, bandpassed high because that is where the friction lives, with
      a fast attack and a decay under a twentieth of a second. Under it sits a
      much quieter low thump — the sheet itself moving on the desk. Every
      value is jittered per stroke; a scratch that is bit-identical twenty
      times a second stops being paper and becomes a Geiger counter.
    */
    nib(weight = 0.5, back = false) {
      if (!ctx || !grain || !inkGain) return
      const now = ctx.currentTime
      const w = Math.max(0, Math.min(1, weight))

      // where in the noise to bite from — never the same place twice
      const offset = Math.random() * (NOISE_SECONDS - 0.2)
      const length = back ? 0.016 : 0.022 + w * 0.026

      const source = ctx.createBufferSource()
      source.buffer = grain
      source.playbackRate.value = back ? 0.7 : 1.5 + Math.random() * 1.1

      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      // taking a character away is duller than putting one down
      band.frequency.value = back
        ? 900 + Math.random() * 400
        : 2200 + Math.random() * 2600
      band.Q.value = 0.7 + Math.random() * 1.1

      const gain = ctx.createGain()
      const peak = (back ? 0.05 : 0.075 + w * 0.06) * (0.75 + Math.random() * 0.5)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length)

      source.connect(band).connect(gain).connect(inkGain)
      source.start(now, offset, length + 0.02)
      source.stop(now + length + 0.03)

      // the paper itself, moving. Almost inaudible alone; without it the
      // stroke floats with nothing underneath it.
      if (!back) {
        const body = ctx.createBufferSource()
        body.buffer = grain
        body.playbackRate.value = 0.35

        const lowpass = ctx.createBiquadFilter()
        lowpass.type = 'lowpass'
        lowpass.frequency.value = 220 + Math.random() * 120

        const bodyGain = ctx.createGain()
        bodyGain.gain.setValueAtTime(0.0001, now)
        bodyGain.gain.exponentialRampToValueAtTime(0.03 + w * 0.02, now + 0.006)
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)

        body.connect(lowpass).connect(bodyGain).connect(inkGain)
        body.start(now, Math.random() * (NOISE_SECONDS - 0.2), 0.09)
        body.stop(now + 0.1)
      }
    },

    /*
      A pebble put down on a stone shelf.

      Two parts, and both are needed. The *click* is the contact: a very short
      bite of noise, bandpassed high where the sharpness lives, over in about a
      hundredth of a second. Under it a *ring* — a triangle that drops a fifth
      as it decays — which is the stone itself having a size. Click alone is a
      keyboard; ring alone is a marimba; together they are two rocks touching.

      Everything is jittered per strike, because five identical ticks in a row
      stops being stone and becomes a mechanism.
    */
    said(mine: boolean) {
      if (!ctx || !inkGain) return
      const now = ctx.currentTime

      /*
        A fifth, and which way it leans is the whole message.

        Up for yours going away, down for hers arriving — the same relationship
        a question and an answer have. Sine rather than triangle so there is no
        edge on it at all: this can go off while you are reading, and anything
        with harmonics in it would be a notification.
      */
      const [from, to] = mine ? [523.25, 783.99] : [659.25, 440]
      for (const [i, hz] of [from, to].entries()) {
        const at = now + i * 0.085
        const voice = ctx.createOscillator()
        voice.type = 'sine'
        voice.frequency.setValueAtTime(hz, at)

        const level = ctx.createGain()
        level.gain.setValueAtTime(0.0001, at)
        level.gain.exponentialRampToValueAtTime(0.03 - i * 0.006, at + 0.02)
        level.gain.exponentialRampToValueAtTime(0.0001, at + 0.42)

        // A breath of air under it, so it sits in the same room as everything
        // else rather than on top of the mix.
        const soften = ctx.createBiquadFilter()
        soften.type = 'lowpass'
        soften.frequency.value = 2600

        voice.connect(soften).connect(level).connect(inkGain)
        voice.start(at)
        voice.stop(at + 0.46)
      }
    },

    /*
      Physical punctuation, not interface feedback.

      These cues only happen after the act they describe has genuinely happened:
      a thought took root, an answer was sealed, the river rose, glass formed,
      or a game was carried to the fire. They are deliberately short and share
      `inkGain`, so they inherit the same unlock, visibility fade and final
      speaker limiter as every other sound in the garden.
    */
    cue(kind, weight = 0.6) {
      if (!ctx || !grain || !inkGain) return
      const now = ctx.currentTime
      const w = Math.max(0, Math.min(1, weight))
      worldSoundTelemetry.last = kind
      worldSoundTelemetry.cues++

      const tone = (
        at: number,
        fromHz: number,
        toHz: number,
        peak: number,
        length: number,
        type: OscillatorType = 'sine',
      ) => {
        if (!ctx || !inkGain) return
        const voice = ctx.createOscillator()
        voice.type = type
        voice.frequency.setValueAtTime(fromHz, at)
        voice.frequency.exponentialRampToValueAtTime(toHz, at + length)
        const level = ctx.createGain()
        level.gain.setValueAtTime(0.0001, at)
        level.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.008)
        level.gain.exponentialRampToValueAtTime(0.0001, at + length)
        voice.connect(level).connect(inkGain)
        voice.start(at)
        voice.stop(at + length + 0.04)
      }

      if (kind === 'root') {
        // Soil settles first; a small harmonic stem opens above it.
        burst(inkGain, 0.035 + w * 0.025, 0.24, 'lowpass', 290, 0.7, 0.42)
        tone(now, 146.83, 196, 0.018 + w * 0.014, 0.58, 'triangle')
        tone(now + 0.07, 220, 293.66, 0.009 + w * 0.008, 0.72)
        return
      }

      if (kind === 'seal') {
        // Paper folds, then the small weight of the seal lands on it.
        burst(inkGain, 0.025 + w * 0.018, 0.11, 'bandpass', 1250, 0.75, 0.72)
        burst(inkGain, 0.04 + w * 0.035, 0.075, 'lowpass', 390, 0.8, 0.45)
        tone(now + 0.018, 185, 128, 0.018 + w * 0.016, 0.2, 'triangle')
        return
      }

      if (kind === 'water') {
        // A low pour with two droplets: enough to answer the rising river,
        // nowhere near large enough to become a reward jingle.
        burst(inkGain, 0.055 + w * 0.045, 0.42, 'bandpass', 610, 0.48, 0.62)
        burst(inkGain, 0.022 + w * 0.018, 0.22, 'highpass', 1450, 0.55, 1.25)
        tone(now + 0.08, 510, 205, 0.014 + w * 0.012, 0.2)
        tone(now + 0.2, 430, 176, 0.01 + w * 0.009, 0.17)
        return
      }

      if (kind === 'glass') {
        // Inharmonic partials make a pane, rather than a bell or notification.
        burst(inkGain, 0.016 + w * 0.014, 0.035, 'highpass', 2300, 0.8, 1.8)
        tone(now, 684, 676, 0.014 + w * 0.013, 0.78)
        tone(now + 0.004, 1067, 1042, 0.007 + w * 0.007, 0.64)
        tone(now + 0.009, 1517, 1478, 0.003 + w * 0.004, 0.5)
        return
      }

      if (kind === 'ember') {
        // A coal shifts and opens: low body, then two dry sparks.
        burst(inkGain, 0.045 + w * 0.038, 0.08, 'bandpass', 720, 1.3, 0.75)
        burst(inkGain, 0.025 + w * 0.025, 0.026, 'highpass', 2100, 1.7, 1.9)
        tone(now, 96, 67, 0.015 + w * 0.014, 0.24, 'triangle')
        return
      }

      // Lifting a thought from its thread: fibres, not a UI page-turn sample.
      burst(inkGain, 0.025 + w * 0.018, 0.15, 'bandpass', 980, 0.5, 0.68)
      burst(inkGain, 0.012 + w * 0.01, 0.07, 'highpass', 2600, 0.7, 1.35)
    },

    chip(weight = 0.5) {
      if (!ctx || !grain || !inkGain) return
      const now = ctx.currentTime
      const w = Math.max(0, Math.min(1, weight))

      const click = ctx.createBufferSource()
      click.buffer = grain
      click.playbackRate.value = 2.1 + Math.random() * 1.2

      const edge = ctx.createBiquadFilter()
      edge.type = 'bandpass'
      edge.frequency.value = 2400 + Math.random() * 2200
      edge.Q.value = 1.1 + Math.random() * 1.4

      const clickGain = ctx.createGain()
      const peak = 0.055 + w * 0.045
      clickGain.gain.setValueAtTime(0.0001, now)
      clickGain.gain.exponentialRampToValueAtTime(peak, now + 0.003)
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016)

      click.connect(edge).connect(clickGain).connect(inkGain)
      click.start(now, Math.random() * (NOISE_SECONDS - 0.1), 0.05)
      click.stop(now + 0.06)

      // The stone's own small note. Low enough to feel like weight, short
      // enough that a fast typist never hears two of them overlap into a chord.
      const ring = ctx.createOscillator()
      ring.type = 'triangle'
      const base = 320 + Math.random() * 260 - w * 60
      ring.frequency.setValueAtTime(base, now)
      ring.frequency.exponentialRampToValueAtTime(base * 0.66, now + 0.09)

      const ringGain = ctx.createGain()
      ringGain.gain.setValueAtTime(0.0001, now)
      ringGain.gain.exponentialRampToValueAtTime(0.03 + w * 0.025, now + 0.005)
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)

      ring.connect(ringGain).connect(inkGain)
      ring.start(now)
      ring.stop(now + 0.12)
    },

    synthesisBus(): SynthesisBus | null {
      if (!ctx || !master || !grain) return null
      /*
        A road's soundscape is the *world*, not an effect.

        Rain on the Stormcrown and water under the Moonbreak are the place
        doing something, in the same sense the meadow's wind is — so they
        belong on the same fader as the wind, and turning the car down should
        not take the weather with it.
      */
      return { context: ctx, output: worldBus ?? master, noise: grain, noiseSeconds: NOISE_SECONDS }
    },

    /**
     * The car.
     *
     * Built in `systems/engine`, but *out of this context* — browsers cap how
     * many a page may have, and a second one would need its own gesture to
     * unlock, so on a phone a racer with its own AudioContext is simply
     * silent and there is no way to tell from the code that it will be.
     */
    engine(): EngineVoice | null {
      if (!ctx || !master || !grain) return null
      engines++
      const voice = createEngineVoice(ctx, effectsBus ?? master, grain, NOISE_SECONDS, () => {
        engines = Math.max(0, engines - 1)
      })
      return voice
    },
  }
}

/**
 * The garden has one voice, and everything that makes a sound shares it.
 *
 * Module-level rather than owned by a component, for the same reason the
 * pointer and the slide are: the composer needs to scratch a pen while the
 * Canvas is steering the wind, and threading an audio graph down through React
 * to do that would be absurd. It also means there is exactly one AudioContext
 * — browsers cap them, and a second one would need its own gesture to unlock.
 */
export const ambience = createAmbience()

if (import.meta.env.DEV) {
  const host = globalThis as typeof globalThis & {
    __gardenSoundPlay?: (kind: WorldCue, weight?: number) => void
  }
  // A non-persistent way for browser checks to audition every cue without
  // planting test thoughts, adding fake savings, or uploading fake memories.
  host.__gardenSoundPlay = (kind, weight) => ambience.cue(kind, weight)
}
