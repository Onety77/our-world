/**
 * Does moving a dial actually reach the car?
 *
 * ---------------------------------------------------------------------------
 * The failure this exists to catch is a quiet one and there is no other way to
 * see it. Every dial is wired by hand — a constant lifted out of `physics.ts`,
 * a name changed at three or four call sites — and a dial that was lifted but
 * never re-pointed still *renders*. It has a slider, a value, a note; it moves
 * when you drag it; and the car does absolutely nothing, forever. Somebody
 * would eventually spend an evening deciding the brakes felt wrong because the
 * brake dial appeared not to work.
 *
 * So: for every dial, drive the car twice — once as the code has it, once with
 * that one dial moved — and insist something measurably changed. It does not
 * check that the change is *correct*; that is what driving it is for. It
 * checks that the wire is connected.
 * ---------------------------------------------------------------------------
 *
 * Run with `npm run tuning`.
 */

import {
  DEFAULTS,
  DIALS,
  TUNE,
  useRallyTuning,
  type Dial,
  type RallyTuning,
} from '../src/world/games/ember-rally/tuning'
import {
  advanceCar,
  createCar,
  slipOf,
  speedOf,
  type CarInput,
} from '../src/world/games/ember-rally/physics'
import { makeTrack } from '../src/world/games/ember-rally/track'
import { spiritDriver } from '../src/world/games/ember-rally/spirit'

const track = makeTrack(1, 'rootway')

/**
 * Two places to try each dial, one either side of where it sits.
 *
 * Both directions, because several of these are *ceilings* rather than
 * controls — drift hold is the clearest: it is the most cornering force a
 * drift may pull, it is set above what the car normally asks for, and raising
 * it therefore changes nothing whatsoever. Probing upward alone reported it
 * dead, which it is not. A dial is connected if it does something in either
 * direction.
 */
function probeValues(dial: Dial): number[] {
  // The true ends of the travel, not part of the way. A ceiling that only
  // binds in the last tenth of its range is still a working dial, and a probe
  // that stops short of it reports a working dial as dead.
  const now = DEFAULTS[dial.key]
  return [dial.max, dial.min].filter((value) => Math.abs(value - now) > 1e-9)
}

/**
 * One fixed drive down the Rootway, reported as a handful of numbers.
 *
 * ---------------------------------------------------------------------------
 * **Driven by the fire-spirit, not by a sine wave.**
 *
 * The first version of this steered with `sin(t)` and it was worthless: the
 * car scrubbed itself down to thirteen metres a second and stayed there, so it
 * never reached a gear above second, never held a drift for more than a tenth
 * of a second, and never earned enough ember to press the button once. Three
 * dials came back dead that were wired perfectly well — the drive simply never
 * entered the state in which they do anything.
 *
 * The spirit already knows how to get down this road quickly, and it is a
 * *closed loop*: change the car and it steers differently in response, which
 * makes it more sensitive to a dial moving rather than less.
 *
 * What it will not do on its own is provoke the car, because it is trying to
 * be fast. So a handbrake pull at full lock is laid over the top every seven
 * seconds, and the ember is spent whenever there is any to spend.
 * ---------------------------------------------------------------------------
 */
function drive(): number[] {
  const car = createCar(track)
  const driver = spiritDriver(track, 7, 0.6, true)

  let distance = 0
  let topSpeed = 0
  let mostSideways = 0
  let mostAngle = 0
  let cornering = 0
  let drifting = 0
  let burning = 0

  const dt = 1 / 120
  for (let step = 0; step < 120 * 40 && !car.finished; step++) {
    const t = step * dt
    const input = driver(car, dt)

    /*
      Provoke it. A fixed speed rather than `TUNE.driftEnterSpeed`, so that
      dial is being tested rather than quietly deciding its own test.
    */
    if (t % 7 >= 5 && t % 7 < 5.6 && speedOf(car) > 14) {
      input.handbrake = true
      input.steer = Math.sign(input.steer) || 1
    }

    /*
      And throw it away on the brakes, with no handbrake anywhere near it.

      Slide catching and spin protection are the two dials that only exist
      *outside* a drift — both stand down the moment one starts, deliberately,
      so that the help and the drift are never pulling against each other. A
      drive that only ever goes sideways on the handbrake therefore never
      reaches either of them, and both came back dead while being wired
      correctly. Full lock into full brakes is the one gesture that gets the
      car past thirty degrees of slip without asking for a drift.
    */
    if (t % 7 >= 1.5 && t % 7 < 2.3 && speedOf(car) > 20) {
      input.steer = Math.sign(input.steer) || 1
      input.brake = 1
      input.throttle = 0
      input.handbrake = false
    }
    input.boost = car.boostLeft <= 0 && car.ember > 0.05 && !input.handbrake

    advanceCar(track, car, input, dt)

    const v = speedOf(car)
    distance = car.s
    if (v > topSpeed) topSpeed = v
    if (Math.abs(car.vn) > mostSideways) mostSideways = Math.abs(car.vn)
    if (Math.abs(car.n) > mostAngle) mostAngle = Math.abs(car.n)
    cornering += Math.abs(car.cornering) * dt
    if (car.drifting) drifting += dt
    if (car.boostLeft > 0) burning += dt
  }

  return [
    distance,
    topSpeed,
    mostSideways,
    mostAngle,
    cornering,
    drifting,
    burning,
    car.roll,
    car.pitch,
    car.ember,
  ]
}

/**
 * The car thrown sideways, and dragged onto the verge, with nobody driving.
 *
 * ---------------------------------------------------------------------------
 * Three dials cannot be reached from any realistic lap, and it took a while to
 * accept that rather than keep torturing the drive above.
 *
 * **Slide catching and spin protection only exist outside a drift** — both
 * stand down the moment one starts, on purpose — and outside a drift this car
 * is *extremely* hard to get sideways. That is the whole design: the steering
 * lock available at speed is a couple of degrees, because that is all the
 * tyres can use, so full lock into full brakes at 25 m/s produced a peak of
 * six degrees of slip. Neither dial has anything to say at six degrees, and
 * nor should it.
 *
 * **Grip off the line** needs the car off the racing line, and a driver good
 * enough to make the rest of this test meaningful never goes there.
 *
 * So this does what `rally-check` does for the same question: it puts the car
 * in the state directly — sideways at speed, and out on the loose — and lets
 * go. No steering, no throttle. What comes back is entirely the car.
 * ---------------------------------------------------------------------------
 */
function kick(): number[] {
  const idle: CarInput = {
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    boost: false,
  }
  const dt = 1 / 120
  const out: number[] = []

  for (const onTheVerge of [false, true]) {
    const car = createCar(track)
    car.vs = 30
    /*
      Hard sideways — well past anything the drive above can reach, and past
      where both helpers start having an opinion.

      **Twenty-six, and the number is load-bearing.** Slide catching only wakes
      up past `spinProtection * 0.72`, which at the default is twenty-nine
      degrees of slip, and the car is *good* at coming back: kicked at eleven
      it peaked at twenty-three degrees and settled, so the dial was moved from
      end to end and the car drove identically, and this reported a perfectly
      wired helper as dead. It was not marginal by much — eleven reached the
      threshold on some seeds and not on the one this uses, which is the worst
      kind of test, the sort that passes until an unrelated change to the
      *tyres* tips it over.

      At twenty-six the car peaks past forty degrees and the helper fires
      thirty-five times, so what is being measured is the dial rather than
      whether the kick happened to be big enough.
    */
    car.vn = 26
    if (onTheVerge) car.n = 6.5
    // Rolling, so the tyres are not fighting four locked wheels from step one.
    for (const wheel of car.wheels) wheel.omega = 30 / 0.34

    let straightened = 0
    let worst = 0
    for (let step = 0; step < 120 * 4; step++) {
      advanceCar(track, car, idle, dt)
      const beta = Math.abs(slipOf(car))
      if (beta > worst) worst = beta
      if (beta > 0.05) straightened += dt
    }
    out.push(worst, straightened, speedOf(car), car.s, car.n, car.yaw)
  }

  return out
}

function differs(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const scale = Math.max(1e-6, Math.abs(a[i]), Math.abs(b[i]))
    if (Math.abs(a[i] - b[i]) / scale > 1e-6) return true
  }
  return false
}

const store = useRallyTuning.getState()

/** Everything one setting of the dials produces, in one list. */
const trace = (): number[] => [...drive(), ...kick()]

store.toDefaults()
const base = trace()

/*
  The camera and the body do not appear in a physics trace at all — one is a
  lens and the other is how the shell is drawn — so they are checked against
  the thing they *do* touch: that the value reaches `TUNE`. Body lean is the
  exception and shows up in `car.roll`, so it is left in the drive.
*/
const NOT_IN_THE_PHYSICS = new Set<keyof RallyTuning>([
  'cameraDistance',
  'cameraHeight',
  'cameraAim',
  'cameraZoom',
  'cameraLooseness',
  'cameraDriftSway',
  'cameraShake',
  'steerSpeed',
  'steerWeight',
])

const dead: string[] = []
const live: string[] = []

for (const dial of DIALS) {
  const probes = probeValues(dial)
  let rejected: string | null = null
  let connected = false

  for (const probe of probes) {
    store.toDefaults()
    store.set(dial.key, probe)

    if (Math.abs(TUNE[dial.key] - probe) > 1e-9) {
      rejected = `the store did not accept ${probe} (TUNE says ${TUNE[dial.key]})`
      break
    }

    if (NOT_IN_THE_PHYSICS.has(dial.key) || differs(base, trace())) {
      connected = true
      break
    }
  }

  if (rejected !== null) dead.push(`${dial.key} — ${rejected}`)
  else if (!connected) {
    dead.push(`${dial.key} — moved to ${probes.join(' and ')}, and the car drove identically`)
  } else if (NOT_IN_THE_PHYSICS.has(dial.key)) {
    live.push(`${dial.key} (reaches TUNE; read by the camera or the hand)`)
  } else live.push(dial.key)
}

store.toDefaults()

console.log('')
console.log('Every dial reaches the car')
console.log('──────────────────────────────')
console.log(`  ${live.length} of ${DIALS.length} connected`)
if (dead.length > 0) {
  console.log('')
  for (const line of dead) console.log(`  DEAD  ${line}`)
  console.log('')
  console.log('  A dead dial still renders and still moves. Wire it or remove it.')
  process.exitCode = 1
} else {
  console.log('  none dead')
}
console.log('')
