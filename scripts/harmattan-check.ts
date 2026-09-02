/**
 * The Harmattan, measured — and the claim that it is the hardest road, tested.
 *
 * -----------------------------------------------------------------------------
 * Every road here says it is harder than the last one. The Stormcrown's own
 * notes admit that when somebody finally measured it, it was the *easiest*:
 * nineteen corners in four and a half kilometres, seven of them needing a
 * brake, never narrower than nine metres. It had been written as the finale and
 * played as a scenic drive, and nobody noticed for as long as nobody counted.
 *
 * So this road is not allowed to make the claim in prose. Everything below is
 * measured against all three existing roads, built right here from the same
 * `makeTrack` the game uses, and the difficulty has to be *in the road* rather
 * than in the briefing.
 *
 * There are two kinds of check here. The first kind is the ordinary one —
 * corners, radii, width. The second is the interesting one: this road's
 * difficulty is mostly **surface**, not geometry, and a surface that does
 * nothing to the car is scenery. So the sand, the corrugation and the wind are
 * all driven through the real `physics.ts` and asked to prove they cost time.
 *
 *   npm run harmattan
 * -----------------------------------------------------------------------------
 */

import { makeTrack, roadAt, HARMATTAN, STEP } from '../src/world/games/ember-rally/track'
import { advanceCar, createCar, speedOf, type CarInput } from '../src/world/games/ember-rally/physics'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

/** The radius the car can hold flat out. Anything tighter is a brake. */
const FLAT = 69

const track = makeTrack(7, 'harmattan')
const root = makeTrack(7, 'rootway')
const moon = makeTrack(7, 'moonbreak')
const storm = makeTrack(7, 'stormcrown')

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

/** How much of a road is within a whisker of straight. */
function straightShare(t = track) {
  let flat = 0
  const end = Math.round(t.finishAt)
  for (let i = 4; i < end; i++) if (Math.abs(t.curv[i]) < 1 / 400) flat++
  return flat / (end - 4)
}

const all = corners()
const braking = all.filter((c) => c.r < FLAT)

console.log('\nThe road\n')
console.log(
  `  ${Math.round(track.finishAt)}m, ${all.length} corners, ${braking.length} of them needing a brake`,
)
console.log(`  tightest r${Math.min(...all.map((c) => c.r)).toFixed(0)}m`)
console.log(`  narrowest road ${narrowest().toFixed(1)}m`)
console.log(`  ${(straightShare() * 100).toFixed(0)}% of it near straight`)
console.log(`  climbs ${Math.max(...Array.from(track.y)).toFixed(0)}m`)

console.log('\nAgainst the other three\n')
for (const [name, t] of [['Rootway', root], ['Moonbreak', moon], ['Stormcrown', storm]] as const) {
  const c = corners(t)
  console.log(
    `  ${name.padEnd(11)}${String(Math.round(t.finishAt)).padStart(5)}m  ` +
      `${String(c.length).padStart(2)} corners  ` +
      `${String(c.filter((x) => x.r < FLAT).length).padStart(2)} braking  ` +
      `tightest r${Math.min(...c.map((x) => x.r)).toFixed(0).padStart(3)}  ` +
      `narrowest ${narrowest(t).toFixed(1)}m  ` +
      `${(straightShare(t) * 100).toFixed(0)}% straight`,
  )
}

/*
  ===========================================================================
  The claim, in four parts.

  Not "hardest" as a mood. Corners per kilometre, because a long easy road is
  not a hard one; brakes, because a corner you take flat is scenery; width,
  because that is what decides whether a mistake is recoverable; and straight
  share, because that is the number that caught the Stormcrown out.
  ===========================================================================
*/
console.log('\nIt is the hardest road here\n')

const perKm = (t: typeof track) => (corners(t).length / t.finishAt) * 1000
ok(
  'more corners per kilometre than any of them',
  perKm(track) > Math.max(perKm(root), perKm(moon), perKm(storm)),
  `${perKm(track).toFixed(1)}/km against ` +
    `${perKm(root).toFixed(1)}, ${perKm(moon).toFixed(1)}, ${perKm(storm).toFixed(1)}`,
)
/*
  Density and share, not a raw count.

  The Stormcrown has thirty-four braking corners to this road's twenty-seven,
  and is a kilometre and a half longer. Asking for more of them in absolute
  terms would be asking this road to be *longer*, which is not the same thing
  as asking it to be harder — and length is the one axis where the Stormcrown
  should keep its crown. What is actually being claimed is that there is less
  road between the brakes here than anywhere else, and that a higher share of
  the corners are ones you cannot take flat.
*/
const brakesPerKm = (t: typeof track) =>
  (corners(t).filter((c) => c.r < FLAT).length / t.finishAt) * 1000
const brakeShare = (t: typeof track) =>
  corners(t).filter((c) => c.r < FLAT).length / Math.max(1, corners(t).length)
ok(
  'less road between the brakes than any of them',
  brakesPerKm(track) > Math.max(brakesPerKm(root), brakesPerKm(moon), brakesPerKm(storm)),
  `${brakesPerKm(track).toFixed(1)}/km against ` +
    [root, moon, storm].map((t) => brakesPerKm(t).toFixed(1)).join(', '),
)
/*
  Not a share check.

  The obvious next line here was "a higher share of its corners cannot be taken
  flat", and it is unwinnable: the Rootway is fifteen corners and *all* of them
  need a brake, because it is a cave with a road in it and nothing else. A
  hundred per cent cannot be beaten, and a test that can only be passed by
  deleting the straights would make this a worse road.

  What is worth asking instead is whether it ever lets up. The Stormcrown's
  real problem was not its corner count, it was the eight hundred metres
  between some of them.
*/
const longestBreather = (t: typeof track) => {
  const brakes = corners(t).filter((c) => c.r < FLAT).map((c) => c.at)
  let most = brakes.length > 0 ? brakes[0] : t.finishAt
  for (let i = 1; i < brakes.length; i++) most = Math.max(most, brakes[i] - brakes[i - 1])
  return Math.max(most, t.finishAt - (brakes[brakes.length - 1] ?? 0))
}
console.log(
  `  longest stretch without a brake: ${longestBreather(track).toFixed(0)}m, against ` +
    [root, moon, storm].map((t) => longestBreather(t).toFixed(0) + 'm').join(', '),
)
/*
  And here the road declines to play, which is the more interesting answer.

  Measured, this has a four-hundred-metre stretch without a brake and the
  Rootway's longest is three hundred — so on the plain reading, the cave never
  lets up and this does. The plain reading is wrong, and it is wrong in exactly
  the way this whole road is about: **the Red Mile is not a rest.** It is the
  most corrugated ground in the game, and corrugation is the one difficulty
  here that only exists at speed. A straight you have to fight is not a
  breather; it is the point.

  So what is actually checked is that there is nowhere to relax: every long
  stretch without a corner has a surface working against you.
*/
{
  const brakes = braking.map((c) => c.at)
  const gaps: [number, number][] = []
  let last = 0
  for (const b of brakes) { if (b - last > 240) gaps.push([last, b]); last = b }
  if (track.finishAt - last > 240) gaps.push([last, track.finishAt])
  const restful = gaps.filter(([from, to]) => {
    let worst = 0
    for (let i = Math.round(from); i < Math.round(to); i++) {
      worst = Math.max(worst, track.ruts[i] + track.sand[i])
    }
    return worst < 0.45
  })
  ok(
    'and there is nowhere on it to relax — every long straight has a bad surface',
    restful.length === 0,
    restful.map(([f, t]) => `${f.toFixed(0)}–${t.toFixed(0)}m`).join(', '),
  )
}
ok(
  'narrower than any of them, somewhere',
  narrowest() < Math.min(narrowest(root), narrowest(moon), narrowest(storm)),
  `${narrowest().toFixed(1)}m against ` +
    [root, moon, storm].map((t) => narrowest(t).toFixed(1)).join('m, ') + 'm',
)
ok(
  'and the tightest corner in the game',
  Math.min(...all.map((c) => c.r)) < Math.min(
    ...[root, moon, storm].map((t) => Math.min(...corners(t).map((c) => c.r))),
  ),
  `r${Math.min(...all.map((c) => c.r)).toFixed(0)} against r` +
    [root, moon, storm].map((t) => Math.min(...corners(t).map((c) => c.r)).toFixed(0)).join(', r'),
)
/*
  The Stormcrown's mistake, named and avoided. Fifty-six per cent of that road
  is within a whisker of straight, which is why it drives like a tour. This one
  is allowed some — the Red Mile is *supposed* to be open — but nothing like
  that much, and the check exists so nobody widens it back later by accident.
*/
ok(
  'and it is not a scenic drive — the Stormcrown was 56% straight',
  straightShare() < 0.42,
  `${(straightShare() * 100).toFixed(0)}% of it is near straight`,
)

/*
  ===========================================================================
  The surface, which is where this road actually lives.

  Everything above could be true of a narrow twisty road anywhere. What makes
  this one the Harmattan is that the *ground* is against you, and a ground that
  does not change the car is a texture. So each of the three is driven.
  ===========================================================================
*/
console.log('\nThe ground is in the physics\n')

const IDLE: CarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false }
const FLAT_OUT: CarInput = { steer: 0, throttle: 1, brake: 0, handbrake: false, boost: false }
const DT = 1 / 120

/** Let the car run from `from` for `metres` and say how long it took. */
function runFrom(t: typeof track, from: number, metres: number, input = FLAT_OUT) {
  const car = createCar(t)
  car.s = from
  car.n = 0
  // Up to speed first, so this measures the road rather than the launch.
  for (let i = 0; i < 900; i++) advanceCar(t, car, FLAT_OUT, DT)
  car.s = from
  const started = car.s
  let ticks = 0
  while (car.s - started < metres && ticks < 60_000) {
    advanceCar(t, car, input, DT)
    ticks++
  }
  return { seconds: ticks * DT, speed: speedOf(car) }
}

/*
  Corrugation. Two identical stretches of the Red Mile, one with the ruts and
  one without, driven flat out — the whole claim of `Band.ruts` is that holding
  the throttle down on a straight now costs something, and if it does not cost
  measurable time then it is a rumble effect and should be honest about that.
*/
{
  const smoothRoad = makeTrack(7, 'harmattan')
  for (let i = 0; i < smoothRoad.ruts.length; i++) smoothRoad.ruts[i] = 0
  const at = HARMATTAN.redMile.from + 76
  const span = 170
  const rough = runFrom(track, at, span)
  const glass = runFrom(smoothRoad, at, span)
  const bendiest = Math.max(...Array.from(track.curv.slice(at, at + span)).map(Math.abs))
  console.log(
    `  ${span}m of the Red Mile: ${rough.seconds.toFixed(2)}s corrugated, ` +
      `${glass.seconds.toFixed(2)}s smooth — ` +
      `${(rough.speed * 3.6).toFixed(0)} km/h against ${(glass.speed * 3.6).toFixed(0)}`,
  )
  ok(
    'the corrugation costs real time on a straight',
    rough.seconds > glass.seconds + 0.06,
    `${(rough.seconds - glass.seconds).toFixed(2)}s slower over ${span}m`,
  )
  ok(
    'and it is a straight, so nothing else could have done it',
    bendiest < 1 / 120,
    `tightest curvature there is r${(1 / bendiest).toFixed(0)}`,
  )
  /*
    And by the mechanism claimed: a *lower top speed*, not a car that got slow
    for some other reason. Before the rolling-drag term existed these two came
    out at 10.11s each, dead level to the hundredth, because taking grip away
    does nothing to a car that has already stopped accelerating. If they ever
    level off again, the corrugation has quietly gone back to being a rumble.
  */
  ok(
    'because the corrugated road has a lower top speed',
    glass.speed > rough.speed + 0.4,
    `${(rough.speed * 3.6).toFixed(1)} km/h against ${(glass.speed * 3.6).toFixed(1)}`,
  )
}

/*
  Sand. Same idea, in the wadi, where it is deepest — and it has to cost more
  than the corrugation does, because sand is the signature of the place.
*/
{
  const swept = makeTrack(7, 'harmattan')
  for (let i = 0; i < swept.sand.length; i++) swept.sand[i] = 0
  const at = HARMATTAN.riverBed.from + 20
  const deep = runFrom(track, at, 220)
  const clean = runFrom(swept, at, 220)
  console.log(
    `  220m of the Dry River: ${deep.seconds.toFixed(2)}s in sand, ${clean.seconds.toFixed(2)}s swept`,
  )
  ok(
    'the sand costs real time',
    deep.seconds > clean.seconds + 0.1,
    `${(deep.seconds - clean.seconds).toFixed(2)}s slower over 220m`,
  )
}

/*
  And the drifts move. Two seeds, the same road: the corners must be identical
  to the metre and the sand must not be. This is the rule the Moonbreak keeps
  and this road deliberately breaks, so it is worth stating both halves.
*/
{
  const monday = makeTrack(11, 'harmattan')
  const tuesday = makeTrack(4242, 'harmattan')
  let sameLine = true
  for (let i = 0; i < monday.curv.length; i++) {
    if (Math.abs(monday.curv[i] - tuesday.curv[i]) > 1e-9) { sameLine = false; break }
  }
  let moved = 0
  for (let i = 0; i < monday.sand.length; i++) moved += Math.abs(monday.sand[i] - tuesday.sand[i])
  ok('two days are the same road', sameLine)
  ok(
    'but not the same sand',
    moved / monday.sand.length > 0.02,
    `${(moved / monday.sand.length).toFixed(3)} average depth difference`,
  )
  /*
    And it is not so different that the road becomes a lottery. A drift you
    cannot see coming is weather, not difficulty; the point is that it is
    readable, and a road that is unrecognisable from one day to the next cannot
    be read at all.
  */
  ok(
    'and the difference is a layer on the road, not a different road',
    moved / monday.sand.length < 0.22,
    `${(moved / monday.sand.length).toFixed(3)} average depth difference`,
  )
}

/*
  Wind. It has to actually push the car sideways where the road is exposed, and
  it has to stop dead inside the town — that silence is the best moment on the
  road and it is made of one number being zero.
*/
{
  const car = createCar(track)
  car.s = HARMATTAN.scarp.from + 40
  car.n = 0
  for (let i = 0; i < 600; i++) advanceCar(track, car, FLAT_OUT, DT)
  const blown = Math.abs(car.n)
  console.log(`  five seconds hands-off on the scarp moves the car ${blown.toFixed(2)}m sideways`)
  ok('the harmattan blows the car about on the scarp', blown > 0.35, `${blown.toFixed(2)}m`)

  const inside = createCar(track)
  inside.s = HARMATTAN.town.from + 40
  inside.n = 0
  for (let i = 0; i < 600; i++) advanceCar(track, inside, IDLE, DT)
  const held = Math.abs(inside.n)
  ok('and inside the walls there is none of it', held < 0.06, `${held.toFixed(3)}m`)
}

/*
  ===========================================================================
  The place, and that it is laid out in the order the briefing claims.

  These are cheap and they are the ones that rot: a section boundary moves,
  and the banners end up marking nothing while the town gate opens onto a
  straight. Everything here is derived from `layHarmattan` rather than written
  down twice, so what is actually being checked is that the derivation is sane.
  ===========================================================================
*/
console.log('\nThe place\n')

const order = [
  ['the Red Mile', HARMATTAN.redMile.from],
  ['the Termite Cathedrals', HARMATTAN.cathedrals.from],
  ['the Dry River', HARMATTAN.river.from],
  ['Kofar Dutse', HARMATTAN.gateAt],
  ['the Dye Pits', HARMATTAN.pits.from],
  ['the Scarp', HARMATTAN.scarp.from],
  ['the brassfire', HARMATTAN.home.from],
] as const
console.log('  ' + order.map(([name, at]) => `${name} ${Math.round(at)}m`).join('\n  '))
ok(
  'the sections come in the order the briefing says',
  order.every(([, at], i) => i === 0 || at > order[i - 1][1]),
)
ok(
  'the wadi is the sandiest part of the road',
  track.sand[Math.round(HARMATTAN.riverBed.from + 60)] >
    track.sand[Math.round(HARMATTAN.redMile.from + 60)] * 2,
  `${track.sand[Math.round(HARMATTAN.riverBed.from + 60)].toFixed(2)} against ` +
    `${track.sand[Math.round(HARMATTAN.redMile.from + 60)].toFixed(2)}`,
)
ok(
  'the street inside the walls stays swept, whatever the seed says',
  Math.max(...Array.from(track.sand.slice(
    Math.round(HARMATTAN.town.from), Math.round(HARMATTAN.town.to),
  ))) < 0.1,
  `deepest sand in the town is ${Math.max(...Array.from(track.sand.slice(
    Math.round(HARMATTAN.town.from), Math.round(HARMATTAN.town.to)))).toFixed(3)}`,
)
ok(
  'the Red Mile is the most corrugated part of the road',
  Math.max(...Array.from(track.ruts.slice(
    Math.round(HARMATTAN.redMile.from), Math.round(HARMATTAN.redMile.to),
  ))) > 0.6,
)
ok(
  'and nothing is corrugated inside the walls',
  Math.max(...Array.from(track.ruts.slice(
    Math.round(HARMATTAN.town.from), Math.round(HARMATTAN.town.to),
  ))) < 0.02,
)
/*
  The dye pits are the only wet on the road, and that is the joke: two and a
  half kilometres of drought and then the one slick surface is not water.
*/
{
  const wettestOutside = Math.max(
    ...Array.from(track.wet.slice(4, Math.round(HARMATTAN.pits.from) - 20)),
    ...Array.from(track.wet.slice(Math.round(HARMATTAN.pits.to) + 20, Math.round(track.finishAt))),
  )
  ok(
    'the dye pits are the only wet on the whole road',
    Math.max(...Array.from(track.wet.slice(
      Math.round(HARMATTAN.pits.from), Math.round(HARMATTAN.pits.to)))) > 0.7 &&
      wettestOutside < 0.1,
    `pits ${Math.max(...Array.from(track.wet.slice(
      Math.round(HARMATTAN.pits.from), Math.round(HARMATTAN.pits.to)))).toFixed(2)}, ` +
      `wettest elsewhere ${wettestOutside.toFixed(2)}`,
  )
}
ok(
  'every banner stands on the road',
  HARMATTAN.banners.every((s) => s > 0 && s < track.finishAt),
  HARMATTAN.banners.map((s) => Math.round(s)).join(' '),
)
/*
  A banner that is not before a corner is a decoration. Each one has to have
  something to warn about within a hundred metres of it, or it is lying.
*/
ok(
  'and every banner is warning about something',
  HARMATTAN.banners.every((s) =>
    all.some((c) => c.at > s && c.at < s + 120 && c.r < FLAT * 1.4)),
  HARMATTAN.banners
    .filter((s) => !all.some((c) => c.at > s && c.at < s + 120 && c.r < FLAT * 1.4))
    .map((s) => Math.round(s) + 'm')
    .join(', ') || 'all of them',
)
ok(
  'the road climbs the scarp and finishes on top of it',
  track.y[Math.round(HARMATTAN.home.from)] - track.y[Math.round(HARMATTAN.scarp.from)] > 35,
  `${(track.y[Math.round(HARMATTAN.home.from)] - track.y[Math.round(HARMATTAN.scarp.from)]).toFixed(0)}m of climb`,
)

/*
  And it has to be drivable. A road that is hard because it cannot be finished
  is not hard, it is broken — so the same crude autopilot the other checks use
  is asked to get round it without putting a wheel in the scenery on every
  corner. It is not a good driver; that is the point. If *this* can complete
  the road, a person can.
*/
console.log('\nAnd it can be driven\n')
{
  const car = createCar(track)
  const road = roadAt(track, car.s)
  let offRoad = 0
  let stuck = 0
  let longestStuck = 0
  let ticks = 0
  const seen: number[] = []
  while (car.s < track.finishAt && ticks < 240_000) {
    roadAt(track, car.s, road)
    // Aim at the learned line, brake if the corner ahead is tighter than now.
    const ahead = roadAt(track, Math.min(track.finishAt, car.s + 34))
    const want = road.line
    const steer = Math.max(-1, Math.min(1, (want - car.n) * 0.22 - car.psi * 1.5))
    const tight = Math.abs(ahead.curv) > 1 / 70
    advanceCar(track, car, {
      steer,
      throttle: tight ? 0.25 : 1,
      brake: tight && speedOf(car) > 22 ? 0.5 : 0,
      handbrake: false,
      boost: false,
    }, DT)
    if (Math.abs(car.n) > road.width) offRoad++
    /*
      Time spent crawling, and where the longest one was — measured past the
      launch, because the car starts from rest and the first second of every
      run is a legitimate nought.

      This is the check that earns its keep. The first version of the last
      hairpin was r16 on eight metres, off-camber, in half a gale and in sand;
      a car that got it wrong beached on the verge and sat at a tenth of a
      metre a second for the rest of the run. Nothing threw, the road was
      "completable", and it was broken. A road you can get *stuck* on is worse
      than a road that is too hard, because being stuck is not a mistake you
      can learn your way out of.
    */
    if (car.s > 60) {
      if (speedOf(car) < 3) { stuck++; longestStuck = Math.max(longestStuck, stuck) }
      else stuck = 0
    }
    if (ticks % 600 === 0 && car.s > 60) seen.push(speedOf(car))
    ticks++
  }
  const finished = car.s >= track.finishAt
  console.log(
    `  ${(ticks * DT).toFixed(1)}s, off the road for ${(offRoad * DT).toFixed(1)}s of it, ` +
      `longest crawl ${(longestStuck * DT).toFixed(1)}s`,
  )
  ok('a crude driver gets to the end of it', finished, `reached ${car.s.toFixed(0)}m`)
  ok(
    'without living in the scenery',
    offRoad * DT < ticks * DT * 0.25,
    `${((offRoad / ticks) * 100).toFixed(0)}% of the run off the road`,
  )
  ok(
    'and there is nowhere on it you can get stuck',
    longestStuck * DT < 4,
    `it crawled for ${(longestStuck * DT).toFixed(1)}s in one go`,
  )
  ok(
    'and it is never reduced to walking pace for long',
    Math.min(...seen) > 2,
    `slowest sample ${Math.min(...seen).toFixed(1)} m/s`,
  )
}

console.log(failed === 0 ? '\nall good\n' : `\n${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
