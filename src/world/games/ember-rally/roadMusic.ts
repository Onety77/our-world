/**
 * The music a *race* brings with it.
 *
 * ---------------------------------------------------------------------------
 * **It belongs to the race, not to the road.** The first version of this
 * started the track the moment you entered a level and stopped it when you
 * left, which meant it played over the road-choice screen, kept playing after
 * the finish while you read your time, and went on playing while you sat in a
 * menu deciding whether to go again. That is a level soundtrack, and this is
 * not a game with level soundtracks — it is a game with *races*, and a race
 * starts at the green light and ends at the flag.
 *
 * So nothing plays until the lights go out, and everything about how loud it is
 * afterwards is a function of what the car is doing.
 *
 * ---------------------------------------------------------------------------
 * **The volume is the instrument.** There is one number, `want`, and it is the
 * product of a stack of factors that each answer one question:
 *
 *   arrival    how long since the green light. Starts almost silent and takes
 *              its time — the first bars are underneath the engine, not over it
 *   drift      sideways, and the music gets out of the way of the tyres. This
 *              is the one you feel most: the drift is the best sound in the
 *              game and it was being played over
 *   depth      under the water on the Moonbreak. Down *and* muffled, because
 *              the whole road goes quiet down there and a bright track over it
 *              would say the tube was not real
 *   thunder    a close strike owns its moment. Fast down, slow back
 *   ending     the flag, the pause, and the way out — all of them fades
 *
 * They multiply rather than compete, and every one is smoothed toward its
 * target rather than set, so nothing in here can step.
 *
 * ---------------------------------------------------------------------------
 * **Through the graph, with a way out.** The element is routed into the
 * garden's own AudioContext so there can be a filter on it — the underwater
 * muffle is not reachable from `element.volume`, which is a single number. If
 * the context is not up, it falls back to that single number and everything
 * except the muffle still works. A silent road is much worse than a bright one.
 *
 * Files: drop `rootway.mp3` (or `.m4a`) into `./music/`. See its README.
 * ---------------------------------------------------------------------------
 */

import { ambience } from '@/systems/ambience'
import { gainOf, levelsNow, useVolume } from '@/systems/volume'
import type { StageId } from './model'

/*
  Wrapped, because this line does not exist at run time.

  `import.meta.glob` is a *compile-time* instruction to Vite, which replaces the
  whole call with a plain object before the browser ever sees it. Node has no
  such thing, and `npm run rally` reaches this module through `session.ts` —
  where it threw `(intermediate value).glob is not a function` on the import
  line and took the entire car check down with it.

  In the browser the transform happens first, so the `try` wraps an object
  literal and costs nothing. Outside it, an empty manifest is exactly right: a
  headless check of the physics has no speakers and wants no music.
*/
let files: Record<string, string> = {}
try {
  files = import.meta.glob<string>('./music/*.{m4a,mp3}', {
    eager: true,
    query: '?url',
    import: 'default',
  })
} catch {
  /* not a browser build; there is no music here and nothing needs it */
}

/*
  Both formats, and `.mp3` is not a grudging fallback.

  Pixabay hands you an mp3, and every browser and phone ever made plays one. If
  the only accepted extension were `.m4a`, then adding a song to this game would
  begin with installing a command-line video tool — which is a real step, on a
  real evening, between somebody and the thing they wanted to do.

  `.m4a` wins where both exist because AAC is meaningfully better at the same
  bitrate, so converting is worth doing *eventually* and worth nothing *first*.
*/
const bedFor = (stage: StageId) =>
  files[`./music/${stage}.m4a`] ?? files[`./music/${stage}.mp3`] ?? null

const BEDS: Record<StageId, string | null> = {
  rootway: bedFor('rootway'),
  moonbreak: bedFor('moonbreak'),
  stormcrown: bedFor('stormcrown'),
}

// ---------------------------------------------------------------------------
// The shape of it
// ---------------------------------------------------------------------------

/**
 * How long the music takes to arrive, in seconds, and how quiet it starts.
 *
 * Long, and quieter than feels sensible written down. The instruction was to
 * overdo it, and the reason it works is that the first ten seconds of a race
 * are the loudest thing in it — the launch, the revs, the first corner — so
 * music at full from the first metre is not exciting, it is a second thing
 * shouting. Coming up underneath all that and only arriving once the car has
 * settled makes the track feel like it was *caused* by the driving.
 */
const ARRIVAL = 15
const ARRIVAL_FLOOR = 0.06

/** How far down each thing pulls it, and how fast it goes and comes back. */
const DRIFT_DUCK = 0.42
const DRIFT_DOWN = 0.14
const DRIFT_UP = 0.55
const DEPTH_DUCK = 0.5
const THUNDER_DUCK = 0.55

/** The muffle, in hertz — wide open above the water, shut down under it. */
const OPEN_HZ = 20000
const DROWNED_HZ = 620

/** Fades that are not ducks: the flag, a pause, and the way out. */
const PAUSE_FADE = 0.5
const END_FADE = 3.2
const LEAVE_FADE = 0.7

export interface RaceMusicState {
  /** Straight off the session. Nothing plays unless this is `running`. */
  phase: 'off' | 'ready' | 'running' | 'replay' | 'finished'
  paused: boolean
  /** Seconds since the lights went green. Resets when a run restarts. */
  since: number
  /** 0..1 — how sideways. The tyres get the room. */
  drift: number
  /** 0..1 — under the water on the Moonbreak. */
  depth: number
  /** 0..1 — a thunder front landing on the Stormcrown. */
  thunder: number
}

export const roadMusicTelemetry = {
  stage: '' as StageId | '',
  /** What the volume law is asking for, and what it has actually reached. */
  want: 0,
  level: 0,
  /** The muffle, in hertz. */
  tone: OPEN_HZ,
  /** What each duck is asking for, so a mix can be argued about with numbers. */
  drift: 0,
  depth: 0,
  thunder: 0,
  /** True when the road has no file. A valid state, not a fault. */
  silent: true,
  /**
   * Why it is silent, when the reason is not simply "there is no file".
   *
   * A track that will not play is the failure somebody will actually hit —
   * wrong extension, a codec the browser refuses, a file that never finished
   * copying — and the symptom is silence, which is also what success looks
   * like on a road with no music. Without this, "I added the song and nothing
   * happened" has no next step. With it, `__roadMusic.problem` says.
   */
  problem: '',
  /** The file it settled on, and whether the element is really running. */
  source: '',
  sounding: false,
  /** Whether it got the filter, or is falling back to a plain element volume. */
  filtered: false,
}
if (import.meta.env?.DEV) {
  const host = globalThis as typeof globalThis & { __roadMusic?: typeof roadMusicTelemetry }
  host.__roadMusic = roadMusicTelemetry
}

let el: HTMLAudioElement | null = null
let armed: StageId | '' = ''
let watching: (() => void) | null = null

/** The graph, when there is one. */
let source: MediaElementAudioSourceNode | null = null
let gain: GainNode | null = null
let tone: BiquadFilterNode | null = null

/** Smoothed, so nothing in the volume law can step. */
let level = 0
let driftHeld = 0

/**
 * Which start-or-stop is the current one.
 *
 * ---------------------------------------------------------------------------
 * **Because starting and stopping both finish later than they are called, and
 * they can overtake each other.**
 *
 * `open()` lives in an effect in `EmberRally` and `close()` in that effect's
 * cleanup — which is correct, and which under React's StrictMode means every
 * road in development is armed, disarmed and armed again in the space of a few
 * milliseconds. The symptom was `AbortError: The play() request was interrupted
 * by a call to pause()`, and the road came up silent every time.
 *
 * It is not a StrictMode quirk to be worked around — it is a real race that
 * production reaches by pressing "again" while a road is still fading out. So
 * every call takes a number, and a deferred step does nothing unless its number
 * is still the current one. Last call wins.
 * ---------------------------------------------------------------------------
 */
let generation = 0

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

function smoothstep(from: number, to: number, value: number) {
  const at = clamp((value - from) / Math.max(0.0001, to - from))
  return at * at * (3 - 2 * at)
}

/**
 * Put the element on the graph, if there is a graph to put it on.
 *
 * Once an element has a `MediaElementAudioSourceNode` its sound goes *only*
 * through the graph, so this is deliberately all-or-nothing and is only
 * attempted when the context already exists. Failing here is not fatal: the
 * element keeps its own volume and the road loses the muffle, which is a much
 * smaller loss than a road that plays nothing.
 */
function wire(): void {
  if (source !== null || el === null) return
  const out = ambience.musicOut()
  if (out === null) return
  try {
    source = out.context.createMediaElementSource(el)
    tone = out.context.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = OPEN_HZ
    tone.Q.value = 0.4
    gain = out.context.createGain()
    gain.gain.value = 0
    source.connect(tone).connect(gain).connect(out.output)
    // The bus carries the fader now, so the element must not apply it twice.
    el.volume = 1
    roadMusicTelemetry.filtered = true
  } catch {
    source = null
    gain = null
    tone = null
    roadMusicTelemetry.filtered = false
  }
}

/** Where the level actually lands, whichever route it took. */
function apply(): void {
  if (gain !== null) {
    gain.gain.value = level
  } else if (el !== null) {
    el.volume = gainOf(levelsNow().music) * level
  }
  roadMusicTelemetry.level = level
  roadMusicTelemetry.source = el?.getAttribute('src') ?? ''
  roadMusicTelemetry.sounding = el !== null && !el.paused
}

/**
 * Get a road's track ready, without playing a note of it.
 *
 * Called when a road opens. The file starts downloading here so that the green
 * light does not have to wait for it — on a phone in Kano that is the
 * difference between the music arriving with the launch and arriving after the
 * first corner.
 */
export function armRoadMusic(stage: StageId): void {
  const url = BEDS[stage] ?? null
  const mine = ++generation

  roadMusicTelemetry.stage = stage
  roadMusicTelemetry.silent = url === null
  roadMusicTelemetry.problem = ''

  if (url === null) {
    teardown()
    return
  }
  if (armed === stage && el !== null) return

  armed = stage
  if (el === null) {
    el = new Audio()
    el.loop = true
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'
  }
  if (el.getAttribute('src') !== url) {
    el.src = url
    el.load()
  }
  level = 0
  driftHeld = 0
  apply()

  el.onerror = () => {
    if (generation !== mine) return
    const code = el?.error?.code
    roadMusicTelemetry.silent = true
    roadMusicTelemetry.problem =
      `media error ${code ?? '?'}${code === 4 ? ' (the browser will not decode this file)' : ''}`
    if (import.meta.env?.DEV) console.warn('[roadMusic]', stage, roadMusicTelemetry.problem, url)
  }

  watching ??= useVolume.subscribe(apply)
}

/**
 * One frame of the race, turned into one volume.
 *
 * Called from the road's own frame loop, next to everything else that is
 * written once a frame. Allocation-free and safe to call when there is no
 * music: with no file this returns immediately and costs a comparison.
 */
/**
 * How loud the music should be, given a race and a settled drift.
 *
 * ---------------------------------------------------------------------------
 * **Pure, and exported, because it is the most opinionated thing in this file
 * and the only part of it a headless check can reach.** Everything else here is
 * an `<audio>` element and an AudioContext, neither of which exists in Node —
 * so if the law lived inside `setRaceMusic` the one piece of real judgement in
 * the whole module would be the one piece nothing could test. `npm run sound`
 * drives this directly.
 *
 * `held` is the drift envelope, which is stateful and therefore not this
 * function's business: it is passed in.
 * ---------------------------------------------------------------------------
 */
export function musicWant(state: RaceMusicState, held: number): number {
  const racing = state.phase === 'running' || state.phase === 'replay'
  // The flag, a pause, and the way out are all the same instruction — stop —
  // and differ only in how long they are allowed to take.
  if (!racing || state.paused) return 0

  /*
    The arrival: quiet, then slowly and completely.

    Squared on top of the smoothstep so the second half of the climb is the loud
    half, which is what makes it read as the music *arriving* rather than as a
    fader being pushed at a steady rate.
  */
  const arrived = smoothstep(0, ARRIVAL, state.since)
  const arrival = ARRIVAL_FLOOR + (1 - ARRIVAL_FLOOR) * arrived * arrived

  return (
    arrival *
    (1 - DRIFT_DUCK * clamp(held)) *
    (1 - DEPTH_DUCK * clamp(state.depth)) *
    (1 - THUNDER_DUCK * clamp(state.thunder))
  )
}

export function setRaceMusic(state: RaceMusicState, dt: number): void {
  if (el === null || roadMusicTelemetry.silent) return

  const racing = state.phase === 'running' || state.phase === 'replay'
  const step = Math.min(0.1, Math.max(0.0001, dt))

  /*
    The drift duck, held open on the way out.

    Down almost immediately and back over half a second, because a drift is a
    thing you flick into and slide out of: a symmetrical envelope pumps on every
    little correction, and this way the music stays out of the way for as long
    as the car is actually sideways and then returns without a seam.
  */
  const wantDrift = clamp(state.drift)
  const driftRate = wantDrift > driftHeld ? DRIFT_DOWN : DRIFT_UP
  driftHeld += (wantDrift - driftHeld) * (1 - Math.exp(-step / driftRate))

  const want = musicWant(state, driftHeld)

  roadMusicTelemetry.want = want
  roadMusicTelemetry.drift = driftHeld
  roadMusicTelemetry.depth = clamp(state.depth)
  roadMusicTelemetry.thunder = clamp(state.thunder)

  /*
    And then toward it, at a speed chosen by *why* it is moving.

    A duck has to be quick or it has not made room for anything. An ending has
    to be slow or it is a cut. The same law with one time constant would have
    to choose, and would be wrong in one of the two places every time.
  */
  const fall =
    !racing && state.phase === 'finished' ? END_FADE
    : state.paused ? PAUSE_FADE
    : !racing ? LEAVE_FADE
    : 0.18
  const rate = want > level ? (racing && !state.paused ? 0.35 : PAUSE_FADE) : fall
  level += (want - level) * (1 - Math.exp(-step / Math.max(0.02, rate)))
  if (level < 0.0005 && want === 0) level = 0

  /*
    Under the water the whole track goes behind the glass.

    A lowpass rather than only a level: down there the road's own voice loses
    its top too — see `moonbreak.ts` — and music that stayed bright while
    everything around it went dark would be the one thing in the Drowned Mile
    that was not underwater with you.
  */
  if (tone !== null) {
    const shut = clamp(state.depth)
    const hz = OPEN_HZ * Math.pow(DROWNED_HZ / OPEN_HZ, shut)
    tone.frequency.value = hz
    roadMusicTelemetry.tone = hz
  }

  // Playing at all is decided last, off the level, so a fade-out is allowed to
  // finish before the element is stopped.
  if (racing && !state.paused) {
    if (el.paused) start()
  } else if (!el.paused && level <= 0.001) {
    el.pause()
  }

  apply()
}

function start(): void {
  if (el === null) return
  const mine = generation
  wire()
  void el.play().then(() => {
    if (generation !== mine) return
    roadMusicTelemetry.problem = ''
  }).catch((why: unknown) => {
    if (generation !== mine) return
    roadMusicTelemetry.problem = why instanceof Error ? `${why.name}: ${why.message}` : String(why)
    if (import.meta.env?.DEV) console.warn('[roadMusic]', roadMusicTelemetry.problem)
  })
}

/**
 * Put a run back to its beginning without stopping the track.
 *
 * "Again" restarts the race, and the music should climb from nothing with it —
 * but the *file* keeps playing where it was. Cutting back to bar one would tie
 * the track's structure to the start line and make every retry sound like the
 * same eight bars, which is the fastest way to make a piece of music tiresome.
 */
export function restartRaceMusic(): void {
  level = Math.min(level, ARRIVAL_FLOOR)
  driftHeld = 0
  apply()
}

function teardown(): void {
  level = 0
  armed = ''
  if (el !== null) {
    el.pause()
    el.removeAttribute('src')
    el.onerror = null
    el.load()
  }
  try {
    source?.disconnect()
    tone?.disconnect()
    gain?.disconnect()
  } catch {
    /* already gone */
  }
  source = null
  tone = null
  gain = null
  el = null
  watching?.()
  watching = null
  roadMusicTelemetry.stage = ''
  roadMusicTelemetry.level = 0
  roadMusicTelemetry.want = 0
  roadMusicTelemetry.source = ''
  roadMusicTelemetry.sounding = false
  roadMusicTelemetry.filtered = false
  roadMusicTelemetry.tone = OPEN_HZ
}

/**
 * Leaving the road.
 *
 * The fade itself has already happened — `setRaceMusic` takes the level down
 * the moment the phase stops being `running`, so by the time anybody presses
 * "leave the road" the music is usually already gone. This is the tidy-up.
 */
export function stopRoadMusic(): void {
  generation++
  teardown()
}

/** Whether a road has a bed at all. For the checks, and for `/dev7731`. */
export function roadMusicFor(stage: StageId): string | null {
  return BEDS[stage] ?? null
}
