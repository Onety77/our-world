/**
 * The Switchback Run, measured against its own blueprint.
 *
 * ---------------------------------------------------------------------------
 * A road is a claim: this corner is 115° at a 58 m radius and gets 230 m of
 * road to do it in. Nothing about looking at a road tells you whether that is
 * true, and every one of those numbers is the kind that drifts by ten per cent
 * during an afternoon of tuning and is never noticed again.
 *
 * So this builds the actual sampled track — the same one the car drives, after
 * the smoothing pass — and measures it. Section by section, corner by corner,
 * against `switchback.ts`, which is the blueprint written down once.
 *
 * Angles are measured as the total change in heading across a section, which is
 * what the blueprint means by a turn's degrees. Radius is measured as the
 * tightest the road actually gets, since that is the one a driver feels.
 *
 *   npm run switchback
 * ---------------------------------------------------------------------------
 */

import { makeTrack, roadAt, SWITCHBACK_START, STEP } from '../src/world/games/ember-rally/track'
import {
  CUT,
  CUT_HALF_WIDTH,
  CUT_LAP,
  CUT_SAVING,
  HALF_WIDTH,
  LAP,
  marks,
  savingAt,
} from '../src/world/games/ember-rally/switchback'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}
const near = (what: string, got: number, want: number, by: number) =>
  ok(`${what} (±${by})`, Math.abs(got - want) <= by, `got ${got.toFixed(2)}, want ${want}`)

const track = makeTrack(7, 'rootway-test')
const S = SWITCHBACK_START

console.log('\nThe road that came out\n')

/*
  Heading is stored unwrapped along the road, so the turn across any stretch is
  simply the difference — no unwrapping, and no sign confusion, because the
  array already counts a right-hander down. Negated here so that right reads
  positive, which is how the blueprint states every corner.
*/
const turnBetween = (from: number, to: number) => {
  const a = roadAt(track, from)
  const b = roadAt(track, to)
  return ((a.heading - b.heading) * 180) / Math.PI
}

/** The tightest the road gets across a stretch, as a radius in metres. */
const tightest = (from: number, to: number) => {
  let most = 0
  for (let s = from; s <= to; s += STEP) {
    most = Math.max(most, Math.abs(roadAt(track, s).curv))
  }
  return most === 0 ? Infinity : 1 / most
}

near('the whole course, end to end', track.finishAt - S, LAP, 1)
  ok('and the car starts on the line', Math.abs(track.start - S) < 0.5, 'starts at ' + track.start)
near('and a lap at 120 km/h', (LAP / (120 / 3.6)), 169.5, 0.2)

console.log('\nEvery section, in order\n')

for (const { leg, from, to } of marks()) {
  const length = to - from
  if (leg.kind === 'straight') {
    near(`${leg.name}: ${length} m of road`, length, length, 0.001)
    // A straight has to actually be straight. Smoothing bleeds a little
    // curvature in from the corner at each end, so the middle is what is asked.
    const middleFrom = S + from + Math.min(60, length * 0.25)
    const middleTo = S + to - Math.min(60, length * 0.25)
    ok(
      `${leg.name}: straight through the middle`,
      Math.abs(turnBetween(middleFrom, middleTo)) < 1.2,
      `turned ${turnBetween(middleFrom, middleTo).toFixed(2)}°`,
    )
    continue
  }
  near(`${leg.name}: turns ${leg.deg}°`, turnBetween(S + from, S + to), leg.deg, 0.6)
  near(`${leg.name}: tightest radius`, tightest(S + from, S + to), leg.radius, leg.radius * 0.12)
  near(`${leg.name}: ${leg.section} m of road`, length, leg.section, 0.001)
}

console.log('\nThe road itself\n')

{
  let narrowest = Infinity
  let widest = 0
  for (let s = S + 40; s <= S + LAP - 40; s += 5) {
    const w = roadAt(track, s).width * 2
    narrowest = Math.min(narrowest, w)
    widest = Math.max(widest, w)
  }
  near('never narrower than the eleven metres it claims', narrowest, HALF_WIDTH * 2, 0.35)
  near('and never wider', widest, HALF_WIDTH * 2, 0.35)
}

{
  // The two fires stand on the same floor, or the cave has a step in it.
  const rise = roadAt(track, S + LAP).y - roadAt(track, S).y
  near('it comes back to the height it left at', rise, 0, 4)
}

console.log('\nThe cut\n')

const split = track.split
if (!split) {
  ok('there is a cut at all', false, 'no split was built')
} else {
  near('the mouth is where it says it is', split.from - S, CUT.entry, 1)
  // Inside Turn 3's braking zone, on purpose: you choose while already busy.
  near('which is just before Turn 3 starts turning', 2080 - (split.from - S), 40, 1)
  near('main road across it', split.mainLength, CUT.mainSpan, 1)
  near('the cut itself', split.shortcutLength, CUT.length, 6)
  near('so it saves', split.mainLength - split.shortcutLength, CUT_SAVING, 6)
  near('which is a shorter course of', LAP - (split.mainLength - split.shortcutLength), CUT_LAP, 6)
  near('and about this many seconds at 120 km/h', savingAt(120), 8.4, 0.3)

  {
    let narrowest = Infinity
    for (let i = 0; i < split.width.length; i++) narrowest = Math.min(narrowest, split.width[i] * 2)
    near('the cut is the narrower road', narrowest, CUT_HALF_WIDTH * 2, 0.5)
  }

  {
    /*
      The mouth, which is the whole of its difficulty.

      A radius near the stated one over the first stretch means the entry cannot
      be taken at the speed of the road it leaves — which is the blueprint's
      "must deliberately slow down", and the reason a bad entry gives back most
      of what the cut saves.
    */
    let most = 0
    const until = Math.min(split.curv.length - 1, 90)
    for (let i = 4; i <= until; i++) most = Math.max(most, Math.abs(split.curv[i]))
    const radius = most === 0 ? Infinity : 1 / most
    ok(
      `the mouth needs a brake (${CUT.entryRadius} m asked)`,
      radius <= CUT.entryRadius * 1.5,
      `tightest over the first ${until} m is ${radius.toFixed(1)} m`,
    )
  }
}

console.log('\nThe markers\n')

{
  /*
    A pair of stones level with each other is this cave's one shape for "this is
    information". So a braking marker is a pair, and the check is that three
    pairs stand in front of each of the three corners the blueprint names — at
    150, 100 and 50 m before the road actually starts to turn, which is not the
    same place as the start of the corner's section.
  */
  const paired = (about: number) =>
    track.lanterns.filter((l) => l.mark && Math.abs(l.s - about) < 3).length

  for (const name of ['Turn 2', 'Turn 3', 'Turn 7']) {
    const leg = marks().find((m) => m.leg.name === name)
    if (!leg || leg.leg.kind !== 'corner') continue
    const c = leg.leg
    const turn = (Math.abs(c.deg) * Math.PI) / 180
    const arcNeeded = turn * c.radius
    const spare = c.section - arcNeeded
    const ease = Math.min(arcNeeded * 0.92, spare * 0.95) * c.ease
    const arc = arcNeeded - ease + ease * 2
    const turnsAt = S + leg.from + (leg.to - leg.from - arc) * (c.lead ?? 0.5)
    for (const away of [150, 100, 50]) {
      const found = paired(turnsAt - away)
      ok(`${name}: a pair of stones ${away} m out`, found === 2, `found ${found}`)
    }
  }

  if (split) {
    const warn = track.lanterns.filter(
      (l) => l.mark && Math.abs(l.s - (split.from - CUT.warnAt)) < 3,
    )
    ok('one stone warns about the cut, 100 m out', warn.length === 1, `found ${warn.length}`)
  }
}

console.log('')
if (failed > 0) {
  console.log(`  ${failed} thing(s) do not match the blueprint.\n`)
  process.exit(1)
}
console.log('  the road is the road that was asked for\n')
