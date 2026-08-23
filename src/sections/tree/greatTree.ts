/**
 * The great tree itself, grown once.
 *
 * Grown at module load rather than in a component, because two separate things
 * need to agree about it: the mesh that draws it, and the letters that hang
 * from it. `growTree` is pure and seeded, so calling it here gives both the
 * same tree without either having to own it.
 *
 * ---------------------------------------------------------------------------
 * **Why the letters hang from the real branches now.**
 *
 * They used to hang at positions from a pure formula — a golden-angle ring at
 * a fixed radius and height — on the reasoning that a thought's place is part
 * of the record and must never move. That reasoning was right about the risk
 * and produced something worse: the formula had no idea where the branches
 * actually were, so every paper dangled in clear air *below* the crown with
 * its thread running up into nothing. They did not read as hanging from a tree
 * because they were not hanging from anything.
 *
 * So they hang off the real limbs. The tree is deterministic for its seed, so
 * this is stable for as long as `GREAT_TREE` and the generator are — and the
 * thing that genuinely must never move, the flower each thought grew on the
 * ground, is still a pure spiral in `layout.ts` and untouched by any of this.
 * If the tree is ever regrown the papers move to new branches; the record on
 * the ground does not.
 * ---------------------------------------------------------------------------
 */

import { makeRng, seedFrom } from '@/systems/rng'
import { growTree } from '@/world/tree'
import { groundHeight } from '@/systems/terrain'
import { MEADOW_X, MEADOW_Z } from './layout'

/**
 * How big it is, and how heavy.
 *
 * Read at twenty-three metres with the camera looking at the middle of it, so
 * it wants to fill most of the frame without the crown leaving the top. The
 * density buys one more level of branching and more leaves on every spray —
 * this is the oldest thing in the world and the only tree anybody stands
 * under.
 */
export const GREAT_TREE = {
  height: 15.5,
  girth: 1.55,
  density: 2.6,
  seed: 'tree-of-thoughts:great',
} as const

export const greatTree = growTree({
  at: [MEADOW_X, groundHeight(MEADOW_X, MEADOW_Z), MEADOW_Z],
  height: GREAT_TREE.height,
  species: 'broad',
  rng: makeRng(seedFrom(GREAT_TREE.seed)),
  girth: GREAT_TREE.girth,
  density: GREAT_TREE.density,
})

/**
 * Where the nth thought hangs.
 *
 * The branches are walked in a stride that is coprime with how many there are,
 * so consecutive thoughts land on opposite sides of the crown instead of
 * filling one branch at a time — and once every branch has one, the next lap
 * hangs slightly lower on each so they never occupy the same point.
 */
export function hangSpot(index: number): [number, number, number] {
  const points = greatTree.hangs
  if (points.length === 0) return [MEADOW_X, 6, MEADOW_Z]

  const stride = 7
  const [x, y, z] = points[(index * stride) % points.length]
  const lap = Math.floor((index * stride) / points.length)

  return [
    x + ((index % 3) - 1) * 0.16,
    y - lap * 0.42,
    z + (((index + 1) % 3) - 1) * 0.16,
  ]
}
