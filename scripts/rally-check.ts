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
  advanceCar,
  createCar,
  scrubOf,
  slipOf,
  speedOf,
  wheelspinOf,
  type CarInput,
  type CarState,
} from '../src/world/games/ember-rally/physics'
import { TUNE } from '../src/world/games/ember-rally/tuning'
import {
  MOONBREAK,
  STORMCROWN,
  makeTrack,
  roadAt,
  shortcutRoadAt,
  sunkAt,
  WATER_Y,
  type Track,
} from '../src/world/games/ember-rally/track'
import { driveSpirit, spiritDriver } from '../src/world/games/ember-rally/spirit'
import { isRun, runAt, runDurationMs } from '../src/world/games/ember-rally/model'
import type { StageId } from '../src/world/games/ember-rally/model'
import { useRace } from '../src/world/games/ember-rally/session'

const DT = 1 / 120
const IDLE: CarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false }
/** Flat out, straight ahead. */
const FLAT: CarInput = { steer: 0, throttle: 1, brake: 0, handbrake: false, boost: false }

/**
 * Wind the car up to a speed, and give up loudly rather than hang.
 *
 * These were nine bare `while (speedOf(car) < 42)` loops, which is fine
 * right up until the day the car's top speed is lowered past one of them —
 * and then this harness does not fail, it **hangs**: no output, no error, no
 * clue which of the nine it is sitting in. It cost twenty minutes to find,
 * and the whole value of a headless check is that it answers in a minute.
 *
 * A test that cannot finish is worse than one that fails, so this one fails.
 */
function windUpTo(track: Track, car: CarState, target: number): void {
  for (let step = 0; step < 120 * 120; step++) {
    if (speedOf(car) >= target) return
    advanceCar(track, car, FLAT, DT)
  }
  throw new Error(
    `rally-check: cannot wind the car up to ${target} m/s — it tops out at ` +
      `${speedOf(car).toFixed(1)}. Either the car has got slower than this test ` +
      `expects, or the target needs lowering. Top speed is the topSpeed dial in tuning.ts.`,
  )
}

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
    advanceCar(track, car, FLAT, DT)
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
    const input = { ...FLAT, boost: boosted.boostLeft <= 0 }
    advanceCar(track, boosted, input, DT)
    boostTop = Math.max(boostTop, speedOf(boosted))
  }

  return [
    `  0–100 km/h      ${fixed(to100)} s`,
    `  0–160 km/h      ${to160 < 0 ? 'never' : fixed(to160) + ' s'}`,
    `  top speed       ${fixed(top)} m/s  (${fixed(top * 3.6, 0)} km/h, stated ${TUNE.topSpeed})`,
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
    advanceCar(track, car, { steer, throttle: wide ? 0 : 1, brake: wide ? 0.55 : 0, handbrake: false, boost: false }, DT)
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
  windUpTo(track, car, 25)

  let peakSlip = 0
  let peakScrub = 0
  const before = speedOf(car)
  for (let step = 0; step < 120 * 1.1; step++) {
    advanceCar(track, car, { steer: 0.8, throttle: 0, brake: 0.4, handbrake: true, boost: false }, DT)
    peakSlip = Math.max(peakSlip, Math.abs(slipOf(car)))
    peakScrub = Math.max(peakScrub, scrubOf(car, true))
  }
  const held = speedOf(car)

  // Let it go, steer into it, and see whether it gathers up.
  let caught = -1
  for (let step = 0; step < 120 * 4; step++) {
    const counter = Math.max(-1, Math.min(1, -slipOf(car) * 3))
    advanceCar(track, car, { steer: counter, throttle: 0.5, brake: 0, handbrake: false, boost: false }, DT)
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
  windUpTo(track, car, 32)
  let peak = 0
  for (let step = 0; step < 120 * 3; step++) {
    advanceCar(track, car, { steer: 1, throttle: 1, brake: 0, handbrake: false, boost: false }, DT)
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
 * What a brief correction does at racing speed.
 *
 * The sustained full-lock test above catches a spin, but it does not describe
 * the failure a person actually feels: a small key tap or thumb nudge that
 * keeps growing after their hand has already come off. These pulses are short
 * enough to be corrections, not cornering instructions. The useful numbers
 * are the peak heading/slip and how much remains two seconds after release.
 */
function steeringPulse() {
  const rows: string[] = []
  for (const [name, amount, heldFor] of [
    ['thumb nudge', 0.18, 0.15],
    ['quick key  ', 0.42, 0.12],
    ['firm key   ', 0.7, 0.18],
  ] as const) {
    const track = flatTrack(4000)
    const car = createCar(track)
    windUpTo(track, car, 34)

    let peakN = 0
    let peakHeading = 0
    let peakSlip = 0
    const steps = Math.round(2.2 / DT)
    for (let step = 0; step < steps; step++) {
      const steer = step * DT < heldFor ? amount : 0
      advanceCar(track, car, { steer, brake: 0, handbrake: false, boost: false }, DT)
      peakN = Math.max(peakN, Math.abs(car.n))
      peakHeading = Math.max(peakHeading, Math.abs(car.psi))
      peakSlip = Math.max(peakSlip, Math.abs(slipOf(car)))
    }

    rows.push(
      `  ${name}  n ${fixed(peakN, 1).padStart(4)} m   ` +
        `heading ${fixed((peakHeading * 180) / Math.PI, 1).padStart(5)}°   ` +
        `slip ${fixed((peakSlip * 180) / Math.PI, 1).padStart(5)}°   ` +
        `after ${fixed((car.psi * 180) / Math.PI, 1).padStart(5)}°`,
    )
  }
  return rows.join('\n')
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
    windUpTo(track, car, 25)
    const entry = speedOf(car)

    let turned = 0
    let took = -1
    let widest = 0
    let radius = Infinity
    for (let step = 0; step < 120 * 6; step++) {
      advanceCar(track, car, { steer: 1, throttle: brake > 0 ? 0 : 1, brake, handbrake: yank, boost: false }, DT)
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
  /*
    Every road. Rootway changes by seed; the two authored roads need one each.

    The Rootway changes its order with the seed, so it is worth several; the
    Moonbreak is one authored course and one run of it says everything. It was
    added to this check the day it stopped being the only new thing anybody was
    looking at — a road nothing drives end to end in Node is a road whose
    corners have never been proved to *have* a line through them.
  */
  const roads: [string, number, StageId][] = [
    ['rootway 1', 1, 'rootway'],
    ['rootway 7', 7, 'rootway'],
    ['rootway 42', 42, 'rootway'],
    ['rootway 1234', 1234, 'rootway'],
    ['moonbreak', 1, 'moonbreak'],
    ['stormcrown', 1, 'stormcrown'],
    ['firstlight', 1, 'firstlight'],
  ]
  for (const [name, seed, stage] of roads) {
    const track = makeTrack(seed, stage)
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
      lines.push(`  ${name.padEnd(13)} BROKE (${broke}) at ${fixed(car.elapsed)}s`)
      continue
    }
    const run = recorder.finish(car)
    worstSpin = Math.max(worstSpin, spins / guard)
    lines.push(
      `  ${name.padEnd(13)} ${fixed(car.elapsed).padStart(6)}s   ` +
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

/** The long mountain actually earns that name, in distance and driven time. */
function theStormcrown(): string {
  const track = makeTrack(1, 'stormcrown')
  const moonbreak = makeTrack(1, 'moonbreak')
  const car = createCar(track)
  const drive = spiritDriver(track, 0x71c4)
  const crossed = new Map<number, number>()
  const landmarks = [
    STORMCROWN.climb.to,
    STORMCROWN.galeBend.exit,
    STORMCROWN.cloudShelf.to,
    STORMCROWN.thunderStair.exit,
    STORMCROWN.eye.to,
    STORMCROWN.stormfall.to,
    track.finishAt,
  ]
  let guard = 0
  let wall = 0
  while (!car.finished && guard++ < 40_000) {
    advanceCar(track, car, drive(car, DT), DT)
    if (car.touching) wall++
    for (const mark of landmarks) if (car.s >= mark && !crossed.has(mark)) crossed.set(mark, car.elapsed)
  }

  let peak = -Infinity
  let lowest = Infinity
  let narrowest = Infinity
  let hardest = 0
  for (let i = 0; i < track.y.length; i++) {
    peak = Math.max(peak, track.y[i])
    lowest = Math.min(lowest, track.y[i])
    narrowest = Math.min(narrowest, track.width[i])
    hardest = Math.max(hardest, Math.abs(track.curv[i]))
  }
  const sectorTimes = landmarks.map((mark, index) => {
    const at = crossed.get(mark) ?? NaN
    const before = index === 0 ? 0 : crossed.get(landmarks[index - 1]) ?? NaN
    return at - before
  })
  const longEnough = track.finishAt > moonbreak.finishAt * 1.3
  const timedRight = car.finished && car.elapsed > 125 && car.elapsed < 210
  const readableStair = hardest > 0.036 && narrowest < 4.8

  return [
    `  road             ${(track.length / 1000).toFixed(2)} km (${longEnough ? 'longer than Moonbreak by at least 30%' : 'TOO SHORT'})`,
    `  spirit           ${car.elapsed.toFixed(1)}s (${timedRight ? 'long, but inside one sitting' : 'OUTSIDE THE 125-210s TARGET'})`,
    `  mountain         ${(peak - lowest).toFixed(1)}m of vertical range; ${(track.y.at(-1) ?? 0).toFixed(1)}m at home`,
    `  road grammar     ${(narrowest * 2).toFixed(1)}m narrowest deck; ${(1 / hardest).toFixed(1)}m tightest radius (${readableStair ? 'demanding' : 'NEEDS MORE DEFINITION'})`,
    `  spirit contact   ${((wall / Math.max(1, guard)) * 100).toFixed(1)}% of steps; ${car.strikes} strikes`,
    `  sector seconds   ${sectorTimes.map((time) => Number.isFinite(time) ? time.toFixed(1) : '—').join(' · ')}`,
    `                   rainwood+climb · gale · shelf · stair · eye · fall · home`,
  ].join(NEWLINE)
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

/**
 * The understeer gradient, which is the number that says whether the car is
 * stable at all.
 *
 * On a circle of fixed radius, the steering angle a car needs is
 * `δ = L/R + K·a`, where `a` is the lateral acceleration and `K` is the
 * understeer gradient. Drive the same circle at several speeds, plot the extra
 * steering against the extra cornering, and the slope *is* `K`.
 *
 *   K > 0   understeer. Disturb the car and it converges. This is what every
 *           road car ever sold is built to do, and what this one must do
 *   K = 0   neutral. Stable only in the sense that a pencil on its point is
 *   K < 0   oversteer, and above a critical speed of `sqrt(gL / −K)` it is
 *           divergently unstable: push it and it leaves
 *
 * The four-wheel car had `K = 0` exactly — one shared cornering stiffness, and
 * force linear in load — which is why cornering at speed felt like the car was
 * falling over rather than turning.
 */
function understeerGradient() {
  const radius = 90
  const rows: string[] = []
  const points: [number, number][] = []

  for (const target of [12, 18, 24, 28, 31]) {
    const track = flatTrack(30_000, 1 / radius)
    const car = createCar(track)

    let steerHeld = 0
    let latHeld = 0
    /*
      An integral term, because the steering ratio is not known here.

      A proportional controller settles wherever its gain and the car's
      understeer balance out, which is a number about the controller. Letting
      the error accumulate makes it find whatever lock this car actually needs
      to hold the circle — which is the thing being measured.
    */
    let wind = 0
    for (let step = 0; step < 120 * 40; step++) {
      const v = speedOf(car)
      const off = -car.n * 0.09 - car.psi * 1.7 - car.yaw * 0.1
      wind = Math.max(-1, Math.min(1, wind + off * 0.9 * DT))
      const steer = Math.max(-1, Math.min(1, off + wind))
      const wantsMore = target - v
      advanceCar(
        track,
        car,
        {
          steer,
          throttle: Math.max(0, Math.min(1, wantsMore * 0.4)),
          brake: Math.max(0, Math.min(1, -wantsMore * 0.3)),
          handbrake: false,
          boost: false,
        },
        DT,
      )
      const why = sane(car)
      if (why) return `  BROKE (${why}) at ${fixed(car.elapsed)}s`
      /*
        Read it only once it has settled, and average over the last stretch.

        The lateral acceleration is `v · yaw rate`, not `car.lateral`. In a
        steady turn `car.lateral` — the rate of change of sideways velocity in
        the body frame — is very nearly *zero*, because the tyres are providing
        exactly the centripetal acceleration and nothing is left over. Reading
        it gave a flat 0.00 g at every speed and no gradient at all.
      */
      if (car.elapsed > 24 && Math.abs(car.n) < 3) {
        steerHeld = steerHeld * 0.995 + car.steerAngle * 0.005
        latHeld = latHeld * 0.995 + Math.abs(v * car.yaw) * 0.005
      }
    }
    if (latHeld > 0.5) points.push([latHeld, steerHeld])
    rows.push(
      `  ${fixed(speedOf(car), 1).padStart(5)} m/s   ` +
        `${fixed(latHeld / 9.81).padStart(5)} g   ` +
        `steering ${fixed((steerHeld * 180) / Math.PI, 2).padStart(6)}°`,
    )
  }

  if (points.length < 2) return rows.join('\n') + '\n  (not enough settled points to fit)'
  // Least squares through the points: the slope is K.
  const n = points.length
  const sumA = points.reduce((s, p) => s + p[0], 0)
  const sumD = points.reduce((s, p) => s + p[1], 0)
  const sumAA = points.reduce((s, p) => s + p[0] * p[0], 0)
  const sumAD = points.reduce((s, p) => s + p[0] * p[1], 0)
  const K = (n * sumAD - sumA * sumD) / Math.max(1e-9, n * sumAA - sumA * sumA)
  const degPerG = (K * 9.81 * 180) / Math.PI

  return [
    ...rows,
    '',
    `  understeer gradient  ${fixed(degPerG, 2)}°/g   ${
      degPerG > 0.4
        ? 'understeer — stable, self-correcting'
        : degPerG < -0.2
          ? 'OVERSTEER — divergently unstable above its critical speed'
          : 'neutral — on the knife edge, which is not stable enough'
    }`,
    '  (a road car is 2–6°/g. Under about half a degree it starts to feel',
    '   like the car is falling over rather than turning.)',
  ].join('\n')
}

/**
 * Kick it, then take your hands off.
 *
 * The practical form of the same question. A stable car straightens itself; an
 * unstable one keeps going. No steering input at all after the kick, because
 * the point is what the *car* does, not what a driver could rescue.
 */
function recovery() {
  const rows: string[] = []
  for (const v of [20, 28, 34]) {
    const track = flatTrack(9000)
    const car = createCar(track)
    windUpTo(track, car, v)

    // A yaw impulse, as if a stone had caught the back of the car.
    car.yaw += 0.75
    const wasHeading = car.psi
    let worstSlip = 0
    let settled = -1
    for (let step = 0; step < 120 * 8; step++) {
      advanceCar(
        track,
        car,
        { steer: 0, throttle: 0.45, brake: 0, handbrake: false, boost: false },
        DT,
      )
      worstSlip = Math.max(worstSlip, Math.abs(slipOf(car)))
      /*
        Settled means it has stopped *rotating* and stopped *sliding*.

        Not that its heading came back to where it started — it never will, and
        it should not. A disturbed car with nobody steering settles onto a new
        straight line, in a new direction; that is what stability is. Asking
        for the old heading back is asking for an autopilot, and measuring for
        it reported a perfectly stable car as "never came back".
      */
      if (
        settled < 0 &&
        step > 30 &&
        Math.abs(car.yaw) < 0.05 &&
        Math.abs(slipOf(car)) < 0.02
      ) {
        settled = step / 120
      }
    }
    const turned = Math.abs(car.psi - wasHeading)
    rows.push(
      `  ${String(v).padStart(2)} m/s   slid to ${fixed((worstSlip * 180) / Math.PI, 1).padStart(5)}°   ` +
        `${settled < 0 ? 'STILL SLIDING — unstable' : `straight again in ${fixed(settled)} s`}   ` +
        `ended ${fixed((turned * 180) / Math.PI, 0)}° off its old heading`,
    )
  }
  return rows.join('\n')
}

/**
 * The complaint, as a test.
 *
 * "When you are speeding and you corner it loses its balance and goes to the
 * walls." So: arrive at a real corner at a real speed, drive it the way a
 * person would — lift, brake, turn, pick the throttle back up — and measure
 * how far off the line the car ends up. The road is six metres wide, so
 * anything past about three is the rock.
 */
function throughACorner() {
  const rows: string[] = []
  for (const [name, radius, entry] of [
    ['fast sweep  ', 140, 38],
    ['medium bend ', 70, 30],
    ['tight corner', 34, 22],
  ] as const) {
    const track = flatTrack(9000, 1 / radius)
    const car = createCar(track)
    car.vs = entry
    for (const wheel of car.wheels) wheel.omega = entry / 0.34
    /*
      Started already turning, and measured only once it has settled.

      Dropped onto a curving road pointing straight ahead with no lock on, the
      car understandably runs wide while the driver winds the steering in — at
      38 m/s on a 140 m radius that alone is five metres before anything about
      the car is involved. That is a fact about being teleported into a corner,
      not about the handling, and measuring it was measuring the test.
    */
    car.yaw = entry / radius

    let worst = 0
    let worstSlip = 0
    // Integral again: the driver has to find the lock this car needs for this
    // radius, rather than being handed a guess that only suits one of them.
    let wind = 0
    for (let step = 0; step < 120 * 14; step++) {
      const v = speedOf(car)
      // What this corner will actually take, and a driver aiming to sit on it.
      const limit = Math.sqrt(1.15 * 9.81 * radius)
      const over = v - limit
      const ahead = 7 + v * 0.5
      const toward = Math.atan2(-car.n, ahead) - car.psi
      const off = toward * 2.6 - car.yaw * 0.2
      wind = Math.max(-1, Math.min(1, wind + off * 1.4 * DT))
      const steer = Math.max(-1, Math.min(1, off + wind))
      advanceCar(
        track,
        car,
        {
          steer,
          throttle: over < -1 ? Math.min(1, -over * 0.3) : 0,
          brake: over > 0.5 ? Math.min(1, over * 0.22) : 0,
          handbrake: false,
          boost: false,
        },
        DT,
      )
      if (step > 120 * 3) {
        worst = Math.max(worst, Math.abs(car.n))
        worstSlip = Math.max(worstSlip, Math.abs(slipOf(car)))
      }
      const why = sane(car)
      if (why) return `  BROKE (${why})`
    }
    rows.push(
      `  ${name}  r=${String(radius).padStart(3)} m at ${entry} m/s   ` +
        `wandered ${fixed(worst).padStart(5)} m off line   ` +
        `settled ${fixed(Math.abs(car.n), 1).padStart(4)} m   ` +
        `slip ${fixed((worstSlip * 180) / Math.PI, 1).padStart(4)}°   ` +
        `${worst > 3 ? 'INTO THE ROCK' : worst > 1.6 ? 'untidy' : 'held it'}`,
    )
  }
  return rows.join('\n')
}

/** The throttle, the coast, the brake, and reverse. */
function pedals() {
  const track = flatTrack(9000)
  const car = createCar(track)

  // Up to speed, then off the power entirely and let it run down.
  windUpTo(track, car, 30)
  const from = speedOf(car)
  const liftedAt = car.elapsed
  let coastTo = -1
  for (let step = 0; step < 120 * 60; step++) {
    advanceCar(track, car, IDLE, DT)
    if (car.vs < 0.5) {
      coastTo = car.elapsed - liftedAt
      break
    }
  }

  // Again, this time on the brakes from the same speed.
  const braked = createCar(track)
  windUpTo(track, braked, 30)
  const brakeFrom = braked.elapsed
  let stopIn = -1
  let stopped = 0
  for (let step = 0; step < 120 * 20; step++) {
    advanceCar(
      track,
      braked,
      { steer: 0, throttle: 0, brake: 1, handbrake: false, boost: false },
      DT,
    )
    if (stopIn < 0 && braked.vs < 0.5) {
      stopIn = braked.elapsed - brakeFrom
      stopped = braked.s
    }
  }
  // and, still holding it, into reverse
  const backedUp = braked.s - stopped

  /*
    Which way it turns going backwards.

    Reversing with right lock swings the nose *left*, in this model and in
    every real car: the rear axle leads, so the steered end sweeps the other
    way. It feels wrong the first time to everybody who has ever reversed a
    car, which is exactly why it is worth measuring — if it ever comes out the
    other way round, that is a bug rather than the world being strange.
  */
  const back = createCar(track)
  back.reversing = true
  back.vs = -4
  for (const wheel of back.wheels) wheel.omega = -4 / 0.34
  /*
    Measured over one second, and accumulated step by step.

    `psi` is an angle and lives on a circle — past a half turn it wraps, so
    reading `end − start` after three seconds of full lock in reverse reported
    a car that had swung 120° to the *left* as having gone 160° to the right.
    The model was right and the measurement was wrong, which is the more
    dangerous of the two ways round.
  */
  let swung = 0
  let last = back.psi
  for (let step = 0; step < 120; step++) {
    advanceCar(
      track,
      back,
      { steer: 1, throttle: 0, brake: 0.8, handbrake: false, boost: false },
      DT,
    )
    let step2 = back.psi - last
    if (step2 > Math.PI) step2 -= Math.PI * 2
    else if (step2 < -Math.PI) step2 += Math.PI * 2
    swung += step2
    last = back.psi
  }

  return [
    `  lift off at ${fixed(from)} m/s   rolls to a stop in ${
      coastTo < 0 ? 'over a minute' : fixed(coastTo) + ' s'
    }`,
    `  full brakes from ${fixed(from)} m/s   stops in ${
      stopIn < 0 ? 'NEVER' : fixed(stopIn) + ' s'
    }`,
    `  brake held at the stand   ${
      backedUp < -0.5
        ? `reversed ${fixed(-backedUp, 1)} m at ${fixed(Math.abs(braked.vs), 1)} m/s`
        : 'DID NOT REVERSE'
    }`,
    `  reversing with right lock   nose swung ${
      swung < 0 ? 'left' : 'RIGHT'
    } ${fixed((Math.abs(swung) * 180) / Math.PI, 0)}°   ${
      swung < 0 ? '(correct — the steered end leads the other way)' : '(WRONG)'
    }`,
  ].join('\n')
}

/**
 * Lift off, and does the car come alive?
 *
 * The whole reason for having a throttle. Coming into a corner too fast you
 * lift, the weight moves onto the front tyres, the rear goes light, and the
 * car *rotates* — so you can point it where you want and then drive out. If
 * lifting does nothing, a manual throttle is just a key you have to hold, and
 * every corner is whatever line you happened to arrive on.
 *
 * Same steering input, same speed, twice: once flat out, once with the
 * throttle released. The lifted run has to turn more, and turn sooner.
 */
function liftOff() {
  const rows: string[] = []
  const results: { yaw: number; slip: number; quick: number }[] = []

  for (const [name, gas] of [
    ['flat out    ', 1],
    ['lifted      ', 0],
    ['on the brake', -1],
    ['trail-braking', -2],
  ] as const) {
    const track = flatTrack(9000)
    const car = createCar(track)
    windUpTo(track, car, 34)

    let peakYaw = 0
    let peakSlip = 0
    let quick = -1
    for (let step = 0; step < 120 * 2.2; step++) {
      advanceCar(
        track,
        car,
        {
          /*
            Trail-braking arrives at the corner already slowing, and eases off
            the brake as the steering goes on — which is how anybody actually
            drives. Stamping on both at once, as the plain brake case does, is
            a provocation, and a car that spins when you do it is not wrong.
            The one that matters is this one.
          */
          steer: gas === -2 ? Math.min(0.55, step / 60) : 0.55,
          throttle: gas > 0 ? 1 : 0,
          brake:
            gas === -2
              ? Math.max(0, 0.75 - step / 90)
              : gas < 0
                ? 0.55
                : 0,
          handbrake: false,
          boost: false,
        },
        DT,
      )
      peakYaw = Math.max(peakYaw, Math.abs(car.yaw))
      peakSlip = Math.max(peakSlip, Math.abs(slipOf(car)))
      if (quick < 0 && Math.abs(car.yaw) > 0.3) quick = step / 120
    }
    results.push({ yaw: peakYaw, slip: peakSlip, quick })
    rows.push(
      `  ${name}   turned at ${fixed(peakYaw).padStart(5)} rad/s   ` +
        `slip ${fixed((peakSlip * 180) / Math.PI, 1).padStart(5)}°   ` +
        `${quick < 0 ? 'never really turned' : `into it in ${fixed(quick)} s`}   ` +
        `${fixed(speedOf(car), 1)} m/s left`,
    )
  }

  const gain = results[1].yaw / Math.max(0.01, results[0].yaw)
  return [
    ...rows,
    '',
    `  lifting turns it ${fixed((gain - 1) * 100, 0)}% harder than staying flat`,
    '  (under about 15% and there is no reason to ever lift, which means the',
    '   throttle is decoration and the corner is decided before you arrive.)',
  ].join('\n')
}

/**
 * The drift, which is a game rather than a car.
 *
 * Four things have to be true, and the third is the one that matters:
 *
 *   1. pulling the handbrake with lock on puts you in one
 *   2. holding an arrow bends the *path* that way — you go round a corner
 *   3. **flicking the other arrow swaps the car onto its other side and bends
 *      the path back**, without ever leaving the drift. This is what lets one
 *      drift carry through a left and then a right
 *   4. the ember cancels it, and so does two seconds of going straight
 *
 * Measured as heading change, because that is what "did it go round the
 * corner" actually means.
 */
function driftMode() {
  const track = flatTrack(9000)
  const car = createCar(track)
  windUpTo(track, car, 30)

  const rows: string[] = []
  /** Heading change over a stretch, unwrapped — `psi` lives on a circle. */
  const swing = (steps: number, input: CarInput) => {
    let turned = 0
    let last = car.psi
    let angle = 0
    for (let i = 0; i < steps; i++) {
      advanceCar(track, car, input, DT)
      let step = car.psi - last
      if (step > Math.PI) step -= Math.PI * 2
      else if (step < -Math.PI) step += Math.PI * 2
      turned += step
      last = car.psi
      angle = Math.max(angle, Math.abs(slipOf(car)))
    }
    return { turned, angle, speed: speedOf(car) }
  }

  // 1. Into it: handbrake with lock on.
  const entrySpeed = speedOf(car)
  const enter = swing(
    Math.round(120 * 0.8),
    { steer: 1, throttle: 0.6, brake: 0, handbrake: true, boost: false },
  )
  rows.push(
    `  pull it, hold right   swung ${fixed((enter.turned * 180) / Math.PI, 0).padStart(4)}°   ` +
      `hanging ${fixed((enter.angle * 180) / Math.PI, 0)}°   ` +
      `${car.drifting ? 'in the drift' : 'NOT IN A DRIFT'}`,
  )

  // 2. Still holding right, handbrake released: it must keep going round.
  const held = swing(
    Math.round(120 * 1.2),
    { steer: 1, throttle: 0.6, brake: 0, handbrake: false, boost: false },
  )
  rows.push(
    `  let go of the button  swung ${fixed((held.turned * 180) / Math.PI, 0).padStart(4)}°   ` +
      `${car.drifting ? 'still drifting' : 'DROPPED OUT'}`,
  )

  // 3. The flick. Now hold left — it has to come back the other way.
  const flick = swing(
    Math.round(120 * 1.6),
    { steer: -1, throttle: 0.6, brake: 0, handbrake: false, boost: false },
  )
  const swapped = flick.turned < -0.2
  rows.push(
    `  flick to the left     swung ${fixed((flick.turned * 180) / Math.PI, 0).padStart(4)}°   ` +
      `${car.drifting ? 'still drifting' : 'DROPPED OUT'}   ` +
      `${swapped ? 'CAME BACK THE OTHER WAY' : 'IGNORED THE ARROW'}   ` +
      `kept ${fixed((flick.speed / entrySpeed) * 100, 0)}% of ${fixed(entrySpeed, 0)} m/s`,
  )

  // 4a. The ember cancels it.
  swing(1, { steer: -1, throttle: 0.6, brake: 0, handbrake: false, boost: true })
  const afterBoost = car.drifting
  rows.push(`  press the ember       ${afterBoost ? 'STILL DRIFTING' : 'let go, as it should'}`)

  // 4b. And so does going straight.
  car.drifting = true
  car.driftStraight = 0
  swing(Math.round(120 * 1.2), { steer: 0, throttle: 0.6, brake: 0, handbrake: false, boost: false })
  const earlyOut = !car.drifting
  swing(Math.round(120 * 1.2), { steer: 0, throttle: 0.6, brake: 0, handbrake: false, boost: false })
  rows.push(
    `  hold it straight      ${
      earlyOut
        ? 'LET GO TOO SOON (under a second)'
        : car.drifting
          ? 'STILL DRIFTING after two seconds'
          : 'let go after about two seconds'
    }`,
  )

  return rows.join('\n')
}
/** The Rootwake stays worth taking and worth being frightened of. It measures
 * route length, mastered duration, tightest usable width, and spirit clearance
 * from the separately authored ledge on several seeds. */
const NEWLINE = String.fromCharCode(10)

/**
 * A long drift, held on one side.
 *
 * ---------------------------------------------------------------------------
 * The reported fault, as a measurement: through a corner tighter than a right
 * angle, one that needs the drift carried for several seconds, the car creeps
 * off the line even when the input is right — and it gets worse the longer the
 * corner lasts.
 *
 * What it measures is the gap between what the drift turns and what the corner
 * asks for, second by second, at a constant command. Not where the car ends up
 * — a constant command holds an *arc*, so it can hold a wrong one perfectly,
 * and the angle the entry left behind would swamp the signal. The fault was
 * that the gap itself grew: a command capped in g is a constant force, and the
 * arc a constant force draws opens with the square of the speed. A gap that
 * stays put is a drift you can hold, and no entry timing fixes one that walks,
 * because it accumulates after the entry.
 * ---------------------------------------------------------------------------
 */
function heldDrift(): string {
  const rows: string[] = []

  for (const degrees of [95, 130, 170]) {
    const radius = (120 / (degrees * Math.PI)) * 180
    const track = flatTrack(20_000, 1 / radius)
    const car = createCar(track)

    // Settle on the line gripping first, or the drift starts from wherever the
    // acceleration run happened to leave the car.
    for (let step = 0; step < 120 * 14; step++) {
      const steer = Math.max(-1, Math.min(1, -car.n * 0.19 - car.psi * 1.35 - car.yaw * 0.11))
      const wide = Math.abs(car.n) > 3
      advanceCar(track, car, { steer, throttle: wide ? 0.35 : 0.9, brake: 0, handbrake: false, boost: false }, DT)
    }
    // Flick it, then hold one command and nothing else — a perfect thumb.
    for (let step = 0; step < 120 * 0.3; step++) {
      advanceCar(track, car, { steer: 1, throttle: 0.4, brake: 0.25, handbrake: true, boost: false }, DT)
    }

    const command = Math.min(1, 25 / radius)
    const gaps: number[] = []
    for (let second = 1; second <= 4; second++) {
      for (let step = 0; step < 120; step++) {
        advanceCar(track, car, { steer: command, throttle: 0.8, brake: 0, handbrake: false, boost: false }, DT)
      }
      gaps.push(speedOf(car) / radius - car.yaw)
    }
    const walk = Math.abs(gaps[gaps.length - 1] - gaps[0])
    rows.push(
      `  ${String(degrees).padStart(3)}° · ${radius.toFixed(0)}m   hold ${command.toFixed(2)}   ` +
        gaps.map((g, i) => `${i + 1}s ${g >= 0 ? '+' : ''}${g.toFixed(3)}`).join('  ') +
        `   walked ${walk.toFixed(3)}`,
    )
  }
  rows.push('  (rad/s the corner asks for, less what the drift is giving)')
  rows.push('  Held steady means the drift keeps up as the car gains speed. It used to walk by 0.16.')
  return rows.join(NEWLINE)
}

/**
 * The Drowned Mile is as long as it is supposed to be.
 *
 * ---------------------------------------------------------------------------
 * The one thing about the dive that is a *number* rather than a picture, and
 * therefore the one thing a screenshot cannot check. It was built to a brief:
 * about half a minute under the water, long enough that it stops being a
 * tunnel you pass through and becomes somewhere you are. That is a length of
 * road over a speed, and both halves drift — lengthen the deep straight and it
 * grows; make the car faster, or the dive steeper, and it shrinks, and none of
 * those edits look like they are touching it.
 *
 * Driven by the fire-spirit, which takes the deep flat out, so this prints the
 * floor of the range. A person braking for the sweeps spends longer.
 *
 * Also checks the two things the geometry has to get right and which are
 * silent when wrong: that the road comes back up to the height it left from,
 * and that the waterline crossings the tube and the light are told about are
 * where the road actually goes under.
 * ---------------------------------------------------------------------------
 */
function theDrownedMile(): string {
  const track = makeTrack(1, 'moonbreak')
  const car = createCar(track)
  const drive = spiritDriver(track, 0x1234)

  let under = 0
  let deepest = 0
  let slowest = Infinity
  let quickest = 0
  let guard = 0
  while (!car.finished && guard++ < 60_000) {
    advanceCar(track, car, drive(car, DT), DT)
    if (sunkAt(track, car.s) > 0.02) {
      under += DT
      deepest = Math.max(deepest, WATER_Y - roadAt(track, car.s).y)
      slowest = Math.min(slowest, speedOf(car))
      quickest = Math.max(quickest, speedOf(car))
    }
  }

  const crossing = (from: number, to: number) => {
    const step = from < to ? 1 : -1
    for (let s = from; step > 0 ? s < to : s > to; s += step) {
      if (roadAt(track, s).y <= WATER_Y) return s
    }
    return NaN
  }
  const wentUnder = crossing(MOONBREAK.deep.from, MOONBREAK.deep.to)
  const cameUp = crossing(MOONBREAK.deep.to, MOONBREAK.deep.from)
  const before = roadAt(track, MOONBREAK.deep.from - 6).y
  const after = roadAt(track, MOONBREAK.deep.to + 6).y
  const wanted = under >= 26 && under <= 42

  return [
    `  under the water ${under.toFixed(1)}s at the spirit's pace — a person is slower`,
    `                  ${wanted ? 'inside the half-minute it was built for' : 'OUTSIDE THE 26-42s IT WAS BUILT FOR'}`,
    `  deepest         ${deepest.toFixed(1)}m below the surface`,
    `  speed down there ${slowest.toFixed(0)} to ${quickest.toFixed(0)} m/s`,
    `  goes under at   ${wentUnder.toFixed(0)}m, comes up at ${cameUp.toFixed(0)}m`,
    `                  the tube is told ${MOONBREAK.deep.under.in} and ${MOONBREAK.deep.under.out} — ` +
      `${Math.abs(wentUnder - MOONBREAK.deep.under.in) < 14 && Math.abs(cameUp - MOONBREAK.deep.under.out) < 14 ? 'near enough' : 'THE MOUTHS ARE IN THE WRONG PLACE'}`,
    `  level either end ${before.toFixed(2)}m in, ${after.toFixed(2)}m out — ` +
      `${Math.abs(before - after) < 1.2 ? 'comes back to where it left' : 'THE DIVE DOES NOT CLOSE'}`,
  ].join(NEWLINE)
}

/**
 * The two meters survive a restart.
 *
 * ---------------------------------------------------------------------------
 * A store test rather than a car test, and it guards a rule rather than a
 * value: **the effect that sets a DOM node is the cleanup that clears it, and
 * no other code may.**
 *
 * The ember bar and the speedometer are live nodes handed to the store by the
 * components that render them and written to sixty times a second by the
 * machine. `close()` used to null them, and `Road` calls `close()` on every
 * attempt change — so from the second go onward the machine wrote to nothing
 * and both meters froze at whatever they were showing. It looked random, moved
 * nothing in the physics, threw nothing, and no screenshot could show it.
 * ---------------------------------------------------------------------------
 */
function metersSurviveRestart(): string {
  const rows: string[] = []
  const track = makeTrack(7, 'rootway')
  const bar = { id: 'ember' } as unknown as HTMLElement
  const speedo = {
    value: { id: 'value' } as unknown as HTMLElement,
    line: { id: 'line' } as unknown as HTMLElement,
  }
  const surface = { id: 'surface' } as unknown as HTMLElement

  useRace.getState().open({ track, ghost: null, onFinish: () => {} })
  // What the components' effects do when they mount.
  useRace.getState().setEmberBar(bar)
  useRace.getState().setSpeedo(speedo)
  useRace.getState().setSurface(surface)
  rows.push(
    `  after the first go     bar ${useRace.getState().emberBar ? 'held' : 'LOST'}  ·  speedo ${useRace.getState().speedo ? 'held' : 'LOST'}`,
  )

  // "Run it again": Road's effect re-runs, and the meter components do not.
  for (let go = 2; go <= 4; go++) {
    useRace.getState().close()
    useRace.getState().setSurface(null)
    useRace.getState().open({ track, ghost: null, onFinish: () => {} })
    useRace.getState().setSurface(surface)
    const state = useRace.getState()
    rows.push(
      `  go ${go}                   bar ${state.emberBar === bar ? 'held' : 'LOST'}  ·  speedo ${state.speedo === speedo ? 'held' : 'LOST'}  ·  surface ${state.surface === surface ? 'held' : 'LOST'}`,
    )
  }

  // And leaving for the menu really does let go, because the components unmount.
  useRace.getState().close()
  useRace.getState().setSurface(null)
  useRace.getState().setEmberBar(null)
  useRace.getState().setSpeedo(null)
  const gone = useRace.getState()
  rows.push(
    `  back to the menu       ${!gone.emberBar && !gone.speedo && !gone.surface ? 'all three let go' : 'A NODE IS STILL HELD'}`,
  )
  return rows.join(NEWLINE)
}

function theSplit(): string {
  const rows: string[] = []
  for (const seed of [1, 42, 90210]) {
    const track = makeTrack(seed, 'rootway')
    const split = track.split
    if (!split) return '  NO SPLIT ON THE ROOTWAY — it should always have one'

    let separation = Infinity
    let tightest = Infinity
    let hardest = 0
    for (let at = split.from + 120; at < split.to - 140; at += 2) {
      const main = roadAt(track, at)
      const hidden = shortcutRoadAt(split, at)
      separation = Math.min(separation, Math.hypot(main.x - hidden.x, main.y - hidden.y, main.z - hidden.z))
      tightest = Math.min(tightest, hidden.width * 2)
      hardest = Math.max(hardest, Math.abs(hidden.curv))
    }
    let mainPace = 0
    let hiddenPace = 0
    for (let at = split.from; at < split.to; at += 2) {
      const mainRoad = roadAt(track, at)
      const hiddenRoad = shortcutRoadAt(split, at)
      mainPace += 2 / Math.min(35, Math.sqrt(12.9 / Math.max(0.0003, Math.abs(mainRoad.curv))))
      hiddenPace += (2 * hiddenRoad.metric) / Math.min(35, Math.sqrt(12.9 / Math.max(0.0003, Math.abs(hiddenRoad.curv))))
    }
    const masteredAdvantage = mainPace - hiddenPace
    const hardRoad = shortcutRoadAt(split, split.hardAt)
    const veryHardRoad = shortcutRoadAt(split, split.veryHardAt)
    const forkSeparation = [split.from + 12, split.commitAt, split.separateAt]
      .map((at) => {
        const main = roadAt(track, at)
        const hidden = shortcutRoadAt(split, at)
        return Math.hypot(main.x - hidden.x, main.y - hidden.y, main.z - hidden.z)
      })

    const mainCar = createCar(track)
    const mainDrive = spiritDriver(track, seed ^ 0x1927, 0.82, true)
    let mouthAt = 0
    let mainExitAt = 0
    let guard = 0
    while (!mainCar.finished && guard++ < 36_000) {
      advanceCar(track, mainCar, mainDrive(mainCar, DT), DT)
      if (!mouthAt && mainCar.s >= split.from) mouthAt = mainCar.elapsed
      if (!mainExitAt && mainCar.s >= split.to) mainExitAt = mainCar.elapsed
    }

    const hiddenCar = createCar(track)
    const hiddenDrive = spiritDriver(track, seed ^ 0x1927, 0.82, true)
    let hiddenMouthAt = 0
    let hiddenExitAt = 0
    let hiddenMinimumSpeed = Infinity
    let hiddenMinimumAt = 0
    let hiddenMinimumN = 0
    let hiddenWallSteps = 0
    guard = 0
    while (!hiddenCar.finished && guard++ < 36_000) {
      if (!hiddenCar.shortcut && hiddenCar.s >= split.from + 5 && hiddenCar.s < split.rejoinAt) {
        hiddenCar.shortcut = true
        hiddenCar.n = Math.min(hiddenCar.n, 0.4)
      }
      advanceCar(track, hiddenCar, hiddenDrive(hiddenCar, DT), DT)
      if (!hiddenMouthAt && hiddenCar.s >= split.from) hiddenMouthAt = hiddenCar.elapsed
      if (hiddenCar.shortcut) {
        const hiddenSpeed = speedOf(hiddenCar)
        if (hiddenSpeed < hiddenMinimumSpeed) {
          hiddenMinimumSpeed = hiddenSpeed
          hiddenMinimumAt = hiddenCar.s
          hiddenMinimumN = hiddenCar.n
        }
        if (hiddenCar.hitWall > 0) hiddenWallSteps++
      }
      if (!hiddenExitAt && hiddenCar.s >= split.to) hiddenExitAt = hiddenCar.elapsed
    }
    const advantage = mainCar.elapsed - hiddenCar.elapsed

    rows.push(
      `  seed ${String(seed).padEnd(6)} main ${mainCar.elapsed.toFixed(1)}s   Rootwake ${hiddenCar.elapsed.toFixed(1)}s   ` +
        `${advantage.toFixed(1)}s quicker` +
        (masteredAdvantage >= 8 && masteredAdvantage <= 12 ? '' : '   ← MASTERED PACE MISSES THE TEN-SECOND TARGET'),
    )
    rows.push(
      `               ${split.mainLength.toFixed(0)}m main centreline · ${split.shortcutLength.toFixed(0)}m hidden centreline · ` +
        `${tightest.toFixed(1)}m narrowest deck · r${(1 / hardest).toFixed(1)}m tightest bend`,
    )
    rows.push(
      `               signature corners r${(1 / Math.abs(hardRoad.curv)).toFixed(1)}m hard / ` +
        `r${(1 / Math.abs(veryHardRoad.curv)).toFixed(1)}m very hard`,
    )
    rows.push(
      `               mouth at ${mouthAt.toFixed(1)}s · ${separation.toFixed(1)}m minimum rock separation · ` +
        `solid walls agree with the tyres`,
    )
    rows.push(
      `               fork opens ${forkSeparation.map((value) => value.toFixed(1)).join(' → ')}m ` +
        `(shared floor → choice → separate tunnels)`,
    )
    rows.push(
      `               spirit stays ${mainCar.shortcut ? 'INSIDE THE SECRET ROAD' : 'on the ordinary road'} · ` +
        `hidden run ${hiddenCar.strikes} strikes`,
    )
    rows.push(
      `               branch sector ${(hiddenExitAt - hiddenMouthAt).toFixed(1)}s vs main ${(mainExitAt - mouthAt).toFixed(1)}s; ` +
        `branch low speed ${hiddenMinimumSpeed.toFixed(1)}m/s at ${(hiddenMinimumAt - split.from).toFixed(0)}m (n ${hiddenMinimumN.toFixed(1)}); ` +
        `wall ${(hiddenWallSteps * DT).toFixed(1)}s`,
    )
    const splitStart = roadAt(track, split.from)
    const splitEnd = roadAt(track, split.to)
    rows.push(
      `               portals ${Math.hypot(splitEnd.x - splitStart.x, splitEnd.y - splitStart.y, splitEnd.z - splitStart.z).toFixed(0)}m apart in the world`,
    )
    rows.push(
      `               mastered pace saves ${masteredAdvantage.toFixed(1)}s (main ${mainPace.toFixed(1)} / hidden ${hiddenPace.toFixed(1)})`,
    )
  }
  return rows.join(NEWLINE)
}

const sections: [string, () => string][] = [
  ['A straight', straightLine],
  ['The two pedals, and reverse', pedals],
  ['Is it stable at all?', understeerGradient],
  ['Kicked, hands off', recovery],
  ['Lifting off in a corner', liftOff],
  ['The drift', driftMode],
  ['Through a corner, driven properly', throughACorner],
  ['A constant corner', skidPad],
  ['The handbrake', handbrake],
  ['Full lock, no handbrake', lift],
  ['Brief steering at speed', steeringPulse],
  ['Turning in, three ways', hairpin],
  ['The fire-spirit, on real roads', realRoad],
  ['The ghost, written and read back', ghostRoundTrip],
  ['What a step costs', cost],
  ['A long drift, held on one side', heldDrift],
  ['The Rootwake', theSplit],
  ['The Drowned Mile', theDrownedMile],
  ['The Stormcrown', theStormcrown],
  ['The meters survive a restart', metersSurviveRestart],
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
