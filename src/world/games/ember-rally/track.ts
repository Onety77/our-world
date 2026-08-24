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
}

export interface Lantern {
  s: number
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
  grade: Float32Array
  /** Roll of the road surface into the corner, radians. */
  bank: Float32Array
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

/** Roughly how long the whole road should be, metres. */
const TARGET = 1520
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

function bandsFor(seed: number): Band[] {
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

  while (length < TARGET - 120) {
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

export function makeTrack(seed: number, stage: StageId = 'rootway'): Track {
  const bands = bandsFor(seed)
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
    hearths: [
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
  }

  dressTrack(track, random(seed ^ 0x9c31d7))
  return track
}

// ---------------------------------------------------------------------------
// What is on the road, and what is growing through it
// ---------------------------------------------------------------------------

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

    if (sinceLantern >= spacing) {
      sinceLantern = 0
      const outside = turning ? -Math.sign(k) : rng() < 0.5 ? -1 : 1
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
      const side = rng() < 0.5 ? -1 : 1
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
    track.boulders.push({
      s,
      n,
      size: 0.32 + rng() * 0.72,
      seed: Math.floor(rng() * 65536),
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
}

export function emptyRoad(): RoadAt {
  return {
    x: 0, y: 0, z: 0, heading: 0, curv: 0, width: 4.6,
    ceiling: 5.6, room: 0.3, wet: 0, bank: 0, grade: 0, line: 0,
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

  // Headings are integrated and monotonic here, so a plain lerp is safe and
  // there is no wrap to unwind.
  r.heading = lerpAt(track.heading, i, j, mix)
  return r
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
