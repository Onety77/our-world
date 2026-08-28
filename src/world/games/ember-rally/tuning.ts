/**
 * Every number that decides how the car drives, in one place you can move.
 *
 * ---------------------------------------------------------------------------
 * **Why this exists.** The car is tuned by *driving it*, and it always has
 * been — `physics.ts` is full of long notes explaining that some number was
 * changed because the car felt like a cardboard box, or because a long corner
 * was impossible, or because the top speed felt like it did not exist. Every
 * one of those notes is a round trip through an editor, a rebuild and a
 * re-drive, and the thing being judged is a *feeling* that does not survive
 * the trip.
 *
 * So the numbers move here, and `/dev7731` gets a slider for each of them. The
 * defaults below are exactly what the constants in `physics.ts`, `camera.ts`
 * and `controls.ts` used to be, so a device that has never opened the control
 * room drives precisely as it did before this file existed.
 * ---------------------------------------------------------------------------
 *
 * **Three layers, and the order matters.**
 *
 *   1. `DEFAULTS` — what is written here, in the code. The floor.
 *   2. **published** — a set of numbers the warm account has sent to both
 *      phones. Lives in one document; overrides the defaults everywhere.
 *   3. **draft** — what *this* device is currently trying out. Lives in
 *      localStorage and nowhere else, and overrides the published set on this
 *      device only.
 *
 * Which means the loop the control room is for is safe: you drag sliders for
 * an hour on your own phone and hers does not change by a millimetre, and when
 * it finally feels right you press one button and it does.
 *
 * **Reading these is on the hot path.** `advanceCar` runs at 120 Hz and the
 * fire-spirit runs a whole race through it in a couple of milliseconds, so
 * `TUNE` is a plain mutable object rather than a store — a hook call per tyre
 * per step would be absurd. The store below is for the *panel*; it writes into
 * `TUNE` and bumps a counter so React notices.
 *
 * **Some numbers are derived rather than stored**, because the honest dial is
 * not always the raw constant. "Top speed" is the clearest case: nothing in
 * the model sets a top speed, drag does, so the dial says a speed and
 * `DERIVED.drag` works out the drag that produces it — including compensating
 * for the power dial, so raising the power does not quietly raise the top
 * speed past what the top-speed dial says. See `recompute`.
 */

import { create } from 'zustand'

// ---------------------------------------------------------------------------
// What can be moved
// ---------------------------------------------------------------------------

export interface RallyTuning {
  // the world
  gravity: number

  // the car itself
  weight: number
  rotationWeight: number
  topHeaviness: number
  balance: number

  // grip
  grip: number
  frontBite: number
  rearBite: number
  tyreLag: number
  vergeGrip: number

  // engine and speed
  topSpeed: number
  power: number
  engineBraking: number

  // stopping
  brakes: number
  brakeBalance: number
  handbrake: number

  // steering
  steerLock: number
  steerSpeed: number
  steerWeight: number
  turnInBite: number

  // the helpers
  autoCountersteer: number
  spinProtection: number
  driftHelper: number

  // the drift
  driftAngle: number
  driftSwap: number
  driftTightness: number
  driftGrip: number
  driftScrub: number
  driftTopSpeed: number
  driftEnterSpeed: number

  // the ember
  boostPower: number
  boostSeconds: number
  emberFillSeconds: number

  // the camera
  cameraDistance: number
  cameraHeight: number
  cameraAim: number
  cameraZoom: number
  cameraLooseness: number
  cameraDriftSway: number
  cameraShake: number

  // the body
  bodyLean: number
  bodyFloat: number
}

/**
 * What every one of these was before there was a slider on it.
 *
 * **Do not tidy these into rounder numbers.** Each was arrived at by driving
 * the car, and several have a paragraph in `physics.ts` explaining what was
 * wrong with the number before it. A "cleaner" default is a silent
 * regression of somebody's afternoon.
 */
export const DEFAULTS: Readonly<RallyTuning> = Object.freeze({
  gravity: 9.81,

  weight: 960,
  rotationWeight: 1,
  topHeaviness: 0.38,
  balance: 0.62,

  grip: 1.78,
  frontBite: 8.6,
  rearBite: 11.3,
  tyreLag: 0.45,
  vergeGrip: 0.62,

  topSpeed: 36.4,
  power: 250,
  engineBraking: 66,

  brakes: 4200,
  brakeBalance: 0.63,
  handbrake: 2900,

  steerLock: 0.55,
  steerSpeed: 1,
  steerWeight: 0.567,
  turnInBite: 1.7,

  autoCountersteer: 0.34,
  spinProtection: 0.7,
  driftHelper: 1,

  driftAngle: 0.46,
  driftSwap: 3.4,
  driftTightness: 25,
  driftGrip: 2.05,
  driftScrub: 0.2,
  driftTopSpeed: 23,
  driftEnterSpeed: 11,

  boostPower: 1.38,
  boostSeconds: 4.6,
  emberFillSeconds: 6.5,

  cameraDistance: 1,
  cameraHeight: 1,
  cameraAim: 1.35,
  cameraZoom: 1,
  cameraLooseness: 1,
  cameraDriftSway: 2.1,
  cameraShake: 1,

  bodyLean: 1,
  bodyFloat: 1,
})

/**
 * The live set. Read directly, every step, by everything that drives.
 *
 * Mutated in place rather than replaced, so a module that grabbed a reference
 * at import time keeps seeing the current numbers.
 */
export const TUNE: RallyTuning = { ...DEFAULTS }

// ---------------------------------------------------------------------------
// The numbers that fall out of the numbers above
// ---------------------------------------------------------------------------

/** Constants the derivations are stated relative to. */
const BASE_DRAG = 2.68
const BASE_INERTIA = 1240
const WHEELBASE = 2.36

export interface RallyDerived {
  /** Newtons per (m/s)², worked back from the top-speed dial. */
  drag: number
  /** Yaw inertia, kg·m². */
  inertia: number
  /** Newtons on one tyre with the car at rest — the load the tyre curve is normalised to. */
  nominalLoad: number
  /** Steering rate standing still, and what is left of it flat out. */
  steerRate: number
  steerRateFast: number
  /** Body springs, as `k` and `c`. See `spring` below. */
  bodyRoll: Spring
  bodyPitch: Spring
  bodyHeave: Spring
  wheelSpring: Spring
}

interface Spring {
  k: number
  c: number
}

/**
 * The shell on its springs, as frequency and damping.
 *
 * Moved here from `physics.ts` unchanged, because the body-float dial has to
 * be able to rebuild them. The frequency is how heavy it looks and the damping
 * ratio is how much it overshoots — see the long note at the original site.
 */
function spring(hz: number, zeta: number): Spring {
  const omega = 2 * Math.PI * hz
  return { k: omega * omega, c: 2 * zeta * omega }
}

export const DERIVED: RallyDerived = {
  drag: BASE_DRAG,
  inertia: BASE_INERTIA,
  nominalLoad: (960 * 9.81) / 4,
  steerRate: 15,
  steerRateFast: 8.5,
  bodyRoll: spring(1.35, 0.55),
  bodyPitch: spring(1.6, 0.6),
  bodyHeave: spring(1.5, 0.55),
  wheelSpring: spring(2.4, 0.45),
}

/**
 * Work the derived numbers out again. Cheap, and only called when a dial moves.
 *
 * **The drag derivation is the one worth reading.** At the top of fifth the
 * car is not being held back by a limiter, it is being held back by the air:
 * drive force equals `drag · v²`. So if you want a stated top speed you invert
 * that — and because drive force scales with the power dial, the power has to
 * appear in it too. Without that term, winding the power up would raise the
 * top speed above whatever the top-speed dial claimed, and the dial would be a
 * label rather than a control.
 */
function recompute(): void {
  DERIVED.drag =
    BASE_DRAG *
    (TUNE.power / DEFAULTS.power) *
    Math.pow(DEFAULTS.topSpeed / Math.max(4, TUNE.topSpeed), 2)

  // Inertia goes with mass for a body of the same shape, so a heavier car is
  // reluctant in a straight line *and* in yaw unless you say otherwise.
  DERIVED.inertia =
    BASE_INERTIA * (TUNE.weight / DEFAULTS.weight) * Math.max(0.05, TUNE.rotationWeight)

  DERIVED.nominalLoad = (TUNE.weight * TUNE.gravity) / 4

  DERIVED.steerRate = 15 * TUNE.steerSpeed
  DERIVED.steerRateFast = 15 * TUNE.steerSpeed * TUNE.steerWeight

  // A float of 1 is the original set. Below 1 everything answers slower and
  // the car reads as heavier; above 1 it snaps and reads as a go-kart.
  const f = Math.max(0.15, TUNE.bodyFloat)
  DERIVED.bodyRoll = spring(1.35 * f, 0.55)
  DERIVED.bodyPitch = spring(1.6 * f, 0.6)
  DERIVED.bodyHeave = spring(1.5 * f, 0.55)
  DERIVED.wheelSpring = spring(2.4 * f, 0.45)
}

/** The wheelbase, for anything that wants to state a radius in car lengths. */
export const TUNE_WHEELBASE = WHEELBASE

// ---------------------------------------------------------------------------
// Where the numbers are kept
// ---------------------------------------------------------------------------

const DRAFT_KEY = 'rally:tuning-draft:v1'

/** Only keys we know about, only finite numbers, only inside their stated range. */
function clean(raw: unknown): Partial<RallyTuning> {
  if (raw === null || typeof raw !== 'object') return {}
  const source = raw as Record<string, unknown>
  const out: Partial<RallyTuning> = {}
  for (const dial of DIALS) {
    const value = source[dial.key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[dial.key] = Math.max(dial.min, Math.min(dial.max, value))
  }
  return out
}

function readDraft(): Partial<RallyTuning> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw === null) return null
    const parsed = clean(JSON.parse(raw))
    return Object.keys(parsed).length > 0 ? parsed : null
  } catch {
    return null
  }
}

function writeDraft(values: Partial<RallyTuning> | null): void {
  if (typeof window === 'undefined') return
  try {
    if (values === null) localStorage.removeItem(DRAFT_KEY)
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(values))
  } catch {
    /* storage blocked; the sliders still work, the device just forgets */
  }
}

/**
 * Rebuild `TUNE` from the three layers, in order, and tell React.
 *
 * Always from `DEFAULTS` up rather than by patching what is there, so clearing
 * a draft genuinely returns to the published set instead of leaving whichever
 * dials happened to be touched behind.
 */
function settle(): void {
  const state = useRallyTuning.getState()
  Object.assign(TUNE, DEFAULTS, state.published, state.draft ?? {})
  recompute()
}

/** How many dials this set moves away from the code's own numbers. */
function countChanged(values: Partial<RallyTuning>): number {
  let n = 0
  for (const dial of DIALS) {
    const value = values[dial.key]
    if (value !== undefined && Math.abs(value - DEFAULTS[dial.key]) > 1e-9) n += 1
  }
  return n
}

interface TuningState {
  /** What the warm account has sent to both devices. Empty until one arrives. */
  published: Partial<RallyTuning>
  /** What this device is trying out. Null means "whatever is published". */
  draft: Partial<RallyTuning> | null
  /** Bumped on every change, purely so components re-render. */
  stamp: number

  /** Move one dial on this device. Starts a draft if there was not one. */
  set(key: keyof RallyTuning, value: number): void
  /** Move several at once — presets, and pasted sets. */
  setMany(values: Partial<RallyTuning>): void
  /** Put one dial back to the code's default, on this device. */
  clear(key: keyof RallyTuning): void
  /** Throw the local draft away and drive whatever is published. */
  dropDraft(): void
  /** Draft *and* published, gone: back to the numbers in this file. */
  toDefaults(): void
  /** A set has arrived from the other side of the seam. */
  receivePublished(values: Partial<RallyTuning>): void
  /** The draft has been sent; it is now the published set and no longer a draft. */
  markPublished(values: Partial<RallyTuning>): void
}

export const useRallyTuning = create<TuningState>((set, get) => ({
  published: {},
  draft: null,
  stamp: 0,

  set(key, value) {
    get().setMany({ [key]: value } as Partial<RallyTuning>)
  },

  setMany(values) {
    const base = get().draft ?? { ...get().published }
    const draft = { ...base, ...clean(values) }
    writeDraft(draft)
    set({ draft, stamp: get().stamp + 1 })
    settle()
  },

  clear(key) {
    const base = get().draft ?? { ...get().published }
    const draft = { ...base }
    delete draft[key]
    writeDraft(draft)
    set({ draft, stamp: get().stamp + 1 })
    settle()
  },

  dropDraft() {
    writeDraft(null)
    set({ draft: null, stamp: get().stamp + 1 })
    settle()
  },

  toDefaults() {
    writeDraft({})
    set({ draft: {}, stamp: get().stamp + 1 })
    settle()
  },

  receivePublished(values) {
    set({ published: clean(values), stamp: get().stamp + 1 })
    settle()
  },

  markPublished(values) {
    const published = clean(values)
    writeDraft(null)
    set({ published, draft: null, stamp: get().stamp + 1 })
    settle()
  },
}))

/** What this device is actually driving, as a flat set. For sending and copying. */
export function currentTuning(): RallyTuning {
  return { ...TUNE }
}

/** Only the dials that differ from the code, which is all worth storing or sending. */
export function changedOnly(values: RallyTuning = TUNE): Partial<RallyTuning> {
  const out: Partial<RallyTuning> = {}
  for (const dial of DIALS) {
    if (Math.abs(values[dial.key] - DEFAULTS[dial.key]) > 1e-9) out[dial.key] = values[dial.key]
  }
  return out
}

export { countChanged, clean as cleanTuning }

// ---------------------------------------------------------------------------
// What each one is, in words
// ---------------------------------------------------------------------------

export type GroupId =
  | 'feel'
  | 'car'
  | 'grip'
  | 'engine'
  | 'stopping'
  | 'steering'
  | 'helpers'
  | 'drift'
  | 'ember'
  | 'camera'

/**
 * The headings, in the order they are worth going through.
 *
 * Grip first, then steering, then the helpers — that is the order in which a
 * complaint about the car usually resolves. "It won't turn" is nearly always
 * steering ratio or front grip; "it spins" is nearly always rear grip or one
 * of the helpers being too low; "it feels like a box" is the camera and the
 * body, and never the tyres.
 */
export const GROUPS: readonly {
  id: GroupId
  /** The heading, in full. */
  name: string
  /** One word, for the row of chips. A chip that wraps is not a chip. */
  short: string
  note: string
}[] = [
  {
    id: 'grip',
    short: 'grip',
    name: 'grip',
    note: 'How hard the tyres hold on. The first place to look if the car will not turn, or turns and then leaves.',
  },
  {
    id: 'steering',
    short: 'steering',
    name: 'steering',
    note: 'How much the wheels turn, and how fast your hand gets them there.',
  },
  {
    id: 'engine',
    short: 'engine',
    name: 'engine and speed',
    note: 'How fast it goes and how hard it pulls.',
  },
  {
    id: 'stopping',
    short: 'stopping',
    name: 'stopping',
    note: 'The brakes, their front-to-rear split, and the handbrake.',
  },
  {
    id: 'helpers',
    short: 'helpers',
    name: 'the helpers',
    note: 'The three places the game drives for you. Turn these down for a car that demands more, up for one that forgives.',
  },
  {
    id: 'drift',
    short: 'drift',
    name: 'the drift',
    note: 'What happens once the handbrake is down and the back has stepped out.',
  },
  {
    id: 'ember',
    short: 'ember',
    name: 'the ember',
    note: 'The boost: how hard it shoves, how long it lasts, how long drifting takes to refill it.',
  },
  {
    id: 'car',
    short: 'weight',
    name: 'the car itself',
    note: 'Weight and where it sits. These move everything else, so change them first and re-check the rest.',
  },
  {
    id: 'camera',
    short: 'camera',
    name: 'the camera',
    note: 'Where you watch from. Most of what a car feels like is here rather than in the tyres.',
  },
  {
    id: 'feel',
    short: 'body',
    name: 'the world and the body',
    note: 'Gravity, and how much the shell throws itself about on its springs.',
  },
]

export interface Dial {
  key: keyof RallyTuning
  group: GroupId
  /** Plain words. This is what appears on the slider. */
  name: string
  /** One sentence: what moving it actually does to the driving. */
  note: string
  /** What the two ends feel like. Shown either side of the slider. */
  low: string
  high: string
  min: number
  max: number
  step: number
  /** The value in a unit a person can picture, not the raw number. */
  show(value: number): string
}

const MS_TO_KMH = 3.6
const deg = (radians: number) => `${Math.round((radians * 180) / Math.PI)}°`
const pct = (x: number) => `${Math.round(x * 100)}%`
const times = (m: number) => `${m.toFixed(2)}×`

export const DIALS: readonly Dial[] = [
  // --- grip ----------------------------------------------------------------
  {
    key: 'grip',
    group: 'grip',
    name: 'Grip',
    note: 'How hard all four tyres hold the stone. The single biggest number in the car — it also widens the steering, because the game works out how much lock to give you from how much the tyres can use.',
    low: 'ice',
    high: 'glue',
    min: 0.6,
    max: 3.2,
    step: 0.01,
    show: (v) => `${v.toFixed(2)} g of hold`,
  },
  {
    key: 'frontBite',
    group: 'grip',
    name: 'Front tyre bite',
    note: 'How sharply the front tyres answer being turned. Raise it if the nose washes wide and refuses to point at the corner.',
    low: 'vague nose',
    high: 'sharp nose',
    min: 3,
    max: 20,
    step: 0.1,
    show: (v) => `${times(v / DEFAULTS.frontBite)} · bites at ${Math.round((180 / Math.PI) * (1 / v))}°`,
  },
  {
    key: 'rearBite',
    group: 'grip',
    name: 'Rear tyre bite',
    note: 'The same for the back — and the back has more of it than the front to begin with, which is what keeps the car stable. Drop it below the front and this page will warn you: such a car spins rather than running wide, and no amount of steering saves it.',
    low: 'loose tail',
    high: 'planted tail',
    min: 3,
    max: 20,
    step: 0.1,
    show: (v) => `${times(v / DEFAULTS.rearBite)} · bites at ${Math.round((180 / Math.PI) * (1 / v))}°`,
  },
  {
    key: 'tyreLag',
    group: 'grip',
    name: 'Tyre take-up',
    note: 'How far the car rolls before a tyre has built its grip. Small feels immediate and a little skate-like; large feels like there is rubber down there.',
    low: 'instant',
    high: 'slow to load',
    min: 0.05,
    max: 1.6,
    step: 0.01,
    show: (v) => `${(v * 100).toFixed(0)} cm of rolling`,
  },
  {
    key: 'vergeGrip',
    group: 'grip',
    name: 'Grip off the line',
    note: 'How much grip is left on the loose stuff at the edges of the road. Low makes running wide genuinely punishing.',
    low: 'gravel',
    high: 'same as the road',
    min: 0.2,
    max: 1,
    step: 0.01,
    show: (v) => `${pct(v)} of road grip`,
  },

  // --- steering ------------------------------------------------------------
  {
    key: 'steerLock',
    group: 'steering',
    name: 'Steering lock',
    note: 'The most the front wheels will ever turn, standing still. At speed the car offers far less than this on purpose — see turn-in bite.',
    low: 'bus',
    high: 'shopping trolley',
    min: 0.15,
    max: 1.1,
    step: 0.01,
    show: deg,
  },
  {
    key: 'steerSpeed',
    group: 'steering',
    name: 'Steering sensitivity',
    note: 'How fast your hand winds the lock on when you hold a key or push the touch control. This is the dial for "it answers too late" or "it darts".',
    low: 'slow hands',
    high: 'twitchy',
    min: 0.2,
    max: 3.5,
    step: 0.01,
    show: times,
  },
  {
    key: 'steerWeight',
    group: 'steering',
    name: 'Steering weight at speed',
    note: 'How much slower your hand gets as the car speeds up. Low means the steering goes heavy on a straight; at 100% it is as quick at full speed as it is at walking pace, which feels weightless.',
    low: 'heavy at speed',
    high: 'same at speed',
    min: 0.1,
    max: 1,
    step: 0.01,
    show: pct,
  },
  {
    key: 'turnInBite',
    group: 'steering',
    name: 'Turn-in bite',
    note: 'How far past the tyres’ best angle you are allowed to steer. Low is safe and slightly numb; high lets you provoke the car deliberately and also lets you throw it away.',
    low: 'safe',
    high: 'provokable',
    min: 1,
    max: 3.2,
    step: 0.01,
    show: times,
  },

  // --- engine --------------------------------------------------------------
  {
    key: 'topSpeed',
    group: 'engine',
    name: 'Top speed',
    note: 'What it will actually do flat out on a straight. Set by how much air is pushed aside, so the car reaches it and sits on it rather than creeping toward it forever.',
    low: 'town',
    high: 'runway',
    min: 12,
    max: 65,
    step: 0.1,
    show: (v) => `${Math.round(v * MS_TO_KMH)} km/h`,
  },
  {
    key: 'power',
    group: 'engine',
    name: 'Engine power',
    note: 'How hard it pulls out of a corner. Does not change the top speed — that dial holds — it changes how quickly you get there, and how easily the rears light up.',
    low: 'gentle',
    high: 'violent',
    min: 60,
    max: 560,
    step: 1,
    show: (v) => `${Math.round(v)} Nm`,
  },
  {
    key: 'engineBraking',
    group: 'engine',
    name: 'Slowing when you lift off',
    note: 'How much the engine drags the car back the moment you stop accelerating. High makes lifting off a real way to settle the nose into a corner.',
    low: 'coasts',
    high: 'anchors',
    min: 0,
    max: 220,
    step: 1,
    show: (v) => `${Math.round(v)} Nm`,
  },

  // --- stopping ------------------------------------------------------------
  {
    key: 'brakes',
    group: 'stopping',
    name: 'Brake strength',
    note: 'How hard the brakes bite at full pedal. Past a point they simply lock the wheels, and a locked wheel steers nowhere.',
    low: 'weak',
    high: 'locks instantly',
    min: 1200,
    max: 9500,
    step: 25,
    show: (v) => `${Math.round(v)} Nm`,
  },
  {
    key: 'brakeBalance',
    group: 'stopping',
    name: 'Brake balance',
    note: 'How much of the braking is done by the front wheels. Forward is safe and runs wide; backward makes the car rotate into a corner on the brakes, and past about a quarter it will swap ends.',
    low: 'all rear',
    high: 'all front',
    min: 0.25,
    max: 0.92,
    step: 0.01,
    show: (v) => `${Math.round(v * 100)}% front`,
  },
  {
    key: 'handbrake',
    group: 'stopping',
    name: 'Handbrake bite',
    note: 'How hard the handbrake grabs the rear wheels. It is not a slide button — it stops them turning, and a stopped tyre has nothing left to hold the back of the car with.',
    low: 'barely drags',
    high: 'locks solid',
    min: 300,
    max: 6500,
    step: 25,
    show: (v) => `${Math.round(v)} Nm`,
  },

  // --- helpers -------------------------------------------------------------
  {
    key: 'autoCountersteer',
    group: 'helpers',
    name: 'Slide catching',
    note: 'How much of the opposite lock the car applies for you once it is properly sideways. At zero the game needs a wheel and real hands; at full the car refuses to be out of shape and you cannot drift.',
    low: 'all yours',
    high: 'catches everything',
    min: 0,
    max: 1,
    step: 0.01,
    show: pct,
  },
  {
    key: 'spinProtection',
    group: 'helpers',
    name: 'Spin protection',
    note: 'The widest the car is allowed to hang sideways before it is hauled back. This is what stops a mistake ending your race — a spin takes longer to recover from than the race lasts.',
    low: 'never sideways',
    high: 'lets it go',
    min: 0.3,
    max: 1.5,
    step: 0.01,
    show: deg,
  },
  {
    key: 'driftHelper',
    group: 'helpers',
    name: 'Drift helper',
    note: 'How much of a drift is drawn for you rather than balanced by you. At full, holding a direction holds a clean arc. At zero the handbrake still locks the rears but nothing is helping, and it is very hard.',
    low: 'raw car',
    high: 'draws it for you',
    min: 0,
    max: 1,
    step: 0.01,
    show: pct,
  },

  // --- drift ---------------------------------------------------------------
  {
    key: 'driftAngle',
    group: 'drift',
    name: 'Drift angle',
    note: 'How far sideways the car hangs at full lock in a drift. Keep it under spin protection or the two will fight each other.',
    low: 'a hint',
    high: 'right out',
    min: 0.1,
    max: 1,
    step: 0.01,
    show: deg,
  },
  {
    key: 'driftSwap',
    group: 'drift',
    name: 'Drift swap speed',
    note: 'How quickly it crosses from one side to the other. The most important number for how a drift *feels* — too slow and a chicane is impossible, too fast and the car snaps between poses like a switch.',
    low: 'lazy',
    high: 'snaps over',
    min: 0.8,
    max: 9,
    step: 0.05,
    show: (v) => `${(1 / v).toFixed(2)} s to cross`,
  },
  {
    key: 'driftTightness',
    group: 'drift',
    name: 'Drift tightness',
    note: 'The tightest arc a held direction can ask for. Small draws a hairpin; large draws a long sweep. Holding a direction holds an arc, whatever the car is doing about speed.',
    low: 'hairpin',
    high: 'long sweep',
    min: 8,
    max: 70,
    step: 0.5,
    show: (v) => `${Math.round(v)} m circle`,
  },
  {
    key: 'driftGrip',
    group: 'drift',
    name: 'Drift hold',
    note: 'The most cornering force a drift is allowed to pull. A ceiling rather than a control — it should only bite when you are asking for more than the road can give.',
    low: 'washes out',
    high: 'holds anything',
    min: 0.6,
    max: 4.5,
    step: 0.05,
    show: (v) => `${v.toFixed(2)} g`,
  },
  {
    key: 'driftScrub',
    group: 'drift',
    name: 'What a drift costs',
    note: 'How much speed hanging it right out scrubs off per second. Zero makes drifting free, which quietly makes it the only way to drive.',
    low: 'free',
    high: 'expensive',
    min: 0,
    max: 0.9,
    step: 0.01,
    show: (v) => `${Math.round(v * 100)}% per second`,
  },
  {
    key: 'driftTopSpeed',
    group: 'drift',
    name: 'How fast a drift goes',
    note: 'The speed a drift settles at, and will not accelerate past — hanging it right out lands a little under this, a hint of angle a little over. Arriving faster than this is the entry: the car sheds the difference over about a second, which is the moment the drift is worth watching.',
    low: 'a crawl',
    high: 'flat out sideways',
    min: 8,
    max: 44,
    step: 0.5,
    show: (v) => `${Math.round(v * MS_TO_KMH)} km/h`,
  },
  {
    key: 'driftEnterSpeed',
    group: 'drift',
    name: 'Speed needed to start one',
    note: 'How fast you must be going before the handbrake will start a drift rather than just slow you down.',
    low: 'any time',
    high: 'flat out only',
    min: 2,
    max: 28,
    step: 0.5,
    show: (v) => `${Math.round(v * MS_TO_KMH)} km/h`,
  },

  // --- ember ---------------------------------------------------------------
  {
    key: 'boostPower',
    group: 'ember',
    name: 'Ember shove',
    note: 'How much extra the engine makes while the ember is burning.',
    low: 'a nudge',
    high: 'a kick',
    min: 1,
    max: 2.6,
    step: 0.01,
    show: (v) => `${Math.round((v - 1) * 100)}% more power`,
  },
  {
    key: 'boostSeconds',
    group: 'ember',
    name: 'How long a full bar burns',
    note: 'A full bar spent all at once. Any amount is spendable, so a quarter bar is a quarter of this.',
    low: 'a flash',
    high: 'a whole straight',
    min: 0.8,
    max: 12,
    step: 0.1,
    show: (v) => `${v.toFixed(1)} s`,
  },
  {
    key: 'emberFillSeconds',
    group: 'ember',
    name: 'Drifting needed to refill it',
    note: 'Seconds of holding a slide that fill the bar from empty. This is the exchange rate the whole game turns on: drifting is how you buy going fast.',
    low: 'cheap',
    high: 'earned',
    min: 1.5,
    max: 22,
    step: 0.1,
    show: (v) => `${v.toFixed(1)} s of drifting`,
  },

  // --- car -----------------------------------------------------------------
  {
    key: 'weight',
    group: 'car',
    name: 'Weight',
    note: 'How heavy the car is. Heavier is slower to get going, slower to stop and slower to change direction — and leans on its tyres harder, which costs grip.',
    low: 'kart',
    high: 'saloon',
    min: 450,
    max: 2000,
    step: 5,
    show: (v) => `${Math.round(v)} kg`,
  },
  {
    key: 'rotationWeight',
    group: 'car',
    name: 'Reluctance to rotate',
    note: 'How hard it is to swing the car around its middle, separately from how heavy it is. Low spins up eagerly and is darty; high resists both starting a slide and stopping one.',
    low: 'pivots',
    high: 'ponderous',
    min: 0.4,
    max: 2.5,
    step: 0.01,
    show: times,
  },
  {
    key: 'topHeaviness',
    group: 'car',
    name: 'Top-heaviness',
    note: 'How high the weight sits. This is how much load moves onto the front under braking and onto the outside in a corner — so it decides how much the car dives, leans, and lifts a wheel.',
    low: 'flat and stable',
    high: 'tips about',
    min: 0.12,
    max: 0.75,
    step: 0.01,
    show: (v) => `${(v * 100).toFixed(0)} cm high`,
  },
  {
    key: 'balance',
    group: 'car',
    name: 'Balance in a corner',
    note: 'Which end takes more of the weight that moves outward in a corner. The end that takes more lets go first — so forward means it runs wide, backward means the tail comes round.',
    low: 'loose, tail steps out',
    high: 'safe, runs wide',
    min: 0.3,
    max: 0.85,
    step: 0.01,
    show: (v) => `${Math.round(v * 100)}% on the front`,
  },

  // --- camera --------------------------------------------------------------
  {
    key: 'cameraDistance',
    group: 'camera',
    name: 'Camera distance',
    note: 'How far back it sits. Close makes the tunnel feel tight and the car big; far shows more road but the car stops being the subject.',
    low: 'on the bonnet',
    high: 'a long way back',
    min: 0.35,
    max: 2.4,
    step: 0.01,
    show: times,
  },
  {
    key: 'cameraHeight',
    group: 'camera',
    name: 'Camera height',
    note: 'How high above the road it rides. Low is dramatic and hides the corner; high shows the line you are about to take.',
    low: 'on the deck',
    high: 'looking down',
    min: 0.25,
    max: 2.6,
    step: 0.01,
    show: times,
  },
  {
    key: 'cameraAim',
    group: 'camera',
    name: 'Camera angle',
    note: 'How high up the road it points. Low puts the car in the middle of the frame; high tips the nose down and fills the screen with the road coming at you.',
    low: 'at the car',
    high: 'down the road',
    min: 0,
    max: 4,
    step: 0.05,
    show: (v) => `${v.toFixed(2)} m up`,
  },
  {
    key: 'cameraZoom',
    group: 'camera',
    name: 'How wide the lens is',
    note: 'Wider shows more of the tunnel and makes speed feel faster at the edges; narrower is calmer and flattens everything out.',
    low: 'telephoto, calm',
    high: 'wide, fast',
    min: 0.55,
    max: 1.45,
    step: 0.01,
    show: times,
  },
  {
    key: 'cameraLooseness',
    group: 'camera',
    name: 'Camera looseness',
    note: 'How quickly the camera catches up with the car. Loose lets the car pull away under power and come back at you on the brakes, which is most of where the felt weight lives. Tight is bolted on and reads as weightless.',
    low: 'floats behind',
    high: 'bolted on',
    min: 0.3,
    max: 2.6,
    step: 0.01,
    show: times,
  },
  {
    key: 'cameraDriftSway',
    group: 'camera',
    name: 'How much a slide shows',
    note: 'How far the camera slides the other way when the back steps out, so you are looking down the car’s flank instead of at its boot.',
    low: 'stays behind',
    high: 'swings right out',
    min: 0,
    max: 6,
    step: 0.05,
    show: (v) => `${v.toFixed(1)} m`,
  },
  {
    key: 'cameraShake',
    group: 'camera',
    name: 'Camera shake',
    note: 'Rough ground, stones and hitting the wall. Zero is glassy and dead; high is unreadable on a phone.',
    low: 'still',
    high: 'rattling',
    min: 0,
    max: 3,
    step: 0.01,
    show: times,
  },

  // --- feel ----------------------------------------------------------------
  {
    key: 'gravity',
    group: 'feel',
    name: 'Gravity',
    note: 'How hard everything is pulled down. Low floats the car, empties the tyres of grip and makes crests into jumps; high plants it and makes it feel dense.',
    low: 'the moon',
    high: 'heavy world',
    min: 3,
    max: 20,
    step: 0.05,
    show: (v) => `${(v / 9.81).toFixed(2)}× earth`,
  },
  {
    key: 'bodyLean',
    group: 'feel',
    name: 'Body lean and dive',
    note: 'How far the shell rolls in a corner and dives on the brakes. Purely how it looks — it does not change how the car drives — but it is a large part of whether the car reads as having mass.',
    low: 'rigid',
    high: 'wallows',
    min: 0,
    max: 3,
    step: 0.01,
    show: times,
  },
  {
    key: 'bodyFloat',
    group: 'feel',
    name: 'Body springs',
    note: 'How quickly the shell answers on its springs. Slow reads as a heavy car settling; fast reads as a go-kart with nothing to settle.',
    low: 'heavy and slow',
    high: 'go-kart',
    min: 0.3,
    max: 2.2,
    step: 0.01,
    show: times,
  },
]

// ---------------------------------------------------------------------------
// Whole sets, for the buttons at the top of the panel
// ---------------------------------------------------------------------------

/**
 * Four cars, as places to start from rather than as answers.
 *
 * Each is a *partial* set: it names only the dials it has an opinion about, so
 * applying one on top of your own work moves what it cares about and leaves
 * the rest of your afternoon alone.
 */
export const PRESETS: readonly { id: string; name: string; note: string; values: Partial<RallyTuning> }[] = [
  {
    id: 'forgiving',
    name: 'forgiving',
    note: 'More grip, more help, a calmer camera. Very hard to spin.',
    values: {
      grip: 2.1,
      rearBite: 13,
      autoCountersteer: 0.55,
      spinProtection: 0.55,
      driftHelper: 1,
      steerSpeed: 0.85,
      turnInBite: 1.35,
      cameraShake: 0.6,
      driftScrub: 0.12,
    },
  },
  {
    id: 'sharper',
    name: 'sharper',
    note: 'Quicker hands, more front end, less catching. Punishes being late.',
    values: {
      frontBite: 10.4,
      steerSpeed: 1.4,
      turnInBite: 2,
      autoCountersteer: 0.24,
      spinProtection: 0.8,
      tyreLag: 0.34,
      cameraLooseness: 1.2,
    },
  },
  {
    id: 'looser',
    name: 'looser',
    note: 'Less rear grip, more angle, more drift for less provocation.',
    values: {
      rearBite: 9.2,
      balance: 0.7,
      driftAngle: 0.58,
      driftSwap: 4.2,
      handbrake: 3600,
      spinProtection: 0.9,
      autoCountersteer: 0.4,
    },
  },
  {
    id: 'heavier',
    name: 'heavier',
    note: 'More mass, more lean, a looser camera. The grip is untouched.',
    values: {
      weight: 1180,
      rotationWeight: 1.25,
      topHeaviness: 0.46,
      bodyLean: 1.5,
      bodyFloat: 0.78,
      cameraLooseness: 0.62,
      steerWeight: 0.42,
    },
  },
]

/*
  One pass at import, so a draft this device saved earlier is already in force
  before the first frame — rather than arriving a tick later and visibly
  changing the car under somebody mid-corner.

  Down here rather than in the store's initialiser because `clean` consults
  `DIALS` for each dial's range, and `DIALS` is defined below the store.
*/
const stored = readDraft()
if (stored !== null) useRallyTuning.setState({ draft: stored })
settle()
