/**
 * What a drift actually costs, and where it actually goes.
 *
 * `npm run drift`
 *
 * Two complaints, both about drifting, and both of the kind a lap time hides.
 * The first — the car stopping dead in a long corner, and a swap costing
 * nothing — is fixed and the traces below hold it fixed.
 *
 * The second is subtler and is what the `n` and `along` columns are for. A
 * drift commands a *course*, and a course that is not anchored to the road
 * walks off it: the speedometer reads sixty because the car really is moving
 * at sixty, and none of that sixty is going down the tunnel. It reads as the
 * car stopping. So a speed trace on its own is not enough to tell whether a
 * drift works, and this prints four things per second instead:
 *
 *   km/h    the speed the meter shows — the magnitude of the velocity
 *   along   how much of that is going *down the road*. This is the number
 *           that reads as speed to somebody driving
 *   n       metres off the middle of the road. Should stay put in a
 *           sustained drift; a drift that walks is a drift into the rock
 *   rock    how much of the time it spent leaning on the wall
 */

import {
  advanceCar,
  createCar,
  speedOf,
  type CarInput,
  type CarState,
  wallAt,
  CAR_HALF_WIDTH,
} from '../src/world/games/ember-rally/physics'
import { makeTrack, type Track } from '../src/world/games/ember-rally/track'

const DT = 1 / 120
const KMH = 3.6
const FLAT: CarInput = { steer: 0, throttle: 1, brake: 0, handbrake: false, boost: false }

function windUpTo(track: Track, car: CarState, target: number): void {
  for (let step = 0; step < 120 * 120; step++) {
    if (speedOf(car) >= target) return
    advanceCar(track, car, FLAT, DT)
  }
  throw new Error(`never reached ${target} m/s`)
}

interface Run {
  label: string
  steer: (t: number) => number
  handbrake: (t: number) => boolean
  /** Pin the car to the middle to take the walls out of the measurement. */
  noWalls?: boolean
}

function drift({ label, steer, handbrake, noWalls = false }: Run, seconds = 7): void {
  const track = makeTrack(7, 'rootway')
  const car = createCar(track)
  windUpTo(track, car, 30)

  const kmh: string[] = []
  const along: string[] = []
  const off: string[] = []
  let touched = 0
  let steps = 0
  let mark = 0
  let lastS = car.s

  for (let step = 0; step < seconds / DT; step++) {
    const t = step * DT
    const before = car.s
    advanceCar(track, car, { steer: steer(t), throttle: 1, brake: 0, handbrake: handbrake(t), boost: false }, DT)
    steps++
    if (car.touching) touched++
    if (noWalls) car.n = 0
    if (t >= mark) {
      kmh.push(`${(speedOf(car) * KMH).toFixed(0)}`.padStart(3))
      // Metres down the road in the last second, as km/h, so the two columns
      // are directly comparable — that gap is the whole complaint.
      along.push(`${((car.s - lastS) * KMH).toFixed(0)}`.padStart(3))
      // How much of the way to the rock, as a percentage. 100 is touching.
      const room = wallAt(car.road) - CAR_HALF_WIDTH
      off.push(`${Math.round((Math.abs(car.n) / Math.max(0.1, room)) * 100)}%`.padStart(5))
      lastS = car.s
      mark += 1
    }
    void before
  }
  const rock = Math.round((touched / steps) * 100)
  console.log(`  ${label}`)
  console.log(`      km/h  ${kmh.join(' ')}`)
  console.log(`     along  ${along.join(' ')}   ${noWalls ? '' : `· on the rock ${rock}% of the time`}`)
  if (!noWalls) console.log(`  to the rock  ${off.join(' ')}`)
  console.log('')
}

const swap = (period: number) => (t: number) => (Math.floor(t / period) % 2 === 0 ? 1 : -1)
const flick = (t: number) => t < 0.3

console.log('\nentering every drift at 108 km/h with the throttle pinned\n')
console.log('  --- the fixed ones: short drifts and side-swaps, walls off ---\n')
drift({ label: 'swapping sides every 0.6s', steer: swap(0.6), handbrake: flick, noWalls: true })
drift({ label: 'swapping sides every 0.35s', steer: swap(0.35), handbrake: flick, noWalls: true })

console.log('  --- the one being complained about: one long corner, walls ON ---\n')
drift({ label: 'hold one direction, handbrake let go', steer: () => 1, handbrake: flick })
drift({ label: 'hold one direction, handbrake HELD', steer: () => 1, handbrake: () => true })
drift({ label: 'no drift, gentle cornering, for comparison', steer: () => 0.3, handbrake: () => false })
