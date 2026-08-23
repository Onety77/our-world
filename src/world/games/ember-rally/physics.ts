/**
 * How the car behaves.
 *
 * Four wheels, each with its own load, its own slip and its own share of one
 * budget of grip; an engine with a torque curve driving the rears through a
 * gearbox; brakes at both ends and a handbrake at one. Solved in the *road's*
 * frame rather than the world's.
 *
 * The car's position is `s` (how far along the road) and `n` (how far right of
 * the middle of it). Working this way gives three things for nothing:
 *
 *   - Hitting the rock is `|n| > half the tunnel`, not a mesh query.
 *   - A run records as four small numbers a sample, which is what makes an
 *     asynchronous ghost cheap enough to keep in a document.
 *   - **The inside line is genuinely shorter.** `ds/dt = v / (1 - n·κ)` is
 *     not a rule anybody wrote; it falls out of the geometry. Take the inside
 *     of a corner and you cover more road per metre driven, exactly as you do
 *     in a real car, and the reward for a good line is real rather than
 *     awarded.
 *
 * Nothing in here touches three.js, the DOM or the clock, so the fire-spirit
 * can drive a whole run through it in a couple of milliseconds before you have
 * even seen the road — see `spirit.ts`.
 *
 * ---------------------------------------------------------------------------
 * **Why four wheels and not two.**
 *
 * The first version was a bicycle model: one front tyre, one rear tyre, and
 * the handbrake was a *number that made the rear grip lower*. It drove
 * acceptably and it could not do any of the things a car does. There was no
 * wheelspin, because there were no wheels to spin. There was no lockup. The
 * inside wheel never went light through a hairpin, so the car cornered the
 * same on a crest as in a dip. And the drift was a scalar somebody had tuned
 * rather than something that happened to the machine.
 *
 * Here the handbrake is not a grip multiplier. It is a torque, applied to two
 * wheels, large enough to stop them turning; once they have stopped, their
 * *longitudinal* slip is total, and the friction circle below has nothing left
 * to spend on holding the back of the car in line. The car comes round because
 * the rear tyres have run out, which is what actually happens, and every
 * consequence of it — that it works better on the brakes, that it does almost
 * nothing below walking pace, that lifting off mid-corner tightens your line —
 * falls out rather than being written down.
 *
 * The five pieces, in the order one step runs them:
 *
 *   load        static, plus weight moving forward under braking, plus weight
 *               moving outward through a corner. A wheel can reach zero and
 *               give nothing, which is where lift-off oversteer comes from
 *   slip        an angle and a ratio per wheel, both *relaxed* — a tyre takes
 *               about half a metre of rolling to build its force, and that lag
 *               is most of why a car feels like it has tyres and not skates
 *   force       saturating in both directions, then clipped to a circle, so
 *               everything a tyre spends cornering it cannot spend driving
 *   wheels      each one a rotating mass. Engine torque in, tyre torque out,
 *               brake torque against. Solved semi-implicitly, because the
 *               tyre term is stiff and the obvious integration explodes
 *   body        three degrees of freedom, and the road frame at the end
 * ---------------------------------------------------------------------------
 */

import {
  SAMPLE_BOOST,
  SAMPLE_BRAKE,
  SAMPLE_DRIFT,
  SAMPLE_MS,
  SAMPLE_ROUGH,
  SAMPLE_SLIDE,
  type RallyRun,
} from './model'
import { roadAt, type RoadAt, type Track } from './track'

// --- the machine -----------------------------------------------------------

/** Kilograms. Light, like a real rally car with everything stripped out. */
const MASS = 960
/** Yaw inertia, kg·m². */
const INERTIA = 1240
/** Front axle and rear axle, metres from the centre of mass. */
const FRONT = 1.14
const REAR = 1.22
const WHEELBASE = FRONT + REAR
/** Half the distance between the wheels on one axle, metres. */
const TRACK_HALF = 0.78
/** Height of the centre of mass, metres. Drives every load transfer. */
const CG_HEIGHT = 0.42
const G = 9.81

export const WHEEL_RADIUS = 0.34
/** A wheel, a hub and a brake disc, kg·m². */
const WHEEL_INERTIA = 1.5
/**
 * Everything spinning inside the engine, kg·m².
 *
 * Referred to a driven wheel it becomes `ENGINE_INERTIA · ratio² / 2` — the
 * ratio squared because that is how inertia transforms through a gearbox, and
 * the half because there is *one* engine shared between two rear wheels. That
 * half was missing once and it cost the car half its acceleration in first
 * gear: the drivetrain came out weighing as much as the car, so half of every
 * newton went into spinning the engine up rather than into the road, and no
 * amount of adding torque fixed it because the extra torque went the same way.
 *
 * What is left is real and worth keeping. A low first gear genuinely does
 * spend a third of its output accelerating its own driveline, which is why a
 * car pulls harder in second than the ratios say it should.
 */
const ENGINE_INERTIA = 0.12

/** Half the car's width plus a little, for deciding when the rock has it. */
export const CAR_HALF_WIDTH = 0.86
export const CAR_LENGTH = 3.5

/**
 * Where the axles are, in the *mesh's* frame — origin on the road between the
 * wheels, nose toward +Z.
 *
 * Exported from here rather than stated again in `car.ts` so the model and the
 * machine cannot drift apart. They did once: the shell had its axles at ±1.2
 * while the physics had them at 1.14 and 1.22, so the visible front wheels
 * were six centimetres from where the front tyre actually was, and every
 * skid mark and puff of smoke came off the wrong place by a hand's width.
 */
export const AXLE_FRONT = FRONT
export const AXLE_REAR = -REAR
export const AXLE_HALF_TRACK = TRACK_HALF

// --- the tyres -------------------------------------------------------------

/** How much grip the stone has. Generous — this is a garden, not a simulator. */
const GRIP = 1.46
/**
 * Where the tyre gives up.
 *
 * These are the arguments to a `tanh`, so the peak sits at roughly `1/k`: a
 * lateral stiffness of 9.5 means the front tyre is at its limit around ten
 * degrees of slip, which is about right for something road-legal on stone.
 * A hyperbolic tangent rather than a real Pacejka curve because it saturates
 * *smoothly and forever* — a curve that falls away past its peak is more
 * truthful and turns every small mistake into a spin.
 */
const STIFF_LAT = 9.5
const STIFF_LONG = 13
/**
 * Relaxation length, metres.
 *
 * A tyre does not develop its force the instant the car changes direction; it
 * has to roll about half a metre first. Modelled as a first-order lag whose
 * rate is speed over this length, which means it disappears sensibly at low
 * speed instead of adding a constant delay to everything.
 */
const RELAX = 0.45

// --- aerodynamics ----------------------------------------------------------

/**
 * Lumped drag, newtons per (m/s)².
 *
 * Tuned so that the last gear runs out against the air rather than against the
 * limiter — see `scripts/rally-check.ts`, which is where the top speed is
 * actually measured rather than asserted. A car that hits its rev limiter in
 * top has no top speed, it has a governor, and a straight stops being a place
 * where anything is decided.
 */
const DRAG = 1.16
/** Downforce, newtons per (m/s)². About fifteen per cent of its weight flat out. */
const LIFT = 0.75
const LIFT_FRONT = 0.42

// --- the drivetrain --------------------------------------------------------

/**
 * Five ratios, and where each of them runs out.
 *
 * 1st is short enough to light the rears up off the line and finishes at about
 * sixty kilometres an hour; 5th is long enough that drag stops you before the
 * limiter does, which is what makes a straight feel long.
 */
const GEARS = [3.15, 2.25, 1.72, 1.36, 1.08]
const FINAL = 4.1
const DRIVE_LOSS = 0.92
const IDLE_RPM = 1100
const LIMIT_RPM = 7200
/** Newton-metres at the peak of the curve. */
const PEAK_TORQUE = 250
/** Seconds the torque is cut for while a gear goes in. */
const SHIFT_TIME = 0.16
/** Revs, as a fraction of the range, at which it changes up and down. */
const SHIFT_UP = 0.93
const SHIFT_DOWN = 0.36

const RPM_TO_RAD = Math.PI / 30
const IDLE_OMEGA = IDLE_RPM * RPM_TO_RAD
const LIMIT_OMEGA = LIMIT_RPM * RPM_TO_RAD

/** Engine torque, as a fraction of the peak, across the rev range. */
function torqueCurve(x: number): number {
  const peak = 0.58
  if (x <= 0) return 0.72
  if (x < peak) return 0.72 + 0.28 * Math.pow(x / peak, 0.7)
  const t = Math.min(1.25, (x - peak) / (1 - peak))
  return Math.max(0.16, 1 - 0.48 * t * t)
}

// --- the brakes ------------------------------------------------------------

/** Newton-metres across all four at full pedal. Enough to lock, but only just. */
const BRAKE_TORQUE = 4200
const BRAKE_BIAS = 0.63
/** Newton-metres on the rear axle. Comfortably enough to stop them turning. */
const HANDBRAKE_TORQUE = 2900

// --- limits ----------------------------------------------------------------

/**
 * The widest slide the car will hold, radians.
 *
 * Left alone, four tyres and a handbrake will happily put the car backwards,
 * and that is correct physics and a terrible game: a forty-second race is not
 * long enough to recover from a spin, so a spin is the end of your evening.
 *
 * Past this angle the sideways velocity is pulled back, harder the further
 * past it goes. It is deliberately *not* a hard clamp — a wall at a stated
 * angle is something you can feel the edge of, and it makes the last few
 * degrees of a drift feel like hitting a rail rather than like tyres. So the
 * car does settle a few degrees beyond this under real provocation, around
 * forty-five, and comes back from there under its own steam.
 *
 * `scripts/rally-check.ts` measures where it actually ends up. If that number
 * ever creeps past about fifty degrees, something below has come loose.
 */
const MAX_SLIP = 0.7
/** Radians per second. A backstop, not a handling parameter. */
const MAX_YAW_RATE = 2.9

/**
 * How much of the countersteer the car does for you, 0..1.
 *
 * Stated as a number here rather than buried, because it is the one dishonest
 * thing in the model and it has to be. Half of this game is played with two
 * arrow keys, which are switches: a real slide needs a hand that can hold
 * fifteen degrees of opposite lock and *modulate* it, and a keyboard cannot
 * offer that at any skill level. So a third of the correction is applied for
 * you, and the rest is yours. Take it to zero and the game is only playable
 * with a wheel; take it to one and you cannot drift, because the car refuses
 * to be out of shape.
 */
const CATCH = 0.34

/** Roughly 165 km/h, and it takes the whole of a straight to get there. */
export const TOP_SPEED = 46
/** Nothing may exceed this, boost included. */
const SPEED_CEILING = 58
/**
 * The car never quite stops.
 *
 * A run is forty seconds long. Grinding to a halt against a wall and having to
 * pull away again in first is six seconds of nothing, so the engine always
 * keeps a crawl on. It is the one place the model is asked to be kind.
 */
const CRAWL = 1.2

/** Seconds of ember burn one tap buys, what it costs, and what it does. */
export const BOOST_SECONDS = 1.6
export const BOOST_COST = 0.3
const BOOST_TORQUE = 1.62

// --- state -----------------------------------------------------------------

export interface CarInput {
  /** −1 hard left … +1 hard right. */
  steer: number
  /** 0..1. Slows the car and moves its weight forward. */
  brake: number
  /** Held: locks the rear wheels. This is the drift. */
  handbrake: boolean
  /** Edge-triggered: spend a measure of ember. */
  boost: boolean
}

/** One corner of the car. Everything the renderer and the ear want is here. */
export interface Wheel {
  /** Radians of steering. Zero on the rears. */
  steer: number
  /** Angular velocity, radians per second. */
  omega: number
  /** Accumulated rotation. The renderer spins the mesh with this. */
  spin: number
  /** Vertical load, newtons. Zero means it is off the ground. */
  load: number
  /** Lateral slip, radians, relaxed. */
  slipAngle: number
  /** Longitudinal slip. −1 is locked solid, positive is spinning up. */
  slipRatio: number
  /** How much of this tyre's grip is spent, 0..1. */
  used: number
  /** Metres the suspension is compressed past its resting point. */
  travel: number
  /** 0..1. How hot the disc is, which is what makes it glow. */
  heat: number
}

export interface CarState {
  /** Metres along the road. */
  s: number
  /** Metres right of the middle of it. */
  n: number
  /** Radians the car points away from the road, right positive. */
  psi: number

  /** Body-frame velocity: along the car's nose, and out of its right flank. */
  vs: number
  vn: number
  /** Radians per second, right positive. */
  yaw: number

  /** What the front wheels are actually doing, radians. Lags the input. */
  steerAngle: number

  wheels: Wheel[]

  // --- the engine ----------------------------------------------------------
  /** Radians per second at the crank. */
  engineOmega: number
  /** 0..1 across idle to the limiter. What the ear and the tacho want. */
  revs: number
  gear: number
  /** Seconds of torque cut left. Non-zero means a gear is going in. */
  shiftLeft: number
  /** 0..1, what the driver is asking of it. */
  throttle: number

  // --- what you have -------------------------------------------------------
  /** 0..1. Spent in measures of BOOST_COST. */
  ember: number
  /** Seconds of burn left. */
  boostLeft: number
  /** Seconds held sideways in the current drift, 0 when straight. */
  driftCharge: number

  // --- how it is sitting ---------------------------------------------------
  /** Radians. Positive leans the car to its right. */
  roll: number
  /** Radians. Positive lifts the nose. */
  pitch: number
  /** Metres the whole body has dropped on its springs. */
  heave: number

  // --- what just happened, cleared every step ------------------------------
  /** 0..1 severity of rock contact, continuous while scraping. */
  hitWall: number
  /** 0..1 on the single step of an impact. Shake, sparks and sound. */
  slam: number
  /** Whether the car was against the rock last step. */
  touching: boolean
  /** True on the step a stone was clipped. */
  hitStone: boolean
  /** Off the stone and into the loose stuff. */
  rough: boolean
  /** 0, 1 or 2 — the tier of a drift that was just released. */
  released: number
  /** Longitudinal acceleration, m/s². Kept for load transfer and the camera. */
  accel: number
  /** Lateral acceleration, m/s². Same. */
  lateral: number
  /** True while the model is holding the car out of a spin. */
  caught: boolean

  // --- totals --------------------------------------------------------------
  strikes: number
  driftMs: number
  /** Seconds since the flag. */
  elapsed: number
  finished: boolean

  /** Scratch, so a step allocates nothing. */
  road: RoadAt
  /** Which boulders have already been hit, so one stone is one strike. */
  struck: Set<number>
}

function makeWheel(): Wheel {
  return {
    steer: 0,
    omega: 0,
    spin: 0,
    load: MASS * G * 0.25,
    slipAngle: 0,
    slipRatio: 0,
    used: 0,
    travel: 0,
    heat: 0,
  }
}

export function createCar(track: Track): CarState {
  const road = roadAt(track, track.start)
  return {
    s: track.start,
    n: 0,
    psi: 0,
    vs: 0,
    vn: 0,
    yaw: 0,
    steerAngle: 0,
    wheels: [makeWheel(), makeWheel(), makeWheel(), makeWheel()],
    engineOmega: IDLE_OMEGA,
    revs: 0,
    gear: 0,
    shiftLeft: 0,
    throttle: 0,
    ember: 0.34,
    boostLeft: 0,
    driftCharge: 0,
    roll: 0,
    pitch: 0,
    heave: 0,
    hitWall: 0,
    slam: 0,
    touching: false,
    hitStone: false,
    rough: false,
    released: 0,
    accel: 0,
    lateral: 0,
    caught: false,
    strikes: 0,
    driftMs: 0,
    elapsed: 0,
    finished: false,
    road,
    struck: new Set(),
  }
}

/** Metres of loose ground either side of the stone, before the wall. */
export function vergeWidth(room: number): number {
  return 0.85 + room * 0.95
}

/** How far off the middle the rock actually is. */
export function wallAt(road: RoadAt): number {
  return road.width + vergeWidth(road.room)
}

/** Speed in metres per second — what the camera, the sound and the dust want. */
export function speedOf(car: CarState): number {
  return Math.hypot(car.vs, car.vn)
}

/**
 * How sideways the car is, radians.
 *
 * The angle between where it is pointing and where it is actually going. This
 * is the number the whole game is about: it fills the ember, it bends the
 * camera, it makes the smoke, and it is what a drift *is*.
 */
export function slipOf(car: CarState): number {
  if (Math.abs(car.vs) < 1.5) return 0
  return Math.atan2(car.vn, Math.abs(car.vs))
}

/** 0..1 — how much the rear wheels are outrunning the road. */
export function wheelspinOf(car: CarState): number {
  return Math.max(
    0,
    Math.min(1, (Math.max(car.wheels[2].slipRatio, car.wheels[3].slipRatio) - 0.08) / 0.5),
  )
}

/** 0..1 — how much anything is dragging rather than rolling. */
export function lockupOf(car: CarState): number {
  let worst = 0
  for (const wheel of car.wheels) worst = Math.min(worst, wheel.slipRatio)
  return Math.max(0, Math.min(1, -worst - 0.12))
}

/** 0..1 lateral scrub at an axle. Averaged, and normalised to where grip ends. */
export function scrubOf(car: CarState, rear: boolean): number {
  const a = car.wheels[rear ? 2 : 0]
  const b = car.wheels[rear ? 3 : 1]
  const slip = (Math.abs(a.slipAngle) + Math.abs(b.slipAngle)) / 2
  return Math.max(0, Math.min(1, (slip - 0.09) / 0.3))
}

// --- one step ---------------------------------------------------------------

/** How much lock the wheels get. Less at speed, or it is undriveable. */
function maxSteer(v: number): number {
  return Math.max(0.12, 0.55 - v * 0.0076)
}

/** Where each wheel sits, relative to the centre of mass: along, then right. */
const WHEEL_AT: [number, number][] = [
  [FRONT, -TRACK_HALF],
  [FRONT, TRACK_HALF],
  [-REAR, -TRACK_HALF],
  [-REAR, TRACK_HALF],
]

/** Scratch, so a step allocates nothing at all. */
const forceX = [0, 0, 0, 0]
const forceY = [0, 0, 0, 0]

function integrate(track: Track, car: CarState, input: CarInput, dt: number) {
  const road = roadAt(track, car.s, car.road)
  const v = Math.hypot(car.vs, car.vn)
  const speed = Math.max(0.5, v)

  // --- surface -------------------------------------------------------------
  const half = road.width
  car.rough = Math.abs(car.n) > half
  const surfaceGrip = car.rough ? 0.62 : 1 - road.wet * 0.14
  const rollingDrag = car.rough ? 0.09 : 0.0135
  const mu = GRIP * surfaceGrip

  // --- steering ------------------------------------------------------------
  // The wheels take a moment to get there. Without this the car changes
  // direction the instant a key goes down and feels weightless.
  const wanted = Math.max(-1, Math.min(1, input.steer)) * maxSteer(v)
  car.steerAngle += (wanted - car.steerAngle) * (1 - Math.exp(-8.6 * dt))

  /*
    The hand on the wheel.

    Past `MAX_SLIP` a fraction of the correction goes in whether you asked for
    it or not. See `CATCH` — this is a deliberate and stated dishonesty, and
    the alternative is a game that cannot be played with two arrow keys.
  */
  const beta = slipOf(car)
  car.caught = false
  if (Math.abs(beta) > MAX_SLIP * 0.72) {
    const over = (Math.abs(beta) - MAX_SLIP * 0.72) / (MAX_SLIP * 0.28)
    const correction = -Math.sign(beta) * Math.min(1, over) * maxSteer(v) * CATCH
    car.steerAngle += correction * (1 - Math.exp(-9 * dt))
    car.caught = over > 0.5
  }
  const delta = car.steerAngle

  // --- load ----------------------------------------------------------------
  /*
    Weight moves, and every interesting thing a car does is downstream of it.

    Forward under braking, backward under power, outward through a corner. A
    wheel's share can reach zero — a car on the brakes into a hairpin genuinely
    does lift the inside rear — and a wheel carrying nothing generates nothing,
    which is where lift-off oversteer comes from without anybody writing a rule
    for it.
  */
  const weight = MASS * G + LIFT * v * v
  const staticFront = (weight * REAR) / WHEELBASE
  const staticRear = (weight * FRONT) / WHEELBASE
  const aeroBias = LIFT * v * v * (LIFT_FRONT - REAR / WHEELBASE)

  const longTransfer = (MASS * car.accel * CG_HEIGHT) / WHEELBASE
  const latTransfer = (MASS * car.lateral * CG_HEIGHT) / (TRACK_HALF * 2)

  const axleFront = Math.max(0, staticFront + aeroBias - longTransfer)
  const axleRear = Math.max(0, staticRear - aeroBias + longTransfer)
  // Split front/rear by how stiff each end is in roll. A stiffer end takes
  // more of the transfer and therefore lets go first, which is the one knob
  // that decides whether a car understeers or oversteers.
  const rollFront = 0.54
  const loads = [
    Math.max(0, axleFront / 2 - latTransfer * rollFront),
    Math.max(0, axleFront / 2 + latTransfer * rollFront),
    Math.max(0, axleRear / 2 - latTransfer * (1 - rollFront)),
    Math.max(0, axleRear / 2 + latTransfer * (1 - rollFront)),
  ]

  // --- the engine ----------------------------------------------------------
  /*
    There is no throttle pedal, and there is a traction control.

    The car drives itself forward — that is the decision that makes a
    forty-second race playable one-handed on a phone — so "throttle" is only
    ever on or off with the brake. Which leaves a problem the bicycle model
    never had: a rear-drive car at full lock and full power *will* light the
    back up and stay there, correctly and permanently, and the player holding
    an arrow key has no foot to lift.

    So it lifts for them, past about sixteen degrees of slip, and only when the
    handbrake is *not* down. Deliberate drifts are untouched; the accidental
    ones that would otherwise run away gather themselves up. Every rally car
    built this century has this and it is called the same thing.
  */
  const sideways = Math.abs(beta)
  car.throttle = input.brake > 0.05 ? 0 : 1
  if (!input.handbrake && sideways > 0.28) {
    car.throttle *= Math.max(0.45, 1 - (sideways - 0.28) * 1.7)
  }
  if (car.shiftLeft > 0) car.shiftLeft = Math.max(0, car.shiftLeft - dt)

  const ratio = GEARS[car.gear] * FINAL
  // The clutch: below the point where the wheels can turn the engine over, the
  // engine idles and slips against them. That is what a standing start is.
  const drivenOmega = (car.wheels[2].omega + car.wheels[3].omega) / 2
  car.engineOmega = Math.max(IDLE_OMEGA, Math.min(LIMIT_OMEGA * 1.02, drivenOmega * ratio))
  car.revs = Math.max(
    0,
    Math.min(1.02, (car.engineOmega - IDLE_OMEGA) / (LIMIT_OMEGA - IDLE_OMEGA)),
  )

  if (car.shiftLeft <= 0) {
    if (car.gear < GEARS.length - 1 && car.revs > SHIFT_UP) {
      car.gear++
      car.shiftLeft = SHIFT_TIME
    } else if (car.gear > 0 && car.revs < SHIFT_DOWN) {
      car.gear--
      car.shiftLeft = SHIFT_TIME * 0.7
    }
  }

  let crankTorque = 0
  if (car.shiftLeft <= 0 && car.throttle > 0) {
    crankTorque = PEAK_TORQUE * torqueCurve(car.revs) * car.throttle
    if (car.boostLeft > 0) crankTorque *= BOOST_TORQUE
    // The limiter, so the last gear is drag-limited rather than rev-limited.
    if (car.revs > 1) crankTorque = 0
  }
  const axleTorque = crankTorque * ratio * DRIVE_LOSS
  /*
    An open differential, mostly.

    Half the torque to each rear wheel, plus a spring pulling their speeds
    together. A fully open diff sends everything to whichever wheel has given
    up, which is correct and makes a hairpin exit a stationary firework; a
    fully locked one drags the car straight. This is what a plated diff does
    and it is worth the four lines.
  */
  const diffLock = (car.wheels[3].omega - car.wheels[2].omega) * 26

  // --- the wheels ----------------------------------------------------------
  const brakeDemand = Math.max(0, Math.min(1, input.brake))
  const brakeTorque = [
    (BRAKE_TORQUE * BRAKE_BIAS) / 2,
    (BRAKE_TORQUE * BRAKE_BIAS) / 2,
    (BRAKE_TORQUE * (1 - BRAKE_BIAS)) / 2,
    (BRAKE_TORQUE * (1 - BRAKE_BIAS)) / 2,
  ]

  const cosD = Math.cos(delta)
  const sinD = Math.sin(delta)
  /*
    The relaxation, with a floor under it.

    Strictly the rate is speed over the relaxation length, which correctly goes
    to nothing as the car stops. Taken literally that means a stationary tyre
    can never build any force at all, and the car will not pull away from the
    line — it sits there at walking pace with the engine spinning up and
    nothing reaching the road. A tyre standing still still deflects through its
    own carcass, so the rate is floored at a few metres a second's worth.
  */
  const relaxRate = 1 - Math.exp(-(Math.max(speed, 4) / RELAX) * dt)

  let totalX = 0
  let totalY = 0
  let moment = 0

  for (let i = 0; i < 4; i++) {
    const wheel = car.wheels[i]
    const [along, across] = WHEEL_AT[i]
    const front = i < 2
    wheel.steer = front ? delta : 0
    wheel.load = loads[i]

    // Velocity of this corner of the car, in the body frame.
    const cornerX = car.vs - car.yaw * across
    const cornerY = car.vn + car.yaw * along

    // And in the wheel's own frame, which for the fronts is turned by delta.
    const wheelX = front ? cornerX * cosD + cornerY * sinD : cornerX
    const wheelY = front ? -cornerX * sinD + cornerY * cosD : cornerY

    // --- slip --------------------------------------------------------------
    const rolling = Math.max(Math.abs(wheelX), 1)
    const targetRatio = Math.max(
      -1.5,
      Math.min(2.5, (wheel.omega * WHEEL_RADIUS - wheelX) / rolling),
    )
    const targetAngle = Math.atan2(wheelY, Math.max(Math.abs(wheelX), 2.2))
    // Relaxed, not instantaneous — a tyre needs about half a metre of rolling
    // to build its force, and that lag is most of the car's feel.
    wheel.slipRatio += (targetRatio - wheel.slipRatio) * relaxRate
    wheel.slipAngle += (-targetAngle - wheel.slipAngle) * relaxRate

    // --- force -------------------------------------------------------------
    const budget = Math.max(1, mu * wheel.load)
    let fx = budget * Math.tanh(STIFF_LONG * wheel.slipRatio)
    let fy = budget * Math.tanh(STIFF_LAT * wheel.slipAngle)

    /*
      The friction circle.

      One budget of grip, and cornering spends it. A rear tyre already at its
      lateral limit has nothing left to put power down with, so drive falls
      away exactly when you are asking the most of the corner — brake early,
      keep the tyres under the limit, and you get the drive back on the exit,
      which is what racing *is*. It is also what makes a locked wheel stop
      steering, and therefore what makes the handbrake work.
    */
    const total = Math.hypot(fx, fy)
    wheel.used = Math.min(1, total / budget)
    if (total > budget) {
      const scale = budget / total
      fx *= scale
      fy *= scale
    }

    // --- the wheel itself --------------------------------------------------
    let drive = 0
    if (!front) {
      drive = axleTorque / 2 + (i === 2 ? diffLock : -diffLock)
    }
    let stopping = brakeTorque[i] * brakeDemand
    if (!front && input.handbrake) stopping += HANDBRAKE_TORQUE / 2

    const inertia = front
      ? WHEEL_INERTIA
      : WHEEL_INERTIA +
        ENGINE_INERTIA * ratio * ratio * 0.5 * (car.shiftLeft > 0 ? 0.12 : 1)

    /*
      Semi-implicit, and it has to be.

      The tyre's longitudinal force is a very stiff function of wheel speed —
      a few radians a second is the difference between rolling and spinning —
      and stepping that explicitly at 120Hz makes the wheel oscillate between
      full drive and full braking, which sounds and looks like the car is
      being shaken apart. One Newton step against the tyre's own slope costs a
      divide and makes it unconditionally stable.
    */
    const slope =
      ((budget * STIFF_LONG) / Math.cosh(STIFF_LONG * wheel.slipRatio) ** 2 / rolling) *
      WHEEL_RADIUS
    const net = drive - fx * WHEEL_RADIUS - Math.sign(wheel.omega) * stopping
    let omega = wheel.omega + (dt * net) / (inertia + dt * slope * WHEEL_RADIUS)

    // A brake that would drive the wheel backwards has locked it instead.
    if (stopping > 0 && Math.sign(omega) !== Math.sign(wheel.omega) && wheel.omega !== 0) {
      omega = 0
    }
    if (input.handbrake && !front) omega *= Math.exp(-14 * dt)
    wheel.omega = omega
    wheel.spin += omega * dt

    // Discs get hot and glow. Slowly up, slowly down, so it lags the pedal.
    const work = (brakeDemand * Math.abs(wheelX)) / 40
    wheel.heat += (Math.min(1, work) - wheel.heat) * (1 - Math.exp(-(0.35 + work * 3) * dt))

    // --- back into the body frame ------------------------------------------
    const bodyX = front ? fx * cosD - fy * sinD : fx
    const bodyY = front ? fx * sinD + fy * cosD : fy
    forceX[i] = bodyX
    forceY[i] = bodyY
    totalX += bodyX
    totalY += bodyY
    moment += along * bodyY - across * bodyX
  }

  // --- everything else acting on the body ----------------------------------
  let along = totalX
  along -= DRAG * v * Math.abs(car.vs) * (car.boostLeft > 0 ? 0.86 : 1)
  along -= MASS * G * rollingDrag * Math.sign(car.vs || 1)
  // The road tilts under it.
  along -= MASS * G * road.grade

  const accel = along / MASS + car.vn * car.yaw
  const lateral = totalY / MASS - car.vs * car.yaw
  car.accel = accel
  car.lateral = lateral
  car.vs += accel * dt
  car.vn += lateral * dt
  car.yaw += (moment / INERTIA) * dt

  // Never reverse, never stop dead, never exceed the ceiling.
  car.vs = Math.max(CRAWL, Math.min(SPEED_CEILING, car.vs))
  // Yaw damping. A real car has aerodynamic and mechanical damping this model
  // does not; without a little of it the back end oscillates for ever.
  car.yaw *= Math.exp(-(0.9 + v * 0.03) * dt)
  car.yaw = Math.max(-MAX_YAW_RATE, Math.min(MAX_YAW_RATE, car.yaw))

  /*
    And a firm hand at the very edge.

    `catchIt` above steers for you; this bleeds the sideways velocity itself
    once the angle is past what the car will hold. Smoothly, over about a
    tenth of a second, so it reads as the tyres finding grip again rather than
    as the game taking the car off you.
  */
  const held = Math.max(3, Math.abs(car.vs))
  const maxLateral = held * Math.tan(MAX_SLIP)
  if (Math.abs(car.vn) > maxLateral) {
    const target = Math.sign(car.vn) * maxLateral
    // The further past it goes the harder it is pulled back, so `MAX_SLIP` is
    // a limit the car actually reaches rather than a number in a comment. A
    // constant rate here is a spring the tyres can simply out-pull, and the
    // car sits at fifty-seven degrees while the file claims forty.
    const over = (Math.abs(car.vn) - maxLateral) / Math.max(1, maxLateral)
    const rate = 10 + Math.min(3, over) * 80
    car.vn += (target - car.vn) * (1 - Math.exp(-rate * dt))
    car.yaw *= Math.exp(-(2.6 + Math.min(3, over) * 5) * dt)
  }

  // --- how it is sitting ---------------------------------------------------
  /*
    Roll, pitch and heave read straight off the forces rather than being an
    animation played over the top. They cost three lines and they are the
    difference between a car with mass and a box sliding along a groove.
  */
  const wantRoll = Math.max(-0.16, Math.min(0.16, (car.lateral / G) * 0.115))
  const wantPitch = Math.max(-0.1, Math.min(0.075, (-car.accel / G) * 0.085))
  const wantHeave = Math.max(-0.05, Math.min(0.02, -(weight - MASS * G) / 160_000))
  car.roll += (wantRoll - car.roll) * (1 - Math.exp(-9 * dt))
  car.pitch += (wantPitch - car.pitch) * (1 - Math.exp(-8 * dt))
  car.heave += (wantHeave - car.heave) * (1 - Math.exp(-7 * dt))

  // Per-wheel travel, off the load each is carrying. Same reasoning: it agrees
  // with the physics because it *is* the physics.
  const restLoad = (MASS * G) / 4
  for (let i = 0; i < 4; i++) {
    const wheel = car.wheels[i]
    const want = Math.max(-0.09, Math.min(0.1, (wheel.load - restLoad) / 42_000))
    wheel.travel += (want - wheel.travel) * (1 - Math.exp(-11 * dt))
  }

  // --- into the road's frame ----------------------------------------------
  const cos = Math.cos(car.psi)
  const sin = Math.sin(car.psi)
  const alongRoad = car.vs * cos - car.vn * sin
  let acrossRoad = car.vs * sin + car.vn * cos

  const denom = Math.max(0.4, 1 - car.n * road.curv)
  const sDot = alongRoad / denom

  car.s += sDot * dt
  car.n += acrossRoad * dt
  car.psi += (car.yaw - road.curv * sDot) * dt
  // An angle, so it lives on a circle. Without this a couple of hard corners
  // leave psi at twelve radians and every consumer of it — the ghost, the
  // spirit's own steering — is reading a number that no longer means anything.
  if (car.psi > Math.PI) car.psi -= Math.PI * 2
  else if (car.psi < -Math.PI) car.psi += Math.PI * 2

  /*
    The rock.

    Two separate things, and the first version had them as one, which is why
    the car used to stop dead against a wall and take six seconds to get going
    again: the *impact* is an impulse and happens once, while the *scrape* is a
    force and is therefore per second. Charging the impact every physics
    substep meant a car sliding along the wall lost five per cent of its speed
    a hundred and twenty times a second.
  */
  car.slam = 0
  car.hitWall = 0
  const limit = wallAt(road) - CAR_HALF_WIDTH
  const touching = Math.abs(car.n) > limit
  if (touching) {
    const side = Math.sign(car.n)
    car.n = side * limit
    const into = acrossRoad * side

    /*
      Touching it costs, whether or not you are pushing into it.

      This started as `if (into > 0)`, which is the obvious reading — a wall
      only hurts you if you drive at it — and it made the whole game wrong.
      A car pinned against the rock while cornering has no outward velocity
      left to speak of, so it paid nothing, and *riding the wall through every
      corner turned out to be five seconds a lap faster than braking*. The
      brake, the drift and the entire racing line were decoration.

      A wall is a friction surface. Leaning on it scrubs speed off, every
      instant you are on it, and that one change is what makes the road worth
      driving properly.
    */
    car.hitWall = Math.max(0.14, Math.min(1, into / 9))
    if (into > 0 && !car.touching) {
      // The impact, once, on the step contact begins.
      car.slam = car.hitWall
      car.vs *= 1 - Math.min(0.42, car.hitWall * 0.48)
      car.yaw *= 0.5
    }
    // And the scrape, per second, for as long as it lasts. Never a stop: a
    // wall that ends a run in a game lasting forty seconds ends the game.
    car.vs *= 1 - Math.min(0.5, (0.6 + car.hitWall * 1.8) * dt)
    // The stone turns the car back along itself rather than letting it grind
    // in at an angle, which is what a wall actually does to a car.
    car.psi -= side * (0.6 + car.hitWall * 1.8) * dt
    acrossRoad = into > 0 ? -into * 0.22 * side : Math.min(0, into) * side
    car.driftCharge = 0

    // back out of the road frame
    car.vs = alongRoad * cos + acrossRoad * sin
    car.vn = -alongRoad * sin + acrossRoad * cos
    car.vs = Math.max(CRAWL, car.vs)
  }
  car.touching = touching

  // --- stones --------------------------------------------------------------
  car.hitStone = false
  for (let i = 0; i < track.boulders.length; i++) {
    if (car.struck.has(i)) continue
    const stone = track.boulders[i]
    if (Math.abs(stone.s - car.s) > 2.4) continue
    if (Math.abs(stone.n - car.n) > stone.size * 0.75 + CAR_HALF_WIDTH) continue
    car.struck.add(i)
    car.hitStone = true
    car.strikes++
    car.vs = Math.max(CRAWL, car.vs * (1 - Math.min(0.42, 0.14 + stone.size * 0.22)))
    car.yaw += (car.n > stone.n ? 1 : -1) * stone.size * 0.9
    car.driftCharge = 0
  }

  // --- drift, ember, boost -------------------------------------------------
  /*
    What counts as a drift.

    Sideways *and* moving, and it no longer has to be on the handbrake: with
    four wheels and a differential the car will step out on the power on its
    own out of a slow corner, and a game that only credited the button would
    be refusing to notice the best thing the new model does.
  */
  const slip = Math.abs(slipOf(car))
  const drifting = slip > 0.14 && v > 12
  car.released = 0

  if (drifting) {
    car.driftCharge += dt
    car.driftMs += dt * 1000
    car.ember = Math.min(1, car.ember + dt * Math.min(1, slip * 2.4) * 0.115)
  } else if (car.driftCharge > 0) {
    /*
      Letting go is the whole mechanic.

      The car straightens and shoves. Two tiers, because one is a reward and
      three is a spreadsheet — you can feel the difference between "I got the
      corner" and "I got the corner *properly*", and that is enough.
    */
    if (car.driftCharge > 0.85) car.released = 2
    else if (car.driftCharge > 0.38) car.released = 1
    if (car.released > 0) {
      car.vs += 2.4 + car.released * 2.4
      car.ember = Math.min(1, car.ember + 0.09 + car.released * 0.07)
      // Snap the slip out. This is why it feels like a launch rather than a
      // gradual recovery: the sideways energy becomes forward energy.
      car.vn *= 0.35
    }
    car.driftCharge = 0
  }

  // Threading the rock fills it too — the "close" in "close to the wall".
  const gap = wallAt(road) - Math.abs(car.n)
  if (gap < 1.5 && car.hitWall === 0 && v > 20) {
    car.ember = Math.min(1, car.ember + dt * (1.5 - gap) * 0.16)
  }

  if (input.boost && car.boostLeft <= 0 && car.ember >= BOOST_COST) {
    car.ember -= BOOST_COST
    car.boostLeft = BOOST_SECONDS
  }
  if (car.boostLeft > 0) car.boostLeft = Math.max(0, car.boostLeft - dt)

  car.elapsed += dt
  if (!car.finished && car.s >= track.finishAt) car.finished = true
  if (car.s >= track.length) car.s = track.length
}

/**
 * Step the car forward by however long the last frame took.
 *
 * Fixed sub-steps, always. A tyre model integrated at whatever interval the
 * browser felt like handing over is a tyre model with a different grip level
 * on a phone than on a laptop — and the two of you would be racing ghosts
 * recorded under different physics.
 */
const FIXED = 1 / 120

export function advanceCar(
  track: Track,
  car: CarState,
  input: CarInput,
  delta: number,
): void {
  // A tab that was in the background hands back a huge delta. Simulating it is
  // both slow and wrong; the honest thing is to drop the missing time.
  let left = Math.min(0.1, delta)
  // Edge-triggered, so holding the key does not empty the meter in one frame.
  const once: CarInput = { ...input }
  while (left > 0) {
    const dt = Math.min(FIXED, left)
    integrate(track, car, once, dt)
    once.boost = false
    left -= dt
  }
}

// --- writing it down --------------------------------------------------------

/**
 * Turns a run into the four integers a sample it is stored as.
 *
 * Sampling on elapsed time rather than per frame, so a run recorded at 120fps
 * and one recorded at 30fps are the same length and replay identically.
 */
export class Recorder {
  private readonly path: number[] = []
  private next = 0

  sample(car: CarState) {
    const elapsedMs = car.elapsed * 1000
    while (elapsedMs >= this.next) {
      this.push(car)
      this.next += SAMPLE_MS
    }
  }

  private push(car: CarState) {
    const slip = Math.min(1, Math.abs(slipOf(car)) / 0.6)
    const state =
      (Math.round(slip * SAMPLE_DRIFT) & SAMPLE_DRIFT) |
      (car.boostLeft > 0 ? SAMPLE_BOOST : 0) |
      (car.rough ? SAMPLE_ROUGH : 0) |
      (car.throttle < 0.5 ? SAMPLE_BRAKE : 0) |
      (wheelspinOf(car) > 0.3 ? SAMPLE_SLIDE : 0)
    this.path.push(
      Math.round(car.n * 1000),
      Math.round(car.s * 100),
      Math.round(car.psi * 1000),
      state,
    )
  }

  finish(car: CarState): RallyRun {
    this.push(car)
    return {
      v: 3,
      timeMs: Math.round(car.elapsed * 1000),
      path: this.path.slice(),
      strikes: car.strikes,
      driftMs: Math.round(car.driftMs),
    }
  }
}
