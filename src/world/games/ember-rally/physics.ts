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
  SAMPLE_SHORTCUT,
  SAMPLE_SLIDE,
  type RallyRun,
} from './model'
import {
  END_WALL,
  roadAt,
  galeAt,
  roadAtRoute,
  swayRollAt,
  vergeWidth,
  type RoadAt,
  type Track,
} from './track'
import { DERIVED, TUNE } from './tuning'

// Re-exported because it lived here first and half the racer imports it from
// here. It belongs to the road — see the note beside it in track.ts.
export { vergeWidth }

// --- the machine -----------------------------------------------------------

/**
 * **Roughly forty of the numbers that used to be here now live in `tuning.ts`.**
 *
 * Not because they stopped belonging to the physics — they are still the
 * physics — but because every one of them was arrived at by driving the car,
 * and the round trip through an editor and a rebuild is long enough that the
 * feeling being judged does not survive it. They are dials now, with a slider
 * each in the control room at `/dev7731`, and the long note explaining what is
 * wrong when each one is wrong has moved with the number rather than being
 * left behind over an empty line.
 *
 * `TUNE.x` is the live value and `DERIVED.x` is the handful that are worked
 * out from the others — drag from the top speed, yaw inertia from the mass.
 * Both are plain mutable objects and both are safe to read every step.
 *
 * What is left in this file is everything that is *not* a matter of taste: the
 * geometry, the gearbox, the shape of the torque curve, and the constants that
 * would break the model rather than change its feel.
 */
/** Front axle and rear axle, metres from the centre of mass. */
const FRONT = 1.14
const REAR = 1.22
const WHEELBASE = FRONT + REAR
/** Half the distance between the wheels on one axle, metres. */
const TRACK_HALF = 0.78

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

/**
 * How sharply a tyre answers being *driven* rather than being turned.
 *
 * The cornering pair are dials — `TUNE.frontBite` and `TUNE.rearBite`, and the
 * note about why the rear must stay stiffer than the front has gone with them.
 * This one is not, because nothing about how the car feels turns on it: it
 * decides where wheelspin and lockup begin, and both of those are already
 * governed by the power and the brakes.
 */
const STIFF_LONG = 13

/**
 * Tyre load sensitivity: the exponent that is not 1.
 *
 * A tyre's peak force is **not** proportional to the load on it. Real rubber
 * goes as roughly `Fz^0.8`, because the friction coefficient falls as the tyre
 * is pressed harder — so a pair of tyres carrying 3 kN and 1 kN generate
 * meaningfully *less* between them than two carrying 2 kN each.
 *
 * Without this, load transfer is free. The model was linear in load, which
 * meant an axle's total grip did not depend on how the weight was split across
 * it — so `rollFront` below, documented as "the one knob that decides whether
 * a car understeers or oversteers", in fact decided nothing at all, and
 * cornering had no cost until the tyre saturated.
 *
 * With it: leaning on the outside tyre costs real grip, the limit arrives
 * progressively instead of as a cliff, and the roll balance becomes a knob
 * that works.
 */
const LOAD_SENSITIVITY = 0.2

// --- aerodynamics ----------------------------------------------------------

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
/** One reverse, deliberately low. It is for getting out of trouble, not racing. */
const REVERSE_RATIO = 3.4
const FINAL = 4.1
/**
 * Seconds for weight to actually arrive where the accelerations say it is.
 *
 * The suspension, as one number. See the note in `integrate` — without it,
 * lifting off mid-corner unloads the rear in a single step and the car snaps.
 */
const LOAD_LAG = 0.26
const DRIVE_LOSS = 0.92
const IDLE_RPM = 1100
const LIMIT_RPM = 7200
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

// --- limits ----------------------------------------------------------------

/** Radians per second. A backstop, not a handling parameter. */
const MAX_YAW_RATE = 2.9


/**
 * Nothing may exceed this, boost included: 158 km/h.
 *
 * A backstop and not a cap. The car tops out at 131 on its own and 143 on the
 * ember, both against the air, so this is never reached in play — which is the
 * point. A clamp you meet is a wall you can feel, and the moment a player can
 * feel it, drag has stopped being the thing that decides a straight.
 */
const SPEED_CEILING = 44
/** How fast it will go backwards. Slow: reverse is for getting unstuck. */
const REVERSE_LIMIT = 7

// --- the drift -------------------------------------------------------------

/** How much lock has to be on before the handbrake will start one. */
const DRIFT_ENTER_STEER = 0.25
/** Below this there is nothing to drift. */
const DRIFT_EXIT_SPEED = 7
/** Arrows this near centre count as going straight. */
const DRIFT_HOLD_STEER = 0.2
/** And this long of it lets the drift go. */
const DRIFT_STRAIGHT_EXIT = 2
/** The most yaw the arcade drift will ask for, radians per second. */
const DRIFT_TURN = 1.3
/** How fast the arcade model takes over, and hands back. */
const DRIFT_BLEND_IN = 7
const DRIFT_BLEND_OUT = 5
/** How far hanging it right out pulls the ceiling below TUNE.driftTopSpeed. */
const DRIFT_ANGLE_COST = 0.45
/** How hard the ceiling pulls, per second. Fast enough to be the entry cost. */
const DRIFT_CEILING_RATE = 1.3
/*
  And how hard it gathers back *up* to it.

  Higher than it looks like it needs to be, because it is not acting alone: the
  scrub is still taking its cut every frame, and the two of them settle at
  `ceiling × b / (a + b)` where `a` is the scrub's bite and `b` is this. At
  0.85 that landed at 53 km/h against a dial reading 72 — better than the crawl
  it replaced, and still not what the dial says. This is high enough that the
  scrub is the small term and the dial is the answer.
*/
const DRIFT_SETTLE_RATE = 4.2
/** The most the slide will aim across the road to get back to its line, radians. */
const DRIFT_AIM = 0.42
/** How briskly the course is steered onto the aim, per second. */
const DRIFT_COURSE = 2.6
/**
 * Metres of rock a slide keeps in hand, beyond half the car's width.
 *
 * Not a safety limit on where the car may *be* — it is a limit on where the
 * car may be *aimed*. A slide overshoots its aim and comes back, so an aim
 * with no margin is a wall with a car arriving at it.
 */
const DRIFT_ROCK_MARGIN = 1.25

/** Kept so nothing that imported it breaks; any amount is spendable now. */
export const BOOST_COST = 1
/**
 * The least that is worth spending.
 *
 * Not a minimum you have to reach — a floor under "the bar is empty", so that
 * a press with nothing in it is not a boost of two hundredths of a second.
 */
const BOOST_FLOOR = 0.04

// --- state -----------------------------------------------------------------

/**
 * What is being asked of the car.
 *
 * `throttle` and `brake` are two pedals, and which way the car goes when you
 * press them depends on whether it is in reverse — see `car.reversing`. Going
 * forward, throttle drives and brake stops. Once it has come to a stand with
 * the brake still held it selects reverse, and from then on the *brake* is the
 * one making it go and the throttle is the one stopping it, which is how
 * anybody who has ever driven a car expects a car to work.
 */
export interface CarInput {
  /** −1 hard left … +1 hard right. */
  steer: number
  /** 0..1. Forward — or backward, once the car is reversing. */
  throttle: number
  /** 0..1. Stops it, and held at a stand, selects reverse. */
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
  /** And how fast it is moving. A spring needs a velocity — see DERIVED.bodyRoll. */
  travelVel: number
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
  /** 0..1, how hard the brake is actually being pressed. Lamps, sound, ghost. */
  braking: number
  /** Going backwards. The two pedals swap jobs — see `CarInput`. */
  reversing: boolean
  /** Seconds the pedal has been held at a stand, asking for the other way. */
  shiftHold: number

  // --- what you have -------------------------------------------------------
  /** 0..1. Spent in measures of BOOST_COST. */
  ember: number
  /** Seconds of burn left. */
  boostLeft: number
  /** Seconds held sideways in the current drift, 0 when straight. */
  driftCharge: number

  // --- the drift -----------------------------------------------------------
  /** In the arcade drift, where the arrows steer the path. See `integrate`. */
  drifting: boolean
  /** 0..1, how far that model has taken over. Eased, so entry is not a snap. */
  driftBlend: number
  /** The angle it is hanging at, radians. Negative is hung out to the right. */
  driftAngle: number
  /** Seconds the arrows have been near centre while drifting. Two lets go. */
  driftStraight: number

  // --- how it is sitting ---------------------------------------------------
  /** Radians. Positive leans the car to its right. */
  roll: number
  /** Radians. Positive lifts the nose. */
  pitch: number
  /** Metres the whole body has dropped on its springs. */
  heave: number
  /**
   * And how fast each of those is moving.
   *
   * The shell is on springs rather than on a lag, which needs a velocity to be
   * a spring at all — see DERIVED.bodyRoll. Purely how the car is *drawn*: nothing
   * that decides where it goes has ever read any of these six numbers.
   */
  rollVel: number
  pitchVel: number
  heaveVel: number

  /** Committed to the Rootwake's independent tunnel. */
  shortcut: boolean

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
  /** Lateral acceleration of the body frame, m/s². */
  lateral: number
  /** What the corner is pulling, m/s². Right positive. Roll and transfer. */
  cornering: number
  /**
   * The same two accelerations as the *springs* have felt them — lagged.
   *
   * Load transfer is computed from these rather than from the instantaneous
   * values, because weight travels through suspension and that takes time.
   * See the note in `integrate`.
   */
  pitchLoad: number
  rollLoad: number
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
    load: TUNE.weight * TUNE.gravity * 0.25,
    slipAngle: 0,
    slipRatio: 0,
    used: 0,
    travel: 0,
    travelVel: 0,
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
    braking: 0,
    reversing: false,
    shiftHold: 0,
    // Empty at the flag. It is earned, so starting with a third of one given
    // to you is the game answering a question nobody asked.
    ember: 0,
    boostLeft: 0,
    driftCharge: 0,
    drifting: false,
    driftBlend: 0,
    driftAngle: 0,
    driftStraight: 0,
    roll: 0,
    pitch: 0,
    heave: 0,
    rollVel: 0,
    pitchVel: 0,
    heaveVel: 0,
    shortcut: false,
    hitWall: 0,
    slam: 0,
    touching: false,
    hitStone: false,
    rough: false,
    released: 0,
    accel: 0,
    lateral: 0,
    cornering: 0,
    pitchLoad: 0,
    rollLoad: 0,
    caught: false,
    strikes: 0,
    driftMs: 0,
    elapsed: 0,
    finished: false,
    road,
    struck: new Set(),
  }
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

/** Full lock, standing still. About thirty-one degrees. */
/**
 * Slack past the limit, radians, and how far over the driver may go.
 *
 * `SLIP_MARGIN` is roughly the slip angle the front tyres run at their peak,
 * so a driver holding maximum useful lock is *at* the limit rather than short
 * of it. `TUNE.turnInBite` is how far past that they are allowed — enough to feel
 * the front go light and to provoke the car deliberately, not enough to fling
 * it sideways with one keystroke.
 */
const SLIP_MARGIN = 0.05

/**
 * How much lock the wheels get, derived rather than tabulated.
 *
 * ---------------------------------------------------------------------------
 * **This was the whole problem.**
 *
 * A cornering car can only use so much steering: at the limit it is going
 * round a radius of `v² / (μg)`, and the angle that asks for is `L/R` plus the
 * slip the tyres are running. At 38 m/s that is about **2.4 degrees**. The
 * table this replaces offered **ten** — four times more lock than the tyres
 * could use at any speed above about 20 m/s.
 *
 * So one touch of an arrow key put the front tyres four times past their peak
 * slip angle, instantly. They saturated, scrubbed, dragged the nose wide, and
 * the car washed out to the outside of the corner. It reads as "the front
 * tyres don't turn" and "it loses its balance and goes into the wall", and
 * both complaints are the same line of code: **the steering was four times too
 * direct**, so the only reachable states were "not turning" and "past the
 * limit", with nothing in between to drive.
 *
 * Deriving it from the grip fixes it permanently. Change `TUNE.grip` and the
 * steering ratio follows, instead of a table quietly going out of date.
 * ---------------------------------------------------------------------------
 */
function maxSteer(v: number, catching = 0): number {
  // Floored, or standing still asks for infinite lock.
  const usable = (WHEELBASE * TUNE.grip * TUNE.gravity) / Math.max(30, v * v)
  const gripping = (usable + SLIP_MARGIN) * TUNE.turnInBite
  /*
    ==========================================================================
    And however much more is needed to point the wheels where the car is going.

    **This is why a slide could not be caught.** The lock above is the angle at
    which the front tyres make their most lateral force, which is the right
    ceiling for *turning* — past it you are scrubbing, not steering. At thirty
    metres a second that angle is about six degrees.

    Six degrees is nothing like enough to catch anything. When the back steps
    out at forty degrees of slip, catching it means pointing the front wheels
    down the road the car is actually travelling — that is what opposite lock
    *is*, and it is twenty or thirty degrees. The car was not refusing to
    answer the wheel; the wheel was not allowed to turn far enough, which from
    the seat is the same thing. It is exactly "it locks in and there is nothing
    you can do about it".

    So the slide's own angle is allowed on top, and only when the steering is
    *against* the slide — see the call site. Turning further into one is a
    decision and gets no extra rope. In ordinary cornering the car is barely
    sideways, so this is barely anything and nothing changes.
    ==========================================================================
  */
  return Math.min(TUNE.steerLock, gripping + Math.abs(catching))
}

/**
 * In, or out, and how far through.
 *
 * The whole state machine, in one place, because "am I drifting" is asked by
 * the physics, the sound, the smoke and the camera and they must never
 * disagree about it.
 *
 * Getting in is a press of the handbrake with some lock on — the same gesture
 * that would start a real one. Getting out is deliberately *not* the same as
 * getting in: releasing the handbrake does nothing, because a drift you have
 * to hold a button through is a drift you cannot steer with both hands.
 */
function driftMode(car: CarState, input: CarInput, dt: number, v: number) {
  const lock = Math.abs(input.steer)

  if (!car.drifting) {
    if (input.handbrake && lock > DRIFT_ENTER_STEER && v > TUNE.driftEnterSpeed) {
      car.drifting = true
      car.driftStraight = 0
      /*
        And a drift stops a boost.

        The two are opposite ideas — one is a shove in the direction the car is
        pointing, the other is deliberately not pointing that way — and a car
        doing both at once is a car doing neither well. Only `boostLeft` is
        cleared: `ember` keeps whatever the burn had left it at, so going into
        a corner half way through a boost banks the rest instead of throwing it
        away. That is what makes spending it a decision.
      */
      car.boostLeft = 0
    }
  } else if (input.boost) {
    /*
      The ember breaks it, and that is the good way out.

      Cancelled on the *press*, whether or not there was any ember to spend —
      the button means "straighten up and go", and a car that ignored it
      because a meter was empty would be a car that had stopped listening.
      Spending is handled further down and is a separate question.
    */
    car.drifting = false
  } else if (v < DRIFT_EXIT_SPEED) {
    car.drifting = false
  } else if (lock < DRIFT_HOLD_STEER) {
    car.driftStraight += dt
    if (car.driftStraight > DRIFT_STRAIGHT_EXIT) car.drifting = false
  } else {
    car.driftStraight = 0
  }

  const rate = car.drifting ? DRIFT_BLEND_IN : DRIFT_BLEND_OUT
  /*
    `TUNE.driftHelper` scales the *target*, not any one consumer.

    Everything that asks how much of a drift is being drawn for you reads
    `driftBlend` — the arc, the pose, the scrub, and the two anti-spin
    backstops that stand down while one is happening. Turning the dial down
    therefore hands all of it back at once: at zero the handbrake still locks
    the rear wheels and the car still comes round, because that is the tyre
    model rather than the helper, but nothing is holding the arc for you and
    the spin protection never steps aside.
  */
  const held = (car.drifting ? 1 : 0) * TUNE.driftHelper
  car.driftBlend += (held - car.driftBlend) * (1 - Math.exp(-rate * dt))
  if (!car.drifting && car.driftBlend < 0.01) {
    car.driftBlend = 0
    car.driftAngle = 0
  }
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
  const road = roadAtRoute(track, car.s, car.shortcut, car.road)
  const v = Math.hypot(car.vs, car.vn)
  const speed = Math.max(0.5, v)

  // --- surface -------------------------------------------------------------
  const half = road.width
  car.rough = Math.abs(car.n) > half
  const surfaceGrip = car.rough ? TUNE.vergeGrip : 1 - road.wet * 0.14
  const rollingDrag = car.rough ? 0.09 : 0.0135
  const mu = TUNE.grip * surfaceGrip

  // --- steering ------------------------------------------------------------
  // The wheels take a moment to get there. Without this the car changes
  // direction the instant a key goes down and feels weightless.
  /*
    The steering is the driver's, and nothing else touches it.

    There used to be a stability assist here that steered *for* you whenever
    your input was near centre — reading the car's heading, its lateral
    velocity and its yaw rate, and adding up to half a lock of correction. It
    existed because the car was unstable, and it made the car feel dead: every
    small input you made was being blended with one the game was making, so
    the front wheels never quite did what you asked. "The front tyres don't do
    proper corners" is what that feels like from the outside.

    It is gone. The car is stable now because the *tyres* make it stable — see
    TUNE.frontBite — and because you can lift off. An assist that exists to hide
    an unstable car is a sign the car needs fixing, not hiding.
  */
  const steerCommand = Math.max(-1, Math.min(1, input.steer))
  /*
    How sideways the car is, and therefore how much rope the steering gets.

    Turning right gives a positive steer and a *negative* slip angle — the car
    rotates further than its velocity does — so catching a slide is the case
    where the two share a sign: the wheel is being turned toward where the car
    is actually travelling. Ordinary turn-in has them opposite and gets nothing
    extra, which matters, because handing out lock there would only help the
    car rotate further into the corner it is already rotating into.
  */
  const sliding = slipOf(car)
  const catching =
    steerCommand !== 0 && Math.sign(steerCommand) === Math.sign(sliding)
      ? Math.abs(sliding)
      : 0
  const wanted = steerCommand * maxSteer(v, catching)
  // The rack itself. Quick, because the hand in `controls.ts` is already the
  // slow part and two lags in series is a car that answers questions late.
  car.steerAngle += (wanted - car.steerAngle) * (1 - Math.exp(-11.5 * dt))

  /*
    The hand on the wheel.

    Past `TUNE.spinProtection` a fraction of the correction goes in whether you asked for
    it or not. See `TUNE.autoCountersteer` — this is a deliberate and stated dishonesty, and
    the alternative is a game that cannot be played with two arrow keys.
  */
  const beta = slipOf(car)
  car.caught = false
  // Never during a deliberate drift: the hand and the drift would be pulling
  // in opposite directions, and the player would feel only the argument.
  if (car.driftBlend < 0.02 && Math.abs(beta) > TUNE.spinProtection * 0.72) {
    const over = (Math.abs(beta) - TUNE.spinProtection * 0.72) / (TUNE.spinProtection * 0.28)
    /*
      ========================================================================
      The hand stands down in proportion to the hand already on the wheel.

      **This is what made a lift impossible to catch.** Come off the throttle
      into a corner, the back steps out past forty degrees of slip, and this
      applies a correction — which is right, and is the only reason the car can
      be driven with two arrow keys. What it did not do is notice that the
      driver was *already* correcting. Both hands then pulled the same way, the
      car whipped through straight and went out the other side: measured, it
      crossed 6.7 metres of an eleven metre road, which is one wall and then
      the other. Word for word the complaint — it locks in, will not listen,
      and hits the far side.

      So the assist asks how much of its own correction is already being
      supplied. Hold full opposite lock and it adds nothing, because you have
      it. Do nothing and it does exactly what it always did. In between it
      makes up the difference, which is the honest version of what it was
      always claiming to be.

      Deliberately only counts steering that *opposes* the slide. Steering
      further into it is a decision — usually the beginning of a drift — and
      this has no business reading that as help and standing down.
      ========================================================================
    */
    const opposing = Math.max(0, Math.min(1, steerCommand * -Math.sign(beta)))
    const correction =
      -Math.sign(beta) *
      Math.min(1, over) *
      maxSteer(v, Math.abs(beta)) *
      TUNE.autoCountersteer *
      (1 - opposing)
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
  const weight = TUNE.weight * TUNE.gravity + LIFT * v * v
  const staticFront = (weight * REAR) / WHEELBASE
  const staticRear = (weight * FRONT) / WHEELBASE
  const aeroBias = LIFT * v * v * (LIFT_FRONT - REAR / WHEELBASE)

  /*
    --- weight takes time to move ------------------------------------------

    Load transfer used to be computed straight from this instant's
    acceleration, which says the car's whole mass arrives on the front tyres
    the moment you lift. It does not. It travels through the springs, and that
    takes a couple of tenths.

    Leaving it instantaneous made the car *violent* in exactly the place this
    game is played: lifting off mid-corner dumped the rear in one step, the
    rear was already at its lateral limit, and the car snapped to forty-four
    degrees of slip and spun. Measured, lifting turned the car nearly six times
    harder than staying flat — so the two things you could do with a corner
    were plough into the outside of it or spin, with nothing usable between.

    A lag of about a fifth of a second is what a real car's springs give you,
    and it is the difference between a car that rotates when you lift and one
    that throws you off. It is also why trail-braking works at all: the weight
    is still moving forward while you are turning in.
  */
  const settleRate = 1 - Math.exp(-(1 / LOAD_LAG) * dt)
  car.pitchLoad += (car.accel - car.pitchLoad) * settleRate
  /*
    Cornering force, **not** the rate of change of sideways velocity.

    `car.lateral` is `Fy/m − v·ω`, which is what the body-frame velocity is
    doing — and in a *steady* corner that is very nearly zero, because the
    tyres are providing exactly the centripetal acceleration and nothing is
    left over. Feeding it to the load transfer meant that going round a long
    bend at a full g transferred almost no weight: the car leaned for a moment
    on turn-in and then stood back up while still cornering hard, the outside
    tyres never took their share, and `rollFront` had nothing to distribute.

    What a cornering car actually feels is `Fy/m`, and that is `car.cornering`.
  */
  car.rollLoad += (car.cornering - car.rollLoad) * settleRate

  const longTransfer = (TUNE.weight * car.pitchLoad * TUNE.topHeaviness) / WHEELBASE
  const latTransfer = (TUNE.weight * car.rollLoad * TUNE.topHeaviness) / (TRACK_HALF * 2)

  const axleFront = Math.max(0, staticFront + aeroBias - longTransfer)
  const axleRear = Math.max(0, staticRear - aeroBias + longTransfer)
  // Split front/rear by how stiff each end is in roll. A stiffer end takes
  // more of the transfer and therefore lets go first, which is the one knob
  // that decides whether a car understeers or oversteers.
  const rollFront = TUNE.balance
  const loads = [
    Math.max(0, axleFront / 2 - latTransfer * rollFront),
    Math.max(0, axleFront / 2 + latTransfer * rollFront),
    Math.max(0, axleRear / 2 - latTransfer * (1 - rollFront)),
    Math.max(0, axleRear / 2 + latTransfer * (1 - rollFront)),
  ]

  // --- the engine ----------------------------------------------------------
  /*
    Two pedals, and reverse.

    The car used to drive itself forward at full power, always, on the argument
    that a forty-second race should be playable one-handed. It cost more than
    it bought. A driver who cannot lift cannot slow down for a corner, so every
    corner had to be survivable flat out — and the only way to arrange that was
    to bolt assist after assist on top of the tyre model until the car was
    being driven by the game rather than by anybody holding the keys.

    Giving the throttle back removes the *reason* for all of that. You slow
    down for the corner yourself, which is the thing racing is actually made
    of, and the model underneath is allowed to behave.
  */
  const goPedal = Math.max(0, Math.min(1, car.reversing ? input.brake : input.throttle))
  const stopPedal = Math.max(0, Math.min(1, car.reversing ? input.throttle : input.brake))

  /*
    Selecting reverse, and coming out of it.

    Held at a stand rather than pressed: a driver braking hard to a stop in a
    hairpin has the brake buried, and a car that snapped into reverse the
    instant it stopped moving would be unusable. A third of a second of
    standing still with the pedal down is unmistakably a request.
  */
  const stopped = Math.abs(car.vs) < 0.7
  const wantsOther = stopped && (car.reversing ? input.throttle > 0.4 : input.brake > 0.4)
  if (wantsOther) {
    car.shiftHold += dt
    if (car.shiftHold > 0.32) {
      car.reversing = !car.reversing
      car.shiftHold = 0
      car.gear = 0
    }
  } else {
    car.shiftHold = 0
  }

  /*
    A mild traction control, and an honest one.

    It watches the rear wheels *spinning*, which is what traction control is,
    rather than watching how sideways the car is, which is what the last one
    did. Cutting the power because the car is at an angle takes the throttle
    away in the middle of every corner — including the ones where feeding it in
    is the whole point — and it is why ordinary cornering felt like being
    switched off. A deliberate handbrake drift bypasses it entirely.
  */
  const rearSpin = Math.max(car.wheels[2].slipRatio, car.wheels[3].slipRatio)
  car.throttle = goPedal
  if (!input.handbrake && !car.drifting && rearSpin > 0.3) {
    car.throttle *= Math.max(0.4, 1 - (rearSpin - 0.3) * 1.8)
  }
  if (car.shiftLeft > 0) car.shiftLeft = Math.max(0, car.shiftLeft - dt)

  const ratio = (car.reversing ? REVERSE_RATIO : GEARS[car.gear]) * FINAL
  // The clutch: below the point where the wheels can turn the engine over, the
  // engine idles and slips against them. That is what a standing start is.
  const drivenOmega = (car.wheels[2].omega + car.wheels[3].omega) / 2
  // Absolute, because in reverse the wheels turn backwards and an engine does
  // not know that. It only knows how fast it is being asked to spin.
  car.engineOmega = Math.max(
    IDLE_OMEGA,
    Math.min(LIMIT_OMEGA * 1.02, Math.abs(drivenOmega) * ratio),
  )
  car.revs = Math.max(
    0,
    Math.min(1.02, (car.engineOmega - IDLE_OMEGA) / (LIMIT_OMEGA - IDLE_OMEGA)),
  )

  if (car.shiftLeft <= 0 && !car.reversing) {
    if (car.gear < GEARS.length - 1 && car.revs > SHIFT_UP) {
      car.gear++
      car.shiftLeft = SHIFT_TIME
    } else if (car.gear > 0 && car.revs < SHIFT_DOWN) {
      car.gear--
      car.shiftLeft = SHIFT_TIME * 0.7
    }
  }

  let crankTorque = 0
  if (car.shiftLeft <= 0 && car.throttle > 0.02) {
    crankTorque = TUNE.power * torqueCurve(car.revs) * car.throttle
    if (car.boostLeft > 0 && !car.reversing) crankTorque *= TUNE.boostPower
    // The limiter, so the last gear is drag-limited rather than rev-limited.
    if (car.revs > 1) crankTorque = 0
    if (car.reversing) crankTorque = Math.min(crankTorque, TUNE.power * 0.55)
  } else if (Math.abs(drivenOmega) > 0.5) {
    /*
      Engine braking.

      Lift off and the engine becomes a pump the wheels have to turn. This is
      what makes releasing the key *mean* something: the car slows, harder in a
      low gear than a high one, and eventually stops. Without it a lifted car
      only has drag, which does nothing below about fifteen metres a second,
      and coasting to a halt takes half a minute.
    */
    crankTorque = -TUNE.engineBraking * (0.25 + car.revs) * Math.sign(drivenOmega)
  }
  const direction = car.reversing ? -1 : 1
  const axleTorque =
    crankTorque * ratio * DRIVE_LOSS * (car.throttle > 0.02 ? direction : 1)
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
  const brakeDemand = stopPedal
  car.braking = stopPedal
  /*
    A proportioning valve, which every road car has had for fifty years.

    The rear brakes get only as much as the rear axle is still carrying. Under
    braking the weight goes forward, so the rear goes light — and a rear brake
    sized for a level car will lock it. A locked rear tyre has no lateral grip
    at all, which in the middle of a corner is a spin, and this car did exactly
    that: a moderate brake at 34 m/s put it to forty-four degrees of slip.

    Scaling by how much load is actually back there is not a driving aid, it is
    a piece of plumbing. It is also the difference between a brake you can
    trail into a corner and one you can only use in a straight line.
  */
  const rearLeft = Math.max(0.25, Math.min(1, axleRear / Math.max(1, staticRear)))
  const frontShare = TUNE.brakes * TUNE.brakeBalance
  const rearShare = TUNE.brakes * (1 - TUNE.brakeBalance) * rearLeft
  const brakeTorque = [
    frontShare / 2,
    frontShare / 2,
    rearShare / 2,
    rearShare / 2,
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
  const relaxRate = 1 - Math.exp(-(Math.max(speed, 4) / TUNE.tyreLag) * dt)

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
    /*
      The budget, with load sensitivity in it.

      Peak force goes as roughly `Fz^0.8`, not `Fz` — so pressing a tyre harder
      buys grip at a falling rate, and the pair on an axle are worth less the
      more unevenly the weight sits across them. That is what makes leaning on
      a car cost something, and it is what turns `rollFront` below from a
      decorative constant into a balance knob.
    */
    const budget = Math.max(
      1,
      mu * wheel.load * Math.pow(Math.max(wheel.load, 60) / DERIVED.nominalLoad, -LOAD_SENSITIVITY),
    )
    // Front and rear tyres are deliberately not the same. See TUNE.frontBite.
    const stiffness = front ? TUNE.frontBite : TUNE.rearBite
    let fx = budget * Math.tanh(STIFF_LONG * wheel.slipRatio)
    /*
      During a drift the tyres are not asked to corner, so they are not charged
      for it either.

      The arcade block below is what moves the car once you are drifting — the
      pose and the path are both commanded. But the tyres still *see* the huge
      slip angle that pose implies, and the friction circle then spends their
      entire budget on a lateral force that is being overridden anyway. The
      visible result was a car that could not put any power down mid-drift: it
      would enter at thirty metres a second and come out at twelve, engine
      screaming, because the rears had nothing left for drive.

      `wheel.slipAngle` itself is left truthful — the tyre marks and the smoke
      read it, and they should still know the tyre is sliding. Only the force
      is relieved.
    */
    const cornering = wheel.slipAngle * (1 - car.driftBlend * 0.92)
    let fy = budget * Math.tanh(stiffness * cornering)

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
    /*
      The handbrake starts a drift and then gets out of the way.

      Held down through a long corner it used to stop the car dead: 108 km/h to
      a standstill in five seconds with the throttle pinned. Two things
      compounded. The rears are locked, so no drive reaches the road at all —
      and the drift has just relieved those same tyres of cornering, which
      hands their entire friction budget to braking. A locked-rear car with
      nothing else to spend grip on is the most effective brake in this file.

      `driftMode` already promises that releasing the handbrake does not end a
      drift, because a drift you have to hold a button through is a drift you
      cannot steer with both hands. This is the other half of that promise:
      holding it must not end one either.

      Faded on `driftBlend` rather than switched, so the lock is still all
      there for the instant that breaks the back loose, and so a lower
      `driftHelper` keeps proportionally more of the real car's behaviour.
    */
    if (!front && input.handbrake) stopping += (TUNE.handbrake / 2) * (1 - car.driftBlend)

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
    // The same fade, and this is the half that decides whether the car can
    // drive: a wheel pinned at zero passes no engine torque to the road, however
    // much of it is being asked for.
    if (input.handbrake && !front) omega *= Math.exp(-14 * (1 - car.driftBlend) * dt)
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

  /*
    Opposite lock, for the look of it.

    A drifting car's front wheels point roughly along the path, which from
    behind is dramatic opposite lock — and it is the single clearest signal
    that the car is sideways *on purpose* rather than by accident. Written on
    top of the steering angle after the forces are done, so it changes nothing
    about how the car behaves: the tyre model has already had its `delta`, and
    `wheel.steer` from here on is only ever read by the renderer.
  */
  if (car.driftBlend > 0.01) {
    const show = car.driftAngle * 0.9 * car.driftBlend + delta * (1 - car.driftBlend)
    car.wheels[0].steer = show
    car.wheels[1].steer = show
  }

  // --- everything else acting on the body ----------------------------------
  let along = totalX
  along -= DERIVED.drag * v * Math.abs(car.vs)
  along -= TUNE.weight * TUNE.gravity * rollingDrag * Math.sign(car.vs || 1)
  // The road tilts under it.
  along -= TUNE.weight * TUNE.gravity * road.grade

  const accel = along / TUNE.weight + car.vn * car.yaw
  const lateral = totalY / TUNE.weight - car.vs * car.yaw
  car.accel = accel
  car.lateral = lateral
  // What the corner is actually pulling, in m/s². Roll and lateral load
  // transfer both read this rather than the body-frame derivative above.
  car.cornering = totalY / TUNE.weight
  car.vs += accel * dt
  car.vn += lateral * dt
  car.yaw += (moment / DERIVED.inertia) * dt

  /*
    It is allowed to stop now, and to go backwards.

    There used to be a floor under this — the car never dropped below walking
    pace, because with no throttle a car that stopped could not start again and
    six seconds of nothing in a forty-second race is a ruined run. With a
    throttle that reasoning is gone, and a car that cannot be brought to a
    stand cannot be reversed out of the rock it has just buried its nose in.
  */
  car.vs = Math.max(-REVERSE_LIMIT, Math.min(SPEED_CEILING, car.vs))
  // Below a crawl with nothing asked of it, let it settle rather than creep.
  if (Math.abs(car.vs) < 0.35 && car.throttle < 0.05) car.vs *= Math.exp(-6 * dt)
  // Yaw damping. A real car has aerodynamic and mechanical damping this model
  // does not; without a little of it the back end oscillates for ever.
  car.yaw *= Math.exp(-(0.9 + v * 0.03) * dt)
  car.yaw = Math.max(-MAX_YAW_RATE, Math.min(MAX_YAW_RATE, car.yaw))

  /*
    ==========================================================================
    THE DRIFT
    ==========================================================================

    **This is a different control model, and it takes over.** Everything above
    is a car; for as long as you are drifting, this is a *game*. That is a
    deliberate choice and it is stated here rather than hidden, because it is
    the one place in the racer where the simulation is switched off.

    Why it has to be. Left to the tyres, pulling the handbrake in a corner does
    what it does in life: the rear lets go, the car rotates, and it keeps
    rotating in the direction it was sent until it hits something. Steering has
    almost no authority once the back is gone, so the drift is not a thing you
    *do*, it is a thing that happens to you — you press the button and then
    watch. That is correct physics and it is no fun at all, and this is a
    present for somebody who likes racing games.

    So: while drifting, the arrows steer the **path**, not the wheels.

      the key you hold      bends the line the car is travelling along
      the same key          decides which way it hangs, and how far
      the other key         swings it through and hangs it the other way

    Which means one drift can carry you through a left and then a right without
    ever hooking up — flick, flick — and staying in it is a thing you are doing
    with your hands rather than a state you are waiting out.

    Three ways out, and no others:

      the ember     cancels it instantly and leaves you going fast. This is the
                    one you want, and it is why the boost button is worth
                    holding on to through a corner
      going straight   two seconds with the arrows near centre and it lets go
      running out of speed   below walking pace there is nothing to drift

    It is built on `course = psi + beta` — where the car is *going* is where it
    is pointing plus how far it is hung out. Commanding those two separately is
    the whole trick: `turn` bends the course, `driftAngle` sets the pose, and
    the car's own rotation is whatever is needed to keep both true.
  */
  driftMode(car, input, dt, v)
  if (car.driftBlend > 0.001) {
    const command = Math.max(-1, Math.min(1, input.steer))
    const speed = Math.max(1, Math.hypot(car.vs, car.vn))

    /*
      The angle it hangs at, following the same key that is steering it.

      This is what makes swapping sides work: hold the other arrow and the
      target crosses through zero to the far side, so the car swings through
      straight and hangs out the other way without ever leaving the drift.

      **Worked out before anything else in this block now**, because how fast
      the pose is being moved turns out to be half of what a drift costs, and
      the cost has to be known before the speed it applies to is spent on the
      arc.
    */
    const want = -command * TUNE.driftAngle * car.driftBlend
    const was = car.driftAngle
    car.driftAngle += (want - car.driftAngle) * (1 - Math.exp(-TUNE.driftSwap * dt))
    const swing = (car.driftAngle - was) / Math.max(dt, 1e-5)

    /*
      ------------------------------------------------------------------------
      **What it costs** — the part that decides whether a drift is a way of
      getting round a corner or a way of cheating the entire course.

      Two terms, and the second is the one that was missing:

        the angle    hanging it out scrubs speed. Squared, so a hint of
                     opposite lock costs almost nothing and full lock bleeds
                     properly
        the swing    *moving* the pose scrubs far more than sitting at it.
                     This is the tyres being dragged bodily across the road
                     rather than merely pointing away from it

      Without the swing term the cost was a function of the pose alone — and
      the pose passes through zero on every side-swap, so a chicane taken
      flick-flick-flick paid nothing at all. It was not close: 157 km/h down a
      straight swapping sides against 115 not drifting at all, throttle pinned
      for both. The drift was strictly quicker than the racing line everywhere,
      which quietly makes every other number in this file decoration.

      Then a ceiling, stated in km/h on a dial rather than left to emerge from
      whatever the throttle, the gear and the angle happen to multiply out to.
      A car that is sideways has two tyres pointing across its own path and no
      longer accelerates; no combination of dials should be able to say
      otherwise. Pulled towards rather than clamped, at a rate quick enough
      that arriving sideways at 140 *is* the entry — a second or so of
      deceleration you can hear and feel, which is what going sideways is
      supposed to cost.
      ------------------------------------------------------------------------
    */
    const sideways = Math.abs(Math.sin(car.driftAngle))
    const slide = sideways * sideways + Math.abs(swing) * TUNE.driftSwingCost
    let kept = speed * (1 - TUNE.driftScrub * slide * dt * car.driftBlend)
    const ceiling = TUNE.driftTopSpeed * (1 - DRIFT_ANGLE_COST * sideways)
    if (kept > ceiling) {
      /*
        The further past it goes the harder it is pulled back, for the same
        reason the spin backstop further down does it: a constant rate is a
        spring the engine can simply out-pull, and then the dial says 83 km/h
        while the car sits at 100 and the number is a lie. Progressive, and
        the dial is a speed the drift actually reaches.
      */
      const over = (kept - ceiling) / Math.max(1, ceiling)
      const rate = DRIFT_CEILING_RATE * (1 + Math.min(3, over) * 9)
      kept += (ceiling - kept) * (1 - Math.exp(-rate * dt)) * car.driftBlend
    } else if (car.throttle > 0.12) {
      /*
        ------------------------------------------------------------------------
        And **up** to it, which the dial has always claimed and the car never did.

        The dial is called "the speed a drift settles at". Only half of that was
        built: the ceiling caught you coming down and nothing held you there, so
        `driftScrub` went on eating a held slide all the way to the floor.
        Measured, holding one direction for eight seconds against a dial reading
        72 km/h:

          63 · 57 · 54 · 50 · 47 · 50 · 53 · 56

        — decaying to a crawl, and then that rise at the end, which is the
        engine finally out-pulling the scrub once the car is slow enough. It
        arrives from nowhere, it is not asked for, and it is worse than simply
        stopping would have been, because a car that stops is at least telling
        the truth about what a drift costs.

        A powered slide is not a car coasting sideways. The rear tyres are
        spinning and driving it, and what settles is the balance between that
        drive and the scrub — so the honest model is an equilibrium, and the
        dial is where it sits. Gentler than the fall on purpose: dropping to the
        ceiling is the *entry*, and should be felt in about a second, while
        gathering back up to it is the slide finding its feet and wants two.

        Only while the throttle is asking. Lift mid-drift and the scrub has it
        all its own way again, which is how you slow a drift down on purpose —
        and without that check this would be a car that speeds up when you let
        go of the accelerator.
        ------------------------------------------------------------------------
      */
      kept += (ceiling - kept) * (1 - Math.exp(-DRIFT_SETTLE_RATE * dt)) * car.driftBlend
    }
    kept = Math.max(1, kept)

    /*
      ========================================================================
      **Where the slide goes**, which is a different question from how fast it
      is going and is the one that was wrong.

      This block used to command a curvature and nothing else: the arrows named
      an arc, the arc was drawn, and where that arc went relative to the *road*
      was nobody's problem. Hold one direction through a long corner and the
      car drew a circle of its own — 25 m by default — which is not the corner
      you are in. So it walked across the tunnel, pinned itself on the rock and
      the wall scrub took it to nothing. Measured, holding one direction in a
      long left:

        n           -5.1 → +6.4 m in two seconds, and stuck there
        on the rock  77% of the time
        km/h          108 → 72 → 2, then crawling back to 27

      and that crawl back off the wall is the "boost" it felt like. The
      speedometer was not lying, either — the car really was doing sixty. None
      of the sixty was going down the tunnel, because `s` only advances by
      `speed × cos(course relative to the road)`, and the course had wandered
      most of the way to sideways-on.

      **What a sustained slide actually does** is keep going where it is
      already going. The wheels are locked, nothing is driving, and the only
      reason the car is still moving is that it is sliding — so it holds its
      line, at its angle, until something changes. That is what is built here,
      in three terms:

        the road    the course rotates at the rate the road itself turns, so
                    a held drift follows the corner instead of leaving it.
                    This is the whole fix
        the line    a gentle pull back to where it was sliding, so the slide
                    keeps its lane rather than washing wide
        the arrows  which now *place* the car across the road rather than
                    naming a radius — hold a direction and the slide moves
                    that way across the lane, let go and it holds

      The arc is still capped by what the tyres could pull, which is what stops
      the line-holding becoming a rail.
      ========================================================================
    */
    // Where the course is pointing relative to the road: heading plus how far
    // the car is hung out. `car.psi` is already road-relative — see the note
    // on the road frame further down.
    const courseRel = car.psi + car.driftAngle
    const downRoad = kept * Math.cos(courseRel)

    /*
      What the road is doing under it.

      `psi` integrates `yaw − curv × sDot × metric`, so this is exactly the
      world rotation rate that leaves the car's angle to the road unchanged.
      Without this one term a held drift is a circle and the road is not.
    */
    const roadRate = road.curv * downRoad

    /*
      Where across the road to aim.

      Neutral is the racing line rather than the geometric middle, because the
      middle of a cave is not where a quick car goes and a drift that returns
      to dead centre reads as an autopilot. The arrows move the aim across the
      road from there.

      ------------------------------------------------------------------------
      **The margin is the whole of this, and the first version did not have
      enough of it.** It left half a metre between the aim at full lock and the
      rock, which sounds like clearance and is not: a car that is *sliding*
      does not sit on its aim, it swings past it and comes back. So holding a
      direction through a long corner walked the car steadily onto the inside
      wall — measured at 25% of the way to the rock, then 36, then 41, then 54
      and still climbing, which is exactly what it feels like from the seat:
      the corner slowly eating the car.

      Two changes, and both are about leaving room:

        the margin   a metre and a bit of rock kept in hand rather than half a
                     metre, because that gap has to absorb the overshoot of a
                     car travelling sideways
        the reach    the arrows move it across less of what is left. Full lock
                     is a decisive change of line, not a request to park
                     against the wall

      What is deliberately *not* done here is clamping `car.n`. The wall is
      allowed to be hit — running wide and clouting the rock is a mistake the
      road is entitled to punish. This only stops the car steering itself into
      one while you are holding a perfectly reasonable input.
      ------------------------------------------------------------------------
    */
    const usable = Math.max(1, wallAt(road) - CAR_HALF_WIDTH - DRIFT_ROCK_MARGIN)
    const aim = Math.max(
      -usable,
      Math.min(usable, road.line + command * TUNE.driftPlace * usable),
    )

    /*
      And the course that closes on it.

      `dn/dt ≈ speed × courseRel`, so an error of `e` metres closes on a time
      constant of `1 / driftLineHold` if the course is held at `−e × hold /
      speed`. Divided by speed rather than fixed, so the correction is an
      *angle* at any speed instead of a much bigger one when slow. Capped, so a
      car that has been thrown a long way sideways does not aim itself at the
      opposite wall trying to get back.
    */
    const off = car.n - aim
    const wantCourse = Math.max(
      -DRIFT_AIM,
      Math.min(DRIFT_AIM, (-off * TUNE.driftLineHold) / Math.max(8, kept)),
    )

    /*
      The three, added, then held to what the tyres could have pulled.

      The g cap is the same one as before and it still matters: without it the
      line-holding would be able to ask for a corner no car could take, and a
      drift that cannot be made to run wide is a slot car.
    */
    /*
      How hard the arrows are allowed to pull it across — and *only* the
      arrows.

      `TUNE.driftTightness` names the tightest arc a steering input may ask
      for, as a radius, which is what it has always meant. What is new is that
      it is applied to the correction alone and never to `roadRate`: following
      the corner you are in is not steering, it is the floor, and capping it
      would put the car back in the rock the moment somebody wound this dial
      towards "long sweep". A tight setting makes the drift dart across the
      road; a loose one makes it lean across. Neither can stop it following
      the road.
    */
    const steerRate = (wantCourse - courseRel) * DRIFT_COURSE * car.driftBlend
    const tightest = kept / TUNE.driftTightness
    const asked = roadRate + Math.sign(steerRate) * Math.min(Math.abs(steerRate), tightest)

    /*
      And the whole thing held to what the tyres could have pulled.

      Without it the line-holding could ask for a corner no car can take, and a
      drift that cannot be made to run wide is a slot car.
    */
    const most = (TUNE.driftGrip * TUNE.gravity) / Math.max(1, kept)
    const turn = Math.max(
      -DRIFT_TURN,
      Math.min(DRIFT_TURN, Math.sign(asked) * Math.min(Math.abs(asked), most)),
    )

    // Rebuild the velocity from the pose, and rotate the car by however much
    // is needed for the *path* to turn at `turn` while the pose is changing.
    const poseVs = kept * Math.cos(car.driftAngle)
    const poseVn = kept * Math.sin(car.driftAngle)
    car.vs += (poseVs - car.vs) * car.driftBlend
    car.vn += (poseVn - car.vn) * car.driftBlend
    car.yaw += (turn - swing - car.yaw) * car.driftBlend

    /*
      What the body leans on.

      Taken from the commanded corner rather than from the tyre forces, which
      during a drift are enormous and pointing the wrong way — the car is being
      moved by this block, not by them, so asking them how hard it is cornering
      gives an answer about a car that is not the one on screen.
    */
    car.cornering += (turn * kept - car.cornering) * car.driftBlend
  }

  /*
    And a firm hand at the very edge.

    `catchIt` above steers for you; this bleeds the sideways velocity itself
    once the angle is past what the car will hold. Smoothly, over about a
    tenth of a second, so it reads as the tyres finding grip again rather than
    as the game taking the car off you.
  */
  const held = Math.max(3, Math.abs(car.vs))
  /*
    One limit, not two.

    There used to be a second, much tighter one — sixteen degrees — that
    applied whenever the handbrake was *not* down. It was there because an
    unstable car had to be leashed, and it made ordinary cornering feel like
    driving into a rubber band: the car would rotate, hit the leash, and get
    pulled straight again, which reads as the car losing its balance and then
    being taken away from you.

    The car is stable on its own now, so there is one limit and it is the wide
    one. This is a backstop against a spin, not a handling parameter, and in
    normal driving you should never reach it.
  */
  const slipLimit = TUNE.spinProtection
  const maxLateral = held * Math.tan(slipLimit)
  // The drift sets the angle deliberately and stays well inside TUNE.spinProtection, so
  // this backstop has nothing to say about it — but it must not be *able* to.
  if (car.driftBlend < 0.02 && Math.abs(car.vn) > maxLateral) {
    const target = Math.sign(car.vn) * maxLateral
    // The further past it goes the harder it is pulled back, so `TUNE.spinProtection` is
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
    animation played over the top. They cost a few lines and they are the
    difference between a car with mass and a box sliding along a groove.

    ---------------------------------------------------------------------------
    **The body is a spring, not a lag, and that is where the weight is.**

    These were first-order lags: `value += (target - value) * rate`. A lag
    creeps toward its target, arrives, and stops — it can never go past. So
    however hard you turned in, the shell tipped over smoothly and sat there,
    and the car read as *light*: a box on a groove, moved by a number rather
    than thrown by its own mass. That is the "it feels like a cardboard box"
    complaint, and no amount of grip in the tyre model fixes it, because it is
    not a grip problem — nothing about how the car *drove* was wrong.

    A body on springs is second order. Turn in and it leans over, goes a little
    *past* where it is going to settle, and comes back; lift and it rocks
    forward and rebounds. That overshoot is the entire cue. It is what tells
    you there is something up there with mass in it, being moved around by
    forces, rather than an attitude being set.

    So: a damped spring per axis, at about one and a half hertz — a real car's
    body frequency — under-damped enough (ζ ≈ 0.55) that it visibly overshoots
    once. The wheels get their own, stiffer and looser, because unsprung mass
    moves faster and settles less tidily than the shell does.

    **None of this touches how the car drives.** Roll, pitch, heave and travel
    are read by `rig.ts` and by nothing else — no force, no load and no tyre
    has ever asked what they are. The handling is exactly what it was.
    ---------------------------------------------------------------------------
  */
  // Negated: the mesh faces +Z, so its +X side is the car's *left* — see the
  // note on the mirror in `rig.ts`. Leaning into a right-hand corner therefore
  // means lifting +X, which is a negative roll here.
  /*
    And the road is not flat, because it is stone.

    Keyed off `car.s` — *distance*, not time — so these are bumps that live at
    a place on the road rather than a vibration the car carries around with it.
    Everything good follows from that one choice: the frequency you feel rises
    with speed for free, the same bump hits the front wheels and then the rear
    ones, and crawling over it does nothing at all.

    Tiny numbers, and they do not stay tiny: the body underneath is a spring at
    about one and a half hertz, so a road that happens to feed it near that
    rate is amplified, which is precisely what makes a real car feel like a
    heavy thing being worked rather than a shape being moved. Visual only —
    the tyre loads never see it, so the car drives over a glass-smooth road and
    looks like it is driving over rock.
  */
  const surface = (at: number) =>
    Math.sin(at * 2.7) * 0.4 + Math.sin(at * 6.1 + 1.3) * 0.25 + Math.sin(at * 13.9 + 0.4) * 0.12
  const bumpiness = Math.min(1, v / 12) * (car.rough ? 2.4 : 1)

  // Clamped first and scaled after, so `TUNE.bodyLean` opens the whole range
  // rather than running straight into a limit that no longer suits it.
  const lean = TUNE.bodyLean
  const wantRoll =
    Math.max(-0.185, Math.min(0.185, (-car.cornering / TUNE.gravity) * 0.14)) * lean
  const wantPitch =
    Math.max(-0.13, Math.min(0.1, (-car.accel / TUNE.gravity) * 0.11)) * lean
  const wantHeave =
    Math.max(-0.07, Math.min(0.03, -(weight - TUNE.weight * TUNE.gravity) / 125_000)) +
    surface(car.s) * 0.004 * bumpiness

  car.rollVel += (DERIVED.bodyRoll.k * (wantRoll - car.roll) - DERIVED.bodyRoll.c * car.rollVel) * dt
  car.roll += car.rollVel * dt
  car.pitchVel += (DERIVED.bodyPitch.k * (wantPitch - car.pitch) - DERIVED.bodyPitch.c * car.pitchVel) * dt
  car.pitch += car.pitchVel * dt
  car.heaveVel += (DERIVED.bodyHeave.k * (wantHeave - car.heave) - DERIVED.bodyHeave.c * car.heaveVel) * dt
  car.heave += car.heaveVel * dt

  // Per-wheel travel, off the load each is carrying. Same reasoning: it agrees
  // with the physics because it *is* the physics.
  const restLoad = (TUNE.weight * TUNE.gravity) / 4
  for (let i = 0; i < 4; i++) {
    const wheel = car.wheels[i]
    /*
      Each corner meets the road at its own place, and that is the whole point
      of doing it per wheel: the front axle hits a bump about two metres before
      the rear one does, so the car pitches over it instead of moving up and
      down as a slab. The half-track offset does the same across the car.
    */
    const at = car.s + (i < 2 ? FRONT : -REAR) + (i % 2 === 0 ? 0 : 0.37)
    const want =
      Math.max(-0.11, Math.min(0.12, (wheel.load - restLoad) / 34_000)) +
      surface(at) * 0.011 * bumpiness
    wheel.travelVel +=
      (DERIVED.wheelSpring.k * (want - wheel.travel) - DERIVED.wheelSpring.c * wheel.travelVel) * dt
    wheel.travel += wheel.travelVel * dt
  }

  /*
    ==========================================================================
    The road moves under the car.

    **The first thing in this game that is not standing still.** A suspended
    span over open water swings, and until now the only things a road could do
    to you were be narrow, be tight, be wet or be steep — all of which are
    shapes it holds still while you deal with them. This one does not hold
    still, and that is a different kind of difficult: the line that worked on
    the way in is wrong by the middle of the bridge.

    **A travelling wave, not a shove.** A bridge does not move in one piece —
    the wave runs along it — so the phase carries `car.s`. Driving *into* the
    wave meets it sooner than sitting still would, which is why the span cannot
    be learned as "push left here": how much it has moved by the time you reach
    a given plank depends on how fast you got there.

    **Timed off the car's own race clock**, never off `performance.now()`. Two
    people racing wheel to wheel both start their clocks at the flag, so both
    bridges are in the same place at the same moment. A wall-clock phase would
    give each of them a different bridge, which is the sort of thing nobody
    would ever think to check and everybody would feel.

    Applied as an acceleration in the road's own frame, so it is a force on the
    car rather than a teleport of its position — it can be leaned against,
    caught late, or used, and the tyres get a say in all three.
    ==========================================================================
  */
  /*
    ==========================================================================
    Everything the road does to the car sideways, in one place.

    Three things do it and there are only two ways they can do it, so this is
    two lines of arithmetic rather than three near-identical blocks each with
    its own chance of a sign error.

    **Tilted floor.** The Moonbreak's span rolls under the car (`swayRollAt`)
    and the Stormcrown has corners authored to lean the wrong way
    (`Band.camber`). Both are the road not being level, both are resolved the
    same way — gravity down the slope, `g·sin(tilt)` — and both are the *same*
    angle the road is drawn at and the car is laid on, so nothing here can
    disagree with what is on the screen.

    Eleven degrees of swing works out at almost exactly two metres per second
    squared, which matters more than it sounds: the span gives the car three and
    a half metres either side of the middle, and a sine of amplitude `a` at `w`
    radians a second moves what it is pushing by `a / w²` — about a metre and a
    half, spent before the driver has done anything. The first attempt was three
    and a half, which spends two and a half metres and cannot be driven; the
    harness caught it before the road was ever played.

    **Weather.** The gale (`galeAt`) is a force rather than a slope, so it is
    added straight in. It is the only one of the three that is not a property of
    the ground.

    Left is negative n and a positive tilt lifts the right, so both signs come
    out of `basisAt` rather than out of trying them both ways.
    ==========================================================================
  */
  const swaying = swayRollAt(road.sway, car.s, car.elapsed)
  const tilt = swaying + road.camber
  const sideways =
    (tilt === 0 ? 0 : -TUNE.gravity * Math.sin(tilt)) +
    galeAt(road, car.s, car.elapsed, v)
  if (sideways !== 0) {
    car.vn += sideways * Math.cos(car.psi) * dt
    car.vs -= sideways * Math.sin(car.psi) * dt
  }

  // --- into the road's frame ----------------------------------------------
  const cos = Math.cos(car.psi)
  const sin = Math.sin(car.psi)
  const alongRoad = car.vs * cos - car.vn * sin
  let acrossRoad = car.vs * sin + car.vn * cos

  const denom = Math.max(0.4, 1 - car.n * road.curv)
  const sDot = alongRoad / (denom * road.metric)

  car.s += sDot * dt
  car.n += acrossRoad * dt
  car.psi += (car.yaw - road.curv * sDot * road.metric) * dt
  // An angle, so it lives on a circle. Without this a couple of hard corners
  // leave psi at twelve radians and every consumer of it — the ghost, the
  // spirit's own steering — is reading a number that no longer means anything.
  if (car.psi > Math.PI) car.psi -= Math.PI * 2
  else if (car.psi < -Math.PI) car.psi += Math.PI * 2

  const split = track.split
  if (split) {
    // The choice happens in the shared stone before the tunnels pull apart.
    if (
      !car.shortcut &&
      car.s >= split.from + 4 &&
      car.s <= split.commitAt &&
      car.n > split.portalN
    ) {
      /*
        Preserve the car's world-space pose as the right lane becomes its own
        centreline. Merely flipping `shortcut` made the car inherit the new
        road with its old lateral coordinate, which is a sideways jump once a
        real, visibly separated fork exists.
      */
      roadAt(track, car.s, road)
      const oldHeading = road.heading
      const worldX = road.x - Math.cos(oldHeading) * car.n
      const worldZ = road.z + Math.sin(oldHeading) * car.n
      const worldHeading = oldHeading - car.psi
      car.shortcut = true
      car.struck.clear()
      roadAtRoute(track, car.s, true, road)
      car.n =
        (worldX - road.x) * -Math.cos(road.heading) +
        (worldZ - road.z) * Math.sin(road.heading)
      car.psi = road.heading - worldHeading
      if (car.psi > Math.PI) car.psi -= Math.PI * 2
      else if (car.psi < -Math.PI) car.psi += Math.PI * 2
    }
    // Both centrelines and headings are already the same again here. Changing
    // route is therefore a topological change, not a teleport or a correction.
    if (car.shortcut && car.s >= split.rejoinAt) {
      car.shortcut = false
      car.struck.clear()
    }
    roadAtRoute(track, car.s, car.shortcut, road)
  }

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
    /*
      No floor here, and that matters more than it looks.

      There used to be one — the car was never allowed to be going slower than
      a walk, because with no throttle a car that stopped could never start
      again. Reverse arrived and the floor became `max(0, vs)`, which is worse
      than useless: it is *exactly* while scraping along the rock that you want
      to back out, and clamping the speed to zero-or-positive was the one thing
      preventing it. The scrubbing above is multiplicative and keeps its sign,
      so nothing needs to be clamped at all.
    */
  }
  car.touching = touching

  // --- stones --------------------------------------------------------------
  car.hitStone = false
  for (let i = 0; !car.shortcut && i < track.boulders.length; i++) {
    if (car.struck.has(i)) continue
    const stone = track.boulders[i]
    if (Math.abs(stone.s - car.s) > 2.4) continue
    if (Math.abs(stone.n - car.n) > stone.size * 0.75 + CAR_HALF_WIDTH) continue
    car.struck.add(i)
    car.hitStone = true
    car.strikes++
    car.vs = car.vs * (1 - Math.min(0.42, 0.14 + stone.size * 0.22))
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
      // Snap the slip out. This is why it feels like a launch rather than a
      // gradual recovery: the sideways energy becomes forward energy.
      car.vn *= 0.35
    }
    car.driftCharge = 0
  }

  /*
    --- the ember, and where it comes from ---------------------------------

    **Seconds spent drifting. Nothing else.**

    It used to trickle in from three places at once — how sideways you were,
    how close you were running to the rock, and a lump every time you let a
    drift go — which between them meant the meter went up for reasons nobody
    could name. You could not answer "how do I get more of that", and a reward
    you cannot aim at is not a reward, it is weather.

    One source, and it is the thing the game is about: hold a drift, the bar
    fills. Six and a half seconds of drifting is a full one — but you have
    never had to wait for a full one since it became spendable in any amount,
    and the whole point of the meter is that it now runs continuously: filling
    through the corner, draining down the straight after it.
  */
  if (car.drifting) {
    car.ember = Math.min(1, car.ember + dt / TUNE.emberFillSeconds)
  }

  /*
    Spending it burns what is in the bar, and the bar drains as it burns.

    `boostLeft` is the seconds remaining and `ember` is that same number drawn
    as a bar, which is why they are mirrored rather than being two independent
    facts that can disagree: what you are watching go down *is* the boost. It
    is also why a drift can stop the burn without stealing the remainder — see
    `driftMode`, which only zeroes `boostLeft`, leaving `ember` at whatever the
    last mirror put there.

    Pressing the ember always cancels a drift — again `driftMode` — whether or
    not there was anything to spend, because the button means "straighten up
    and go".
  */
  if (input.boost && car.boostLeft <= 0 && car.ember > BOOST_FLOOR) {
    car.boostLeft = car.ember * TUNE.boostSeconds
  }
  if (car.boostLeft > 0) {
    car.boostLeft = Math.max(0, car.boostLeft - dt)
    car.ember = car.boostLeft / TUNE.boostSeconds
  }

  car.elapsed += dt
  if (!car.finished && car.s >= track.finishAt) car.finished = true

  /*
    --- the end of the road is rock ----------------------------------------

    This used to be `if (car.s >= track.length) car.s = track.length`, and a
    clamp is not a wall. The car kept every metre a second of its speed with
    its position pinned, so what actually happened at the end of every run was
    that the car arrived at the last ring of the tunnel still doing thirty and
    sat there, nose in the open end of the mesh, while the brake bled the speed
    off against nothing. Since the mesh had no end cap, the thing you were
    looking at while the result came up was a black rectangle.

    There is a back wall in the hall now, and this is it. Treated the same way
    as the rock at the sides of the road: the impact fires once, on the step
    contact begins, and scraping is per second — a contact force is per second
    and an impact is not.

    No strike is charged for it. Strikes are stones you hit while racing; the
    roll-in is the car steering itself and the player reading a result, and
    marking their run down for something they did not do is worse than not
    noticing.
  */
  const backWall = track.length - END_WALL
  if (car.s > backWall) {
    if (car.vs > 4 && !car.touching) car.slam = Math.max(car.slam, Math.min(1, car.vs / 30))
    car.s = backWall
    if (car.vs > 0) car.vs = 0
  }
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
/**
 * A car, as the four things anybody else needs to draw it.
 *
 * One description, two readers. It is what a saved run is made of, sample by
 * sample, and it is what goes down the wire six times a second while the two
 * of you are racing — see `wire.ts`. Written twice, the ghost you chase and
 * the car beside you would be free to slowly stop being the same shape.
 */
export function packCar(car: CarState): { n: number; s: number; psi: number; state: number } {
  const slip = Math.min(1, Math.abs(slipOf(car)) / 0.6)
  return {
    n: car.n,
    s: car.s,
    psi: car.psi,
    state:
      (Math.round(slip * SAMPLE_DRIFT) & SAMPLE_DRIFT) |
      (car.boostLeft > 0 ? SAMPLE_BOOST : 0) |
      (car.rough ? SAMPLE_ROUGH : 0) |
      (car.braking > 0.35 ? SAMPLE_BRAKE : 0) |
      (wheelspinOf(car) > 0.3 ? SAMPLE_SLIDE : 0) |
      (car.shortcut ? SAMPLE_SHORTCUT : 0),
  }
}

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
    const { n, s, psi, state } = packCar(car)
    this.path.push(Math.round(n * 1000), Math.round(s * 100), Math.round(psi * 1000), state)
  }

  finish(car: CarState): RallyRun {
    this.push(car)
    return {
      v: 4,
      timeMs: Math.round(car.elapsed * 1000),
      path: this.path.slice(),
      strikes: car.strikes,
      driftMs: Math.round(car.driftMs),
    }
  }
}
