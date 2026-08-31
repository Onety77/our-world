/**
 * The Switchback Run — the Rootway's road, redrawn.
 *
 * =============================================================================
 * **Same cave, different road.** Nothing about how the Rootway *looks* is
 * touched here: the vault, the roots, the lanterns, the dust underfoot and the
 * two fires all come from the same dresser the Rootway has always used, because
 * this stage falls through to it in `makeTrack`. What is replaced is the shape
 * of the tarmac — every metre of it, authored rather than dealt.
 *
 * The Rootway proper is shuffled from a bag of pieces (see `choose`), and that
 * is right for it: not knowing what is behind the next wall is most of what
 * being underground is for. This road is the opposite claim — that a course you
 * can *learn* is worth more than one you can only discover, once there are two
 * of you racing it. So it is written down, once, here.
 *
 * ---------------------------------------------------------------------------
 * **Two things about the blueprint, stated plainly.**
 *
 * The section lengths sum to exactly 5,650 m, and every corner's arc fits
 * inside its section with room for easements at both ends. Those all hold and
 * are checked by `npm run switchback`.
 *
 * The corner angles do not close a loop. Taking rights as positive they sum to
 * +25°, and any circuit that does not cross itself must sum to ±360°. So this
 * is built as what the racer has always built: a road from one fire to another,
 * 5,650 m long, driven once. Every stated distance, radius and angle is honoured
 * exactly; what is not honoured is the map's implication that the finish meets
 * the start, which the numbers themselves rule out.
 * ---------------------------------------------------------------------------
 */

import type { Band } from './track'

/** Metres. Half of the 11 m road, because a band carries its half-width. */
export const HALF_WIDTH = 5.5
/** Half of the 7 m cut. */
export const CUT_HALF_WIDTH = 3.5

/**
 * One numbered corner.
 *
 * `deg` is the total change in driving direction, right-positive, exactly as
 * the blueprint states it — not a camber and not a road-slope angle. `radius`
 * is the tightest the corner ever gets. `section` is the whole length of road
 * the corner is allotted, easements and run-off included, which is why it is
 * always longer than the bare arc.
 */
export interface Corner {
  name: string
  deg: number
  radius: number
  section: number
  /**
   * How much of the corner's turning is spent easing in and out rather than
   * sitting at `radius`, 0..1 of the theoretical maximum.
   *
   * The one shaping knob, and it is what makes two corners of the same angle
   * feel different. Low is abrupt and constant-radius — you can see the whole
   * thing from the entry. High is long and gradual, and a corner that keeps
   * tightening cannot be taken flat because the grip you needed at the start
   * is not the grip you need at the apex.
   */
  ease: number
  /** How much of the leftover section sits before the corner rather than after. */
  lead?: number
  /** dy/ds through the corner, where it is part of a climb or a descent. */
  grade?: number
}

export type Leg =
  | { kind: 'straight'; name: string; length: number; grade?: number }
  | ({ kind: 'corner' } & Corner)

/**
 * The course, in order, exactly as the blueprint gives it.
 *
 * Read by the road builder and by `npm run switchback`, which measures the road
 * that comes out and compares it against this table. One source, so a corner
 * cannot quietly stop matching the thing that says what it is.
 *
 * Grades are the one addition. The blueprint names a "climbing road" and a
 * "ridge road" without numbers, so the climb is 21 m over section seven and it
 * is given back across the western run and the southern straight — the road
 * ends within a couple of metres of the height it started at, which is what
 * lets the two fires sit on the same floor.
 */
export const SWITCHBACK: readonly Leg[] = [
  { kind: 'straight', name: 'start straight', length: 620 },
  { kind: 'corner', name: 'Turn 1', deg: -70, radius: 85, section: 180, ease: 0.5 },
  { kind: 'straight', name: 'connector', length: 310 },
  /*
    Turn 2 tightens. `ease` is high, so most of the turning happens on the way
    in and the tightest part arrives late — a driver who commits at the entry
    speed the first ten metres suggest is carrying too much by the apex, which
    is the whole brief for this corner.
  */
  { kind: 'corner', name: 'Turn 2', deg: 115, radius: 58, section: 230, ease: 0.82, lead: 0.62 },
  { kind: 'straight', name: 'back straight', length: 740 },
  { kind: 'corner', name: 'Turn 3', deg: -165, radius: 42, section: 260, ease: 0.42, lead: 0.58 },
  { kind: 'straight', name: 'climbing road', length: 390, grade: 0.0538 },
  { kind: 'corner', name: 'Turn 4', deg: 80, radius: 72, section: 190, ease: 0.5, grade: 0.02 },
  { kind: 'straight', name: 'ridge road', length: 410, grade: 0.0098 },
  /*
    Five and six are one shape. The lead on six is small, so the exit of five
    runs almost straight into the entry of six and there is no room to reset the
    car between them — which is what makes where you put it in five decide what
    six gives back.
  */
  { kind: 'corner', name: 'Turn 5', deg: -55, radius: 95, section: 140, ease: 0.55 },
  { kind: 'corner', name: 'Turn 6', deg: 65, radius: 88, section: 140, ease: 0.55, lead: 0.25 },
  { kind: 'straight', name: 'western run', length: 520, grade: -0.03 },
  /*
    Turn 7 is the overtake. Low ease, so it is close to a constant-radius
    hairpin with a long enough entry to get alongside — two lines through it
    genuinely work, and the one that is slower in is quicker out.
  */
  { kind: 'corner', name: 'Turn 7', deg: 150, radius: 46, section: 240, ease: 0.34, lead: 0.66 },
  { kind: 'straight', name: 'southern straight', length: 570, grade: -0.0192 },
  /*
    Turn 8 pays for a clean line. Ease is low and the lead is short, so it opens
    on exit rather than tightening — get it right and the throttle comes back
    early onto the last five hundred metres.
  */
  { kind: 'corner', name: 'Turn 8', deg: -95, radius: 70, section: 210, ease: 0.36, lead: 0.35 },
  { kind: 'straight', name: 'final straight', length: 500 },
]

/** Where each leg starts and ends, in metres from the line. */
export function marks(): { leg: Leg; from: number; to: number }[] {
  const out: { leg: Leg; from: number; to: number }[] = []
  let at = 0
  for (const leg of SWITCHBACK) {
    const length = leg.kind === 'straight' ? leg.length : leg.section
    out.push({ leg, from: at, to: at + length })
    at += length
  }
  return out
}

export const LAP = marks().reduce((most, m) => Math.max(most, m.to), 0)

// ---------------------------------------------------------------------------
// The cut
// ---------------------------------------------------------------------------

/**
 * The optional shortcut, and the numbers it has to hit.
 *
 * =============================================================================
 * **The blueprint gives the mouth two positions and they are not the same
 * place.** It says the mouth is 2,480 m in, 140 m after Turn 3 stops turning —
 * and it also says the cut is 310 m long, spans 590 m of main road, and saves
 * 280 m. Those cannot both be true, and the reason is geometry rather than
 * arithmetic.
 *
 * At 2,480 m the road ahead is the climbing straight, Turn 4's 80° kink, and
 * the ridge. Measured on the built road, the entry and the rejoin 590 m later
 * are **474 m apart in a straight line** — so no cut between them can be 310 m,
 * and even a perfectly straight one saves 116 m rather than 280. An 80° corner
 * simply does not bend far enough to be worth cutting; you would be taking a
 * risk for three seconds.
 *
 * Forty metres earlier, it works exactly. A mouth at **2,040 m** sends the cut
 * across Turn 3 — the 165° hairpin — where the entry and the rejoin 590 m later
 * are 277 m apart. A 310 m cut fits with room to have a shape, and it saves
 * 590 − 310 = **280 m**: the blueprint's length, its span, its saving, its
 * 5,370 m shortcut lap and its 8.4 seconds, all five exactly as written.
 *
 * So the mouth moved and everything else stayed. It is also the better corner
 * to cut, and it is what the drawn map shows — the cut on the picture crosses a
 * loop of road, which is what a hairpin looks like from above and is not what
 * Turn 4 looks like from anywhere. `npm run switchback` measures all of it.
 * =============================================================================
 *
 * Everything about it is meant to make taking it a decision rather than a
 * discovery: it is four metres narrower, it needs a real brake to enter at a
 * 28 m radius, and a bad entry gives back most of what a good one saves. The
 * mouth arrives inside Turn 3's own braking zone, which is the point — you are
 * choosing while you are already busy.
 */
export const CUT = {
  /**
   * Metres from the line to the mouth.
   *
   * The blueprint says 2,480. See above for why it is here instead, and change
   * this one number back if the smaller saving is preferred to the larger.
   */
  entry: 2040,
  /** What the blueprint asked for, kept so the difference is never lost. */
  askedEntry: 2480,
  /** Main road between the mouth and where the cut comes back. */
  mainSpan: 590,
  /** The cut's own centreline length. */
  length: 310,
  /** Radius of the turn into it, which is what forces the brake. */
  entryRadius: 28,
  /** How far before the mouth the warning stone stands. */
  warnAt: 100,
}

export const CUT_SAVING = CUT.mainSpan - CUT.length
export const CUT_LAP = LAP - CUT_SAVING

/** Seconds saved at a constant speed, which is the only honest way to state it. */
export function savingAt(kmh: number): number {
  return CUT_SAVING / (kmh / 3.6)
}

// ---------------------------------------------------------------------------
// Turning the table into road
// ---------------------------------------------------------------------------

/**
 * A corner, as bands.
 *
 * ---------------------------------------------------------------------------
 * Three parts, and the arithmetic is exact rather than approximate.
 *
 * A ramp whose curvature rises linearly from nothing to `k` over `e` metres
 * turns the road by `k·e/2`. Two of those and an arc of `La` at `k` therefore
 * turn it by `k·(e + La)` — so setting `e + La` to `θ·R` makes the corner turn
 * by exactly `θ`, whatever share of it is spent easing. Whatever is left of the
 * section after that is straight, and sits either side in the ratio `lead`.
 *
 * Which means `ease` changes only how the corner *feels*, never how far round
 * it goes or how long it is. That is the property that lets the table above be
 * both the specification and the tuning.
 * ---------------------------------------------------------------------------
 */
export function cornerBands(
  corner: Corner,
  band: (b: Partial<Band> & { length: number }) => Band,
  shape: (at: number, length: number) => Partial<Band>,
  grade = 0,
): Band[] {
  const turn = (Math.abs(corner.deg) * Math.PI) / 180
  const k = Math.sign(corner.deg) / corner.radius
  const arcNeeded = turn * corner.radius
  const spare = corner.section - arcNeeded

  // Bounded twice over: an easement may not eat the whole arc, and it may not
  // eat more straight than the section actually has spare.
  const ease = Math.min(arcNeeded * 0.92, spare * 0.95) * corner.ease
  const arc = arcNeeded - ease
  const pad = spare - ease
  const lead = pad * (corner.lead ?? 0.5)
  const tail = pad - lead

  const bands: Band[] = []
  let at = 0
  const push = (length: number, curv: number) => {
    if (length <= 0.01) return
    bands.push(band({ length, curv, grade, ...shape(at + length / 2, corner.section) }))
    at += length
  }

  push(lead, 0)
  // Eight steps is finer than the eleven-metre smoothing pass in `makeTrack`,
  // so the ramp arrives as a curve rather than a staircase.
  const steps = 8
  for (let i = 0; i < steps; i++) push(ease / steps, (k * (i + 0.5)) / steps)
  push(arc, k)
  for (let i = steps - 1; i >= 0; i--) push(ease / steps, (k * (i + 0.5)) / steps)
  push(tail, 0)

  return bands
}
