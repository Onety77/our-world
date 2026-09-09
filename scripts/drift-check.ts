/**
 * The drift, held to what it is supposed to be.
 *
 * `npm run drift`
 *
 * ---------------------------------------------------------------------------
 * **This file exists because the drift has now been rebuilt twice by somebody
 * who did not know what it was for**, and both times the code was reasonable
 * and the car was wrong. So the design is written down here as assertions
 * rather than left in a paragraph somebody may or may not read.
 *
 * From `PLAN.md`: *a drift is a game mechanic, not a physics outcome — and the
 * physics has to be told to get out of the way.* Simulated honestly, a
 * handbrake turn sends the car one way and keeps sending it; steering has
 * almost no authority once the rear has gone, so the drift is something that
 * happens **to** you. That is correct, and it is not the game.
 *
 * So while a drift is running, the arrows steer the **path**:
 *
 *   the key you hold   bends the line the car is travelling along
 *   the same key       decides which way it hangs, and how far
 *   the other key      swings it through and hangs it the other way
 *
 * Everything below is one of those sentences, or one of the three ways out, or
 * one of the two things that must never become true — a drift that is quicker
 * than driving, and a drift that walks into the rock.
 *
 * **What is deliberately not asserted** is a slip-angle window. The angle is
 * `TUNE.driftAngle` scaled by the arrow, so it is a dial's business and not a
 * law; pinning it here is how a tuning change becomes a failing test.
 * ---------------------------------------------------------------------------
 */

import assert from 'node:assert/strict'
import { PerspectiveCamera } from 'three'
import { flatTrack } from './rally-fixture'
import { ChaseCamera } from '../src/world/games/ember-rally/camera'
import {
  advanceCar, createCar, slipOf, speedOf, wallAt, CAR_HALF_WIDTH,
  type CarInput, type CarState,
} from '../src/world/games/ember-rally/physics'
import { makeTrack, type Track } from '../src/world/games/ember-rally/track'
import { TUNE } from '../src/world/games/ember-rally/tuning'

const DT = 1 / 120
const KMH = 3.6
const DEG = 180 / Math.PI
const GAS: CarInput = { steer: 0, throttle: 1, brake: 0, handbrake: false, boost: false }

const open = flatTrack(12000)
open.width.fill(10000)

function upTo(track: Track, car: CarState, target: number, steer: () => number = () => 0) {
  for (let i = 0; i < 120 * 60; i++) {
    if (speedOf(car) >= target) return true
    advanceCar(track, car, { ...GAS, steer: steer() }, DT)
  }
  return false
}
function go(car: CarState, seconds: number, input: Partial<CarInput> = {}, track = open) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    advanceCar(track, car, { ...GAS, ...input }, DT)
  }
}
function moving(speed = 28, track = open) {
  const car = createCar(track)
  assert(upTo(track, car, speed), `never reached ${speed} m/s`)
  return car
}
/** The gesture that starts one: a tap of the handbrake with lock on. */
function pull(car: CarState, side = 1, track = open) {
  go(car, 0.25, { steer: side * 0.7, handbrake: true }, track)
}
const deg = (car: CarState) => slipOf(car) * DEG
const kmh = (car: CarState) => speedOf(car) * KMH

const failures: string[] = []
function check(name: string, test: () => void) {
  try {
    test()
    console.log(`  ok    ${name}`)
  } catch (why) {
    failures.push(name)
    console.log(`  WRONG ${name}`)
    console.log(`        ${why instanceof Error ? why.message.split('\n')[0] : String(why)}`)
  }
}

console.log('\nthe gesture\n')

check('a tap of the handbrake with lock on starts one', () => {
  for (const side of [-1, 1]) {
    const car = moving()
    pull(car, side)
    assert(car.drifting, 'the tap did not start a drift')
    go(car, 1, { steer: side * 0.7 })
    assert(Math.sign(deg(car)) === -side, `hung the wrong way: ${deg(car).toFixed(1)}°`)
  }
})

check('and letting go of the handbrake does not end it', () => {
  const car = moving()
  pull(car)
  go(car, 6, { steer: 0.7 })
  assert(car.drifting, 'the drift needed the button held')
  assert(Math.abs(deg(car)) > 12, `not sideways any more: ${deg(car).toFixed(1)}°`)
})

check('two seconds of centred arrows lets it go', () => {
  const car = moving()
  pull(car)
  go(car, 1, { steer: 0.7 })
  go(car, 1.5, { steer: 0 })
  assert(car.drifting, 'let go too early — a second and a half is not two seconds')
  go(car, 1, { steer: 0 })
  assert(!car.drifting, 'never let go')
  assert(Math.abs(deg(car)) < 6, `left it sideways: ${deg(car).toFixed(1)}°`)
})

check('the ember cancels it on the press and leaves the speed alone', () => {
  const car = moving()
  pull(car)
  go(car, 1, { steer: 0.7 })
  const before = kmh(car)
  go(car, 0.1, { steer: 0.7, boost: true })
  assert(!car.drifting, 'the ember did not break the drift')
  assert(kmh(car) > before - 3, `the ember cost speed: ${before.toFixed(0)} → ${kmh(car).toFixed(0)}`)
})

check('a straight pull, or a slow one, brakes without latching a drift', () => {
  for (const [speed, steer] of [[6, 0.7], [25, 0]] as const) {
    const car = moving(speed)
    const before = speedOf(car)
    go(car, 0.7, { steer, handbrake: true, throttle: 0 })
    assert(!car.drifting, `latched at ${speed} m/s with ${steer} lock`)
    assert(speedOf(car) < before - 2, 'the handbrake stopped braking')
  }
})

check('and holding one fills the ember bar', () => {
  /*
    The seam, and it broke silently once.

    There are two things called drifting in `physics.ts`: `car.drifting`, the
    deliberate state, and a local one meaning *measured slip*. For a while they
    were the same thing, and the bar was moved onto the measured one. When the
    deliberate drift came back the two parted again — and the meter went on
    filling from the couple of seconds of incidental slip in a lap while
    ignoring twenty-four seconds of actual drifting. Measured: 0.39 on the bar
    where it used to reach a full 1.00.

    Nothing failed. The car drove correctly, the drift was right, and the whole
    reward economy was quietly starved. `PLAN.md`: *it fills from one thing
    only: seconds spent drifting.*
  */
  const car = moving()
  const before = car.ember
  pull(car)
  go(car, 4, { steer: 0.7 })
  assert(car.drifting, 'lost the drift before the bar could be measured')
  assert(car.ember > before + 0.3,
    `four seconds of drifting earned ${(car.ember - before).toFixed(2)} of ember`)
})

console.log('\nthe arrows steer the path\n')

check('the other arrow swings it through and hangs it the other way, with no second pull', () => {
  const car = moving()
  pull(car)
  go(car, 1.2, { steer: 0.7 })
  const right = deg(car)
  go(car, 1.2, { steer: -0.7 })
  const left = deg(car)
  go(car, 1.2, { steer: 0.7 })
  const back = deg(car)
  console.log(`        ${right.toFixed(1)}° → ${left.toFixed(1)}° → ${back.toFixed(1)}°, still on it at ${kmh(car).toFixed(0)} km/h`)
  assert(right < -10 && left > 10 && back < -10, 'it did not cross to the other side and back')
  assert(car.drifting, 'the swap dropped the drift')
  assert(kmh(car) > 40, `the chicane killed it: ${kmh(car).toFixed(0)} km/h`)
})

check('how far it hangs follows the arrow', () => {
  const angles = [0.35, 0.7, 1].map((lock) => {
    const car = moving()
    pull(car)
    go(car, 2, { steer: lock })
    return Math.abs(deg(car))
  })
  console.log(`        a third, two thirds, full lock: ${angles.map((a) => a.toFixed(1) + '°').join(' · ')}`)
  assert(angles[0] < angles[1] && angles[1] < angles[2], 'the arrow does not set the angle')
  assert(angles[2] > TUNE.driftAngle * DEG * 0.8, 'full lock never reaches the dial')
})

check('and the front wheels are cranked against it, past the path', () => {
  /*
    The one thing everybody knows a drift looks like, and it was missing.

    The wheels were drawn along the car's path. That points them almost exactly
    down the road — and the chase camera is aligned with the road — so the body
    swung out to a visible angle while the tyres sat dead ahead in the frame.

    Three things make it read: they must point *against* the arrow, they must go
    *past* the path rather than sit on it, and they must stay inside the lock
    the car actually has, or it stops being a car.
  */
  for (const side of [-1, 1]) {
    const car = moving()
    pull(car, side)
    go(car, 2, { steer: side * 0.7 })
    const drawn = car.wheels[0].steer
    assert(Math.abs(car.wheels[1].steer - drawn) < 1e-9, 'the two fronts disagree')
    assert(Math.sign(drawn) === -side,
      `not opposite lock: ${(drawn * DEG).toFixed(1)}° on a ${side > 0 ? 'right' : 'left'} drift`)
    assert(Math.abs(drawn) > Math.abs(slipOf(car)) + 0.05,
      `only along the path: ${(drawn * DEG).toFixed(1)}° against a slide of ${deg(car).toFixed(1)}°`)
    assert(Math.abs(drawn) <= TUNE.steerLock + 1e-9,
      `past the car's own lock: ${(drawn * DEG).toFixed(1)}°`)
    if (side > 0) {
      console.log(`        hung out ${deg(car).toFixed(1)}°, wheels drawn at ${(drawn * DEG).toFixed(1)}° — lock is ${(TUNE.steerLock * DEG).toFixed(1)}°`)
    }
  }
})

check('and full lock puts them on the stops without going past', () => {
  const car = moving()
  pull(car)
  go(car, 3, { steer: 1 })
  const drawn = Math.abs(car.wheels[0].steer)
  console.log(`        full arrow: ${deg(car).toFixed(1)}° of slide, wheels at ${(drawn * DEG).toFixed(1)}°`)
  assert(drawn > TUNE.steerLock * 0.9, `never reaches the stops: ${(drawn * DEG).toFixed(1)}°`)
  assert(drawn <= TUNE.steerLock + 1e-9, 'drawn past the stops')
})

console.log('\nwhat it costs\n')

check('the entry costs speed and holding it does not', () => {
  const car = moving(30)
  const trace: number[] = []
  pull(car)
  for (let i = 0; i < 8; i++) { trace.push(kmh(car)); go(car, 1, { steer: 1 }) }
  console.log(`        ${trace.map((k) => k.toFixed(0).padStart(3)).join(' ')}   dial says ${(TUNE.driftTopSpeed * KMH).toFixed(0)}`)
  assert(trace[1] < trace[0] - 15, 'going sideways at speed cost nothing')
  /*
    The whole of the 1 Sep fix, in one line: from the third second on it must
    not still be falling. Before it, this read 63 · 57 · 54 · 50 · 47 — a long
    corner on one arrow bled to a crawl, because the angle was charged every
    second rather than only while the pose was moving.
  */
  const settled = trace.slice(3)
  assert(Math.min(...settled) > Math.max(...settled) - 3,
    `a held drift is still bleeding: ${settled.map((k) => k.toFixed(0)).join(' ')}`)
  assert(Math.min(...settled) > TUNE.driftTopSpeed * KMH * 0.8,
    `it settles far under its dial: ${Math.min(...settled).toFixed(0)}`)
})

check('and throwing it across costs more than sitting in it', () => {
  const held = moving(30); pull(held)
  for (let i = 0; i < 8; i++) go(held, 1, { steer: 1 })
  const thrown = moving(30); pull(thrown)
  for (let i = 0; i < 8; i++) { go(thrown, 0.5, { steer: 1 }); go(thrown, 0.5, { steer: -1 }) }
  console.log(`        held ${kmh(held).toFixed(0)} km/h · thrown ${kmh(thrown).toFixed(0)} km/h`)
  assert(kmh(thrown) < kmh(held), 'a chicane taken flick-flick-flick is free')
})

check('and it beats hitting the rock, which it did not', () => {
  /*
    ------------------------------------------------------------------------
    The invariant nobody had written down, and it was inverted.

    Reported from playing: *"its better to even hit something than start a
    drift."* True, and measured — in a car topping out at 127 km/h, clouting
    the rock at full speed left 77 while a drift left 66 on the way in and
    settled at 71. The mechanic the whole game is built on cost more than
    crashing, so the quickest way through a corner was to bounce off it.

    `driftTopSpeed` is an absolute speed and it was chosen when a wall cost
    almost nothing — 127 → 123. Making stone hurt properly is right, and it is
    what put these two numbers beside each other for the first time.

    Both moments are checked: the dip on the way in, and where it settles. The
    dip is the one that was worst and the one you feel.
    ------------------------------------------------------------------------
  */
  const straight = flatTrack(200000)
  straight.width.fill(10000)
  const fast = createCar(straight)
  for (let i = 0; i < 120 * 90; i++) advanceCar(straight, fast, GAS, DT)
  const top = speedOf(fast)

  const stone = flatTrack(200000)
  stone.width.fill(6)
  const hit = createCar(stone)
  for (let i = 0; i < 120 * 90; i++) advanceCar(stone, hit, GAS, DT)
  hit.n = 2.4
  hit.psi = 0.10
  let afterWall = speedOf(hit)
  for (let i = 0; i < 120 * 2; i++) {
    advanceCar(stone, hit, GAS, DT)
    afterWall = Math.min(afterWall, speedOf(hit))
  }

  const sliding = createCar(straight)
  for (let i = 0; i < 120 * 90; i++) advanceCar(straight, sliding, GAS, DT)
  go(sliding, 0.25, { steer: 0.7, handbrake: true }, straight)
  let dip = speedOf(sliding)
  for (let i = 0; i < 120 * 6; i++) {
    advanceCar(straight, sliding, { ...GAS, steer: 0.7 }, DT)
    dip = Math.min(dip, speedOf(sliding))
  }
  const settled = speedOf(sliding)

  console.log(`        top ${(top * KMH).toFixed(0)} · the rock leaves ${(afterWall * KMH).toFixed(0)} · a drift dips to ${(dip * KMH).toFixed(0)} and settles ${(settled * KMH).toFixed(0)}`)
  assert(dip > afterWall,
    `crashing is the better move: the rock leaves ${(afterWall * KMH).toFixed(0)} km/h, a drift ${(dip * KMH).toFixed(0)}`)
  assert(settled > afterWall + 2,
    `a settled drift is no better than a crash: ${(settled * KMH).toFixed(0)} against ${(afterWall * KMH).toFixed(0)}`)
})

check('a drift is never a quicker way down a road', () => {
  const straight = moving(28)
  const from = straight.s
  go(straight, 12, { steer: 0 })
  const sliding = moving(28)
  const at = sliding.s
  pull(sliding)
  for (let i = 0; i < 12; i++) go(sliding, 0.5, { steer: i % 2 === 0 ? 1 : -1 })
  console.log(`        driving ${(straight.s - from).toFixed(0)} m · drifting ${(sliding.s - at).toFixed(0)} m, in twelve seconds`)
  assert(sliding.s - at < straight.s - from,
    'drifting covers more road than driving, which makes every other number here decoration')
})

check('nothing in it can add speed with the throttle shut', () => {
  const car = moving()
  pull(car)
  go(car, 0.4, { steer: 0.7 })
  let previous = speedOf(car)
  for (let i = 0; i < 600; i++) {
    advanceCar(open, car, { ...GAS, steer: 0.7, throttle: 0 }, DT)
    assert(speedOf(car) <= previous + 0.02, `free energy at step ${i}: +${(speedOf(car) - previous).toFixed(4)}`)
    previous = speedOf(car)
  }
})

console.log('\nand it follows the road it is on\n')

check('a held drift goes round a real corner instead of into the rock', () => {
  for (const stage of ['rootway', 'moonbreak', 'harmattan'] as const) {
    const track = makeTrack(7, stage)
    const car = createCar(track)
    /* Only to get it up to speed and pointing down the road. The drift itself
       is driven on one held arrow, which is the input being tested. */
    const middle = () => Math.max(-1, Math.min(1, -(car.psi * 3 + car.n * 0.25)))
    assert(upTo(track, car, 23, middle), `${stage}: never got up to speed`)
    pull(car, 1, track)
    let touching = 0
    let worst = 0
    const steps = Math.round(6 / DT)
    for (let i = 0; i < steps; i++) {
      advanceCar(track, car, { ...GAS, steer: 1 }, DT)
      if (car.touching) touching++
      worst = Math.max(worst, Math.abs(car.n) / Math.max(0.1, wallAt(car.road) - CAR_HALF_WIDTH))
    }
    const onTheRock = (touching / steps) * 100
    console.log(`        ${stage.padEnd(10)} ${kmh(car).toFixed(0)} km/h, ${deg(car).toFixed(0)}°, worst ${(worst * 100).toFixed(0)}% of the way to the rock, touching ${onTheRock.toFixed(0)}%`)
    /*
      The failure this is here for: a drift that commands an arc and ignores
      the road draws its own circle, walks across the tunnel and pins itself.
      Measured that way it read 97% → 100% to the rock and 83 → 0 km/h.
    */
    assert(onTheRock < 12, `${stage}: leaning on the rock ${onTheRock.toFixed(0)}% of the time`)
    assert(kmh(car) > 35, `${stage}: the corner ate it — ${kmh(car).toFixed(0)} km/h`)
  }
})

check('a sideways body contacts the wall before its nose passes through it', () => {
  const car = moving()
  pull(car)
  go(car, 1.5, { steer: 0.7 })
  const narrow = flatTrack(12000)
  narrow.width.fill(4)
  car.psi = 0.65
  car.n = wallAt({ ...car.road, width: 4 }) - 1.1
  const before = speedOf(car)
  advanceCar(narrow, car, { ...GAS, steer: 0.7 }, DT)
  assert(car.touching, 'the nose went through the rock')
  assert(speedOf(car) < before, 'clouting the rock cost nothing')
})

check('the chase camera stays inside the tunnel while it is sideways', () => {
  const car = moving()
  pull(car)
  go(car, 1.5, { steer: 0.7 })
  const narrow = flatTrack(12000)
  narrow.width.fill(4)
  car.n = 3.6
  for (const aspect of [16 / 9, 852 / 393, 393 / 852]) {
    const camera = new PerspectiveCamera(60, aspect, 0.1, 1000)
    new ChaseCamera().update(camera, narrow, car, 1 / 60)
    assert(Math.abs(camera.position.x) <= 3.201, `camera in the rock at ${aspect.toFixed(2)}`)
  }
})

check('wet, sand and a slow entry all still give you a drift you can hold', () => {
  for (const [speed, wet, sand] of [[14, 0, 0], [20, 1, 0], [25, 0, 0.8], [34, 0, 0]] as const) {
    const track = flatTrack(12000)
    track.width.fill(10000)
    track.wet.fill(wet)
    track.sand.fill(sand)
    const car = moving(speed, track)
    pull(car, 1, track)
    go(car, 3, { steer: 0.7 }, track)
    assert(car.drifting, `lost it at ${speed} m/s, wet ${wet}, sand ${sand}`)
    assert(speedOf(car) > 8, `it stopped: ${kmh(car).toFixed(0)} km/h`)
    assert(car.wheels.every((w) => Number.isFinite(w.omega) && w.load >= 0), 'a wheel went bad')
  }
})

console.log('\nand it is the same car at any frame rate\n')

check('a drift agrees at 30, 60 and 120 frames per second', () => {
  const cars = [30, 60, 120].map((fps) => {
    const car = moving()
    for (let i = 0; i < fps * 5; i++) {
      const t = i / fps
      advanceCar(open, car, {
        ...GAS,
        steer: t < 2 ? 0.7 : -0.7,
        handbrake: t < 0.25,
        throttle: t >= 4 ? 0 : 1,
      }, 1 / fps)
    }
    return car
  })
  for (const car of cars) {
    assert(Math.abs(car.s - cars[0].s) < 1.2, `s drifted apart: ${car.s.toFixed(2)} vs ${cars[0].s.toFixed(2)}`)
    assert(Math.abs(car.n - cars[0].n) < 0.6, `n drifted apart: ${car.n.toFixed(2)} vs ${cars[0].n.toFixed(2)}`)
    assert(Math.abs(slipOf(car) - slipOf(cars[0])) < 0.05, 'the pose drifted apart')
  }
})

console.log(failures.length === 0
  ? '\nthe drift is ours\n'
  : `\n${failures.length} wrong: ${failures.join('; ')}\n`)
process.exit(failures.length === 0 ? 0 : 1)
