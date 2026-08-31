/**
 * The Moonbreak, measured — and its landmarks kept on their corners.
 *
 * ---------------------------------------------------------------------------
 * This road is *authored*, not dealt. The Rootway is a bag of pieces, so
 * hardening it meant hardening the vocabulary and every road improved at once.
 * Here every corner is written down by hand, and so is everything that points
 * at one: the arches, the orchard, the braking pearls, and the two portals of
 * the Drowned Mile all live at fixed distances in `MOONBREAK`.
 *
 * Which makes one mistake very easy and very quiet. Change the *length* of any
 * band and everything after it slides — an arch ends up over a straight, a
 * braking marker warns about nothing, and the tube's mouth is no longer where
 * the road goes under. Nothing throws; it just stops meaning anything.
 *
 * So the rule this enforces is: **only curvature, width, room and wet may
 * change.** Lengths are load-bearing. Adding a corner means splitting a
 * straight into pieces that sum to exactly what it was.
 *
 *   npm run moonbreak
 * ---------------------------------------------------------------------------
 */

import { makeTrack, roadAt, MOONBREAK, WATER_Y } from '../src/world/games/ember-rally/track'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

const FLAT = 69
const track = makeTrack(7, 'moonbreak')

/** Every corner on the road: where it is, how tight, and how much room. */
function corners() {
  const found: { at: number; r: number; width: number }[] = []
  let run: { r: number; w: number }[] = []
  for (let i = 4; i < Math.round(track.finishAt); i++) {
    const k = Math.abs(track.curv[i])
    if (k > 1 / 140) run.push({ r: 1 / k, w: track.width[i] * 2 })
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

const all = corners()
const braking = all.filter((c) => c.r < FLAT)

console.log(`\nThe road\n`)
console.log(`  ${Math.round(track.finishAt)}m, ${all.length} corners, ${braking.length} of them needing a brake`)
console.log(`  tightest r${Math.min(...all.map((c) => c.r)).toFixed(0)}m`)
let narrow = Infinity
for (let i = 4; i < Math.round(track.finishAt); i++) narrow = Math.min(narrow, track.width[i] * 2)
console.log(`  narrowest road ${narrow.toFixed(1)}m`)
console.log(`  every corner: ${all.map((c) => `r${c.r.toFixed(0)}`).join(' ')}`)

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
  The Moonhook's braking pearls. `MOONBREAK.hard` names its approach, apex and
  exit, and a marker that has drifted off its corner is worse than no marker —
  it teaches the wrong braking point, confidently.
*/
const hard = MOONBREAK.hard
const veryHard = MOONBREAK.veryHard
const nearest = (at: number) =>
  all.reduce((best, c) => (Math.abs(c.at - at) < Math.abs(best.at - at) ? c : best))
for (const [name, spot] of [['Tidecut', hard], ['the Moonhook', veryHard]] as const) {
  ok(
    `${name}'s pearls still point at a real corner`,
    Math.abs(nearest(spot.apex).at - spot.apex) < 70,
    `the apex is called ${spot.apex}m; nearest corner is at ${Math.round(nearest(spot.apex).at)}m`,
  )
}

// The orchard is a named stretch of esses, and should contain some.
ok(
  'the orchard still has its esses in it',
  all.some((c) => c.at > MOONBREAK.orchard.from - 30 && c.at < MOONBREAK.orchard.to + 30),
  `nothing turns between ${MOONBREAK.orchard.from} and ${MOONBREAK.orchard.to}`,
)

console.log('')
if (failed > 0) {
  console.log(`  ${failed} thing(s) wrong.\n`)
  process.exit(1)
}
console.log('  the Moonbreak is where it says it is\n')
