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
import {
  CUT,
  CUT_HALF_WIDTH,
  HALF_WIDTH,
  SWITCHBACK,
  cornerBands,
  marks,
} from './switchback'

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
  /**
   * A distance marker rather than ambience.
   *
   * Only the Switchback has these, because only a road that is the same road
   * every time can be measured from. Kept as a flag rather than inferred from
   * position so that a checker — and anything that wants to draw them as cut
   * stone rather than as another lantern — can tell them apart from the light
   * the dresser scatters.
   */
  mark?: boolean
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
  const len = 62 + rng() * 34
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
    length: 46 + rng() * 34,
    width: 3.35,
    ceiling: 3.5,
    room: 0,
    curv: dir * (0.002 + rng() * 0.005),
    wet: 0.35,
  }),
]

/** A long fast curve. Lift, do not brake. */
const sweep: Piece = (rng, dir) => {
  const radius = 62 + rng() * 55
  return [
    band({ length: 22, curv: dir / (radius * 2.4), width: 5, ceiling: 6.4, room: 0.4 }),
    band({ length: 58 + rng() * 46, curv: dir / radius, width: 5, ceiling: 6.6, room: 0.45 }),
    band({ length: 22, curv: dir / (radius * 2.2), width: 5, ceiling: 6.4, room: 0.4 }),
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
  band({ length: 55 + rng() * 45, curv: dir * (rng() * 0.004), width: 4.7, ceiling: 6 }),
]

interface Entry {
  name: string
  make: Piece
  weight: number
}

const LIBRARY: Entry[] = [
  { name: 'sweep', make: sweep, weight: 3 },
  { name: 'hairpin', make: hairpin, weight: 2 },
  { name: 'chicane', make: chicane, weight: 2.4 },
  { name: 'throat', make: throat, weight: 2 },
  { name: 'descent', make: descent, weight: 1.6 },
  { name: 'rise', make: rise, weight: 1.2 },
  { name: 'runway', make: runway, weight: 1.4 },
  { name: 'chamber', make: chamber, weight: 1.6 },
]

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
function choose(rng: () => number, previous: string[], sinceChamber: number): Entry {
  const last = previous.at(-1)
  const usable = LIBRARY.filter((entry) => {
    // Two hairpins back to back is not a road, it is a mistake typed twice.
    if (entry.name === 'hairpin' && last === 'hairpin') return false
    // A chamber is an event. Two in a row spends it.
    if (entry.name === 'chamber' && (last === 'chamber' || sinceChamber < 2)) return false
    if (entry.name === 'throat' && last === 'throat') return false
    if (entry.name === 'descent' && last === 'descent') return false
    return true
  })

  const pickFrom = (pool: Entry[]) => pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]

  // The room has been closed in for a while — open it.
  if (sinceChamber >= 5) return LIBRARY.find((e) => e.name === 'chamber')!
  // You arrive out of a descent carrying far too much speed. Give it somewhere
  // to go, or the piece is just a corridor that happens to slope.
  if (last === 'descent') {
    const after = usable.filter((e) => e.name === 'hairpin' || e.name === 'chicane')
    if (after.length) return pickFrom(after)
  }
  // Out of a chamber, close it down again immediately. The contrast is the
  // entire reason the chamber worked.
  if (last === 'chamber') {
    const after = usable.filter((e) => e.name === 'throat' || e.name === 'descent')
    if (after.length) return pickFrom(after)
  }

  const total = usable.reduce((sum, e) => sum + e.weight, 0)
  let pick = rng() * total
  for (const entry of usable) {
    pick -= entry.weight
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

/** The mouth on the main road. Beyond it, the two roads share no geometry. */
function splitBands(): Band[] {
  return [
    band({ length: 34, width: 4.4, ceiling: 5.4, room: 0.25, curv: 0.002, wet: 0.34 }),
    // One chamber, just long enough to notice the low right-hand throat.
    band({ length: 58, width: 7.4, ceiling: 9.2, room: 0.82, curv: -0.003, wet: 0.25 }),
    // The ordinary road turns away. The hidden road does not follow it.
    band({ length: 72, width: 5.1, ceiling: 6.1, room: 0.38, curv: -0.012, wet: 0.2 }),
    band({ length: 58, width: 4.8, ceiling: 5.4, room: 0.22, curv: 0.008, wet: 0.38 }),
    band({ length: 34, width: 4.5, ceiling: 5.1, room: 0.18, curv: 0.002, wet: 0.42 }),
  ]
}

/** Filled in by `rootwayBands`; the independent road is built after sampling. */
let dealtMouth: number | null = null

/**
 * The Switchback Run's road, band by band.
 *
 * ===========================================================================
 * Authored from `switchback.ts`, which is the blueprint written down once and
 * read by both this and the checker. Nothing here is dealt or seeded: the whole
 * point of this road is that it is the same road every time, so that learning
 * where the apex of Turn 7 is means something the next evening.
 *
 * **What is left to this file is the cave, not the course.** The driveable
 * width is 11 m from end to end because the blueprint says so, so the Rootway's
 * usual trick of pinching the road to make a chamber land is not available.
 * The vault does it instead: low and close down the straights, opening over the
 * hairpins, so the road still breathes exactly as the Rootway does while every
 * metre of tarmac stays the width it is supposed to be.
 *
 * `room` closes in through every corner, which is the blueprint's "barriers or
 * slowdown terrain outside major corners" answered in the language this place
 * already speaks: underground, the thing outside a corner is rock.
 * ===========================================================================
 */
function switchbackBands(): Band[] {
  const bands: Band[] = []

  /*
    Out of the fire, exactly as the Rootway does it — the first fifty metres are
    the Hollow itself, so the road you leave on is the room you were sitting in.
    These sit *before* the timed line; see `SWITCHBACK_START`.
  */
  bands.push(band({ length: 26, width: 7.2, ceiling: 11, room: 1, curv: 0 }))
  bands.push(band({ length: 22, width: 6.2, ceiling: 7.6, room: 0.5, curv: 0 }))
  bands.push(band({ length: 34, width: HALF_WIDTH, ceiling: 6.2, room: 0.2, curv: 0, wet: 0.3 }))

  /**
   * How the vault behaves over one leg.
   *
   * A straight runs under a low close roof and a corner opens into a hall, with
   * the biggest halls over the two hairpins. It is the same rhythm the dealt
   * Rootway gets from its chamber/throat grammar, taken here from the shape of
   * the course instead — which is better, because now the room opens where
   * something is happening rather than wherever the bag said.
   */
  const vault = (kind: 'straight' | 'corner', turn: number) => {
    if (kind === 'straight') {
      return { ceiling: 5.9, room: 0.34, wet: 0.16 }
    }
    const big = Math.min(1, Math.abs(turn) / 165)
    return {
      ceiling: 6.4 + big * 6.2,
      // Rock right there on the outside of everything that turns.
      room: 0.06 + (1 - big) * 0.1,
      wet: 0.24 + big * 0.16,
    }
  }

  for (const leg of SWITCHBACK) {
    if (leg.kind === 'straight') {
      /*
        A straight is three bands, not one.

        One long band of identical stone reads as a corridor rather than a
        cave — the eye has nothing to measure the length against. Splitting it
        lets the roof lift a little in the middle and settle again, which at a
        hundred and twenty is the difference between travelling somewhere and
        watching a texture scroll.
      */
      const shape = vault('straight', 0)
      const third = leg.length / 3
      bands.push(band({ length: third, width: HALF_WIDTH, grade: leg.grade ?? 0, ...shape }))
      bands.push(band({
        length: third,
        width: HALF_WIDTH,
        grade: leg.grade ?? 0,
        ...shape,
        ceiling: shape.ceiling + 1.7,
        room: shape.room + 0.16,
      }))
      bands.push(band({ length: leg.length - third * 2, width: HALF_WIDTH, grade: leg.grade ?? 0, ...shape }))
      continue
    }

    bands.push(
      ...cornerBands(
        leg,
        band,
        () => ({ width: HALF_WIDTH, ...vault('corner', leg.deg) }),
        leg.grade ?? 0,
      ),
    )
  }

  /*
    And the arrival, which is the Rootway's ending because it is the Rootway's
    cave: a throat, then a hall with the finish standing in the mouth of it,
    then the back wall the far fire is against. See the note in `rootwayBands`.

    These come *after* the 5,650 m, so the course is the course and the room you
    stop in is not part of it.
  */
  /*
    A hundred and ten metres of it, which is not a round number by accident:
    the finish is placed `COAST` back from the end of the road, so the tail has
    to be exactly a coast long for the line to land on 5,650 m. See the check.
  */
  bands.push(band({ length: 20, width: 4.8, ceiling: 5.4, room: 0.2, curv: 0, wet: 0.25 }))
  bands.push(band({ length: 76, width: 7.6, ceiling: 13, room: 1, curv: 0 }))
  bands.push(band({ length: 14, width: 5.2, ceiling: 8, room: 0.45, curv: 0 }))

  return bands
}

/**
 * Where the timed course begins, in metres along the sampled road.
 *
 * The eighty-two metres of Hollow in front of it are the room you launch out
 * of, and they are deliberately not part of the 5,650: every distance the
 * blueprint gives is measured from the line, so the line has to be somewhere
 * the arithmetic can start.
 */
export const SWITCHBACK_START = 82

function rootwayBands(seed: number): Band[] {
  const rng = random(seed ^ 0x51f2a3)
  const bands: Band[] = []

  // Out of the fire and straight into the rock: the first fifty metres are the
  // Hollow itself, so the road you leave on is the room you were sitting in.
  bands.push(band({ length: 26, width: 7.2, ceiling: 11, room: 1, curv: 0 }))
  bands.push(band({ length: 22, width: 5, ceiling: 7, room: 0.5, curv: 0 }))
  bands.push(band({ length: 34, width: 3.6, ceiling: 3.8, room: 0, curv: 0.004, wet: 0.3 }))

  const history: string[] = []
  let sinceChamber = 3
  let dir = rng() < 0.5 ? -1 : 1
  let length = bands.reduce((sum, b) => sum + b.length, 0)

  /* The Rootwake mouth goes in once, early enough to reach within thirty
     dealt piece so the procedural road is never cut in half around it. */
  const splitAfter = 480
  let laid = false
  dealtMouth = null

  while (length < TARGET - 120) {
    if (!laid && length >= splitAfter) {
      laid = true
      const made = splitBands()
      const from = length
      bands.push(...made)
      length += made.reduce((sum, b) => sum + b.length, 0)
      dealtMouth = from + 34
      // The cavern is a room, and the grammar's "do not follow a room with a
      // room" rule applies to this one too.
      history.push('chamber')
      sinceChamber = 0
      continue
    }

    const entry = choose(rng, history, sinceChamber)
    // Alternate handedness most of the time. Always alternating reads as a
    // slalom; never alternating reads as a spiral.
    if (rng() < 0.74) dir = -dir
    const made = entry.make(rng, dir)
    bands.push(...made)
    length += made.reduce((sum, b) => sum + b.length, 0)
    history.push(entry.name)
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
 * Keeping these here means an arch, a braking pearl and the corner it warns
 * about can never quietly drift apart during another course edit.
 */
export const MOONBREAK = {
  arches: [68, 420, 658, 904, 2010, 2290, 2580, 3040, 3256],
  orchard: { from: 285, to: 470 },
  hard: { approach: 658, apex: 779, exit: 904 },
  /**
   * The Drowned Mile: where the causeway stops going over the water and goes
   * under it.
   *
   * -------------------------------------------------------------------------
   * Every one of these is used by three separate things that have to agree —
   * the road's own grade, the glass tube and its portals in `Moonbreak`, and
   * the light, which is driven off the car's depth in `Race`. A tube whose
   * mouth sits forty metres from where the road actually goes under is a car
   * driving through open air inside a lit tunnel, and there is no number
   * anywhere that would show it.
   *
   * `under` is the waterline crossing in both directions, worked out from the
   * grades below rather than guessed: the deck is at zero at `from`, tips over
   * a lip, and passes the surface at -1.08 about a hundred and ten metres in.
   */
  deep: {
    from: 904,
    to: 1958,
    /** Where the deck passes the waterline, going down and coming back up. */
    under: { in: 1016, out: 1940 },
    /** The flat bottom of it, and how far down that is. */
    floor: { from: 1234, to: 1732, y: -18.6 },
  },
  mirror: { from: 1234, to: 1560 },
  reeds: { from: 1958, to: 2290 },
  stair: { from: 2290, to: 2580 },
  veryHard: { approach: 2580, apex: 2887, exit: 3040 },
} as const

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
export function sunkAt(track: Track, s: number): number {
  if (track.stage !== 'moonbreak') return 0
  const i = Math.max(0, Math.min(track.y.length - 1, Math.round(s / STEP)))
  return Math.max(0, Math.min(1, (WATER_Y - track.y[i]) / 8))
}

function moonbreakBands(): Band[] {
  const open = (shape: Partial<Band> & { length: number }) =>
    band({ width: 5.9, ceiling: 18, room: 0.82, wet: 0.38, ...shape })

  return [
    // The moonwell terrace: enough road to see sky, water and the first gate
    // before the car is asked to turn.
    open({ length: 62, width: 7.2, ceiling: 24, room: 1, curv: 0 }),
    open({ length: 34, width: 6.4, ceiling: 21, room: 0.9, curv: -0.002 }),

    // Windward sweep. Fast enough to take flat once it has been learned.
    open({ length: 30, curv: -0.0035 }),
    open({ length: 86, curv: -0.0105, width: 6.1 }),
    open({ length: 30, curv: -0.003 }),
    open({ length: 78, curv: 0.001, width: 5.7, wet: 0.28 }),

    // The drowned orchard: a deliberate left-right rhythm between trunks.
    open({ length: 42, curv: 0.021, width: 5.7, room: 0.72, wet: 0.56 }),
    open({ length: 16, curv: 0, width: 5.2, room: 0.62, wet: 0.68 }),
    open({ length: 42, curv: -0.021, width: 5.7, room: 0.72, wet: 0.56 }),

    // Up through the first broken arch, then light over the crest.
    open({ length: 56, curv: -0.004, grade: 0.052, width: 5.8 }),
    open({ length: 30, curv: 0.003, grade: 0, width: 5.1, room: 0.55 }),
    open({ length: 56, curv: 0.006, grade: -0.052, width: 5.6 }),

    // Glasswater bridge. Narrow, straight, and visibly exposed on both sides.
    open({ length: 96, curv: 0, width: 4.65, room: 0.34, wet: 0.82, ceiling: 28 }),

    // Tidecut — the hard corner. Its long, widening approach asks for one
    // proper brake, then gives the driver enough road to choose a late apex.
    // At about 120 degrees it is serious without stealing the Moonhook's role.
    open({ length: 46, curv: 0, width: 5.8, wet: 0.3 }),
    open({ length: 30, curv: 0.004, width: 6.2 }),
    open({ length: 20, curv: 0.012, width: 6.8, room: 1 }),
    open({ length: 50, curv: 0.03, width: 7.25, room: 1, wet: 0.42 }),
    open({ length: 20, curv: 0.014, width: 6.8, room: 1 }),
    open({ length: 18, curv: 0.004, width: 6.2 }),
    open({ length: 62, curv: 0, width: 5.9, wet: 0.24 }),

    /*
      ======================================================================
      THE DROWNED MILE
      ======================================================================

      A kilometre of causeway that goes *under* the water instead of over it,
      and the one place on either road where the sky is not the ceiling.

      It replaces the Mirror Flats and the Falling Garden and it deliberately
      keeps their driving: the long fast straight, the pair of opposing
      sweeps, the changes of weight. That is not laziness — those bands were
      already the right shapes in the right order, and the reason this is a
      dive rather than a new sequence of corners is that **what changes here
      is where you are, not what you are doing**. A set piece that also asks
      you to learn six new corners is two things at once, and the driver ends
      up looking at the road instead of at the water.

      The vertical profile is the whole design, and it is written as five acts:

        the approach   level and wide, with the mouth visible a long way off,
                       so going under is something you watch arrive
        the lip        a gentle tip-in — the horizon drops out of the frame
                       before the water closes over, which is what sells it
        the dive       a hundred and thirty metres at ten per cent, straight,
                       so it is fast and reads as *falling* rather than as a
                       corner that happens to be descending
        the deep       level, the fast bands, nineteen metres down
        the climb      the mirror of the dive, ending level at the old height

      Nineteen metres down is chosen, not arbitrary: enough water overhead to
      be properly dark and to hold something large moving in it, shallow
      enough that the surface is still a lit ceiling with the moon in it.
      Past about twenty-five the surface stops reading at all and this becomes
      a cave, which is the other road's job and it does it better.

      The grades are steep by this game's standards — everything else on the
      Moonbreak is inside five per cent — and cost about a metre a second
      squared each way, which the car has in hand.
    */

    // The approach. Wide and level, and the last of the open sky.
    open({ length: 90, curv: 0, width: 6.2, room: 0.6, wet: 0.62, ceiling: 30 }),
    // The lip.
    open({ length: 55, curv: 0, width: 5.9, room: 0.5, grade: -0.05, wet: 0.7 }),
    // The dive. Straight on purpose — a corner here would be read as a corner.
    open({ length: 130, curv: 0, width: 5.6, room: 0.42, grade: -0.105, wet: 0.24 }),
    // Levelling out on the bottom.
    open({ length: 55, curv: -0.002, width: 5.6, room: 0.46, grade: -0.04, wet: 0.18 }),

    // The long deep straight — the Mirror Flats' speed, with a roof of water.
    open({ length: 130, curv: 0, width: 5.5, room: 0.48, wet: 0.16, ceiling: 30 }),
    // The two opposing sweeps, kept.
    open({ length: 88, curv: -0.006, width: 5.9, room: 0.66, wet: 0.16 }),
    open({ length: 88, curv: 0.006, width: 5.9, room: 0.66, wet: 0.16 }),
    open({ length: 84, curv: 0, width: 5.35, room: 0.42, wet: 0.16, ceiling: 30 }),

    // The deep garden: the Falling Garden's changes of weight, at the bottom.
    open({ length: 62, curv: -0.014, width: 5.8, room: 0.78, wet: 0.2 }),
    open({ length: 46, curv: 0.016, width: 5.9, room: 0.8, wet: 0.2 }),

    // And back up, ending exactly level with where it went down.
    open({ length: 56, curv: -0.004, width: 5.7, room: 0.6, grade: 0.045, wet: 0.2 }),
    open({ length: 130, curv: 0, width: 5.7, room: 0.5, grade: 0.105, wet: 0.3 }),
    open({ length: 40, curv: 0, width: 6, room: 0.62, grade: 0.061, wet: 0.5 }),

    // Reedwater — a lower, quieter rhythm. The two bends are deliberately
    // medium-speed: this is the composure test between the two braking tests.
    open({ length: 110, curv: 0, width: 5.1, room: 0.4, wet: 0.9 }),
    open({ length: 54, curv: 0.012, width: 5.75, room: 0.7, wet: 0.72 }),
    open({ length: 24, curv: 0, width: 5.25, room: 0.5, wet: 0.82 }),
    open({ length: 54, curv: -0.013, width: 5.8, room: 0.72, wet: 0.74 }),
    open({ length: 90, curv: 0, width: 5.25, room: 0.44, wet: 0.84 }),

    // The Sky Stair climbs out of the reeds, crests between two broken ribs,
    // and drops the moon into view above the longest braking approach.
    open({ length: 92, curv: 0.006, grade: 0.045, width: 5.8, room: 0.72, wet: 0.3 }),
    open({ length: 54, curv: -0.004, grade: 0.02, width: 5.5, room: 0.58 }),
    open({ length: 78, curv: -0.009, grade: -0.052, width: 5.9, room: 0.76, wet: 0.38 }),
    open({ length: 66, curv: 0.003, grade: 0, width: 5.6, room: 0.62 }),

    // The Moonhook — the one very hard corner. The road opens before turn-in,
    // gives 216 metres to get the car settled, then turns almost 180 degrees.
    // It is wide and clearly marked, but it cannot be taken by lifting alone.
    open({ length: 216, curv: 0, width: 5.7, room: 0.64, wet: 0.2, ceiling: 30 }),
    open({ length: 40, curv: 0.004, width: 6.3, room: 0.9 }),
    open({ length: 22, curv: 0.012, width: 7, room: 1 }),
    open({ length: 58, curv: 0.038, width: 8.1, room: 1, wet: 0.36 }),
    open({ length: 22, curv: 0.015, width: 7.3, room: 1 }),
    open({ length: 40, curv: 0.004, width: 6.5, room: 0.95 }),
    open({ length: 62, curv: 0, width: 5.9, room: 0.7 }),

    // Homeward gates: an easy left-right release after the hairpin, then a
    // broad moonwell terrace that lets the finish breathe instead of arriving
    // immediately after the hardest thing on the road.
    open({ length: 88, curv: 0, width: 5.8, wet: 0.24 }),
    open({ length: 56, curv: -0.012, width: 6, room: 0.78 }),
    open({ length: 18, curv: 0, width: 5.5, room: 0.58 }),
    open({ length: 54, curv: 0.012, width: 6, room: 0.78 }),
    open({ length: 30, curv: 0, width: 5.6 }),
    open({ length: 112, curv: 0, width: 7.8, room: 1, ceiling: 30, wet: 0.5 }),
    open({ length: 26, curv: 0, width: 6.2, room: 0.75, ceiling: 22 }),
  ]
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
export const CLOUD_BASE = 26
export const CLOUD_TOP = 66

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
  const outOf = Math.max(0, Math.min(1, (y - (CLOUD_TOP - band * 0.3)) / (band * 0.3)))
  return {
    inCloud: Math.max(0, into - outOf),
    above: Math.max(0, Math.min(1, (y - CLOUD_TOP) / 14)),
  }
}

export const STORMCROWN = {
  rainwood: { from: 0, to: 500 },
  climb: { from: 500, to: 1030 },
  galeBend: { approach: 1030, apex: 1280, exit: 1386 },
  cloudShelf: { from: 1386, to: 1936 },
  thunderStair: {
    approach: 1936,
    first: 2116,
    second: 2375,
    third: 2633,
    exit: 2903,
  },
  eye: { from: 2903, to: 3483 },
  stormfall: { from: 3483, to: 4078 },
  lastRun: { from: 4078, to: 4792 },
  lightningRods: [492, 1018, 1390, 1930, 2098, 2320, 2580, 2895, 3290, 3480, 4074, 4668],
  waterfalls: [3595, 3812, 4028],
} as const

/**
 * The Stormcrown is one authored climb rather than a bag of interchangeable
 * pieces. It is deliberately the long road: 4.79 km including the quiet
 * roll-in, with its severity concentrated into landmarks a driver can learn.
 */
function stormcrownBands(): Band[] {
  const high = (shape: Partial<Band> & { length: number }) =>
    band({ width: 5.45, ceiling: 34, room: 0.72, wet: 0.72, ...shape })

  return [
    // Stormfire terrace and Rainwood: quick, legible esses among close cedars.
    high({ length: 80, width: 7.4, room: 1, wet: 0.5 }),
    high({ length: 42, width: 6.3, curv: -0.003 }),
    high({ length: 90, width: 5.7, curv: -0.010 }),
    high({ length: 26, width: 5.25, curv: 0.002, wet: 0.9 }),
    high({ length: 80, width: 5.7, curv: 0.014, wet: 0.82 }),
    high({ length: 24, width: 5.1, curv: 0 }),
    high({ length: 88, width: 5.65, curv: -0.013, wet: 0.86 }),
    high({ length: 70, width: 5.35, curv: 0.003 }),

    // The long cedar ascent. Its steady grade makes the summit feel earned.
    high({ length: 80, grade: 0.055, curv: 0.003, width: 5.5 }),
    high({ length: 70, grade: 0.07, curv: 0.011, width: 5.8 }),
    high({ length: 30, grade: 0.045, curv: 0, width: 5.25 }),
    high({ length: 80, grade: 0.075, curv: -0.013, width: 5.9 }),
    high({ length: 30, grade: 0.05, curv: 0, width: 5.2 }),
    high({ length: 95, grade: 0.085, curv: 0.002, width: 5.25 }),
    high({ length: 60, grade: 0.065, curv: 0.014, width: 5.85 }),
    high({ length: 85, grade: 0.07, curv: 0, width: 5.35 }),

    // Gale Bend: the first proper brake, a broad 120-degree mountain corner.
    high({ length: 160, grade: 0.025, curv: 0, width: 5.55, wet: 0.56 }),
    high({ length: 40, grade: 0.015, curv: -0.004, width: 6.1 }),
    high({ length: 20, curv: -0.013, width: 6.8, room: 0.95 }),
    high({ length: 62, curv: -0.032, width: 7.45, room: 1, wet: 0.7 }),
    high({ length: 24, curv: -0.014, width: 6.85, room: 0.95 }),
    high({ length: 50, curv: -0.003, width: 6.1, room: 0.82 }),

    // Cloud Shelf: fast opposing sweeps and the first exposed narrow ribbon.
    high({ length: 120, grade: 0.018, curv: 0, width: 5.6, wet: 0.48 }),
    high({ length: 105, grade: 0.02, curv: 0.008, width: 5.8, wet: 0.52 }),
    high({ length: 80, grade: 0.012, curv: 0, width: 5.25 }),
    high({ length: 105, grade: 0.018, curv: -0.009, width: 5.75, wet: 0.58 }),
    high({ length: 140, grade: 0.024, curv: 0.001, width: 4.55, room: 0.3, wet: 0.78 }),

    // A long sightline gives the Thunder Stair away before it asks anything.
    high({ length: 180, grade: 0.035, curv: 0, width: 5.4, wet: 0.46 }),

    // Thunder Stair I. Each landing changes handedness and continues upward.
    high({ length: 30, grade: 0.025, curv: 0.005, width: 6.1 }),
    high({ length: 18, grade: 0.015, curv: 0.015, width: 7 }),
    high({ length: 58, grade: 0.012, curv: 0.039, width: 8.15, room: 1, wet: 0.63 }),
    high({ length: 18, grade: 0.025, curv: 0.014, width: 7 }),
    high({ length: 45, grade: 0.055, curv: 0.003, width: 5.8 }),
    high({ length: 90, grade: 0.065, curv: -0.002, width: 5.15, wet: 0.78 }),

    // Thunder Stair II, tighter on entry and wet at the apex.
    high({ length: 30, grade: 0.03, curv: -0.006, width: 6.15 }),
    high({ length: 18, grade: 0.015, curv: -0.016, width: 7 }),
    high({ length: 58, grade: 0.012, curv: -0.041, width: 8.25, room: 1, wet: 0.82 }),
    high({ length: 20, grade: 0.03, curv: -0.015, width: 7 }),
    high({ length: 52, grade: 0.06, curv: -0.003, width: 5.65 }),
    high({ length: 80, grade: 0.07, curv: 0.002, width: 5.05, wet: 0.75 }),

    // Thunder Stair III: the very hard crown corner, nearly a half-turn.
    high({ length: 32, grade: 0.025, curv: 0.006, width: 6.2 }),
    high({ length: 20, grade: 0.012, curv: 0.018, width: 7.2 }),
    high({ length: 62, grade: 0.008, curv: 0.043, width: 8.45, room: 1, wet: 0.72 }),
    high({ length: 20, grade: 0.02, curv: 0.016, width: 7.2 }),
    high({ length: 46, grade: 0.045, curv: 0.003, width: 5.8 }),
    high({ length: 90, grade: 0.055, curv: 0, width: 5.45, wet: 0.54 }),

    // The eye of the storm: quiet, high and fast after the concentration test.
    high({ length: 180, grade: 0.012, curv: 0, width: 5.2, room: 0.45, wet: 0.36 }),
    high({ length: 120, grade: 0, curv: -0.007, width: 5.7, wet: 0.3 }),
    high({ length: 120, grade: -0.008, curv: 0.008, width: 5.7, wet: 0.4 }),
    high({ length: 160, grade: -0.018, curv: 0, width: 4.45, room: 0.24, wet: 0.68 }),

    // Stormfall: the elevation is paid back through spray and long braking.
    high({ length: 100, grade: -0.075, curv: 0.002, width: 5.25, wet: 0.88 }),
    high({ length: 110, grade: -0.085, curv: -0.014, width: 5.75, wet: 0.92 }),
    high({ length: 70, grade: -0.065, curv: 0, width: 5.05, wet: 0.95 }),
    high({ length: 105, grade: -0.09, curv: 0.017, width: 5.9, wet: 0.96 }),
    high({ length: 90, grade: -0.075, curv: -0.004, width: 5.1, wet: 0.9 }),
    high({ length: 120, grade: -0.085, curv: -0.012, width: 5.75, wet: 0.88 }),

    // The lower mountain: one sharp chicane, then space to use everything.
    high({ length: 60, grade: -0.035, curv: 0.023, width: 5.9, wet: 0.82 }),
    high({ length: 24, grade: -0.02, curv: 0, width: 5.05, wet: 0.86 }),
    high({ length: 60, grade: -0.035, curv: -0.023, width: 5.9, wet: 0.82 }),
    high({ length: 180, grade: -0.018, curv: 0, width: 5.2, wet: 0.64 }),
    high({ length: 120, grade: -0.012, curv: 0.011, width: 5.85, wet: 0.58 }),
    high({ length: 160, grade: 0, curv: 0, width: 7.5, room: 1, wet: 0.5 }),
    high({ length: 110, grade: 0, curv: 0, width: 7.8, room: 1, wet: 0.46 }),
  ]
}

export function makeTrack(seed: number, stage: StageId = 'rootway'): Track {
  const bands = stage === 'moonbreak'
    ? moonbreakBands()
    : stage === 'stormcrown'
      ? stormcrownBands()
      : stage === 'rootway-test'
        ? switchbackBands()
        : rootwayBands(seed)
  const total = bands.reduce((sum, b) => sum + b.length, 0)
  const count = Math.floor(total / STEP) + 1

  const rawCurv = new Float32Array(count)
  const rawWidth = new Float32Array(count)
  const rawCeiling = new Float32Array(count)
  const rawRoom = new Float32Array(count)
  const rawWet = new Float32Array(count)
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
    rawGrade[cursor] = 0
  }

  const curv = smooth(rawCurv, 11)
  const width = smooth(rawWidth, 9)
  const ceiling = smooth(rawCeiling, 9)
  const room = smooth(rawRoom, 9)
  const wet = smooth(rawWet, 7)
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
    bank[i] = Math.max(-0.2, Math.min(0.2, -curv[i] * 5.2))

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
    /*
      The Switchback launches from its own line.

      Every distance in its blueprint is measured from there, so the car has to
      begin there — with the eighty-two metres of Hollow behind it rather than
      inside the course, where the road would be the wrong width. The Rootway
      keeps the ordinary eighteen; see `start` on `Track`.
    */
    start: stage === 'rootway-test' ? SWITCHBACK_START : START,
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

  if (stage === 'rootway' && dealtMouth !== null) {
    track.split = makeRootSplit(track, dealtMouth)
  }

  /*
    The Switchback's cut is a corner cut, not a hidden parallel road.

    Rootwake is nine hundred metres of separate tunnel with its own character;
    this is three hundred and ten metres straight across the outside of Turn 4.
    Same builder, different shape — see the options on `makeRootSplit`.
  */
  if (stage === 'rootway-test') {
    track.split = makeRootSplit(track, SWITCHBACK_START + CUT.entry, {
      until: SWITCHBACK_START + CUT.entry + CUT.mainSpan,
      cutLength: CUT.length,
      halfWidth: CUT_HALF_WIDTH,
      wild: 0,
      dip: 7,
      align: 0.05,
      entryRadius: CUT.entryRadius,
    })
  }

  if (stage === 'moonbreak') dressMoonbreak(track, random(seed ^ 0x6d2b79))
  else if (stage === 'stormcrown') dressStormcrown(track, random(seed ^ 0x7a36c1))
  else dressTrack(track, random(seed ^ 0x9c31d7))
  // The cave first, then the course's own signs on top of it.
  if (stage === 'rootway-test') markSwitchback(track)
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
/**
 * The Switchback's own signs, laid over the cave the dresser already built.
 *
 * ===========================================================================
 * **A learnable road needs somewhere to learn it from.** The Rootway is dealt
 * fresh, so its lanterns are ambience — light enough to see the next twenty
 * metres by, and no more. This road is the same road every time, which makes
 * distance markers worth something: brake at the second stone and you are
 * right, every single lap, and finding that out is most of the pleasure.
 *
 * Three stones at 150, 100 and 50 m before Turn 2, Turn 3 and Turn 7 — the two
 * hairpins and the corner that tightens, exactly as the blueprint asks. They
 * are paired across the road and level with each other, because a pair at the
 * same height is the one shape this cave uses for "this is information" and
 * everything else in it is deliberately uneven.
 *
 * They count *down* in light: the far one is dim and the last one is bright, so
 * the corner is arriving even if you cannot yet see it.
 *
 * The warning before the cut is a single stone on the right, where the mouth
 * is. One, not three, and off to one side rather than paired: it is not telling
 * you to brake, it is telling you there is a decision a hundred metres away,
 * and it must not be mistaken for the corner markers it stands among — the
 * mouth is inside Turn 3's braking zone, which is the whole difficulty of it.
 * ===========================================================================
 */
function markSwitchback(track: Track) {
  const at = (s: number) => Math.max(0, Math.min(track.length - 1, s))
  const put = (s: number, n: number, warm: number, size: number) => {
    const road = roadAt(track, at(s))
    track.lanterns.push({
      s: at(s),
      n,
      y: road.y + 1.15,
      size,
      warm,
      mark: true,
    })
  }

  /*
    Where each corner starts turning, taken from the table rather than from the
    road, so a marker cannot drift away from the corner it belongs to. Turn 2,
    Turn 3 and Turn 7 — the blueprint names those three.
  */
  const named = new Map(marks().map((m) => [m.leg.name, m]))
  for (const name of ['Turn 2', 'Turn 3', 'Turn 7']) {
    const leg = named.get(name)
    if (!leg || leg.leg.kind !== 'corner') continue
    /*
      Measured from where the road *begins to turn*, not from the start of the
      section — the section carries its lead-in straight, and a stone that says
      "150" while there is still ninety metres of straight left is a stone that
      teaches the wrong thing.
    */
    const turnsAt =
      SWITCHBACK_START + leg.from + (leg.to - leg.from - legArc(leg.leg)) * (leg.leg.lead ?? 0.5)
    const edge = 5.5 + 1.1
    for (const [away, glow, size] of [[150, 0.35, 0.62], [100, 0.62, 0.74], [50, 1, 0.92]] as const) {
      put(turnsAt - away, -edge, glow, size)
      put(turnsAt - away, edge, glow, size)
    }
  }

  // And the one stone that is not about braking.
  if (track.split) {
    put(track.split.from - CUT.warnAt, 5.5 + 1.4, 0.18, 1.05)
  }
}

/** How much of a corner's section it actually spends turning. */
function legArc(corner: { deg: number; radius: number; section: number; ease: number }): number {
  const turn = (Math.abs(corner.deg) * Math.PI) / 180
  const arcNeeded = turn * corner.radius
  const spare = corner.section - arcNeeded
  const ease = Math.min(arcNeeded * 0.92, spare * 0.95) * corner.ease
  return arcNeeded - ease + ease * 2
}

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

  // Water off the seeps, pooling where the stone is wet.
  for (let s = 40; s < track.length - 40; s += 9 + rng() * 22) {
    const i = Math.min(count - 1, Math.round(s / STEP))
    if (track.wet[i] < 0.3) continue
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
  line: number
  /** World metres represented by one metre of shared race progress. */
  metric: number
}

export function emptyRoad(): RoadAt {
  return {
    x: 0, y: 0, z: 0, heading: 0, curv: 0, width: 4.6,
    ceiling: 5.6, room: 0.3, wet: 0, bank: 0, grade: 0, line: 0, metric: 1,
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
/**
 * What kind of second road this is.
 *
 * ---------------------------------------------------------------------------
 * Two quite different things share this builder, and the options are how they
 * differ rather than a fork in the code.
 *
 * **Rootwake**, on the Rootway, is nine hundred metres of separate tunnel with
 * its own hard S and its own blind reverse — a place, which you go and learn.
 * Everything defaults to it, so passing nothing builds exactly what has always
 * been built.
 *
 * **The Switchback's cut** is three hundred and ten metres straight across the
 * outside of a corner. There is nothing to learn down it except whether you got
 * into it cleanly, which is the whole of its difficulty: `wild` is zero, so it
 * has no character of its own beyond the line it takes, and `entryRadius` is
 * what makes the mouth a real brake rather than a doorway you drift through.
 * ---------------------------------------------------------------------------
 */
interface SplitShape {
  /** Where it comes back. Defaults to Rootwake's own long reach. */
  until?: number
  /** How long the hidden road itself should measure. */
  cutLength?: number
  /** Half the driveable stone down it. */
  halfWidth?: number
  /** 0 for a plain cut; 1 for Rootwake's authored corners. */
  wild?: number
  /** How far the road drops below the one it left, at the middle. */
  dip?: number
  /** Radius of the turn into the mouth, metres. Smaller means brake harder. */
  entryRadius?: number
  /**
   * How hard the two ends are made to leave and arrive along the road they
   * join, 0..1.
   *
   * Rootwake wants this at one: it is a tunnel branching out of a chamber and
   * it should look like it grew there. A corner cut wants it low — it is
   * supposed to leave at an angle, that angle is the brake, and forcing it to
   * peel away tangentially is what stops a short cut from ever being short.
   */
  align?: number
}

function makeRootSplit(track: Track, from: number, shape: SplitShape = {}): RootSplit {
  const dip = shape.dip ?? 34
  const wild = shape.wild ?? 1
  const deckWidth = shape.halfWidth ?? 3.7
  const deckCeiling = 3.62
  const deckRoom = 0.035
  const deckWet = 0.45
  const portalN = 2.3
  const commitAfter = 34
  const separateAfter = 58
  const to = shape.until ?? Math.max(from + 900, track.finishAt - 285)
  const span = to - from
  const count = Math.floor(span / STEP) + 1
  const x = new Float32Array(count)
  const y = new Float32Array(count)
  const z = new Float32Array(count)
  const heading = new Float32Array(count)
  const curv = new Float32Array(count)
  const width = new Float32Array(count)
  const ceiling = new Float32Array(count)
  const room = new Float32Array(count)
  const wet = new Float32Array(count)
  const grade = new Float32Array(count)
  const bank = new Float32Array(count)
  const metric = new Float32Array(count)
  const start = roadAt(track, from)
  const end = roadAt(track, to)
  const chordX = end.x - start.x
  const chordZ = end.z - start.z
  const chord = Math.max(1, Math.hypot(chordX, chordZ))
  const sideX = -chordZ / chord
  const sideZ = chordX / chord
  // Hermite derivatives are expressed per normalized route, so a value of
  // `span` means one world metre per shared progress metre at both portals.
  // That keeps entry/rejoin speed continuous instead of catapulting the car
  // through a compressed endpoint.
  const throat = span * (shape.align ?? 1)
  const startGrade = Math.max(-0.12, Math.min(0.12, start.grade))
  const endGrade = Math.max(-0.12, Math.min(0.12, end.grade))
  const separateAt = from + Math.max(commitAfter + 8, separateAfter)
  const entryBegins = 12 / span
  const entrySeparated = (separateAt - from) / span
  const entrySettled = Math.min(0.19, entrySeparated + 96 / span)
  const startRightX = -Math.cos(start.heading)
  const startRightZ = Math.sin(start.heading)

  const smoothstep = (value: number) => {
    const held = clamp01(value)
    return held * held * (3 - held * 2)
  }

  const point = (t: number, amplitude: number) => {
    const startDX = Math.sin(start.heading) * throat
    const startDZ = Math.cos(start.heading) * throat
    const endDX = Math.sin(end.heading) * throat
    const endDZ = Math.cos(end.heading) * throat
    // These basis functions have a derivative of one at only their own end.
    // Unlike a whole-span Hermite bend, they align each short portal throat
    // without letting a random endpoint heading distort the road's middle.
    const startAlign = t * (1 - t) ** 4
    const endAlign = -(1 - t) * t ** 4
    const fade = Math.sin(Math.PI * t) ** 2
    // One broad hard S, followed by a tighter blind reverse. Their unequal
    // weights stop the hidden road from feeling like a procedural slalom.
    const hardGate = wild * -18 * Math.exp(-(((t - 0.37) / 0.075) ** 2))
    const blindReverse = wild * 30 * Math.exp(-(((t - 0.69) / 0.055) ** 2))
    const transverse = amplitude * fade * (
      0.7 * Math.sin(Math.PI * 2 * t) +
      0.24 * Math.sin(Math.PI * 4 * t) -
      0.1 * Math.sin(Math.PI * 6 * t)
    ) + hardGate + blindReverse
    const depth = fade * (-dip - (dip / 34) * 7 * Math.sin(Math.PI * 3 * t) ** 2)
    /*
      A readable fork, rather than two tunnels born in the same place. This is
      deliberately a small correction to the proven hidden route, not a new
      entrance curve: it gives the right-hand throat room to read, then eases
      away before the authored hard and very-hard corners.
    */
    const peelIn = smoothstep((t - entryBegins) / (entrySeparated - entryBegins))
    const peelOut = 1 - smoothstep((t - entrySeparated) / (entrySettled - entrySeparated))
    /*
      How hard the mouth turns away from the road it is leaving.

      This is what a stated entry radius actually becomes: the road is pushed
      sideways over the length of the peel, and a sharper push is a tighter
      turn in. Solved from the radius rather than tuned by eye — a lateral
      shove of `d` over a run of `L` bends the road by roughly `8d/L²`, so
      `d = L²/(8R)` puts the tightest part of the mouth at `R`. Measured back
      by `npm run switchback`, because "roughly" is not a thing to leave
      unchecked in the one corner that decides whether the cut is worth taking.
    */
    const peelRun = Math.max(1, (entrySettled - entryBegins) * span)
    const peelBy = shape.entryRadius
      ? Math.min(26, (peelRun * peelRun) / (8 * shape.entryRadius))
      : 11
    const entryPeel = peelBy * peelIn * peelOut
    return {
      x: start.x + chordX * t + (startDX - chordX) * startAlign + (endDX - chordX) * endAlign + sideX * transverse + startRightX * entryPeel,
      y: start.y + (end.y - start.y) * t +
        (startGrade * throat - (end.y - start.y)) * startAlign +
        (endGrade * throat - (end.y - start.y)) * endAlign + depth,
      z: start.z + chordZ * t + (startDZ - chordZ) * startAlign + (endDZ - chordZ) * endAlign + sideZ * transverse + startRightZ * entryPeel,
    }
  }

  const curveLength = (amplitude: number) => {
    let total = 0
    let previous = point(0, amplitude)
    for (let i = 1; i < count; i++) {
      const next = point(i / (count - 1), amplitude)
      total += Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z)
      previous = next
    }
    return total
  }

  // The road is physically shorter, but not by so much that simply finding it
  // wins. Its hard S and blind reverse still have to be learned to earn the
  // intended ten seconds.
  const targetLength = shape.cutLength ?? Math.max(curveLength(0), span - 330)
  let low = 0
  let high = 220
  while (curveLength(high) < targetLength && high < 900) high *= 1.45
  for (let pass = 0; pass < 22; pass++) {
    const middle = (low + high) * 0.5
    if (curveLength(middle) < targetLength) low = middle
    else high = middle
  }
  const amplitude = (low + high) * 0.5

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const sample = point(t, amplitude)
    x[i] = sample.x
    y[i] = sample.y
    z[i] = sample.z
    // Rootwake is the learned precision road: a narrow deck that leaves room
    // to place the car and none to be loose in.
    width[i] = deckWidth
    ceiling[i] = deckCeiling + Math.sin(t * Math.PI * 7) * (deckCeiling * 0.066)
    room[i] = deckRoom
    wet[i] = deckWet + Math.sin(t * 13.1) * (deckWet * 0.36)
  }

  let previousHeading = 0
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(count - 1, i + 1)
    const dx = x[b] - x[a]
    const dy = y[b] - y[a]
    const dz = z[b] - z[a]
    let angle = Math.atan2(dx, dz)
    if (i > 0) {
      while (angle - previousHeading > Math.PI) angle -= Math.PI * 2
      while (angle - previousHeading < -Math.PI) angle += Math.PI * 2
    }
    heading[i] = angle
    previousHeading = angle
    const ds = Math.max(1, b - a)
    const world = Math.max(0.25, Math.hypot(dx, dy, dz) / ds)
    metric[i] = world
    grade[i] = (dy / ds) / world
  }

  const rawLine = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 2)
    const b = Math.min(count - 1, i + 2)
    const distance = Math.max(0.5, ((metric[a] + metric[b]) * (b - a)) * 0.5)
    curv[i] = -(heading[b] - heading[a]) / distance
    // Keep restrained apex relief through the signature corners without letting
    // them swell back to the width of an ordinary Rootway chamber.
    width[i] += Math.min(0.7, Math.abs(curv[i]) * 19)
    bank[i] = Math.max(-0.16, Math.min(0.16, -curv[i] * 4.4))
    const usable = Math.max(0, width[i] - 1.25)
    // The tunnel is too narrow for the broad road's full edge-to-apex line.
    // A restrained apex still teaches the faster path without putting a
    // correct wheel on the rock when the corner reverses.
    rawLine[i] = Math.sign(curv[i]) * usable * Math.min(0.52, Math.abs(curv[i]) * 25)
  }
  const line = smooth(rawLine, 19, 2)

  let shortcutLength = 0
  for (let i = 1; i < count; i++) {
    shortcutLength += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1], z[i] - z[i - 1])
  }
  const hardest = (fromFraction: number, toFraction: number) => {
    let best = Math.floor(count * fromFraction)
    for (let i = best + 1; i < count * toFraction; i++) {
      if (Math.abs(curv[i]) > Math.abs(curv[best])) best = i
    }
    return from + best * STEP
  }

  return {
    from,
    to,
    shortcut: { from, to },
    // The choice is made while both cars are still on the common, wide floor.
    // The branch only starts pulling hard away after this point.
    commitAt: from + commitAfter,
    separateAt,
    rejoinAt: to - 2,
    portalN,
    mainLength: span,
    shortcutLength,
    hardAt: hardest(0.2, 0.52),
    veryHardAt: hardest(0.52, 0.84),
    x, y, z, heading, curv, width, ceiling, room, wet, grade, bank, line, metric,
  }
}

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
