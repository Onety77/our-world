/**
 * The fire-spirit — who you race when there is nobody to race.
 *
 * It is not an opponent AI in the sense of something trying to win. It is a
 * driver: it reads the road ahead, decides where it wants the car to be, and
 * then has to get it there through exactly the same tyres and the same
 * braking distance you do. It brakes too late sometimes. It runs wide out of
 * hairpins. It clips the odd stone.
 *
 * That matters more than it sounds. A ghost drawn along a formula moves like a
 * marker being dragged; a ghost that had to *drive* moves like somebody, and
 * because it is running the same physics, every mistake it makes is a mistake
 * you could have made. The garden has no opponent — only a small fire that
 * knows the way.
 *
 * The whole run is simulated before you have seen the road: forty-five seconds
 * of racing at a hundred and twenty steps a second is about five thousand
 * iterations, which is a couple of milliseconds.
 */

import { random, type RallyRun } from './model'
import {
  BOOST_COST,
  Recorder,
  advanceCar,
  createCar,
  slipOf,
  speedOf,
  type CarInput,
  type CarState,
} from './physics'
import { roadAt, type Track } from './track'

interface Brain {
  /** How hard it is willing to lean on the tyres. Sets its corner speeds. */
  bravery: number
  /** How far ahead it looks, as a multiple of speed. */
  vision: number
  /** How sloppily it holds the line. */
  drift: number
  /** Where in the road it likes to sit, as a fraction of the half-width. */
  bias: number
  rng: () => number
  /** Corners it has decided to get wrong, by index. */
  slips: Set<number>
  boostCooldown: number
  /** Seconds of brake still owed, so it does not flicker. */
  brakeHold: number
  /** Seconds of handbrake still owed, for the same reason. */
  yankHold: number
}

function makeBrain(seed: number, skill: number): Brain {
  const rng = random(seed ^ 0x3ab17f)
  const slips = new Set<number>()
  // Two or three moments of carelessness per run, chosen up front so the run
  // is reproducible from the seed like everything else here.
  const count = 2 + Math.floor(rng() * 2)
  for (let i = 0; i < count; i++) slips.add(Math.floor(rng() * 40))
  return {
    bravery: 10.4 + skill * 2.8 + rng() * 0.8,
    vision: 0.52 + rng() * 0.16,
    drift: 0.5 - skill * 0.3 + rng() * 0.2,
    bias: (rng() * 2 - 1) * 0.16,
    rng,
    slips,
    boostCooldown: 0,
    brakeHold: 0,
    yankHold: 0,
  }
}

/**
 * What the spirit does with the car this instant.
 *
 * Pure pursuit for the steering — aim at a point on the racing line some
 * distance ahead and turn toward it — plus a look down the road for anything
 * it will not make at this speed.
 */
function think(track: Track, car: CarState, brain: Brain, dt: number): CarInput {
  const v = speedOf(car)
  const scan = roadAt(track, car.s)

  // --- where it wants to be ------------------------------------------------
  const ahead = 7 + v * brain.vision
  const target = roadAt(track, car.s + ahead)
  const wobble =
    Math.sin(car.s * 0.031 + brain.bias * 20) * brain.drift * 0.55 +
    Math.sin(car.s * 0.0117) * brain.drift * 0.35
  const wantN = target.line + brain.bias * target.width + wobble

  const toward = Math.atan2(wantN - car.n, Math.max(4, ahead)) - car.psi
  const steer = Math.max(
    -1,
    Math.min(1, toward * 2.7 + target.curv * 26 - car.yaw * 0.22),
  )

  // --- whether it is going to make the next corner -------------------------
  // The classic look-ahead brake: for every point down the road, work out the
  // fastest it could be going there, then whether it can still shed the
  // difference in the distance remaining.
  let brake = false
  const corner = Math.floor(car.s / 40)
  const bravery = brain.slips.has(corner % 40) ? brain.bravery * 0.62 : brain.bravery
  for (let d = 14; d < 120; d += 6) {
    const at = roadAt(track, car.s + d)
    const kappa = Math.abs(at.curv)
    if (kappa < 0.004) continue
    const limit = Math.sqrt(bravery / kappa)
    if (limit >= v) continue
    const needed = (v * v - limit * limit) / (2 * d)
    if (needed > 6.6) {
      brake = true
      break
    }
  }
  /*
    Trail-braking, which is most of why it has any character at all.

    Braking only in a straight line is quicker on paper and reads as a machine.
    A driver stays on the brake past the turn-in to rotate the car, and that is
    where the back steps out, where the dust comes off the inside wheel and
    where a ghost stops looking like a marker being dragged along a line.
  */
  const tight = Math.abs(scan.curv) > 0.017
  if (tight && v > Math.sqrt(bravery / Math.max(0.004, Math.abs(scan.curv))) * 0.88) {
    brake = true
  }
  // Committed: a brake that flickers on and off every step is a brake that
  // never shifts any weight.
  if (brake) brain.brakeHold = 0.3
  else if (brain.brakeHold > 0) {
    brain.brakeHold -= dt
    brake = true
  }

  // Already as sideways as it can hold — adding more only scrubs speed off.
  if (brake && Math.abs(car.psi) > 0.62 && Math.abs(steer) < 0.25) brake = false

  /*
    --- the handbrake -------------------------------------------------------

    Only where a driver would actually reach for it: a corner too tight to take
    on the brakes alone, at a speed where locking the rears will rotate the car
    rather than just stop it, and not once the back is already out. Held for a
    beat after it is decided, because a handbrake flicked on and off every
    hundredth of a second locks nothing.

    This is what makes her ghost worth watching. The spirit is running exactly
    the tyres you are, so when she comes into a hairpin sideways and gathers it
    up, that is not an animation — she really did have to catch it.
  */
  const slip = Math.abs(slipOf(car))
  const hairpin = Math.abs(scan.curv) > 0.031
  if (
    hairpin &&
    brake &&
    v > 14 &&
    slip < 0.3 &&
    Math.abs(steer) > 0.45 &&
    brain.rng() < 0.35
  ) {
    brain.yankHold = 0.34
  }
  const handbrake = brain.yankHold > 0
  if (brain.yankHold > 0) brain.yankHold -= dt

  // --- the ember -----------------------------------------------------------
  brain.boostCooldown = Math.max(0, brain.boostCooldown - dt)
  let boost = false
  if (!brake && car.ember >= BOOST_COST + 0.08 && brain.boostCooldown === 0 && v > 22) {
    // Only where it can use it: a hundred metres of nothing much ahead.
    let clear = true
    for (let d = 10; d < 95; d += 10) {
      if (Math.abs(roadAt(track, car.s + d).curv) > 0.011) {
        clear = false
        break
      }
    }
    if (clear) {
      boost = true
      brain.boostCooldown = 2.4
    }
  }

  /*
    --- the right foot ------------------------------------------------------

    The car has a throttle now, so the spirit has to use one. It is not simply
    "on unless braking": that would drive every corner at full power and be
    exactly the flat-out car this round was spent getting rid of.

    Three states, which is what a driver actually has. Hard on the brakes.
    Coasting, for the moment between releasing them and picking the throttle up
    again — this is where a real driver lets the car rotate, and it is why the
    ghost's line looks like somebody thinking. And back on the power, fed in
    rather than switched on, so that the exit of a corner is a thing that
    happens over a second instead of instantly.
  */
  let throttle = 0
  if (!brake) {
    const corner = Math.abs(scan.curv)
    // How fast it could go here if it were already settled.
    const here = Math.sqrt(bravery / Math.max(0.004, corner))
    if (v < here * 0.94) {
      // Feed it in with the corner opening rather than stamping on it.
      throttle = Math.min(1, 0.35 + (here - v) / 6)
    } else {
      // At the limit for this radius: hold it there, do not add to it.
      throttle = 0.25
    }
  }
  // Off the power entirely for a beat after the brakes come off, which is the
  // rotation. Without it the ghost drives every corner like a train.
  if (brain.brakeHold > 0.02 && !brake) throttle = 0

  return { steer, throttle, brake: brake ? 1 : 0, handbrake, boost }
}

/**
 * A driver you can hand a car to.
 *
 * Used twice: once to simulate the fire-spirit's whole run before you have
 * seen the road, and once by `?rally=ride`, which lets it drive *your* car so
 * the tunnel can be looked at end to end without anybody having to be good at
 * the game. The second is the same argument as `?hour=` and `?section=` in the
 * garden — a check nobody can repeat is not a check.
 */
export function spiritDriver(track: Track, seed: number, skill = 0.55) {
  const brain = makeBrain(seed, skill)
  return (car: CarState, dt: number): CarInput => think(track, car, brain, dt)
}

/**
 * Drive a whole run and write it down.
 *
 * `skill` runs 0 to 1. It is deliberately not exposed anywhere in the game
 * yet: the spirit is a companion, not a difficulty setting, and the moment
 * there is a slider for it the thing stops being a small fire that knows the
 * road.
 */
export function driveSpirit(track: Track, seed: number, skill = 0.55): RallyRun {
  const car = createCar(track)
  const brain = makeBrain(seed, skill)
  const recorder = new Recorder()
  const dt = 1 / 120

  // From rest, like you. It used to be handed sixteen metres a second off the
  // line "because it is already rolling", which is a head start of about a
  // second and a half and nobody would ever have known where it came from.
  let guard = 0
  while (!car.finished && guard++ < 24_000) {
    const input = think(track, car, brain, dt)
    advanceCar(track, car, input, dt)
    recorder.sample(car)
  }
  return recorder.finish(car)
}
