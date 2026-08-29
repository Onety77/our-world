/**
 * Her car, on the road, right now.
 *
 * ---------------------------------------------------------------------------
 * Wheel to wheel began as two people racing the same road at the same moment
 * and seeing nothing of each other. The flag dropped together and then each of
 * you drove alone, which is a time trial with better manners.
 *
 * **There is no server.** Nothing in this garden has one, and a race is not a
 * good enough reason to grow one. What there is instead is presence: a scrap
 * of state each of you writes to the Realtime Database several times a second
 * so the other can see where you are standing. A car is the same question with
 * a different answer in it.
 *
 * **The encoding is the recorder's, not a new one.** `Recorder.push` already
 * turns a car into four integers — across the road, along it, heading, and a
 * packed byte of flags — because that is what a saved run is made of. Using
 * anything else here would mean two descriptions of the same car that could
 * drift apart, and the ghost you chase and the car beside you would slowly
 * stop being the same shape.
 *
 * **Six times a second, and it looks continuous.** `PRESENCE_INTERVAL` is
 * 160ms, so her car arrives in steps of about a metre and a half at speed.
 * `Rolling` is what makes that a car rather than a slideshow: it carries her
 * forward at the speed she was last doing and eases the correction in when the
 * next one lands. She is never *wrong* by more than the length of the step,
 * and she is never seen to jump.
 * ---------------------------------------------------------------------------
 */

import {
  SAMPLE_BOOST,
  SAMPLE_BRAKE,
  SAMPLE_DRIFT,
  SAMPLE_ROUGH,
  SAMPLE_SHORTCUT,
  SAMPLE_SLIDE,
  type RunSample,
} from './model'

/** Longest a `driving` field may be. The database rules refuse more. */
export const DRIVING_MAX = 64

/**
 * Four integers, comma separated, exactly as a recorded sample stores them.
 *
 * `[n * 1000, s * 100, psi * 1000, flags]`. At the far end of the longest road
 * that is about twenty-two characters.
 */
export function writeCar(n: number, s: number, psi: number, state: number): string {
  return [
    Math.round(n * 1000),
    Math.round(s * 100),
    Math.round(psi * 1000),
    state,
  ].join(',')
}

/**
 * Back into a sample, or null.
 *
 * Null for anything that is not four finite numbers, because this arrives over
 * a network from another device that might be running a different build of the
 * game — and a car placed at NaN metres takes the whole frame down with it.
 */
export function readCar(text: string | undefined): RunSample | null {
  if (!text || text.length > DRIVING_MAX) return null
  const parts = text.split(',')
  if (parts.length !== 4) return null
  const [n, s, psi, state] = parts.map(Number)
  if (![n, s, psi, state].every((value) => Number.isFinite(value))) return null
  return {
    n: n / 1000,
    s: s / 100,
    yaw: psi / 1000,
    drift: (state & SAMPLE_DRIFT) / 15,
    boost: (state & SAMPLE_BOOST) !== 0,
    rough: (state & SAMPLE_ROUGH) !== 0,
    braking: (state & SAMPLE_BRAKE) !== 0,
    spinning: (state & SAMPLE_SLIDE) !== 0,
    shortcut: (state & SAMPLE_SHORTCUT) !== 0,
  }
}

/** Below this, two arrivals are the same instant and there is no speed in it. */
const SAME_INSTANT = 16

/** Nothing on this road goes faster than this, in metres per millisecond. */
const FASTEST = 0.09

/** How long a correction takes to be absorbed, in milliseconds. */
const EASE = 130

/** Past this much of a correction backwards, she really did turn round. */
const CAR_LENGTH = 4

/** After this long with nothing from her, stop pretending to know. */
export const LOST_MS = 2600

/**
 * Say it again even if nothing changed, after this long.
 *
 * Comfortably inside `LOST_MS`, because these are the two halves of one rule:
 * a car that is genuinely still — on the grid, or stopped against a rock — is
 * sending the same four numbers for ever, and a sender that deduplicates them
 * for ever is a sender the far end declares lost. Two beats to spare, so one
 * dropped write is not a car blinking out.
 */
export const KEEPALIVE_MS = 900

/**
 * Her car between updates.
 *
 * Two jobs, and they pull against each other. Carrying her forward at her last
 * speed keeps her moving smoothly through the gap, but it is a guess, and by
 * the time the next update lands the guess is wrong by however much she
 * changed her mind. Snapping to each update is always right and visibly steps.
 *
 * So: dead reckon for the position, and ease the error out over about an
 * eighth of a second — long enough that no correction is a jump, short enough
 * that she is never a car's length from where she really is.
 *
 * Along the road only. `n`, the metres across it, is eased without any guess
 * about where it is going: a car crossing the road is doing something
 * deliberate and extrapolating a lane change tends to swing her into the rock.
 */
export class Rolling {
  private latest: RunSample | null = null
  private latestAt = 0
  private speed = 0
  private shown: RunSample | null = null
  private shownAt = 0
  /** How far the car being drawn is ahead of where the truth says she is. */
  private error = 0

  /** A sample as it arrives, stamped with this device's own clock. */
  push(sample: RunSample, at: number) {
    if (this.latest !== null) {
      const gap = at - this.latestAt
      if (gap > SAME_INSTANT) {
        const speed = (sample.s - this.latest.s) / gap
        // Backwards, or impossibly fast, means a restart or a bad packet.
        this.speed = speed >= 0 && speed < FASTEST ? speed : 0
      }
    }

    /*
      Keep the drawn car exactly where it is and move the error instead.

      The new sample is the truth as of now, so anything between it and what is
      on screen is the guess having been wrong. Recording that as an error —
      rather than moving her — is what makes an update invisible: she carries
      on from where she was and the error is eased away underneath her.
    */
    if (this.shown !== null) this.error = this.shown.s - sample.s

    this.latest = sample
    this.latestAt = at
    if (this.shown === null) {
      this.shown = { ...sample }
      this.shownAt = at
      this.error = 0
    }
  }

  /** Where to draw her, or null if she has gone quiet or never arrived. */
  at(now: number): RunSample | null {
    const latest = this.latest
    const shown = this.shown
    if (latest === null || shown === null) return null
    if (now - this.latestAt > LOST_MS) return null

    const dt = Math.max(0, now - this.shownAt)
    this.shownAt = now

    /*
      Truth plus a shrinking error, rather than a position nudged each frame.

      Nudging was the first attempt and it double-counted: a frame arriving a
      whole update after the last one applied a full step of dead reckoning
      *and* a full correction, and put her four metres past where anybody was.
      Written this way there is no accumulation to get wrong — she is always
      exactly the truth plus whatever is left of the last mistake, and that
      leftover halves every ninetieth of a second no matter how the frames
      happen to fall.
    */
    const wanted = latest.s + this.speed * (now - this.latestAt)
    this.error *= Math.exp(-dt / EASE)
    const next = wanted + this.error

    /*
      And she never slides backwards to be corrected.

      Guessing ahead sometimes overshoots — she lifted, or the same packet
      arrived twice — and the honest correction is to pull her back, which on
      screen is a car visibly driving in reverse. Holding her still instead
      reads as a driver who stopped accelerating, which is both nicer to look
      at and, half the time, what actually happened. A real reversal, or the
      start of a new run, puts the truth further back than a car is long, and
      that she follows.
    */
    const reversed = wanted < shown.s - CAR_LENGTH
    if (reversed || next >= shown.s) shown.s = next
    else this.error = shown.s - wanted

    // Across the road, eased and never guessed: a car changing lane is doing
    // something deliberate, and extrapolating that tends to swing her into the
    // rock she was steering around.
    const ease = 1 - Math.exp(-dt / EASE)
    shown.n += (latest.n - shown.n) * ease
    shown.yaw += (latest.yaw - shown.yaw) * ease
    shown.drift += (latest.drift - shown.drift) * ease

    // Flags are what they last were. A brake light that fades on is a lie.
    shown.boost = latest.boost
    shown.rough = latest.rough
    shown.braking = latest.braking
    shown.spinning = latest.spinning
    shown.shortcut = latest.shortcut
    return shown
  }

  /** Between runs, so the next race does not begin where the last one ended. */
  forget() {
    this.latest = null
    this.shown = null
    this.speed = 0
    this.error = 0
  }
}
