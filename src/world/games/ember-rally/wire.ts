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
 * **Sixteen times a second, and it looks continuous.** `RACE_INTERVAL` is
 * 60ms, so her car arrives in steps of about half a metre at speed. `Rolling`
 * is what makes that a car rather than a slideshow — and it does it by
 * drawing her a fraction of a second *behind* the newest thing we have, so
 * that there is always a real sample either side of the moment on screen and
 * nothing ever has to be guessed. See the note on the class.
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
 * Her own clock, stuck on the end.
 *
 * ---------------------------------------------------------------------------
 * How fast she is going has to be worked out from two positions and the time
 * between them, and *which* time that is decides whether her car looks like a
 * car.
 *
 * It used to be the gap between the two arriving here, which is not the gap
 * she drove. Presence goes out every so many milliseconds and comes back over
 * a network shared between Kano and Shanghai: two updates leave 160ms apart
 * and land 40ms apart, then the next one takes 300. Divide real movement by
 * those arrival gaps and the speed swings by a factor of four in either
 * direction — so the car guesses forward far too fast, gets held still while
 * the truth catches up, and then lurches again. Every bit of that reads as a
 * bad connection, and none of it was.
 *
 * She stamps each one with her own elapsed race time instead. Two numbers she
 * wrote, from one clock, with no network in between — so the speed is the
 * speed she was actually doing, however the packets happen to arrive.
 *
 * Appended rather than folded in, and parsed as optional, so a phone still
 * running the older four-field build is understood rather than dropped: it
 * simply falls back to arrival times, which is where this started.
 * ---------------------------------------------------------------------------
 */
export function stamp(car: string, elapsedMs: number): string {
  return car + ',' + Math.max(0, Math.round(elapsedMs))
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
  if (parts.length !== 4 && parts.length !== 5) return null
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

/**
 * Her elapsed race time off the end of a car, or null if it is not carrying one.
 *
 * Read separately rather than hung on the sample, because a `RunSample` is the
 * recorder's shape and a recorded run has no use for the clock of the phone
 * that sent it. See `stamp`.
 */
export function readClock(text: string | undefined): number | null {
  if (!text || text.length > DRIVING_MAX) return null
  const parts = text.split(',')
  if (parts.length !== 5) return null
  const clock = Number(parts[4])
  return Number.isFinite(clock) && clock >= 0 ? clock : null
}

/** Below this, two arrivals are the same instant and there is no speed in it. */
const SAME_INSTANT = 16

/** Nothing on this road goes faster than this, in metres per millisecond. */
const FASTEST = 0.09

/** A dry buffer may predict briefly, then its velocity must ease away. */
const PREDICT_MS = 180

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

/** How much history to keep, in milliseconds of her road. */
const HISTORY_MS = 2600
/** And a hard ceiling on it, so a flood cannot grow the buffer without end. */
const HISTORY_MAX = 48

/** The narrowest and widest the buffer may become, in milliseconds. */
const BEHIND_MIN = 80
const BEHIND_MAX = 320
/** Where it starts, before anything has been measured. */
const BEHIND_START = 130
/** How long the buffer takes to settle on a new width. */
const BEHIND_SETTLE = 2500

/** Past this much catching up to do, crawling there would take all day. */
const SNAP_MS = 1200

/** Her clock going back further than this is a new race, not a late packet. */
const RESTART_MS = 1000

/** The most the playhead may be run fast or slow to keep station, either way. */
const WARP = 0.1
/** How hard it leans on that: milliseconds of lateness per unit of warp. */
const WARP_OVER = 800

/** One arrival, in her timeline and in ours. */
interface Seen {
  /** Her own race clock, where she sends one — see `stamp`. Else arrival. */
  t: number
  /** This device's clock when it landed. What `LOST_MS` is measured against. */
  at: number
  sample: RunSample
  motion: LiveMotion | null
}

/** Motion carried by the direct race stream, in the car's body frame. */
export interface LiveMotion {
  speed: number
  lateral: number
  yawRate: number
  steering: number
}

/** The position plus continuous motion used to pose the live opponent. */
export interface RollingSample extends RunSample {
  /** Road-forward metres per second. */
  speed: number
  /** Across-road metres per second, right positive. */
  lateral: number
  /** Smoothed relative heading rate, radians per second. */
  yawRate: number
  /** Her transmitted front steering angle, radians. */
  steering: number
  /** False for the legacy presence fallback, whose stream has no motion. */
  liveMotion: boolean
}

/**
 * Her car between updates.
 *
 * =============================================================================
 * **She is drawn slightly in the past, and that is the whole idea.**
 *
 * This used to run the other way: take her last known position and carry it
 * *forward* at her last known speed, into a future nobody had reported yet.
 * Which is a guess, and the guess is wrong in exactly the place it matters —
 * constant speed is fine down a straight and wrong at every corner, because
 * the moment she lifts and brakes it keeps shoving her along.
 *
 * Worse was what happened next. Correcting an overshoot means pulling her
 * backwards, and a car visibly driving in reverse looks so wrong that there
 * was a rule against it: hold her still instead, until the truth caught up. So
 * every time she slowed down — which is every corner — her car surged past and
 * then froze. Surge, freeze, surge, once a corner, for the whole race. None of
 * that was the network. It was this file guessing and then hiding the guess.
 *
 * **So: never guess.** Keep the last couple of seconds of her, and draw her at
 * a playhead held a little way behind the newest thing we have. Then there is
 * always a real sample either side of the moment being drawn, and the answer
 * is a curve through two things she actually did. Her transmitted velocity
 * shapes that curve, but a monotonicity bound forbids it from overshooting.
 *
 * **What it costs.** She is on screen roughly a tenth of a second behind where
 * she really is — three metres or so at racing speed. That is the trade, and
 * it is a good one here, because nothing about the *result* is decided by what
 * is on screen: first and second come from the server's timestamps on the two
 * runs. The delay changes the mirror, never the answer.
 *
 * **The buffer sizes itself.** How far behind it has to sit is not a number
 * anybody can pick from here — it depends on how evenly her updates arrive
 * over a link between Kano and Shanghai, and that is different every evening.
 * So it measures: mean arrival gap plus three times the deviation, which on a
 * steady link settles near the floor and widens on its own when the connection
 * is rough. `stats()` reports where it landed.
 *
 * **When it does run dry** — she has genuinely stopped sending — the final
 * velocity bridges only a short gap and then eases toward rest. It cannot
 * blindly carry her through the next unseen corner.
 * =============================================================================
 */
export class Rolling {
  private seen: Seen[] = []
  /** Where in her timeline we are drawing. */
  private playhead = 0
  private running = false
  /** This device's clock at the previous frame, for the playhead's own step. */
  private lastFrame = 0
  /** Only used once the buffer has run dry. */
  private speed = 0
  /** How far behind the newest sample to sit. Measured, not chosen. */
  private behind = BEHIND_START
  /** Arrival gaps, for measuring the above. */
  private gaps: number[] = []
  private dry = 0
  private frames = 0

  /** The car being drawn. One object, rewritten, because this is per frame. */
  private readonly out: RollingSample = {
    n: 0, s: 0, yaw: 0, drift: 0,
    boost: false, rough: false, braking: false, spinning: false, shortcut: false,
    speed: 0, lateral: 0, yawRate: 0, steering: 0, liveMotion: false,
  }

  /**
   * A sample as it arrives, stamped with this device's clock — and, if she
   * sent one, with her own.
   */
  push(
    sample: RunSample,
    at: number,
    clock: number | null = null,
    motion: LiveMotion | null = null,
  ) {
    /*
      Her clock where there is one, ours where there is not.

      A phone still running the four-field build sends no clock, and then
      arrival times are the only timeline available. Interpolating along a
      jittery timeline is still far better than extrapolating along one — the
      jitter becomes a slightly uneven playback rate rather than a car that
      surges and stops.
    */
    const t = clock ?? at
    const newest = this.seen[this.seen.length - 1]
    const clean = cleanMotion(motion)

    // The same instant twice is not news. See the receiver in `Race.tsx`.
    if (newest && t === newest.t) {
      // The compatibility presence can arrive first. Let the direct stream
      // enrich that same position rather than losing steering and velocity.
      if (!newest.motion && clean) {
        newest.motion = clean
        this.speed = roadRates(newest).s
      }
      return
    }

    /*
      Her clock going backwards is one of two quite different things.

      A *long* way back is a new run: a rematch resets her elapsed time to zero
      — see `raceAgain` — and the buffer then describes a road she is no longer
      on, so keeping it would blend the end of the last race into the start of
      this one. The same `Rolling` lives across a rematch, so this has to be
      caught here rather than by anything being rebuilt.

      A *little* way back is a packet that arrived out of turn, or a repeat of
      something already known. There is newer truth in hand either way, so the
      only right thing is to drop it on the floor. Treating that as a restart
      would empty the buffer over a hiccup and put her back to a standstill,
      which is the failure this whole class exists to remove.
    */
    if (newest && t < newest.t) {
      if (newest.t - t < RESTART_MS) return
      this.seen.length = 0
      this.gaps.length = 0
      this.running = false
      this.speed = 0
    } else if (newest) {
      const drove = t - newest.t
      if (drove > SAME_INSTANT) {
        const speed = clean
          ? roadRates({ t, at, sample, motion: clean }).s
          : (sample.s - newest.sample.s) / drove
        // Impossible means a bad packet. Reverse remains a legitimate state.
        this.speed = Math.abs(speed) < FASTEST ? speed : 0
      }
      // Measured on *arrival*, because the buffer exists to cover the network,
      // not her driving. Her clock is even by construction; ours is not.
      this.gaps.push(at - newest.at)
      if (this.gaps.length > 24) this.gaps.shift()
    }

    this.seen.push({ t, at, sample, motion: clean })
    while (
      this.seen.length > 2 &&
      (t - this.seen[0].t > HISTORY_MS || this.seen.length > HISTORY_MAX)
    ) {
      this.seen.shift()
    }
  }

  /** Where to draw her, or null if she has gone quiet or never arrived. */
  at(now: number): RollingSample | null {
    const seen = this.seen
    if (seen.length === 0) return null
    const newest = seen[seen.length - 1]
    if (now - newest.at > LOST_MS) return null
    this.frames++

    // Capped, so a tab coming back from the background does not advance her
    // half a lap in one frame.
    const dt = this.running ? Math.max(0, Math.min(250, now - this.lastFrame)) : 0
    this.lastFrame = now

    this.settle(dt)
    const target = newest.t - this.behind

    if (!this.running) {
      this.playhead = target
      this.running = true
    } else if (target - this.playhead > SNAP_MS) {
      // A long silence has ended. Crawling back into station at ten per cent
      // would take twelve seconds; go straight there and take the one jump.
      this.playhead = target
    } else {
      /*
        Run the playhead fast or slow rather than moving it.

        Keeping station means correcting, and a correction applied to a
        *position* is a jump. Applied to the *rate* it is a car going one part
        in ten faster for a moment, which nobody can see. Deliberately not
        allowed to run backwards: falling behind is fixed by slowing down until
        the world catches up, never by rewinding her.
      */
      const late = target - this.playhead
      const warp = 1 + Math.max(-WARP, Math.min(WARP, late / WARP_OVER))
      this.playhead += dt * warp
    }

    const out = this.out

    /*
      Past everything we hold. This is the only place a guess is left. Its
      distance is bounded, then the last velocity eases toward rest.
    */
    if (this.playhead >= newest.t) {
      this.dry++
      copy(out, newest.sample)
      const ahead = this.playhead - newest.t
      const travel = PREDICT_MS * (1 - Math.exp(-ahead / PREDICT_MS))
      const decay = Math.exp(-ahead / PREDICT_MS)
      const rate = roadRates(newest, this.speed)
      out.s = newest.sample.s + rate.s * travel
      out.n = newest.sample.n + rate.n * travel
      out.yaw = wrapped(newest.sample.yaw + rate.yaw * travel)
      out.speed = rate.s * decay * 1000
      out.lateral = rate.n * decay * 1000
      out.yawRate = rate.yaw * decay * 1000
      out.steering = newest.motion?.steering ?? 0
      out.liveMotion = newest.motion !== null
      return out
    }

    const oldest = seen[0]
    if (this.playhead <= oldest.t) {
      copy(out, oldest.sample)
      describe(out, oldest, this.speed)
      return out
    }

    // The pair either side of the playhead. Walking back from the end, because
    // in the ordinary case it is the last pair and this stops immediately.
    let i = seen.length - 2
    while (i > 0 && seen[i].t > this.playhead) i--
    const a = seen[i]
    const b = seen[i + 1]
    const span = b.t - a.t
    const u = span > 0 ? (this.playhead - a.t) / span : 0

    const fallbackS = span > 0 ? (b.sample.s - a.sample.s) / span : 0
    const fallbackN = span > 0 ? (b.sample.n - a.sample.n) / span : 0
    const fallbackYaw = span > 0 ? shortWay(b.sample.yaw - a.sample.yaw) / span : 0
    const aRate = roadRates(a, fallbackS, fallbackN, fallbackYaw)
    const bRate = roadRates(b, fallbackS, fallbackN, fallbackYaw)
    const along = hermite(a.sample.s, b.sample.s, aRate.s, bRate.s, span, u)
    const across = hermite(a.sample.n, b.sample.n, aRate.n, bRate.n, span, u)
    out.s = along.value
    out.n = across.value
    out.speed = along.rate * 1000
    out.lateral = across.rate * 1000
    out.drift = a.sample.drift + (b.sample.drift - a.sample.drift) * u
    /*
      The short way round.

      `psi` is wrapped into ±π by the physics, so a car spinning through
      straight-backwards steps from about +3.1 to about −3.1 — a tenth of a
      turn. Blended as plain numbers that reads as *minus six radians*, and her
      car whips the whole way round the wrong way. It only shows up in a spin,
      which is the one moment you are certainly watching her.
    */
    const yawEnd = a.sample.yaw + shortWay(b.sample.yaw - a.sample.yaw)
    const turning = hermite(a.sample.yaw, yawEnd, aRate.yaw, bRate.yaw, span, u)
    out.yaw = wrapped(turning.value)
    out.yawRate = turning.rate * 1000
    out.steering = a.motion && b.motion
      ? a.motion.steering + (b.motion.steering - a.motion.steering) * u
      : (u < 0.5 ? a.motion?.steering : b.motion?.steering) ?? 0
    out.liveMotion = a.motion !== null || b.motion !== null

    // Flags belong to whichever sample is nearer. A brake lamp that fades on
    // is a lie, and half a brake lamp is a worse one.
    const near = u < 0.5 ? a.sample : b.sample
    out.boost = near.boost
    out.rough = near.rough
    out.braking = near.braking
    out.spinning = near.spinning
    out.shortcut = near.shortcut
    return out
  }

  /**
   * How far behind to sit, from how unevenly she has been arriving.
   *
   * Mean gap plus three deviations: the mean covers the ordinary wait for the
   * next one, and the deviation covers the late ones. On an even link that
   * lands near the floor; on a rough evening it widens by itself, which is the
   * only honest way to pick a number that depends on somebody else's wifi.
   *
   * Moved slowly, over a couple of seconds. The width is a delay, so changing
   * it moves the playhead's target — and the rate limit above turns even a
   * sudden change into a few seconds of running one per cent slow.
   */
  private settle(dt: number) {
    const gaps = this.gaps
    if (gaps.length >= 4) {
      let sum = 0
      for (const g of gaps) sum += g
      const mean = sum / gaps.length
      let spread = 0
      for (const g of gaps) spread += Math.abs(g - mean)
      const want = Math.max(
        BEHIND_MIN,
        Math.min(BEHIND_MAX, mean + 3 * (spread / gaps.length)),
      )
      this.behind += (want - this.behind) * (1 - Math.exp(-dt / BEHIND_SETTLE))
    }
  }

  /**
   * What the link is actually doing, for `npm run wire` and for the dev handle
   * in `Race.tsx`. Nobody should have to guess at this from a phone.
   */
  stats(): {
    held: number
    behind: number
    gap: number
    jitter: number
    dry: number
    frames: number
    dryPercent: number
  } {
    const gaps = this.gaps
    let mean = 0
    let spread = 0
    if (gaps.length > 0) {
      for (const g of gaps) mean += g
      mean /= gaps.length
      for (const g of gaps) spread += Math.abs(g - mean)
      spread /= gaps.length
    }
    return {
      held: this.seen.length,
      behind: Math.round(this.behind),
      gap: Math.round(mean),
      jitter: Math.round(spread),
      dry: this.dry,
      frames: this.frames,
      dryPercent: this.frames > 0 ? Math.round((this.dry / this.frames) * 1000) / 10 : 0,
    }
  }
}

/** Refuse non-finite or physically absurd motion before it shapes the curve. */
function cleanMotion(motion: LiveMotion | null): LiveMotion | null {
  if (!motion) return null
  const { speed, lateral, yawRate, steering } = motion
  if (![speed, lateral, yawRate, steering].every(Number.isFinite)) return null
  return {
    speed: Math.max(-90, Math.min(90, speed)),
    lateral: Math.max(-45, Math.min(45, lateral)),
    yawRate: Math.max(-20, Math.min(20, yawRate)),
    steering: Math.max(-1.4, Math.min(1.4, steering)),
  }
}

/** Body-frame velocity turned into the road coordinates used by RunSample. */
function roadRates(
  seen: Seen,
  fallbackS = 0,
  fallbackN = 0,
  fallbackYaw = 0,
): { s: number; n: number; yaw: number } {
  const motion = seen.motion
  if (!motion) return { s: fallbackS, n: fallbackN, yaw: fallbackYaw }
  const c = Math.cos(seen.sample.yaw)
  const s = Math.sin(seen.sample.yaw)
  return {
    s: Math.max(-FASTEST, Math.min(FASTEST, (motion.speed * c - motion.lateral * s) / 1000)),
    n: Math.max(-0.045, Math.min(0.045, (motion.speed * s + motion.lateral * c) / 1000)),
    yaw: Math.max(-0.02, Math.min(0.02, motion.yawRate / 1000)),
  }
}

function describe(out: RollingSample, seen: Seen, fallbackS = 0) {
  const rate = roadRates(seen, fallbackS)
  out.speed = rate.s * 1000
  out.lateral = rate.n * 1000
  out.yawRate = rate.yaw * 1000
  out.steering = seen.motion?.steering ?? 0
  out.liveMotion = seen.motion !== null
}

/**
 * Cubic position with monotone endpoint tangents.
 *
 * Raw velocities make acceleration visible, but network quantisation can make
 * one disagree with the distance between its two positions. The circle limit
 * below is the Fritsch-Carlson monotonicity bound: it retains the shape while
 * guaranteeing the curve cannot reverse or overshoot either endpoint.
 */
function hermite(
  from: number,
  to: number,
  fromRate: number,
  toRate: number,
  span: number,
  u: number,
): { value: number; rate: number } {
  if (!(span > 0)) return { value: from, rate: 0 }
  const delta = to - from
  const secant = delta / span
  let a = fromRate
  let b = toRate
  if (Math.abs(secant) < 1e-9) {
    a = 0
    b = 0
  } else {
    if (a / secant < 0) a = 0
    if (b / secant < 0) b = 0
    const alpha = a / secant
    const beta = b / secant
    const length = Math.hypot(alpha, beta)
    if (length > 3) {
      const scale = 3 / length
      a = scale * alpha * secant
      b = scale * beta * secant
    }
  }

  const u2 = u * u
  const u3 = u2 * u
  const value =
    (2 * u3 - 3 * u2 + 1) * from +
    (u3 - 2 * u2 + u) * span * a +
    (-2 * u3 + 3 * u2) * to +
    (u3 - u2) * span * b
  const rate =
    ((6 * u2 - 6 * u) * from + (-6 * u2 + 6 * u) * to) / span +
    (3 * u2 - 4 * u + 1) * a +
    (3 * u2 - 2 * u) * b
  return { value, rate }
}

/** An angle difference brought back into ±π, so a blend takes the short way. */
function shortWay(d: number): number {
  const round = Math.PI * 2
  return d - round * Math.round(d / round)
}

/**
 * And the result put back where the physics keeps it.
 *
 * Blending the short way can land just outside ±π — a hundredth past straight
 * backwards. Left there, the *next* pair starts again from the wrapped value
 * and the drawn angle steps by a whole turn between one segment and the next.
 * On screen a whole turn is nothing, but it is nothing by luck, and anything
 * reading this as a rate rather than an angle would see a car spinning.
 */
function wrapped(a: number): number {
  return shortWay(a)
}

function copy(into: RunSample, from: RunSample) {
  into.n = from.n
  into.s = from.s
  into.yaw = from.yaw
  into.drift = from.drift
  into.boost = from.boost
  into.rough = from.rough
  into.braking = from.braking
  into.spinning = from.spinning
  into.shortcut = from.shortcut
}
