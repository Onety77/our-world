/**
 * The drowned garden, close up — what stands beside the Moonbreak's road.
 *
 * ---------------------------------------------------------------------------
 * `Moonbreak` lays the causeway itself; this is everything built or grown on
 * either side of it, written as plain builders that add faces to one of the
 * road's chunks. They know nothing about chunks, culling or materials — only
 * how to put a stone, a tree or an arch at a place on the road — so the file
 * that owns the road still decides where each one goes.
 *
 * The rule every piece here is placed by: **nothing solid inside the edge the
 * car is stopped at**, except where it was already there (the kerb posts ride
 * the verge, as the old stones did). Anything further out stands in the sea,
 * and its foot goes down into the water rather than stopping at road height —
 * the old trees were planted at the height of the road and floated a metre
 * above the sea beside it, which is invisible in the source and obvious in the
 * first frame anybody looks at.
 * ---------------------------------------------------------------------------
 */

import { Color, Vector3 } from 'three'
import { basisAt, roadPoint, type RoadBasis } from './geometry'
import { WATER_Y, emptyRoad, roadAt, vergeWidth, type Boulder, type RoadAt, type Track } from './track'

/** What a road chunk offers a builder. `CourseMesh` in `Moonbreak` is one. */
export interface Builder {
  readonly count: number
  vertex(point: Vector3, color: Color, wet?: number, rough?: number): void
  quad(a: number, b: number, c: number, d: number): void
}

function hash3(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

const frame = (): RoadBasis => ({ fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })

/** The edge the car is stopped at, which is where anything solid has to start. */
export function wallEdge(road: RoadAt): number {
  return road.width + vergeWidth(road.room)
}

const MOSS = new Color('#40564a')

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------

const faceU = new Vector3()
const faceV = new Vector3()
const faceN = new Vector3()
const faceMid = new Vector3()

/**
 * One flat four-cornered face with vertices of its own, wound to face away
 * from `inside`.
 *
 * Its own vertices because a block of stone has edges: shared with the face
 * beside it, `computeVertexNormals` would round every corner into the next.
 */
export function faceOut(
  b: Builder,
  corners: Vector3[],
  inside: Vector3,
  color: Color,
  wet: number,
  rough: number,
) {
  faceU.subVectors(corners[1], corners[0])
  faceV.subVectors(corners[2], corners[0])
  faceN.crossVectors(faceU, faceV)
  faceMid.set(0, 0, 0)
  for (const corner of corners) faceMid.add(corner)
  faceMid.divideScalar(corners.length).sub(inside)
  const base = b.count
  for (const corner of corners) b.vertex(corner, color, wet, rough)
  if (faceN.dot(faceMid) >= 0) b.quad(base, base + 1, base + 2, base + 3)
  else b.quad(base, base + 3, base + 2, base + 1)
}

/** The same, but facing a direction rather than away from a point. */
export function faceToward(
  b: Builder,
  corners: Vector3[],
  toward: Vector3,
  color: Color,
  wet: number,
  rough: number,
) {
  faceU.subVectors(corners[1], corners[0])
  faceV.subVectors(corners[2], corners[0])
  faceN.crossVectors(faceU, faceV)
  const base = b.count
  for (const corner of corners) b.vertex(corner, color, wet, rough)
  if (faceN.dot(toward) >= 0) b.quad(base, base + 1, base + 2, base + 3)
  else b.quad(base, base + 3, base + 2, base + 1)
}

/**
 * A six-faced block from eight corners: four round the bottom, then the four
 * above them in the same order. Stones in an arch, piers, plinths, steps.
 */
function block(b: Builder, c: Vector3[], color: Color, wet: number, rough: number, top?: Color) {
  const inside = new Vector3()
  for (const corner of c) inside.add(corner)
  inside.divideScalar(8)
  faceOut(b, [c[0], c[1], c[2], c[3]], inside, color, wet, rough)
  faceOut(b, [c[4], c[5], c[6], c[7]], inside, top ?? color, wet, rough)
  for (let k = 0; k < 4; k++) {
    const next = (k + 1) % 4
    faceOut(b, [c[k], c[next], c[next + 4], c[k + 4]], inside, color, wet, rough)
  }
}

/** A tapering tube along a path, `radius` per point, with shared vertices so it stays round. */
function tube(b: Builder, path: Vector3[], radius: number[], color: Color, sides = 6, rough = 0.28) {
  const base = b.count
  const forward = new Vector3()
  const right = new Vector3()
  const up = new Vector3()
  const reference = new Vector3()
  const point = new Vector3()
  for (let i = 0; i < path.length; i++) {
    forward.subVectors(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]).normalize()
    reference.set(Math.abs(forward.y) > 0.94 ? 1 : 0, Math.abs(forward.y) > 0.94 ? 0 : 1, 0)
    right.crossVectors(forward, reference).normalize()
    up.crossVectors(right, forward).normalize()
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2
      point
        .copy(path[i])
        .addScaledVector(right, Math.cos(angle) * radius[i])
        .addScaledVector(up, Math.sin(angle) * radius[i])
      b.vertex(point, color, 0.2, rough)
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides
      b.quad(base + i * sides + k, base + i * sides + next, base + (i + 1) * sides + next, base + (i + 1) * sides + k)
    }
  }
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

const BARK = new Color('#4a3e3b')
const BARK_PALE = new Color('#6f625c')
const LEAVES = [new Color('#2f4843'), new Color('#3d4d3f'), new Color('#463c47')]
const BLOSSOM = [new Color('#d8c6ce'), new Color('#c3aebb'), new Color('#e6dadd')]

/**
 * One leaf card, drawn from both sides.
 *
 * Four corners — the stalk, the two shoulders and the tip — so the two halves
 * either side of the spine can fold, which is the difference between a leaf and
 * a flat chip. Both windings as separate vertices, because a card drawn once is
 * a hole from behind, and a card whose two sides share vertices has normals
 * that cancel to nothing.
 */
function leaf(b: Builder, at: Vector3, along: Vector3, across: Vector3, length: number, width: number, color: Color) {
  const fold = new Vector3().crossVectors(along, across).normalize().multiplyScalar(width * 0.35)
  const stalk = at
  const tip = at.clone().addScaledVector(along, length)
  const left = at.clone().addScaledVector(along, length * 0.45).addScaledVector(across, -width).add(fold)
  const right = at.clone().addScaledVector(along, length * 0.45).addScaledVector(across, width).add(fold)
  for (const flip of [false, true]) {
    const base = b.count
    b.vertex(stalk, color, 0.1, 0.18)
    b.vertex(left, color, 0.1, 0.18)
    b.vertex(tip, color, 0.1, 0.18)
    b.vertex(right, color, 0.1, 0.18)
    if (flip) b.quad(base, base + 3, base + 2, base + 1)
    else b.quad(base, base + 1, base + 2, base + 3)
  }
}

/** A cluster of leaves and blossom round a point: a crown is several of these. */
function spray(b: Builder, centre: Vector3, radius: number, cards: number, blossom: number, seed: number) {
  const scatter = new Vector3()
  const along = new Vector3()
  const across = new Vector3()
  const tint = new Color()
  for (let c = 0; c < cards; c++) {
    const u = hash3(seed, c, 1) * Math.PI * 2
    const v = Math.acos(hash3(seed, c, 2) * 2 - 1)
    const r = radius * Math.cbrt(0.25 + hash3(seed, c, 3) * 0.75)
    scatter.set(Math.sin(v) * Math.cos(u), Math.cos(v) * 0.72, Math.sin(v) * Math.sin(u))
    const at = centre.clone().addScaledVector(scatter, r)
    along.copy(scatter).multiplyScalar(0.7).add(new Vector3(hash3(seed, c, 4) - 0.5, 0.35, hash3(seed, c, 5) - 0.5)).normalize()
    across.set(hash3(seed, c, 6) - 0.5, hash3(seed, c, 7) - 0.5, hash3(seed, c, 8) - 0.5).cross(along).normalize()
    const flower = hash3(seed, c, 9) < blossom
    const palette = flower ? BLOSSOM : LEAVES
    tint.copy(palette[Math.floor(hash3(seed, c, 10) * palette.length)]).multiplyScalar(0.8 + hash3(seed, c, 11) * 0.3)
    /*
      Small, and many. The first cut used cards over half a metre long at a
      third of this count, and close up beside the road a crown read as a
      handful of paper chips thrown in the air.
    */
    const size = flower ? 0.75 : 1
    leaf(b, at, along, across, (0.2 + hash3(seed, c, 12) * 0.16) * size, (0.09 + hash3(seed, c, 13) * 0.07) * size, tint)
  }
}

/**
 * A tree of the drowned orchard, standing in the sea beside the causeway.
 *
 * ===========================================================================
 * **These were lollipops.** A trunk and one squashed sphere of seven-sided
 * polygons, which is exactly the thing the garden's own rule warns against —
 * "leaf cards, not blobs" — and on an open road with the moon behind them they
 * were silhouettes, so the only thing anybody saw of them was the blob.
 *
 * Now a trunk that leans over the road and forks into boughs, and at the end of
 * every bough a spray of leaf cards: dark leaves on the causeway, and in the
 * orchard itself mostly blossom — pale, so it takes the moonlight — because a
 * drowned *orchard* in flower at night is the one picture this road is named
 * for and never drew.
 *
 * The foot goes down into the water. The old trunks began at the height of the
 * road, which beside a causeway a metre above the sea put the bottom of every
 * tree in mid-air.
 * ===========================================================================
 */
export function addOrchardTree(b: Builder, track: Track, s: number, side: number, seed: number, blossom: number) {
  const road = roadAt(track, s)
  const basis = basisAt(road, frame())
  const forward = new Vector3(basis.fx, basis.fy, basis.fz).normalize()
  const n = side * (wallEdge(road) + 1.4 + hash3(seed, 2, 1) * 3.6)
  const height = 3.6 + hash3(seed, 4, 5) * 3
  const lean = -side * (0.35 + hash3(seed, 7, 3) * 0.7)
  const bare = blossom < 0.5 && hash3(seed, 9, 9) < 0.14

  const trunk: Vector3[] = []
  const girth: number[] = []
  const steps = 6
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const point = roadPoint(road, n + lean * t * t, height * t, new Vector3(), basis)
      .addScaledVector(forward, Math.sin(t * 2.7 + seed) * 0.35)
    if (i === 0) point.y = WATER_Y - 0.6
    trunk.push(point)
    girth.push(0.2 + height * 0.012 - t * 0.12)
  }
  tube(b, trunk, girth, BARK, 6)

  const boughs = 3 + Math.floor(hash3(seed, 3, 3) * 3)
  const tips: Vector3[] = [trunk[steps - 1]]
  for (let k = 0; k < boughs; k++) {
    const t = 0.55 + hash3(seed, k, 21) * 0.4
    const from = trunk[Math.min(steps - 1, Math.round(t * (steps - 1)))]
    const heading = hash3(seed, k, 22) * Math.PI * 2
    const reach = 1.1 + hash3(seed, k, 23) * 1.4
    const out = new Vector3(Math.cos(heading), 0.8 + hash3(seed, k, 24) * 0.6, Math.sin(heading)).normalize()
    const mid = from.clone().addScaledVector(out, reach * 0.5).add(new Vector3(0, 0.15, 0))
    const tip = from.clone().addScaledVector(out, reach)
    tube(b, [from, mid, tip], [0.09, 0.06, 0.03], bare ? BARK_PALE : BARK, 5)
    tips.push(tip)
    if (!bare) spray(b, mid, 0.55, 14, blossom, seed * 29 + k)
    if (bare) {
      // A dead tree is all twigs: a second fork off every bough.
      const twig = tip.clone().add(new Vector3(hash3(seed, k, 25) - 0.5, 0.7, hash3(seed, k, 26) - 0.5))
      tube(b, [tip, twig], [0.03, 0.012], BARK_PALE, 4)
    }
  }
  if (bare) return
  tips.forEach((tip, k) => {
    const radius = 0.85 + hash3(seed, k, 31) * 0.6
    spray(b, tip, radius, 30 + Math.floor(hash3(seed, k, 32) * 14), blossom, seed * 13 + k)
  })
}

// ---------------------------------------------------------------------------
// Arches
// ---------------------------------------------------------------------------

const ARCH_STONE = [new Color('#9a9c93'), new Color('#8a8d85'), new Color('#a6a69c')]
const VINE = new Color('#2e4136')

/**
 * A broken stone arch over the road.
 *
 * ===========================================================================
 * They were two thin tubes bent over the causeway — wire coat-hangers at forty
 * metres, and the gate the race starts under was one of them. An arch is its
 * *stones*: two piers with a heavier course where the curve springs, and a ring
 * of wedge-shaped voussoirs standing on nothing but each other.
 *
 * The broken ones have lost a stone or two near the top, which is the whole
 * drama of a ruined arch — a gap where the keystone should be that somehow
 * still stands — and every one has moss on its back and a few strands of vine
 * hanging from the underside, high enough to clear the camera, low enough to
 * go past it.
 *
 * The piers stand outside the edge the car is stopped at, and go down into the
 * sea or the bank. `heavy` thickens everything, for the mouths of the tube.
 * ===========================================================================
 */
export function addRuinedArch(b: Builder, track: Track, s: number, broken: boolean, heavy = 1) {
  const road = roadAt(track, s)
  const basis = basisAt(road, frame())
  const forward = new Vector3(basis.fx, basis.fy, basis.fz).normalize()
  const inner = wallEdge(road) + 0.3
  const pier = 0.72 * heavy
  const depth = 0.5 * heavy
  const spring = 2.7
  const rise = inner * 0.62
  const ring = 0.62 * heavy
  const seed = Math.round(s * 7)
  const at = (n: number, y: number, a: number) => roadPoint(road, n, y, new Vector3(), basis).addScaledVector(forward, a)
  const stone = (k: number) => ARCH_STONE[Math.floor(hash3(seed, k, 3) * ARCH_STONE.length)].clone().multiplyScalar(0.86 + hash3(seed, k, 4) * 0.22)

  for (const side of [-1, 1]) {
    const n0 = side * inner
    const n1 = side * (inner + pier)
    const box = (na: number, nb: number, y0: number, y1: number, a: number) => [
      at(na, y0, -a), at(nb, y0, -a), at(nb, y0, a), at(na, y0, a),
      at(na, y1, -a), at(nb, y1, -a), at(nb, y1, a), at(na, y1, a),
    ]
    // Plinth, shaft and impost — the impost wider, which is where the eye reads "arch".
    block(b, box(n0 - side * 0.08, n1 + side * 0.08, WATER_Y - 1.2 - road.y, -0.2, depth + 0.1), stone(side + 10), 0.35, 0.24)
    block(b, box(n0, n1, -0.2, spring - 0.22, depth), stone(side + 11), 0.15, 0.24)
    block(b, box(n0 - side * 0.1, n1 + side * 0.1, spring - 0.22, spring, depth + 0.1), stone(side + 12), 0.15, 0.24, stone(side + 12).lerp(MOSS, 0.4))
  }

  const V = 13
  const gapFrom = broken ? Math.floor(V / 2) - (hash3(seed, 1, 1) < 0.5 ? 2 : 0) : -1
  const gapTo = broken ? gapFrom + 1 + Math.floor(hash3(seed, 1, 2) * 2) : -1
  const arc = (theta: number, r: number, lift: number) => [Math.cos(theta) * r, spring + Math.sin(theta) * lift]
  for (let v = 0; v < V; v++) {
    if (v >= gapFrom && v < gapTo) continue
    const t0 = Math.PI * (v / V) + 0.012
    const t1 = Math.PI * ((v + 1) / V) - 0.012
    const [ni0, yi0] = arc(t0, inner, rise)
    const [ni1, yi1] = arc(t1, inner, rise)
    const [no0, yo0] = arc(t0, inner + ring, rise + ring)
    const [no1, yo1] = arc(t1, inner + ring, rise + ring)
    const corners = [
      at(ni0, yi0, -depth), at(ni1, yi1, -depth), at(ni1, yi1, depth), at(ni0, yi0, depth),
      at(no0, yo0, -depth), at(no1, yo1, -depth), at(no1, yo1, depth), at(no0, yo0, depth),
    ]
    const high = Math.sin((t0 + t1) / 2)
    block(b, corners, stone(v), 0.15, 0.24, stone(v).lerp(MOSS, 0.2 + high * 0.45))

    // A strand of vine from the underside, now and then.
    if (high > 0.55 && hash3(seed, v, 7) < 0.45) {
      const hang = 0.7 + hash3(seed, v, 8) * 1.5
      const n = (ni0 + ni1) / 2
      const y = (yi0 + yi1) / 2
      const a = (hash3(seed, v, 9) - 0.5) * depth
      tube(
        b,
        [at(n, y, a), at(n + 0.08, y - hang * 0.5, a + 0.05), at(n + 0.02, y - hang, a + 0.12)],
        [0.035, 0.028, 0.012],
        VINE,
        4,
        0.2,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Along the edge
// ---------------------------------------------------------------------------

const POST = [new Color('#767a73'), new Color('#6a6e68'), new Color('#80827a')]

/**
 * A kerb post: the causeway's rhythm, the way the edge stones always were, but
 * weathered rather than cut yesterday — six-sided, tapering, leaning a little,
 * mossed on top, and every so often snapped off short. The old ones were pale
 * cubes, and under moonlight a row of pale cubes is a row of sugar lumps.
 */
export function addKerbPost(b: Builder, track: Track, s: number, side: number, tall: boolean) {
  const road = roadAt(track, s)
  const basis = basisAt(road, frame())
  const forward = new Vector3(basis.fx, basis.fy, basis.fz).normalize()
  const right = new Vector3(basis.rx, basis.ry, basis.rz)
  const seed = Math.round(s * 3 + side * 17)
  const snapped = hash3(seed, 1, 1) < 0.09
  const height = snapped ? 0.2 + hash3(seed, 1, 2) * 0.12 : (tall ? 0.78 : 0.52) + hash3(seed, 1, 3) * 0.14
  const foot = roadPoint(road, side * (wallEdge(road) - 0.2), -0.1, new Vector3(), basis)
  const top = foot.clone()
    .addScaledVector(new Vector3(basis.ux, basis.uy, basis.uz), height + 0.1)
    .addScaledVector(right, (hash3(seed, 2, 1) - 0.5) * 0.1)
    .addScaledVector(forward, (hash3(seed, 2, 2) - 0.5) * 0.1)
  const colour = POST[Math.floor(hash3(seed, 3, 1) * POST.length)].clone().multiplyScalar(0.85 + hash3(seed, 3, 2) * 0.2)
  const ring = (centre: Vector3, r: number) =>
    Array.from({ length: 6 }, (_, k) => {
      const angle = (k / 6) * Math.PI * 2 + seed
      return centre.clone().addScaledVector(right, Math.cos(angle) * r).addScaledVector(forward, Math.sin(angle) * r)
    })
  const low = ring(foot, 0.16)
  const high = ring(top, snapped ? 0.15 : 0.12)
  const inside = foot.clone().lerp(top, 0.5)
  for (let k = 0; k < 6; k++) {
    const next = (k + 1) % 6
    faceOut(b, [low[k], low[next], high[next], high[k]], inside, colour, 0.25, 0.22)
  }
  const cap = colour.clone().lerp(MOSS, snapped ? 0.1 : 0.45)
  faceOut(b, [high[0], high[1], high[2], high[3]], foot, cap, 0.25, 0.22)
  faceOut(b, [high[0], high[3], high[4], high[5]], foot, cap, 0.25, 0.22)
}

const ROCK_LOW = new Color('#343b38')
const ROCK_HIGH = new Color('#5c6558')

/**
 * One of the road's stones, where the physics has always had it.
 *
 * The Moonbreak deals `track.boulders` and the car is struck by them — speed
 * lost, the nose knocked aside, a strike on the result — and not one of them
 * was ever drawn. Driving the edge you could be hit by the sea. Each is a rock
 * standing up out of the water now, as wide as the physics thinks it is, so a
 * strike is something you saw coming.
 */
export function addSeaStone(b: Builder, track: Track, stone: Boulder) {
  const road = roadAt(track, stone.s)
  if (road.y - WATER_Y > 8) return
  const basis = basisAt(road, frame())
  const centre = roadPoint(road, stone.n, 0, new Vector3(), basis)
  const bottom = WATER_Y - 0.9
  const top = road.y + 0.15 + stone.size * 0.5
  const levels = [
    { y: bottom, r: 1.15 },
    { y: WATER_Y + 0.1, r: 1.05 },
    { y: bottom + (top - bottom) * 0.72, r: 0.88 },
    { y: top, r: 0.42 },
  ]
  const sides = 7
  const base = b.count
  const tint = new Color()
  levels.forEach((level, i) => {
    tint.copy(ROCK_LOW).lerp(ROCK_HIGH, i / (levels.length - 1)).lerp(MOSS, i === levels.length - 1 ? 0.35 : 0)
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2 + stone.seed
      const r = stone.size * 0.75 * level.r * (0.8 + hash3(stone.seed, i, k) * 0.4)
      b.vertex(new Vector3(centre.x + Math.cos(angle) * r, level.y + (hash3(stone.seed, k, i) - 0.5) * 0.15, centre.z + Math.sin(angle) * r), tint, i < 2 ? 0.7 : 0.3, 0.3)
    }
  })
  for (let i = 0; i < levels.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides
      b.quad(base + i * sides + k, base + (i + 1) * sides + k, base + (i + 1) * sides + next, base + i * sides + next)
    }
  }
  const crown = base + (levels.length - 1) * sides
  for (let k = 1; k < sides - 1; k += 2) {
    b.quad(crown, crown + k, crown + k + 1, crown + Math.min(sides - 1, k + 2))
  }
}

// ---------------------------------------------------------------------------
// The Sky Stair's viaduct
// ---------------------------------------------------------------------------

/** How deep the deck is under the road where it stands on arches. */
export const DECK = 1.6
/** How far above the sea the road has to be before it stops being an embankment. */
const VIADUCT_CLEAR = 6.5

/** Where the road is high enough over the sea to stand on arches rather than a wall. */
export function viaductSpans(track: Track): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = []
  const road = emptyRoad()
  let from = -1
  for (let s = 0; s <= track.length; s += 2) {
    const high = roadAt(track, s, road).y - WATER_Y > VIADUCT_CLEAR
    if (high && from < 0) from = s
    if (!high && from >= 0) {
      if (s - from > 30) spans.push({ from, to: s })
      from = -1
    }
  }
  if (from >= 0 && track.length - from > 30) spans.push({ from, to: track.length })
  return spans
}

const PIER = new Color('#666b65')
const SPANDREL = new Color('#5b605b')
const VOUSSOIR_BAND = new Color('#474c48')
const SOFFIT = new Color('#2a2f2e')

/**
 * The Sky Stair, standing on arches.
 *
 * ===========================================================================
 * The causeway's flank used to reach the water wherever the water was, which
 * was the right fix for a road hanging in the air — and it turned four hundred
 * metres of climb into a black wall thirty metres high, flecked with the rock
 * shader's glitter. From the reeds you looked up at a dam.
 *
 * A road carried thirty metres over the sea is a viaduct, and a viaduct is
 * mostly *not there*: piers every seventeen metres and the sky through the
 * arches between them. The deck keeps a fascia a metre and a half deep; the
 * piers go down into the sea; between each pair a vault springs from low on
 * the pier and rises to just under the road. It is the most legible silhouette
 * anywhere on the road, which matters, because the Stair is where you see the
 * road you are about to drive from the one you are on.
 * ===========================================================================
 */
export function addViaduct(builders: Builder[], track: Track, chunkFor: (s: number) => number, span: { from: number; to: number }) {
  const road = emptyRoad()
  const basis = frame()
  const bays = Math.max(1, Math.round((span.to - span.from) / 17))
  const bay = (span.to - span.from) / bays
  const forward = new Vector3()

  const place = (s: number, n: number, y: number) => {
    roadAt(track, s, road)
    basisAt(road, basis)
    return roadPoint(road, n, y, new Vector3(), basis)
  }

  for (let k = 0; k <= bays; k++) {
    const s = span.from + k * bay
    roadAt(track, s, road)
    basisAt(road, basis)
    forward.set(basis.fx, basis.fy, basis.fz).normalize()
    const along = k === 0 || k === bays ? 2.2 : 1.25
    const across = wallEdge(road) + 0.35
    const b = builders[chunkFor(s)]
    const at = (n: number, y: number, a: number) => roadPoint(road, n, 0, new Vector3(), basis).setY(y).addScaledVector(forward, a)
    const deckBottom = road.y - DECK + 0.05
    const pierBox = (w: number, y0: number, y1: number, a: number) => [
      at(-w, y0, -a), at(w, y0, -a), at(w, y0, a), at(-w, y0, a),
      at(-w, y1, -a), at(w, y1, -a), at(w, y1, a), at(-w, y1, a),
    ]
    const colour = PIER.clone().multiplyScalar(0.9 + hash3(k, span.from, 1) * 0.18)
    block(b, pierBox(across, WATER_Y - 1.5, deckBottom, along), colour, 0.3, 0.22)
    // A cutwater course at the sea, and an impost band where the vault springs.
    block(b, pierBox(across + 0.25, WATER_Y - 1.5, WATER_Y + 0.9, along + 0.25), colour.clone().multiplyScalar(0.7), 0.3, 0.22)
    const clear = deckBottom - WATER_Y
    const rise = Math.min(bay * 0.42, clear - 2)
    const springY = deckBottom - 0.35 - rise
    if (k > 0 && k < bays) {
      block(b, pierBox(across + 0.15, springY - 0.3, springY, along + 0.15), colour.clone().multiplyScalar(1.1), 0.2, 0.22)
    }
  }

  for (let k = 0; k < bays; k++) {
    const start = span.from + k * bay + (k === 0 ? 2.2 : 1.25)
    const end = span.from + (k + 1) * bay - (k + 1 === bays ? 2.2 : 1.25)
    const clearSpan = end - start
    const steps = Math.max(4, Math.round(clearSpan / 1.2))
    for (let i = 0; i < steps; i++) {
      const s0 = start + (clearSpan * i) / steps
      const s1 = start + (clearSpan * (i + 1)) / steps
      const t0 = i / steps
      const t1 = (i + 1) / steps
      const b = builders[chunkFor(s0)]
      const bottomAt = (s: number, n: number) => place(s, n, -DECK).y
      const vault = (s: number, t: number) => {
        roadAt(track, s, road)
        const deckBottom = road.y - DECK
        const rise = Math.min(bay * 0.42, deckBottom - WATER_Y - 2)
        return deckBottom - 0.35 - rise * (1 - Math.sin(Math.PI * t))
      }
      const v0 = vault(s0, t0)
      const v1 = vault(s1, t1)
      for (const side of [-1, 1]) {
        const n = side * wallEdge(roadAt(track, s0, road))
        const n1 = side * wallEdge(roadAt(track, s1, road))
        const outward = new Vector3(basis.rx, 0, basis.rz).multiplyScalar(side)
        // The spandrel between the curve and the deck, with the ring of the arch drawn darker along its lower edge.
        const lowA = place(s0, n, 0).setY(v0)
        const lowB = place(s1, n1, 0).setY(v1)
        const bandA = place(s0, n, 0).setY(v0 + 0.55)
        const bandB = place(s1, n1, 0).setY(v1 + 0.55)
        const topA = place(s0, n, 0).setY(bottomAt(s0, n))
        const topB = place(s1, n1, 0).setY(bottomAt(s1, n1))
        faceToward(b, [lowA, lowB, bandB, bandA], outward, VOUSSOIR_BAND, 0.2, 0.22)
        if (topA.y > bandA.y + 0.02 || topB.y > bandB.y + 0.02) {
          faceToward(
            b,
            [bandA, bandB, topB.y > bandB.y ? topB : bandB.clone(), topA.y > bandA.y ? topA : bandA.clone()],
            outward,
            SPANDREL.clone().multiplyScalar(0.92 + hash3(k, i, side) * 0.14),
            0.2,
            0.22,
          )
        }
      }
      // And the vault itself, seen from below.
      const wA = wallEdge(roadAt(track, s0, road))
      const wB = wallEdge(roadAt(track, s1, road))
      faceToward(
        b,
        [
          place(s0, -wA, 0).setY(v0),
          place(s0, wA, 0).setY(v0),
          place(s1, wB, 0).setY(v1),
          place(s1, -wB, 0).setY(v1),
        ],
        new Vector3(0, -1, 0),
        SOFFIT,
        0.3,
        0.22,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// The Drowned Mile
// ---------------------------------------------------------------------------

/**
 * A column of the drowned avenue, standing on the sea floor outside the glass.
 *
 * These were tall pale boxes — survey stones — and they keep that job: the slow
 * clock hands that make speed legible in a place with nothing else near. They
 * are the garden's own columns now, the same ones the terraces above have in
 * the shallows, some whole and some snapped off on a slant.
 */
export function addSunkenColumn(b: Builder, track: Track, s: number, n: number, height: number, color: Color) {
  const road = roadAt(track, s)
  const basis = basisAt(road, frame())
  const seed = Math.round(s * 11 + n * 7)
  const foot = roadPoint(road, n, -0.6, new Vector3(), basis)
  const whole = hash3(seed, 1, 1) > 0.4
  const tone = color.clone().multiplyScalar(0.85 + hash3(seed, 1, 2) * 0.25)
  const mossy = tone.clone().lerp(MOSS, 0.5)
  const ring = (centre: Vector3, r: number, sides: number, turn = 0) =>
    Array.from({ length: sides }, (_, i) => {
      const angle = turn + (i / sides) * Math.PI * 2
      return centre.clone().add(new Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r))
    })
  const plinthTop = foot.clone().setY(foot.y + 0.7)
  block(b, [...ring(foot, 1, 4, Math.PI / 4), ...ring(plinthTop, 1, 4, Math.PI / 4)], tone.clone().multiplyScalar(0.8), 0.3, 0.55, mossy)
  const shaftTop = plinthTop.clone().setY(plinthTop.y + height)
  const low = ring(plinthTop, 0.5, 8)
  // A broken one ends on a slant: its top ring tipped, one side a metre and a half lower.
  const high = ring(shaftTop, 0.44, 8).map((p, i) =>
    whole ? p : p.clone().setY(p.y - (1 + Math.cos((i / 8) * Math.PI * 2 + seed)) * 0.75),
  )
  const inside = plinthTop.clone().lerp(shaftTop, 0.5)
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8
    faceOut(b, [low[i], low[next], high[next], high[i]], inside, tone, 0.3, 0.55)
  }
  for (const [a, c, d, e] of [[0, 1, 2, 3], [0, 3, 4, 5], [0, 5, 6, 7]]) {
    faceOut(b, [high[a], high[c], high[d], high[e]], foot, mossy, 0.3, 0.55)
  }
  if (whole) {
    const capTop = shaftTop.clone().setY(shaftTop.y + 0.55)
    block(b, [...ring(shaftTop, 0.8, 4, Math.PI / 4), ...ring(capTop, 0.8, 4, Math.PI / 4)], tone, 0.3, 0.55, mossy)
  }
}

// ---------------------------------------------------------------------------
// The terraces at either end
// ---------------------------------------------------------------------------

const COLUMN = [new Color('#a19f95'), new Color('#908f87')]

/**
 * The moonwell terraces, where the race starts and ends, as the ruin of
 * somewhere.
 *
 * A colonnade either side standing in the shallows — some columns whole with a
 * lintel still across, some snapped at head height — and a flight of steps
 * going down off the causeway into the sea. It is the first thing either of you
 * sees when the race loads and the last thing behind the result, and it was an
 * empty strip of paving over open water.
 */
export function addTerrace(builders: Builder[], track: Track, chunkFor: (s: number) => number, from: number, to: number) {
  const road = emptyRoad()
  const basis = frame()
  const forward = new Vector3()
  for (const side of [-1, 1]) {
    let previousTop: Vector3 | null = null
    for (let s = from + 4, k = 0; s < to - 4; s += 9, k++) {
      roadAt(track, s, road)
      basisAt(road, basis)
      forward.set(basis.fx, basis.fy, basis.fz).normalize()
      const seed = Math.round(s * 5 + side * 31)
      const n = side * (wallEdge(road) + 2.4 + hash3(seed, 1, 1) * 0.6)
      const foot = roadPoint(road, n, 0, new Vector3(), basis).setY(WATER_Y - 1)
      const whole = hash3(seed, 2, 1) > 0.38
      const height = whole ? 5.8 : 1.6 + hash3(seed, 2, 2) * 2.6
      const colour = COLUMN[k % 2].clone().multiplyScalar(0.88 + hash3(seed, 3, 1) * 0.2)
      const b = builders[chunkFor(s)]
      const ring = (centre: Vector3, r: number, sides = 8) =>
        Array.from({ length: sides }, (_, i) => {
          const angle = (i / sides) * Math.PI * 2
          return centre.clone().add(new Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r))
        })
      // The plinth at the waterline.
      const plinthTop = foot.clone().setY(WATER_Y + 0.35)
      const pa = ring(foot, 0.78, 4)
      const pb = ring(plinthTop, 0.78, 4)
      block(b, [...pa, ...pb], colour.clone().multiplyScalar(0.8), 0.6, 0.24, colour.clone().lerp(MOSS, 0.5))
      // The shaft.
      const shaftTop = plinthTop.clone().setY(plinthTop.y + height)
      const low = ring(plinthTop, 0.42)
      const high = ring(shaftTop, 0.37)
      const inside = plinthTop.clone().lerp(shaftTop, 0.5)
      for (let i = 0; i < 8; i++) {
        const next = (i + 1) % 8
        faceOut(b, [low[i], low[next], high[next], high[i]], inside, colour, 0.2, 0.24)
      }
      if (whole) {
        const capital = ring(shaftTop, 0.62, 4)
        const capitalTop = ring(shaftTop.clone().setY(shaftTop.y + 0.4), 0.62, 4)
        block(b, [...capital, ...capitalTop], colour, 0.2, 0.24, colour.clone().lerp(MOSS, 0.35))
        const top = shaftTop.clone().setY(shaftTop.y + 0.4)
        if (previousTop && hash3(seed, 4, 1) < 0.6) {
          const a = previousTop
          const lintel = (p: Vector3, dy: number) => [
            p.clone().add(new Vector3(0, dy, 0)).addScaledVector(new Vector3(basis.rx, 0, basis.rz), -0.34),
            p.clone().add(new Vector3(0, dy, 0)).addScaledVector(new Vector3(basis.rx, 0, basis.rz), 0.34),
          ]
          const [a0, a1] = lintel(a, 0)
          const [b0, b1] = lintel(top, 0)
          const [a2, a3] = lintel(a, 0.55)
          const [b2, b3] = lintel(top, 0.55)
          block(b, [a0, a1, b1, b0, a2, a3, b3, b2], colour.clone().multiplyScalar(0.95), 0.2, 0.24, colour.clone().lerp(MOSS, 0.4))
        }
        previousTop = top
      } else {
        previousTop = null
      }
    }

    // Steps down into the sea, off the middle of the terrace.
    const middle = (from + to) / 2
    roadAt(track, middle, road)
    basisAt(road, basis)
    forward.set(basis.fx, basis.fy, basis.fz).normalize()
    const b = builders[chunkFor(middle)]
    const edge = wallEdge(road)
    const riser = 0.3
    const tread = 0.46
    for (let step = 0; step < 5; step++) {
      const n0 = side * (edge + step * tread)
      const n1 = side * (edge + (step + 1) * tread)
      const y1 = 0.06 - step * riser
      const y0 = WATER_Y - 1.2 - road.y
      const at = (n: number, y: number, a: number) => roadPoint(road, n, y, new Vector3(), basis).addScaledVector(forward, a)
      const colour = COLUMN[step % 2].clone().multiplyScalar(0.72 + step * 0.03)
      block(b, [at(n0, y0, -3), at(n1, y0, -3), at(n1, y0, 3), at(n0, y0, 3), at(n0, y1, -3), at(n1, y1, -3), at(n1, y1, 3), at(n0, y1, 3)], colour, 0.5 + step * 0.1, 0.24, colour.clone().lerp(MOSS, 0.15 + step * 0.1))
    }
  }
}
