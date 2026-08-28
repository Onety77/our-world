/**
 * The soundscapes, driven hard against a stub Web Audio API.
 *
 * `npx tsx scripts/sound-check.ts`
 *
 * ---------------------------------------------------------------------------
 * **There is one bug that matters in these files and this is the harness for
 * it.** `ambience.ts` states it plainly: a non-finite value reaching an
 * AudioParam throws, once, and takes the whole ambient bed down with it. It is
 * a nasty failure because it is silent in every sense — no crash the player
 * sees, no red in the console anybody is looking at, just a world that stopped
 * making noise somewhere around the third corner, on one machine, sometimes.
 *
 * A `NaN` gets in the same way every time: some road quantity is briefly
 * undefined, or zero, or negative, and it multiplies through four terms of a
 * gain expression before it reaches a param. So the check is not "does it
 * sound right" — nothing here can answer that — it is:
 *
 *   every node the voice builds is built without throwing
 *   every value it ever writes to an AudioParam is finite
 *   every gain it writes is in a sane range, so nothing is silently inaudible
 *   or quietly forty times louder than the rest of the mix
 *   stopping it stops everything it started
 *
 * driven across the whole state space rather than at one plausible point,
 * because the values that go non-finite are the ends: stopped, flat out, zero
 * width, fully wet, nothing at all nearby.
 * ---------------------------------------------------------------------------
 */

// --- the stub ---------------------------------------------------------------

interface Written {
  where: string
  value: number
}

const written: Written[] = []
const started = new Set<object>()
const stoppedNodes = new Set<object>()
let nodes = 0

function param(where: string) {
  const check = (value: number) => {
    if (!Number.isFinite(value)) {
      throw new Error(`${where} was written a non-finite value (${value})`)
    }
    written.push({ where, value })
  }
  return {
    _value: 0,
    get value() {
      return this._value
    },
    set value(next: number) {
      check(next)
      this._value = next
    },
    setValueAtTime: (v: number) => check(v),
    setTargetAtTime: (v: number, when: number, tau: number) => {
      check(v)
      if (!Number.isFinite(when) || !Number.isFinite(tau) || tau <= 0) {
        throw new Error(`${where} got a bad ramp (when ${when}, tau ${tau})`)
      }
    },
    linearRampToValueAtTime: (v: number) => check(v),
    exponentialRampToValueAtTime: (v: number) => {
      check(v)
      // The real API throws on zero or negative here, and a gain that has been
      // ramped to exactly 0 is the single most common way to hit it.
      if (v <= 0) throw new Error(`${where} was exponentially ramped to ${v}`)
    },
    cancelScheduledValues: () => {},
  }
}

function node(kind: string, extra: Record<string, unknown> = {}) {
  nodes++
  const self: Record<string, unknown> = {
    kind,
    connect(to: unknown) {
      return to
    },
    disconnect() {},
    start(this: object) {
      started.add(this)
    },
    stop(this: object) {
      stoppedNodes.add(this)
    },
    ...extra,
  }
  return self as never
}

function stubContext(): never {
  let now = 0
  const ctx = {
    sampleRate: 48000,
    get currentTime() {
      // Advances on every read, which is how the real one behaves and is what
      // makes any code that assumes two reads are equal show itself here.
      now += 0.0004
      return now
    },
    createGain: () => node('gain', { gain: param('gain.gain') }),
    createBiquadFilter: () =>
      node('biquad', {
        type: 'lowpass',
        frequency: param('biquad.frequency'),
        Q: param('biquad.Q'),
        gain: param('biquad.gain'),
      }),
    createOscillator: () =>
      node('osc', { type: 'sine', frequency: param('osc.frequency'), detune: param('osc.detune') }),
    createBufferSource: () =>
      node('source', { buffer: null, loop: false, playbackRate: param('source.playbackRate') }),
    createStereoPanner: () => node('panner', { pan: param('panner.pan') }),
    createConvolver: () => node('convolver', { buffer: null, normalize: true }),
    createDelay: () => node('delay', { delayTime: param('delay.delayTime') }),
    createWaveShaper: () => node('shaper', { curve: null, oversample: 'none' }),
    createDynamicsCompressor: () =>
      node('comp', {
        threshold: param('comp.threshold'),
        knee: param('comp.knee'),
        ratio: param('comp.ratio'),
        attack: param('comp.attack'),
        release: param('comp.release'),
      }),
    createBuffer: (channels: number, length: number) => ({
      length,
      numberOfChannels: channels,
      getChannelData: () => new Float32Array(length),
    }),
    createPeriodicWave: () => ({}),
  }
  return ctx as never
}

// `setTimeout` is called by every `stop()` to tear the graph down later. Under
// tsx that would keep the process alive for a second per voice for no reason.
const realTimeout = globalThis.setTimeout
globalThis.setTimeout = ((fn: () => void) => {
  fn()
  return 0
}) as typeof globalThis.setTimeout

// --- what is being driven ---------------------------------------------------

import { createRootwayVoice, type RootwaySoundState } from '../src/systems/rootway'
import { buildField, senseAround, around, forgetAround } from '../src/world/games/ember-rally/around'
import { makeTrack } from '../src/world/games/ember-rally/track'
import { advanceCar, createCar } from '../src/world/games/ember-rally/physics'
import { spiritDriver } from '../src/world/games/ember-rally/spirit'

const ctx = stubContext()
const output = node('gain', { gain: param('out.gain') })
const bus = {
  context: ctx,
  output,
  noise: ctx.createBuffer(2, 48000 * 2),
  noiseSeconds: 2,
} as never

// --- 1. every corner of the state space -------------------------------------

const ENDS = [0, 0.001, 0.5, 0.999, 1]
const SPEEDS = [0, 0.4, 12, 38, 46, 200]

function sweepRootway(): string {
  const voice = createRootwayVoice(bus)
  let calls = 0
  for (const speed of SPEEDS) {
    for (const a of ENDS) {
      for (const b of ENDS) {
        const state: RootwaySoundState = {
          speed,
          tight: a,
          wet: b,
          rough: 1 - a,
          wake: b,
          roots: a,
          lamp: 1 - b,
          fire: a * b,
          water: b,
          scrape: a,
          paused: false,
        }
        voice.set(state)
        voice.set({ ...state, paused: true })
        calls += 2
      }
    }
  }
  // And the events, at both ends of their range.
  for (const force of [0, 0.001, 0.5, 1, 2, -1]) {
    voice.crash(force)
    voice.splash(force)
  }
  voice.stop()
  // Called after stop, which the race can genuinely do on the frame a road is
  // torn down. Must be a no-op rather than a throw into a dead graph.
  voice.crash(0.5)
  voice.set({
    speed: 0, tight: 0, wet: 0, rough: 0, wake: 0,
    roots: 0, lamp: 0, fire: 0, water: 0, scrape: 0, paused: false,
  })
  return `  ${calls} frames · ${nodes} nodes built · ${written.length} param writes · all finite`
}

// --- 2. a real run, so the numbers are the ones the road actually produces ---

/**
 * Driven by the fire-spirit, and it has to be.
 *
 * The first version of this steered on a sine wave at full throttle, which
 * looks like a thorough test and is not one: the car spent the whole time in
 * the rock and covered two hundred and seventy-nine metres in forty-five
 * seconds. The first puddle on the road is at four hundred and thirty-seven,
 * so the water layer reported a peak of exactly zero and the check cheerfully
 * called that a pass. A harness that never reaches the thing it is checking
 * agrees with everything.
 */
function realRun(): string {
  const track = makeTrack(7, 'rootway')
  const car = createCar(track)
  const field = buildField(track)
  const drive = spiritDriver(track, 7 ^ 0x1234)
  const voice = createRootwayVoice(bus)

  const before = written.length
  let events = 0
  let peakRoots = 0
  let peakFire = 0
  let peakWater = 0
  let peakLamp = 0
  let splashes = 0
  let guard = 0
  while (!car.finished && guard++ < 40_000) {
    const input = drive(car, 1 / 120)
    advanceCar(track, car, input, 1 / 120)
    senseAround(track, car, field, true)
    peakRoots = Math.max(peakRoots, around.roots)
    peakFire = Math.max(peakFire, around.fire)
    peakWater = Math.max(peakWater, around.water)
    peakLamp = Math.max(peakLamp, around.lamp)
    for (const event of around.events) if (event.kind === 'splash') splashes++
    events += around.events.length
    around.events.length = 0
    if (guard % 2 === 0) {
      voice.set({
        speed: around.speed,
        tight: around.tight,
        wet: around.wet,
        rough: around.rough,
        wake: around.wake,
        roots: around.roots,
        lamp: around.lamp,
        fire: around.fire,
        water: around.water,
        scrape: around.scrape,
        paused: false,
      })
    }
  }
  voice.stop()
  const reached = Math.round(car.s)
  forgetAround()

  const problems: string[] = []
  // Each of these is a layer that would be permanently silent if the number
  // feeding it never moved, which is the failure this section exists to catch.
  if (peakRoots < 0.2) problems.push('  the roots never made a sound')
  if (peakFire < 0.2) problems.push('  neither hearth was ever heard')
  if (peakLamp < 0.2) problems.push('  no lantern was ever heard')
  if (peakWater < 0.2) problems.push('  no standing water was ever reached')
  if (splashes === 0) problems.push('  the splash can never fire')

  return [
    `  a whole lap, ${reached} m · ${written.length - before} param writes · all finite`,
    `  layers reached: roots ${peakRoots.toFixed(2)} · fire ${peakFire.toFixed(2)} · lamp ${peakLamp.toFixed(2)} · water ${peakWater.toFixed(2)}`,
    `  ${events} events raised (${splashes} of them splashes)`,
    ...problems,
  ].join('\n')
}

// --- 3. nothing is inaudible, and nothing is enormous -----------------------

function levels(): string {
  const gains = written.filter((w) => w.where.endsWith('.gain'))
  let loudest = 0
  let where = ''
  for (const g of gains) {
    if (Math.abs(g.value) > loudest) {
      loudest = Math.abs(g.value)
      where = g.where
    }
  }
  const audible = gains.filter((g) => g.value > 0.004).length
  const problems: string[] = []
  // Every layer is a fraction of one voice in a mix that also has a car in it.
  // Anything approaching unity here is a layer that will bury everything else.
  if (loudest > 1.05) problems.push(`  A gain reached ${loudest.toFixed(2)} at ${where} — that will bury the car`)
  if (audible === 0) problems.push('  Nothing was ever written above 0.004 — the whole place is inaudible')
  return problems.length > 0
    ? problems.join('\n')
    : `  loudest gain written ${loudest.toFixed(3)} (${where}) · ${audible} writes above hearing`
}

// --- 4. it lets go of everything it started ---------------------------------

function cleanup(): string {
  const leaked = [...started].filter((source) => !stoppedNodes.has(source))
  return leaked.length === 0
    ? `  ${started.size} sources started, ${stoppedNodes.size} stopped — nothing left running`
    : `  ${leaked.length} of ${started.size} sources were never stopped`
}

const sections: [string, () => string][] = [
  ['Every corner of the state space', sweepRootway],
  ['A whole lap of real road', realRun],
  ['Levels', levels],
  ['Letting go', cleanup],
]

let failed = false
for (const [name, run] of sections) {
  console.log(`\n${name}`)
  console.log('─'.repeat(Math.max(30, name.length)))
  try {
    console.log(run())
  } catch (error) {
    failed = true
    console.log(`  FAILED: ${(error as Error).message}`)
  }
}
console.log('')
globalThis.setTimeout = realTimeout
process.exit(failed ? 1 : 0)
