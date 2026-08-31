/**
 * The Stormcrown, measured — and its weather made to prove it reaches the car.
 *
 * ---------------------------------------------------------------------------
 * This road was the last one you drive and, measured, the easiest of the three:
 * nineteen corners in four and a half kilometres with seven of them needing a
 * brake, never narrower than nine metres, and fifty-six per cent of it within a
 * whisker of straight. It also had a storm in it that could not touch the car.
 *
 * So there are two halves to this. The first compares it against the other two
 * roads, *built right here* rather than against numbers somebody wrote down —
 * because "it feels harder now" is exactly the claim that turned out to be
 * false the first time the Moonbreak was hardened.
 *
 * The second half is more important: it takes the two new things this road has
 * — a gale and corners that lean the wrong way — and proves they change what
 * the car does, by driving the same corner twice with the mechanic switched off
 * in between. A hazard that measures the same either way is scenery, and this
 * road has been full of scenery.
 *
 *   npm run storm
 * ---------------------------------------------------------------------------
 */

import {
  CLOUD_BASE,
  CLOUD_TOP,
  GALE_FORCE,
  STEP,
  STORMCROWN,
  galeAt,
  gustAt,
  makeTrack,
  roadAt,
  type Track,
} from '../src/world/games/ember-rally/track'
import { advanceCar, createCar, speedOf, type CarInput } from '../src/world/games/ember-rally/physics'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

/** The radius the car can hold flat out. Anything tighter is a brake. */
const FLAT = 69
const track = makeTrack(7, 'stormcrown')
const root = makeTrack(7, 'rootway')
const moon = makeTrack(7, 'moonbreak')

function corners(t: Track) {
  const found: { at: number; r: number; width: number; curv: number }[] = []
  let run: { r: number; w: number; k: number }[] = []
  for (let i = 4; i < Math.round(t.finishAt); i++) {
    const k = Math.abs(t.curv[i])
    if (k > 1 / 140) run.push({ r: 1 / k, w: t.width[i] * 2, k: t.curv[i] })
    else {
      if (run.length > 12) {
        found.push({
          at: i - run.length / 2,
          r: Math.min(...run.map((x) => x.r)),
          width: Math.min(...run.map((x) => x.w)),
          curv: run.reduce((a, b) => (Math.abs(b.k) > Math.abs(a) ? b.k : a), 0),
        })
      }
      run = []
    }
  }
  return found
}

function narrowest(t: Track) {
  let n = Infinity
  for (let i = 4; i < Math.round(t.finishAt); i++) n = Math.min(n, t.width[i] * 2)
  return n
}

/** How much of the road is within a whisker of straight, and the longest such run. */
function idle(t: Track) {
  let flat = 0
  let longest = 0
  let from = 0
  for (let i = 0; i < Math.round(t.finishAt / STEP); i++) {
    if (Math.abs(t.curv[i]) < 1 / 200) {
      flat++
      longest = Math.max(longest, i * STEP - from)
    } else from = i * STEP
  }
  return { share: flat / (t.finishAt / STEP), longest }
}

const all = corners(track)
const braking = all.filter((c) => c.r < FLAT)
const km = track.finishAt / 1000

console.log(`\nThe road\n`)
console.log(
  `  ${Math.round(track.finishAt)}m, ${all.length} corners (${(all.length / km).toFixed(1)}/km), ` +
    `${braking.length} of them needing a brake`,
)
console.log(`  tightest r${Math.min(...all.map((c) => c.r)).toFixed(0)}m, narrowest ${narrowest(track).toFixed(1)}m`)
console.log(
  `  ${(idle(track).share * 100).toFixed(0)}% of it near-straight, longest run ${idle(track).longest.toFixed(0)}m`,
)
console.log(`  every corner: ${all.map((c) => `r${c.r.toFixed(0)}`).join(' ')}`)

/*
  ===========================================================================
  The last road should be the hardest one. It was the easiest.
  ===========================================================================
*/
console.log(`\nThe hardest of the three\n`)
for (const [name, t] of [['Rootway', root], ['Moonbreak', moon]] as const) {
  const c = corners(t)
  console.log(
    `  ${name.padEnd(10)} ${Math.round(t.finishAt)}m, ${c.length} corners ` +
      `(${(c.length / (t.finishAt / 1000)).toFixed(1)}/km), ${c.filter((x) => x.r < FLAT).length} braking, ` +
      `tightest r${Math.min(...c.map((x) => x.r)).toFixed(0)}, narrowest ${narrowest(t).toFixed(1)}m, ` +
      `${(idle(t).share * 100).toFixed(0)}% straight`,
  )
}
const rivals = [root, moon]
ok('it is the longest road', rivals.every((t) => track.finishAt > t.finishAt))
ok(
  'and the busiest — most corners per kilometre',
  rivals.every((t) => all.length / km > corners(t).length / (t.finishAt / 1000)),
)
ok(
  'and it asks for the brakes more than either',
  rivals.every((t) => braking.length > corners(t).filter((c) => c.r < FLAT).length),
)
ok('and it gets narrower than either', rivals.every((t) => narrowest(track) < narrowest(t)))
ok('and it has the tightest corner in the game',
  rivals.every((t) => Math.min(...all.map((c) => c.r)) < Math.min(...corners(t).map((c) => c.r))))
ok('and the least of it is straight', rivals.every((t) => idle(track).share < idle(t).share))

/*
  ===========================================================================
  A mountain, and the weather that belongs to each part of it.
  ===========================================================================
*/
let summit = -Infinity
let summitAt = 0
for (let i = 0; i < Math.round(track.finishAt / STEP); i++) {
  if (track.y[i] > summit) { summit = track.y[i]; summitAt = i * STEP }
}
const y = (s: number) => roadAt(track, s).y
console.log(`\nThe mountain\n`)
console.log(`  ${summit.toFixed(0)}m of climb, summit at ${Math.round(summitAt)}m`)
console.log(`  cloud from ${CLOUD_BASE}m to ${CLOUD_TOP}m up`)

ok('it climbs higher than anything else in the game', summit > 100, `${summit.toFixed(0)}m`)
ok('the summit is on the Crown', Math.abs(summitAt - STORMCROWN.crown.summit) < 60,
  `summit at ${Math.round(summitAt)}m, the Crown says ${STORMCROWN.crown.summit}m`)
ok('and it comes back to the fire it started at',
  Math.abs(y(track.finishAt) - y(track.start)) < 1.5,
  `the finish is ${(y(track.finishAt) - y(track.start)).toFixed(2)}m off the start`)

/*
  The three weathers have to land on the three parts of the road that earn
  them, or the best idea this road has is spent on the wrong corners.
*/
ok('you go into the cloud on the Cloud Shelf',
  y(STORMCROWN.cloudShelf.from) < CLOUD_BASE && y(STORMCROWN.cloudShelf.to) > CLOUD_BASE,
  `the shelf runs y${y(STORMCROWN.cloudShelf.from).toFixed(0)}–${y(STORMCROWN.cloudShelf.to).toFixed(0)}, base is ${CLOUD_BASE}`)
ok('the blind middle of it is the Thunder Stair',
  y(STORMCROWN.thunderStair.first) > CLOUD_BASE && y(STORMCROWN.thunderStair.first) < CLOUD_TOP,
  `the first hairpin is at y${y(STORMCROWN.thunderStair.first).toFixed(0)}`)
/*
  The one that matters. Thunder Stair II is the hardest corner on the road —
  tight, off-camber, on the wettest stone there is — and its whole argument is
  that it is done blind. Breaking out of the cloud before it measures the same
  and feels like nothing, which is what the first tuning did.
*/
ok('and you are still inside it for the off-camber hairpin',
  y(STORMCROWN.thunderStair.second + 30) < CLOUD_TOP,
  `Stair II is at y${y(STORMCROWN.thunderStair.second).toFixed(0)}, the cloud top is ${CLOUD_TOP}`)
ok('but out of it before the crown corner',
  y(STORMCROWN.thunderStair.third) > CLOUD_TOP,
  `Stair III is at y${y(STORMCROWN.thunderStair.third).toFixed(0)}`)
ok('and the Eye and the Crown are above the weather',
  y(STORMCROWN.eye.from) > CLOUD_TOP && y(STORMCROWN.crown.summit) > CLOUD_TOP)

/*
  ===========================================================================
  The gale. Where it blows, and whether it does anything.
  ===========================================================================
*/
const mean = (from: number, to: number) => {
  let sum = 0
  let n = 0
  for (let i = Math.round(from / STEP); i < Math.round(to / STEP); i++) { sum += track.gale[i]; n++ }
  return sum / Math.max(1, n)
}
console.log(`\nThe gale\n`)
for (const [name, from, to] of [
  ['Rainwood', STORMCROWN.rainwood.from, STORMCROWN.rainwood.to],
  ['cedar climb', STORMCROWN.climb.from, STORMCROWN.climb.to],
  ['Gale Bend', STORMCROWN.galeBend.approach, STORMCROWN.galeBend.exit],
  ['Cloud Shelf', STORMCROWN.cloudShelf.from, STORMCROWN.cloudShelf.to],
  ['the Eye', STORMCROWN.eye.from, STORMCROWN.eye.to],
  ['the Crown', STORMCROWN.crown.from, STORMCROWN.crown.to],
] as const) {
  console.log(`  ${name.padEnd(13)} ${(mean(from, to) * 100).toFixed(0)}% exposed`)
}

ok('the Rainwood is sheltered — the cedars are the point of it',
  mean(STORMCROWN.rainwood.from, STORMCROWN.rainwood.to) < 0.02,
  `${(mean(STORMCROWN.rainwood.from, STORMCROWN.rainwood.to) * 100).toFixed(0)}% exposed among the trees`)
ok('coming out above Gale Bend is where it arrives',
  mean(STORMCROWN.galeBend.approach, STORMCROWN.galeBend.exit) > 0.85)
ok('the summit ridge is the windiest place on the road',
  mean(STORMCROWN.crown.from, STORMCROWN.crown.to) > 0.85)
ok('and the Eye is a rest, not another test',
  mean(STORMCROWN.eye.from, STORMCROWN.eye.to) < 0.35,
  `${(mean(STORMCROWN.eye.from, STORMCROWN.eye.to) * 100).toFixed(0)}% exposed where it should be sheltered`)

/*
  The gust field itself. It has to stay inside its range — a gale that reaches
  1.4 is a gale whose stated force is a lie — and it has to actually get there,
  or the number in `GALE_FORCE` describes a wind nobody ever meets.
*/
let lowest = 1
let highest = 0
for (let t = 0; t < 400; t += 0.05) {
  for (const s of [0, 900, 2600, 4400]) {
    const g = gustAt(s, t)
    lowest = Math.min(lowest, g)
    highest = Math.max(highest, g)
  }
}
console.log(`  gusts run ${lowest.toFixed(2)} to ${highest.toFixed(2)} of full over six minutes`)
ok('the gust field stays inside nought and one', lowest >= -0.001 && highest <= 1.001,
  `${lowest.toFixed(3)}..${highest.toFixed(3)}`)
ok('and it reaches both ends of that, so the stated force is real',
  lowest < 0.08 && highest > 0.9)
ok('the same second of the same race gives the same gust',
  gustAt(1234, 56.75) === gustAt(1234, 56.75) && gustAt(1234, 56.75) !== gustAt(1234, 57.75),
  'two cars racing would get different weather')

/*
  The direction is the good part: it comes out of the road's own heading, so
  the same wind shoves you one way on a shoulder and the other way once the
  road has turned through it. Nothing about that is authored.
*/
/*
  Swept across the whole hairpin rather than sampled at two points.

  The first version of this took the apex and the apex plus sixty metres, and
  reported that the wind never changed sides. It was right about its two points
  and wrong about the corner: sixty metres into a hundred-and-ninety-degree
  hairpin is still *inside* it, so both samples were on the same side of the
  turn. The road swings through more than a full circle over its length; asking
  where the wind is worst in each direction is the question, not asking twice.
*/
let pushedRight = 0
let pushedLeft = 0
for (let s = STORMCROWN.thunderStair.third - 40; s < STORMCROWN.thunderStair.exit + 40; s += 4) {
  const f = galeAt(roadAt(track, s), s, 10, 30)
  pushedRight = Math.max(pushedRight, f)
  pushedLeft = Math.min(pushedLeft, f)
}
console.log(
  `  through Stair III it swings from ${pushedRight.toFixed(2)} to ${pushedLeft.toFixed(2)} m/s²`,
)
ok('the wind changes side on you halfway round a hairpin, without being told to',
  pushedRight > 0.2 && pushedLeft < -0.2,
  `it only ever pushed between ${pushedLeft.toFixed(2)} and ${pushedRight.toFixed(2)}`)

/*
  ===========================================================================
  Corners that lean the wrong way.
  ===========================================================================
*/
console.log(`\nOff-camber\n`)
const cambered: { at: number; deg: number; curv: number }[] = []
{
  let run: number[] = []
  for (let i = 0; i < Math.round(track.finishAt / STEP); i++) {
    if (Math.abs(track.camber[i]) > 0.04) run.push(i)
    else if (run.length > 10) {
      const mid = run[Math.floor(run.length / 2)]
      cambered.push({ at: mid * STEP, deg: (track.camber[mid] * 180) / Math.PI, curv: track.curv[mid] })
      run = []
    } else run = []
  }
}
for (const c of cambered) {
  console.log(`  ${Math.round(c.at)}m  ${c.deg.toFixed(1)}° the wrong way, on r${(1 / Math.abs(c.curv)).toFixed(0)}`)
}
ok('there are four of them', cambered.length === 4, `found ${cambered.length}`)
/*
  The sign is the whole thing. `basisAt` puts a point n to the right at
  `y + sin(bank)·n`, so a positive tilt raises the right and gravity takes the
  car left. Off-camber means the road falls away toward the *outside* of the
  corner, and the outside of a right-hander is the left — so a wrong-way tilt
  has the same sign as the curvature. Get this backwards and every one of these
  corners is a banked one that helps.
*/
ok('and every one of them tips toward the outside of its own corner',
  cambered.every((c) => Math.sign(c.deg) === Math.sign(c.curv)),
  cambered.map((c) => `${Math.round(c.at)}m: tilt ${c.deg.toFixed(1)}° on curv ${c.curv.toFixed(4)}`).join('; '))
ok('and each one is on a corner rather than a straight',
  cambered.every((c) => Math.abs(c.curv) > 1 / 90))
/*
  Two of the three are fords, and the reason they lean is meant to be visible
  from a long way off: water crossing a road takes the camber with it.
*/
ok('two of them have a waterfall standing over them',
  cambered.filter((c) => STORMCROWN.waterfalls.some((w) => Math.abs(w - c.at) < 70)).length >= 2,
  `falls at ${STORMCROWN.waterfalls.map(Math.round).join(', ')}; camber at ${cambered.map((c) => Math.round(c.at)).join(', ')}`)

/*
  ===========================================================================
  And now the part that matters: do they reach the car?

  Both are driven twice through the same piece of road, once with the mechanic
  turned off in the track itself. A hazard that measures the same either way is
  scenery, which is what the weather on this road has been from the beginning.
  ===========================================================================
*/
const DT = 1 / 120
const still: CarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false }

/**
 * Somebody who can actually drive, which turns out to be the whole test.
 *
 * ---------------------------------------------------------------------------
 * **The first version of this held a fixed throttle**, and reported that the
 * off-camber hairpin was no harder than the same corner flat: 115% of the road
 * either way. Both numbers were over a hundred because both runs left the road
 * — an r20 hairpin cannot be taken at thirty metres a second by anybody — so
 * what it was really comparing was two crashes, which are the same crash.
 *
 * A test that saturates reports every difference as no difference, and it does
 * it quietly and in the direction of "nothing is wrong". So this one looks
 * ahead, works out the fastest it could go through the tightest thing it can
 * see, and brakes for it. It is not a *good* driver — no line, no trail
 * braking, it just aims at the middle — but it is a driver, and the difference
 * between two of its runs is now about the road rather than about physics
 * running out.
 * ---------------------------------------------------------------------------
 */
function through(t: Track, from: number, to: number, dare = 0.86) {
  const car = createCar(t)
  for (let i = 0; i < 120 * 30; i++) {
    advanceCar(t, car, { ...still, throttle: 1 }, DT)
    if (speedOf(car) > 30) break
  }
  car.s = from
  car.n = 0
  car.psi = 0
  let worst = 0
  let wander = 0
  let steps = 0
  for (let i = 0; i < 120 * 120 && car.s < to; i++) {
    const road = roadAt(t, car.s)
    const v = speedOf(car)

    // The tightest thing within about a second and a half.
    let tightest = 1 / 400
    for (let ahead = 0; ahead < Math.max(30, v * 1.6); ahead += 5) {
      tightest = Math.max(tightest, Math.abs(roadAt(t, car.s + ahead).curv))
    }
    // What that radius is worth, at the grip this car has, discounted by how
    // brave the driver is being.
    const want = Math.sqrt((1 / tightest) * 17.5 * dare)

    /*
      How much lock this corner needs, as a fraction of what is available.

      Not a constant times the curvature, which is what this had first and which
      is only right for one speed: the steering *available* at v falls off as
      1/v², so the same bend needs a quarter of the wheel at half the speed. Sixty
      times the curvature was tuned on the Moonbreak's gentle spans and pinned
      itself at full lock the moment it met a hairpin, leaving the driver nothing
      to correct with and putting both runs of every comparison off the road.

      `curv · v² / (grip·g)` is that fraction honestly: one, exactly, at the limit.
    */
    const lock = (road.curv * v * v) / 17.5
    const wheel = Math.max(-1, Math.min(1, -car.n * 0.35 - car.psi * 2.4 + lock))
    const over = (v - want) / 6
    advanceCar(
      t,
      car,
      {
        ...still,
        steer: wheel,
        throttle: over < 0 ? Math.min(1, -over) : 0,
        brake: over > 0 ? Math.min(1, over) : 0,
      },
      DT,
    )
    if (car.s < from) continue
    const off = Math.abs(car.n) / road.width
    worst = Math.max(worst, off)
    wander += off * off
    steps++
  }
  /*
    Two numbers, because they fail differently.

    `worst` is how near the edge it came, which is the one that matters for a
    thing that catches you out once. `wander` is how far off the middle it sat
    for the whole stretch, which is the one that catches a crosswind: a steady
    wind is something you lean the wheel against and then drive straight
    through, so it can cost a lot of road without ever producing a single
    dramatic moment.
  */
  return { worst, wander: Math.sqrt(wander / Math.max(1, steps)) }
}

/** The same road with one of its new ideas switched off. */
function without(what: 'gale' | 'camber') {
  const t = makeTrack(7, 'stormcrown')
  t[what].fill(0)
  return t
}

/**
 * The bravest this driver can be through a stretch and still stay on the road.
 *
 * ---------------------------------------------------------------------------
 * `dare` is the fraction of the car's grip the driver is willing to spend in a
 * corner, and it sets the speed it brakes to. Winding it up until the run comes
 * off is the only measurement here that a player would recognise, because the
 * answer is in the units they actually care about: *how much slower do I have
 * to take this*. "Thirty-two per cent of the road instead of eleven" is true
 * and tells them nothing.
 *
 * Cornering speed goes as the square root of the grip spent, so a dare of 0.7
 * against 0.9 is a corner taken twelve per cent slower — which is the number
 * reported.
 * ---------------------------------------------------------------------------
 */
function bravest(t: Track, from: number, to: number) {
  let best = 0
  for (let dare = 0.4; dare <= 1.24; dare += 0.02) {
    if (through(t, from, to, dare).worst < 1) best = dare
  }
  return best
}

console.log(`\nDoes any of it reach the car\n`)

const stair2 = STORMCROWN.thunderStair.second
const leaning = through(track, stair2 - 90, stair2 + 110)
const level = through(without('camber'), stair2 - 90, stair2 + 110)
console.log(
  `  Thunder Stair II  leaning: ${(leaning.worst * 100).toFixed(0)}% of the road, ` +
    `${(leaning.wander * 100).toFixed(0)}% of the road on average`,
)
console.log(
  `                    level:   ${(level.worst * 100).toFixed(0)}% of the road, ` +
    `${(level.wander * 100).toFixed(0)}% of the road on average`,
)
ok(
  'the off-camber hairpin costs more road than the same corner level',
  leaning.worst > level.worst * 1.06,
  `${(leaning.worst * 100).toFixed(0)}% against ${(level.worst * 100).toFixed(0)}% — the tilt is not reaching the car`,
)
ok('and it can still be got round', leaning.worst < 1,
  `it uses ${(leaning.worst * 100).toFixed(0)}% of the road, which is a wall rather than a corner`)

const dareLeaning = bravest(track, stair2 - 90, stair2 + 110)
const dareLevel = bravest(without('camber'), stair2 - 90, stair2 + 110)
const slower = 1 - Math.sqrt(dareLeaning / dareLevel)
console.log(
  `                    and it has to be taken ${(slower * 100).toFixed(0)}% slower than the same corner level`,
)
ok('which is to say: it is impossible if you do not slow down for it',
  slower > 0.05,
  `only ${(slower * 100).toFixed(0)}% slower, which nobody would notice`)

const crown = STORMCROWN.crown
const windy = through(track, crown.from, crown.to)
const calm = through(without('gale'), crown.from, crown.to)
console.log(
  `  the Crown ridge   in it:  ${(windy.worst * 100).toFixed(0)}% of the road, ` +
    `${(windy.wander * 100).toFixed(0)}% of the road on average`,
)
console.log(
  `                    calm:   ${(calm.worst * 100).toFixed(0)}% of the road, ` +
    `${(calm.wander * 100).toFixed(0)}% of the road on average`,
)
/*
  The gale shows up in the *effort* more than in the width used, and that is the
  honest way to measure a crosswind rather than a shortcoming of the test: a
  steady wind is something you lean on the wheel against and then drive
  straight through. What costs you road is the gusting on top of it.
*/
ok(
  'the summit ridge costs more road in the wind than out of it',
  windy.wander > calm.wander * 1.1 || windy.worst > calm.worst * 1.1,
  `${(windy.wander * 100).toFixed(0)}% against ${(calm.wander * 100).toFixed(0)}% on average, ` +
    `${(windy.worst * 100).toFixed(0)}% against ${(calm.worst * 100).toFixed(0)}% at worst — the gale is not reaching the car`,
)
ok('but the ridge can still be driven', windy.worst < 0.95,
  `it uses ${(windy.worst * 100).toFixed(0)}% of the road, which is a coin toss rather than a corner`)

/*
  ===========================================================================
  The landmarks are still on the things they mark.
  ===========================================================================
*/
console.log(`\nWhere everything ended up\n`)
const nearest = (at: number) =>
  all.reduce((best, c) => (Math.abs(c.at - at) < Math.abs(best.at - at) ? c : best))
for (const [name, at] of [
  ['Gale Bend', STORMCROWN.galeBend.apex],
  ['Thunder Stair I', STORMCROWN.thunderStair.first],
  ['Thunder Stair II', STORMCROWN.thunderStair.second],
  ['Thunder Stair III', STORMCROWN.thunderStair.third],
] as const) {
  const c = nearest(at)
  console.log(`  ${name.padEnd(18)} ${Math.round(at)}m — r${c.r.toFixed(0)} on ${c.width.toFixed(1)}m`)
  ok(`${name} is still a corner`, Math.abs(c.at - at) < 60,
    `named at ${Math.round(at)}m, nearest corner at ${Math.round(c.at)}m`)
}
ok('the three hairpins are the tightest things on the road',
  [STORMCROWN.thunderStair.first, STORMCROWN.thunderStair.second, STORMCROWN.thunderStair.third]
    .every((s) => nearest(s).r < 24),
  'one of the Stair corners is not a hairpin any more')
ok('the lightning rods are in order and none of them share a metre',
  STORMCROWN.lightningRods.every((r, i) => i === 0 || r > STORMCROWN.lightningRods[i - 1]),
  STORMCROWN.lightningRods.join(' '))
ok('and every one of them stands on the road',
  STORMCROWN.lightningRods.every((r) => r > 0 && r < track.finishAt))
ok('the waterfalls too',
  STORMCROWN.waterfalls.every((w) => w > STORMCROWN.stormfall.from && w < STORMCROWN.stormfall.to),
  STORMCROWN.waterfalls.join(' '))

console.log('')
if (failed > 0) {
  console.log(`  ${failed} thing(s) wrong.\n`)
  process.exit(1)
}
console.log(`  the storm is on the mountain, and the mountain is a mountain\n`)
console.log(`  (full gale, straight across, at speed: ${GALE_FORCE} m/s²)\n`)
