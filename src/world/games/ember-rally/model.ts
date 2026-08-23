/**
 * Ember Rally — what crosses the seam.
 *
 * Everything in here is either written into a round or read back out of one,
 * so it is plain numbers and no three.js. The track itself, the car and the
 * road are built from `seed` on both devices and never stored: a run is only
 * ever a line through a road both of you already have.
 */

/** How often a run is sampled while you drive, milliseconds. */
export const SAMPLE_MS = 100

/**
 * Which road. One for now; the others in the notebook are the Understream,
 * the Moonbreak, the Ember Vault and the Old Garden, and each is a different
 * weighting of the same authored pieces — see `track.ts`.
 */
export type StageId = 'rootway'

export interface RallySetup {
  seed: number
  stage: StageId
}

/**
 * One passage of the road.
 *
 * `path` is four integers per sample and nothing else, because this is written
 * into a document that two phones read across a very long wire:
 *
 *   0  how far off the middle of the road, millimetres, left negative
 *   1  how far along the road, centimetres
 *   2  which way the car was pointing *relative to the road*, milliradians
 *   3  packed state — see `SAMPLE_DRIFT` below
 *
 * The heading matters as much as the position. A ghost reconstructed from
 * position alone slides through the corners perfectly flat, which reads as a
 * marker rather than as somebody driving; hers has to be visibly sideways in
 * the places she was sideways.
 */
export interface RallyRun {
  /**
   * Format.
   *
   * Version 1 stored two numbers a sample and no heading. Version 2 added the
   * heading and the packed state. Neither is read any more, and the rule is
   * the same both times: **a run is only meaningful against the car that drove
   * it.** Version 3 is the four-wheel car, which brakes, locks, spins its
   * wheels and takes a different amount of time over the same road — so a
   * version 2 time is not a time this car can be compared with, and a version
   * 2 ghost would be driving a line the new tyres would not hold.
   *
   * Refusing to read them is the honest option. Silently racing you against a
   * number from a machine that no longer exists is not.
   */
  v: 3
  /** Milliseconds from the fire to the fire. */
  timeMs: number
  path: number[]
  /** How many times the rock caught the car. */
  strikes: number
  /** Seconds held sideways, totalled. Colours a line at the end, nothing else. */
  driftMs: number
}

/**
 * The packed state byte.
 *
 * Bits 0–3: how sideways, 0–15. Then one bit each for the things her car has
 * to *show* you as it goes past — the ember lit, dust off the verge, brake
 * lamps on, rear wheels spinning up. Four bits, and between them they are the
 * difference between a ghost that is a position and a ghost that is somebody
 * driving.
 */
export const SAMPLE_DRIFT = 0b1111
export const SAMPLE_BOOST = 1 << 4
export const SAMPLE_ROUGH = 1 << 5
export const SAMPLE_BRAKE = 1 << 6
export const SAMPLE_SLIDE = 1 << 7

export type RallyMove =
  | { kind: 'qualifying'; run: RallyRun }
  | { kind: 'chase'; run: RallyRun }

export interface RunSample {
  /** Metres off the middle of the road. */
  n: number
  /** Metres along it. */
  s: number
  /** Radians of car heading away from the road's own direction. */
  yaw: number
  /** 0..1, how sideways. Drives the ghost's own smoke and lean. */
  drift: number
  boost: boolean
  rough: boolean
  /** Her brake lamps. */
  braking: boolean
  /** Her rear wheels spinning up. Smoke, and wheels that outrun the road. */
  spinning: boolean
}

const NOWHERE: RunSample = {
  n: 0, s: 0, yaw: 0, drift: 0, boost: false, rough: false,
  braking: false, spinning: false,
}

/** Where a recorded run was at a given moment. Interpolated, never stepped. */
export function runAt(run: RallyRun, elapsedMs: number): RunSample {
  const samples = Math.floor(run.path.length / 4)
  if (samples === 0) return { ...NOWHERE }

  const exact = Math.max(0, elapsedMs / SAMPLE_MS)
  const a = Math.min(samples - 1, Math.floor(exact))
  const b = Math.min(samples - 1, a + 1)
  const mix = a === b ? 0 : exact - Math.floor(exact)

  const at = (i: number, k: number) => run.path[i * 4 + k] ?? 0
  const lerp = (k: number) => at(a, k) * (1 - mix) + at(b, k) * mix

  // Taken from whichever sample is nearer rather than blended: these are flags,
  // and a boost that is 40% on is not a thing that happened.
  const state = at(mix < 0.5 ? a : b, 3)

  return {
    n: lerp(0) / 1000,
    s: lerp(1) / 100,
    yaw: lerp(2) / 1000,
    drift: (state & SAMPLE_DRIFT) / 15,
    boost: (state & SAMPLE_BOOST) !== 0,
    rough: (state & SAMPLE_ROUGH) !== 0,
    braking: (state & SAMPLE_BRAKE) !== 0,
    spinning: (state & SAMPLE_SLIDE) !== 0,
  }
}

/** How long a recorded run lasts, in the units `runAt` wants. */
export function runDurationMs(run: RallyRun): number {
  return Math.max(run.timeMs, (Math.floor(run.path.length / 4) - 1) * SAMPLE_MS)
}

export function isRun(value: unknown): value is RallyRun {
  if (!value || typeof value !== 'object') return false
  const run = value as Partial<RallyRun>
  return (
    run.v === 3 &&
    typeof run.timeMs === 'number' &&
    Number.isFinite(run.timeMs) &&
    run.timeMs > 3_000 &&
    run.timeMs < 300_000 &&
    Array.isArray(run.path) &&
    run.path.length >= 8 &&
    run.path.length <= 16_000 &&
    run.path.length % 4 === 0 &&
    run.path.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    typeof run.strikes === 'number' &&
    Number.isInteger(run.strikes) &&
    run.strikes >= 0 &&
    typeof run.driftMs === 'number' &&
    Number.isFinite(run.driftMs) &&
    run.driftMs >= 0
  )
}

export function moveRun(
  moves: RallyMove[],
  kind: RallyMove['kind'],
  last = false,
): RallyRun | null {
  const found = moves.filter((move) => move?.kind === kind && isRun(move.run))
  return (last ? found.at(-1) : found[0])?.run ?? null
}

/** 1:02.41 — minutes only when there are any. */
export function timeLabel(ms: number): string {
  const total = ms / 1000
  const minutes = Math.floor(total / 60)
  const seconds = total - minutes * 60
  if (minutes === 0) return `${seconds.toFixed(2)}`
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
}

/**
 * A small deterministic generator.
 *
 * The road is built from this on both phones and must come out identical, so
 * nothing anywhere in the track may reach for `Math.random`.
 */
export function random(seed: number): () => number {
  let state = (seed | 0) || 0x6d2b79f5
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let n = state
    n = Math.imul(n ^ (n >>> 15), n | 1)
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61)
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296
  }
}
