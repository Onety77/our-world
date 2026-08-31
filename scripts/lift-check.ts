/**
 * Lifting off into a corner, and being able to catch it.
 *
 * ---------------------------------------------------------------------------
 * **The complaint, in one sentence:** come off the throttle for a corner, turn
 * in, and the car locks into the turn and will not come back — counter-steer
 * does nothing and it goes into the far wall. Eight times out of ten.
 *
 * Some of that is correct and wanted. Coming off the power moves weight onto
 * the front, the rear goes light and the car rotates; a car that did not do
 * that would feel dead, and that rotation is the tool this road asks you to use
 * when you would rather not use the handbrake. What was *not* correct is being
 * unable to catch it, because catching a slide with opposite lock is the whole
 * skill the rotation exists to ask for.
 *
 * **What it turned out to be.** The steering lock was capped at the angle where
 * the front tyres make their most lateral force — the right ceiling for
 * *turning*, and about six degrees at thirty metres a second. Catching a slide
 * means pointing the front wheels down the road the car is actually travelling,
 * which at forty degrees of slip is forty degrees of lock. The car was not
 * refusing to answer the wheel; the wheel could not turn far enough. From the
 * seat those are the same thing.
 *
 * So this measures the two halves separately, because a fix to one must not
 * quietly become a change to the other:
 *
 *   turn-in    a lift still rotates the car, by the amount it always did —
 *              nothing here is allowed to make the car duller
 *   the catch  a driver's correction brings it back, without crossing to the
 *              far side, inside the width of the road
 *
 * The catch is driven the way a person drives it: lock proportional to how
 * sideways the car is, unwinding as it comes back. Holding full opposite lock
 * for two seconds spins any car the other way and would prove nothing.
 *
 *   npm run lift
 * ---------------------------------------------------------------------------
 */

import { makeTrack, STEP, type Track } from '../src/world/games/ember-rally/track'
import {
  advanceCar,
  createCar,
  slipOf,
  speedOf,
  type CarInput,
} from '../src/world/games/ember-rally/physics'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

const DT = 1 / 120
const still: CarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false }
const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(1)}°`

/*
  Measured on whichever road has the longest straight, which is not the Rootway.

  This asks about the *car* — what a lift does to it, and whether it can be
  caught — so it wants a piece of road with nothing happening on it. The
  hardened Rootway no longer has one: its longest straight stretch is about
  sixty metres and it is past the finish, which is the point of the hardening
  and makes it the wrong place to isolate a car. The physics is identical
  everywhere, so this takes the longest straight in the game and works there.
*/
function longestStraight(track: Track): { at: number; run: number } {
  let best = 0
  let bestFrom = track.start + 40
  let from = track.start + 40
  for (let i = Math.round(from / STEP); i < Math.round(track.finishAt / STEP); i++) {
    if (Math.abs(track.curv[i]) < 0.0016) {
      const run = i * STEP - from
      if (run > best) { best = run; bestFrom = from }
    } else {
      from = i * STEP
    }
  }
  return { at: bestFrom, run: best }
}

const roads = (['rootway', 'moonbreak', 'stormcrown'] as const).map((stage) => {
  const built = makeTrack(7, stage)
  return { stage, built, ...longestStraight(built) }
})
const chosen = roads.reduce((a, b) => (b.run > a.run ? b : a))
const track = chosen.built

function upToSpeed(at: number, want: number) {
  const car = createCar(track)
  car.s = at
  car.n = 0
  car.psi = 0
  for (let i = 0; i < 120 * 90; i++) {
    advanceCar(track, car, { ...still, throttle: 1 }, DT)
    if (speedOf(car) >= want) break
  }
  car.s = at
  car.n = 0
  car.psi = 0
  return car
}

/** Lift, turn in, then catch it the way a person would. */
function liftAndCatch({ throttle, hold = 1, turnFor = 1.1 }: {
  throttle: number
  hold?: number
  turnFor?: number
}) {
  const car = upToSpeed(chosen.at + 30, 32)
  const entry = speedOf(car)

  let peakSlip = 0
  for (let i = 0; i < Math.round(turnFor * 120); i++) {
    advanceCar(track, car, { ...still, steer: hold, throttle }, DT)
    peakSlip = Math.max(peakSlip, Math.abs(slipOf(car)))
  }
  const turned = car.psi

  /*
    A driver, not a switch. Lock proportional to how far the car has rotated
    away from the road, unwinding as it comes back — which is what catching
    something actually is, and the only fair test of whether it can be.
  */
  const from = car.n
  let crossed = 0
  let overshot = 0
  for (let i = 0; i < 120 * 2; i++) {
    const want = Math.max(-1, Math.min(1, -car.psi * 2.2))
    advanceCar(track, car, { ...still, steer: want, throttle }, DT)
    peakSlip = Math.max(peakSlip, Math.abs(slipOf(car)))
    crossed = Math.max(crossed, Math.abs(car.n - from))
    if (Math.sign(car.psi) !== Math.sign(turned)) {
      overshot = Math.max(overshot, Math.abs(car.psi))
    }
  }

  return {
    entry,
    turned: Math.abs(turned),
    peakSlip,
    settled: Math.abs(car.psi),
    overshot,
    crossed,
  }
}

console.log(
  `\nLifting into a turn at 32 m/s, on the ${chosen.stage}'s longest straight ` +
    `(${Math.round(chosen.run)}m)\n`,
)

const lifted = liftAndCatch({ throttle: 0 })
const driven = liftAndCatch({ throttle: 0.45 })

for (const [name, r] of [['off the throttle', lifted], ['holding some', driven]] as const) {
  console.log(`  ${name.padEnd(18)} rotated ${deg(r.turned)}, slip peaked at ${deg(r.peakSlip)}`)
  console.log(
    `  ${''.padEnd(18)} caught back to ${deg(r.settled)}, past straight by ${deg(r.overshot)}, ` +
      `${r.crossed.toFixed(1)}m of road used`,
  )
}
console.log('')

/*
  The one the complaint is about. A correction has to actually bring the car
  back — not merely stop it getting worse — and it has to do it inside the road.
  Eleven metres wide is about four metres of margin from the middle.
*/
ok(
  'a lift can be caught: the car comes back toward straight',
  lifted.settled < lifted.turned * 0.4,
  `rotated ${deg(lifted.turned)} and settled at ${deg(lifted.settled)}`,
)

ok(
  'and catching it does not throw it out the other side',
  lifted.overshot < 0.22,
  `went ${deg(lifted.overshot)} past straight the other way`,
)

ok(
  'and it fits inside the road while doing it',
  lifted.crossed < 4.2,
  `used ${lifted.crossed.toFixed(1)}m sideways, and there are about 4m of margin`,
)

/*
  And the lift still has to *do* something. The point was never to make the car
  inert off the throttle — that rotation is the tool. It only has to be one you
  can put down again.
*/
ok(
  'a lift still rotates the car more than driving through does',
  lifted.turned > driven.turned * 1.05,
  `lift ${deg(lifted.turned)} against ${deg(driven.turned)} on the throttle`,
)

ok(
  'and the same correction works on the throttle too',
  driven.settled < driven.turned * 0.5,
  `rotated ${deg(driven.turned)} and settled at ${deg(driven.settled)}`,
)

console.log('')
if (failed > 0) {
  console.log(`  ${failed} thing(s) wrong.\n`)
  process.exit(1)
}
console.log('  a lift rotates the car, and you can catch it\n')
