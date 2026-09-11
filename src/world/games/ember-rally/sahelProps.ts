/**
 * The Harmattan's trees, mounds and stones, built standing on the ground.
 *
 * ---------------------------------------------------------------------------
 * These were drawn in the road's own frame out of four-sided tapers, at the
 * road's height wherever they stood, and the render said what that cost:
 *
 *   **the baobabs were windmills.** A tapered post with three to five straight
 *   limbs sticking out sideways near the top is a mill with its sails on, and
 *   at a hundred metres through dust nobody saw a tree;
 *
 *   **the termite cathedrals were pyramids** — four smooth faces to a point;
 *
 *   **the ironstone was bricks**, dark boxes lying on the verge; and
 *
 *   **the doum palms were insects**, seven flat blades on a stick.
 *
 * So these are built in the world, each on the ground where it stands (a
 * scarp baobab is on the slope, not on an imaginary shelf at road height), and
 * each shape is the thing it is:
 *
 *   a baobab is a **bottle** — a fat, fluted trunk that barely tapers, then a
 *   crown of thick limbs thrown up and out and forking, bare in harmattan;
 *
 *   a cathedral mound is **fluted**: buttresses that twist up it, a leaning
 *   crown, and smaller spires leaning off its shoulders, in red laterite earth;
 *
 *   ironstone is a **lump**, wider across the road than along it — which is
 *   the shape of the strike the physics has always given it;
 *
 *   and a doum palm is a forked trunk with a **ball of fans** on each fork and
 *   a skirt of dead fronds hanging under it.
 *
 * Everything goes into a road chunk's mesh through `Builder`, so it is culled
 * with the chunk, drawn in the road's material, and lit and hazed with it.
 * That material draws front faces only: solids are wound outward, and anything
 * as thin as a leaf is laid twice, back to back, with its own normals each way.
 * ---------------------------------------------------------------------------
 */

import { Color, Vector3 } from 'three'

/** The part of a road chunk's mesh these need. */
export interface Builder {
  readonly count: number
  vertex(point: Vector3, color: Color, wet?: number, rough?: number): void
  quad(a: number, b: number, c: number, d: number): void
  tri(a: number, b: number, c: number): void
}

const TAU = Math.PI * 2
const p = new Vector3()
const tint = new Color()

function hash(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

type Ring = readonly [height: number, radius: number]

/**
 * A body of revolution standing at a point: rings of height and radius, lumped
 * by `lump(angle, height)`, leaning as it rises, and capped at the top.
 */
function lathe(
  b: Builder,
  x: number,
  y: number,
  z: number,
  rings: readonly Ring[],
  sides: number,
  colour: (t: number, out: Color) => Color,
  rough: number,
  lump: (angle: number, height: number) => number,
  leanX = 0,
  leanZ = 0,
) {
  const base = b.count
  for (let r = 0; r < rings.length; r++) {
    const [h, radius] = rings[r]
    colour(r / (rings.length - 1), tint)
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU
      const out = radius * lump(a, h)
      p.set(x + Math.cos(a) * out + leanX * h, y + h, z + Math.sin(a) * out + leanZ * h)
      b.vertex(p, tint, 0, rough)
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < sides; k++) {
      const a = base + r * sides + k
      const next = base + r * sides + ((k + 1) % sides)
      b.quad(a, a + sides, next + sides, next)
    }
  }
  const [h] = rings[rings.length - 1]
  colour(1, tint)
  p.set(x + leanX * h, y + h + rings[rings.length - 1][1] * 0.3, z + leanZ * h)
  const top = b.count
  b.vertex(p, tint, 0, rough)
  const last = base + (rings.length - 1) * sides
  for (let k = 0; k < sides; k++) b.tri(top, last + ((k + 1) % sides), last + k)
}

const axis = new Vector3()
const u = new Vector3()
const w = new Vector3()

/** A tapered tube between two points, capped at the far end. */
function tube(b: Builder, from: Vector3, to: Vector3, r0: number, r1: number, sides: number, colour: Color, rough: number) {
  axis.subVectors(to, from)
  const length = axis.length() || 1
  axis.divideScalar(length)
  u.set(0, 1, 0)
  if (Math.abs(axis.y) > 0.9) u.set(1, 0, 0)
  u.crossVectors(axis, u).normalize()
  // (u, w) turn the same way round the axis as `lathe` turns round +y, so one winding serves both.
  w.crossVectors(u, axis)
  const base = b.count
  for (const [end, r] of [[from, r0], [to, r1]] as const) {
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU
      const c = Math.cos(a) * r
      const s = Math.sin(a) * r
      p.set(end.x + u.x * c + w.x * s, end.y + u.y * c + w.y * s, end.z + u.z * c + w.z * s)
      b.vertex(p, colour, 0, rough)
    }
  }
  for (let k = 0; k < sides; k++) {
    const next = (k + 1) % sides
    b.quad(base + k, base + sides + k, base + sides + next, base + next)
  }
  const top = b.count
  b.vertex(to, colour, 0, rough)
  for (let k = 0; k < sides; k++) b.tri(top, base + sides + ((k + 1) % sides), base + sides + k)
}

/** A thin fan of triangles from a centre through a row of rim points, laid twice, back to back. */
function fan(b: Builder, centre: Vector3, rim: Vector3[], colour: Color, edge: Color, rough: number) {
  for (const back of [false, true]) {
    const hub = b.count
    b.vertex(centre, colour, 0, rough)
    for (const point of rim) b.vertex(point, edge, 0, rough)
    for (let k = 0; k < rim.length - 1; k++) {
      if (back) b.tri(hub, hub + 2 + k, hub + 1 + k)
      else b.tri(hub, hub + 1 + k, hub + 2 + k)
    }
  }
}

// ---------------------------------------------------------------------------

const BARK = new Color('#9d937f')
const BARK_FOOT = new Color('#766b5a')
const LIMB = new Color('#8a806f')

/** A baobab, standing at a point on the ground. `scale` of one is a trunk six metres high and two and a half across. */
export function baobab(b: Builder, x: number, y: number, z: number, scale: number, seed: number) {
  const H = 6.3 * scale
  const R = 1.28 * scale
  const rings: Ring[] = ([
    [-0.08, 1.04], [0, 1], [0.1, 1.07], [0.28, 1.05], [0.47, 0.93], [0.63, 0.76], [0.77, 0.57], [0.87, 0.42],
  ] as const).map(([h, r]) => [h * H, r * R] as const)
  lathe(
    b, x, y, z, rings, 9,
    (t, out) => out.copy(BARK_FOOT).lerp(BARK, Math.min(1, t * 3)).multiplyScalar(0.92 + hash(seed, 1, 9) * 0.14),
    0.9,
    // Fluted: the folds run up the trunk and twist a little as they go.
    (a, h) => 1 + 0.07 * Math.sin(a * 5 + seed) + 0.04 * Math.sin(a * 9 - h * 0.7 + seed * 1.3),
    (hash(seed, 2, 1) - 0.5) * 0.05,
    (hash(seed, 2, 2) - 0.5) * 0.05,
  )
  const root = new Vector3()
  const elbow = new Vector3()
  const tip = new Vector3()
  const limbs = 5 + Math.floor(hash(seed, 1, 1) * 3)
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * TAU + hash(seed, i, 2) * 0.6
    const lift = 0.5 + hash(seed, i, 3) * 0.55
    const reach = (2.2 + hash(seed, i, 4) * 1.6) * scale
    root.set(x + Math.cos(a) * R * 0.28, y + H * 0.84, z + Math.sin(a) * R * 0.28)
    elbow.set(
      root.x + Math.cos(a) * Math.cos(lift) * reach,
      root.y + Math.sin(lift) * reach,
      root.z + Math.sin(a) * Math.cos(lift) * reach,
    )
    tube(b, root, elbow, 0.3 * scale, 0.14 * scale, 5, LIMB, 0.9)
    // Each limb forks once, and the forks go on climbing.
    for (const turn of [-0.45, 0.42]) {
      const a2 = a + turn
      const lift2 = lift + 0.3
      const length = reach * (0.45 + hash(seed, i, turn > 0 ? 5 : 6) * 0.3)
      tip.set(
        elbow.x + Math.cos(a2) * Math.cos(lift2) * length,
        elbow.y + Math.sin(lift2) * length,
        elbow.z + Math.sin(a2) * Math.cos(lift2) * length,
      )
      tube(b, elbow, tip, 0.13 * scale, 0.035 * scale, 4, LIMB, 0.9)
    }
  }
}

const EARTH = new Color('#935f3f')
const EARTH_CROWN = new Color('#a9744f')

/** A termite cathedral, standing at a point: a fluted, leaning spire with smaller ones off its shoulders. */
export function termiteMound(b: Builder, x: number, y: number, z: number, height: number, seed: number) {
  const foot = height * 0.27
  const shape: Ring[] = ([
    [-0.3, 1.08], [0, 1], [0.1, 0.84], [0.26, 0.64], [0.44, 0.47], [0.62, 0.33], [0.8, 0.2], [0.93, 0.1], [1, 0.02],
  ] as const).map(([h, r]) => [h * height, r * foot] as const)
  const earth = (t: number, out: Color) =>
    out.copy(EARTH).lerp(EARTH_CROWN, t * 0.8).multiplyScalar(0.88 + hash(seed, 3, 1) * 0.2)
  // Buttresses that twist up it: what makes a mound a cathedral rather than a cone.
  const flutes = (a: number, h: number) => 1 + 0.22 * Math.sin(a * 4 + h * 1.1 + seed) + 0.1 * Math.sin(a * 7 - h * 2.1 + seed * 1.9)
  lathe(b, x, y, z, shape, 8, earth, 0.86, flutes, (hash(seed, 3, 2) - 0.5) * 0.08, (hash(seed, 3, 3) - 0.5) * 0.08)
  const spires = 2 + Math.floor(hash(seed, 3, 4) * 2)
  for (let i = 0; i < spires; i++) {
    const a = hash(seed, i, 5) * TAU
    const out = foot * (0.55 + hash(seed, i, 6) * 0.3)
    const high = height * (0.35 + hash(seed, i, 7) * 0.27)
    const wide = foot * (0.4 + hash(seed, i, 8) * 0.15)
    const small: Ring[] = shape.map(([h, r]) => [(h / height) * high, (r / foot) * wide] as const)
    lathe(b, x + Math.cos(a) * out, y, z + Math.sin(a) * out, small, 6, earth, 0.86, flutes, Math.cos(a) * 0.12, Math.sin(a) * 0.12)
  }
}

const IRON = new Color('#6b412c')
const IRON_PALE = new Color('#87583b')

/**
 * Ironstone, sitting on whatever is under it: a flattened lump, sunk a quarter
 * of its height, as wide across the road as the strike the physics gives it
 * (`size * 0.75` either side) and a little shorter along it. `rightX, rightZ`
 * is the road's right-hand direction there.
 */
export function ironstone(b: Builder, x: number, y: number, z: number, size: number, rightX: number, rightZ: number, seed: number) {
  const RINGS = 3
  const SIDES = 7
  const high = size * 0.58
  const base = b.count
  for (let i = 0; i <= RINGS; i++) {
    const phi = (-0.35 + (i / RINGS) * 1.35) * (Math.PI / 2)
    const r = Math.cos(phi)
    tint.copy(IRON).lerp(IRON_PALE, i / RINGS).multiplyScalar(0.85 + hash(seed, i, 1) * 0.3)
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * TAU
      const lumpy = 0.8 + hash(seed, i, k) * 0.4
      const across = Math.cos(a) * size * 0.78 * r * lumpy
      const along = -Math.sin(a) * size * 0.62 * r * lumpy
      p.set(x + rightX * across + rightZ * along, y + Math.sin(phi) * high - high * 0.25, z + rightZ * across - rightX * along)
      b.vertex(p, tint, 0, 0.78)
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < SIDES; k++) {
      const a = base + i * SIDES + k
      const next = base + i * SIDES + ((k + 1) % SIDES)
      b.quad(a, a + SIDES, next + SIDES, next)
    }
  }
}

const PALM_BARK = new Color('#7a7063')
const FAN = new Color('#8b8764')
const FAN_TIP = new Color('#6d6b4e')
const DEAD = new Color('#8f7757')
const DEAD_TIP = new Color('#735c42')

/** A doum palm, standing at a point: a trunk that forks, and on each fork a ball of fans over a skirt of dead ones. */
export function doumPalm(b: Builder, x: number, y: number, z: number, seed: number) {
  const trunk = 3.1 + hash(seed, 4, 1) * 2.2
  const foot = new Vector3(x, y - 0.3, z)
  const lean = (hash(seed, 4, 2) - 0.5) * 0.6
  const fork = new Vector3(x + lean, y + trunk, z - lean * 0.5)
  tube(b, foot, fork, 0.24, 0.19, 6, PALM_BARK, 0.92)
  const top = new Vector3()
  const turn = hash(seed, 4, 3) * TAU
  for (const side of [0, Math.PI]) {
    const a = turn + side + (hash(seed, side, 4) - 0.5) * 0.6
    const length = trunk * (0.5 + hash(seed, side, 5) * 0.3)
    top.set(fork.x + Math.cos(a) * length * 0.55, fork.y + length * 0.85, fork.z + Math.sin(a) * length * 0.55)
    tube(b, fork, top, 0.17, 0.13, 5, PALM_BARK, 0.92)
    crown(b, top, seed * 3 + side)
  }
}

function crown(b: Builder, centre: Vector3, seed: number) {
  const rim: Vector3[] = [new Vector3(), new Vector3(), new Vector3()]
  // The skirt: dead fans hanging straight down under the live ones.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + hash(seed, k, 1) * 0.4
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    const drop = 1.1 + hash(seed, k, 2) * 0.5
    rim[0].set(centre.x + cx * 0.5 - cz * 0.28, centre.y - drop, centre.z + cz * 0.5 + cx * 0.28)
    rim[1].set(centre.x + cx * 0.62, centre.y - drop - 0.2, centre.z + cz * 0.62)
    rim[2].set(centre.x + cx * 0.5 + cz * 0.28, centre.y - drop, centre.z + cz * 0.5 - cx * 0.28)
    p.set(centre.x + cx * 0.2, centre.y - 0.1, centre.z + cz * 0.2)
    fan(b, p.clone(), rim, DEAD, DEAD_TIP, 0.95)
  }
  // The live fans: a ball of them, some reaching up, most out, a few drooping.
  const blades: Vector3[] = [0, 1, 2, 3, 4].map(() => new Vector3())
  const stalk = new Vector3()
  for (let k = 0; k < 11; k++) {
    const az = k * 2.39996 + hash(seed, k, 3)
    const el = -0.35 + hash(seed, k, 4) * 1.05
    const dx = Math.cos(az) * Math.cos(el)
    const dy = Math.sin(el)
    const dz = Math.sin(az) * Math.cos(el)
    const px = -Math.sin(az)
    const pz = Math.cos(az)
    stalk.set(centre.x + dx * 0.45, centre.y + dy * 0.45, centre.z + dz * 0.45)
    const radius = 1.15 + hash(seed, k, 5) * 0.5
    blades.forEach((blade, j) => {
      const theta = -0.95 + (j / 4) * 1.9
      const jag = 0.85 + hash(seed, k, 10 + j) * 0.2
      blade.set(
        stalk.x + (dx * Math.cos(theta) + px * Math.sin(theta)) * radius * jag,
        stalk.y + dy * Math.cos(theta) * radius * jag - 0.25 * radius * theta * theta,
        stalk.z + (dz * Math.cos(theta) + pz * Math.sin(theta)) * radius * jag,
      )
    })
    tint.copy(FAN).multiplyScalar(0.84 + hash(seed, k, 6) * 0.3)
    fan(b, stalk, blades, tint.clone(), FAN_TIP, 0.9)
  }
}
