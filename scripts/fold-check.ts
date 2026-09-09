/**
 * The Fold's arithmetic: the spacing, the growth, the mist, and the seal.
 *
 * ---------------------------------------------------------------------------
 * Three of the four cannot be judged from a screenshot and one of them cannot
 * be seen from a single device at all.
 *
 * **The spacing** is a schedule that plays out over five weeks. Whether a word
 * answered wrongly comes back tomorrow rather than in a month is not something
 * anybody can check by looking at a hillside; it is a table of intervals, and
 * the only honest way to test it is to run it.
 *
 * **The growth** is a curve over sixty days, which nobody is going to sit
 * through, and it has exactly one property that matters and is easy to lose in
 * a refactor: it never goes down.
 *
 * **The mist** is the section's only progress indicator and its numbers decide
 * whether a kept animal is visible at all. They were wrong once — two metres
 * and thirteen, which rendered as a white screen — and a screenshot said
 * "something is broken" without saying which number.
 *
 * **And the seal** is the one this file exists for. Each of them has their own
 * standing with a shared word, and a device that wrote the other one's box
 * would silently reschedule a year of somebody else's learning. Alone, on one
 * account, there is no other person to leak to and the bug is invisible. The
 * *enforcement* is in `firestore.rules` and cannot run from here — this checks
 * that everything above the wire agrees with it, which is the half that decides
 * what ends up on the screen. Same standing as `npm run archive`.
 *
 *   npm run fold
 * ---------------------------------------------------------------------------
 */

import {
  FOLD_BOXES,
  FULL_GROWN_DAYS,
  type Practice,
  type UserId,
  type Word,
} from '../src/data/types'
import {
  boxOf,
  conditionOf,
  creatureScale,
  daysBetween,
  dueAfter,
  dueAtFor,
  growth,
  keptRecently,
  keptToday,
  metCount,
  mistAt,
  nextBox,
  sessionFor,
  turnOf,
  waitingCount,
} from '../src/systems/fold'
import { mistProgress, todoFor } from '../src/systems/tending'

const DAY = 86_400_000
const NOW = Date.parse('2026-09-09T10:00:00Z')

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

/** A word as the wire would hand it over, with each person's own standing. */
function word(over: Partial<Word> & { id: string }): Word {
  return {
    practiceId: 'spanish',
    text: 'una palabra',
    meaning: 'a word',
    by: 'warm',
    at: NOW - 10 * DAY,
    boxes: {},
    dueAt: {},
    ...over,
  }
}

function practice(over: Partial<Practice> & { id: string }): Practice {
  return {
    name: 'Spanish',
    kind: 'words',
    by: 'both',
    creature: 'dog',
    startedAt: NOW - 90 * DAY,
    days: 0,
    lastDay: null,
    recent: [],
    ...over,
  }
}

console.log('\nthe spacing\n')

{
  ok('a new word has no box for anybody', boxOf(word({ id: 'a' }), 'warm') === null)
  ok('and is due now', dueAtFor(word({ id: 'a' }), 'warm') === 0)

  ok('getting a new one right starts it at box 1', nextBox(null, true) === 1)
  /*
    The line this whole file is most worth having. Box 0 means "you have never
    met this"; sending a word you half-know back there costs a day of nothing
    and tells somebody they are worse at this than they are. It is the single
    most common reason people abandon a deck.
  */
  ok('getting one wrong drops to box 1, never box 0', nextBox(4, false) === 1)
  ok('and right moves exactly one box', nextBox(3, true) === 4)
  ok('the top box does not overflow', nextBox(FOLD_BOXES.length - 1, true) === FOLD_BOXES.length - 1)

  ok('box 0 comes back inside the same session', dueAfter(0, NOW) === NOW)
  ok('box 1 is tomorrow', dueAfter(1, NOW) === NOW + DAY)
  ok('the last box is five weeks out', dueAfter(5, NOW) === NOW + 35 * DAY)
  ok(
    'every interval is longer than the one below it',
    FOLD_BOXES.every((days, i) => i === 0 || days > FOLD_BOXES[i - 1]),
    FOLD_BOXES.join(', '),
  )
}

console.log('\nthe seal — two people, one word, two schedules\n')

{
  const shared = word({ id: 's', boxes: { warm: 3, cool: 1 }, dueAt: { warm: NOW + 5 * DAY, cool: NOW - DAY } })

  ok('each of them has their own box', boxOf(shared, 'warm') === 3 && boxOf(shared, 'cool') === 1)

  const turn = turnOf(shared, 'warm', true, NOW)
  ok('turning it over answers for the turner only', turn.box === 4)
  /*
    The property the security rule enforces independently, asserted here in the
    only place it can be: `turnOf` returns *one* person's box and due date, so
    there is no shape in which a caller could write the other one's by accident.
    The client writes dotted paths for the same reason — a whole-map write would
    replace her half rather than leave it alone.
  */
  ok(
    'and cannot express a change to the other one',
    !Object.prototype.hasOwnProperty.call(turn, 'cool') && Object.keys(turn).sort().join() === 'box,dueAt,landed',
    Object.keys(turn).join(', '),
  )

  ok('a word neither has met is due for both', waitingCount([word({ id: 'n' })], 'warm', NOW) === 1)

  /*
    A word she is deep into and he has never seen. His session must contain it
    and hers must not — which is the whole reason the schedule is per person and
    the thing that would silently stop being true if it were ever collapsed.
  */
  const hers = word({ id: 'h', boxes: { cool: 5 }, dueAt: { cool: NOW + 30 * DAY } })
  ok('a word only she knows is still new to him', sessionFor([hers], 'warm', NOW).length === 1)
  ok('and is not due for her', sessionFor([hers], 'cool', NOW).length === 0)
}

console.log('\nwhat a handed word does\n')

{
  const gift = word({ id: 'g', by: 'warm', handed: true })
  const first = turnOf(gift, 'cool', true, NOW)
  ok('the first time she gets it, it lands', first.landed)

  const again = turnOf({ ...gift, landedAt: { cool: NOW } }, 'cool', true, NOW + DAY)
  ok('and never lands twice', !again.landed, 'it is a moment, not a counter')

  const missed = turnOf(gift, 'cool', false, NOW)
  ok('getting it wrong does not land it', !missed.landed)

  const ordinary = turnOf(word({ id: 'o' }), 'cool', true, NOW)
  ok('an ordinary word never lands at all', !ordinary.landed)
}

console.log('\nwhat a session is\n')

{
  const words: Word[] = [
    // three overdue, most overdue first
    word({ id: 'due-old', boxes: { warm: 2 }, dueAt: { warm: NOW - 9 * DAY } }),
    word({ id: 'due-mid', boxes: { warm: 2 }, dueAt: { warm: NOW - 4 * DAY } }),
    word({ id: 'due-new', boxes: { warm: 1 }, dueAt: { warm: NOW - DAY } }),
    // one not yet due
    word({ id: 'later', boxes: { warm: 4 }, dueAt: { warm: NOW + 8 * DAY } }),
    // and some never seen, one of them a gift
    word({ id: 'fresh-1', at: NOW - 5 * DAY }),
    word({ id: 'fresh-2', at: NOW - 4 * DAY }),
    word({ id: 'gift', at: NOW - DAY, handed: true, by: 'cool' }),
  ]

  const session = sessionFor(words, 'warm', NOW)
  const ids = session.map((w) => w.id)

  ok('a word that is not due yet is left alone', !ids.includes('later'), ids.join(', '))
  ok(
    'the most overdue comes first',
    ids[0] === 'due-old' && ids[1] === 'due-mid' && ids[2] === 'due-new',
    ids.join(', '),
  )
  ok('new words come after everything due', ids.indexOf('fresh-1') > ids.indexOf('due-new'))
  /*
    A word she chose for him should not wait behind two off a list. It is the
    one thing in this place that came *from* somebody.
  */
  ok(
    'a handed word jumps the queue of new ones',
    ids.indexOf('gift') < ids.indexOf('fresh-1'),
    ids.join(', '),
  )

  // Sixty pasted in on a Sunday.
  const flood = Array.from({ length: 60 }, (_, i) => word({ id: `f${i}`, at: NOW - i * 1000 }))
  const capped = sessionFor(flood, 'warm', NOW)
  ok('sixty new words do not all arrive at once', capped.length === 6, `${capped.length} of 60`)
  ok('and a full session is never longer than twelve', sessionFor([...flood, ...words], 'warm', NOW).length <= 12)
}

console.log('\nhow an animal grows\n')

{
  ok('nothing kept is nothing grown', growth(0) === 0)
  ok('full grown at sixty days', growth(FULL_GROWN_DAYS) === 1)
  ok('and never more than that', growth(500) === 1)
  /*
    Front-loaded on purpose: on a straight line the first week moves an animal
    by a ninth of nothing, and the first fortnight is exactly the stretch a new
    habit has to survive.
  */
  ok('a week in is already a third of the way', growth(7) > 0.33, growth(7).toFixed(2))

  let worst = 1
  for (let d = 1; d <= 400; d++) worst = Math.min(worst, growth(d) - growth(d - 1))
  ok('growth never goes down, at any number of days', worst >= 0)

  ok('a new animal is drawn small but visible', creatureScale(0) > 0.5, creatureScale(0).toFixed(2))
  ok('and a kept one is about twice that', creatureScale(FULL_GROWN_DAYS) / creatureScale(0) > 1.9)
}

console.log('\nwhere an animal stands\n')

{
  const today = '2026-09-09'
  const kept = practice({ id: 'k', days: 40, lastDay: today })
  const week = practice({ id: 'w', days: 40, lastDay: '2026-09-05' })
  const month = practice({ id: 'm', days: 40, lastDay: '2026-08-08' })
  const never = practice({ id: 'n', days: 0, lastDay: null })

  ok('kept today, and it is near', conditionOf(kept, today).mood === 'near')
  ok('four days, and it is grazing', conditionOf(week, today).mood === 'grazing')
  ok('a month, and it is lying down', conditionOf(month, today).mood === 'resting')
  ok('never kept at all is the same as long gone', conditionOf(never, today).mood === 'resting')

  ok('the further behind, the further off',
    conditionOf(kept, today).away < conditionOf(week, today).away &&
    conditionOf(week, today).away < conditionOf(month, today).away)

  /*
    The rule the brief argued with, asserted so it cannot be quietly undone: an
    animal nobody has fed for a month is exactly as large as it was the day they
    stopped. What changed is where it is standing.
  */
  ok(
    'and an animal never shrinks, however long it has been',
    creatureScale(month.days) === creatureScale(kept.days),
  )

  const rested = practice({ id: 'r', days: 40, lastDay: today, restingAt: NOW })
  ok('one put out to rest goes to the far end even if kept today', conditionOf(rested, today).mood === 'resting')

  ok('kept today is kept today', keptToday(kept, today))
  ok('and yesterday is not', !keptToday(week, today))

  const often = practice({
    id: 'o',
    days: 11,
    lastDay: today,
    recent: ['2026-09-09', '2026-09-08', '2026-09-06', '2026-09-01', '2026-08-20'],
  })
  ok(
    'four of the last fourteen days, counted honestly',
    keptRecently(often, today, 14) === 4,
    String(keptRecently(often, today, 14)),
  )
  ok('days between two keys', daysBetween('2026-09-01', '2026-09-09') === 8)
  ok('and a garbled key is nought rather than NaN', daysBetween('not a day', '2026-09-09') === 0)
}

console.log('\nwhat is waiting, and what the mist does about it\n')

{
  const today = '2026-09-09'
  const practices: Practice[] = [
    practice({ id: 'spanish', kind: 'words', by: 'both', lastDay: today, days: 30 }),
    practice({ id: 'drawing', kind: 'days', by: 'warm', lastDay: '2026-09-05', days: 12 }),
    practice({ id: 'piano', kind: 'days', by: 'cool', lastDay: '2026-09-05', days: 12 }),
    practice({ id: 'gone', kind: 'days', by: 'warm', lastDay: null, days: 0, restingAt: NOW }),
  ]
  const words = [
    word({ id: 'w1', practiceId: 'spanish' }),
    word({ id: 'w2', practiceId: 'spanish' }),
    // Belongs to a practice that is not a language, so it is not in anybody's
    // session however due it looks.
    word({ id: 'stray', practiceId: 'drawing' }),
  ]

  const mine = todoFor(practices, words, 'warm', today, NOW)
  ok('her solo practice is not mine to mark', !mine.marks.some((p) => p.id === 'piano'))
  ok('mine is', mine.marks.some((p) => p.id === 'drawing'))
  ok('and one put out to rest asks for nothing', !mine.marks.some((p) => p.id === 'gone'))
  ok('a word filed under a non-language is never dealt', !mine.words.some((w) => w.id === 'stray'))
  ok('the shared language is mine to sit down to', mine.words.length === 2)

  ok('nothing to do means the hill is already clear', mistProgress({ started: 0, at: 0, marked: [] }) === 1)
  /*
    The distinction that made the mist not exist at all in the first build.
    Not-yet-counted is not the same as nothing-to-do, and treating them the same
    clears the hill for the first second of every visit.
  */
  ok('but not-yet-counted is thick, not clear', mistProgress({ started: null, at: 0, marked: [] }) === 0)
  ok('half done is half back', Math.abs(mistProgress({ started: 8, at: 3, marked: ['a'] }) - 0.5) < 1e-9)
  ok('and it never runs past one', mistProgress({ started: 2, at: 9, marked: [] }) === 1)

  const open = { near: 26, far: 108 }
  const thick = mistAt(0, open)
  const clear = mistAt(1, open)
  ok('thick mist still leaves the ground at your feet', thick.near >= 5, `${thick.near} m`)
  ok('and a kept animal at twenty-three metres is inside the fog, not erased',
    fogAt(23, thick) > 0.2 && fogAt(23, thick) < 0.65, fogAt(23, thick).toFixed(2))
  ok('one a month behind, at forty-seven, is gone', fogAt(47, thick) > 0.97, fogAt(47, thick).toFixed(2))
  ok('and when it lifts, that same animal is plainly there', fogAt(47, clear) < 0.35, fogAt(47, clear).toFixed(2))
  ok('the far ridge is visible once the work is done', fogAt(65, clear) < 0.6, fogAt(65, clear).toFixed(2))

  let last = -1
  let rising = true
  for (let i = 0; i <= 20; i++) {
    const far = mistAt(i / 20, open).far
    if (far < last) rising = false
    last = far
  }
  ok('and it only ever opens as you work, never closes', rising)
}

console.log('\nwhat a person has met\n')

{
  const words = [
    word({ id: 'a', boxes: { warm: 2 } }),
    word({ id: 'b', boxes: { warm: 0, cool: 3 } }),
    word({ id: 'c', boxes: { cool: 1 } }),
    word({ id: 'd' }),
  ]
  ok('counted per person, never between them', metCount(words, 'warm') === 2 && metCount(words, 'cool') === 2)
  ok('box zero still counts as met', boxOf(words[1], 'warm') === 0)
}

/** The shader's own `smoothstep(near, far, depth)`, so this tests what is drawn. */
function fogAt(metres: number, mist: { near: number; far: number }): number {
  const t = Math.max(0, Math.min(1, (metres - mist.near) / (mist.far - mist.near)))
  return t * t * (3 - 2 * t)
}

console.log(
  failed === 0
    ? '\nThe hill keeps its word.\n'
    : `\n${failed} of these did not hold.\n`,
)
process.exit(failed === 0 ? 0 : 1)
