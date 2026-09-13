/**
 * The great tree itself, grown once — as one solid old tree.
 *
 * ---------------------------------------------------------------------------
 * **It used to be the wood's generator, grown bigger, and it read as a sapling
 * on a pole.** `world/tree` builds a tree out of separate boxes — two per limb,
 * each a closed tube — which is exactly right for a hundred and fifty trees at
 * sixty metres and wrong for the one you stand under: the trunk showed its
 * steps where the boxes met, the limbs were sticks that passed through each
 * other at the joints, the bole ran clear for six metres before anything
 * happened, and the whole thing stood on the grass with no foot at all. The
 * oldest thing in the garden looked like it had been planted last spring.
 *
 * This grows an *old* tree, its own way:
 *
 *   **a short, massive trunk** that flares into buttresses and surface roots
 *   where it meets the ground, and splits low — at head height and a bit —
 *   into a leader and five scaffold limbs;
 *
 *   **limbs as curves, not sticks.** Each is a polyline that climbs, then
 *   levels, then droops under its own weight at the end, with its branches
 *   leaving *along* its length rather than only at the tip, which is how a
 *   crown gets depth instead of being a shell of blobs at one radius;
 *
 *   **one surface.** `TreeOfLetters` sweeps a single tube along every limb,
 *   starting each child inside its parent, so the bark is continuous from the
 *   roots to the twigs — no seams, no steps, no gaps;
 *
 *   **solid.** Every limb thick enough to catch a thread is also a capsule the
 *   hanging threads collide with — see `world/Letters`. A thread that swings
 *   into a branch now lies over it.
 *
 * Deterministic for its seed, so the papers keep their branches from one visit
 * to the next. The thing that genuinely must never move — the flower each
 * thought grew on the ground — is still the spiral in `layout.ts`, untouched.
 * ---------------------------------------------------------------------------
 */

import { makeRng, range, seedFrom, type Rng } from '@/systems/rng'
import { groundHeight } from '@/systems/terrain'
import { MEADOW_X, MEADOW_Z } from './layout'

export type Vec = [number, number, number]

/** One limb: a curve with a radius at each point, in the tree's own space (foot at the origin). */
export interface Limb {
  points: Vec[]
  radii: number[]
  /** 0 trunk, 1 scaffold, 2 branch, 3 twig-bearing, 4 twig. */
  depth: number
}

/** A spray of leaves: where it is and which way the twig was heading. */
export interface Spray {
  at: Vec
  heading: Vec
  size: number
}

/** A surface root: a curve that leaves the flare and sinks into the meadow. */
export interface Root {
  points: Vec[]
  radii: number[]
}

/** A solid piece of wood, for the threads to meet. */
export interface Capsule {
  a: Vec
  b: Vec
  r: number
}

export interface AncientTree {
  /** Where the foot is, in the world. */
  foot: Vec
  trunk: Limb
  limbs: Limb[]
  roots: Root[]
  sprays: Spray[]
  capsules: Capsule[]
  /**
   * Where thoughts hang, best first: under the outer branches, spread round the
   * crown, each with a clear drop to the air beneath. A thought takes the slot
   * matching its index, so a new one never moves the ones already hung.
   */
  hangs: Vec[]
  /** How wide the crown spreads, and how high it reaches, for the shade and the camera. */
  spread: number
  top: number
}

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s]
function norm([x, y, z]: Vec): Vec {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

/** Turn a direction away from itself by `angle`, about a bearing `spin` — see `world/tree`. */
function turn(dir: Vec, angle: number, spin: number): Vec {
  const [dx, dy, dz] = dir
  const ref: Vec = Math.abs(dy) > 0.95 ? [1, 0, 0] : [0, 1, 0]
  const [ux, uy, uz] = norm([ref[1] * dz - ref[2] * dy, ref[2] * dx - ref[0] * dz, ref[0] * dy - ref[1] * dx])
  const vx = dy * uz - dz * uy
  const vy = dz * ux - dx * uz
  const vz = dx * uy - dy * ux
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return norm([
    dx * c + (ux * Math.cos(spin) + vx * Math.sin(spin)) * s,
    dy * c + (uy * Math.cos(spin) + vy * Math.sin(spin)) * s,
    dz * c + (uz * Math.cos(spin) + vz * Math.sin(spin)) * s,
  ])
}

/**
 * How it is shaped, per depth: how long, how many branches leave it, at what
 * angle, how much it droops. Tuned by looking, for a broad old tree you could
 * sit under — an oak or a lime more than anything tall.
 */
/*
  The owners liked the tree this replaced for its *shape* — taller, slimmer,
  limbs reaching up into a high crown, a tree in its prime rather than an old
  one spread wide. So these are that shape: shallow branch angles and very
  little droop. Everything else (one surface, solid wood, roots) is kept.
*/
const DEPTHS = [
  /* 0 trunk */ { step: 0.45, children: 0, angle: [0, 0], droop: 0, wander: 0.03 },
  /* 1 scaffold */ { step: 0.55, children: 6, angle: [0.5, 0.85], droop: 0.02, wander: 0.06 },
  /* 2 branch */ { step: 0.5, children: 4, angle: [0.5, 0.85], droop: 0.035, wander: 0.08 },
  /* 3 twig-bearing */ { step: 0.42, children: 2, angle: [0.5, 0.9], droop: 0.04, wander: 0.1 },
  /* 4 twig */ { step: 0.35, children: 0, angle: [0, 0], droop: 0.04, wander: 0.12 },
] as const

/**
 * Grow it. `groundAt` is the height of the ground in the same space as `foot`
 * — the world's terrain for the section, and flat for the garden's landmark,
 * which stands in its own local space.
 */
export function growAncientTree(seed: string, foot: Vec, groundAt: (x: number, z: number) => number = groundHeight): AncientTree {
  const rng: Rng = makeRng(seedFrom(seed))
  const limbs: Limb[] = []
  const sprays: Spray[] = []

  /**
   * Lay a limb as a curve from `start` heading `dir`, and grow what comes off
   * it. The direction bends a little every step: a wander, a pull outward from
   * the trunk so nothing crosses back through the crown, and a droop that grows
   * toward the end — the long limb of an old tree comes down at its tip.
   */
  function limb(start: Vec, dir: Vec, length: number, r0: number, r1: number, depth: number, droopScale = 1) {
    const shape = DEPTHS[depth]
    const steps = Math.max(3, Math.ceil(length / shape.step))
    const points: Vec[] = [start]
    const radii: number[] = [r0]
    let heading = dir
    let at = start
    const wanderPhase = rng() * 10
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      // Outward from the trunk's axis, gently, so branches fill the crown rather than cross it.
      const out = norm([at[0], 0, at[2]])
      const outward = depth >= 1 ? 0.035 : 0
      const wander: Vec = [
        Math.sin(wanderPhase + i * 1.7) * shape.wander,
        Math.sin(wanderPhase * 1.3 + i * 1.1) * shape.wander * 0.5,
        Math.cos(wanderPhase + i * 1.3) * shape.wander,
      ]
      // Nothing sags below head height: a limb that low reads as broken, and it is where people stand.
      // Gently, and not in the first metre out of the trunk, or the limb leaves it with an elbow.
      const floor = depth >= 1 && t > 0.25 && at[1] < 3.2 ? (3.2 - at[1]) * 0.05 : 0
      heading = norm([
        heading[0] + wander[0] + out[0] * outward,
        heading[1] + wander[1] - shape.droop * droopScale * t * t * 2.2 + floor,
        heading[2] + wander[2] + out[2] * outward,
      ])
      at = add(at, scale(heading, length / steps))
      points.push(at)
      // Taper faster near the tip, the way wood does.
      radii.push(r0 + (r1 - r0) * Math.pow(t, 0.8))
    }
    limbs.push({ points, radii, depth })

    if (depth >= 4 || shape.children === 0) {
      if (depth >= 3) sprays.push({ at, heading, size: range(rng, 0.55, 0.8) })
      return
    }
    // A twig-bearing branch wears leaves at its own end too, so the crown is full.
    if (depth === 3) sprays.push({ at, heading, size: range(rng, 0.6, 0.9) })

    // Branches along the limb, from a third of the way out to the end.
    const count = Math.round(shape.children * range(rng, 0.8, 1.2))
    for (let c = 0; c < count; c++) {
      const t = count === 1 ? 0.8 : 0.32 + (c / (count - 1)) * 0.66 + range(rng, -0.04, 0.04)
      const index = Math.min(points.length - 2, Math.max(1, Math.round(t * steps)))
      const from = points[index]
      const local = norm([
        points[index + 1][0] - points[index - 1][0],
        points[index + 1][1] - points[index - 1][1],
        points[index + 1][2] - points[index - 1][2],
      ])
      const radiusHere = radii[index]
      const angle = range(rng, shape.angle[0], shape.angle[1])
      // Golden angle round the parent, with jitter — never stacked in a plane.
      let childDir = turn(local, angle, c * 2.399 + rng() * 0.9)
      // Lean the child up a little: branches reach for the light.
      childDir = norm([childDir[0], childDir[1] + 0.28, childDir[2]])
      const remaining = length * (1 - t)
      const childLength = Math.max(length * 0.28, remaining * range(rng, 0.7, 1.0) + length * 0.18) * (depth === 1 ? 0.62 : 0.7)
      const childRadius = Math.max(0.018, radiusHere * range(rng, 0.52, 0.66))
      limb(from, childDir, childLength, childRadius, Math.max(0.012, childRadius * 0.28), depth + 1)
    }
    // The end of a branch carries its own twigs too.
    if (depth === 2) {
      const tipDir = heading
      limb(at, turn(tipDir, range(rng, 0.2, 0.5), rng() * 6.28), length * 0.3, radii[radii.length - 1], 0.012, Math.min(4, depth + 1))
    }
  }

  // --- the trunk --------------------------------------------------------------
  // A clear bole to well above head height, slim, and gently tapering.
  const splitAt = range(rng, 5.2, 5.8)
  const lean = turn([0, 1, 0], range(rng, 0.02, 0.05), rng() * 6.28)
  const trunkPoints: Vec[] = []
  const trunkRadii: number[] = []
  const TRUNK_STEPS = 12
  for (let i = 0; i <= TRUNK_STEPS; i++) {
    const t = i / TRUNK_STEPS
    // A slight S in the bole, so it is grown and not turned on a lathe.
    const sway = Math.sin(t * Math.PI) * 0.12
    trunkPoints.push([lean[0] * splitAt * t + sway * 0.6, splitAt * t, lean[2] * splitAt * t + sway * 0.4])
    trunkRadii.push(0.6 - t * 0.2)
  }
  const trunk: Limb = { points: trunkPoints, radii: trunkRadii, depth: 0 }
  const crotch = trunkPoints[TRUNK_STEPS]

  // --- the leader, and the limbs off the trunk ------------------------------------
  // The leader climbs straight on: it is what makes the tree tall.
  limb(add(crotch, [0, -0.25, 0]), turn([0, 1, 0], 0.06, rng() * 6.28), 8.8, 0.34, 0.04, 1, 0)
  // Six, evenly round, so the crown is round and full from every side — not a lean.
  const scaffolds = 6
  const spin0 = rng() * 6.28
  for (let i = 0; i < scaffolds; i++) {
    const spin = spin0 + (i / scaffolds) * Math.PI * 2 + range(rng, -0.15, 0.15)
    // Every other one leaves the trunk lower down, the rest from the fork — all reaching up and out.
    const low = i % 2 === 1
    const tilt = low ? range(rng, 0.88, 0.98) : range(rng, 0.66, 0.8)
    const dir = turn([0, 1, 0], tilt, spin)
    const from = low ? trunkPoints[Math.round(TRUNK_STEPS * range(rng, 0.7, 0.82))] : add(crotch, [0, range(rng, -0.3, 0.05), 0])
    limb(from, dir, low ? range(rng, 8.6, 9.4) : range(rng, 9.0, 10.0), low ? 0.25 : 0.3, 0.04, 1, low ? 0.55 : 0.35)
  }

  // --- the roots ------------------------------------------------------------------
  const roots: Root[] = []
  const rootCount = 7
  for (let i = 0; i < rootCount; i++) {
    const a = (i / rootCount) * Math.PI * 2 + range(rng, -0.3, 0.3)
    // Modest: just enough that the trunk goes into the ground rather than standing on it.
    const length = range(rng, 1.0, 1.7)
    const points: Vec[] = []
    const radii: number[] = []
    const STEPS = 8
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS
      const d = 0.35 + t * length
      const wiggle = Math.sin(t * 5 + i) * 0.12 * t
      const x = Math.cos(a + wiggle) * d
      const z = Math.sin(a + wiggle) * d
      const ground = groundAt(foot[0] + x, foot[2] + z) - foot[1]
      // Out of the foot and down into the meadow, gone under by the end.
      const r = 0.24 * Math.pow(1 - t, 1.1) + 0.03
      points.push([x, ground + r * 0.1 - t * t * 0.15 + (1 - t) * (1 - t) * 0.1, z])
      radii.push(r)
    }
    roots.push({ points, radii })
  }

  // --- what a thread can meet -------------------------------------------------------
  const capsules: Capsule[] = []
  for (const l of [trunk, ...limbs]) {
    for (let i = 0; i < l.points.length - 1; i++) {
      const r = (l.radii[i] + l.radii[i + 1]) / 2
      // Twigs are not solid to a thread: at their size it would snag on every one.
      if (r < 0.03) continue
      capsules.push({ a: l.points[i], b: l.points[i + 1], r })
    }
  }

  // --- the crown's extent ------------------------------------------------------------
  let spread = 0
  let top = 0
  for (const s of sprays) {
    spread = Math.max(spread, Math.hypot(s.at[0], s.at[2]))
    top = Math.max(top, s.at[1])
  }

  // --- where thoughts hang -------------------------------------------------------------
  const hangs = chooseHangs(limbs, capsules, sprays)

  return { foot, trunk, limbs, roots, sprays, capsules, hangs, spread, top }
}

/** Squared distance from a point to a segment. */
export function segmentDistanceSq(p: Vec, a: Vec, b: Vec): number {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2]
  const len = abx * abx + aby * aby + abz * abz
  const t = len > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len)) : 0
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t
  return dx * dx + dy * dy + dz * dz
}

/** The lowest a paper's top may hang, and the highest, above the meadow. */
export const PAPER_TOP = { low: 2.4, high: 5.0 }
/** A thread never shorter than this. */
const SHORTEST = 0.6

/**
 * The hang points, in the order thoughts take them.
 *
 * Candidates are the undersides of the branches out past the trunk, low enough
 * that the thread is not six metres long, with a clear fall beneath: a
 * vertical line from the knot down past the paper's bottom that keeps a
 * paper's half-width away from every other piece of wood, and does not pass
 * through a spray of leaves. Then ordered by farthest-first, starting at the
 * front of the tree, so the first few thoughts spread round the crown instead
 * of crowding one limb — and the order depends only on the tree, so thought
 * number twelve always hangs in the same place.
 */
function chooseHangs(limbs: Limb[], capsules: Capsule[], sprays: Spray[]): Vec[] {
  const candidates: Vec[] = []
  for (const l of limbs) {
    if (l.depth < 2 || l.depth > 3) continue
    // Every quarter metre or so along the limb, not only at its joints.
    for (let i = 1; i < l.points.length - 1; i += 1) for (const f of [0, 0.5]) {
      const a = l.points[i]
      const b = l.points[i + 1]
      const p: Vec = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
      const r = l.radii[i] + (l.radii[i + 1] - l.radii[i]) * f
      if (r < 0.035) continue
      const out = Math.hypot(p[0], p[2])
      if (out < 2.2 || p[1] < 5.2 || p[1] > 12) continue
      const knot: Vec = [p[0], p[1] - r - 0.02, p[2]]
      const bottom = PAPER_TOP.low - 1.0
      // A clear fall: sample down the line. Wood is solid; leaves only count
      // right on the line, since a thread slips between them.
      let clear = true
      // Starting clear of its own branch, which the knot is tied round.
      for (let y = knot[1] - 0.34 - r; y > bottom && clear; y -= 0.3) {
        const q: Vec = [knot[0], y, knot[2]]
        for (const c of capsules) {
          if (segmentDistanceSq(q, c.a, c.b) < (c.r + 0.28) ** 2) {
            clear = false
            break
          }
        }
        if (!clear || y < knot[1] - 1.2) continue
        for (const s of sprays) {
          const dx = q[0] - s.at[0], dy = q[1] - s.at[1], dz = q[2] - s.at[2]
          if (dx * dx + dy * dy + dz * dz < 0.12) {
            clear = false
            break
          }
        }
      }
      if (clear) candidates.push(knot)
    }
  }

  // Farthest-first, beginning with the candidate nearest the front (+z, toward the camera).
  const ordered: Vec[] = []
  if (candidates.length === 0) return ordered
  let first = 0
  for (let i = 1; i < candidates.length; i++) if (candidates[i][2] - Math.abs(candidates[i][0]) * 0.5 > candidates[first][2] - Math.abs(candidates[first][0]) * 0.5) first = i
  const taken = new Uint8Array(candidates.length)
  const nearest = new Float32Array(candidates.length).fill(Infinity)
  let current = first
  for (let n = 0; n < candidates.length; n++) {
    taken[current] = 1
    ordered.push(candidates[current])
    const c = candidates[current]
    let best = -1
    let bestD = -1
    for (let i = 0; i < candidates.length; i++) {
      if (taken[i]) continue
      const d = (candidates[i][0] - c[0]) ** 2 + (candidates[i][2] - c[2]) ** 2
      if (d < nearest[i]) nearest[i] = d
      if (nearest[i] > bestD) {
        bestD = nearest[i]
        best = i
      }
    }
    if (best < 0) break
    // Two knots closer than half a metre are one knot; keep going but let the next lap have them.
    current = best
  }
  return ordered
}

/** The great tree of the meadow. */
export const GREAT_TREE_SEED = 'tree-of-thoughts:ancient'
export const greatTree = growAncientTree(GREAT_TREE_SEED, [MEADOW_X, groundHeight(MEADOW_X, MEADOW_Z), MEADOW_Z])

/**
 * The outside of the trunk at a height above the foot, in the world: its
 * centre and how far out the bark is (the buttresses' average, not their
 * peaks). What a vine climbs round.
 */
export function trunkAt(y: number): { x: number; z: number; radius: number } {
  const { points, radii } = greatTree.trunk
  const top = points[points.length - 1][1]
  const t = Math.max(0, Math.min(1, y / top))
  const i = Math.min(points.length - 2, Math.floor(t * (points.length - 1)))
  const f = t * (points.length - 1) - i
  const a = points[i]
  const b = points[i + 1]
  const flare = Math.exp(-Math.max(0, y + 0.15) / 0.55)
  return {
    x: greatTree.foot[0] + a[0] + (b[0] - a[0]) * f,
    z: greatTree.foot[2] + a[2] + (b[2] - a[2]) * f,
    radius: (radii[i] + (radii[i + 1] - radii[i]) * f) * (1 + flare * 0.3),
  }
}

/**
 * Where the question's bud grows: out in front of the tree, between two of its
 * roots, clear of the flare — not in among them, where it was.
 */
export const budSpot: Vec = (() => {
  const angles = greatTree.roots.map((r) => Math.atan2(r.points[1][2], r.points[1][0])).sort((a, b) => a - b)
  // The gap between roots nearest the front (+z, toward the camera).
  let best = Math.PI / 2
  let bestScore = -Infinity
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i]
    const b = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2
    const mid = (a + b) / 2
    const score = (b - a) * 0.6 + Math.sin(mid) + Math.cos(mid) * 0.3
    if (score > bestScore) {
      bestScore = score
      best = mid
    }
  }
  const x = greatTree.foot[0] + Math.cos(best) * 1.9
  const z = greatTree.foot[2] + Math.sin(best) * 1.9
  return [x, groundHeight(x, z), z]
})()

/**
 * Where the nth thought's thread is tied, in the world.
 *
 * Past the last good slot, the laps come round again a little lower and
 * offset along the branch, so two thoughts never share a knot.
 */
export function hangSpot(index: number): Vec {
  const [fx, fy, fz] = greatTree.foot
  const points = greatTree.hangs
  if (points.length === 0) return [fx, fy + 6, fz]
  // Past the last slot the laps come round again — tied at the same knot, on
  // a thread of a different length (see `hangDrop`), so it is still on a branch.
  const [x, y, z] = points[index % points.length]
  return [fx + x, fy + y, fz + z]
}

/**
 * How much thread the nth thought hangs on: whatever reaches from its knot down
 * to its share of the band under the crown. Golden-ratio stepped, so neighbours
 * never hang at the same height.
 */
export function hangDrop(index: number): number {
  const knotY = hangSpot(index)[1]
  const slots = Math.max(1, greatTree.hangs.length)
  const lap = Math.floor(index / slots)
  // A second thought on the same knot hangs a sheet's height lower than the first, and so on.
  const t = lap === 0 ? (index * 0.6180339887) % 1 : ((index % slots) * 0.6180339887) % 1
  const want = greatTree.foot[1] + PAPER_TOP.low + t * (PAPER_TOP.high - PAPER_TOP.low) - lap * 1.0
  return Math.max(SHORTEST, knotY - want)
}
