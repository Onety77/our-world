/**
 * Her car, over the wire, without a browser.
 *
 * ---------------------------------------------------------------------------
 * Two devices, six updates a second, no server. What can go wrong with that is
 * not "does it compile" — it is that the car looks like a slideshow, or slides
 * backwards on a dropped packet, or keeps driving for a minute after she has
 * put her phone down, or takes a NaN off the network and empties the screen.
 *
 * None of that is visible in a screenshot and all of it is arithmetic, so it
 * belongs here rather than in a browser. `wire.ts` imports nothing but types
 * and constants for exactly this reason.
 * ---------------------------------------------------------------------------
 */

import {
  DRIVING_MAX,
  KEEPALIVE_MS,
  LOST_MS,
  Rolling,
  readCar,
  readClock,
  stamp,
  writeCar,
} from '../src/world/games/ember-rally/wire'
import { SAMPLE_BOOST, SAMPLE_BRAKE, type RunSample } from '../src/world/games/ember-rally/model'

let failed = 0
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`)
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`)
}
const near = (what: string, got: number, want: number, by = 0.05) =>
  check(`${what} (±${by})`, Math.abs(got - want) <= by, true)

console.log('\nA car, written down and read back\n')

const wire = writeCar(2.3, 1234.5, -0.14, SAMPLE_BOOST | SAMPLE_BRAKE | 9)
check('four numbers and three commas', wire.split(',').length, 4)
check('and it fits the field the rules allow', wire.length <= DRIVING_MAX, true)

const back = readCar(wire)
near('metres across the road', back?.n ?? 0, 2.3, 0.001)
near('metres along it', back?.s ?? 0, 1234.5, 0.01)
near('the heading', back?.yaw ?? 0, -0.14, 0.001)
check('her boost', back?.boost, true)
check('her brake lamps', back?.braking, true)
check('and how sideways she is', Number((back?.drift ?? 0).toFixed(2)), 0.6)

console.log('\nThe far end of the longest road still fits\n')
check(
  'four kilometres out, wide, sideways, everything lit',
  writeCar(-19.999, 3999.99, -3.141, 511).length <= DRIVING_MAX,
  true,
)

console.log('\nWhat arrives from another phone is not to be trusted\n')

check('nothing at all', readCar(undefined), null)
check('an empty field', readCar(''), null)
check('a key from some other build', readCar('1730000000000.moonbreak'), null)
check('three numbers', readCar('1,2,3'), null)
check('six', readCar('1,2,3,4,5,6'), null)
check('words', readCar('a,b,c,d'), null)
check('a NaN, which would empty the screen', readCar('NaN,2,3,4'), null)
check('an infinity', readCar('1,Infinity,3,4'), null)
check('something far too long', readCar('1'.repeat(DRIVING_MAX + 1)), null)

console.log('\nHer own clock, on the end of the car\n')

{
  const car = writeCar(-19.999, 3999.99, -3.141, 511)
  const stamped = stamp(car, 599_999)
  check('the far end of the longest road, ten minutes in, still fits',
    stamped.length <= DRIVING_MAX, true)
  check('and it is still the same car underneath', readCar(stamped)?.s, readCar(car)?.s)
  check('her elapsed time comes back', readClock(stamped), 599_999)
  check('an older four-field car simply has no clock', readClock(car), null)
}

console.log('\nBetween updates, she is still a car\n')

const sample = (s: number, n = 0): RunSample => ({
  n, s, yaw: 0, drift: 0, boost: false, rough: false,
  braking: false, spinning: false, shortcut: false,
})

/* Thirty metres a second — quick, and about what the Rootway is driven at. */
const rolling = new Rolling()
check('nothing has arrived, so there is nothing to draw', rolling.at(0), null)

rolling.push(sample(100), 1000)
rolling.push(sample(104.8), 1160)

/*
  The half-step. This is the whole point of the class: at the moment exactly
  between two updates she has to be *between* them, not still sitting on the
  last one. A car that waits and jumps is the slideshow this exists to avoid.
*/
let seen = 0
for (let t = 1160; t <= 1320; t += 16) seen = rolling.at(t)?.s ?? 0
near('carried forward through the gap', seen, 109.6, 1.2)

/* And she keeps up over a long stretch of updates rather than falling behind. */
const long = new Rolling()
let where = 200
for (let t = 0; t <= 4000; t += 160) {
  long.push(sample(where), t)
  where += 4.8
  for (let f = 0; f < 10; f++) long.at(t + f * 16)
}
near('still beside you after four seconds', long.at(4000)?.s ?? 0, where - 4.8, 2.5)

console.log('\nThe same car twice, which is what a shared world does\n')

/*
  The bug this is here to stop coming back.

  `subscribe` fires on every change to the world, and writing your own presence
  is a change to the world — six or sixteen times a second, all race. Each one
  woke the receiver, which read her *unchanged* field and pushed it in again.

  Two copies of one sample are no distance apart, so her speed came out as
  zero, the dead reckoning that carries her between real updates stopped, and
  her car parked until the next genuine sample jumped it forward. Several times
  a second. That is what "the other player isn't smooth" was.

  Guarded twice now, and both are checked here: the receiver drops a repeat
  before it ever gets this far, and her own clock means an identical sample is
  the same instant rather than a standstill.
*/
{
  const echo = new Rolling()
  echo.push(sample(300), 0, 0)
  echo.push(sample(304.8), 160, 160)
  // The same one again, four more times, as the world churns underneath.
  for (const at of [180, 200, 220, 240]) echo.push(sample(304.8), at, 160)
  near('a repeat does not tell her she has stopped', echo.at(320)?.s ?? 0, 309.6, 1.2)
}

/*
  And the speed is hers, not the network's.

  Two updates she sent 160ms apart can land 30ms apart after a long hop. Timed
  by arrival that is five times her real speed, and her car leaps a car's length
  and gets held still while the truth catches up — the surge-and-stall that
  reads as a bad connection when the connection is fine.
*/
{
  const bursty = new Rolling()
  bursty.push(sample(500), 0, 0)
  bursty.push(sample(504.8), 30, 160)
  near('a burst of arrivals is not a burst of speed', bursty.at(190)?.s ?? 0, 509.6, 1.2)
}

console.log('\nAnd when she stops sending\n')

const quiet = new Rolling()
quiet.push(sample(500), 0)
quiet.push(sample(504.8), 160)
check('a moment later she is still there', quiet.at(600) !== null, true)
check('two seconds later she is still there', quiet.at(2000) !== null, true)
check('but she does not drive on for ever', quiet.at(160 + LOST_MS + 1), null)

console.log('\nA dropped or repeated packet must not throw her backwards\n')

const jitter = new Rolling()
jitter.push(sample(700), 0)
jitter.push(sample(704.8), 160)
const beforeRepeat = jitter.at(300)?.s ?? 0
jitter.push(sample(704.8), 320) // the same sample again — she stalled or it repeated
const afterRepeat = jitter.at(340)?.s ?? 0
check('a repeat does not send her backwards', afterRepeat >= beforeRepeat - 0.01, true)

const backwards = new Rolling()
backwards.push(sample(900), 0)
backwards.push(sample(880), 160) // out of order, or a restart
check('an impossible speed is not believed', (backwards.at(2000)?.s ?? 0) < 1000, true)

console.log('\nA car that is not moving is still a car\n')

/*
  The grid. Both of you sit still for three seconds before the flag, sending
  the same four numbers, and the far end must not decide either of you has left.
*/
check(
  'the keepalive beats the timeout, with room for a dropped write',
  KEEPALIVE_MS * 2 < LOST_MS,
  true,
)

const still = new Rolling()
let clock = 0
for (; clock <= 6000; clock += KEEPALIVE_MS) still.push(sample(18), clock)
check('a car parked on the grid is still on the grid six seconds later',
  still.at(clock) !== null, true)
check('and it has not crept forward', Math.abs((still.at(clock)?.s ?? 0) - 18) < 0.01, true)

console.log(
  failed === 0
    ? '\n  she is on the road beside you\n'
    : `\n  ${failed} thing(s) wrong\n`,
)
process.exit(failed === 0 ? 0 : 1)
