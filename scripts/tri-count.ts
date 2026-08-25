/**
 * What the garden actually costs, in triangles.
 *
 * `npm run tris`. The renderer says the whole frame is around 1.7 million,
 * which is a number you cannot act on — this says which of the eight things in
 * the meadow is spending it. Everything here is grown by the same pure
 * generators the scene uses, so the counts are the real ones rather than an
 * estimate off the source.
 *
 * A phone is a *vertex*-bound device far more often than anyone expects, and
 * this garden is one instanced field of tiny geometry after another. Run it
 * after touching grass, trees, flowers or the ground mesh.
 */

import { makeRng, range, seedFrom } from '../src/systems/rng'
import { growTree, speciesFor } from '../src/world/tree'
import { groundHeight } from '../src/systems/terrain'
import { HUB_WOOD } from '../src/world/hub/layout'

const rows: [string, number, string][] = []
const add = (what: string, tris: number, note = '') => rows.push([what, tris, note])

// --- the meadow ------------------------------------------------------------
// One blade is SEGMENTS strips of two triangles.
const BUDGET = Math.round(65_000 * 0.86) // high tier, in the garden
// Mirrors LAYERS in world/Grass. Kept here rather than imported because a
// script reaching into a component's private shape to print a number is a
// worse coupling than two numbers that have to be changed together — but they
// DO have to be changed together, so change them together.
const LAYERS = [
  { name: 'grass, turf', share: 0.4, segments: 4 },
  { name: 'grass, field', share: 0.34, segments: 2 },
  { name: 'grass, tussocks', share: 0.26, segments: 2 },
]
for (const layer of LAYERS) {
  const blades = Math.round(BUDGET * layer.share)
  add(layer.name, blades * layer.segments * 2, `${blades} blades × ${layer.segments} segments`)
}

// --- the ground ------------------------------------------------------------
const GROUND_SEGMENTS = 152
add('ground', GROUND_SEGMENTS * GROUND_SEGMENTS * 2, `${GROUND_SEGMENTS}² plane`)

// --- the wood --------------------------------------------------------------
// Five sides, open-ended: see the woodBase in world/Trees.
const WOOD_TRIS = 5 * 2
const LEAF_TRIS = 4
/** What the hub's treeline asks for. See `leafDetail` in world/tree. */
const HUB_LEAF_DETAIL = 0.34

function woodCost(count: number, heights: [number, number], seed: string) {
  const rng = makeRng(seedFrom(seed))
  let wood = 0
  let leaves = 0
  for (let i = 0; i < count; i++) {
    const parts = growTree({
      at: [0, groundHeight(i * 3, i * 7), 0],
      height: range(rng, heights[0], heights[1]),
      species: speciesFor(rng),
      rng,
      leafDetail: HUB_LEAF_DETAIL,
    })
    wood += parts.wood.length
    leaves += parts.leaves.length
  }
  return { wood, leaves, tris: wood * WOOD_TRIS + leaves * LEAF_TRIS }
}

const hubWood = woodCost(150, [5.2, 11.4], 'garden-hub:wood')
add(
  'hub treeline',
  hubWood.tris,
  `150 trees · ${Math.round(hubWood.wood / 150)} limbs + ${Math.round(hubWood.leaves / 150)} leaves each · r${HUB_WOOD.inner}–${HUB_WOOD.outer}`,
)

// --- flowers, stones -------------------------------------------------------
// A meadow flower is a handful of cones; a stone is a detail-0 icosahedron.
add('meadow flowers', Math.round(1_700 * 0.45) * 24, 'estimate, 24 tris each')
add('stones', 110 * 20, '110 icosahedra')

rows.sort((a, b) => b[1] - a[1])
const total = rows.reduce((sum, r) => sum + r[1], 0)

console.log('')
console.log('  what                       triangles     share')
console.log('  ' + '-'.repeat(62))
for (const [what, tris, note] of rows) {
  console.log(
    '  ' +
      what.padEnd(22) +
      tris.toLocaleString().padStart(10) +
      ((tris / total) * 100).toFixed(1).padStart(9) +
      '%  ' +
      note,
  )
}
console.log('  ' + '-'.repeat(62))
console.log('  ' + 'garden, without the four landmarks'.padEnd(22) + total.toLocaleString().padStart(10))
console.log('')
