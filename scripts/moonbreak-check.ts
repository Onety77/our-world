/**
 * The Moonbreak, measured — and its landmarks kept on their corners.
 *
 * ---------------------------------------------------------------------------
 * This road is *authored*, not dealt. The Rootway is a bag of pieces, so
 * hardening it meant hardening the vocabulary and every road improved at once.
 * Here every corner is written down by hand.
 *
 * **The old rule here was that lengths were load-bearing** — that an arch at
 * 68 m and a tube mouth at 1016 m were hand-written constants, so lengthening
 * any band slid everything after it off its mark, silently. That rule is gone,
 * because the thing it was protecting is gone: `MOONBREAK` is now *derived* by
 * `layMoonbreak`, which lays the road in named sections and reports where they
 * landed. Lengths are free.
 *
 * What is left to check is that the derivation is right, which is a different
 * and better question, and that the road is still the road it is supposed to
 * be: harder than the Rootway, in the ways only this place can be.
 *
 *   npm run moonbreak
 * ---------------------------------------------------------------------------
 */

import { makeTrack, roadAt, MOONBREAK, WATER_Y, STEP } from '../src/world/games/ember-rally/track'
import { advanceCar, createCar, speedOf, type CarInput } from '../src/world/games/ember-rally/physics'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

/** The radius the car can hold flat out. Anything tighter is a brake. */
const FLAT = 69
const track = makeTrack(7, 'moonbreak')
const root = makeTrack(7, 'rootway')

/** Every corner on a road: where it is, how tight, and how much room. */
function corners(t = track) {
  const found: { at: number; r: number; width: number }[] = []
  let run: { r: number; w: number }[] = []
  for (let i = 4; i < Math.round(t.finishAt); i++) {
    const k = Math.abs(t.curv[i])
    if (k > 1 / 140) run.push({ r: 1 / k, w: t.width[i] * 2 })
    else {
      if (run.length > 12) {
        found.push({
          at: i - run.length / 2,
          r: Math.min(...run.map((x) => x.r)),
          width: Math.min(...run.map((x) => x.w)),
        })
      }
      run = []
    }
  }
  return found
}

function narrowest(t = track) {
  let n = Infinity
  for (let i = 4; i < Math.round(t.finishAt); i++) n = Math.min(n, t.width[i] * 2)
  return n
}

/** Where the road is narrowest, in metres along it. */
function argNarrowest(t = track) {
  let n = Infinity
  let at = 0
  for (let i = 4; i < Math.round(t.finishAt); i++) {
    if (t.width[i] * 2 < n) { n = t.width[i] * 2; at = i * STEP }
  }
  return at
}

const all = corners()
const braking = all.filter((c) => c.r < FLAT)

console.log(`\nThe road\n`)
console.log(
  `  ${Math.round(track.finishAt)}m, ${all.length} corners, ${braking.length} of them needing a brake`,
)
console.log(`  tightest r${Math.min(...all.map((c) => c.r)).toFixed(0)}m`)
console.log(`  narrowest road ${narrowest().toFixed(1)}m`)
console.log(`  every corner: ${all.map((c) => `r${c.r.toFixed(0)}`).join(' ')}`)

/*
  ===========================================================================
  Harder than the Rootway, and not by being the same road with the dials
  turned — that was the first attempt at this and it changed nothing you could
  feel. Measured against the actual Rootway, built right here, rather than
  against a number somebody wrote down once.
  ===========================================================================
*/
const rootCorners = corners(root)
const rootBraking = rootCorners.filter((c) => c.r < FLAT)
console.log(`\nHarder than the Rootway\n`)
console.log(
  `  Rootway:   ${Math.round(root.finishAt)}m, ${rootCorners.length} corners, ` +
    `${rootBraking.length} braking, tightest ` +
    `r${Math.min(...rootCorners.map((c) => c.r)).toFixed(0)}, ` +
    `narrowest ${narrowest(root).toFixed(1)}m`,
)
ok(
  'it is the longer road',
  track.finishAt > root.finishAt,
  `${Math.round(track.finishAt)}m against ${Math.round(root.finishAt)}m`,
)
ok('it asks more corners of you', all.length > rootCorners.length, `${all.length} against ${rootCorners.length}`)
ok(
  'and more of them need a brake',
  braking.length > rootBraking.length,
  `${braking.length} against ${rootBraking.length}`,
)
/*
  Not "narrower than the Rootway" — it is not, quite, and forcing it to be
  would be turning a dial to satisfy a test. The Rootway's narrowest is a
  tunnel throat carved out of rock and it can afford to be six and a half
  metres because it is standing still and so are its walls.

  What is actually being claimed here is that the Moonbreak's tightest place is
  in the same class as the Rootway's *and* moving, which is the harder thing.
  So: within half a metre of it, and swinging.
*/
const tightest = narrowest()
ok(
  'its narrowest is as tight as the Rootway ever gets, and it moves',
  tightest < narrowest(root) + 0.6 && track.sway[Math.round(argNarrowest() / STEP)] > 0.5,
  `${tightest.toFixed(1)}m against ${narrowest(root).toFixed(1)}m, ` +
    `sway ${track.sway[Math.round(argNarrowest() / STEP)].toFixed(2)} there`,
)

/*
  ===========================================================================
  Height. The Rootway is a cave floor. This is the one thing it structurally
  cannot do, so the Moonbreak had better do it: a real climb, a crest you
  cannot see over, and a descent that arrives at the hardest corner on either
  road while the car is still going down.
  ===========================================================================
*/
let lowest = Infinity
let highest = -Infinity
for (let i = 0; i < Math.round(track.finishAt / STEP); i++) {
  lowest = Math.min(lowest, track.y[i])
  highest = Math.max(highest, track.y[i])
}
console.log(`\nHeight\n`)
console.log(`  ${lowest.toFixed(1)}m to ${highest.toFixed(1)}m — ${(highest - lowest).toFixed(0)}m of it`)

ok('there is a real hill on this road', highest > 20, `the top of it is ${highest.toFixed(1)}m`)
ok(
  'the Sky Stair climbs to the top of it',
  roadAt(track, MOONBREAK.crest).y > highest - 3,
  `the crest is at ${roadAt(track, MOONBREAK.crest).y.toFixed(1)}m, the top is ${highest.toFixed(1)}m`,
)
ok(
  'the crest turns while you are over it',
  Math.abs(roadAt(track, MOONBREAK.crest).curv) > 1 / 90,
  `r${(1 / Math.abs(roadAt(track, MOONBREAK.crest).curv)).toFixed(0)} over the top`,
)

/*
  The Fall's whole point is that you are still going down when you get there.
  If this ever levels out before the Moonhook the corner becomes ordinary.
*/
const hookApproach = roadAt(track, MOONBREAK.veryHard.apex - 90).grade
ok(
  'and you are still falling when the Moonhook arrives',
  hookApproach < -0.02,
  `the grade ninety metres out is ${(hookApproach * 100).toFixed(1)}%`,
)

/*
  Both fires stand on the same water. The start and the finish are one place
  seen from two ends, so a road that finishes ten metres in the air has a
  visible seam in it.
*/
const seam = roadAt(track, track.finishAt).y - roadAt(track, track.start).y
ok(
  'and it comes back to the water it started on',
  Math.abs(seam) < 1.5,
  `the finish is ${seam.toFixed(2)}m off the start`,
)

/*
  ===========================================================================
  The Swaying Span. The first piece of road in this game that moves — see
  `Band.sway` — and what has to be checked about it is not that it exists but
  that it is *drivable*: hard enough to be the point of the section, not so
  hard that it is a coin toss.
  ===========================================================================
*/
console.log(`\nThe Swaying Span\n`)
let swayed = 0
let peak = 0
for (let i = 0; i < Math.round(track.finishAt / STEP); i++) {
  if (track.sway[i] > 0.05) swayed++
  peak = Math.max(peak, track.sway[i])
}
const span = MOONBREAK.span
const middle = Math.round((span.from + span.to) / 2 / STEP)
console.log(
  `  ${Math.round(span.to - span.from)}m of it, ${swayed}m of it moving, peak ${peak.toFixed(2)}`,
)

ok('the span is a road that moves', peak > 0.9 && swayed > 150, `peak ${peak.toFixed(2)} over ${swayed}m`)
ok(
  'and it is the narrowest thing on the road',
  track.width[middle] * 2 < narrowest() + 0.2,
  `${(track.width[middle] * 2).toFixed(1)}m across the middle of it`,
)
ok(
  'and nothing else on the road is moving',
  track.sway[Math.round((span.from - 90) / STEP)] < 0.02 &&
    track.sway[Math.round((span.to + 90) / STEP)] < 0.02,
  'the sway has leaked outside the span',
)

/*
  Drive it, twice.

  A driver holding the wheel dead straight is the floor of competence, and on a
  swinging bridge the floor must not be enough — otherwise the span is scenery
  with a rumble. A driver actually working at it must get across with some road
  to spare, because a section nobody can drive is not difficulty, it is a wall.
  The gap between those two runs is what a person's attention is worth here.

  Both start *on* the span at racing speed rather than a hundred metres before
  it. The approach is a downhill left off the crest arch, so a hands-still car
  leaves the road there and never reaches the bridge — which measures the
  approach, not the span, and was quietly doing exactly that at first.
*/
const DT = 1 / 120
const still: CarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false }
function crossTheSpan(hands: 'still' | 'working') {
  const car = createCar(track)
  // Up to speed standing still, then put back on the line.
  for (let i = 0; i < 120 * 25; i++) {
    advanceCar(track, car, { ...still, throttle: 1 }, DT)
    if (speedOf(car) > 30) break
  }
  car.s = span.from - 6
  car.n = 0
  car.psi = 0
  let worst = 0
  for (let i = 0; i < 120 * 60 && car.s < span.to; i++) {
    const road = roadAt(track, car.s)
    /*
      The "working" driver holds the middle *and reads the bend* — the feed
      -forward term is the whole difference between a driver and a spring, and
      without it this reported the span as impossible when it is not.
    */
    const wheel =
      hands === 'still'
        ? 0
        : Math.max(-1, Math.min(1, -car.n * 0.35 - car.psi * 2.4 + road.curv * 60))
    advanceCar(track, car, { ...still, steer: wheel, throttle: 0.72 }, DT)
    if (car.s < span.from) continue
    worst = Math.max(worst, Math.abs(car.n) / road.width)
    if (Math.abs(car.n) > road.width) return { off: true, at: car.s, worst }
  }
  return { off: false, at: car.s, worst }
}
const lazy = crossTheSpan('still')
const trying = crossTheSpan('working')
const far = (r: typeof lazy) =>
  r.off
    ? `off the edge ${Math.round(r.at - span.from)}m in`
    : `across, and used ${(r.worst * 100).toFixed(0)}% of the road doing it`
console.log(`  hands still:  ${far(lazy)}`)
console.log(`  driving it:   ${far(trying)}`)

ok(
  'a driver who does nothing is off it almost at once',
  lazy.off && lazy.at - span.from < (span.to - span.from) / 2,
  'the span can be crossed hands-off, which makes it scenery',
)
ok(
  'and a driver who works at it gets across',
  !trying.off,
  `even reading the bends it goes off ${Math.round(trying.at - span.from)}m in`,
)
ok(
  'but only just — it costs most of the road',
  trying.worst > 0.25,
  `it only ever used ${(trying.worst * 100).toFixed(0)}% of the road, so the span is not asking anything`,
)

console.log(`\nThe landmarks are still on the things they mark\n`)

/*
  The tube's two portals are the load-bearing pair: `Moonbreak.tsx` builds glass
  between these two numbers and the light in `Race` is driven off the car's
  depth. If the road stops going under the water exactly here, the tube is glass
  over open air and the dark arrives in the wrong place.
*/
const under = MOONBREAK.deep.under
ok(
  'the road goes under the water where the tube says it does',
  roadAt(track, under.in).y < WATER_Y + 1 && roadAt(track, under.in - 60).y > WATER_Y,
  `at ${under.in}m the road is ${roadAt(track, under.in).y.toFixed(1)}m, water is ${WATER_Y}`,
)
ok(
  'and comes back up where it says it does',
  roadAt(track, under.out).y < WATER_Y + 1 && roadAt(track, under.out + 60).y > WATER_Y,
  `at ${under.out}m the road is ${roadAt(track, under.out).y.toFixed(1)}m`,
)
ok(
  'and the deepest point is deep enough to be dark',
  WATER_Y - roadAt(track, (under.in + under.out) / 2).y > 12,
  `${(WATER_Y - roadAt(track, (under.in + under.out) / 2).y).toFixed(1)}m down`,
)

/*
  The braking pearls. `MOONBREAK.hard` and `.veryHard` name an approach, an apex
  and an exit, and a marker that has drifted off its corner is worse than no
  marker — it teaches the wrong braking point, confidently.
*/
const nearest = (at: number) =>
  all.reduce((best, c) => (Math.abs(c.at - at) < Math.abs(best.at - at) ? c : best))
for (const [name, spot] of [
  ['Tidecut', MOONBREAK.hard],
  ['the Moonhook', MOONBREAK.veryHard],
] as const) {
  ok(
    `${name}'s pearls still point at a real corner`,
    Math.abs(nearest(spot.apex).at - spot.apex) < 70,
    `the apex is called ${spot.apex}m; nearest corner is at ${Math.round(nearest(spot.apex).at)}m`,
  )
}

// The orchard is a named stretch of esses, and should contain some.
ok(
  'the orchard still has its esses in it',
  all.filter((c) => c.at > MOONBREAK.orchard.from - 30 && c.at < MOONBREAK.orchard.to + 30).length >= 2,
  `nothing turns between ${MOONBREAK.orchard.from} and ${MOONBREAK.orchard.to}`,
)

// Every arch should be over road, and they should be in order along it.
ok(
  'the arches are all on the road and in order',
  MOONBREAK.arches.every(
    (a, i) => a > 0 && a < track.finishAt && (i === 0 || a > MOONBREAK.arches[i - 1]),
  ),
  MOONBREAK.arches.join(' '),
)

console.log('')
if (failed > 0) {
  console.log(`  ${failed} thing(s) wrong.\n`)
  process.exit(1)
}
console.log('  the Moonbreak is where it says it is\n')
