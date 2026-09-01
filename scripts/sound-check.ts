/**
 * The roads' soundscapes, driven over real laps against a stub Web Audio API —
 * and the music's volume law, driven directly.
 *
 * ---------------------------------------------------------------------------
 * **The bug this exists to catch is a non-finite value reaching an AudioParam.**
 * It throws exactly once, inside a `useFrame`, and takes the whole ambient bed
 * down with it — no crash on screen, no red in a console anybody is looking at,
 * just a world that stopped making noise somewhere around the third corner, on
 * one machine, sometimes. A `NaN` speed for one frame during a restart is
 * enough to do it, and nothing else in the project would notice.
 *
 * There is no Web Audio in Node, so the stub below is the whole apparatus: it
 * accepts every call the voice makes, records what was asked for, and refuses
 * anything that is not a finite number — including an exponential ramp to zero,
 * which a real browser also throws on and which is the easy mistake to make
 * when a layer should fade out.
 *
 * Three things are checked, and the second is the one that finds real work:
 *
 *   finite      every number handed to every AudioParam, all lap
 *   reached     every gain node built by the voice became audible at some
 *               point. A layer that is wired up, filtered, connected and then
 *               never driven is silent and looks completely correct in source
 *   nothing     `stop()` really stops it. Every looping source ended, and the
 *               output disconnected — otherwise leaving a road and coming back
 *               stacks a second cave on the first
 *
 * The Stormcrown adds the two claims its thunder makes about physics — the
 * flash-to-bang gap is a real distance, and near and far are a range rather
 * than two presets — plus the duck, which is the one thing here that could fail
 * silently and for ever: if its return to 1 were dropped the mountain would get
 * quieter with every strike and nothing on screen would say so.
 *
 * And the music's `musicWant`, which is pure for exactly this reason: it is the
 * only real judgement in `roadMusic` and everything around it is an `<audio>`
 * element and an AudioContext, neither of which exists here.
 *
 *   npm run sound
 * ---------------------------------------------------------------------------
 */

import { createRootwayVoice, rootwaySoundTelemetry } from '../src/systems/rootway'
import { createStormcrownVoice, stormcrownSoundTelemetry } from '../src/systems/stormcrown'
import { musicWant, type RaceMusicState } from '../src/world/games/ember-rally/roadMusic'
import {
  enclosureOf,
  fieldAt,
  fireField,
  rootField,
} from '../src/world/games/ember-rally/tunnel'
import { makeTrack, roadAt, stormAt, vergeWidth } from '../src/world/games/ember-rally/track'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

// ---------------------------------------------------------------------------
// The stub
// ---------------------------------------------------------------------------

/** Every complaint, with enough of a name on it to find the line. */
const bad: string[] = []

function finite(where: string, ...values: number[]) {
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      bad.push(`${where}: ${String(value)}`)
      return false
    }
  }
  return true
}

class Param {
  /** The largest thing ever asked of it. How "reached" is decided. */
  peak = 0
  /** And the smallest, which is how a duck is caught going down. */
  floor = Infinity
  private held = 0
  constructor(readonly name: string) {}

  /*
    An accessor rather than a field, because half the graph is built with plain
    assignment — `dry.gain.value = 1` — and a plain field would let those
    through unrecorded. Which it did: the first run of this check reported the
    dry path and the reverb return as layers that never made a sound.
  */
  get value() {
    return this.held
  }
  set value(next: number) {
    if (finite(`${this.name}.value`, next)) this.saw(next)
  }

  private saw(value: number) {
    this.held = value
    if (value > this.peak) this.peak = value
    if (value < this.floor) this.floor = value
  }
  setValueAtTime(value: number, when: number) {
    if (finite(`${this.name}.setValueAtTime`, value, when)) this.saw(value)
  }
  setTargetAtTime(target: number, when: number, constant: number) {
    if (!finite(`${this.name}.setTargetAtTime`, target, when, constant)) return
    // A real context throws on a non-positive time constant, and a zero one is
    // the plausible typo — `1 - Math.exp(...)` belongs on an ease, not here.
    if (!(constant > 0)) bad.push(`${this.name}.setTargetAtTime: time constant ${constant}`)
    this.saw(target)
  }
  linearRampToValueAtTime(value: number, when: number) {
    if (finite(`${this.name}.linearRampToValueAtTime`, value, when)) this.saw(value)
  }
  exponentialRampToValueAtTime(value: number, when: number) {
    if (!finite(`${this.name}.exponentialRampToValueAtTime`, value, when)) return
    // The classic: a browser throws rather than fading to silence.
    if (value === 0) bad.push(`${this.name}.exponentialRampToValueAtTime: ramped to exactly 0`)
    this.saw(value)
  }
  cancelScheduledValues(when: number) {
    finite(`${this.name}.cancelScheduledValues`, when)
  }
}

let gains: Param[] = []
/** Everything that has to be stopped, and whether it was. */
let sources: { kind: string; started: boolean; stopped: boolean }[] = []
let disconnects = 0

/** Between roads, so one road's graph is never counted against another's. */
function fresh() {
  gains = []
  sources = []
  disconnects = 0
  bad.length = 0
}

class Node {
  constructor(readonly kind: string) {}
  connect(to: Node) {
    return to
  }
  disconnect() {
    disconnects++
  }
}

class SourceNode extends Node {
  private readonly record = { kind: this.kind, started: false, stopped: false }
  constructor(kind: string) {
    super(kind)
    sources.push(this.record)
  }
  start(when = 0, offset = 0, duration = 1) {
    if (!finite(`${this.kind}.start`, when, offset, duration)) return
    if (offset < 0 || duration <= 0) bad.push(`${this.kind}.start: offset ${offset} duration ${duration}`)
    this.record.started = true
  }
  stop(when = 0) {
    if (!finite(`${this.kind}.stop`, when)) return
    if (this.record.stopped) throw new Error('already stopped')
    this.record.stopped = true
  }
}

class StubContext {
  currentTime = 0
  sampleRate = 48000

  private gain(name: string) {
    const p = new Param(name)
    gains.push(p)
    return p
  }

  createGain() {
    return Object.assign(new Node('gain'), { gain: this.gain(`gain#${gains.length}`) })
  }
  createBiquadFilter() {
    return Object.assign(new Node('biquad'), {
      type: 'lowpass',
      frequency: new Param('biquad.frequency'),
      Q: new Param('biquad.Q'),
    })
  }
  createStereoPanner() {
    return Object.assign(new Node('panner'), { pan: new Param('panner.pan') })
  }
  createOscillator() {
    return Object.assign(new SourceNode('oscillator'), {
      type: 'sine',
      frequency: new Param('oscillator.frequency'),
    })
  }
  createBufferSource() {
    return Object.assign(new SourceNode('buffer'), {
      buffer: null as unknown,
      loop: false,
      playbackRate: new Param('buffer.playbackRate'),
    })
  }
  createConvolver() {
    return Object.assign(new Node('convolver'), { buffer: null as unknown })
  }
  createDynamicsCompressor() {
    return Object.assign(new Node('compressor'), {
      threshold: new Param('compressor.threshold'),
      knee: new Param('compressor.knee'),
      ratio: new Param('compressor.ratio'),
      attack: new Param('compressor.attack'),
      release: new Param('compressor.release'),
    })
  }
  createAnalyser() {
    return Object.assign(new Node('analyser'), {
      fftSize: 256,
      smoothingTimeConstant: 0.45,
      // Silence, which is honest: there is no graph behind this and a stub that
      // invented a signal would make the telemetry look like it was working.
      getFloatTimeDomainData(into: Float32Array) {
        into.fill(0)
      },
    })
  }
  createBuffer(channels: number, length: number, rate: number) {
    if (!finite('createBuffer', channels, length, rate)) throw new Error('bad buffer')
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return { length, sampleRate: rate, getChannelData: (i: number) => data[i] }
  }
}

// ---------------------------------------------------------------------------
// A lap
// ---------------------------------------------------------------------------

const ctx = new StubContext()
const noise = ctx.createBuffer(1, ctx.sampleRate * 19, ctx.sampleRate)

console.log('\nthe Rootway, heard\n')

const voice = createRootwayVoice({
  context: ctx as unknown as AudioContext,
  output: new Node('destination') as unknown as AudioNode,
  noise: noise as unknown as AudioBuffer,
  noiseSeconds: 19,
})

const track = makeTrack(7, 'rootway')
const DELTA = 1 / 60

/*
  Driven off the road's own arrays rather than through the physics.

  The tyre model is checked to death by `npm run rally`; what is being proved
  here is that a *lap-shaped* sweep of inputs never produces a value the audio
  graph rejects. Forty metres a second on the straights and slower in the tight
  sections is close enough to a real run for that, and it visits every band on
  the road, which is the part that matters.
*/
const fire = fireField(track)
const roots = rootField(track)

let s = track.start
let enclosed = 0
let ceiling = 5.6
let wet = 0
let frames = 0
/* What the two dressing fields actually reach over a lap, so a layer that is
   pinned at the top or never leaves the floor is visible rather than merely
   present. Both were wrong once: the lanterns summed past 1 and stayed there. */
let firePinned = 0
let fireHigh = 0
let rootsPinned = 0
let rootsHigh = 0
let rootsSum = 0

while (s < track.finishAt) {
  const road = roadAt(track, Math.min(track.length - 1, s + 12))
  const want = enclosureOf(road.ceiling, road.width + vergeWidth(road.room))
  const ease = 1 - Math.exp(-4.5 * DELTA)
  enclosed += (want - enclosed) * ease
  ceiling += (road.ceiling - ceiling) * ease
  wet += (road.wet - wet) * ease

  // Slower where it is tight, which is both realistic and the case that keeps
  // the voice in its high-enclosure range long enough to schedule events there.
  const speed = 14 + (1 - enclosed) * 26
  s += speed * DELTA
  ctx.currentTime += DELTA
  frames++

  // The real lantern and root layout for this seed, read exactly as the bridge
  // reads it — which is the reason both fields live in `tunnel.ts` rather than
  // in the component.
  const atFire = Math.min(1, fieldAt(fire, s))
  const atRoots = Math.min(1, fieldAt(roots, s))
  if (atFire >= 0.999) firePinned++
  if (atRoots >= 0.999) rootsPinned++
  fireHigh = Math.max(fireHigh, atFire)
  rootsHigh = Math.max(rootsHigh, atRoots)
  rootsSum += atRoots

  voice.set({ speed, s, enclosed, ceiling, wet, fire: atFire, roots: atRoots, paused: false })
}

ok(`a whole lap ran — ${frames} frames, ${Math.round(s)} m`, frames > 600 && s >= track.finishAt)

// ---------------------------------------------------------------------------
// What the lap proved
// ---------------------------------------------------------------------------

console.log('\nfinite\n')
ok(
  'every value reaching an AudioParam was a finite number',
  bad.length === 0,
  bad.slice(0, 6).join('\n          ') + (bad.length > 6 ? `\n          …and ${bad.length - 6} more` : ''),
)

console.log('\nreached\n')
const silent = gains.filter((g) => g.peak <= 0.0002)
ok(
  `all ${gains.length} gains became audible at some point in the lap`,
  silent.length === 0,
  silent.map((g) => `${g.name} never rose above ${g.peak}`).join('\n          '),
)

/*
  And the events, which no amount of AudioParam checking would notice: a drip
  schedule gated behind a threshold nothing on the road ever crosses is a layer
  that is wired, finite, connected and completely inaudible.
*/
/*
  Twelve, and it is deliberately nowhere near the real number.

  The drip schedule is randomised — that is the whole point of it, a roof that
  drips on a timer is a tap — so the count over a lap is a distribution rather
  than a value. Measured over twelve laps it runs 28 to 38. The first threshold
  written here was `> 30`, which sat in the middle of that and failed about one
  run in three; a check that cries wolf is worse than no check, because the
  habit it teaches is running it again.

  What this is actually asking is "did the drips happen at all" — a gate behind
  a `wet` threshold nothing on the road crosses, or a schedule that never comes
  due, both give zero. Twelve is far below anything a working layer produces and
  far above anything a broken one does.
*/
ok(
  `water came off the roof — ${rootwaySoundTelemetry.drips} drips`,
  rootwaySoundTelemetry.drips > 12,
)
ok(
  `the road opened and closed — ${rootwaySoundTelemetry.mouths} thresholds`,
  rootwaySoundTelemetry.mouths > 3,
)
/*
  And the two dressing fields, which are the ones that pin.

  A field that spends most of a lap clamped at 1 has stopped being a field: it
  cannot say that this corner is brighter than that one, and it leaves the two
  real hearths nothing to be louder than. Measured in a browser before it was
  measured here — the lanterns sat at full for about half the road.
*/
const pinned = firePinned / frames
ok(
  `the fire has somewhere to go — peaks at ${fireHigh.toFixed(2)}, pinned for ${(pinned * 100).toFixed(0)}% of the lap`,
  fireHigh > 0.9 && pinned < 0.08,
)
ok(
  `and the roots do too — mean ${(rootsSum / frames).toFixed(2)}, peaks at ${rootsHigh.toFixed(2)}, pinned for ${((rootsPinned / frames) * 100).toFixed(0)}%`,
  rootsHigh > 0.4 && rootsPinned / frames < 0.05 && rootsSum / frames < 0.6,
)

console.log('\nnothing left running\n')

// A pause has to be survivable: it is the one state the voice sits in for
// minutes at a time, and it must not schedule its way through it.
const beforePause = bad.length
for (let i = 0; i < 120; i++) {
  ctx.currentTime += DELTA
  voice.set({ speed: 0, s, enclosed, ceiling, wet, fire: 0.5, roots: 0.5, paused: true })
}
ok('two seconds paused on the road changed nothing', bad.length === beforePause)

voice.stop()
const before = sources.filter((x) => x.started && !x.stopped).length
await new Promise((resolve) => setTimeout(resolve, 1000))
const running = sources.filter((x) => x.started && !x.stopped)

ok(
  `every looping source was stopped — ${sources.length} built, ${before} still running at stop()`,
  running.length === 0,
  running.map((x) => x.kind).join(', '),
)
ok('the output was disconnected', disconnects >= 2)
ok('stop() twice is not an error', (() => {
  try {
    voice.stop()
    return true
  } catch {
    return false
  }
})())

// ---------------------------------------------------------------------------
// And the mountain
// ---------------------------------------------------------------------------

/*
  The Stormcrown gets the same three questions, plus the ones only it raises.

  Its thunder schedules dozens of nodes *into the future* off one call — a
  crack, a clap, a falling tone and five to nine peals, spread over as much as
  fifteen seconds when the stroke is distant. That is the largest amount of
  deferred work anywhere in the garden's audio, and it is all driven by
  `Math.random()`, so "it sounded fine when I tried it" is not evidence about
  the case where four of the random numbers land at one end of their range.
*/
fresh()
console.log('\nthe Stormcrown, heard\n')

const stormCtx = new StubContext()
const stormNoise = stormCtx.createBuffer(1, stormCtx.sampleRate * 19, stormCtx.sampleRate)
const stormVoice = createStormcrownVoice({
  context: stormCtx as unknown as AudioContext,
  output: new Node('destination') as unknown as AudioNode,
  noise: stormNoise as unknown as AudioBuffer,
  noiseSeconds: 19,
})

const mountain = makeTrack(7, 'stormcrown')
let ms = mountain.start
let stormFrames = 0
let strokes = 0
const gaps: number[] = []

/*
  The whole climb, with the weather worked out the way `Race.tsx` does it —
  off the height of the road — so rain, cloud and clear air all really happen
  rather than being swept through as three numbers.
*/
while (ms < mountain.finishAt) {
  const at = stormAt(mountain, Math.min(mountain.length - 1, ms + 20))
  const rain = Math.max(0, Math.min(1, (0.62 + at.inCloud * 0.38) * (1 - at.above)))
  const speed = 18 + (1 - at.above) * 20
  ms += speed * DELTA
  stormCtx.currentTime += DELTA
  stormFrames++

  stormVoice.set({
    speed, s: ms, rain, inCloud: at.inCloud, above: at.above,
    forest: Math.max(0, 1 - at.above * 2), exposed: at.above * 0.7,
    stair: 0.3, eye: 0, stormfall: 0, waterfall: 0.4, waterfallPan: 0,
    paused: false,
  })

  /*
    A stroke every couple of seconds — far more often than the road deals them,
    on purpose. This is the one place the rare event should be common, because
    a check that fires thunder twice has tested two draws out of a distribution
    with nine random numbers in it.
  */
  if (stormFrames % 120 === 0) {
    const remoteness = (strokes % 7) / 6
    stormVoice.lightning(0.55 + (strokes % 3) * 0.2, remoteness, remoteness > 0.6)
    gaps.push(stormcrownSoundTelemetry.gap)
    strokes++
  }
  if (stormFrames % 400 === 0) stormVoice.rod(0.6, 0.4)
}

ok(`the whole climb ran — ${stormFrames} frames, ${(ms / 1000).toFixed(2)} km`,
  stormFrames > 3000 && ms >= mountain.finishAt)
ok(`and it was struck ${strokes} times`, strokes > 20)

console.log('\nfinite\n')
ok(
  'every value reaching an AudioParam was a finite number',
  bad.length === 0,
  bad.slice(0, 6).join('\n          ') + (bad.length > 6 ? `\n          …and ${bad.length - 6} more` : ''),
)

console.log('\nthunder\n')

/*
  The gap *is* the distance, and getting it wrong is the failure this road had.

  The version before this capped the flash-to-bang at 1.2 s, which put every
  stroke inside four hundred metres and made climbing out of the storm mean
  nothing. Near strokes must still be near, far ones must be genuinely far, and
  the two must not have collapsed into one number.
*/
const near = Math.min(...gaps)
const distant = Math.max(...gaps)
ok(`a close stroke cracks almost at once — ${near.toFixed(2)} s`, near < 0.75 && near > 0.2)
ok(`a distant one keeps you waiting — ${distant.toFixed(1)} s`, distant > 4 && distant < 12)
ok(`and the two are a real range, not a preset — ${(distant / near).toFixed(1)}×`, distant / near > 6)

/*
  The duck, which is the one thing here that can fail *silently and
  permanently*: if the return to 1 were ever dropped, the mountain would simply
  get quieter with every strike and never come back, and nothing else in this
  file would notice.
*/
const weatherBus = gains.find((g) => g.floor < 0.99 && g.floor > 0.4 && g.peak === 1)
ok(
  weatherBus
    ? `the weather ducks under a close strike — down to ${weatherBus.floor.toFixed(2)}`
    : 'the weather ducks under a close strike',
  weatherBus !== undefined,
)
ok(
  'and it comes back up again afterwards',
  weatherBus !== undefined && weatherBus.value === 1,
  weatherBus ? `left at ${weatherBus.value}` : '',
)

console.log('\nreached\n')
const stormSilent = gains.filter((g) => g.peak <= 0.0002)
ok(
  `all ${gains.length} gains became audible at some point`,
  stormSilent.length === 0,
  stormSilent.map((g) => `${g.name} never rose above ${g.peak}`).join('\n          '),
)

console.log('\nnothing left running\n')
const stormBeforePause = bad.length
for (let i = 0; i < 120; i++) {
  stormCtx.currentTime += DELTA
  stormVoice.set({
    speed: 0, s: ms, rain: 0.8, inCloud: 0.5, above: 0.2, forest: 0.3, exposed: 0.3,
    stair: 0, eye: 0, stormfall: 0, waterfall: 0, waterfallPan: 0, paused: true,
  })
}
ok('two seconds paused on the mountain changed nothing', bad.length === stormBeforePause)

stormVoice.stop()
await new Promise((resolve) => setTimeout(resolve, 1100))
const stormRunning = sources.filter((x) => x.started && !x.stopped)
ok(
  `every looping source was stopped — ${sources.length} built`,
  stormRunning.length === 0,
  stormRunning.map((x) => x.kind).join(', '),
)
ok('the output was disconnected', disconnects >= 2)

// ---------------------------------------------------------------------------
// And the music, which belongs to the race
// ---------------------------------------------------------------------------

/*
  `musicWant` is the only real judgement in `roadMusic`, and until it was pulled
  out it was also the only part nothing could reach: everything around it is an
  `<audio>` element and an AudioContext, and Node has neither.

  What is being checked is the *shape* rather than any particular number — that
  the thing is silent when it should be silent, that it arrives rather than
  appears, and that each of the three ducks actually pulls. The numbers
  themselves are a mix decision and belong in the file, not here.
*/
console.log('\nthe music, which belongs to the race\n')

const race = (over: Partial<RaceMusicState> = {}): RaceMusicState => ({
  phase: 'running', paused: false, since: 60, drift: 0, depth: 0, thunder: 0, ...over,
})

ok('silent before the green light', musicWant(race({ phase: 'ready' }), 0) === 0)
ok('silent at the flag', musicWant(race({ phase: 'finished' }), 0) === 0)
ok('silent off the road', musicWant(race({ phase: 'off' }), 0) === 0)
ok('silent while paused', musicWant(race({ paused: true }), 0) === 0)
ok('and a replay gets the music too', musicWant(race({ phase: 'replay' }), 0) > 0.5)

const opening = musicWant(race({ since: 0 }), 0)
const settled = musicWant(race({ since: 60 }), 0)
ok(`it starts almost silent — ${opening.toFixed(3)}`, opening > 0 && opening < 0.1)
ok(`and arrives completely — ${settled.toFixed(3)}`, settled > 0.98)

/*
  And that the climb is *slow at first*, which is the whole instruction. A
  linear fade would be at half by halfway; this must be well under that or the
  music is simply being turned up rather than arriving.
*/
const halfway = musicWant(race({ since: 7.5 }), 0)
ok(`half way through the arrival it is only at ${(halfway * 100).toFixed(0)}%`,
  halfway > 0.1 && halfway < 0.35)

let climbing = true
let last = -1
for (let t = 0; t <= 30; t += 0.5) {
  const now = musicWant(race({ since: t }), 0)
  if (now < last - 1e-9) climbing = false
  last = now
}
ok('and it never goes backwards on the way up', climbing)

for (const [what, state] of [
  ['a drift', race()],
  ['the water', race({ depth: 1 })],
  ['thunder', race({ thunder: 1 })],
] as const) {
  const quiet = what === 'a drift'
    ? musicWant(state, 1)
    : musicWant(state, 0)
  const loud = musicWant(race(), 0)
  ok(
    `${what} pulls it down — ${loud.toFixed(2)} to ${quiet.toFixed(2)}`,
    quiet < loud * 0.75 && quiet > 0,
  )
}

/*
  Nothing may leave 0..1, and nothing may be NaN. The ducks multiply, so three
  at once is the case that would go negative if any of them were ever allowed
  over 1 — and three at once is a real moment: sideways, underwater, in a storm.
*/
let strayed = ''
for (const since of [0, 3, 15, 90]) {
  for (const d of [0, 0.5, 1, 2, -1]) {
    for (const w of [0, 0.5, 1, 2, -1]) {
      for (const th of [0, 0.5, 1, 2, -1]) {
        const v = musicWant(race({ since, depth: w, thunder: th }), d)
        if (!Number.isFinite(v) || v < 0 || v > 1) strayed ||= `since ${since} drift ${d} depth ${w} thunder ${th} -> ${v}`
      }
    }
  }
}
ok('and every combination stays a real number between 0 and 1', strayed === '', strayed)

console.log(failed === 0 ? '\nall good\n' : `\n${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
