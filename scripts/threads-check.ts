/**
 * The threads the thoughts hang on are ropes, and the tree is solid.
 *
 * Grows the great tree, hangs a hundred and twenty thoughts on it, and drives
 * the rope simulation for minutes of ordinary wind and then a gale, checking
 * after every single step that:
 *
 *   - no point of any thread, and no edge of any paper, is inside a branch
 *     that is solid to it (bent by the wind exactly as it is drawn);
 *   - nothing is under the meadow;
 *   - no thread has stretched or snapped — a rope keeps its length;
 *   - every knot is still on its branch as the branch bends;
 *   - and that threads really do meet the wood: a check that passed because
 *     nothing ever touched anything would prove nothing.
 *
 * And how long a step takes, because this runs sixty times a second on a phone.
 */

import assert from 'node:assert/strict'
import { greatTree, hangDrop, hangSpot, segmentDistanceSq } from '../src/sections/tree/greatTree'
import { PAPER_HEIGHT } from '../src/world/Letters'
import { STEP, buildRopes, buildWood, stepRopes, type Ropes } from '../src/world/threads'
import { bendNow, treeClock } from '../src/world/treeWind'
import { groundHeight } from '../src/systems/terrain'

const tree = greatTree
const foot = tree.foot
const COUNT = 120
const specs = Array.from({ length: COUNT }, (_, i) => ({ knot: hangSpot(i), drop: hangDrop(i) }))

/*
  And threads that have no choice: tied two metres straight above a heavy limb,
  so the fall runs into the wood. The tree's own hang points are chosen to fall
  clear, so without these a pass would only prove that nothing touched.
*/
const blocked: number[] = []
{
  const thick = tree.capsules
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.r > 0.16 && Math.abs(c.a[1] - c.b[1]) < 0.35 && c.a[1] > 3 && Math.hypot(c.a[0], c.a[2]) > 2.5)
  for (let n = 0; n < Math.min(6, thick.length); n++) {
    const { c } = thick[Math.floor((n / 6) * thick.length)]
    const mid: [number, number, number] = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2, (c.a[2] + c.b[2]) / 2]
    blocked.push(specs.length)
    specs.push({ knot: [foot[0] + mid[0] + 0.04, foot[1] + mid[1] + 2.0, foot[2] + mid[2]], drop: 3.4 })
  }
}
const wood = buildWood(tree)
const ropes = buildRopes(specs, foot, PAPER_HEIGHT)

console.log(`the great tree: ${tree.limbs.length} limbs, ${tree.capsules.length} solid, crown ${(tree.spread * 2).toFixed(1)} m across and ${tree.top.toFixed(1)} m high`)
console.log(`${tree.hangs.length} places to hang a thought with a clear fall; ${COUNT} hung, ${ropes.count} points of thread`)

/** How far inside the wood and the ground the worst point is right now, in metres. */
function worstPenetration(r: Ropes, time: number) {
  const B = bendNow(foot, time)
  let worst = 0
  let where = ''
  let touching = 0
  for (let i = 0; i < r.count; i++) {
    if (r.inv[i] === 0) continue
    const p: [number, number, number] = [r.pos[i * 3], r.pos[i * 3 + 1], r.pos[i * 3 + 2]]
    const pr = r.radius[i]
    const ground = groundHeight(foot[0] + p[0], foot[2] + p[2]) - foot[1]
    if (ground - p[1] > worst) {
      worst = ground - p[1]
      where = `point ${i} under the meadow`
    }
    let touches = false
    for (const c of tree.capsules) {
      const a: [number, number, number] = [c.a[0] + B * c.a[1] ** 2, c.a[1], c.a[2] + 0.4 * B * c.a[1] ** 2]
      const b: [number, number, number] = [c.b[0] + B * c.b[1] ** 2, c.b[1], c.b[2] + 0.4 * B * c.b[1] ** 2]
      const d = Math.sqrt(segmentDistanceSq(p, a, b))
      const inside = c.r + pr - d
      if (inside > -0.01) touches = true
      if (inside > worst) {
        worst = inside
        where = `point ${i} (${r.role[i] === 0 ? 'thread' : 'paper'}) inside wood of radius ${c.r.toFixed(2)}`
      }
    }
    if (touches) touching++
  }
  return { worst, where, touching }
}

let stretchWhere = ''
/**
 * How far a thread has stretched, as a share of its whole length — which is
 * what the eye reads — and how far the sheet itself has, which must be rigid.
 */
function worstStretch(r: Ropes) {
  let worst = 0
  for (let k = 0; k < r.ropes; k++) {
    const s0 = r.start[k]
    const n = r.segments[k]
    let along = 0
    for (let s = 0; s < n; s++) {
      const a = (s0 + s) * 3
      const b = a + 3
      along += Math.hypot(r.pos[b] - r.pos[a], r.pos[b + 1] - r.pos[a + 1], r.pos[b + 2] - r.pos[a + 2])
    }
    const thread = Math.abs(along - r.segLength[k] * n) / (r.segLength[k] * n)
    const a = (s0 + n) * 3
    const sheet = Math.abs(Math.hypot(r.pos[a + 3] - r.pos[a], r.pos[a + 4] - r.pos[a + 1], r.pos[a + 5] - r.pos[a + 2]) - r.paperHeight) / r.paperHeight
    if (thread > worst) { worst = thread; stretchWhere = `thread ${k}` }
    if (sheet > worst) { worst = sheet; stretchWhere = `sheet ${k}` }
  }
  return worst
}

function knotDrift(r: Ropes, time: number) {
  const B = bendNow(foot, time)
  let worst = 0
  for (let k = 0; k < r.ropes; k++) {
    const kx = r.knot[k * 3], ky = r.knot[k * 3 + 1], kz = r.knot[k * 3 + 2]
    const i = r.start[k] * 3
    worst = Math.max(worst, Math.hypot(r.pos[i] - (kx + B * ky * ky), r.pos[i + 1] - ky, r.pos[i + 2] - (kz + 0.4 * B * ky * ky)))
  }
  return worst
}

let time = 0
let worst = { worst: 0, where: '' }
let maxStretch = 0
let maxKnot = 0
let maxTouching = 0
let everTouched = new Set<number>()
let elapsed = 0
let steps = 0
let onSecond: (() => void) | null = null
let stretchAt = ''

function run(seconds: number, wind: number, label: string) {
  treeClock.wind = wind
  const n = Math.round(seconds / STEP)
  let labelWorst = 0
  for (let s = 0; s < n; s++) {
    time += STEP
    const started = performance.now()
    stepRopes(ropes, wood, foot, time, wind)
    elapsed += performance.now() - started
    steps++
    if (s % 20 === 19) onSecond?.()
    // Every step for the stretch and the knots; the wood every fifth, which is still twelve times a second.
    const stretched = worstStretch(ropes)
    if (stretched > maxStretch) {
      maxStretch = stretched
      stretchAt = `${stretchWhere} during ${label}`
    }
    maxKnot = Math.max(maxKnot, knotDrift(ropes, time))
    if (s % 5 === 0) {
      const p = worstPenetration(ropes, time)
      if (p.worst > worst.worst) worst = p
      labelWorst = Math.max(labelWorst, p.worst)
      maxTouching = Math.max(maxTouching, p.touching)
      if (p.touching > 0) {
        for (let k = 0; k < ropes.ropes; k++) {
          // Which ropes have had any point against wood at some moment.
          const s0 = ropes.start[k]
          for (let q = 1; q < ropes.segments[k] + 2; q++) {
            const i = s0 + q
            const pt: [number, number, number] = [ropes.pos[i * 3], ropes.pos[i * 3 + 1], ropes.pos[i * 3 + 2]]
            const B = bendNow(foot, time)
            if (tree.capsules.some((c) => Math.sqrt(segmentDistanceSq(pt, [c.a[0] + B * c.a[1] ** 2, c.a[1], c.a[2] + 0.4 * B * c.a[1] ** 2], [c.b[0] + B * c.b[1] ** 2, c.b[1], c.b[2] + 0.4 * B * c.b[1] ** 2])) < c.r + ropes.radius[i] + 0.01)) {
              everTouched.add(k)
              break
            }
          }
        }
      }
    }
  }
  console.log(`  ${label.padEnd(22)} worst inside wood or ground ${(labelWorst * 1000).toFixed(1)} mm`)
}

run(4, 1, 'settling')
// Where the blocked sheets hang once settled, to show they still swing after draping.
const settledPapers = blocked.map((k) => {
  const i = (ropes.start[k] + ropes.segments[k] + 1) * 3
  return [ropes.pos[i], ropes.pos[i + 1], ropes.pos[i + 2]]
})
const blockedTravel = blocked.map(() => 0)
const trackBlocked = () => blocked.forEach((k, n) => {
  const i = (ropes.start[k] + ropes.segments[k] + 1) * 3
  blockedTravel[n] = Math.max(blockedTravel[n], Math.hypot(ropes.pos[i] - settledPapers[n][0], ropes.pos[i + 2] - settledPapers[n][2]))
})
onSecond = trackBlocked
run(120, 1, 'two minutes of breeze')
run(60, 2.2, 'a minute of gale')
run(30, 0.2, 'nearly still')

console.log(`  worst anywhere          ${(worst.worst * 1000).toFixed(1)} mm ${worst.where}`)
console.log(`  threads stretched       at most ${(maxStretch * 100).toFixed(2)}% (${stretchAt})`)
console.log(`  knots off their branch  at most ${(maxKnot * 1000).toFixed(2)} mm`)
console.log(`  threads that met wood   ${everTouched.size} of ${ropes.ropes}, up to ${maxTouching} points at once`)
console.log(`  draped over a limb      ${blocked.filter((k) => everTouched.has(k)).length} of ${blocked.length}; their sheets still swung ${blockedTravel.map((d) => `${(d * 100).toFixed(0)}cm`).join(' ')}`)
console.log(`  one step of ${ropes.ropes} threads ${(elapsed / steps).toFixed(3)} ms`)

// Collision resolution is positional, so the last constraint pass can leave a
// few millimetres; more than a centimetre is a thread visibly in a branch.
assert(worst.worst < 0.012, `a thread is ${(worst.worst * 1000).toFixed(1)} mm inside something solid: ${worst.where}`)
assert(maxStretch < 0.06, `a thread stretched ${(maxStretch * 100).toFixed(1)}%`)
assert(maxKnot < 0.002, `a knot left its branch by ${(maxKnot * 1000).toFixed(1)} mm`)
assert(blocked.length >= 3, 'the tree has no heavy level limbs to test a draped thread on')
assert(blocked.every((k) => everTouched.has(k)), 'a thread tied above a limb never touched it — it went through')
assert(blockedTravel.every((d) => d > 0.05), 'a draped thread froze on its branch instead of swinging on from it')
assert(elapsed / steps < 4, 'the threads are too slow to run every frame')
assert(tree.hangs.length >= 40, 'the tree has too few clear places to hang a thought')
console.log('PASS the threads are ropes and the tree is solid')
