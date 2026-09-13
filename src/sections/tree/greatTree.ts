/**
 * The great tree itself, grown once — the tree it always was, made solid.
 *
 * ---------------------------------------------------------------------------
 * **The shape is the original tree's, exactly.** A tall straight bole, clear to
 * well above head height, with long limbs radiating up and out of the top half
 * of it into an open crown. That is what `world/tree` grows for this seed, and
 * it is the tree the two of you know — a replacement "old tree" grown some
 * other way was a different tree, and read as one. So the skeleton comes from
 * the same generator, the same seed and the same proportions it always did.
 *
 * **What changed is how it is made.** `world/tree` hands back each limb as two
 * boxes, which is right for a wood at sixty metres and wrong for the one tree
 * you stand under: steps where the boxes met, sticks through sticks at every
 * joint, a trunk standing on the grass with no foot. Here:
 *
 *   **every limb and the limb that carries on from it are one curve** — the
 *   generator's segments joined end to end and run through a spline, so the
 *   trunk climbs in one line from the roots to the top and each branch is one
 *   smooth sweep out to its twigs;
 *
 *   **one surface.** `TreeOfLetters` sweeps a tube along each curve, and every
 *   branch starts inside the wood it grows from, so the bark is continuous;
 *
 *   **a foot** — surface roots, and a flare into them in the renderer;
 *
 *   **fine ends.** A twig tapers to nothing inside its leaves instead of ending
 *   in a blunt stub as thick as a finger;
 *
 *   **solid.** Every limb thick enough to catch a thread is also a capsule the
 *   hanging threads collide with — see `world/threads`.
 *
 * Deterministic for its seed, so the papers keep their branches from one visit
 * to the next. The thing that genuinely must never move — the flower each
 * thought grew on the ground — is still the spiral in `layout.ts`, untouched.
 * ---------------------------------------------------------------------------
 */

import { makeRng, range, seedFrom } from '@/systems/rng'
import { groundHeight } from '@/systems/terrain'
import { growTree } from '@/world/tree'
import { MEADOW_X, MEADOW_Z } from './layout'

export type Vec = [number, number, number]

/** One limb: a curve with a radius at each point, in the tree's own space (foot at the origin). */
export interface Limb {
  points: Vec[]
  radii: number[]
  /** How many splits from the trunk it is: 0 the trunk, then outward. */
  depth: number
}

/** A spray of leaves: where it is, which way the twig was heading, and how big. */
export interface Spray {
  at: Vec
  heading: Vec
  /** The size of one leaf card. */
  size: number
  /** How far the spray reaches out from its twig. */
  reach: number
  /** How full it is: 1 at a twig's end, less along a branch. */
  weight: number
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
  /** Where the leaves begin, above the foot. */
  crownBase: number
}

/** The tree's proportions — the ones it has always had. */
export const GREAT_TREE = { height: 15.5, girth: 1.55, density: 2.6 } as const

/** A Catmull-Rom point between `p1` and `p2`. */
function spline(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t
  const t3 = t2 * t
  const out: Vec = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    out[k] =
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
  }
  return out
}

/**
 * Run a polyline through a spline, so the generator's kinks become bends. The
 * curve passes through every original point, so a branch that left from a
 * joint still leaves from the wood. `spacing` is how far apart the new points
 * may be, given the height and radius there.
 */
function smooth(points: Vec[], radii: number[], spacing: (y: number, r: number) => number): { points: Vec[]; radii: number[] } {
  const outPoints: Vec[] = [points[0]]
  const outRadii: number[] = [radii[0]]
  const n = points.length
  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    // Past the ends, carry straight on rather than doubling the end point, which would flatten the last bend.
    const p0: Vec = i > 0 ? points[i - 1] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1], 2 * p1[2] - p2[2]]
    const p3: Vec = i + 2 < n ? points[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1], 2 * p2[2] - p1[2]]
    const length = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2])
    const steps = Math.max(1, Math.ceil(length / spacing(p1[1], radii[i])))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      outPoints.push(s === steps ? p2 : spline(p0, p1, p2, p3, t))
      outRadii.push(radii[i] + (radii[i + 1] - radii[i]) * t)
    }
  }
  return { points: outPoints, radii: outRadii }
}

/**
 * Grow it. `groundAt` is the height of the ground in the same space as `foot`
 * — the world's terrain for the section, and flat for the garden's landmark,
 * which stands in its own local space.
 */
export function growAncientTree(seed: string, foot: Vec, groundAt: (x: number, z: number) => number = groundHeight): AncientTree {
  const grown = growTree({
    at: [0, 0, 0],
    height: GREAT_TREE.height,
    species: 'broad',
    rng: makeRng(seedFrom(seed)),
    girth: GREAT_TREE.girth,
    density: GREAT_TREE.density,
    skeleton: true,
  })
  const segments = grown.limbs ?? []

  /*
    Join each segment to the one that carries on from it.

    The generator grows depth-first and always grows a limb's main child
    straight after the limb itself, so a segment that starts exactly where the
    previous one ended is its continuation; anything else is a branch leaving
    an earlier joint, and starts a curve of its own.
  */
  const chains: Limb[] = []
  for (const s of segments) {
    const last = chains[chains.length - 1]
    const end = last?.points[last.points.length - 1]
    if (last && end && Math.abs(end[0] - s.points[0][0]) + Math.abs(end[1] - s.points[0][1]) + Math.abs(end[2] - s.points[0][2]) < 1e-6) {
      // The joint: the parent ends a touch thicker than the child begins; meet in the middle.
      last.radii[last.radii.length - 1] = (last.radii[last.radii.length - 1] + s.radii[0]) / 2
      last.points.push(s.points[1], s.points[2])
      last.radii.push(s.radii[1], s.radii[2])
    } else {
      chains.push({ points: [...s.points], radii: [...s.radii], depth: s.depth })
    }
  }

  for (const c of chains) {
    /*
      A little slimmer than the generator's numbers. Its boxes were drawn as
      cones, narrowing to seven tenths at each end, so the tree everyone knows
      was slimmer than its radii say — and a round tube at full radius read as
      the heavy old tree the owners did not want.
    */
    for (let i = 0; i < c.radii.length; i++) c.radii[i] *= 0.85
    // Every curve ends in leaves: taper its last span away to a twig's end.
    const n = c.radii.length
    c.radii[n - 1] = Math.max(0.012, c.radii[n - 1] * 0.35)
    if (n > 2) c.radii[n - 2] *= 0.85
  }

  // --- what a thread can meet -------------------------------------------------------
  // From the curves before smoothing: the spline passes through every one of these
  // points, and between them it strays by millimetres, well inside a radius.
  const capsules: Capsule[] = []
  for (const l of chains) {
    for (let i = 0; i < l.points.length - 1; i++) {
      const r = (l.radii[i] + l.radii[i + 1]) / 2
      // Twigs are not solid to a thread: at their size it would snag on every one.
      if (r < 0.03) continue
      capsules.push({ a: l.points[i], b: l.points[i + 1], r })
    }
  }

  // --- where thoughts hang -------------------------------------------------------------
  const sprays: Spray[] = (grown.sprays ?? []).map((s) => ({
    at: s.at,
    heading: s.heading,
    // A little finer than the wood's own leaves, and more of them — see TreeOfLetters.
    size: Math.max(GREAT_TREE.height * 0.021, s.length * 0.52) * 1.15 * 0.8,
    reach: Math.max(s.length, GREAT_TREE.height * 0.055) * 0.8,
    weight: 1,
  }))

  /*
    Leaves along the branches, not only at their ends.

    The generator puts every spray at a twig's tip, and drawn as boxes with
    six thousand leaves that was enough. Drawn as clean bark it left the inner
    limbs bare under dark clumps at the ends — a tree after a storm. A lighter
    spray every metre or so along the outer part of each branch fills the
    crown from the inside, and keeps the gaps between the limbs that make it
    an open crown rather than a ball.
  */
  chains.forEach((c, index) => {
    if (index === 0) return
    let total = 0
    for (let i = 0; i < c.points.length - 1; i++) total += Math.hypot(c.points[i + 1][0] - c.points[i][0], c.points[i + 1][1] - c.points[i][1], c.points[i + 1][2] - c.points[i][2])
    let travelled = 0
    let next = Math.max(0.7, total * 0.35)
    let side = index % 2 === 0 ? 1 : -1
    for (let i = 0; i < c.points.length - 1; i++) {
      const a = c.points[i]
      const b = c.points[i + 1]
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      while (next <= travelled + length && next < total - 0.6) {
        const f = (next - travelled) / length
        const at: Vec = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
        const r = c.radii[i] + (c.radii[i + 1] - c.radii[i]) * f
        if (r < 0.15 && at[1] > 6.5) {
          // Out to alternate sides of the branch, and up toward the light.
          const tx = (b[0] - a[0]) / length, tz = (b[2] - a[2]) / length
          const hx = tx - tz * side * 0.8, hz = tz + tx * side * 0.8
          const hl = Math.hypot(hx, 0.7, hz)
          sprays.push({ at, heading: [hx / hl, 0.7 / hl, hz / hl], size: GREAT_TREE.height * 0.021 * 0.85, reach: 0.6, weight: 0.5 })
          side = -side
        }
        next += 0.95
      }
      travelled += length
    }
  })

  const hangs = chooseHangs(chains.slice(1), capsules, sprays)

  // --- the curves, smoothed -----------------------------------------------------------
  const [trunkChain, ...limbChains] = chains
  // Rings close together low on the trunk, where the flare and the roots are shaped.
  const trunkSmooth = smooth(trunkChain.points, trunkChain.radii, (y) => (y < 3 ? 0.14 : 0.45))
  const trunk: Limb = {
    // Sunk half a metre into the meadow, so there is never a gap at its foot.
    points: [[trunkSmooth.points[0][0], -0.5, trunkSmooth.points[0][2]], ...trunkSmooth.points],
    radii: [trunkSmooth.radii[0], ...trunkSmooth.radii],
    depth: 0,
  }
  const limbs: Limb[] = limbChains.map((c) => {
    const s = smooth(c.points, c.radii, (_y, r) => (r > 0.2 ? 0.3 : r > 0.08 ? 0.4 : 0.55))
    return { points: s.points, radii: s.radii, depth: c.depth }
  })

  // --- the roots ------------------------------------------------------------------
  const base = trunkChain.radii[0]
  const rng = makeRng(seedFrom(`${seed}:roots`))
  const roots: Root[] = []
  const rootCount = 7
  const spin = rng() * Math.PI * 2
  for (let i = 0; i < rootCount; i++) {
    const a = spin + (i / rootCount) * Math.PI * 2 + range(rng, -0.3, 0.3)
    // Modest: enough that the trunk goes into the ground rather than standing on it.
    const length = range(rng, 1.2, 2.0)
    const points: Vec[] = []
    const radii: number[] = []
    const STEPS = 9
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS
      const d = base * 0.55 + t * length
      const wiggle = Math.sin(t * 5 + i) * 0.12 * t
      const x = trunkChain.points[0][0] + Math.cos(a + wiggle) * d
      const z = trunkChain.points[0][2] + Math.sin(a + wiggle) * d
      const ground = groundAt(foot[0] + x, foot[2] + z) - foot[1]
      // Out of the foot and down into the meadow, gone under by the end.
      const r = base * 0.38 * Math.pow(1 - t, 1.2) + 0.03
      points.push([x, ground + r * 0.1 - t * t * 0.15 + (1 - t) * (1 - t) * 0.1, z])
      radii.push(r)
    }
    roots.push({ points, radii })
  }

  // --- the crown's extent ------------------------------------------------------------
  let spread = 0
  let top = 0
  let crownBase = Infinity
  for (const s of sprays) {
    spread = Math.max(spread, Math.hypot(s.at[0], s.at[2]) + s.reach * 0.6)
    top = Math.max(top, s.at[1] + s.reach * 0.6)
    crownBase = Math.min(crownBase, s.at[1] - s.reach * 0.4)
  }

  return { foot, trunk, limbs, roots, sprays, capsules, hangs, spread, top, crownBase }
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
 * that the thread is not ten metres long, with a clear fall beneath: a
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
    // Along the limb at its joints and half way between them; not its first span, which is inside its parent.
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
    current = best
  }
  return ordered
}

/** The great tree of the meadow — the same seed it has always grown from. */
export const GREAT_TREE_SEED = 'tree-of-thoughts:great'
export const greatTree = growAncientTree(GREAT_TREE_SEED, [MEADOW_X, groundHeight(MEADOW_X, MEADOW_Z), MEADOW_Z])

/**
 * The outside of the trunk at a height above the foot, in the world: its
 * centre and how far out the bark is (the flare's average, not its peaks).
 * What a vine climbs round.
 */
export function trunkAt(y: number): { x: number; z: number; radius: number } {
  const { points, radii } = greatTree.trunk
  let i = 0
  while (i < points.length - 2 && points[i + 1][1] < y) i++
  const a = points[i]
  const b = points[i + 1]
  const f = Math.max(0, Math.min(1, (y - a[1]) / Math.max(1e-6, b[1] - a[1])))
  const flare = Math.exp(-Math.max(0, y + 0.15) / 0.55)
  return {
    x: greatTree.foot[0] + a[0] + (b[0] - a[0]) * f,
    z: greatTree.foot[2] + a[2] + (b[2] - a[2]) * f,
    radius: (radii[i] + (radii[i + 1] - radii[i]) * f) * (1 + flare * 0.3),
  }
}

/**
 * Where the question's bud grows: out in front of the tree, between two of its
 * roots, clear of the flare — not in among them.
 */
export const budSpot: Vec = (() => {
  const [tx, , tz] = greatTree.trunk.points[1]
  const angles = greatTree.roots.map((r) => Math.atan2(r.points[1][2] - tz, r.points[1][0] - tx)).sort((a, b) => a - b)
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
  const x = greatTree.foot[0] + tx + Math.cos(best) * 1.9
  const z = greatTree.foot[2] + tz + Math.sin(best) * 1.9
  return [x, groundHeight(x, z), z]
})()

/**
 * Where the nth thought's thread is tied, in the world.
 *
 * Past the last good slot the laps come round again — tied at the same knot, on
 * a thread of a different length (see `hangDrop`), so it is still on a branch.
 */
export function hangSpot(index: number): Vec {
  const [fx, fy, fz] = greatTree.foot
  const points = greatTree.hangs
  if (points.length === 0) return [fx, fy + 6, fz]
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
