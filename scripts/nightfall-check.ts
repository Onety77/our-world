/**
 * The Nightfall, measured.
 *
 * -----------------------------------------------------------------------------
 * The road through the garden is meant to be *everything at once* — the fast
 * open Meadow, the technical Wellspring, the Rootway's language in the Hollow,
 * the fastest kilometre in the game under the Stars, and a lane that tightens
 * to the fire. So this measures each stretch against what it claims to be,
 * checks the places come in the order you browse them, checks the Hearth Ring
 * really goes round the hearth, and then asks the crude driver every road here
 * is asked to finish it without getting stuck.
 *
 *   npm run nightfall
 * -----------------------------------------------------------------------------
 */

import { makeTrack, roadAt, NIGHTFALL, STEP } from '../src/world/games/ember-rally/track'
import { advanceCar, createCar, speedOf, type CarInput } from '../src/world/games/ember-rally/physics'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

/** The radius the car can hold flat out. Anything tighter is a brake. */
const FLAT = 69

const track = makeTrack(7, 'nightfall')
const others = [
  ['Rootway', makeTrack(7, 'rootway')],
  ['Moonbreak', makeTrack(7, 'moonbreak')],
  ['Stormcrown', makeTrack(7, 'stormcrown')],
  ['Harmattan', makeTrack(7, 'harmattan')],
] as const

function corners(t = track, from = 4, to = Math.round(t.finishAt)) {
  const found: { at: number; r: number; width: number }[] = []
  let run: { r: number; w: number }[] = []
  for (let i = from; i < to; i++) {
    const k = Math.abs(t.curv[i])
    if (k > 1 / 140) run.push({ r: 1 / k, w: t.width[i] * 2 })
    else {
      if (run.length > 12) {
        found.push({ at: i - run.length / 2, r: Math.min(...run.map((x) => x.r)), width: Math.min(...run.map((x) => x.w)) })
      }
      run = []
    }
  }
  return found
}
function narrowest(t = track, from = 4, to = Math.round(t.finishAt)) {
  let n = Infinity
  for (let i = from; i < to; i++) n = Math.min(n, t.width[i] * 2)
  return n
}
function straightShare(t = track, from = 4, to = Math.round(t.finishAt)) {
  let flat = 0
  for (let i = from; i < to; i++) if (Math.abs(t.curv[i]) < 1 / 400) flat++
  return flat / (to - from)
}

const all = corners()
const braking = all.filter((c) => c.r < FLAT)
console.log('\nThe road\n')
console.log(`  ${Math.round(track.finishAt)}m, ${all.length} corners, ${braking.length} of them needing a brake`)
console.log(`  tightest r${Math.min(...all.map((c) => c.r)).toFixed(0)}m, narrowest ${narrowest().toFixed(1)}m, ${(straightShare() * 100).toFixed(0)}% near straight`)
const ys = Array.from(track.y)
console.log(`  from ${Math.min(...ys).toFixed(0)}m below the start to ${Math.max(...ys).toFixed(0)}m above it`)

console.log('\nAgainst the other four\n')
for (const [name, t] of others) {
  const c = corners(t)
  console.log(
    `  ${name.padEnd(11)}${String(Math.round(t.finishAt)).padStart(5)}m  ${String(c.length).padStart(2)} corners  ` +
      `${String(c.filter((x) => x.r < FLAT).length).padStart(2)} braking  tightest r${Math.min(...c.map((x) => x.r)).toFixed(0).padStart(3)}  ` +
      `narrowest ${narrowest(t).toFixed(1)}m  ${(straightShare(t) * 100).toFixed(0)}% straight`,
  )
}

console.log('\nThe places, in the order you browse them\n')
const order = [
  ['the Meadow', NIGHTFALL.meadow.from],
  ['the Wellspring', NIGHTFALL.wellspring.from],
  ['the Hollow', NIGHTFALL.hollow.from],
  ['the Stars', NIGHTFALL.stars.from],
  ['the Lantern Walk', NIGHTFALL.walk.from],
] as const
console.log('  ' + order.map(([name, at]) => `${name} ${Math.round(at)}m`).join('\n  '))
ok('they come in that order', order.every(([, at], i) => i === 0 || at > order[i - 1][1]))
ok('and the road ends in the walk', track.finishAt > NIGHTFALL.walk.from && track.finishAt < NIGHTFALL.walk.to)

const stretch = (m: { from: number; to: number }) => [Math.round(m.from), Math.round(m.to)] as const

// The Meadow: fast, wide, and one long corner round the tree.
{
  const [from, to] = stretch(NIGHTFALL.meadow)
  const c = corners(track, from, to)
  const tree = c.find((x) => x.at > NIGHTFALL.treeTurn.from && x.at < NIGHTFALL.treeTurn.to)
  ok('the Meadow is the widest stretch bar the plain', narrowest(track, from, to) > 9.6, `${narrowest(track, from, to).toFixed(1)}m`)
  ok('the Tree Turn is one corner, held for eighty metres', !!tree && tree.r < 26 && tree.r > 18, tree ? `r${tree.r.toFixed(0)}` : 'no corner found')
  ok('and it is the only corner on the Meadow that asks for a brake', c.filter((x) => x.r < FLAT).length === 1, `${c.filter((x) => x.r < FLAT).length} braking corners`)
}

// The Wellspring: down, wet at the fords and nowhere else on the way down.
{
  const [from, to] = stretch(NIGHTFALL.wellspring)
  const drop = track.y[Math.round(NIGHTFALL.meadow.to) - 100] - Math.min(...ys.slice(from, to))
  ok('the road goes down into the valley', drop > 4, `${drop.toFixed(1)}m down`)
  const wetAt = (s: number) => track.wet[Math.round(s) + 20]
  ok('both fords are wet', NIGHTFALL.fords.every((s) => wetAt(s) > 0.6), NIGHTFALL.fords.map((s) => wetAt(s).toFixed(2)).join(' '))
  ok('and the Meadow is dry', Math.max(...Array.from(track.wet.slice(4, Math.round(NIGHTFALL.meadow.to)))) < 0.15)
  ok('the road climbs back out before the cave', track.y[Math.round(NIGHTFALL.hollow.from)] > Math.min(...ys.slice(from, to)) + 2)
}

// The Hollow: enclosed, with the ring going most of the way round the hearth.
{
  const [from, to] = stretch(NIGHTFALL.hollow)
  ok('the Hollow has a roof', Math.max(...Array.from(track.ceiling.slice(from + 30, to - 30))) < 20 && Math.min(...Array.from(track.ceiling.slice(from + 30, to - 30))) < 8)
  let turned = 0
  for (let i = Math.round(NIGHTFALL.ring.from); i < Math.round(NIGHTFALL.ring.to); i++) turned += track.curv[i] * STEP
  ok('the Hearth Ring turns most of the way round', (turned * 57.3) > 200 && (turned * 57.3) < 320, `${(turned * 57.3).toFixed(0)}°`)
  const ringRadius = 1 / Math.max(...Array.from(track.curv.slice(Math.round(NIGHTFALL.ring.from) + 10, Math.round(NIGHTFALL.ring.to) - 10)))
  ok('at fifteen metres or so', ringRadius > 13 && ringRadius < 18, `r${ringRadius.toFixed(1)}`)
  ok('it is the narrowest place on the road bar the walk', narrowest(track, from, to) < 7.6, `${narrowest(track, from, to).toFixed(1)}m`)
  ok('and the cave is deeper than the valley', Math.min(...ys.slice(from, to)) < Math.min(...ys.slice(...stretch(NIGHTFALL.wellspring))) - 1)
}

// The Stars: the fastest kilometre on any road here.
{
  const [from, to] = stretch(NIGHTFALL.stars)
  const c = corners(track, from, to)
  ok('the Stars is nearly a kilometre', to - from > 900, `${to - from}m`)
  ok('the widest road anywhere', narrowest(track, from + 20, to - 200) > 10, `${narrowest(track, from + 20, to - 200).toFixed(1)}m`)
  ok('with one corner that needs a brake', c.filter((x) => x.r < FLAT).length === 1, `${c.filter((x) => x.r < FLAT).length}`)
  const share = straightShare(track, from, to)
  const others4 = others.map(([, t]) => straightShare(t))
  ok('and straighter than any whole road here', share > Math.max(...others4), `${(share * 100).toFixed(0)}% against ${others4.map((x) => (x * 100).toFixed(0)).join(', ')}`)
}

// The Lantern Walk: narrow, twisting, and tightening.
{
  const [from, to] = stretch(NIGHTFALL.walk)
  const c = corners(track, from, to - 140)
  ok('the walk is the narrowest stretch', narrowest(track, from + 20, to - 150) < 7.2, `${narrowest(track, from + 20, to - 150).toFixed(1)}m`)
  ok('with more braking corners per kilometre than any whole road', c.filter((x) => x.r < FLAT).length / ((to - 140 - from) / 1000) > 8, `${c.filter((x) => x.r < FLAT).length} in ${to - 140 - from}m`)
  const tightest = Math.min(...c.map((x) => x.r))
  const outsideRing = all.filter((x) => x.at < NIGHTFALL.ring.from || x.at > NIGHTFALL.ring.to)
  ok('and the tightest corner outside the ring is in it', tightest <= Math.min(...outsideRing.map((x) => x.r)) + 0.01, `r${tightest.toFixed(0)}`)
}

/*
  The lights are where the briefing says: a hearth in the ring, two over the
  plain, lanterns down the walk and nowhere on the Meadow.
*/
{
  const on = (m: { from: number; to: number }) => track.lanterns.filter((l) => l.s > m.from && l.s < m.to)
  ok('the hearth burns in the ring', on(NIGHTFALL.ring).some((l) => l.fire), `${on(NIGHTFALL.ring).length} lights`)
  const pair = on(NIGHTFALL.stars).filter((l) => !l.fire)
  ok('two lights stand over the cairn at the bend, one warm, one cool, close and not touching',
    pair.length === 2 && pair.some((l) => l.warm === 1) && pair.some((l) => l.warm === 0) &&
      pair.every((l) => Math.abs(l.s - NIGHTFALL.starsBend - 30) < 1) &&
      Math.abs(pair[0].n - pair[1].n) > 1 && Math.abs(pair[0].n - pair[1].n) < 2 && pair[0].y !== pair[1].y)
  ok('the walk is lit by lanterns', on(NIGHTFALL.walk).length > 30, `${on(NIGHTFALL.walk).length}`)
  ok('and the Meadow by nothing but the sky', on(NIGHTFALL.meadow).filter((l) => l.s > 40).length === 0)
}

// The road never comes back over itself closer than a tree's height — except
// in the games room, where the way in and the way out are two roads across one floor.
{
  let nearest = Infinity
  let where = ''
  const room = (s: number) => s > NIGHTFALL.ring.from - 60 && s < NIGHTFALL.ring.to + 60
  for (let s = 0; s < track.length; s += 6) {
    const a = roadAt(track, s)
    for (let t = s + 120; t < track.length; t += 3) {
      if (room(s) && room(t)) continue
      const b = roadAt(track, t)
      const d = Math.hypot(a.x - b.x, a.z - b.z)
      if (d < nearest) { nearest = d; where = `${s}m and ${t}m` }
    }
  }
  // Twenty: the way in to the Tree Turn and the way out of it pass with the tree between them.
  ok('the road never runs back within twenty metres of itself', nearest > 20, `${nearest.toFixed(0)}m apart at ${where}`)
}

console.log('\nAnd it can be driven\n')
{
  const DT = 1 / 120
  const car = createCar(track)
  const road = roadAt(track, car.s)
  let offRoad = 0
  let stuck = 0
  let longestStuck = 0
  let ticks = 0
  const seen: number[] = []
  const sectors: number[] = []
  const marks = order.map(([, at]) => at).slice(1)
  let nextMark = 0
  let sectorStart = 0
  while (car.s < track.finishAt && ticks < 240_000) {
    roadAt(track, car.s, road)
    const ahead = roadAt(track, Math.min(track.finishAt, car.s + 34))
    const steer = Math.max(-1, Math.min(1, (road.line - car.n) * 0.22 - car.psi * 1.5))
    const tight = Math.abs(ahead.curv) > 1 / 70
    const input: CarInput = { steer, throttle: tight ? 0.25 : 1, brake: tight && speedOf(car) > 22 ? 0.5 : 0, handbrake: false, boost: false }
    advanceCar(track, car, input, DT)
    if (Math.abs(car.n) > road.width) offRoad++
    if (car.s > 60) {
      if (speedOf(car) < 3) { stuck++; longestStuck = Math.max(longestStuck, stuck) }
      else stuck = 0
    }
    if (ticks % 600 === 0 && car.s > 60) seen.push(speedOf(car))
    if (nextMark < marks.length && car.s >= marks[nextMark]) {
      sectors.push((ticks - sectorStart) * DT)
      sectorStart = ticks
      nextMark++
    }
    ticks++
  }
  sectors.push((ticks - sectorStart) * DT)
  const finished = car.s >= track.finishAt
  console.log(`  ${(ticks * DT).toFixed(1)}s, off the road for ${(offRoad * DT).toFixed(1)}s of it, longest crawl ${(longestStuck * DT).toFixed(1)}s`)
  console.log(`  sector seconds   ${sectors.map((s) => s.toFixed(1)).join(' · ')}\n                   meadow · wellspring · hollow · stars · walk`)
  ok('a crude driver gets to the end of it', finished, `reached ${car.s.toFixed(0)}m`)
  ok('without living in the scenery', offRoad * DT < ticks * DT * 0.25, `${((offRoad / ticks) * 100).toFixed(0)}% of the run off the road`)
  ok('and there is nowhere on it you can get stuck', longestStuck * DT < 4, `it crawled for ${(longestStuck * DT).toFixed(1)}s in one go`)
  ok('and it is never reduced to walking pace for long', Math.min(...seen) > 2, `slowest sample ${Math.min(...seen).toFixed(1)} m/s`)
}

console.log(failed ? `\n${failed} failed\n` : '\nThe garden holds.\n')
process.exit(failed ? 1 : 0)
