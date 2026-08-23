/**
 * The car, measured.
 *
 * `npx tsx scripts/rally-check.ts`
 *
 * Nothing in `physics.ts` touches three.js, the DOM or the clock, which means
 * the whole car can be driven in Node — and it *has* to be. Tuning a tyre
 * model by driving it is how you end up with a car that is quick on the one
 * machine you tested on, and "it feels about right" is not a check anybody can
 * repeat. This prints the numbers that decide whether the car is broken:
 *
 *   a straight   how it accelerates, and where drag stops it
 *   a skid pad   what it will actually hold round a constant corner
 *   the handbrake  that it rotates, and then that it comes *back*
 *   a real road  the fire-spirit round several seeds, looking for spins,
 *                stalls, wall-riding and anything that has gone NaN
 *
 * If a number here moves a long way, the handling changed. That is the point.
 */

import {
  BOOST_COST,
  Recorder,
  TOP_SPEED,
  advanceCar,
  createCar,
  scrubOf,
  slipOf,
  speedOf,
  wheelspinOf,
  type CarInput,
  type CarState,
} from '../src/world/games/ember-rally/physics'
import { makeTrack, roadAt, type Track } from '../src/world/games/ember-rally/track'
import { driveSpirit, spiritDriver } from '../src/world/games/ember-rally/spirit'
import { isRun, runAt, runDurationMs } from '../src/world/games/ember-rally/model'

const DT = 1 / 120
const IDLE: CarInput = { steer: 0, brake: 0, handbrake: false, boost: false }

function fixed(n: number, places = 2): string {
  return Number.isFinite(n) ? n.toFixed(places) : String(n)
}

/** A road with nothing on it, for measuring the car rather than the track. */
function flatTrack(length = 3000, curv = 0): Track {
  const count = length + 1
  const zeros = () => new Float32Array(count)
  const filled = (value: number) => {
    const a = new Float32Array(count)
    a.fill(value)
    return a
  }
  const x = zeros()
  const z = zeros()
  const heading = zeros()
  // A road of constant curvature, integrated so `roadAt` sees a real bend.
  let h = 0
  for (let i = 1; i < count; i++) {
    h += curv
    heading[i] = h
    x[i] = x[i - 1] + Math.sin(h)
    z[i] = z[i - 1] + Math.cos(h)
  }
  return {
    seed: 0,
    stage: 'rootway',
    length,
    start: 0,
    x,
    y: zeros(),
    z,
    heading,
    curv: filled(curv),
    width: filled(60),
    ceiling: filled(6),
    room: filled(1),
    wet: zeros(),
    grade: zeros(),
    bank: zeros(),
    line: zeros(),
    finishAt: length - 1,
    lanterns: [],
    roots: [],
    boulders: [],
  } as Track
}

function sane(car: CarState): string | null {
  const bad = (n: number) => !Number.isFinite(n)
  if (bad(car.s) || bad(car.n) || bad(car.psi)) return 'position'
  if (bad(car.vs) || bad(car.vn) || bad(car.yaw)) return 'velocity'
  for (const wheel of car.wheels) {
    if (bad(wheel.omega) || bad(wheel.load) || bad(wheel.slipRatio)) return 'wheel'
  }
  return null
}

// ---------------------------------------------------------------------------

function straightLine() {
  const track = flatTrack(4000)
  const car = createCar(track)
  let to100 = -1
  let to160 = -1
  let top = 0
  let spinPeak = 0
  const gears: number[] = []

  for (let step = 0; step < 120 * 60; step++) {
    advanceCar(track, car, IDLE, DT)
    const v = speedOf(car)
    top = Math.max(top, v)
    spinPeak = Math.max(spinPeak, wheelspinOf(car))
    if (to100 < 0 && v * 3.6 >= 100) to100 = car.elapsed
    if (to160 < 0 && v * 3.6 >= 160) to160 = car.elapsed
    if (gears[gears.length - 1] !== car.gear) gears.push(car.gear)
    const why = sane(car)
    if (why) return `  BROKE (${why}) at ${fixed(car.elapsed)}s`
  }

  // and again, on the ember
  const boosted = createCar(track)
  boosted.ember = 1
  let boostTop = 0
  for (let step = 0; step < 120 * 60; step++) {
    boosted.ember = 1
    const input = { ...IDLE, boost: boosted.boostLeft <= 0 }
    advanceCar(track, boosted, input, DT)
    boostTop = Math.max(boostTop, speedOf(boosted))
  }

  return [
    `  0–100 km/h      ${fixed(to100)} s`,
    `  0–160 km/h      ${to160 < 0 ? 'never' : fixed(to160) + ' s'}`,
    `  top speed       ${fixed(top)} m/s  (${fixed(top * 3.6, 0)} km/h, stated ${TOP_SPEED})`,
    `  on the ember    ${fixed(boostTop)} m/s  (${fixed(boostTop * 3.6, 0)} km/h)`,
    `  launch spin     ${fixed(spinPeak)}   peak wheelspin off the line`,
    `  gears used      ${gears.join(' → ')}`,
  ].join('\n')
}

/**
 * The skid pad.
 *
 * Round and round a constant corner, steering to hold the radius, and see what
 * it will actually take. A car whose limit here is under about 1g is slow; one
 * over about 1.5 is on rails and nothing you do matters.
 */
function skidPad() {
  const radius = 55
  const track = flatTrack(20_000, 1 / radius)
  const car = createCar(track)
  let best = 0

  for (let step = 0; step < 120 * 90; step++) {
    // Hold the middle of the road: steer at the error, brake if it is running
    // wide enough to be about to leave.
    const steer = Math.max(-1, Math.min(1, -car.n * 0.1 - car.psi * 1.9 - car.yaw * 0.12))
    const wide = Math.abs(car.n) > 6
    advanceCar(track, car, { steer, brake: wide ? 0.55 : 0, handbrake: false, boost: false }, DT)
    if (car.elapsed > 8 && Math.abs(car.n) < 4) best = Math.max(best, speedOf(car))
    const why = sane(car)
    if (why) return `  BROKE (${why}) at ${fixed(car.elapsed)}s`
  }
  const g = (best * best) / radius / 9.81
  return [
    `  held            ${fixed(best)} m/s round a ${radius} m corner`,
    `  which is        ${fixed(g)} g`,
  ].join('\n')
}

/**
 * The handbrake, which is the whole game.
 *
 * Straight at 25 m/s, then yank it with some lock on. Two things have to be
 * true: the car must actually come round, and it must come *back* when the
 * handbrake is let go. A car that does the first and not the second is a
 * spinning top with a good sound.
 */
function handbrake() {
  const track = flatTrack(4000)
  const car = createCar(track)
  while (speedOf(car) < 25) advanceCar(track, car, IDLE, DT)

  let peakSlip = 0
  let peakScrub = 0
  const before = speedOf(car)
  for (let step = 0; step < 120 * 1.1; step++) {
    advanceCar(track, car, { steer: 0.8, brake: 0.4, handbrake: true, boost: false }, DT)
    peakSlip = Math.max(peakSlip, Math.abs(slipOf(car)))
    peakScrub = Math.max(peakScrub, scrubOf(car, true))
  }
  const held = speedOf(car)

  // Let it go, steer into it, and see whether it gathers up.
  let caught = -1
  for (let step = 0; step < 120 * 4; step++) {
    const counter = Math.max(-1, Math.min(1, -slipOf(car) * 3))
    advanceCar(track, car, { steer: counter, brake: 0, handbrake: false, boost: false }, DT)
    if (caught < 0 && Math.abs(slipOf(car)) < 0.06) caught = step / 120
  }

  return [
    `  slip reached    ${fixed(peakSlip)} rad  (${fixed((peakSlip * 180) / Math.PI, 0)}°)`,
    `  rear scrub      ${fixed(peakScrub)}`,
    `  speed kept      ${fixed(held)} of ${fixed(before)} m/s`,
    `  gathered up in  ${caught < 0 ? 'NEVER — it spun' : fixed(caught) + ' s'}`,
  ].join('\n')
}

/** Full lock at speed with no handbrake: it must push wide, not snap round. */
function lift() {
  const track = flatTrack(4000)
  const car = createCar(track)
  while (speedOf(car) < 38) advanceCar(track, car, IDLE, DT)
  let peak = 0
  for (let step = 0; step < 120 * 3; step++) {
    advanceCar(track, car, { steer: 1, brake: 0, handbrake: false, boost: false }, DT)
    peak = Math.max(peak, Math.abs(slipOf(car)))
  }
  const front = scrubOf(car, false)
  const rear = scrubOf(car, true)
  return [
    `  slip at full lock ${fixed(peak)} rad`,
    `  scrub front/rear  ${fixed(front)} / ${fixed(rear)}  ${front > rear ? '(understeer — right)' : '(oversteer)'}`,
  ].join('\n')
}

/**
 * Is the handbrake worth pulling?
 *
 * The most important question about the whole game, and the one the last
 * version got wrong in the other direction: there, riding the wall was five
 * seconds a lap faster than braking, so the brake and the drift were
 * decoration on a game you won by holding one direction.
 *
 * A hairpin tight enough that the car will not simply turn into it, entered at
 * a speed that is genuinely too high, driven three ways. What has to be true
 * is that the handbrake run *gets round* — that it ends up nearer the middle
 * of the road, pointing the right way, with speed left — and that it is not
 * simply free, or the answer becomes "always hold it".
 */
function hairpin() {
  const rows: string[] = []
  /** Radians of heading change. A tight corner, in one number. */
  const TURN = Math.PI / 3

  for (const [name, brake, yank] of [
    ['steering only     ', 0, false],
    ['and the brake     ', 0.75, false],
    ['and the handbrake ', 0.45, true],
  ] as const) {
    const track = flatTrack(3000)
    const car = createCar(track)
    while (speedOf(car) < 25) advanceCar(track, car, IDLE, DT)
    const entry = speedOf(car)

    let turned = 0
    let took = -1
    let widest = 0
    let radius = Infinity
    for (let step = 0; step < 120 * 6; step++) {
      advanceCar(track, car, { steer: 1, brake, handbrake: yank, boost: false }, DT)
      // The road here is dead straight, so how far the car has come round is
      // simply how far its heading has left the road's.
      turned = Math.abs(car.psi)
      widest = Math.max(widest, Math.abs(slipOf(car)))
      if (took < 0 && turned >= TURN) {
        took = step / 120
        // What it actually went round, from the speed and how fast it is
        // rotating. This is the number a driver would call the corner radius.
        radius = speedOf(car) / Math.max(0.05, Math.abs(car.yaw))
      }
    }

    rows.push(
      `  ${name}  ${took < 0 ? 'never got there' : `60° in ${fixed(took)} s`}   ` +
        `radius ${fixed(radius, 1).padStart(5)} m   ` +
        `slip ${fixed(widest).padStart(5)} rad   ` +
        `${fixed(speedOf(car)).padStart(5)} of ${fixed(entry)} m/s left`,
    )
  }
  return [
    ...rows,
    '  (the handbrake has to turn it in fewer metres than the brake does, and',
    '   cost more speed for it — otherwise there is no reason ever to let go)',
  ].join('\n')
}

// ---------------------------------------------------------------------------

function realRoad() {
  const lines: string[] = []
  let worstSpin = 0
  for (const seed of [1, 7, 42, 1234, 90210]) {
    const track = makeTrack(seed)
    const car = createCar(track)
    const drive = spiritDriver(track, seed ^ 0x1234)
    const recorder = new Recorder()

    let top = 0
    let spins = 0
    let wall = 0
    let onHandbrake = 0
    let broke: string | null = null
    let guard = 0
    while (!car.finished && guard++ < 40_000) {
      const input = drive(car, DT)
      advanceCar(track, car, input, DT)
      recorder.sample(car)
      top = Math.max(top, speedOf(car))
      if (Math.abs(car.psi) > 1.4) spins++
      if (car.touching) wall++
      if (input.handbrake) onHandbrake++
      broke = sane(car)
      if (broke) break
    }
    if (broke) {
      lines.push(`  seed ${String(seed).padEnd(6)} BROKE (${broke}) at ${fixed(car.elapsed)}s`)
      continue
    }
    const run = recorder.finish(car)
    worstSpin = Math.max(worstSpin, spins / guard)
    lines.push(
      `  seed ${String(seed).padEnd(6)} ${fixed(car.elapsed).padStart(6)}s   ` +
        `top ${fixed(top, 1).padStart(4)}   ` +
        `strikes ${String(car.strikes).padStart(2)}   ` +
        `drift ${fixed(car.driftMs / 1000, 1).padStart(4)}s   ` +
        `wall ${fixed((wall / guard) * 100, 0).padStart(2)}%   ` +
        `hb ${fixed((onHandbrake / guard) * 100, 0).padStart(2)}%   ` +
        `${isRun(run) ? `v${run.v} ok, ${(run.path.length / 4) | 0} samples` : 'RUN REJECTED'}`,
    )
  }
  return lines.join('\n')
}

/** The ghost must be readable back out of what the recorder wrote. */
function ghostRoundTrip() {
  const track = makeTrack(7)
  const run = driveSpirit(track, 7 ^ 0x99, 0.6)
  if (!isRun(run)) return '  RUN REJECTED by isRun'
  const duration = runDurationMs(run)
  let worst = 0
  let sideways = 0
  let braking = 0
  for (let ms = 0; ms <= duration; ms += 50) {
    const at = runAt(run, ms)
    if (!Number.isFinite(at.s) || !Number.isFinite(at.n)) return '  ghost went NaN'
    const road = roadAt(track, at.s)
    worst = Math.max(worst, Math.abs(at.n) - road.width)
    if (at.drift > 0.3) sideways++
    if (at.braking) braking++
  }
  const samples = Math.floor(duration / 50) + 1
  return [
    `  ${fixed(duration / 1000)} s, ${(run.path.length / 4) | 0} samples, ` +
      `${((run.path.length * 5) / 1024).toFixed(1)} KB as text`,
    `  furthest onto the verge ${fixed(worst)} m`,
    `  sideways ${fixed((sideways / samples) * 100, 0)}% of the time, ` +
      `braking ${fixed((braking / samples) * 100, 0)}%`,
  ].join('\n')
}

/** How long a step costs, which decides whether a phone can run this. */
function cost() {
  const track = makeTrack(3)
  const car = createCar(track)
  const drive = spiritDriver(track, 3)
  const started = performance.now()
  const steps = 200_000
  for (let i = 0; i < steps; i++) {
    advanceCar(track, car, drive(car, DT), DT)
    if (car.finished) Object.assign(car, createCar(track))
  }
  const each = ((performance.now() - started) / steps) * 1000
  return `  ${fixed(each, 2)} µs a step — a 60fps frame needs two, so ${fixed((each * 2) / 1000, 3)} ms`
}

// ---------------------------------------------------------------------------

const sections: [string, () => string][] = [
  ['A straight', straightLine],
  ['A constant corner', skidPad],
  ['The handbrake', handbrake],
  ['Full lock, no handbrake', lift],
  ['Turning in, three ways', hairpin],
  ['The fire-spirit, on real roads', realRoad],
  ['The ghost, written and read back', ghostRoundTrip],
  ['What a step costs', cost],
]

for (const [name, run] of sections) {
  console.log(`\n${name}`)
  console.log('─'.repeat(Math.max(30, name.length)))
  try {
    console.log(run())
  } catch (error) {
    console.log(`  THREW: ${(error as Error).message}`)
  }
}
console.log('')
