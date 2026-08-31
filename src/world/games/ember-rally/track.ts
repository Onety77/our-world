/**
 * The road, built from authored pieces.
 *
 * A daily seed picks the order; it never invents a corner. Fully procedural
 * roads are how you get a racer whose every bend is the same bend, and the
 * whole point of this one is that it belongs to a garden somebody made.
 *
 * A piece produces *bands* — short runs of constant curvature, width, ceiling
 * and grade. Those are then sampled every metre and smoothed, which is what
 * turns "one band of 1/26 next to one band of zero" into a corner you can
 * drive rather than a kink you hit.
 *
 * Everything downstream — the tunnel geometry, the physics, the camera, the
 * lanterns, the ghost — reads the same sampled arrays, so there is exactly one
 * answer to "where is the road at 812 metres" and nothing can disagree with
 * anything else about it.
 */

import { random, type StageId } from './model'

/** Metres between samples. */
export const STEP = 1

export interface Band {
  length: number
  /** 1/metres, signed. Positive curls the road to the right. */
  curv: number
  /** Half-width of driveable stone, metres. */
  width: number
  /** Height of the vault above the road, metres. */
  ceiling: number
  /** dy/ds. */
  grade: number
  /** 0..1 — how far the walls stand back beyond the verge. */
  room: number
  /** 0..1 — wet stone: sheen under the headlights, and puddles. */
  wet: number
  /**
   * 0..1 — how much this piece of road is *moving*.
   *
   * -------------------------------------------------------------------------
   * **The first thing in this game that is not standing still.** Every other
   * property here describes a shape the road holds for ever: how wide it is,
   * how wet, how far the walls stand back. This one says the road itself is
   * swinging, and it is what a suspended span over open water actually does.
   *
   * It becomes a sideways acceleration on the car — see `swayAt` and its use in
   * `physics` — travelling along the span as a wave rather than shoving the
   * whole thing at once, because a bridge does not move in one piece. The
   * practical effect is that the road is never quite where you left it, and a
   * line that worked on the way in is wrong by the middle.
   *
   * Zero everywhere except where a road says otherwise, so nothing that does
   * not ask for it pays anything.
   * -------------------------------------------------------------------------
   */
  sway: number
  /**
   * 0..1 — how exposed this piece of road is to the weather.
   *
   * -------------------------------------------------------------------------
   * **The Stormcrown is named for a storm that could not touch you.** Rain,
   * cloud, lightning and a sky that changes with the climb, all of it drawn and
   * none of it in the physics — so the one road in the game whose whole subject
   * is weather was the one road where weather was scenery.
   *
   * This is what fixes that. Nought in the cedars and down in the cuttings,
   * where the mountain is between you and it; one out on the shelves and along
   * the summit ridge, where there is nothing either side and the gale gets a
   * clean run at the car. It becomes a sideways force — see `galeAt` — whose
   * direction comes from the road's own heading against the weather's bearing,
   * so the same wind is a shove on one shoulder, a headwind on the climb, and
   * reverses on you halfway round a hairpin.
   *
   * The point of it being a road property rather than a global is that *coming
   * out of the trees* is then something you feel rather than something you are
   * told.
   * -------------------------------------------------------------------------
   */
  gale: number
  /**
   * Radians the road is tilted the *wrong* way here, over and above however it
   * was drawn. Positive raises the right-hand side, as everywhere else.
   *
   * -------------------------------------------------------------------------
   * **This is the road's roll finally meaning something.** Every corner in the
   * game already rolls into itself — see the note beside `bank` in `makeTrack`
   * — but that is a *drawing* rule, applied automatically to every corner on
   * every road so a hairpin looks worn rather than laid, and it has never been
   * in the physics. There is a comment in the Rootway's `seep` saying so: an
   * off-camber corner was wanted there and could not be had, because it would
   * have looked treacherous and driven identically.
   *
   * Making that automatic roll physical now would silently re-tune every corner
   * on two finished roads. So this is the other half: an *authored* tilt, zero
   * unless somebody wrote it down, which is added to the drawn roll for the eye
   * and is the only part of it gravity is resolved down. Where it is written
   * large enough to overcome the drawn roll, the road visibly tips toward the
   * outside of the corner and pulls the car that way — which is the most feared
   * thing on a wet mountain and the reason it is here rather than anywhere else.
   * -------------------------------------------------------------------------
   */
  camber: number
}

export interface Lantern {
  s: number
  /** Place this light on Rootwake's centreline instead of the ordinary road. */
  shortcut?: boolean
  /** Metres right of the middle, signed. */
  n: number
  y: number
  size: number
  /** 0 = cold fungus green, 1 = lantern fire. */
  warm: number
  /** One of the two real fires. Gets a flame, and lights half a chamber. */
  fire?: boolean
}

export interface Root {
  s: number
  /** -1 left wall, 0 straight down the middle of the vault, 1 right wall. */
  side: number
  /** How far down it reaches, as a fraction of the ceiling. */
  reach: number
  thickness: number
  /** Radians the root is twisted around the tunnel. */
  twist: number
  seed: number
}

export interface Boulder {
  s: number
  n: number
  size: number
  seed: number
}

export interface Puddle {
  s: number
  n: number
  radius: number
}

/**
 * A stone tooth: hanging from the vault, or standing on the verge.
 *
 * Never on the driveable road and never low enough overhead to touch, so it
 * has no physics at all. It is there because a cave without them is a swept
 * tube, and because a headlamp finding one of them a second before you pass
 * under it is most of what makes the roof feel like it is *there*.
 */
export interface Spike {
  s: number
  n: number
  hanging: boolean
  /** How far it reaches, metres. */
  length: number
  thickness: number
  seed: number
}

/**
 * Metres of loose ground either side of the stone, before the wall.
 *
 * A property of the *road*, so it lives with the road. It was in `physics.ts`
 * for a long time, which meant `geometry.ts` — which only wants to know where
 * to stop building rock — had to import the whole tyre model to find out.
 */
export function vergeWidth(room: number): number {
  return 0.85 + room * 0.95
}

export interface Track {
  seed: number
  stage: StageId
  /** Metres from the fire to the fire. */
  length: number
  /**
   * Where the car sits before the flag.
   *
   * Not zero, and that is not tidiness. The chase camera rides the road a few
   * metres *behind* the car, and `roadAt` clamps to the ends of the sampled
   * arrays — so with the car on the first sample the camera had nowhere to
   * stand and ended up inside the bodywork, looking down its own headlights.
   * Starting eighteen metres in puts the Hollow's fire just off your shoulder
   * as you launch, which is where it should have been anyway.
   */
  start: number
  /** Sampled every STEP metres. */
  x: Float32Array
  y: Float32Array
  z: Float32Array
  /** Compass heading of the road, radians. */
  heading: Float32Array
  curv: Float32Array
  width: Float32Array
  ceiling: Float32Array
  room: Float32Array
  wet: Float32Array
  /** How much the road is swinging here, 0..1. See `Band.sway`. */
  sway: Float32Array
  /** How exposed to the weather here, 0..1. See `Band.gale`. */
  gale: Float32Array
  /** Radians of authored wrong-way tilt. See `Band.camber`. */
  camber: Float32Array
  grade: Float32Array
  /** Roll of the road surface into the corner, radians. */
  bank: Float32Array
  /**
   * How loose the surface is, 0 stone to 1 sand.
   *
   * A property of the *place*, not of a band, because it is what the road is
   * made of rather than something that changes along it — the Rootway is dust
   * over rock from end to end.
   *
   * It exists because a tyre on tarmac only marks the road when it is being
   * scrubbed, and a tyre on sand marks it by *rolling*: the surface moves out
   * of the way whatever the tyre is doing. With this at zero every road was
   * being drawn as though it were paved, so on the two that are not, the car
   * left nothing behind it and never looked attached to the ground.
   */
  loose: number
  /** Where a quick driver would put the car, metres off the middle. */
  line: Float32Array
  /**
   * Where the run is timed to.
   *
   * Short of the end of the road on purpose: what is left after it is the
   * final chamber, and the car coasts through that with the engine off while
   * the result comes up over the top of it. A race that stops dead on a line
   * is an arcade game, and the fire is the point.
   */
  finishAt: number
  lanterns: Lantern[]
  /**
   * The Rootwake fork, if this road has one. The Rootway always does; the Moonbreak
   * never does — its one big idea is already the Drowned Mile, and a road with
   * two things to discover in it has neither.
   */
  split: RootSplit | null
  roots: Root[]
  boulders: Boulder[]
  spikes: Spike[]
  puddles: Puddle[]
  /** Both fires: the one you leave and the one you come back to. */
  hearths: { s: number; n: number }[]
  /**
   * The two standing stones the finish line runs between.
   *
   * There is no flag, no banner and no line painted on the rock — none of
   * those are things that exist in a cave, and the design law is that anything
   * rectangular has to become a real object or not be there. So the line is
   * two stones with fire on top of them, one either side of the road, in the
   * mouth of the last hall. You see them from a long way back because they are
   * the only pair of lights on the road that are level with each other, and
   * you go *between* them, which is what makes crossing a line an event.
   */
  gate: { s: number; n: number }[]
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

type Piece = (rng: () => number, dir: number) => Band[]

const band = (b: Partial<Band> & { length: number }): Band => ({
  curv: 0,
  width: 4.6,
  ceiling: 5.6,
  grade: 0,
  sway: 0,
  gale: 0,
  camber: 0,
  room: 0.25,
  wet: 0.1,
  ...b,
})

/**
 * A chamber. Wide, tall, and the only place on the road where two cars fit
 * side by side without one of them being in the rock — so this is where a pass
 * actually happens, and the lanterns are hung accordingly.
 */
const chamber: Piece = (rng, dir) => {
  // Shorter than it was. A room still has to be a room, but every metre of it
  // is a metre not spent on a corner, and the road is not getting any longer.
  const len = 46 + rng() * 24
  return [
    band({ length: 18, width: 5.9, ceiling: 8.4, room: 0.6, curv: dir * 0.004 }),
    band({ length: len, width: 7.6, ceiling: 12.5, room: 1, curv: dir * 0.006 }),
    band({ length: 18, width: 5.9, ceiling: 8.4, room: 0.6, curv: dir * 0.004 }),
  ]
}

/**
 * A throat: barely wider than the car, and low enough that the rock is inside
 * your peripheral vision on both sides. Nothing here is difficult. It exists
 * because speed is a comparison, and this is what the chamber before it is
 * compared against.
 */
const throat: Piece = (rng, dir) => [
  band({
    length: 34 + rng() * 22,
    width: 3.35,
    ceiling: 3.5,
    room: 0,
    curv: dir * (0.002 + rng() * 0.005),
    wet: 0.35,
  }),
]

/**
 * A long fast curve. Lift, do not brake.
 *
 * ---------------------------------------------------------------------------
 * **It used to be free, and it is the most common piece on the road.**
 *
 * The car has 1.78g and tops out at about 125 km/h down here, which puts the
 * flat-out radius at sixty-nine metres: anything opener than that can be taken
 * without lifting at all. This was dealt at 62 to 117 m — so most sweeps asked
 * for nothing, and the piece the road is mostly made of was a corridor with a
 * curve drawn on it.
 *
 * Forty-four to sixty-six puts every one of them under the line. The open end
 * is now a lift and the tight end is a real brake, and because this is the most
 * common piece, that one change is most of what makes the road ask questions.
 *
 * Narrower too, because width only matters where the speed is. Five metres of
 * half-road at a hundred and twenty is room to be sloppy in.
 * ---------------------------------------------------------------------------
 */
const sweep: Piece = (rng, dir) => {
  const radius = 44 + rng() * 22
  return [
    band({ length: 22, curv: dir / (radius * 2.4), width: 4.5, ceiling: 6.4, room: 0.35 }),
    band({ length: 52 + rng() * 38, curv: dir / radius, width: 4.3, ceiling: 6.6, room: 0.34 }),
    band({ length: 22, curv: dir / (radius * 2.2), width: 4.5, ceiling: 6.4, room: 0.35 }),
  ]
}

/**
 * The closing throat: it keeps turning after you have committed to it.
 *
 * ---------------------------------------------------------------------------
 * Opens at seventy-odd metres, which is flat out, and shuts to the middle
 * twenties, which is not. The radius falls on a curve rather than a line, so
 * most of the tightening happens late — you are already in it, already at the
 * speed the entry suggested, and the corner is still going.
 *
 * The walls come in with it, from eleven metres of road to seven and a half.
 * That is the punishment: there is nowhere to run wide to, because the place
 * you would have run to has become rock.
 *
 * This is the piece that teaches braking. Nothing else on the road makes the
 * cost of arriving too fast so immediate.
 * ---------------------------------------------------------------------------
 */
const closing: Piece = (rng, dir) => {
  const open = 68 + rng() * 14
  const shut = 24 + rng() * 5
  const bands: Band[] = [
    band({ length: 20, curv: dir / (open * 2), width: 5.4, ceiling: 6.8, room: 0.42, wet: 0.15 }),
  ]
  const steps = 5
  for (let i = 0; i < steps; i++) {
    // Squared, so it holds its radius and then shuts, rather than easing round.
    const t = (i + 1) / steps
    const radius = open + (shut - open) * t * t
    bands.push(band({
      length: 22 - t * 6,
      curv: dir / radius,
      width: 5.4 + (3.75 - 5.4) * t,
      ceiling: 6.8 - t * 1.6,
      room: 0.42 - t * 0.36,
      wet: 0.15 + t * 0.25,
    }))
  }
  bands.push(band({ length: 18, curv: dir * 0.004, width: 4.2, ceiling: 5.2, room: 0.14, wet: 0.3 }))
  return bands
}

/**
 * The spiral: too tight to be steered round, so it has to be rotated.
 *
 * ---------------------------------------------------------------------------
 * The same radius as the old hairpin and a third less road. That is the whole
 * difference, and it is the difference between a corner you brake for and a
 * corner you have to *place the car in*.
 *
 * The hairpin was deliberately given more stone than it needed, on the
 * reasoning that a corner you can only take one way is one you stop thinking
 * about. That was right when it was the hardest thing here. It is not any more,
 * and something on this road has to be the corner where the handbrake is the
 * answer — otherwise the best thing the car does is decoration.
 * ---------------------------------------------------------------------------
 */
const spiral: Piece = (rng, dir) => {
  const radius = 23 + rng() * 4
  return [
    band({ length: 22, curv: dir / (radius * 3), width: 4.6, ceiling: 6, room: 0.3, wet: 0.3 }),
    band({ length: 16, curv: dir / (radius * 1.6), width: 4.3, ceiling: 5.6, room: 0.2, wet: 0.3 }),
    band({ length: 44 + rng() * 14, curv: dir / radius, width: 4.2, ceiling: 5.4, room: 0.12, wet: 0.25 }),
    band({ length: 18, curv: dir / (radius * 1.7), width: 4.4, ceiling: 5.6, room: 0.2 }),
    band({ length: 20, curv: dir * 0.003, width: 4.7, ceiling: 6.1, room: 0.32 }),
  ]
}

/**
 * The seep: the grip is not there where you were going to use it.
 *
 * ---------------------------------------------------------------------------
 * An ordinary middling corner with water across its apex. Wet stone is
 * fourteen per cent less grip in this car — see `surfaceGrip` — which is not a
 * lot until it arrives exactly where you had planned to lean on the tyres.
 *
 * This was going to be an off-camber corner instead, until I checked: `bank`
 * does not appear anywhere in the physics. It rolls the road for the eye and
 * changes nothing about how the car behaves, so an off-camber corner would have
 * looked treacherous and driven identically. Water is real, and it is also more
 * honest about where it is: you can see it shine before you are in it.
 * ---------------------------------------------------------------------------
 */
const seep: Piece = (rng, dir) => {
  const radius = 34 + rng() * 10
  return [
    band({ length: 26, curv: dir / (radius * 2.2), width: 4.8, ceiling: 5.8, room: 0.3, wet: 0.4 }),
    band({ length: 32 + rng() * 12, curv: dir / radius, width: 4.5, ceiling: 5.3, room: 0.18, wet: 1 }),
    band({ length: 22, curv: dir / (radius * 2), width: 4.8, ceiling: 5.8, room: 0.3, wet: 0.7 }),
  ]
}

/**
 * A hairpin, and the reason the brake exists. Deliberately given more stone
 * than it needs: a corner you can only take one way is a corner you learn once
 * and then stop thinking about.
 */
const hairpin: Piece = (rng, dir) => {
  const radius = 25 + rng() * 7
  return [
    band({ length: 26, curv: dir * 0.004, width: 5.6, ceiling: 7.2, room: 0.55 }),
    band({ length: 14, curv: dir / (radius * 2), width: 5.9, ceiling: 7.4, room: 0.6 }),
    band({ length: 34 + rng() * 12, curv: dir / radius, width: 6.1, ceiling: 7.6, room: 0.65 }),
    band({ length: 16, curv: dir / (radius * 1.8), width: 5.7, ceiling: 7, room: 0.5 }),
    band({ length: 20, curv: dir * 0.003, width: 5, ceiling: 6.4, room: 0.4 }),
  ]
}

/** Left-right, quickly. Rewards not straightening the car in between. */
const chicane: Piece = (rng, dir) => {
  const radius = 38 + rng() * 14
  return [
    band({ length: 30 + rng() * 10, curv: dir / radius, width: 4.5, ceiling: 5.4, room: 0.3 }),
    band({ length: 12, curv: 0, width: 4.4, ceiling: 5.4, room: 0.3 }),
    band({ length: 30 + rng() * 10, curv: -dir / radius, width: 4.5, ceiling: 5.4, room: 0.3 }),
  ]
}

/** Downhill, and the ceiling comes down with it. Arrive somewhere too fast. */
const descent: Piece = (rng, dir) => [
  band({
    length: 60 + rng() * 40,
    curv: dir * (0.001 + rng() * 0.004),
    width: 4.3,
    ceiling: 4.2,
    room: 0.15,
    grade: -0.055 - rng() * 0.03,
    wet: 0.55,
  }),
]

/** Up, then over. The car goes light at the crest and the road drops away. */
const rise: Piece = (rng, dir) => [
  band({ length: 44 + rng() * 26, curv: dir * 0.003, width: 4.8, ceiling: 6, grade: 0.05 }),
  band({ length: 20, curv: dir * 0.004, width: 4.8, ceiling: 7.5, grade: -0.02 }),
  band({ length: 34 + rng() * 20, curv: dir * 0.002, width: 4.8, ceiling: 6, grade: -0.05 }),
]

/** Nothing at all, for a moment. Roads need these or none of them read. */
const runway: Piece = (rng, dir) => [
  band({ length: 32 + rng() * 26, curv: dir * (rng() * 0.004), width: 4.7, ceiling: 6 }),
]

interface Entry {
  name: string
  make: Piece
  weight: number
}

const LIBRARY: Entry[] = [
  { name: 'sweep', make: sweep, weight: 2.6 },
  { name: 'hairpin', make: hairpin, weight: 1.8 },
  { name: 'chicane', make: chicane, weight: 2.2 },
  { name: 'closing', make: closing, weight: 1.8 },
  { name: 'spiral', make: spiral, weight: 1.5 },
  { name: 'seep', make: seep, weight: 1.4 },
  { name: 'throat', make: throat, weight: 1.5 },
  { name: 'descent', make: descent, weight: 1.5 },
  { name: 'rise', make: rise, weight: 1 },
  { name: 'runway', make: runway, weight: 0.8 },
  { name: 'chamber', make: chamber, weight: 1.1 },
]

/**
 * The three groups the grammar reasons about.
 *
 * `hard` is where a run is lost. `fast` is what you have to be coming off for a
 * hard piece to hurt — arriving at the closing throat from a throat is a corner;
 * arriving at it off a sweep is a *problem*. `easy` is everything that asks
 * nothing, and the point of naming them is to stop three of them happening in a
 * row, which is how the old road produced its long dull stretches.
 */
const HARD = new Set(['closing', 'spiral', 'seep'])
const FAST = new Set(['sweep', 'runway', 'descent', 'chamber'])
const EASY = new Set(['runway', 'chamber', 'throat', 'rise'])

/**
 * Roughly how long the whole road should be, metres.
 *
 * Fifteen hundred was a minute, and a minute turned out to be the length at
 * which the Rootway is a *lap* rather than a road: you learn the whole of it in
 * three goes, and after that the only thing left to find is tenths. Half as
 * long again is enough that the middle of it is somewhere you arrive rather
 * than somewhere you are already leaving — which is also what makes room for
 * the Rootwake, and for its fork to be a decision you have time to make.
 */
const TARGET = 2300
/**
 * Metres of road after the finish, for rolling to a stop by the fire.
 *
 * **It was fifty-eight, and a car needs more than twice that.** The roll-in
 * comes off the flag at up to forty metres a second under a light brake, and
 * measured — `scripts/rally-check` drives it — that is between fifty and
 * seventy-five metres before it is stopped, plus whatever it carries out of
 * the last corner. Fifty-eight meant *every single run* ran out of road: the
 * car reached the end of the tunnel still travelling, had its position pinned
 * there by a clamp, and spent the last four seconds of the race parked in the
 * open end of the mesh looking out into nothing. That empty black rectangle
 * was the last thing anybody saw of the Rootway.
 */
const COAST = 110
/**
 * Metres of road at the far end that no car may reach.
 *
 * There is rock there now — the tunnel is closed with an apse rather than
 * stopping mid-air (see `capEnd` in `geometry`), and this is where that rock
 * is, so the physics and the mesh agree about it. The fire stands just in
 * front of it.
 */
export const END_WALL = 14
/**
 * How tall a gate stone stands, in metres.
 *
 * High enough that its fire is above the car's roof and stays in frame as you
 * go between them, low enough that neither of them is what the hall is about.
 * Shared with the geometry, which builds the stone this tall and then puts the
 * light on top of it.
 */
export const GATE_HEIGHT = 2.5
/** Where the car stands before the flag — see `Track.start`. */
const START = 18

/**
 * The grammar.
 *
 * Weighted choice on its own produces roads that are technically varied and
 * feel like nothing: three hairpins in a row, a chamber every other piece, or
 * eight hundred metres of the same handedness. These are the rules that were
 * actually worth having.
 */
/**
 * Which piece comes next.
 *
 * ===========================================================================
 * **A hard corner is only hard because of what you arrive off.** The old
 * grammar was a bag with four "not twice in a row" rules in front of it, and
 * that produces a road where every piece is its own small problem and none of
 * them cost you the next one. It also, twice in four seeds, produced a road
 * with nothing difficult in it at all: the tightest bend came out at 26 m on
 * one and 36 m on another, and only one of those is a corner.
 *
 * So three things are guaranteed rather than left to the shuffle:
 *
 *   **hard pieces are entered fast.** A closing throat off a throat is a
 *   corner. A closing throat off a sweep is a problem, because you are already
 *   carrying speed you now have to lose in a road that is getting narrower.
 *
 *   **a bad exit costs twice.** The spiral is followed by something that needs
 *   the car placed — a throat or a chicane — so getting the rotation wrong does
 *   not just cost the corner, it costs the one after it.
 *
 *   **every road has the hard ones in it, and late.** A closing throat and a
 *   spiral are forced in if the shuffle has not produced them by two thirds of
 *   the way down, and hard pieces weigh more heavily in the last third. A run
 *   should get harder as it goes, so a clean one is something you finish rather
 *   than something you started well.
 *
 * Nothing here is random-hard. Every one of these arrives behind the same
 * lantern grammar it always does, so the tenth run is better because you know
 * the road — see `dressTrack`.
 * ===========================================================================
 */
function choose(
  rng: () => number,
  previous: string[],
  sinceChamber: number,
  /** 0..1 of the way down the road. Hard pieces weigh more toward the end. */
  progress: number,
  /** What has been laid so far, so the road can be made to contain a test. */
  laid: Set<string>,
): Entry {
  const last = previous.at(-1)
  const easyRun = (() => {
    let run = 0
    for (let i = previous.length - 1; i >= 0 && EASY.has(previous[i]); i--) run++
    return run
  })()

  const usable = LIBRARY.filter((entry) => {
    // Two hairpins back to back is not a road, it is a mistake typed twice.
    if (entry.name === 'hairpin' && last === 'hairpin') return false
    // A chamber is an event. Two in a row spends it.
    if (entry.name === 'chamber' && (last === 'chamber' || sinceChamber < 2)) return false
    if (entry.name === 'throat' && last === 'throat') return false
    if (entry.name === 'descent' && last === 'descent') return false
    // The hard three are only hard off something quick, and never twice over:
    // back to back they stop being events and start being a slalom.
    if (HARD.has(entry.name) && (last === undefined || !FAST.has(last))) return false
    // Three easy pieces in a row is the long dull stretch this road used to
    // have in the middle of it.
    if (EASY.has(entry.name) && easyRun >= 2) return false
    return true
  })

  const pickFrom = (pool: Entry[]) => pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]

  // The room has been closed in for a while — open it.
  if (sinceChamber >= 5) return LIBRARY.find((e) => e.name === 'chamber')!

  /*
    A road that has not produced a test by two thirds of the way is made to.

    Reached by laying the fast piece it needs to be entered off first, so this
    never breaks the rule above — it takes two goes rather than one, which is
    also why it starts asking with a third of the road still to run.
  */
  const owed = ['closing', 'spiral'].filter((name) => !laid.has(name))
  if (progress > 0.62 && owed.length > 0) {
    const want = usable.filter((e) => owed.includes(e.name))
    if (want.length) return pickFrom(want)
    const runUp = usable.filter((e) => FAST.has(e.name))
    if (runUp.length) return pickFrom(runUp)
  }

  // Out of a spiral, something that has to be placed. A bad rotation should
  // still be costing you a corner later.
  if (last === 'spiral') {
    const after = usable.filter((e) => e.name === 'throat' || e.name === 'chicane')
    if (after.length) return pickFrom(after)
  }
  // You arrive out of a descent carrying far too much speed. Give it somewhere
  // to go, or the piece is just a corridor that happens to slope.
  if (last === 'descent') {
    const after = usable.filter(
      (e) => e.name === 'hairpin' || e.name === 'chicane' || HARD.has(e.name),
    )
    if (after.length) return pickFrom(after)
  }
  // Out of a chamber, close it down again immediately. The contrast is the
  // entire reason the chamber worked.
  if (last === 'chamber') {
    const after = usable.filter((e) => e.name === 'throat' || e.name === 'descent')
    if (after.length) return pickFrom(after)
  }

  // The last third leans on the hard three; the first third leaves them alone,
  // so the road opens by letting you get up to speed and then asks for it back.
  const lean = progress < 0.3 ? 0.55 : progress > 0.62 ? 1.7 : 1
  const weigh = (e: Entry) => e.weight * (HARD.has(e.name) ? lean : 1)
  const total = usable.reduce((sum, e) => sum + weigh(e), 0)
  let pick = rng() * total
  for (const entry of usable) {
    pick -= weigh(entry)
    if (pick <= 0) return entry
  }
  return usable[usable.length - 1]
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/**
 * A box blur, twice, which is near enough a gaussian and is what stops every
 * band boundary being a kink you can feel through the steering.
 *
 * The radius is in samples, and one sample is one metre. Curvature gets the
 * widest window because a step in curvature is a step in *lateral
 * acceleration*, which the car answers to instantly.
 */
function smooth(values: Float32Array, radius: number, passes = 2): Float32Array {
  let source = values
  const clampRead = (v: Float32Array, i: number) =>
    v[Math.min(v.length - 1, Math.max(0, i))]

  for (let pass = 0; pass < passes; pass++) {
    const out = new Float32Array(source.length)
    const window = radius * 2 + 1
    let sum = 0
    for (let i = -radius; i <= radius; i++) sum += clampRead(source, i)
    for (let i = 0; i < source.length; i++) {
      out[i] = sum / window
      sum += clampRead(source, i + radius + 1) - clampRead(source, i - radius)
    }
    source = out
  }
  return source
}

/**
 * The Rootwake — a complete second tunnel inside the Rootway.
 *
 * Both roads share `s` only so timing, recordings and the finish remain simple.
 * Spatially they are unrelated after the mouth: Rootwake owns its centreline,
 * stone shell, width, corners and physical road metric. Solid rock and a deep
 * vertical offset keep the ordinary road completely out of view.
 */
export interface RootSplit {
  /** Shared progress coordinates where the hidden road leaves and returns. */
  from: number
  to: number
  shortcut: { from: number; to: number }
  commitAt: number
  /** Where the shared chamber has become two fully separate stone shells. */
  separateAt: number
  rejoinAt: number
  /** A deliberate move to the right through the mouth chooses the Rootwake. */
  portalN: number
  /** Measured centreline lengths, used by checks rather than by the physics. */
  mainLength: number
  shortcutLength: number
  hardAt: number
  veryHardAt: number
  x: Float32Array
  y: Float32Array
  z: Float32Array
  heading: Float32Array
  curv: Float32Array
  width: Float32Array
  ceiling: Float32Array
  room: Float32Array
  wet: Float32Array
  grade: Float32Array
  bank: Float32Array
  line: Float32Array
  /** World metres travelled for one metre of shared progress. */
  metric: Float32Array
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function shortcutProgress(split: RootSplit, s: number): number {
  return clamp01((s - split.shortcut.from) / (split.shortcut.to - split.shortcut.from))
}

function rootwayBands(seed: number): Band[] {
  const rng = random(seed ^ 0x51f2a3)
  const bands: Band[] = []

  // Out of the fire and straight into the rock: the first fifty metres are the
  // Hollow itself, so the road you leave on is the room you were sitting in.
  bands.push(band({ length: 26, width: 7.2, ceiling: 11, room: 1, curv: 0 }))
  bands.push(band({ length: 22, width: 5, ceiling: 7, room: 0.5, curv: 0 }))
  bands.push(band({ length: 34, width: 3.6, ceiling: 3.8, room: 0, curv: 0.004, wet: 0.3 }))

  const history: string[] = []
  const laidPieces = new Set<string>()
  let sinceChamber = 3
  let dir = rng() < 0.5 ? -1 : 1
  let length = bands.reduce((sum, b) => sum + b.length, 0)

  /*
    ==========================================================================
    There is no fork any more.

    Rootwake was two hundred and fifty metres of dealt mouth and nine hundred
    metres of hidden tunnel, and it came out of the road the day the ordinary
    corners were sharpened. The tunnel is a curve drawn between two points on
    the main road, and a main road with real corners in it brings those two
    points close together in a straight line while leaving them just as far
    apart along the tarmac — so the tunnel came out a third of the length its
    features were drawn for, and every one of them folded. A three metre radius
    in the throat, measured, on every seed.

    Four separate fixes each moved the fold somewhere else rather than removing
    it, which is what a symptom does. The cause is that the whole shape assumed
    a road that no longer exists, and rebuilding it is its own piece of work
    rather than a tail on this one.

    What is left behind is a *better* road, not a poorer one: those two hundred
    and fifty metres of mouth are now dealt as ordinary pieces, so the same
    length of Rootway holds more corners than it did with the fork in it.
    ==========================================================================
  */
  while (length < TARGET - 120) {
    const entry = choose(rng, history, sinceChamber, length / TARGET, laidPieces)
    // Alternate handedness most of the time. Always alternating reads as a
    // slalom; never alternating reads as a spiral.
    if (rng() < 0.74) dir = -dir
    const made = entry.make(rng, dir)
    bands.push(...made)
    length += made.reduce((sum, b) => sum + b.length, 0)
    history.push(entry.name)
    laidPieces.add(entry.name)
    sinceChamber = entry.name === 'chamber' ? 0 : sinceChamber + 1
  }

  /*
    --- the arrival ---------------------------------------------------------

    Three bands, and they are three because the ending is a *shape* rather than
    a length of road that happens to stop.

    **The throat.** The road pinches and the vault comes down for twenty-odd
    metres, so what you are in for the last few seconds of the race is the
    tightest thing on the whole road. This is here entirely so that the next
    band lands.

    **The hall.** It opens all at once — half as wide again, thirteen metres to
    the roof — and the finish stands in the mouth of it between two lit
    stones. Coming out of a throat into a room is the whole trick; a chamber
    that the road merely widens into is a chamber nobody notices.

    **The back.** It closes down again to the wall the fire is against, so the
    hall reads as a room with an end rather than as a road that got wider. The
    rock across it is built by `capEnd` in `geometry`.
  */
  bands.push(band({ length: 24, width: 4.4, ceiling: 5.4, room: 0.2, curv: 0, wet: 0.25 }))
  bands.push(band({ length: 96, width: 7.6, ceiling: 13, room: 1, curv: 0 }))
  bands.push(band({ length: 20, width: 5.2, ceiling: 8, room: 0.45, curv: 0 }))

  return bands
}

/**
 * The Moonbreak is authored as one remembered road, not dealt from a bag.
 *
 * The Rootway changes its order because discovering what is behind the next
 * wall is part of being underground. The Moonbreak is open to the horizon:
 * its pleasure is learning that the narrow bridge follows the orchard esses,
 * that the long fall ends in one severe left, and eventually carrying one
 * unbroken drift through the two moon arches. Decorations still take the
 * shared round seed, so the garden breathes without moving the racing line.
 */
/**
 * Fixed distances used by both the racing line and the Moonbreak scenery.
 *
 * ---------------------------------------------------------------------------
 * **These are derived from the road now, not written next to it.** They used to
 * be a hand-kept table of numbers — an arch at 68 m, a braking pearl at 658,
 * the tube's mouth at 1016 — and a note warning that they must never drift
 * apart from the corners they mark.
 *
 * The note was right and the arrangement was the problem. Every one of those
 * numbers is a *consequence* of how long the bands before it are, so any change
 * to the road's shape silently invalidated all of them: an arch ends up over a
 * straight, a marker warns about nothing, the tube is glass over open air.
 * Nothing throws. It just quietly stops meaning anything, which is why the road
 * was effectively frozen — you could re-tune a corner but never lengthen one.
 *
 * So the road is laid out in named sections and reports where they landed. The
 * table cannot drift now, because it is measured off the thing it describes.
 * `npm run moonbreak` still checks it, because a derivation with a mistake in
 * it is just a confident mistake.
 * ---------------------------------------------------------------------------
 */
const MOON = layMoonbreak()

export const MOONBREAK = MOON.marks

/**
 * Where the water is, in metres. The Moonbreak's one horizontal plane.
 *
 * Everything about the Drowned Mile is measured from this: the road's own dive,
 * the mouths of the tube, how green the light goes, and how far you can see.
 * It is exported because four files need it and a plane that four files each
 * remember separately is a plane that ends up in four places.
 */
export const WATER_Y = -1.08

/**
 * How far under the water you are, 0 to 1.
 *
 * ---------------------------------------------------------------------------
 * One number, read by everything that has to change when the causeway goes
 * under: the fog and the ambient in `Race`, the sky and the surface and the
 * glass in `Moonbreak`, and the sound. Driven off the road's own height rather
 * than off a pair of distances along it, which matters more than it sounds —
 * it means the light and the water can never disagree with the geometry,
 * because they are all reading the thing that actually put the road down there.
 *
 * Full at eight metres under. That is roughly the depth at which the surface
 * stops being a thing above you and starts being a ceiling, and it lands
 * comfortably inside the dive rather than at the bottom of it, so the change
 * happens *while you are falling* — which is the point of diving at all.
 * ---------------------------------------------------------------------------
 */
/**
 * How far the Swaying Span has rolled, and how hard that pushes.
 *
 * ===========================================================================
 * **A bridge that pushes you sideways needs a reason you can see**, or the
 * force is a bug. The reason is that the deck is *tilted*: a suspended span in
 * a swell rolls about its own length, and a car on a tilted floor slides down
 * it because of gravity, which is a thing everybody already understands
 * without being told.
 *
 * That is why this returns an angle rather than a force. One number, read by
 * three things that have to agree exactly:
 *
 *   - `physics` turns it into the sideways acceleration on the car,
 *   - `placeCar` rolls the car so it lies on the deck rather than floating
 *     level above a tilted one,
 *   - and the deck's own vertices are lifted by it in the road shader.
 *
 * If any of those kept its own copy of the wave they would drift apart by a
 * few degrees and the car would sit visibly wrong on the bridge — which reads
 * as "the physics is broken" rather than as "that number is slightly off".
 *
 * **The phase carries `s` as well as time**, so the wave *travels* along the
 * span the way a real one does, instead of the whole bridge tipping at once.
 * The practical consequence is that the span cannot be learned as "lean left
 * here": how far it has rolled by the time you reach a given plank depends on
 * how fast you got there.
 *
 * **`elapsed` is the race clock, never the wall clock.** Two people racing
 * start their clocks together at the flag, so they get the same bridge at the
 * same moment. A wall-clock phase would give each of them a different one,
 * which nobody would think to check and both would feel.
 * ===========================================================================
 */
/** Radians of roll at full sway. Eleven degrees: dramatic, not cartoonish. */
export const SWAY_ROLL = 0.205
/** Radians per second of the swing. Slow enough to lean on, quick enough to matter. */
export const SWAY_RATE = 1.15
/** Radians per metre along the span, which is what makes it a wave. */
export const SWAY_WAVE = 0.028

/** Where in its swing the deck is here, −1..1, scaled by how much it moves. */
export function swayAt(sway: number, s: number, elapsed: number): number {
  if (sway <= 0.002) return 0
  return sway * Math.sin(elapsed * SWAY_RATE - s * SWAY_WAVE)
}

/**
 * The roll of the deck here, in radians, positive raising its right-hand side.
 *
 * The sign is not a taste. `basisAt` puts a point `n` to the right at
 * `road.y + sin(bank) * n`, so a positive bank lifts the right-hand side and
 * gravity takes the car to the *left*. Everything downstream depends on that.
 */
export function swayRollAt(sway: number, s: number, elapsed: number): number {
  return -SWAY_ROLL * swayAt(sway, s, elapsed)
}

/**
 * The gale, and what it does to a car that is out in it.
 *
 * ===========================================================================
 * **A storm that could not touch you was the Stormcrown's whole problem.** It
 * has the best idea of the three roads — you climb *through* the weather, from
 * under the cloud into the blind middle of it and out above it into clear black
 * sky with the storm still going on below — and until now all of that was
 * drawn and none of it was felt. The last road in the game was the one where
 * nothing happened to the car.
 *
 * **The direction comes out of the road, not out of a number.** The weather has
 * one bearing for the whole mountain; what changes is which way the road is
 * pointing across it. So the same gale is a shove on the west shoulder, a
 * headwind up the cedar climb, and *reverses on you* halfway round a hairpin —
 * and none of that had to be authored, because the road already knows where it
 * is going. It falls out of `sin(heading − bearing)`.
 *
 * **Gusty rather than periodic**, which is the whole difference between this
 * and the Moonbreak's swinging span. The span is a clean sine you can learn to
 * lean on. Three sines at frequencies that do not divide into one another give
 * a wave whose period is minutes long, so it is deterministic — same storm from
 * the same flag for both cars in a race — without ever being the same twice
 * inside one run. Raised to a power so it sits low and occasionally hits, which
 * is what makes it a gust and not a wobble.
 *
 * **Worse the faster you go**, mildly. A crosswind's grip on a car really is a
 * function of how fast the car is moving through it, and making the wind a
 * consequence of committing is exactly this road's subject. Only mildly,
 * because the honest square law would be four times as strong at racing speed
 * as at half of it, and a hazard that vanishes when you slow down is a hazard
 * that teaches you to crawl.
 * ===========================================================================
 */
/** Metres per second squared, fully exposed, gusting, straight across the road. */
export const GALE_FORCE = 3.4
/** The fraction of it that is always there, under the gusts. */
const GALE_BASE = 0.34
/** The bearing the weather comes from, in the world's own angle. */
const GALE_FROM = 2.28
const GALE_RATE = 0.62
const GALE_WAVE = 0.0075

/** How hard it is gusting here and now, 0..1, before any shelter. */
export function gustAt(s: number, elapsed: number): number {
  const p = elapsed * GALE_RATE - s * GALE_WAVE
  const raw =
    0.5 +
    0.5 * (0.55 * Math.sin(p) + 0.3 * Math.sin(p * 2.31 + 1.7) + 0.15 * Math.sin(p * 5.13 + 4.1))
  // Sits low and occasionally hits. A gust, rather than a wobble.
  return raw * raw * Math.sqrt(Math.max(0, raw))
}

/**
 * How hard it is blowing where the car is, 0..1 — shelter and gust together.
 *
 * Split out from the force because the *drawing* needs it and must not work it
 * out again: the rain slants by this, and rain that slants a moment before or
 * after the car is shoved is worse than rain that falls straight down. One
 * number, two readers, no chance of disagreeing.
 */
export function galeStrengthAt(road: RoadAt, s: number, elapsed: number): number {
  if (road.gale <= 0.002) return 0
  return road.gale * (GALE_BASE + (1 - GALE_BASE) * gustAt(s, elapsed))
}

/**
 * The way the weather is going, as a horizontal unit vector in the world.
 *
 * The wind has one bearing for the whole mountain — it is the *road* that keeps
 * turning across it. Exported because the rain has to fall along it and the
 * rain is drawn somewhere else.
 */
export const GALE_TOWARD = { x: Math.sin(GALE_FROM), z: Math.cos(GALE_FROM) }

/**
 * What the weather is doing to the car sideways, in metres per second squared,
 * positive toward the road's right.
 *
 * Zero wherever the mountain is between you and it, which is most of the way up.
 */
export function galeAt(road: RoadAt, s: number, elapsed: number, speed: number): number {
  const strength = galeStrengthAt(road, s, elapsed)
  if (strength === 0) return 0
  const across = Math.sin(road.heading - GALE_FROM)
  const bite = 0.55 + 0.45 * Math.min(1, speed / 28)
  return GALE_FORCE * strength * across * bite
}

export function sunkAt(track: Track, s: number): number {
  if (track.stage !== 'moonbreak') return 0
  const i = Math.max(0, Math.min(track.y.length - 1, Math.round(s / STEP)))
  return Math.max(0, Math.min(1, (WATER_Y - track.y[i]) / 8))
}

/**
 * The Moonbreak, laid out section by section.
 *
 * ===========================================================================
 * **The road after the Rootway, and it has to be harder than it.** The Rootway
 * is fifteen corners in two and a quarter kilometres, all of them needing a
 * brake, at its tightest twenty-four metres of radius on eight and a half
 * metres of road. Anything that calls itself the next one along has to ask for
 * more than that, and asking for it *in the same way* would only be the Rootway
 * again with the lights on.
 *
 * So the difficulty here is made of things a cave cannot do:
 *
 *   **open water.** Nothing to lean on. Where the Rootway closes the rock in
 *   until there is one line through, this narrows to seven metres with the
 *   verge almost gone and nothing either side but the drop.
 *
 *   **a road that moves.** The Swaying Span is the first piece of road in the
 *   game that is not standing still — see `Band.sway`. A wave travels along it,
 *   so the line that worked on the way in is wrong by the middle, and how far
 *   it has moved when you reach a given plank depends on how fast you got
 *   there. It cannot be learned as a shape, only as a thing to read.
 *
 *   **height.** The Rootway is a cave floor and never climbs more than a few
 *   metres. This goes thirty-four metres up the Sky Stair to a crest that
 *   turns while you cannot see over it, and then throws all of it away again
 *   down the Fall — which puts you at the hardest corner on either road,
 *   downhill, still braking.
 *
 *   **and the water over your head**, which it already had, and which is the
 *   one thing here that is not about being hard. The Drowned Mile keeps its
 *   shape exactly: a place should have one big idea and this road's is that
 *   halfway through it goes under.
 * ===========================================================================
 */
function layMoonbreak() {
  const bands: Band[] = []
  /** Where the road has got to, so every landmark can be measured rather than guessed. */
  let at = 0
  const open = (shape: Partial<Band> & { length: number }) => {
    bands.push(band({ width: 5.9, ceiling: 18, room: 0.82, wet: 0.38, ...shape }))
    at += shape.length
    return at
  }
  /** Where we are now, for naming a boundary without laying anything. */
  const here = () => at

  // --- the moonwell terrace -----------------------------------------------
  // Enough road to see sky, water and the first gate before anything is asked.
  open({ length: 62, width: 7.2, ceiling: 24, room: 1, curv: 0 })
  const firstArch = here()
  open({ length: 34, width: 6.4, ceiling: 21, room: 0.9, curv: -0.002 })

  /*
    Windward. It used to be flat once learned, which on a road whose whole idea
    is speed made the first minute something you waited through. The car is
    flat out past a sixty-nine metre radius; this was ninety-five.
  */
  open({ length: 30, curv: -0.005, width: 5.6 })
  open({ length: 86, curv: -0.0178, width: 5.2, room: 0.55 })
  open({ length: 30, curv: -0.006, width: 5.4 })
  open({ length: 30, curv: 0.005, width: 5.3, wet: 0.28 })
  open({ length: 48, curv: 0.0162, width: 5.1, room: 0.5, wet: 0.34 })

  // --- the drowned orchard -------------------------------------------------
  // A deliberate left-right rhythm between trunks, on wet stone.
  const orchardFrom = here()
  open({ length: 44, curv: 0.028, width: 4.9, room: 0.44, wet: 0.62 })
  open({ length: 16, curv: 0.004, width: 4.6, room: 0.36, wet: 0.74 })
  open({ length: 44, curv: -0.029, width: 4.9, room: 0.44, wet: 0.62 })
  const orchardTo = here()

  // Up through the first broken arch, then light over the crest — and it turns
  // while you are over it.
  open({ length: 56, curv: -0.0128, grade: 0.052, width: 5.2, room: 0.55 })
  const crestArch = here()
  open({ length: 30, curv: 0.0135, grade: 0, width: 4.8, room: 0.36 })
  open({ length: 56, curv: 0.0172, grade: -0.052, width: 5.0, room: 0.46 })

  /*
    ========================================================================
    THE SWAYING SPAN
    ========================================================================

    A quarter of a kilometre of suspended deck, seven metres wide, with almost
    no verge and a wave running along it.

    **This is the road's second idea and it is deliberately the opposite kind
    of thing from its first.** The Drowned Mile is a place — you go somewhere,
    and what changes is where you are rather than what you are doing. The span
    changes what you are doing and nothing else: same water, same sky, same
    speed, and a deck that will not hold still under the car.

    Three bends in it, gentle ones. They matter because a straight span can be
    driven by aiming once and holding it; with bends you have to keep choosing,
    and every choice is made on a road that has moved since you looked.

    The sway ramps in and out rather than switching on, so you drive onto
    something already moving instead of being hit by it at a seam — see the
    smoothing on `Track.sway`.
    ========================================================================
  */
  const spanFrom = here()
  open({ length: 40, curv: 0, width: 5.0, room: 0.2, wet: 0.7, ceiling: 28, sway: 0.25 })
  open({ length: 46, curv: -0.0085, width: 3.7, room: 0.05, wet: 0.82, ceiling: 28, sway: 0.7 })
  open({ length: 52, curv: 0.004, width: 3.6, room: 0.04, wet: 0.86, ceiling: 28, sway: 1 })
  const spanMiddle = here()
  open({ length: 52, curv: 0.0105, width: 3.6, room: 0.04, wet: 0.86, ceiling: 28, sway: 1 })
  open({ length: 46, curv: -0.005, width: 3.7, room: 0.05, wet: 0.82, ceiling: 28, sway: 0.7 })
  open({ length: 40, curv: 0, width: 5.0, room: 0.2, wet: 0.7, ceiling: 28, sway: 0.25 })
  const spanTo = here()

  /*
    Tidecut — the first hard corner, and it is now arrived at going downhill.

    Fourteen and a half metres of road at a thirty-three metre radius used to be
    a corner you could be wrong about twice and still make. Twelve at twenty-
    eight, off a descent, off the span, is one you have to mean.
  */
  const hardApproach = here()
  open({ length: 46, curv: 0, width: 5.4, grade: -0.038, wet: 0.3 })
  open({ length: 30, curv: 0.006, width: 5.5, grade: -0.045 })
  open({ length: 20, curv: 0.016, width: 5.7, room: 0.66, grade: -0.03 })
  const hardApex = here()
  open({ length: 50, curv: 0.037, width: 5.9, room: 0.62, wet: 0.5 })
  open({ length: 20, curv: 0.018, width: 5.8, room: 0.68, grade: 0.03 })
  open({ length: 18, curv: 0.005, width: 5.6, grade: 0.04 })
  open({ length: 62, curv: 0, width: 5.5, grade: 0.043, wet: 0.24 })
  const hardExit = here()

  /*
    ======================================================================
    THE DROWNED MILE — kept exactly as it was.

    A kilometre of causeway that goes *under* the water instead of over it,
    and the one place on either road where the sky is not the ceiling. Its
    shape is not touched by any of this hardening: a set piece that also asks
    you to learn six new corners is two things at once, and the driver ends up
    looking at the road instead of at the water.

    The two sweeps down there are the exception, and only because they were
    free — a hundred and sixty-seven metres of radius at the fastest the road
    ever goes, which is not a corner, it is a direction. They are the price of
    the speed the deep straight hands you.
    ======================================================================
  */
  open({ length: 90, curv: 0, width: 6.2, room: 0.6, wet: 0.62, ceiling: 30 })
  open({ length: 55, curv: 0, width: 5.9, room: 0.5, grade: -0.05, wet: 0.7 })
  const goesUnder = here()
  open({ length: 130, curv: 0, width: 5.6, room: 0.42, grade: -0.105, wet: 0.24 })
  open({ length: 55, curv: -0.002, width: 5.6, room: 0.46, grade: -0.04, wet: 0.18 })
  const mirrorFrom = here()
  open({ length: 130, curv: 0, width: 5.5, room: 0.48, wet: 0.16, ceiling: 30 })
  open({ length: 88, curv: -0.0145, width: 5.3, room: 0.48, wet: 0.16 })
  open({ length: 88, curv: 0.0152, width: 5.3, room: 0.48, wet: 0.16 })
  const mirrorTo = here()
  open({ length: 84, curv: 0, width: 5.35, room: 0.42, wet: 0.16, ceiling: 30 })
  open({ length: 62, curv: -0.0195, width: 5.1, room: 0.5, wet: 0.2 })
  open({ length: 46, curv: 0.0235, width: 5.1, room: 0.5, wet: 0.2 })
  open({ length: 56, curv: -0.005, width: 5.5, room: 0.56, grade: 0.045, wet: 0.2 })
  open({ length: 130, curv: 0, width: 5.6, room: 0.5, grade: 0.105, wet: 0.3 })
  const comesUp = here()
  open({ length: 40, curv: 0, width: 5.9, room: 0.6, grade: 0.061, wet: 0.5 })
  const deepTo = here()

  // --- reedwater -----------------------------------------------------------
  /*
    A hundred and ten metres of nothing, two medium bends, ninety more of
    nothing. It is the composure test between the two braking tests and it was
    mostly waiting. Four things now, on the wettest stone on the road.
  */
  const reedsFrom = here()
  open({ length: 62, curv: 0, width: 5.0, room: 0.38, wet: 0.9 })
  open({ length: 48, curv: -0.0175, width: 4.7, room: 0.3, wet: 0.92 })
  open({ length: 54, curv: 0.0205, width: 5.0, room: 0.44, wet: 0.8 })
  open({ length: 24, curv: 0.003, width: 4.7, room: 0.32, wet: 0.88 })
  open({ length: 54, curv: -0.0215, width: 5.0, room: 0.44, wet: 0.82 })
  open({ length: 44, curv: 0.0145, width: 4.8, room: 0.34, wet: 0.9 })
  open({ length: 46, curv: 0, width: 5.1, room: 0.4, wet: 0.84 })
  const reedsTo = here()

  /*
    ========================================================================
    THE SKY STAIR — thirty-four metres up, and it turns at the top.
    ========================================================================

    The Rootway is a cave floor and never climbs more than a few metres. This
    is the road's answer to that: four hundred metres of genuine climb at nine
    per cent, narrowing as it goes, so the car is working against gravity
    exactly while there is least road to do it on.

    **The crest is the point.** It turns, and it turns while the nose is light
    and you cannot see over it — the one moment on this road where you commit
    to something you have not been shown. Everything before it is the climb
    that makes the crest cost something.
  */
  const stairFrom = here()
  open({ length: 96, curv: 0.0138, grade: 0.095, width: 5.1, room: 0.5, wet: 0.3 })
  open({ length: 104, curv: -0.0092, grade: 0.095, width: 4.9, room: 0.44 })
  open({ length: 92, curv: 0.0125, grade: 0.092, width: 4.7, room: 0.36 })
  // Over the top, light, and turning. The mark goes in the *middle* of it,
  // not on the seam: the seam is where the climb stops and the turn has not
  // started, which is the one place on the crest that is straight.
  open({ length: 29, curv: -0.0215, grade: 0.012, width: 4.4, room: 0.24 })
  const crest = here()
  open({ length: 29, curv: -0.0215, grade: 0.012, width: 4.4, room: 0.24 })
  open({ length: 54, curv: -0.0155, grade: -0.05, width: 4.6, room: 0.3, wet: 0.34 })
  const stairTo = here()

  /*
    ========================================================================
    THE FALL — and it does not level out before the Moonhook.
    ========================================================================

    Everything the Stair climbed, given back at nine and a half per cent, into
    the hardest corner on either road. Arriving somewhere tight while still
    going downhill is the single hardest thing in driving: the brakes have the
    car's weight *and* the hill to fight, the back is light the whole way, and
    the corner does not care.

    The two hundred metres of approach are kept — the long look at what is
    coming is the whole of the Moonhook's drama — but they are no longer flat.
  */
  const veryHardApproach = here()
  open({ length: 104, curv: -0.004, grade: -0.105, width: 5.0, room: 0.4, wet: 0.36 })
  open({ length: 96, curv: 0.006, grade: -0.105, width: 4.9, room: 0.36, wet: 0.4 })
  open({ length: 62, curv: 0, grade: -0.095, width: 5.2, room: 0.48, wet: 0.3, ceiling: 30 })
  open({ length: 40, curv: 0.006, width: 5.5, room: 0.6, grade: -0.062 })
  open({ length: 22, curv: 0.016, width: 5.9, room: 0.7 })
  /*
    The Moonhook. Still the biggest corner in the game and still clearly
    marked. What has gone is sixteen metres of road at a twenty-six metre
    radius, which was enough to take it two different wrong ways and get away
    with both.
  */
  const veryHardApex = here()
  open({ length: 58, curv: 0.0445, width: 6.2, room: 0.72, wet: 0.44 })
  open({ length: 22, curv: 0.019, width: 6.1, room: 0.8, grade: 0.02 })
  open({ length: 40, curv: 0.006, width: 5.8, room: 0.8, grade: 0.02 })
  open({ length: 62, curv: 0, width: 5.6, room: 0.68, grade: 0.02 })
  const veryHardExit = here()

  /*
    Homeward. It was an easy left-right release after the hairpin; it is now a
    real sequence, still climbing gently back to the height the road started
    at, so the two fires stand on the same water.
  */
  open({ length: 44, curv: 0, width: 5.4, grade: 0.012, wet: 0.24 })
  open({ length: 44, curv: 0.0165, width: 5.1, room: 0.46, grade: 0.01, wet: 0.3 })
  open({ length: 56, curv: -0.0205, width: 5.2, room: 0.5, grade: 0.008 })
  open({ length: 18, curv: 0.004, width: 4.9, room: 0.36 })
  open({ length: 54, curv: 0.0215, width: 5.2, room: 0.5 })
  open({ length: 30, curv: 0.005, width: 5.4 })
  const lastArch = here()
  // And a broad moonwell terrace, so the finish breathes instead of arriving
  // immediately after the hardest thing on the road.
  open({ length: 112, curv: 0, width: 7.8, room: 1, ceiling: 30, wet: 0.5 })
  open({ length: 26, curv: 0, width: 6.2, room: 0.75, ceiling: 22 })

  return {
    bands,
    marks: {
      /*
        Nine arches, each on something worth marking rather than at a number
        somebody typed: the gate you leave by, the orchard, the crest, the two
        braking corners, both mouths of the tube, the stair, and the way home.
      */
      arches: [
        firstArch, orchardFrom, crestArch, spanMiddle, hardExit,
        mirrorTo, reedsTo, veryHardExit, lastArch,
      ],
      orchard: { from: orchardFrom, to: orchardTo },
      span: { from: spanFrom, to: spanTo },
      hard: { approach: hardApproach, apex: hardApex, exit: hardExit },
      deep: {
        from: hardExit,
        to: deepTo,
        under: { in: goesUnder, out: comesUp },
        floor: { from: mirrorFrom, to: mirrorTo, y: -18.6 },
      },
      mirror: { from: mirrorFrom, to: mirrorTo },
      reeds: { from: reedsFrom, to: reedsTo },
      stair: { from: stairFrom, to: stairTo },
      crest,
      veryHard: { approach: veryHardApproach, apex: veryHardApex, exit: veryHardExit },
    },
  }
}

function moonbreakBands(): Band[] {
  return MOON.bands
}

/**
 * Fixed geography for the Stormcrown.
 *
 * These distances are shared by the road, its scenery, its weather and the
 * verification script. A warning beacon cannot drift away from the corner it
 * is warning about just because somebody lengthened the cedar road later.
 */
/**
 * Where the cloud is on the Stormcrown, in metres above the start.
 *
 * ---------------------------------------------------------------------------
 * **This road's whole identity is that the weather answers to the climb.**
 *
 * The Rootway is underground: a cave, lantern-lit, closed. The Moonbreak is
 * over water: flat, moonlit, open. The third road had the makings of neither —
 * it had a rain field, a cloud plane, cedars and a sky, all of them the *same
 * at every height*, so four and a half kilometres of climbing from sea level to
 * ninety metres looked identical at the bottom and the top and read as the
 * Moonbreak in grey paint. The one thing this road has that the other two
 * cannot have was going unspent.
 *
 * So it is spent. Three bands, and you drive up through all of them:
 *
 *   under it   rain hammering, dark, cedars close on both sides, and the
 *              headlights doing most of the work
 *   in it      the cloud itself. Visibility collapses to about thirty metres,
 *              everything goes pale and blind, cedars loom out of the white
 *              and are gone, and the lightning is a whiteout rather than a
 *              fork. This is the frightening part, and it is where the road
 *              puts its three hairpins
 *   above it   you come out. A clear black sky, stars, no rain at all — and a
 *              floor of cloud below you with the storm still going on inside
 *              it, lighting it from underneath
 *
 * The third one is the reward, and it only works because the second one was
 * unpleasant. Nothing here is authored per-metre: it all falls out of `y`,
 * which the road already had.
 * ---------------------------------------------------------------------------
 */
/*
  Raised with the mountain.

  These were twenty-six and sixty-six, for a road that climbed to ninety, and
  everything about the three weathers is a fraction of the band between them —
  so when the summit went to a hundred and fifty they had to go with it or the
  road would have spent its first kilometre under the cloud and the whole of the
  rest above it.

  Both ends are set by a moment rather than by a height.

  The bottom is the Cloud Shelf: going into the cloud has to be its own event,
  a hundred metres *after* coming out of the trees at Gale Bend, or the two
  things that make the middle of this road frightening both happen at once and
  neither lands. At fifty-two you met the cloud base and the gale in the same
  fifteen metres.

  The top is Thunder Stair II. That corner is the hardest thing on the road —
  tight, off-camber, on the wettest stone there is — and doing it blind is the
  whole of its argument, so the break-out has to come after it and before the
  crown corner, which then gets done in clear air with the storm underneath.
*/
export const CLOUD_BASE = 66
export const CLOUD_TOP = 124

/**
 * How high the road is through the weather: 0 under the cloud, 1 inside it at
 * its thickest, and how far above it you have climbed.
 *
 * Two numbers rather than one because they are not opposites — the moment that
 * matters is the *break-out*, where "in the cloud" is falling and "above it" is
 * rising at once, and a single value could not say that.
 */
export function stormAt(track: Track, s: number): { inCloud: number; above: number } {
  if (track.stage !== 'stormcrown') return { inCloud: 0, above: 0 }
  const i = Math.max(0, Math.min(track.y.length - 1, Math.round(s / STEP)))
  const y = track.y[i]
  const band = CLOUD_TOP - CLOUD_BASE
  // Rises through the lower half of the band and falls through the upper half,
  // so the thickest, blindest part is the middle of the climb.
  const into = Math.max(0, Math.min(1, (y - CLOUD_BASE) / (band * 0.45)))
  /*
    Thin out over the top *sixth* of the band rather than the top third.

    Cloud has a soft bottom and a hard top — you drift into it and you come out
    of it — and the shape matters here for a specific reason: at a third, the
    road was already half out of the cloud by the off-camber hairpin, which is
    the one corner on the mountain that is supposed to be done blind.
  */
  const outOf = Math.max(0, Math.min(1, (y - (CLOUD_TOP - band * 0.15)) / (band * 0.15)))
  return {
    inCloud: Math.max(0, into - outOf),
    above: Math.max(0, Math.min(1, (y - CLOUD_TOP) / 15)),
  }
}

/**
 * Fixed geography for the Stormcrown, measured off the road as it is laid.
 *
 * ---------------------------------------------------------------------------
 * These distances are shared by the road, its scenery, its weather and its
 * check script — a warning beacon must not drift away from the corner it is
 * warning about because somebody lengthened the cedar road later.
 *
 * They used to be a hand-kept table sitting next to the bands, which had that
 * exact failure built into it: every number in it is a *consequence* of how
 * long the bands before it are, so changing a corner's shape was safe and
 * changing its length silently invalidated everything downstream. Nothing
 * threw. A lightning rod just stopped standing anywhere in particular. The
 * road was effectively frozen — which is the whole reason it stayed the
 * easiest of the three while the other two were hardened.
 *
 * `layStormcrown` lays it in named sections and reports where they landed.
 * `npm run storm` still checks the result, because a derivation with a mistake
 * in it is only a confident mistake.
 * ---------------------------------------------------------------------------
 */
const STORM = layStormcrown()

export const STORMCROWN = STORM.marks

/**
 * The Stormcrown, laid out section by section.
 *
 * ===========================================================================
 * **The last road, and it was the easiest one.** Measured against the other
 * two before any of this: nineteen corners in four and a half kilometres with
 * only seven of them needing a brake, never narrower than nine metres, hairpins
 * twelve and a half metres wide, and fifty-six per cent of it within a whisker
 * of straight. The Rootway asks for a brake fifteen times in half the distance.
 * The road you finish the game on was a scenic drive.
 *
 * It also had the best idea of the three and was spending none of it. You climb
 * *through* the weather here — under the cloud in hammering rain with the
 * cedars close, into the middle of it where you cannot see thirty metres, and
 * out above it into clear black sky with the storm still going on below you —
 * and all of that was drawn while nothing whatever happened to the car.
 *
 * So the mountain is now a mountain: a hundred and fifty metres of it, climbed
 * and paid back, with the cloud band raised to match so the three weathers land
 * on the three parts of the road that deserve them. And three things it has
 * that neither of the others can:
 *
 *   **The gale is real.** `Band.gale` is how exposed each piece of road is —
 *   nothing in the cedars, everything on the shelves — and the direction of it
 *   comes from the road's own heading against the weather's bearing, so it
 *   shoves you on one shoulder and reverses on you halfway round a hairpin.
 *   Gusty rather than periodic, which is what separates it from the Moonbreak's
 *   swinging span: that is a sine you learn to lean on, this is not.
 *
 *   **Corners that lean the wrong way.** `Band.camber` — the first time the
 *   road's roll has ever been in the physics. Four of them: the scoured
 *   shoulder at Gale Bend that teaches the idea, the second hairpin of the
 *   Thunder Stair that punishes it, and the two fords on the descent, where the
 *   reason is a waterfall you can see from four hundred metres away.
 *
 *   **Height, properly.** Not the Moonbreak's one hill. Two and a quarter
 *   kilometres of climbing, a summit ridge, and twelve hundred metres of
 *   descent at a tenth, which is where a hundred and fifty metres has to go.
 * ===========================================================================
 */
function layStormcrown() {
  const bands: Band[] = []
  let at = 0
  const high = (shape: Partial<Band> & { length: number }) => {
    bands.push(band({ width: 4.2, ceiling: 34, room: 0.5, wet: 0.72, ...shape }))
    at += shape.length
    return at
  }
  const here = () => at

  // --- the Stormfire terrace, and the Rainwood ------------------------------
  /*
    Sheltered, fast, and wet, with the cedars close on both sides. It matters
    that nothing out here is exposed: the gale is nought for the first half
    kilometre, so that coming out of the trees above Gale Bend is something the
    car does rather than something the sky is told to do.
  */
  const rainwoodFrom = here()
  high({ length: 70, width: 6.4, room: 1, wet: 0.5, curv: 0 })
  high({ length: 40, width: 5.0, curv: -0.006 })
  high({ length: 62, width: 4.3, curv: -0.019, wet: 0.62 })
  high({ length: 26, width: 4.1, curv: -0.004 })
  high({ length: 54, width: 4.2, curv: 0.026, wet: 0.8, room: 0.42 })
  high({ length: 20, width: 4.0, curv: 0.005 })
  high({ length: 58, width: 4.2, curv: -0.028, wet: 0.84, room: 0.42 })
  high({ length: 30, width: 4.2, curv: -0.006 })
  high({ length: 48, width: 4.3, curv: 0.021, wet: 0.7 })
  high({ length: 34, width: 4.1, curv: 0.004 })
  high({ length: 62, width: 4.4, curv: -0.0165, grade: 0.02 })
  high({ length: 56, width: 4.2, curv: -0.004, grade: 0.045 })
  const rainwoodTo = here()

  // --- the cedar climb ------------------------------------------------------
  /*
    Eight hundred metres and forty-six of height, which is the difference
    between a road that goes uphill and a climb. There is no straight in it
    longer than eighty metres — it used to be eight nearly-straight bands with a
    steady grade, which made the summit feel earned and the driving feel like
    waiting.

    The gale comes up through it as the cedars thin, which is the whole of the
    warning you get.
  */
  const climbFrom = here()
  high({ length: 78, grade: 0.075, curv: 0.0135, width: 4.2 })
  high({ length: 44, grade: 0.08, curv: -0.0235, width: 4.1, wet: 0.8, room: 0.4 })
  high({ length: 66, grade: 0.082, curv: 0.0165, width: 4.2 })
  high({ length: 30, grade: 0.07, curv: 0.004, width: 4.0, wet: 0.86 })
  high({ length: 58, grade: 0.085, curv: -0.0275, width: 4.1, room: 0.4, gale: 0.08 })
  high({ length: 40, grade: 0.08, curv: -0.008, width: 4.2, gale: 0.12 })
  high({ length: 72, grade: 0.088, curv: 0.0195, width: 4.2, wet: 0.78, gale: 0.16 })
  high({ length: 34, grade: 0.075, curv: 0.005, width: 4.0, wet: 0.88, gale: 0.2 })
  high({ length: 62, grade: 0.086, curv: -0.0245, width: 4.1, room: 0.4, gale: 0.26 })
  high({ length: 46, grade: 0.078, curv: 0.0125, width: 4.3, gale: 0.32 })
  high({ length: 76, grade: 0.09, curv: -0.0105, width: 4.2, gale: 0.4 })
  const climbTo = here()

  /*
    ========================================================================
    GALE BEND — where the road teaches you that the wind is real.
    ========================================================================

    The trees stop. A hundred and forty metres of open shoulder with nothing on
    the windward side, the gale at full strength for the first time, and then a
    corner in the middle of it — so the first thing the weather ever does to the
    car, it does while the car is busy.

    And the shoulder is scoured: the first of the three corners on this road
    that lean the wrong way, mildly, because it is the one that has to *teach*
    the idea rather than punish it. Twenty-seven metres of radius on nine metres
    of road, where it used to be thirty-one on twelve and a half.
  */
  const galeApproach = here()
  high({ length: 84, grade: 0.045, curv: 0.004, width: 4.4, wet: 0.56, gale: 0.85 })
  high({ length: 56, grade: 0.03, curv: -0.009, width: 4.5, gale: 1 })
  high({ length: 22, grade: 0.02, curv: -0.019, width: 4.6, room: 0.7, gale: 1 })
  const galeApex = here()
  high({ length: 60, grade: 0.012, curv: -0.037, width: 4.5, room: 0.66, wet: 0.7, gale: 1, camber: -0.2 })
  high({ length: 24, grade: 0.02, curv: -0.017, width: 4.5, room: 0.66, gale: 1 })
  high({ length: 54, grade: 0.04, curv: -0.004, width: 4.4, gale: 0.9 })
  const galeExit = here()

  /*
    ========================================================================
    THE CLOUD SHELF — the narrowest road in the game, in a crosswind, blind.
    ========================================================================

    Six metres and a half of ledge cut along the mountain's windward face, with
    the cloud base arriving on it. Everything that made the Rootway's tunnel
    throat frightening is here except the walls: there is nothing either side,
    the wind has a clean run at the car, and you cannot see the end of it.

    The two fast opposing sweeps are kept because they were the right shape —
    but they were a hundred and twenty-five metres of radius on eleven and a
    half metres of road, which is a direction rather than a corner. At fifty on
    seven they are the reason the ribbon is difficult rather than merely thin.
  */
  const shelfFrom = here()
  high({ length: 70, grade: 0.062, curv: 0.008, width: 3.9, room: 0.28, wet: 0.62, gale: 0.9 })
  high({ length: 88, grade: 0.058, curv: 0.0205, width: 3.7, room: 0.22, wet: 0.66, gale: 0.95 })
  high({ length: 44, grade: 0.05, curv: 0.004, width: 3.4, room: 0.16, wet: 0.72, gale: 1 })
  high({ length: 92, grade: 0.055, curv: -0.0195, width: 3.6, room: 0.2, wet: 0.7, gale: 1 })
  high({ length: 54, grade: 0.048, curv: -0.005, width: 3.2, room: 0.14, wet: 0.76, gale: 1 })
  high({ length: 86, grade: 0.06, curv: 0.0245, width: 3.5, room: 0.18, wet: 0.74, gale: 0.95 })
  high({ length: 60, grade: 0.052, curv: 0.006, width: 3.3, room: 0.15, wet: 0.78, gale: 1 })
  high({ length: 82, grade: 0.058, curv: -0.0225, width: 3.6, room: 0.2, wet: 0.72, gale: 1 })
  high({ length: 66, grade: 0.05, curv: -0.006, width: 3.9, room: 0.3, wet: 0.68, gale: 0.85 })
  const shelfTo = here()

  /*
    ========================================================================
    THE THUNDER STAIR — three hairpins, and each one asks a different thing.
    ========================================================================

    They were three of the same corner: a wide slow hairpin, then a landing,
    then the same again the other way. Twelve and a half metres of road at
    twenty-three metres of radius is a corner you can take two different wrong
    ways and get away with both, and taking it three times is not an escalation.

    So they are the same *shape* and three different problems, which is what a
    stair should be:

      **I** the one you can learn. Tight and narrow — nineteen metres of
        radius on eight and a half — and nothing else wrong with it.

      **II** the same corner leaning the wrong way. Off-camber all the way
        round, on the wettest stone on the mountain, in the blind middle of the
        cloud. This is the corner that is impossible if you do not slow down,
        and it is deliberately the second of three so that the first one has
        already taught you what the speed *should* be.

      **III** the crown corner, and it keeps closing. A decreasing radius
        through nearly a half-turn, which means the corner takes back whatever
        you left yourself, and then full gale on the exit at the exact moment
        the road opens and you want the throttle.

    You come out of the cloud on the second landing, so the third one is done in
    clear air with the storm underneath — which is the reward arriving one
    corner before it is earned, and is much better than the other way round.
  */
  const stairApproach = here()
  high({ length: 96, grade: 0.055, curv: 0, width: 4.0, wet: 0.5, gale: 0.6 })

  // Thunder Stair I
  high({ length: 30, grade: 0.03, curv: 0.008, width: 4.2, gale: 0.5 })
  high({ length: 18, grade: 0.018, curv: 0.022, width: 4.4, room: 0.66, gale: 0.45 })
  const stairFirst = here()
  high({ length: 54, grade: 0.012, curv: 0.0526, width: 4.4, room: 0.7, wet: 0.68, gale: 0.4 })
  high({ length: 18, grade: 0.028, curv: 0.02, width: 4.3, room: 0.66, gale: 0.55 })
  high({ length: 44, grade: 0.06, curv: 0.005, width: 4.0, gale: 0.8 })
  high({ length: 84, grade: 0.058, curv: -0.0135, width: 4.0, wet: 0.78, gale: 0.7 })

  // Thunder Stair II — the off-camber one
  high({ length: 30, grade: 0.032, curv: -0.009, width: 4.1, gale: 0.5 })
  high({ length: 18, grade: 0.018, curv: -0.024, width: 4.3, room: 0.66, gale: 0.45 })
  const stairSecond = here()
  high({ length: 56, grade: 0.01, curv: -0.05, width: 4.35, room: 0.7, wet: 0.9, gale: 0.4, camber: -0.26 })
  high({ length: 20, grade: 0.03, curv: -0.019, width: 4.3, room: 0.66, wet: 0.82, gale: 0.55 })
  high({ length: 48, grade: 0.058, curv: -0.005, width: 4.0, gale: 0.8 })
  high({ length: 80, grade: 0.056, curv: 0.0145, width: 4.0, wet: 0.72, gale: 0.75 })

  // Thunder Stair III — the crown corner, and it keeps closing
  high({ length: 32, grade: 0.03, curv: 0.008, width: 4.2, gale: 0.5 })
  high({ length: 20, grade: 0.016, curv: 0.021, width: 4.4, room: 0.66, gale: 0.45 })
  const stairThird = here()
  high({ length: 34, grade: 0.012, curv: 0.038, width: 4.4, room: 0.7, wet: 0.7, gale: 0.4 })
  high({ length: 34, grade: 0.008, curv: 0.058, width: 4.3, room: 0.66, wet: 0.74, gale: 0.4 })
  high({ length: 22, grade: 0.024, curv: 0.022, width: 4.3, room: 0.66, gale: 0.7 })
  high({ length: 52, grade: 0.05, curv: 0.005, width: 4.1, gale: 0.95 })
  const stairExit = here()

  /*
    THE EYE — above it, and the one place on this road that is allowed to be
    easy.

    Clear black sky, stars, no rain, and a floor of cloud below with the storm
    lighting it from underneath. It is the reward, and a reward that also has to
    be survived is not one — so this is genuinely fast and genuinely wide, and
    the gale drops to almost nothing because the summit itself is between you
    and the weather. Four hundred metres of being allowed to enjoy it.
  */
  const eyeFrom = here()
  high({ length: 130, grade: 0.03, curv: 0.0055, width: 4.7, room: 0.6, wet: 0.24, gale: 0.25 })
  high({ length: 120, grade: 0.022, curv: -0.0075, width: 4.8, room: 0.6, wet: 0.2, gale: 0.2 })
  high({ length: 96, grade: 0.02, curv: 0.009, width: 4.6, room: 0.55, wet: 0.22, gale: 0.3 })
  const eyeTo = here()

  /*
    ========================================================================
    THE CROWN — the summit ridge. Beautiful, and the most dangerous place on
    any of the three roads.
    ========================================================================

    Six metres and a half of rock with the mountain falling away on both sides,
    in the full gale, in clear air with the whole storm spread out below. The
    contrast is the point: this is the calmest-*looking* piece of road in the
    game and the one where the wind has the cleanest run at the car, because
    there is nothing left up here to stand behind.

    It is deliberately placed immediately after the four hundred metres you were
    allowed to relax in.
  */
  const crownFrom = here()
  high({ length: 62, grade: 0.028, curv: -0.012, width: 3.5, room: 0.18, wet: 0.3, gale: 0.8 })
  high({ length: 74, grade: 0.012, curv: 0.0165, width: 3.2, room: 0.12, wet: 0.28, gale: 1 })
  const summit = here()
  high({ length: 68, grade: -0.014, curv: -0.019, width: 3.2, room: 0.12, wet: 0.3, gale: 1 })
  high({ length: 56, grade: -0.03, curv: 0.008, width: 3.6, room: 0.22, wet: 0.36, gale: 0.9 })
  const crownTo = here()

  /*
    ========================================================================
    THE STORMFALL — a hundred and thirty metres of height, given back at a
    tenth, in the rain, with two rivers across it.
    ========================================================================

    You go back down through the cloud and into the weather, and the descent is
    where the whole climb gets paid for. Braking downhill on wet rock is the
    hardest thing this car ever has to do, and it is asked to do it twelve
    times.

    **The two fords are the other two off-camber corners**, and this is why the
    waterfalls are where they are rather than at three numbers somebody liked:
    water that crosses a road takes the camber with it. So the reason the corner
    leans the wrong way is a thing you can see coming from four hundred metres
    away, falling off the rock above the road — which is the same trick the
    Moonbreak's cables play for its swinging deck, and is the difference between
    a hazard and a bug.
  */
  const fallFrom = here()
  high({ length: 92, grade: -0.085, curv: 0.0155, width: 4.2, wet: 0.88, gale: 0.75 })
  high({ length: 48, grade: -0.1, curv: -0.006, width: 4.0, wet: 0.9, gale: 0.7 })
  high({ length: 84, grade: -0.105, curv: -0.0235, width: 4.1, room: 0.44, wet: 0.92, gale: 0.62 })
  high({ length: 56, grade: -0.098, curv: -0.005, width: 3.9, wet: 0.94, gale: 0.55 })
  // The first ford. The rock above it is shedding the whole face's rain.
  const firstFord = here()
  high({ length: 46, grade: -0.088, curv: 0.03, width: 4.2, room: 0.5, wet: 1, gale: 0.5, camber: 0.19 })
  high({ length: 40, grade: -0.1, curv: 0.009, width: 4.0, wet: 0.9, gale: 0.45 })
  high({ length: 88, grade: -0.108, curv: -0.0185, width: 4.1, room: 0.44, wet: 0.92, gale: 0.42 })
  high({ length: 52, grade: -0.096, curv: 0.004, width: 3.9, wet: 0.94, gale: 0.38 })
  // The second, tighter, and it turns the other way.
  const secondFord = here()
  high({ length: 44, grade: -0.09, curv: -0.0335, width: 4.2, room: 0.5, wet: 1, gale: 0.34, camber: -0.19 })
  high({ length: 62, grade: -0.104, curv: -0.007, width: 4.0, wet: 0.9, gale: 0.3 })
  high({ length: 78, grade: -0.108, curv: 0.0215, width: 4.1, room: 0.44, wet: 0.9, gale: 0.26 })
  high({ length: 46, grade: -0.094, curv: 0.005, width: 3.9, wet: 0.88, gale: 0.22 })
  high({ length: 86, grade: -0.106, curv: -0.0165, width: 4.2, room: 0.46, wet: 0.88, gale: 0.2 })
  // The third waterfall, on a corner tightening into the last of the descent.
  const thirdFord = here()
  high({ length: 48, grade: -0.09, curv: -0.0285, width: 4.2, room: 0.5, wet: 1, gale: 0.18 })
  high({ length: 64, grade: -0.1, curv: 0.006, width: 4.0, wet: 0.9, gale: 0.16 })
  high({ length: 82, grade: -0.098, curv: 0.0245, width: 4.1, room: 0.44, wet: 0.9, gale: 0.14 })
  /*
    Two more, and they are here rather than in a steeper grade above because a
    hundred and forty metres has to go *somewhere* and the choice is length or
    gradient. The descent was already at a tenth, which is the Moonbreak's dive
    and about as steep as a road can be while still being a road; another two
    corners is the honest way to pay for the mountain.
  */
  high({ length: 88, grade: -0.1, curv: -0.0225, width: 4.1, room: 0.44, wet: 0.88, gale: 0.12 })
  high({ length: 88, grade: -0.096, curv: 0.0265, width: 4.1, room: 0.44, wet: 0.86, gale: 0.1 })
  high({ length: 74, grade: -0.07, curv: -0.008, width: 4.2, wet: 0.86, gale: 0.1 })
  const fallTo = here()

  /*
    THE LAST RUN — back under the cloud, back into the cedars, and the shelter
    closing over you again is the last thing this road says.

    One hard chicane while the car still has all the speed the mountain gave it,
    and then space to use everything on the way back to the fire.
  */
  const lastFrom = here()
  high({ length: 62, grade: -0.05, curv: 0.0255, width: 4.2, room: 0.46, wet: 0.84, gale: 0.06 })
  high({ length: 22, grade: -0.035, curv: 0.005, width: 4.0, wet: 0.86 })
  high({ length: 62, grade: -0.05, curv: -0.026, width: 4.2, room: 0.46, wet: 0.84 })
  high({ length: 54, grade: -0.04, curv: -0.005, width: 4.2, wet: 0.72 })
  high({ length: 78, grade: -0.03, curv: 0.0165, width: 4.4, wet: 0.66 })
  high({ length: 40, grade: -0.02, curv: 0.004, width: 4.3, wet: 0.6 })
  high({ length: 70, grade: -0.016, curv: -0.0185, width: 4.4, room: 0.5, wet: 0.58 })
  high({ length: 46, grade: -0.01, curv: -0.004, width: 4.4, wet: 0.54 })
  high({ length: 120, grade: 0, curv: 0, width: 6.0, room: 1, wet: 0.5 })
  high({ length: 90, grade: 0, curv: 0, width: 6.4, room: 1, wet: 0.46 })

  /*
    The rods and the falls, placed on the road rather than beside it.

    A lightning rod is a warning: it stands where something is about to be asked
    of you, and one standing on a straight is furniture. So they are derived
    from the corners they warn about, which is also what stops them sliding off
    those corners the next time a section changes length.
  */
  return {
    bands,
    marks: {
      rainwood: { from: rainwoodFrom, to: rainwoodTo },
      climb: { from: climbFrom, to: climbTo },
      galeBend: { approach: galeApproach, apex: galeApex, exit: galeExit },
      cloudShelf: { from: shelfFrom, to: shelfTo },
      thunderStair: {
        approach: stairApproach,
        first: stairFirst,
        second: stairSecond,
        third: stairThird,
        exit: stairExit,
      },
      eye: { from: eyeFrom, to: eyeTo },
      /** The summit ridge, and the windiest place in the game. */
      crown: { from: crownFrom, to: crownTo, summit },
      stormfall: { from: fallFrom, to: fallTo },
      lastRun: { from: lastFrom, to: at },
      /*
        Deduplicated, because a section's end and the next one's start are the
        same metre — `climbTo` *is* `galeApproach` — and two rods in one place
        is one rod with a z-fighting problem. Sorted for the same reason the
        arches on the Moonbreak are: things placed along a road should be in the
        order you meet them, so a reader can check them against the drive.
      */
      lightningRods: [...new Set([
        rainwoodTo, climbTo - 120, galeApproach - 30, galeExit,
        shelfFrom + 120, shelfTo - 60, stairApproach, stairFirst - 40,
        stairSecond - 40, stairThird - 40, stairExit,
        crownFrom, fallFrom + 40, firstFord - 46, secondFord - 46, lastFrom,
      ].map((n) => Math.round(n)))].sort((a, b) => a - b),
      /** The three fords, which are also why two of the corners lean wrong. */
      waterfalls: [firstFord + 22, secondFord + 20, thirdFord + 24],
    },
  }
}

function stormcrownBands(): Band[] {
  return STORM.bands
}

export function makeTrack(seed: number, stage: StageId = 'rootway'): Track {
  const bands = stage === 'moonbreak'
    ? moonbreakBands()
    : stage === 'stormcrown'
      ? stormcrownBands()
      : rootwayBands(seed)
  const total = bands.reduce((sum, b) => sum + b.length, 0)
  const count = Math.floor(total / STEP) + 1

  const rawCurv = new Float32Array(count)
  const rawWidth = new Float32Array(count)
  const rawCeiling = new Float32Array(count)
  const rawRoom = new Float32Array(count)
  const rawWet = new Float32Array(count)
  const rawSway = new Float32Array(count)
  const rawGale = new Float32Array(count)
  const rawCamber = new Float32Array(count)
  const rawGrade = new Float32Array(count)

  let cursor = 0
  let at = 0
  for (const b of bands) {
    const until = Math.min(count, Math.round((at + b.length) / STEP))
    for (; cursor < until; cursor++) {
      rawCurv[cursor] = b.curv
      rawWidth[cursor] = b.width
      rawCeiling[cursor] = b.ceiling
      rawRoom[cursor] = b.room
      rawWet[cursor] = b.wet
      rawSway[cursor] = b.sway
      rawGale[cursor] = b.gale
      rawCamber[cursor] = b.camber
      rawGrade[cursor] = b.grade
    }
    at += b.length
  }
  for (; cursor < count; cursor++) {
    rawCurv[cursor] = 0
    rawWidth[cursor] = 7.4
    rawCeiling[cursor] = 12
    rawRoom[cursor] = 1
    rawWet[cursor] = 0.1
    rawSway[cursor] = 0
    rawGale[cursor] = 0
    rawCamber[cursor] = 0
    rawGrade[cursor] = 0
  }

  const curv = smooth(rawCurv, 11)
  const width = smooth(rawWidth, 9)
  const ceiling = smooth(rawCeiling, 9)
  const room = smooth(rawRoom, 9)
  const wet = smooth(rawWet, 7)
  // Wider than the rest: a span that starts swinging between one metre and the
  // next is a step in the sideways force, which reads as a shunt rather than as
  // a bridge. Eased in over forty metres it reads as walking onto something
  // that is already moving.
  const sway = smooth(rawSway, 21, 2)
  /*
    Wide, and for the opposite reason to the span's.

    Coming out of the cedars into the open should be a *transition* — thirty
    metres of the trees thinning and the crosswind arriving — rather than a step
    change in a force, which reads as being hit by something rather than as
    leaving shelter.
  */
  const gale = smooth(rawGale, 19, 2)
  // As wide as the grade's, and for exactly the same reason: a step in the tilt
  // of the road is a step in a force, and the car would jolt at the seam.
  const camber = smooth(rawCamber, 15, 2)
  const grade = smooth(rawGrade, 8)

  const x = new Float32Array(count)
  const y = new Float32Array(count)
  const z = new Float32Array(count)
  const heading = new Float32Array(count)
  const bank = new Float32Array(count)

  let hx = 0
  let hy = 0
  let hz = 0
  let ang = 0
  for (let i = 0; i < count; i++) {
    x[i] = hx
    y[i] = hy
    z[i] = hz
    heading[i] = ang
    // The road rolls into its corners. Not physics — the physics is flat — but
    // a cave road cut by water would be banked, and a flat ribbon through a
    // hairpin looks laid rather than worn. Negative because the inside of a
    // right-hander is on the right, and the inside is the low side.
    /*
      ...and then whatever the course author said about *this* corner. The line
      above is the drawing rule and is not in the physics; `camber` is, so where
      it is written large enough to cancel the roll above it the road is seen to
      tip toward the outside at the same moment the car is pulled that way. See
      the note beside `Band.camber`.
    */
    bank[i] = Math.max(-0.2, Math.min(0.2, -curv[i] * 5.2)) + camber[i]

    hx += Math.sin(ang) * STEP
    hz += Math.cos(ang) * STEP
    hy += grade[i] * STEP
    /*
      Increasing the compass angle swings the road to the LEFT — the forward
      vector is (sin h, 0, cos h) and its derivative points left — so a
      right-hand corner counts down.

      Everything else in the racer is right-positive: `n`, the car's heading
      offset, the steering input, the racing line. This one minus sign is where
      the two conventions are reconciled, and it is here rather than scattered
      through the physics on purpose.
    */
    ang -= curv[i] * STEP
  }

  // Where a quick driver puts the car: outside on the way in, at the apex in
  // the middle, and drifting back out. Approximated by heavily smoothing "hug
  // the inside", which is close enough that the tyre marks land where you
  // would actually have put the car.
  const rawLine = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const usable = Math.max(0, width[i] - 1.35)
    rawLine[i] = Math.sign(curv[i]) * usable * Math.min(1, Math.abs(curv[i]) * 46)
  }
  /* Through the Rootwake the learned line stays on the broad left road. The
     spirit and the tyre marks never reveal the narrow branch or stray across
     the gap; finding and mastering that route belongs to a person. */
  const line = smooth(rawLine, 26, 2)

  const track: Track = {
    seed,
    stage,
    length: (count - 1) * STEP,
    start: START,
    finishAt: (count - 1) * STEP - COAST,
    x,
    y,
    z,
    heading,
    curv,
    width,
    ceiling,
    room,
    wet,
    sway,
    gale,
    camber,
    grade,
    bank,
    line,
    lanterns: [],
    roots: [],
    boulders: [],
    spikes: [],
    puddles: [],
    /*
      Off to one side of the chamber and a little way *ahead* of the start.

      Behind the car it is behind the camera, which is where it spent its
      first afternoon: lighting the wall and never once being seen. Eight
      metres up the road you launch past it, and the last thing that leaves
      the frame as the road opens is the fire you were sitting at.
    */
    hearths: stage !== 'rootway' ? [
      { s: START + 7, n: -5.4 },
      { s: (count - 1) * STEP - 8, n: 0 },
    ] : [
      { s: START + 8, n: -4.6 },
      /*
        And the one you come back to, dead ahead on the centreline.

        It used to sit four and a half metres off to the right, thirty short of
        the end — which meant the road you rolled down at the end of a race
        pointed at a hole in the mesh and the fire went past your shoulder.
        Against the back wall and on the middle of the road it is the thing the
        last hundred metres are aimed at, and the car comes to rest six metres
        short of it with the result over the top. The road is a loop through
        the rock under the garden and this is the same fire you left.
      */
      { s: (count - 1) * STEP - 8, n: 0 },
    ],
    gate: [],
    split: null,
    /*
      What each road is underfoot.

      The Moonbreak is a laid stone causeway and marks like one. The Stormcrown
      is a mountain road — grit washed over rock, and wet most of the way. The
      Rootway is loose earth and dust.
    */
    loose:
      stage === 'moonbreak' ? 0.12
      : stage === 'stormcrown' ? 0.4
      : 0.85,
  }

  if (stage === 'moonbreak') dressMoonbreak(track, random(seed ^ 0x6d2b79))
  else if (stage === 'stormcrown') dressStormcrown(track, random(seed ^ 0x7a36c1))
  else dressTrack(track, random(seed ^ 0x9c31d7))
  return track
}

/**
 * The Stormcrown's light is a driving language. Cold rods keep time through
 * rain; amber cairns count down braking distance. Nothing sits on the stone.
 */
function dressStormcrown(track: Track, rng: () => number) {
  const count = track.x.length
  let since = 0
  for (let i = 12; i < count - 12; i++) {
    const s = i * STEP
    since += STEP
    const turning = Math.abs(track.curv[i]) > 0.006
    if (since < (turning ? 14 : 27)) continue
    since = 0
    const side = turning ? -Math.sign(track.curv[i]) : rng() < 0.5 ? -1 : 1
    track.lanterns.push({
      s,
      n: side * (track.width[i] + 1.15 + rng() * 0.45),
      y: 0.65 + rng() * 0.3,
      size: 0.58 + rng() * 0.2,
      warm: 0,
    })
  }

  // Three amber cairns say hard; five say the Stair demands a real brake.
  const warnings = [
    { from: STORMCROWN.galeBend.approach + 38, count: 3, gap: 34, side: -1 },
    { from: STORMCROWN.thunderStair.approach + 32, count: 5, gap: 28, side: 1 },
    { from: STORMCROWN.thunderStair.second - 118, count: 4, gap: 25, side: -1 },
    { from: STORMCROWN.thunderStair.third - 116, count: 5, gap: 23, side: 1 },
  ]
  for (const warning of warnings) {
    for (let marker = 0; marker < warning.count; marker++) {
      const s = warning.from + marker * warning.gap
      const i = Math.min(count - 1, Math.round(s / STEP))
      track.lanterns.push({
        s,
        n: warning.side * (track.width[i] + 1.7),
        y: 0.95 + marker * 0.27,
        size: 0.75 + marker * 0.09,
        warm: 1,
      })
    }
  }

  // Gate pairs make the summit acts readable at speed and carry the finish.
  for (const s of [STORMCROWN.cloudShelf.from, STORMCROWN.eye.from, track.finishAt]) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    const out = track.width[i] + 1.25
    for (const side of [-1, 1]) {
      track.gate.push({ s, n: side * out })
      track.lanterns.push({
        s,
        n: side * out,
        y: 3.35,
        size: s === track.finishAt ? 1.2 : 0.86,
        warm: s === track.finishAt ? 1 : 0,
      })
    }
  }

  for (let s = 72; s < track.finishAt - 35; s += 31 + rng() * 43) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    track.puddles.push({
      s,
      n: (rng() * 2 - 1) * track.width[i] * 0.72,
      radius: 0.75 + rng() * 1.75,
    })
  }

  // A quiet paired avenue after timing stops, ending at the stormfire.
  for (let s = track.finishAt + 17; s < track.length - 18; s += 17) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    for (const side of [-1, 1]) {
      track.lanterns.push({
        s,
        n: side * (track.width[i] + 1),
        y: 0.55,
        size: 0.68,
        warm: 0.55,
      })
    }
  }

  track.lanterns.sort((a, b) => a.s - b.s)
}

// ---------------------------------------------------------------------------
// What is on the road, and what is growing through it
// ---------------------------------------------------------------------------

/**
 * Light and obstacles for the open road.
 *
 * The same lantern structure becomes a moon pearl here: cold, steady and low
 * beside the causeway. Paired pearls announce the broken arches. Amber is
 * reserved for braking: two at Tidecut, four before the Moonhook, then the
 * finish pair. Nothing hangs from a ceiling because there is no ceiling, and
 * boulders stay outside the timed stone as pieces of a drowned garden rather
 * than hazards dropped in the line.
 */
function dressMoonbreak(track: Track, rng: () => number) {
  const count = track.x.length
  let since = 0

  for (let i = 8; i < count - 8; i++) {
    since += STEP
    const turning = Math.abs(track.curv[i]) > 0.006
    const spacing = turning ? 12 : 24
    if (since < spacing) continue
    since = 0
    const outside = Math.sign(track.curv[i] || (rng() - 0.5)) || 1
    // Not inside the Drowned Mile: the tube hangs its own, in pairs, below.
    if (i * STEP > MOONBREAK.deep.from + 12 && i * STEP < MOONBREAK.deep.to - 12) continue
    track.lanterns.push({
      s: i * STEP,
      n: outside * (track.width[i] + 1.05 + rng() * 0.45),
      y: 0.42 + rng() * 0.18,
      size: 0.56 + rng() * 0.24,
      warm: 0,
    })
  }

  /*
    And the tube's own lamps, in pairs, which are a different kind of light.

    -------------------------------------------------------------------------
    Above water the lanterns are corner guidance: one at a time, on the outside
    of the bend, telling you where the road goes. Under it they cannot be, and
    trying would be a lie — the road down there is a glass tube and you can see
    the whole of it. So they change job. Paired, evenly spaced, set high on the
    ribs, they stop being *information* and become **rhythm**: the one thing
    that tells you how fast you are going when there is no scenery close enough
    to stream past, and the thing that makes the tube read as built rather than
    as a hole in the dark.

    Every eighteen metres, which at Drowned-Mile speeds is a beat about every
    two thirds of a second — fast enough to feel like travelling, slow enough
    that a phone is not drawing forty glows at once.

    Their colour is the vein colour, which the Moonbreak sets to a cold cyan,
    and that is deliberate: the only warm thing under the water is your own
    car. See `uVeinColor` in `Race`.
    -------------------------------------------------------------------------
  */
  {
    const { from, to } = MOONBREAK.deep
    for (let s = from + 26; s < to - 26; s += 18) {
      const i = Math.min(count - 1, Math.round(s / STEP))
      for (const side of [-1, 1]) {
        track.lanterns.push({
          s,
          n: side * (track.width[i] + 1.15),
          y: 2.42,
          size: 0.5,
          warm: 0,
        })
      }
    }
  }

  // The paired arches: equal lights are a landmark, never ordinary corner
  // guidance.
  for (const s of MOONBREAK.arches.slice(1)) {
    if (s >= track.finishAt - 20) continue
    const i = Math.min(count - 1, Math.round(s / STEP))
    for (const side of [-1, 1]) {
      track.lanterns.push({
        s,
        n: side * (track.width[i] + 1.4),
        y: 3.1,
        size: 0.72,
        warm: 0,
      })
    }
  }

  // Braking pearls are the course's wordless difficulty language. Tidecut
  // gets two; the much faster Moonhook approach gets four, growing taller and
  // warmer toward turn-in. Both sit on the outside of their positive-radius
  // corner, where a driver naturally looks while choosing the braking point.
  const warnings = [
    { from: MOONBREAK.hard.approach + 12, count: 2, gap: 18, warm: 0.72 },
    { from: MOONBREAK.veryHard.approach + 80, count: 4, gap: 32, warm: 1 },
  ]
  for (const warning of warnings) {
    for (let marker = 0; marker < warning.count; marker++) {
      const s = warning.from + marker * warning.gap
      const i = Math.min(count - 1, Math.round(s / STEP))
      track.lanterns.push({
        s,
        n: track.width[i] + 1.7,
        y: 1.05 + marker * 0.34,
        size: 0.78 + marker * 0.1,
        warm: warning.warm,
      })
    }
  }

  for (let s = 54; s < track.finishAt - 30; s += 29 + rng() * 31) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    const side = rng() < 0.5 ? -1 : 1
    track.boulders.push({
      s,
      n: side * (track.width[i] + vergeWidth(track.room[i]) + 0.8 + rng() * 2.4),
      size: 0.45 + rng() * 0.9,
      seed: Math.floor(rng() * 0x7fffffff),
    })
  }

  for (let s = 90; s < track.finishAt - 25; s += 20 + rng() * 42) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    if (track.wet[i] < 0.45) continue
    track.puddles.push({
      s,
      n: (rng() * 2 - 1) * track.width[i] * 0.7,
      radius: 0.8 + rng() * 2.2,
    })
  }

  const gateIndex = Math.min(count - 1, Math.round(track.finishAt / STEP))
  const gateOut = track.width[gateIndex] + 1.15
  for (const side of [-1, 1]) {
    track.gate.push({ s: track.finishAt, n: side * gateOut })
    track.lanterns.push({
      s: track.finishAt,
      n: side * gateOut,
      y: 3.4,
      size: 1.12,
      warm: 1,
    })
  }

  // After the timed arch, paired pearls draw a quiet avenue to the moonwell.
  // The last one is central and larger: the place the car comes to rest, not
  // another instruction about where the road turns.
  for (let s = track.finishAt + 18; s < track.length - 24; s += 18) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    for (const side of [-1, 1]) {
      track.lanterns.push({
        s,
        n: side * (track.width[i] + 1.05),
        y: 0.52,
        size: 0.68,
        warm: 0,
      })
    }
  }
  track.lanterns.push({
    s: track.length - 20,
    n: 0,
    y: 1.25,
    size: 1.7,
    warm: 0,
  })

  track.lanterns.sort((a, b) => a.s - b.s)
}

/**
 * Everything you can see that is not rock.
 *
 * The lanterns are the only part of this that is really a *mechanic*: there is
 * no line on the ground and no arrow, so where the light is placed is how the
 * road tells you a corner is coming and which way it goes. They sit on the
 * outside of a bend at its entry — the wall you would hit — and then stop,
 * which is the apex.
 */
function dressTrack(track: Track, rng: () => number) {
  const count = track.x.length

  let sinceLantern = 0
  for (let i = 4; i < count - 4; i++) {
    const s = i * STEP
    const k = track.curv[i]
    const turning = Math.abs(k) > 0.006
    sinceLantern += STEP

    // Corner entry: curvature is still building. This is the marker.
    const building = Math.abs(track.curv[i + 3]) > Math.abs(k) + 0.0004
    const spacing = turning ? 11 : track.room[i] > 0.7 ? 15 : 21

    /* Every ambient light in the Rootwake cavern stays on the ordinary left
       road. The branch's mouth has its own few markers below; after those, the
       right-hand ledge is lit only by the car. */
    const inTheSplit =
      track.split !== null && s > track.split.from - 10 && s < track.split.commitAt + 26

    if (sinceLantern >= spacing) {
      sinceLantern = 0
      const outside = inTheSplit ? -1 : turning ? -Math.sign(k) : rng() < 0.5 ? -1 : 1
      const edge = track.width[i] + 0.55 + rng() * 0.5
      track.lanterns.push({
        s,
        n: outside * edge,
        y: 0.32 + rng() * 0.5,
        size: turning && building ? 1.05 + rng() * 0.25 : 0.62 + rng() * 0.3,
        // Fire on the corners, cold fungus on the straights. The warm ones are
        // the ones that mean something, and the eye learns that in one lap.
        warm: turning ? 1 : rng() < 0.35 ? 0.75 : 0,
      })
    }

    // A chamber gets a scatter of its own, high up, so the room has a ceiling
    // you can see rather than a black lid.
    if (track.room[i] > 0.85 && i % 9 === 0) {
      // Left only, inside the Split. See above.
      const side = inTheSplit ? -1 : rng() < 0.5 ? -1 : 1
      track.lanterns.push({
        s,
        n: side * (track.width[i] + 1.6 + rng() * 2.6),
        y: 1.6 + rng() * track.ceiling[i] * 0.5,
        size: 0.5 + rng() * 0.55,
        warm: rng() < 0.6 ? 1 : 0.2,
      })
    }
  }

  // Roots. The Rootway is named for these: they come through the vault, run
  // down a wall, and in the tight sections they cross low enough overhead that
  // the light off your own lamps sweeps along them as you pass.
  for (let s = 14; s < track.length - 20; s += 3.2 + rng() * 5.5) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    const tight = 1 - Math.min(1, track.room[i])
    track.roots.push({
      s,
      side: rng() * 2 - 1,
      reach: (0.28 + rng() * 0.62) * (0.55 + tight * 0.65),
      thickness: 0.075 + rng() * 0.2 + tight * 0.05,
      twist: rng() * Math.PI * 2,
      seed: Math.floor(rng() * 65536),
    })
  }

  /*
    Stone teeth: hanging from the vault, standing on the verge.

    The Rootway had roots and nothing else, so every metre of it was the same
    smooth swept tube with some timber over the top. Spikes are what make a
    cave read as *rock* — they break the silhouette of the ceiling, they catch
    the headlamps one at a time as you pass under them, and standing on the
    verge they give the edge of the road a ragged line instead of a hem.

    None of them is solid: they are never on the driveable stone, and the ones
    overhead hang well above the car. A thing you cannot see coming in a dark
    tunnel is not difficulty, it is a dice roll — the same rule the boulders
    below are placed by.
  */
  for (let s = 10; s < track.length - 14; s += 2.4 + rng() * 6.5) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    const half = track.width[i]
    const verge = half + vergeWidth(track.room[i])
    const hanging = rng() < 0.68
    if (hanging) {
      // Anywhere across the vault. Longest toward the walls, so the middle of
      // the roof stays clear enough to read the road under it.
      const n = (rng() * 2 - 1) * verge * 0.96
      const middle = 1 - Math.min(1, Math.abs(n) / Math.max(0.5, verge))
      track.spikes.push({
        s,
        n,
        hanging: true,
        length: (0.35 + rng() * 1.15) * (1 - middle * 0.45),
        thickness: 0.09 + rng() * 0.22,
        seed: Math.floor(rng() * 65536),
      })
    } else {
      // Standing, and only ever out on the loose. The verge is where a car
      // that has run wide ends up, and a stalagmite there is a reason not to.
      const side = rng() < 0.5 ? -1 : 1
      const n = side * (half + 0.25 + rng() * Math.max(0.3, verge - half - 0.35))
      track.spikes.push({
        s,
        n,
        hanging: false,
        length: 0.3 + rng() * 0.9,
        thickness: 0.1 + rng() * 0.24,
        seed: Math.floor(rng() * 65536),
      })
    }
  }

  /*
    Stone off the racing line. Never in front of you on the line itself — a
    rock you cannot see coming in a dark tunnel is not difficulty, it is a
    dice roll — but close enough to it that the fast way through is narrow.

    And none of it past the flag. Everything after the finish is the roll-in,
    where the car is steering itself and you are reading a result over the top
    of it; a boulder collected there is a bang nobody caused and nobody can
    avoid.
  */
  for (let s = 90; s < track.finishAt - 40; s += 16 + rng() * 34) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    const half = track.width[i]
    const side = rng() < 0.5 ? -1 : 1
    const n = side * (half * (0.72 + rng() * 0.5))
    if (Math.abs(track.line[i] - n) < 2.2) continue
    /* The fork is authored. Ordinary width-relative scatter would move rocks
       across either route with the seed and turn precision into luck. */
    track.boulders.push({
      s,
      n,
      size: 0.32 + rng() * 0.72,
      seed: Math.floor(rng() * 65536),
    })
  }

  /* Edge stone, sparse enough to remain natural, then the mouth lights. The
     interior receives no route lighting: its gates are found by headlamp. */
  if (track.split) {
    const split = track.split
    /*
      Three low amber lights make the mouth noticeable without naming it. The
      first sits in the shared chamber; the other two belong to Rootwake's own
      centreline, so their light reveals the right-hand deck and outer rock
      instead of leaving a black rectangle beside the ordinary road.
    */
    track.lanterns.push({
      s: split.from + 10,
      n: split.portalN + 1.1,
      y: 0.75,
      size: 1,
      warm: 1,
    })
    track.lanterns.push({
      s: split.from + 42,
      shortcut: true,
      n: 2.9,
      y: 1.28,
      size: 1.58,
      warm: 1,
    })
    track.lanterns.push({
      s: split.from + 54,
      shortcut: true,
      n: 2.45,
      y: 1.62,
      size: 1.72,
      warm: 1,
    })
  }

  /*
    The two fires.

    The Hollow's own, which you leave, and the one at the far end you come back
    to — and they are the same fire, because the road is a loop through the
    rock under the garden. They go into the lantern list rather than being
    their own thing so that the light window picks them up automatically: the
    first thirty metres of the road are genuinely lit by the fire you were
    sitting at a moment ago.
  */
  for (const hearth of track.hearths) {
    track.lanterns.push({
      s: hearth.s,
      n: hearth.n,
      y: 0.55,
      size: 3.4,
      warm: 1,
      fire: true,
    })
  }

  /*
    The line, as two stones with fire on them.

    Placed just inside the rock rather than out on the verge: the hall is nine
    metres to the wall and stones set against it would be scenery, while stones
    a stride outside the driveable road are a gate you go *through*. They stand
    where the road is at its widest, so the pair of them frame the whole mouth
    of the hall.

    They go into the lantern list like the hearths do, so the light window
    picks them up with no special case — which is what makes the last corner
    before the flag light up warm from ahead rather than from the walls.
  */
  {
    const i = Math.min(count - 1, Math.round(track.finishAt / STEP))
    const half = track.width[i]
    const out = half + Math.max(0.9, vergeWidth(track.room[i]) * 0.45)
    for (const side of [-1, 1]) {
      track.gate.push({ s: track.finishAt, n: side * out })
      track.lanterns.push({
        s: track.finishAt,
        n: side * out,
        // On top of the stone, which `buildGate` raises to the same height.
        y: GATE_HEIGHT + 0.24,
        size: 1.9,
        warm: 1,
        fire: true,
      })
    }
  }

  /*
    And the hall itself is lit, which is most of what makes it an arrival.

    The road is a dark tunnel with lights placed one at a time to tell you
    where the corners are. Closing it with rock fixed the hole at the end but
    left the last hundred metres exactly as dark as the rest — you crossed a
    line between two fires and then rolled for six seconds through a black room
    toward a dot. A room you cannot see is not a room.

    So the hall gets an avenue: fires down both verges, evenly spaced and
    level with each other, all the way to the hearth. Even spacing is the point
    and it is the only place on the whole road where it is allowed. Everywhere
    else the lanterns are *information* — they sit on the outside of a bend and
    stop at the apex, and a regular row would be a lie about the road. Here
    there is nothing left to say about the road, and two straight rows of fire
    running to a hearth say the one thing there is: you are back.
  */
  {
    let s = track.finishAt + 9
    let station = 0
    while (s < track.length - END_WALL + 2) {
      const i = Math.min(count - 1, Math.round(s / STEP))
      const out = track.width[i] + vergeWidth(track.room[i]) * 0.36
      /*
        Every other station is up the wall rather than on the ground.

        A hall lit only from ankle height is a lit floor under a black lid,
        which is what the first cut of this was: you could see the road and the
        cairns beside it and nothing at all of the room they were in. Lifting
        half of them to head height and above puts light on the walls and the
        underside of the vault, and thirteen metres of ceiling is the whole
        reason the hall is worth arriving in.
      */
      const high = station % 2 === 1
      for (const side of [-1, 1]) {
        track.lanterns.push({
          s,
          n: side * (high ? out + 0.5 : out),
          y: high ? 2.9 : 0.34,
          // Big. These are braziers lighting a room, not markers saying which
          // way a corner goes, and the two want an order of magnitude between
          // them or the arrival is as dark as the road that led to it.
          size: 1.55 + rng() * 0.3,
          warm: 1,
        })
      }
      s += 10.5
      station++
    }

    // Two higher ones either side of the hearth, so the rock the hall ends
    // against is lit from in front of it and reads as a wall rather than as
    // the place the light stopped.
    const i = Math.min(count - 1, Math.round((track.length - 10) / STEP))
    for (const side of [-1, 1]) {
      track.lanterns.push({
        s: track.length - 10,
        n: side * (track.width[i] + 0.7),
        y: 3.1,
        size: 1.5,
        warm: 1,
      })
    }
  }

  track.lanterns.sort((a, b) => a.s - b.s)

  /*
    Water off the seeps, pooling where the stone is wet.

    Not on the Swaying Span, which is among the wettest stretches of the road
    and has no stone on it: a deck of boards with twelve centimetres of dark
    between each pair does not hold a puddle, it drains. They were pooling on
    it, which is the sort of detail that stays invisible right up until the
    surface underneath stops being a surface.
  */
  for (let s = 40; s < track.length - 40; s += 9 + rng() * 22) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    if (track.wet[i] < 0.3) continue
    if (s > MOONBREAK.span.from - 4 && s < MOONBREAK.span.to + 4) continue
    track.puddles.push({
      s,
      n: (rng() * 2 - 1) * track.width[i] * 0.8,
      radius: 0.7 + rng() * track.wet[i] * 2.6,
    })
  }
}

// ---------------------------------------------------------------------------
// Reading the road
// ---------------------------------------------------------------------------

export interface RoadAt {
  x: number
  y: number
  z: number
  heading: number
  curv: number
  width: number
  ceiling: number
  room: number
  wet: number
  bank: number
  grade: number
  /** How much the road is swinging here, 0..1. */
  sway: number
  /** How exposed to the weather here, 0..1. */
  gale: number
  /** Radians of authored wrong-way tilt, positive raising the right. */
  camber: number
  line: number
  /** World metres represented by one metre of shared race progress. */
  metric: number
}

export function emptyRoad(): RoadAt {
  return {
    x: 0, y: 0, z: 0, heading: 0, curv: 0, width: 4.6,
    ceiling: 5.6, room: 0.3, wet: 0, bank: 0, grade: 0, sway: 0, gale: 0, camber: 0, line: 0, metric: 1,
  }
}

function lerpAt(values: Float32Array, i: number, j: number, mix: number): number {
  return values[i] * (1 - mix) + values[j] * mix
}

export function roadAt(track: Track, s: number, out?: RoadAt): RoadAt {
  const last = track.x.length - 1
  const exact = Math.max(0, Math.min(last, s / STEP))
  const i = Math.floor(exact)
  const j = Math.min(last, i + 1)
  const mix = exact - i

  const r = out ?? emptyRoad()
  r.x = lerpAt(track.x, i, j, mix)
  r.y = lerpAt(track.y, i, j, mix)
  r.z = lerpAt(track.z, i, j, mix)
  r.curv = lerpAt(track.curv, i, j, mix)
  r.width = lerpAt(track.width, i, j, mix)
  r.ceiling = lerpAt(track.ceiling, i, j, mix)
  r.room = lerpAt(track.room, i, j, mix)
  r.wet = lerpAt(track.wet, i, j, mix)
  r.sway = lerpAt(track.sway, i, j, mix)
  r.gale = lerpAt(track.gale, i, j, mix)
  r.camber = lerpAt(track.camber, i, j, mix)
  r.bank = lerpAt(track.bank, i, j, mix)
  r.grade = lerpAt(track.grade, i, j, mix)
  r.line = lerpAt(track.line, i, j, mix)
  r.metric = 1

  // Headings are integrated and monotonic here, so a plain lerp is safe and
  // there is no wrap to unwind.
  r.heading = lerpAt(track.heading, i, j, mix)
  return r
}

/**
 * Build the hidden road as a real second centreline.
 *
 * Short alignment throats inherit only the two portal headings. Between them,
 * an authored transverse route supplies a hard S and a tighter blind reverse.
 * The road then drops more than thirty metres below the ordinary cave and is
 * sampled into the same physical quantities understood by tyres and cameras.
 */
/** Read the hidden tunnel, whose arrays begin at `split.from`. */
export function shortcutRoadAt(split: RootSplit, s: number, out?: RoadAt): RoadAt {
  const last = split.x.length - 1
  const exact = Math.max(0, Math.min(last, (s - split.from) / STEP))
  const i = Math.floor(exact)
  const j = Math.min(last, i + 1)
  const mix = exact - i
  const r = out ?? emptyRoad()
  r.x = lerpAt(split.x, i, j, mix)
  r.y = lerpAt(split.y, i, j, mix)
  r.z = lerpAt(split.z, i, j, mix)
  r.heading = lerpAt(split.heading, i, j, mix)
  r.curv = lerpAt(split.curv, i, j, mix)
  r.width = lerpAt(split.width, i, j, mix)
  r.ceiling = lerpAt(split.ceiling, i, j, mix)
  r.room = lerpAt(split.room, i, j, mix)
  r.wet = lerpAt(split.wet, i, j, mix)
  r.sway = 0
  r.gale = 0
  r.camber = 0
  r.grade = lerpAt(split.grade, i, j, mix)
  r.bank = lerpAt(split.bank, i, j, mix)
  r.line = lerpAt(split.line, i, j, mix)
  r.metric = lerpAt(split.metric, i, j, mix)
  return r
}

/** One call for every consumer that can follow either Rootway route. */
export function roadAtRoute(
  track: Track,
  s: number,
  shortcut: boolean,
  out?: RoadAt,
): RoadAt {
  return shortcut && track.split && s >= track.split.from && s <= track.split.to
    ? shortcutRoadAt(track.split, s, out)
    : roadAt(track, s, out)
}

/**
 * Somewhere on the road, in the world.
 *
 * `n` is metres off the middle, positive right. The bank tilts the surface, so
 * a car sitting on the outside of a banked corner is genuinely higher than one
 * on the inside — which the camera and the headlights both notice.
 */
export function placeOnRoad(
  track: Track,
  s: number,
  n: number,
  out: { x: number; y: number; z: number },
  road?: RoadAt,
): RoadAt {
  const r = road ?? roadAt(track, s)
  // Forward is (sin h, 0, cos h), so the road's own right-hand normal is
  // (-cos h, 0, sin h).
  out.x = r.x - Math.cos(r.heading) * n
  out.z = r.z + Math.sin(r.heading) * n
  out.y = r.y + Math.sin(r.bank) * n
  return r
}
