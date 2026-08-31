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
  type LiveMotion,
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

const sample = (s: number, n = 0, yaw = 0): RunSample => ({
  n, s, yaw, drift: 0, boost: false, rough: false,
  braking: false, spinning: false, shortcut: false,
})

/*
  A whole race, sixteen updates a second, driven at a frame a sixtieth.

  Everything below runs her through this: a sender that writes on her own even
  clock, arrivals that land whenever the helper says they land, and a viewer
  drawing every frame in between. Positions come from a function of *her* time,
  so the truth is always known and can be compared against.
*/
function drive({
  road,
  across = () => 0,
  heading = () => 0,
  motion,
  until = 4000,
  every = 60,
  lands = (t: number) => t,
  frame = 1000 / 60,
  after = 0,
}: {
  road: (ms: number) => number
  across?: (ms: number) => number
  heading?: (ms: number) => number
  motion?: (ms: number) => LiveMotion
  until?: number
  every?: number
  /** When an update sent at `t` lands here. Never out of order: one socket. */
  lands?: (t: number) => number
  frame?: number
  /** How long to keep drawing after the last update was sent. */
  after?: number
}) {
  const car = new Rolling()
  const drawn: {
    at: number
    s: number
    n: number
    yaw: number
    speed: number
    lateral: number
    steering: number
    liveMotion: boolean
  }[] = []
  const sends: { t: number; at: number }[] = []
  let landed = 0
  for (let t = 0; t <= until; t += every) {
    landed = Math.max(landed + 1, lands(t))
    sends.push({ t, at: landed })
  }

  let next = 0
  for (let now = 0; now <= landed + after; now += frame) {
    while (next < sends.length && sends[next].at <= now) {
      const one = sends[next++]
      car.push(
        sample(road(one.t), across(one.t), heading(one.t)),
        one.at,
        one.t,
        motion?.(one.t) ?? null,
      )
    }
    const at = car.at(now)
    if (at) drawn.push({
      at: now,
      s: at.s,
      n: at.n,
      yaw: at.yaw,
      speed: at.speed,
      lateral: at.lateral,
      steering: at.steering,
      liveMotion: at.liveMotion,
    })
  }
  return { car, drawn }
}

/** Every step she was seen to take, once she is properly under way. */
function steps(drawn: { at: number; s: number }[], from = 1200) {
  const out: number[] = []
  for (let i = 1; i < drawn.length; i++) {
    if (drawn[i].at < from) continue
    out.push(drawn[i].s - drawn[i - 1].s)
  }
  return out
}

const nothing = new Rolling()
check('nothing has arrived, so there is nothing to draw', nothing.at(0), null)

/* Thirty metres a second — quick, and about what the Rootway is driven at. */
{
  const { drawn } = drive({ road: (ms) => 200 + ms * 0.03 })
  const each = steps(drawn)
  const mean = each.reduce((a, b) => a + b, 0) / each.length
  near('she moves every frame, by about the same amount', mean, 0.03 * (1000 / 60), 0.02)
  check('and never stands still', each.every((d) => d > 0), true)
}

/*
  ===========================================================================
  Braking, which is the whole reason any of this was rewritten.

  The old smoother carried her forward at her last speed and then refused to
  pull her back, because a car visibly reversing looks wrong — so every time
  she slowed it surged past and then *froze* until the truth caught up. Once a
  corner, all race. That is what "the other player isn't smooth" was after the
  repeats were fixed, and no amount of sending more often would have touched
  it.

  So: a hard brake from thirty metres a second to eight, and the demand is that
  nothing she is seen to do is either a stop or a jump.
  ===========================================================================
*/
{
  const brake = (ms: number) => {
    const from = 1500
    if (ms <= from) return 200 + ms * 0.03
    const t = Math.min(1, (ms - from) / 900)
    // Thirty down to eight, smoothly, over nine tenths of a second.
    const v = 0.03 + (0.008 - 0.03) * t
    return 200 + from * 0.03 + ((0.03 + v) / 2) * (ms - from)
  }
  const { drawn } = drive({ road: brake })
  const each = steps(drawn, 1400)
  const mean = each.reduce((a, b) => a + b, 0) / each.length
  const most = Math.max(...each)
  const least = Math.min(...each)
  check('braking never freezes her', least > 0, true)
  check('and never throws her forward', most < mean * 2.2, true)
}

/*
  And the same under a link that delivers unevenly, which is the other half of
  what it looked like: two updates landing together and then a long wait.
*/
{
  const bumpy = (t: number) => t + [0, 6, 52, 3, 90, 12, 0, 140][(t / 60) % 8 | 0]
  const { drawn, car } = drive({ road: (ms) => 200 + ms * 0.03, lands: bumpy })
  const each = steps(drawn, 1400)
  const mean = each.reduce((a, b) => a + b, 0) / each.length
  check('a bumpy link never freezes her', Math.min(...each) > 0, true)
  check('and never throws her forward', Math.max(...each) < mean * 2.2, true)
  const how = car.stats()
  check('the buffer widened by itself to cover it', how.behind > 100, true)
  check('and it says so', how.jitter > 10, true)
}

/* On an even link it settles near the floor rather than sitting back. */
{
  const { car } = drive({ road: (ms) => 200 + ms * 0.03, until: 8000 })
  const how = car.stats()
  check('an even link keeps the buffer tight', how.behind <= 110, true)
  check('and it never has to guess', how.dry, 0)
}

console.log('\nThe direct stream carries motion, not a trail of still pictures\n')

/* A clean pull from eight to twenty-four metres a second. */
{
  const acceleration = 0.000004
  const position = (ms: number) => 200 + 0.008 * ms + 0.5 * acceleration * ms * ms
  const { drawn } = drive({
    road: position,
    motion: (ms) => ({
      speed: (0.008 + acceleration * ms) * 1000,
      lateral: 0,
      yawRate: 0,
      steering: 0,
    }),
  })
  const moving = drawn.filter((one) => one.at > 1200)
  const changes = moving.slice(1).map((one, i) => Math.abs(one.speed - moving[i].speed))
  check('the direct motion reached the renderer', moving.every((one) => one.liveMotion), true)
  check('acceleration changes wheel speed continuously', Math.max(...changes) < 0.2, true)
  check('and its speed rises rather than stepping and stopping',
    moving[moving.length - 1].speed > moving[0].speed, true)
}

/* A long lane change: across-road motion and steering arrive with position. */
{
  const lane = (ms: number) => 2.2 * Math.sin(ms / 700)
  const laneRate = (ms: number) => (2.2 / 700) * Math.cos(ms / 700) * 1000
  const steer = (ms: number) => 0.32 * Math.sin(ms / 700)
  const { drawn } = drive({
    road: (ms) => 200 + ms * 0.028,
    across: lane,
    motion: (ms) => ({
      speed: 28,
      lateral: laneRate(ms),
      yawRate: 0,
      steering: steer(ms),
    }),
  })
  const moving = drawn.filter((one) => one.at > 1200)
  const laneSteps = moving.slice(1).map((one, i) => Math.abs(one.n - moving[i].n))
  const steerSteps = moving.slice(1).map((one, i) => Math.abs(one.steering - moving[i].steering))
  check('a lane change stays inside its reported envelope',
    moving.every((one) => Math.abs(one.n) <= 2.21), true)
  check('sideways movement has no visible jump', Math.max(...laneSteps) < 0.09, true)
  check('the front steering moves continuously too', Math.max(...steerSteps) < 0.03, true)
}

/* The legacy echo may land first; the direct frame must still enrich it. */
{
  const mixed = new Rolling()
  mixed.push(sample(200), 0, 0)
  mixed.push(sample(200), 2, 0, { speed: 18, lateral: 0, yawRate: 0, steering: 0.2 })
  const shown = mixed.at(2)
  check('a same-clock direct frame upgrades its legacy echo', shown?.liveMotion, true)
  near('and keeps its real steering', shown?.steering ?? 0, 0.2, 0.001)
}

/* A missing update gets a short coast, never a blind half-corner. */
{
  const gapped = new Rolling()
  let newest = 0
  for (let t = 0; t <= 960; t += 60) {
    newest = 200 + t * 0.03
    gapped.push(sample(newest), t, t, {
      speed: 30, lateral: 0, yawRate: 0, steering: 0,
    })
    gapped.at(t)
  }
  let lastSpeed = 30
  let lastPosition = newest
  for (let now = 980; now <= 1900; now += 1000 / 60) {
    const shown = gapped.at(now)
    if (shown) {
      lastSpeed = shown.speed
      lastPosition = shown.s
    }
  }
  check('a gap cannot project her more than one short coast', lastPosition - newest < 5.5, true)
  check('and that prediction eases toward rest', lastSpeed < 1, true)
}

/*
  And when the buffer does run dry, the old behaviour is what is left.

  She has genuinely stopped sending, so there is nothing to interpolate between
  and carrying her forward at her last speed is the honest thing — until
  `LOST_MS` takes her off the road entirely. A bad connection degrades to the
  way this used to work, not to a car parked in the middle of the tarmac.
*/
{
  const { car, drawn } = drive({ road: (ms) => 200 + ms * 0.03, after: 900 })
  const how = car.stats()
  check('a silence puts it on its own', how.dry > 0, true)
  const tail = steps(drawn, drawn[drawn.length - 1].at - 300)
  check('and she keeps rolling rather than stopping dead', Math.min(...tail) > 0, true)
}

console.log('\nShe is drawn where she was, not where she might be\n')

{
  const { car, drawn } = drive({ road: (ms) => 200 + ms * 0.03 })
  const how = car.stats()
  const last = drawn[drawn.length - 1]
  // Where she truly was, that many milliseconds before the last frame drawn.
  const truth = 200 + (last.at - how.behind) * 0.03
  near('within a metre of where she really was, a moment ago', last.s, truth, 1)
  check('which is behind her, never ahead', last.s < 200 + last.at * 0.03, true)
}

console.log('\nA spin, which is where an angle wraps\n')

/** The same wrap the physics keeps `psi` in, for measuring turn rather than number. */
const shortWay = (d: number) => d - Math.PI * 2 * Math.round(d / (Math.PI * 2))

/*
  `psi` is wrapped into ±π by the physics, so a car turning steadily through
  straight-backwards steps from about +3.1 to about −3.1 — a fiftieth of a turn.
  Blended as plain numbers that is *minus six radians*, and her car whips the
  whole way round the wrong way at the one moment you are certainly watching
  her. So the demand is not "no jumps" — a rotation may jump by exactly a turn
  and look like nothing — it is that the total angle she is seen to travel is
  the angle she actually turned, with no spare revolution in it.
*/
{
  const spun = new Rolling()
  const frames: number[] = []
  let yaw = 2.6
  let next = 0
  let turned = 0
  for (let now = 0; now <= 2400; now += 1000 / 60) {
    while (next * 60 <= now) {
      spun.push(sample(100 + next * 1.8, 0, yaw), next * 60, next * 60)
      yaw = shortWay(yaw + 0.06)
      turned += 0.06
      next++
    }
    const at = spun.at(now)
    if (at) frames.push(at.yaw)
  }
  let travelled = 0
  for (let i = 1; i < frames.length; i++) travelled += Math.abs(shortWay(frames[i] - frames[i - 1]))
  check('she crossed straight-backwards', frames.some((y) => y > 3) && frames.some((y) => y < -3), true)
  check('and turned no further than she really did', travelled < turned + 0.5, true)
  check('the long way round would have been six radians more', travelled < 5, true)
}

console.log('\nThe same car twice, which is what a shared world does\n')

/*
  The bug this is here to stop coming back.

  `subscribe` fires on every change to the world, and writing your own presence
  is a change to the world — sixteen times a second, all race. Each one woke the
  receiver, which read her *unchanged* field and pushed it in again. Two copies
  of one sample were no distance apart, so her speed came out as zero and her
  car parked until the next genuine one jumped it forward.

  Guarded three times over now, and the demand here is the strongest form of
  it: a run with every sample delivered twice must be drawn *identically* to a
  run with each delivered once. Not similar — the same, to the millimetre.
*/
{
  /** The same race twice: once delivered cleanly, once with every echo. */
  const run = (echoes: number[]) => {
    const car = new Rolling()
    const drawn: number[] = []
    let next = 0
    for (let now = 0; now <= 4000; now += 1000 / 60) {
      while (next * 60 <= now) {
        const t = next * 60
        car.push(sample(200 + t * 0.03), t, t)
        // And again, and again, exactly as the world used to.
        for (const late of echoes) car.push(sample(200 + t * 0.03), t + late, t)
        next++
      }
      const at = car.at(now)
      if (at) drawn.push(at.s)
    }
    return drawn
  }

  const once = run([])
  const thrice = run([4, 9])
  const same =
    once.length === thrice.length && once.every((s, i) => Math.abs(s - thrice[i]) < 1e-9)
  check('every sample twice is drawn exactly as every sample once', same, true)
}

/*
  And the speed she is seen to do is the speed she did, whatever the network
  makes of the delivery. Sent every sixty milliseconds, arriving in clumps.
*/
{
  const clumps = (t: number) => t + [0, 4, 58, 2, 96, 8, 0, 120][(t / 60) % 8 | 0]
  const { drawn } = drive({ road: (ms) => 200 + ms * 0.03, lands: clumps })
  const each = steps(drawn, 1400)
  const mean = each.reduce((a, b) => a + b, 0) / each.length
  near('a burst of arrivals is not a burst of speed', mean, 0.03 * (1000 / 60), 0.02)
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
