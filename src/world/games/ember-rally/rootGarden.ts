/**
 * The Rootway, close up — what grows, burns and glitters in the rock by the road.
 *
 * ---------------------------------------------------------------------------
 * The tunnel was swept rock, roots, stone teeth and a pale cairn under every
 * lantern, and that was the whole vocabulary for two and a half kilometres: in
 * the frames that mattered — a chamber opening, a closing throat, the hall at
 * the end — there was nothing in the rock that had a *reason* to be there.
 *
 * This is the cave's own life, and every piece of it is placed by something the
 * road already knows, never by a table of metres (the road is dealt from a daily
 * seed, and a hand-written "crystals at 840 m" is wrong on every other day):
 *
 *   **fungus** grows around the cold lanterns, because the cold lanterns *are*
 *   fungus — a glow with nothing under it is a light fitting. Lit by its own
 *   lantern, which is already in the light window, so it glows without a new
 *   light anywhere.
 *
 *   **iron** holds the fires: a cage round every flame that sits on the ground,
 *   a bracket and a bowl for every one hung on a wall. Fire on the corners is
 *   the road's whole language, and now each of those words is a made thing.
 *
 *   **crystal** in the tight places, where the headlamps are closest to the
 *   rock, so the throats glitter as you go through them.
 *
 *   **flowstone** in the rooms: columns where the drip from the roof met the
 *   stone on the floor a very long time ago.
 *
 *   **the taproot** — one great root down through the vault of every chamber.
 *   The Rootway runs under the garden, and the biggest thing growing in the
 *   garden is the Tree of Thoughts.
 *
 * Nothing here stands on the driveable stone. Fungus, cages and cairns keep to
 * the verge where the cairns always were, at the size of a hand; everything
 * larger stands outside the edge the physics stops the car at.
 *
 * The builders take a `place` function rather than importing the road frame
 * from `geometry`, which imports this file — a circle of imports that works
 * until something reads a value during module initialisation.
 * ---------------------------------------------------------------------------
 */

import { Color, Vector3 } from 'three'
import { vergeWidth, roadAt, emptyRoad, type Lantern, type Track } from './track'

/** What a tunnel chunk offers a builder. `Mesh` in `geometry` is one. */
export interface CaveBuilder {
  readonly count: number
  vertex(x: number, y: number, z: number, col: Color, wet: number, rough: number): void
  quad(a: number, b: number, c: number, d: number): void
}

/** A point in the road's own frame: `n` metres right of the middle, `y` up off it. */
export type Placer = (s: number, n: number, y: number) => Vector3

function hash3(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

const road = emptyRoad()

/** The edge the car is stopped at. */
function wallAtS(track: Track, s: number): number {
  roadAt(track, s, road)
  return road.width + vergeWidth(road.room)
}

const U = new Vector3()
const V = new Vector3()
const N = new Vector3()
const MID = new Vector3()

/** A flat polygon with vertices of its own, facing away from `inside`. Up to four corners. */
function faceOut(b: CaveBuilder, corners: Vector3[], inside: Vector3, col: Color, wet: number, rough: number) {
  U.subVectors(corners[1], corners[0])
  V.subVectors(corners[2], corners[0])
  N.crossVectors(U, V)
  MID.set(0, 0, 0)
  for (const c of corners) MID.add(c)
  MID.divideScalar(corners.length).sub(inside)
  const base = b.count
  for (const c of corners) b.vertex(c.x, c.y, c.z, col, wet, rough)
  const d = corners.length === 3 ? base + 2 : base + 3
  if (N.dot(MID) >= 0) b.quad(base, base + 1, base + 2, d)
  else b.quad(base, d, base + 2, base + 1)
}

/** A round tube along a path, radius and colour per point, with shared vertices. */
function tube(
  b: CaveBuilder,
  path: Vector3[],
  radius: (t: number) => number,
  colour: (t: number) => Color,
  wet: number,
  rough: number,
  sides = 6,
) {
  const base = b.count
  const forward = new Vector3()
  const right = new Vector3()
  const up = new Vector3()
  const reference = new Vector3()
  for (let i = 0; i < path.length; i++) {
    const t = i / (path.length - 1)
    forward.subVectors(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]).normalize()
    reference.set(Math.abs(forward.y) > 0.94 ? 1 : 0, Math.abs(forward.y) > 0.94 ? 0 : 1, 0)
    right.crossVectors(forward, reference).normalize()
    up.crossVectors(right, forward).normalize()
    const r = Math.max(0.006, radius(t))
    const c = colour(t)
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2
      b.vertex(
        path[i].x + right.x * Math.cos(angle) * r + up.x * Math.sin(angle) * r,
        path[i].y + right.y * Math.cos(angle) * r + up.y * Math.sin(angle) * r,
        path[i].z + right.z * Math.cos(angle) * r + up.z * Math.sin(angle) * r,
        c,
        wet,
        rough,
      )
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides
      b.quad(base + i * sides + k, base + i * sides + next, base + (i + 1) * sides + next, base + (i + 1) * sides + k)
    }
  }
}

/** Two directions square to `axis` and to each other. */
function across(axis: Vector3): [Vector3, Vector3] {
  const helper = Math.abs(axis.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const a = new Vector3().crossVectors(axis, helper).normalize()
  const c = new Vector3().crossVectors(axis, a).normalize()
  return [a, c]
}

// ---------------------------------------------------------------------------
// Fungus
// ---------------------------------------------------------------------------

const CAP = [new Color('#b7c4b2'), new Color('#a2b4a6'), new Color('#c9c7ae')]
const GILL = new Color('#5d6457')
const STALK = new Color('#8c8e7c')

/** One mushroom: a stalk and a domed cap with darker gills under it. */
function mushroom(b: CaveBuilder, foot: Vector3, up: Vector3, height: number, radius: number, seed: number) {
  const top = foot.clone().addScaledVector(up, height)
  const lean = new Vector3(hash3(seed, 1, 1) - 0.5, 0, hash3(seed, 1, 2) - 0.5).multiplyScalar(height * 0.35)
  top.add(lean)
  tube(b, [foot, foot.clone().lerp(top, 0.55), top], (t) => radius * (0.22 - t * 0.06), () => STALK, 0.3, 0.2, 5)

  const [a, c] = across(up)
  const colour = CAP[Math.floor(hash3(seed, 2, 1) * CAP.length)].clone().multiplyScalar(0.85 + hash3(seed, 2, 2) * 0.25)
  const RIM = 7
  const rim = Array.from({ length: RIM }, (_, k) => {
    const angle = (k / RIM) * Math.PI * 2
    return top
      .clone()
      .addScaledVector(a, Math.cos(angle) * radius)
      .addScaledVector(c, Math.sin(angle) * radius)
      .addScaledVector(up, -radius * (0.12 + hash3(seed, k, 3) * 0.1))
  })
  const apex = top.clone().addScaledVector(up, radius * 0.5)
  const under = top.clone().addScaledVector(up, -radius * 0.05)
  for (let k = 0; k < RIM; k++) {
    const next = (k + 1) % RIM
    faceOut(b, [apex, rim[k], rim[next]], under, colour, 0.35, 0.18)
    faceOut(b, [under, rim[next], rim[k]], apex, GILL, 0.3, 0.2)
  }
}

/**
 * Fungus round a cold lantern: the lantern is the glow of it, and this is the
 * thing glowing. A clump on the ground for a lantern on the verge; a shelf of
 * brackets up the rock for one hung on a wall.
 */
function fungus(b: CaveBuilder, place: Placer, lantern: Lantern) {
  const seed = Math.round(lantern.s * 13 + lantern.n * 7)
  const side = Math.sign(lantern.n) || 1
  const onWall = lantern.y > 1.1
  const count = onWall ? 5 + Math.floor(hash3(seed, 0, 1) * 4) : 4 + Math.floor(hash3(seed, 0, 2) * 6)
  for (let m = 0; m < count; m++) {
    const along = (hash3(seed, m, 1) - 0.5) * 1.4
    const out = hash3(seed, m, 2) * 0.55
    const size = 0.06 + Math.pow(hash3(seed, m, 3), 2) * 0.2
    if (onWall) {
      // Brackets: short and wide, growing out of the rock sideways.
      const foot = place(lantern.s + along, lantern.n + side * 0.2, lantern.y - 0.5 + hash3(seed, m, 4) * 1.1)
      const outward = place(lantern.s + along, lantern.n - side * 1, lantern.y).sub(foot).setY(0).normalize()
      const up = outward.multiplyScalar(0.6).add(new Vector3(0, 0.8, 0)).normalize()
      mushroom(b, foot, up, size * 0.4, size * 1.5, seed + m * 31)
    } else {
      const foot = place(lantern.s + along, lantern.n + side * out, 0.02)
      mushroom(b, foot, new Vector3(0, 1, 0), size * (1.4 + hash3(seed, m, 5)), size, seed + m * 31)
    }
  }
}

// ---------------------------------------------------------------------------
// Iron
// ---------------------------------------------------------------------------

const IRON = new Color('#2c2723')
const IRON_WARM = new Color('#4a3527')

/**
 * A cage round a flame that sits on the ground: four bars, a hood, and a ring
 * to carry it by. Built round the lantern's own glow, so the fire is inside it.
 */
function cage(b: CaveBuilder, place: Placer, lantern: Lantern) {
  const centre = place(lantern.s, lantern.n, lantern.y)
  const forward = place(lantern.s + 1, lantern.n, lantern.y).sub(centre).normalize()
  const [a] = across(new Vector3(0, 1, 0))
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize()
  const r = 0.14 + lantern.size * 0.05
  const low = centre.y - 0.2
  const high = centre.y + 0.26
  void a
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * Math.PI * 2 + Math.PI / 4
    const offset = right.clone().multiplyScalar(Math.cos(angle) * r).addScaledVector(forward, Math.sin(angle) * r)
    const bottom = centre.clone().add(offset).setY(low)
    const top = centre.clone().add(offset.clone().multiplyScalar(0.7)).setY(high)
    tube(b, [bottom, top], () => 0.014, () => IRON, 0.2, 0.3, 4)
  }
  // The hood, and the ring over it.
  const apex = centre.clone().setY(high + 0.13)
  const rim = Array.from({ length: 4 }, (_, k) => {
    const angle = (k / 4) * Math.PI * 2 + Math.PI / 4
    return centre.clone().addScaledVector(right, Math.cos(angle) * r * 0.85).addScaledVector(forward, Math.sin(angle) * r * 0.85).setY(high)
  })
  for (let k = 0; k < 4; k++) faceOut(b, [apex, rim[k], rim[(k + 1) % 4]], centre, IRON_WARM, 0.2, 0.3)
  tube(
    b,
    Array.from({ length: 7 }, (_, k) => {
      const angle = (k / 6) * Math.PI
      return apex.clone().addScaledVector(right, Math.cos(angle) * 0.06).setY(apex.y + Math.sin(angle) * 0.07)
    }),
    () => 0.008,
    () => IRON,
    0.2,
    0.3,
    4,
  )
}

/** A flame hung on a wall: a bracket out of the rock and a bowl for the fire to sit in. */
function sconce(b: CaveBuilder, track: Track, place: Placer, lantern: Lantern) {
  const side = Math.sign(lantern.n) || 1
  const centre = place(lantern.s, lantern.n, lantern.y - 0.15)
  const wall = place(lantern.s, side * (wallAtS(track, lantern.s) + 0.9), lantern.y - 0.55)
  tube(b, [wall, wall.clone().lerp(centre, 0.6).setY(centre.y - 0.25), centre.clone().setY(centre.y - 0.12)], () => 0.035, () => IRON, 0.2, 0.3, 5)
  const RIM = 7
  const bowlR = 0.22 + lantern.size * 0.06
  const bottom = centre.clone().setY(centre.y - 0.14)
  const rim = Array.from({ length: RIM }, (_, k) => {
    const angle = (k / RIM) * Math.PI * 2
    return centre.clone().add(new Vector3(Math.cos(angle) * bowlR, 0.04, Math.sin(angle) * bowlR))
  })
  for (let k = 0; k < RIM; k++) {
    const next = (k + 1) % RIM
    faceOut(b, [bottom, rim[next], rim[k]], centre.clone().setY(centre.y + 1), IRON_WARM, 0.25, 0.3)
  }
}

// ---------------------------------------------------------------------------
// Stone that grew
// ---------------------------------------------------------------------------

const QUARTZ = [new Color('#c8d0cf'), new Color('#b3bec2'), new Color('#d5cdbe')]

/** A clutch of quartz: six-sided shards with points on them, fanning out of the rock. */
function crystals(b: CaveBuilder, root: Vector3, outward: Vector3, seed: number) {
  const count = 4 + Math.floor(hash3(seed, 0, 1) * 5)
  for (let k = 0; k < count; k++) {
    const dir = outward
      .clone()
      .add(new Vector3(hash3(seed, k, 1) - 0.5, hash3(seed, k, 2) * 0.9, hash3(seed, k, 3) - 0.5).multiplyScalar(1.3))
      .normalize()
    const length = 0.22 + Math.pow(hash3(seed, k, 4), 1.5) * 0.7
    const r = length * (0.12 + hash3(seed, k, 5) * 0.06)
    const colour = QUARTZ[Math.floor(hash3(seed, k, 6) * QUARTZ.length)]
    const [a, c] = across(dir)
    const foot = root.clone().add(new Vector3(hash3(seed, k, 7) - 0.5, 0, hash3(seed, k, 8) - 0.5).multiplyScalar(0.25))
    const shoulder = foot.clone().addScaledVector(dir, length * 0.78)
    const tip = foot.clone().addScaledVector(dir, length)
    const ring = (at: Vector3) =>
      Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2
        return at.clone().addScaledVector(a, Math.cos(angle) * r).addScaledVector(c, Math.sin(angle) * r)
      })
    const low = ring(foot)
    const high = ring(shoulder)
    const inside = foot.clone().lerp(shoulder, 0.5)
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6
      // Glossy and wet: a crystal is only ever a crystal in the moment a lamp finds it.
      faceOut(b, [low[i], low[next], high[next], high[i]], inside, colour, 0.95, 0.08)
      faceOut(b, [high[i], high[next], tip], inside, colour, 0.95, 0.08)
    }
  }
}

// Darker than it wants to be: pale columns in firelight came out as wax candles.
const FLOWSTONE = new Color('#6f6253')
const FLOWSTONE_WET = new Color('#564b40')

/** A column where a stalactite and the stalagmite under it met, long ago. */
function column(b: CaveBuilder, place: Placer, s: number, n: number, ceiling: number, seed: number) {
  const path: Vector3[] = []
  const STEPS = 9
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1)
    const wobble = Math.sin(t * 5 + seed) * 0.12
    path.push(place(s + Math.cos(t * 3 + seed) * 0.15, n + wobble, -0.3 + t * (ceiling + 0.6)))
  }
  tube(
    b,
    path,
    // Fat at the foot, waisted where the two halves met, flaring again into the roof.
    (t) => (0.95 - Math.sin(Math.min(1, t / 0.62) * Math.PI * 0.5) * 0.62 + Math.pow(Math.max(0, t - 0.62) / 0.38, 2) * 0.55) * (0.85 + hash3(seed, 1, 1) * 0.35),
    (t) => FLOWSTONE.clone().lerp(FLOWSTONE_WET, 0.5 + Math.sin(t * 17 + seed) * 0.5),
    0.35,
    0.25,
    8,
  )
}

/*
  Lighter than the roots around it, on purpose. The first cut was a near-black
  bark and in a chamber lit by nothing but the fill it vanished against the
  vault it was coming out of — the largest thing on the road, built and then
  invisible. Old wood goes grey, and grey takes what light there is.
*/
const TAPROOT = new Color('#5e4b3b')
const LICHEN = new Color('#8a8468')

/**
 * The taproot: one great root down through the vault of a chamber, arching
 * over the verge and into the floor beside the road, with buttress roots
 * splaying from its foot and fine threads hanging round it.
 *
 * Kept high over the driveable stone the whole way — it crosses the edge of the
 * road more than seven metres up — and its foot is outside the wall the physics
 * stops the car at.
 */
function taproot(b: CaveBuilder, track: Track, place: Placer, s: number, side: number, seed: number) {
  roadAt(track, s, road)
  const wall = road.width + vergeWidth(road.room)
  const ceiling = road.ceiling
  const STEPS = 10
  const path: Vector3[] = []
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1)
    const out = t * t * (3 - 2 * t)
    const n = side * (wall * 0.45 + (wall * 0.55 + 0.7) * out)
    const y = ceiling * (1.02 - Math.pow(t, 1.25) * 1.02) - 0.4 * t
    path.push(place(s + Math.sin(t * 2.2 + seed) * 1.2, n, y))
  }
  const colour = (t: number) => TAPROOT.clone().lerp(LICHEN, Math.max(0, Math.sin(t * 13 + seed)) * 0.35)
  // A trunk, not a root: at the girth of the ordinary roots it disappeared into
  // a room fifteen metres across.
  tube(b, path, (t) => 0.95 + t * 0.75, colour, 0.35, 0.55, 10)

  const foot = path[STEPS - 1]
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * Math.PI * 2 + seed
    const spread = new Vector3(Math.cos(angle), 0, Math.sin(angle))
    const mid = foot.clone().addScaledVector(spread, 1.7).setY(foot.y - 0.1)
    const end = foot.clone().addScaledVector(spread, 3.4).setY(foot.y - 0.9)
    tube(b, [foot.clone().setY(foot.y + 1.2), mid, end], (t) => 0.7 - t * 0.55, colour, 0.35, 0.55, 7)
  }

  // Pale brackets up its length, which are what catch the eye in the dark first.
  for (let k = 0; k < 6; k++) {
    const i = 2 + Math.floor(hash3(seed, k, 11) * (STEPS - 3))
    const at = path[i].clone().add(new Vector3(0, 0.1, 0))
    const out = new Vector3(hash3(seed, k, 12) - 0.5, 0.9, hash3(seed, k, 13) - 0.5).normalize()
    mushroom(b, at.addScaledVector(out, 0.42 + (i / STEPS) * 0.38), out, 0.06, 0.16 + hash3(seed, k, 14) * 0.14, seed * 5 + k)
  }

  // Threads down from the roof round it, like the hair on any root.
  for (let k = 0; k < 7; k++) {
    const at = s + (hash3(seed, k, 1) - 0.5) * 9
    const n = side * wall * (0.2 + hash3(seed, k, 2) * 0.7)
    const hang = 1.5 + hash3(seed, k, 3) * 3.5
    const top = place(at, n, ceiling * 0.97)
    tube(
      b,
      [top, place(at + 0.2, n + 0.1, ceiling * 0.97 - hang * 0.5), place(at + 0.3, n - 0.05, ceiling * 0.97 - hang)],
      (t) => 0.05 - t * 0.04,
      colour,
      0.3,
      0.5,
      4,
    )
  }
}

// ---------------------------------------------------------------------------
// Placing all of it
// ---------------------------------------------------------------------------

/**
 * Dress the Rootway's rock.
 *
 * `builders` are the tunnel's own chunks, `chunkOf` finds the one a metre of
 * road belongs to, and `rng` is a stream from the day's seed that nothing else
 * reads — so adding a crystal never moves a lantern.
 */
export function dressCave(
  builders: CaveBuilder[],
  chunkOf: (s: number) => number,
  track: Track,
  place: Placer,
  rng: () => number,
) {
  // Iron round the fires, fungus round the cold lights.
  for (const lantern of track.lanterns) {
    if (lantern.shortcut || lantern.fire) continue
    const b = builders[chunkOf(lantern.s)]
    if (lantern.warm > 0.4) {
      if (lantern.y <= 1.1) cage(b, place, lantern)
      else sconce(b, track, place, lantern)
    } else {
      fungus(b, place, lantern)
    }
  }

  // The chambers: every run of road with the room thrown open.
  const chambers: { from: number; to: number }[] = []
  let from = -1
  for (let s = 0; s < track.length; s += 2) {
    roadAt(track, s, road)
    const open = road.room > 0.85 && road.ceiling > 9
    if (open && from < 0) from = s
    if (!open && from >= 0) {
      if (s - from > 24) chambers.push({ from, to: s })
      from = -1
    }
  }

  chambers.forEach((chamber, c) => {
    const length = chamber.to - chamber.from
    // The start is the Hollow itself, and the hall at the end has its own fire to be about.
    const atEnds = chamber.from < 30 || chamber.to > track.finishAt - 10
    if (!atEnds) {
      const side = rng() < 0.5 ? -1 : 1
      taproot(builders[chunkOf(chamber.from + length * 0.5)], track, place, chamber.from + length * 0.5, side, c * 17 + 3)
    }
    for (let s = chamber.from + 6; s < chamber.to - 6; s += 12 + rng() * 14) {
      roadAt(track, s, road)
      const side = rng() < 0.5 ? -1 : 1
      const n = side * (road.width + vergeWidth(road.room) + 0.35 + rng() * 0.6)
      column(builders[chunkOf(s)], place, s, n, road.ceiling * 0.9, Math.floor(rng() * 10000))
    }
  })

  // Crystal in the tight places, low on the wall where the headlamps pass closest.
  for (let s = 40; s < track.finishAt - 20; s += 26 + rng() * 44) {
    roadAt(track, s, road)
    const pick = rng()
    const seed = Math.floor(rng() * 10000)
    if (track.split && s >= track.split.from - 16 && s <= track.split.to + 16) continue
    if (road.room > 0.35) continue
    const side = pick < 0.5 ? -1 : 1
    const wall = road.width + vergeWidth(road.room)
    const root = place(s, side * (wall + 0.12), 0.25 + pick * 0.9)
    const outward = place(s, 0, 0.6).sub(root).setY(0.25).normalize()
    crystals(builders[chunkOf(s)], root, outward, seed)
  }
}
