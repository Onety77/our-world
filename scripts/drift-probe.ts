/**
 * What a drift actually costs, measured.
 *
 * `npx tsx scripts/drift-probe.ts`
 *
 * Two complaints, both about drifting, and both of the kind a lap time hides:
 * the car stops dead in a long corner, and the car holds 110-120 km/h sideways
 * for as long as you keep flicking it. Neither shows up in `rally-check`,
 * because that harness asks whether the car *works* — and in both of these it
 * works fine, it is just wrong.
 *
 * **The walls are switched off here**, by pinning the car to the middle of the
 * road every step. That is a lie about the road and it is the only way to get
 * a truth about the drift: a drifting car runs wide, leans on the rock, and
 * the rock scrubs speed — so a trace taken on the real road is measuring the
 * wall, not the drift. The first run below is printed with the walls left on
 * to show exactly how much they were hiding.
 */

import {
  advanceCar,
  createCar,
  speedOf,
  type CarInput,
  type CarState,
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
  walls?: boolean
}

function drift({ label, steer, handbrake, walls = false }: Run, seconds = 8): void {
  const track = makeTrack(7, 'rootway')
  const car = createCar(track)
  windUpTo(track, car, 30)

  const trace: string[] = []
  let touched = 0
  let steps = 0
  let mark = 0
  for (let step = 0; step < seconds / DT; step++) {
    const t = step * DT
    advanceCar(track, car, { steer: steer(t), throttle: 1, brake: 0, handbrake: handbrake(t), boost: false }, DT)
    steps++
    if (car.touching) touched++
    if (!walls) car.n = 0
    if (t >= mark) {
      trace.push(`${(speedOf(car) * KMH).toFixed(0).padStart(3)}`)
      mark += 1
    }
  }
  const wall = walls ? `   (on the rock ${Math.round((touched / steps) * 100)}% of the time)` : ''
  console.log(`  ${label.padEnd(46)} ${trace.join(' ')}${wall}`)
}

const swap = (period: number) => (t: number) => (Math.floor(t / period) % 2 === 0 ? 1 : -1)
const held = () => true
const flick = (t: number) => t < 0.3

console.log('\nspeed in km/h, every second, entering at 108 with the throttle pinned')
console.log(`  ${''.padEnd(46)}  0s   1   2   3   4   5   6   7\n`)

drift({ label: 'the same drift WITH the walls, for scale', steer: () => 1, handbrake: held, walls: true })
console.log()
drift({ label: 'A  long corner, handbrake HELD all the way', steer: () => 1, handbrake: held })
drift({ label: 'B  long corner, handbrake let go at 0.3s', steer: () => 1, handbrake: flick })
drift({ label: 'C  swapping sides every 0.6s', steer: swap(0.6), handbrake: flick })
drift({ label: 'D  swapping sides every 0.35s (the flick)', steer: swap(0.35), handbrake: flick })
drift({ label: 'E  no drift, gentle cornering, for comparison', steer: () => 0.35, handbrake: () => false })
console.log()
