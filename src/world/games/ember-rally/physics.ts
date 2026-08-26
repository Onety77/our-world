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
  roadAtRoute,
  vergeWidth,
  type RoadAt,
  type Track,
} from './track'

// Re-exported because it lived here first and half the racer imports it from
// here. It belongs to the road — see the note beside it in track.ts.
export { vergeWidth }

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
const CG_HEIGHT = 0.38
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

/**
 * How much grip the stone has. Generous — this is a garden, not a simulator.
 *
 * Raised when load sensitivity went in, and the two numbers belong together.
 * A tyre whose peak goes as `Fz^0.8` gives up perhaps a fifth of its grip once
 * the weight is leaning on the outside pair of a cornering car, so the *stated*
 * coefficient has to be higher than the one the car actually achieves. What
 * matters is the measured number: `npm run rally` reports what it holds round
 * a constant corner, and that should be a little over 1.1 g. Change this and
 * read that, never the other way round.
 *
 * It also sets the steering ratio — see `maxSteer`, which derives how much
 * lock to offer from how much the tyres can use.
 */
const GRIP = 1.78
/**
 * Where the tyre gives up.
 *
 * These are the arguments to a `tanh`, so the peak sits at roughly `1/k`: a
 * stiffness of 9 means that tyre is at its limit around eleven degrees of
 * slip, which is about right for something road-legal on stone. A hyperbolic
 * tangent rather than a real Pacejka curve because it saturates *smoothly and
 * forever* — a curve that falls away past its peak is more truthful and turns
 * every small mistake into a spin.
 *
 * ---------------------------------------------------------------------------
 * **The rear is stiffer than the front, and that is what keeps the car alive.**
 *
 * A car's stability is decided by its understeer gradient,
 * `K = W_f/C_f − W_r/C_r`. Positive means understeer, and an understeering car
 * is *self-correcting*: disturb it and it converges. Negative means oversteer,
 * and an oversteering car has a critical speed above which it is divergently
 * unstable — push it and it leaves.
 *
 * The four-wheel rewrite gave both axles one shared stiffness. With force
 * linear in load that makes `K` exactly **zero** — neutral steer, balanced on
 * the knife edge, stable in theory and in practice diverging the moment
 * anything is asked of it. The bicycle model it replaced had 82,000 front
 * against 94,000 rear precisely to avoid this, and the split was lost in
 * translation. Everything that was afterwards bolted on to stop the car
 * spinning — the steering autopilot, the throttle cut at six degrees of slip,
 * the sixteen-degree leash — was treating a symptom of this line.
 *
 * `npm run rally` measures the gradient that comes out. Keep it positive.
 * ---------------------------------------------------------------------------
 */
const STIFF_FRONT = 8.6
const STIFF_REAR = 11.3
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
const NOMINAL_LOAD = (960 * 9.81) / 4
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
 *
 * ---------------------------------------------------------------------------
 * **This is where the top speed lives, and it was far too low.**
 *
 * At 1.16 the car ran to a hundred and sixty-seven kilometres an hour, and
 * nearly two hundred on the ember — down a tunnel between four and seven
 * metres wide. Two separate things were wrong with that, and only one of them
 * was the number:
 *
 * The number was too big for the road. But the *feel* was worse: drag rises
 * with the square of speed, so a terminal velocity that far away is one the
 * car spends the entire straight creeping toward and never reaches. It reads
 * as a car with **no maximum at all** — you hold the throttle and the number
 * keeps going up, until you arrive at a corner carrying a speed you never
 * chose. "It feels like it doesn't have a top speed" is exactly what an
 * under-damped terminal velocity feels like, and no amount of grip fixes it.
 *
 * More than twice the drag puts it at a hundred and thirty-one, *and* — the
 * part that matters — the car now gets there in the first third of a straight
 * and sits on it. There is a speed, you reach it, you know you are at it.
 * ---------------------------------------------------------------------------
 */
const DRAG = 2.68
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
 * Newton-metres of engine braking at the crank, off the throttle.
 *
 * Multiplied by the gear, so it is strong in first and gentle in fifth —
 * exactly as it is in a real car, and the reason lifting off in a low gear
 * settles the nose into a corner.
 */
const ENGINE_BRAKE = 66
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

/**
 * What the car actually does, flat out and unboosted: 131 km/h.
 *
 * Not a limit — `DRAG` is the limit and this is what it works out to. It is
 * here because half the game normalises against it: how far the chase camera
 * stands off, how wide the field of view opens, how loud the wind is, and how
 * full the speedometer's line reads. Measure it with `npm run rally` after
 * touching drag, gearing or torque, and put the answer here — a reference
 * speed that is a third higher than the real one quietly means the camera
 * never fully opens and the meter never fills.
 */
export const TOP_SPEED = 36.4
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

/**
 * How far the car hangs out at full lock, radians. About twenty-six degrees.
 *
 * Comfortably inside `MAX_SLIP`, so the model's own anti-spin never has an
 * opinion about a deliberate drift — the two would fight, and the drift would
 * lose in a way nobody could name.
 */
const DRIFT_ANGLE = 0.46
/** Lock and speed needed to start one. */
const DRIFT_ENTER_STEER = 0.25
const DRIFT_ENTER_SPEED = 11
/** Below this there is nothing to drift. */
const DRIFT_EXIT_SPEED = 7
/** Arrows this near centre count as going straight. */
const DRIFT_HOLD_STEER = 0.2
/** And this long of it lets the drift go. */
const DRIFT_STRAIGHT_EXIT = 2
/**
 * How quickly the pose crosses from one side to the other.
 *
 * The single most important number for how a drift *feels*. Too slow and
 * swapping sides through a chicane is impossible; too fast and the car snaps
 * between poses like a switch and the weight disappears. About a third of a
 * second to cross over.
 */
const DRIFT_SWAP = 3.4
/**
 * The tightest arc the arrows can ask for, in metres.
 *
 * ---------------------------------------------------------------------------
 * **The arrows ask for a line, not for a force. This is the difference, and
 * getting it the wrong way round is what made long corners impossible.**
 *
 * The command used to be a yaw rate capped in *g*, on the reasoning that a
 * flat cap in radians a second would be a gentle curve at 20 m/s and a
 * pirouette at 45 — which is true, and the cure was worse. A constant lateral
 * g is a constant *force*, and the arc a constant force draws is `v² / a`: it
 * opens up with the square of the speed. So holding the stick still through a
 * corner while the car picked up speed made the car turn *less* every second,
 * while the corner needed it to turn *more* every second, and the two gaps
 * added. Measured through a 53 metre corner: yaw rate falling 0.33 → 0.26 rad/s
 * while the corner's demand rose 0.38 → 0.47. The car tucked to the inside for
 * the first two seconds, then washed out across the road and into the wall —
 * and no timing on the entry could prevent it, because the fault accumulated
 * *after* the entry. It only ever showed in one place: a corner long enough
 * for the speed to change while the drift was held.
 *
 * Asking for a curvature instead means a held stick is a held arc, whatever
 * the car is doing about speed. Which is the thing a driver is actually trying
 * to do — you aim at a radius, not at a number of newtons — and it is what
 * makes a long corner learnable: this much thumb is this much corner.
 * ---------------------------------------------------------------------------
 */
const DRIFT_RADIUS = 25
/**
 * And the most g that arc is allowed to pull, which is now a ceiling rather
 * than the control.
 *
 * It still has to exist — without it, full lock at 45 m/s would be a curvature
 * no car should survive — but it should bite only at the top of the range, not
 * in the middle of every corner. Above about 23 m/s it starts opening the arc
 * out again, and that is honest: past there you genuinely are asking for more
 * than the road can give you, and the answer is to arrive slower.
 */
const DRIFT_MAX_G = 2.05
const DRIFT_TURN = 1.3
/** What hanging it right out costs, per second, at full angle. */
const DRIFT_SCRUB = 0.2
/** How fast the arcade model takes over, and hands back. */
const DRIFT_BLEND_IN = 7
const DRIFT_BLEND_OUT = 5

/**
 * How long a *full* bar of ember burns for, in seconds.
 *
 * ---------------------------------------------------------------------------
 * **The bar is a tank, not a token.**
 *
 * It used to be all-or-nothing: the meter had to read full, pressing it spent
 * the lot, and what you got back was a fixed one and a half seconds however
 * much or little you had. Both halves of that were wrong in the same way —
 * they made the bar a *button that is sometimes available* rather than
 * something you own and manage.
 *
 * Owning three quarters of a bar and not being allowed to use any of it is the
 * worst state a resource can put a player in: you are carrying it, you can see
 * it, and the game will not let you spend it. And a fixed burn means a full bar
 * and a nearly-full bar are worth exactly the same, so there is no reason to
 * ever wait — which is the opposite of what a meter is for.
 *
 * So: **press it with anything in the bar and it burns what is there.** A
 * quarter of a bar is a second of shove out of a hairpin; a full one is nearly
 * five seconds down a straight. The bar drains while it burns, in front of
 * you, because it *is* the boost — and a drift stops the burn and keeps
 * whatever is left, so flicking into a corner mid-boost is a decision rather
 * than a mistake.
 * ---------------------------------------------------------------------------
 */
export const BOOST_SECONDS = 4.6
/**
 * Seconds of drifting that fill the bar from empty.
 *
 * Longer than it was, because the bar buys three times as much as it used to
 * and every fraction of it is now spendable. One second of holding a slide is
 * about seven tenths of a second of boost, which is the exchange rate the
 * whole game turns on: drifting is not a thing you do *instead* of going fast,
 * it is how you buy going fast.
 */
export const EMBER_SECONDS = 6.5
/** Kept so nothing that imported it breaks; any amount is spendable now. */
export const BOOST_COST = 1
/**
 * The least that is worth spending.
 *
 * Not a minimum you have to reach — a floor under "the bar is empty", so that
 * a press with nothing in it is not a boost of two hundredths of a second.
 */
const BOOST_FLOOR = 0.04
const BOOST_TORQUE = 1.38

/**
 * The shell on its springs, as frequency and damping.
 *
 * Stated in hertz and in a damping ratio rather than as two tuning numbers,
 * because those are the two things that mean something: **the frequency is how
 * heavy it looks** — a body that answers at four hertz is a go-kart and one
 * that answers at one is a barge — and **the damping ratio is how much it
 * overshoots**, which is the cue that there is a mass up there at all. Under
 * 1.0 it goes past and comes back; at 1.0 and above it never does, and that is
 * exactly what a first-order lag was doing here before.
 *
 * A real car's sprung mass sits between one and two hertz. Pitch is a little
 * quicker than roll because a car is longer than it is wide, and the wheels
 * are quicker and looser than either because unsprung mass is a twentieth of
 * the weight and barely damped by comparison.
 */
function spring(hz: number, zeta: number): { k: number; c: number } {
  const omega = 2 * Math.PI * hz
  return { k: omega * omega, c: 2 * zeta * omega }
}
const BODY_ROLL = spring(1.35, 0.55)
const BODY_PITCH = spring(1.6, 0.6)
const BODY_HEAVE = spring(1.5, 0.55)
const WHEEL_SPRING = spring(2.4, 0.45)

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
  /** And how fast it is moving. A spring needs a velocity — see BODY_ROLL. */
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
   * a spring at all — see BODY_ROLL. Purely how the car is *drawn*: nothing
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
    load: MASS * G * 0.25,
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
const MAX_LOCK = 0.55
/**
 * Slack past the limit, radians, and how far over the driver may go.
 *
 * `SLIP_MARGIN` is roughly the slip angle the front tyres run at their peak,
 * so a driver holding maximum useful lock is *at* the limit rather than short
 * of it. `OVERDRIVE` is how far past that they are allowed — enough to feel
 * the front go light and to provoke the car deliberately, not enough to fling
 * it sideways with one keystroke.
 */
const SLIP_MARGIN = 0.05
const OVERDRIVE = 1.7

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
 * Deriving it from the grip fixes it permanently. Change `GRIP` and the
 * steering ratio follows, instead of a table quietly going out of date.
 * ---------------------------------------------------------------------------
 */
function maxSteer(v: number): number {
  // Floored, or standing still asks for infinite lock.
  const usable = (WHEELBASE * GRIP * G) / Math.max(30, v * v)
  return Math.min(MAX_LOCK, (usable + SLIP_MARGIN) * OVERDRIVE)
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
    if (input.handbrake && lock > DRIFT_ENTER_STEER && v > DRIFT_ENTER_SPEED) {
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
  car.driftBlend += ((car.drifting ? 1 : 0) - car.driftBlend) * (1 - Math.exp(-rate * dt))
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
  const surfaceGrip = car.rough ? 0.62 : 1 - road.wet * 0.14
  const rollingDrag = car.rough ? 0.09 : 0.0135
  const mu = GRIP * surfaceGrip

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
    STIFF_FRONT — and because you can lift off. An assist that exists to hide
    an unstable car is a sign the car needs fixing, not hiding.
  */
  const steerCommand = Math.max(-1, Math.min(1, input.steer))
  const wanted = steerCommand * maxSteer(v)
  // The rack itself. Quick, because the hand in `controls.ts` is already the
  // slow part and two lags in series is a car that answers questions late.
  car.steerAngle += (wanted - car.steerAngle) * (1 - Math.exp(-11.5 * dt))

  /*
    The hand on the wheel.

    Past `MAX_SLIP` a fraction of the correction goes in whether you asked for
    it or not. See `CATCH` — this is a deliberate and stated dishonesty, and
    the alternative is a game that cannot be played with two arrow keys.
  */
  const beta = slipOf(car)
  car.caught = false
  // Never during a deliberate drift: the hand and the drift would be pulling
  // in opposite directions, and the player would feel only the argument.
  if (car.driftBlend < 0.02 && Math.abs(beta) > MAX_SLIP * 0.72) {
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

  const longTransfer = (MASS * car.pitchLoad * CG_HEIGHT) / WHEELBASE
  const latTransfer = (MASS * car.rollLoad * CG_HEIGHT) / (TRACK_HALF * 2)

  const axleFront = Math.max(0, staticFront + aeroBias - longTransfer)
  const axleRear = Math.max(0, staticRear - aeroBias + longTransfer)
  // Split front/rear by how stiff each end is in roll. A stiffer end takes
  // more of the transfer and therefore lets go first, which is the one knob
  // that decides whether a car understeers or oversteers.
  const rollFront = 0.62
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
    crankTorque = PEAK_TORQUE * torqueCurve(car.revs) * car.throttle
    if (car.boostLeft > 0 && !car.reversing) crankTorque *= BOOST_TORQUE
    // The limiter, so the last gear is drag-limited rather than rev-limited.
    if (car.revs > 1) crankTorque = 0
    if (car.reversing) crankTorque = Math.min(crankTorque, PEAK_TORQUE * 0.55)
  } else if (Math.abs(drivenOmega) > 0.5) {
    /*
      Engine braking.

      Lift off and the engine becomes a pump the wheels have to turn. This is
      what makes releasing the key *mean* something: the car slows, harder in a
      low gear than a high one, and eventually stops. Without it a lifted car
      only has drag, which does nothing below about fifteen metres a second,
      and coasting to a halt takes half a minute.
    */
    crankTorque = -ENGINE_BRAKE * (0.25 + car.revs) * Math.sign(drivenOmega)
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
  const frontShare = BRAKE_TORQUE * BRAKE_BIAS
  const rearShare = BRAKE_TORQUE * (1 - BRAKE_BIAS) * rearLeft
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
      mu * wheel.load * Math.pow(Math.max(wheel.load, 60) / NOMINAL_LOAD, -LOAD_SENSITIVITY),
    )
    // Front and rear tyres are deliberately not the same. See STIFF_FRONT.
    const stiffness = front ? STIFF_FRONT : STIFF_REAR
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
  along -= DRAG * v * Math.abs(car.vs)
  along -= MASS * G * rollingDrag * Math.sign(car.vs || 1)
  // The road tilts under it.
  along -= MASS * G * road.grade

  const accel = along / MASS + car.vn * car.yaw
  const lateral = totalY / MASS - car.vs * car.yaw
  car.accel = accel
  car.lateral = lateral
  // What the corner is actually pulling, in m/s². Roll and lateral load
  // transfer both read this rather than the body-frame derivative above.
  car.cornering = totalY / MASS
  car.vs += accel * dt
  car.vn += lateral * dt
  car.yaw += (moment / INERTIA) * dt

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
      How tightly the path bends — as an arc, not as a force.

      See DRIFT_RADIUS. The arrows name a curvature, the g ceiling and the
      rotation ceiling trim it at the top of the speed range, and what comes
      out is a yaw rate because that is what the rest of this block speaks.
      The order matters: clamp the *line* first, then convert, or the g cap
      ends up being the thing the driver is steering with again.

      Set a little tighter than what the tyres can do, which is what makes a
      drift genuinely quicker through a tight corner than gripping — and paid
      for by the scrub below, which is what stops it being quicker through
      everything.
    */
    const asked = (command / DRIFT_RADIUS) * car.driftBlend
    const most = (DRIFT_MAX_G * G) / (speed * speed)
    const bend = Math.sign(asked) * Math.min(Math.abs(asked), most)
    const turn = Math.max(-DRIFT_TURN, Math.min(DRIFT_TURN, bend * speed))

    /*
      The angle it hangs at, following the same key that is steering it.

      This is what makes swapping sides work: hold the other arrow and the
      target crosses through zero to the far side, so the car swings through
      straight and hangs out the other way without ever leaving the drift.
    */
    const want = -command * DRIFT_ANGLE * car.driftBlend
    const was = car.driftAngle
    car.driftAngle += (want - car.driftAngle) * (1 - Math.exp(-DRIFT_SWAP * dt))
    const swing = (car.driftAngle - was) / Math.max(dt, 1e-5)

    // Rebuild the velocity from the pose, and rotate the car by however much
    // is needed for the *path* to turn at `turn` while the pose is changing.
    const poseVs = speed * Math.cos(car.driftAngle)
    const poseVn = speed * Math.sin(car.driftAngle)
    car.vs += (poseVs - car.vs) * car.driftBlend
    car.vn += (poseVn - car.vn) * car.driftBlend
    car.yaw += (turn - swing - car.yaw) * car.driftBlend

    // Sideways is not free. Squared, so a small angle costs almost nothing and
    // hanging it right out bleeds speed the way it should.
    const sideways = Math.abs(Math.sin(car.driftAngle))
    car.vs *= 1 - DRIFT_SCRUB * sideways * sideways * dt * car.driftBlend

    /*
      What the body leans on.

      Taken from the commanded corner rather than from the tyre forces, which
      during a drift are enormous and pointing the wrong way — the car is being
      moved by this block, not by them, so asking them how hard it is cornering
      gives an answer about a car that is not the one on screen.
    */
    car.cornering += (turn * speed - car.cornering) * car.driftBlend
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
  const slipLimit = MAX_SLIP
  const maxLateral = held * Math.tan(slipLimit)
  // The drift sets the angle deliberately and stays well inside MAX_SLIP, so
  // this backstop has nothing to say about it — but it must not be *able* to.
  if (car.driftBlend < 0.02 && Math.abs(car.vn) > maxLateral) {
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

  const wantRoll = Math.max(-0.185, Math.min(0.185, (-car.cornering / G) * 0.14))
  const wantPitch = Math.max(-0.13, Math.min(0.1, (-car.accel / G) * 0.11))
  const wantHeave =
    Math.max(-0.07, Math.min(0.03, -(weight - MASS * G) / 125_000)) +
    surface(car.s) * 0.004 * bumpiness

  car.rollVel += (BODY_ROLL.k * (wantRoll - car.roll) - BODY_ROLL.c * car.rollVel) * dt
  car.roll += car.rollVel * dt
  car.pitchVel += (BODY_PITCH.k * (wantPitch - car.pitch) - BODY_PITCH.c * car.pitchVel) * dt
  car.pitch += car.pitchVel * dt
  car.heaveVel += (BODY_HEAVE.k * (wantHeave - car.heave) - BODY_HEAVE.c * car.heaveVel) * dt
  car.heave += car.heaveVel * dt

  // Per-wheel travel, off the load each is carrying. Same reasoning: it agrees
  // with the physics because it *is* the physics.
  const restLoad = (MASS * G) / 4
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
      (WHEEL_SPRING.k * (want - wheel.travel) - WHEEL_SPRING.c * wheel.travelVel) * dt
    wheel.travel += wheel.travelVel * dt
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
      car.shortcut = true
      car.struck.clear()
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
    car.ember = Math.min(1, car.ember + dt / EMBER_SECONDS)
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
    car.boostLeft = car.ember * BOOST_SECONDS
  }
  if (car.boostLeft > 0) {
    car.boostLeft = Math.max(0, car.boostLeft - dt)
    car.ember = car.boostLeft / BOOST_SECONDS
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
      (car.braking > 0.35 ? SAMPLE_BRAKE : 0) |
      (wheelspinOf(car) > 0.3 ? SAMPLE_SLIDE : 0) |
      (car.shortcut ? SAMPLE_SHORTCUT : 0)
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
      v: 4,
      timeMs: Math.round(car.elapsed * 1000),
      path: this.path.slice(),
      strikes: car.strikes,
      driftMs: Math.round(car.driftMs),
    }
  }
}
