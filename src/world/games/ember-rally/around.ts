/**
 * What is around the car, once a frame, for the things that have to hear it.
 *
 * ---------------------------------------------------------------------------
 * **Why this exists at all.** The race already knows how tight the rock is,
 * how many roots are over the vault, whether there is standing water under the
 * wheels and how close the nearest lantern is — it has to, it is drawing all
 * of it. But it knows those things as geometry, scattered across four arrays
 * and a shader uniform, and the ear needs them as five numbers between nought
 * and one.
 *
 * **Not React state**, for exactly the reason `depth.ts` sets out at length:
 * these move every frame for the whole length of a run, and a re-render per
 * frame of a scene drawing a kilometre of cave is the one thing that must not
 * happen. One owner writes it, whoever needs it reads it, nothing subscribes.
 *
 * **And it lives in its own file** for the same reason `deep` does. The race
 * draws the Rootway; the Rootway mounts its own ear; the ear needs the road.
 * Put this in either of those two and they import each other in a circle.
 * ---------------------------------------------------------------------------
 *
 * **The field is precomputed.** Working out "how many roots are near the car"
 * by walking a few hundred roots at a hundred and twenty hertz is the sort of
 * thing that costs nothing on the machine it was written on. So the props are
 * splatted into bins once, when the track is built, and the frame does two
 * array reads and a lerp. See `senseAround`.
 */

import type { CarState } from './physics'
import type { Track } from './track'

// ---------------------------------------------------------------------------
// What the ear is told
// ---------------------------------------------------------------------------

/**
 * Something that happened, rather than something that is.
 *
 * A queue rather than a level, because the ear and the race are two different
 * `useFrame` callbacks and their order is decided by mount order — which means
 * a rising edge on a shared number is a sound that plays on some frames and
 * not others, on some machines and not others. Pushed by the race, drained by
 * the ear, and capped so a tab left in the background cannot grow it.
 */
export type RoadEvent =
  | { kind: 'crash'; force: number }
  | { kind: 'splash'; force: number }

/** Past this the queue is dropped rather than played as a machinegun. */
const MOST_EVENTS = 6

export const around = {
  /** Metres along the shared road coordinate. */
  s: 0,
  /** Metres per second. */
  speed: 0,
  /** 0 an open chamber, 1 the rock on the mirrors. */
  tight: 0,
  /** 0..1 — water on the stone here. */
  wet: 0,
  /** 0..1 — off the stone and into the loose. */
  rough: 0,
  /** 0 the ordinary road, 1 well inside the Rootwake. */
  wake: 0,
  /** 0..1 — how much root is coming through the vault near the car. */
  roots: 0,
  /** 0..1 — the nearest lantern, 1 when it is alongside. */
  lamp: 0,
  /** 0..1 — the nearest of the two real fires. */
  fire: 0,
  /** 0..1 — standing water under the wheels. */
  water: 0,
  /** 0..1 — leaning on the rock, right now. */
  scrape: 0,
  /** False while nothing is being driven, so the ear can go quiet. */
  running: false,
  events: [] as RoadEvent[],
}

export function tell(event: RoadEvent): void {
  if (around.events.length >= MOST_EVENTS) return
  around.events.push(event)
}

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

/** Metres per bin. Small enough to pass a lantern, large enough to be cheap. */
const BIN = 6

export interface RoadField {
  roots: Float32Array
  lamp: Float32Array
  fire: Float32Array
  water: Float32Array
}

/**
 * Smear one thing over the bins near it, and let the loudest win.
 *
 * `Math.max` rather than a sum, deliberately. Adding means a stretch of road
 * that happens to have six small roots over it is louder than one with a
 * single enormous one across the whole vault, which is backwards — and worse,
 * it means the level depends on how finely the generator happened to chop
 * things up rather than on what is actually there.
 */
function splat(into: Float32Array, s: number, reach: number, level: number): void {
  const from = Math.max(0, Math.floor((s - reach) / BIN))
  const to = Math.min(into.length - 1, Math.ceil((s + reach) / BIN))
  for (let bin = from; bin <= to; bin++) {
    const away = Math.abs(bin * BIN - s) / reach
    if (away >= 1) continue
    const fall = 1 - away * away
    if (fall * level > into[bin]) into[bin] = fall * level
  }
}

/** Built once per track. See the note at the top about not doing this per frame. */
export function buildField(track: Track): RoadField {
  const bins = Math.ceil(track.length / BIN) + 2
  const field: RoadField = {
    roots: new Float32Array(bins),
    lamp: new Float32Array(bins),
    fire: new Float32Array(bins),
    water: new Float32Array(bins),
  }

  for (const root of track.roots) {
    // A root that only just breaks the vault is a decoration; one that reaches
    // most of the way down is a thing you are driving underneath.
    splat(field.roots, root.s, 9, Math.min(1, root.reach * 0.8 + root.thickness * 1.6))
  }
  for (const lantern of track.lanterns) {
    // Cold fungus does not crackle. Only the warm ones are a fire.
    const heat = lantern.warm * Math.min(1, lantern.size * 1.7)
    if (lantern.fire) splat(field.fire, lantern.s, 26, 1)
    else splat(field.lamp, lantern.s, 11, heat)
  }
  for (const hearth of track.hearths) splat(field.fire, hearth.s, 34, 1)
  for (const puddle of track.puddles) {
    splat(field.water, puddle.s, Math.max(4, puddle.radius * 2.2), 1)
  }

  return field
}

/** One bin, read with a lerp so nothing steps as the car crosses a boundary. */
function sample(values: Float32Array, s: number): number {
  const at = Math.max(0, Math.min(values.length - 1.001, s / BIN))
  const i = Math.floor(at)
  const mix = at - i
  return values[i] * (1 - mix) + values[i + 1] * mix
}

// ---------------------------------------------------------------------------
// Once a frame
// ---------------------------------------------------------------------------

/**
 * How much of the road's width is left once the verge is counted.
 *
 * The same expression the engine voice uses for its wind whistle, kept
 * identical on purpose: the rock has to close in on the ear at the same
 * instant in both, or the tunnel is two different sizes at once.
 */
function tightness(width: number, room: number): number {
  return Math.max(0, Math.min(1, (5.4 - (width + room * 2.6)) / 3.2))
}

export function senseAround(
  track: Track,
  car: CarState,
  field: RoadField,
  running: boolean,
): void {
  around.s = car.s
  around.speed = Math.hypot(car.vs, car.vn)
  around.tight = tightness(car.road.width, car.road.room)
  around.wet = car.road.wet
  around.rough = car.rough ? 1 : 0
  around.running = running
  around.roots = sample(field.roots, car.s)
  around.lamp = sample(field.lamp, car.s)
  around.fire = sample(field.fire, car.s)
  const water = sample(field.water, car.s) * (0.35 + car.road.wet * 0.65)
  around.scrape = car.hitWall

  /*
    Hitting standing water.

    On the rising edge and only above a walking pace, because a puddle you roll
    into is wet and a puddle you arrive at thirty metres a second is an event.
    Detected here rather than in the race for the plain reason that this is the
    only place that already has both the previous value and the current one —
    everywhere else would have to keep a second copy of it to find the edge.
  */
  if (water > 0.34 && around.water <= 0.34 && around.speed > 6) {
    tell({ kind: 'splash', force: Math.min(1, around.speed / 30) })
  }
  around.water = water

  /*
    Inside the hidden tunnel.

    Faded over the fork rather than switched at `car.shortcut`, because the
    Rootwake does not begin at a doorway — the two roads share a floor, then a
    chamber, then separate. The ear should close in over those thirty metres
    the way the stone does, not the instant a boolean flips.
  */
  const split = track.split
  if (split === null || !car.shortcut) {
    around.wake += (0 - around.wake) * 0.08
  } else {
    const into = Math.max(0, Math.min(1, (car.s - split.from) / Math.max(1, split.separateAt - split.from)))
    const outOf = Math.max(0, Math.min(1, (split.rejoinAt - car.s) / 30))
    const want = Math.min(into, outOf)
    around.wake += (want - around.wake) * 0.08
  }
}

/** Between runs, so a fresh go does not start inside the last one's cave. */
export function forgetAround(): void {
  around.s = 0
  around.speed = 0
  around.tight = 0
  around.wet = 0
  around.rough = 0
  around.wake = 0
  around.roots = 0
  around.lamp = 0
  around.fire = 0
  around.water = 0
  around.scrape = 0
  around.running = false
  around.events.length = 0
}
