/**
 * The seal, and the arithmetic around it.
 *
 * ---------------------------------------------------------------------------
 * The archive's whole design is one rule — *neither of you sees the other's
 * score until you have both given one* — and a rule like that fails silently.
 * A leak does not throw, does not look wrong, and cannot be spotted by looking
 * at the screen, because on one device with one account it is never tested at
 * all: alone, there is no other person to leak to.
 *
 * So it is checked here, where "she has rated it and he has not" is two flags
 * rather than two phones in two countries.
 *
 * The *enforcement* is in `firestore.rules` and cannot be run from here — this
 * checks that everything above the wire agrees with it, which is the half that
 * decides what ends up on the screen.
 *
 *   npm run archive
 * ---------------------------------------------------------------------------
 */

import {
  HIGHEST,
  LOWEST,
  STARS,
  alreadyIn,
  averageOf,
  byYear,
  isScore,
  other,
  scoreAt,
  standing,
  starLabel,
  starsOf,
  stillMine,
  summary,
  tidyTitle,
} from '../src/systems/archive'
import { spaceIsTheirs } from '../src/systems/watching'
import type { UserId, Watched } from '../src/data/types'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

/**
 * A row as one device would actually receive it.
 *
 * Deliberately built the way the wire builds it: the flags are public and the
 * scores are only present when this device is allowed to have them. Handing
 * the test a row with both scores on it would be testing a state that cannot
 * exist, and passing.
 */
function row(over: {
  warm?: number
  cool?: number
  seeing: UserId
  at?: number
  title?: string
  notes?: Partial<Record<UserId, string>>
}): Watched {
  const rated = { warm: over.warm !== undefined, cool: over.cool !== undefined }
  const both = rated.warm && rated.cool
  const scores: Watched['scores'] = {}
  for (const who of ['warm', 'cool'] as UserId[]) {
    const score = who === 'warm' ? over.warm : over.cool
    if (score === undefined) continue
    if (!both && who !== over.seeing) continue
    scores[who] = { by: who, score, at: 1 }
  }
  return {
    id: over.title ?? 'a',
    title: over.title ?? 'A Film',
    by: 'warm',
    at: over.at ?? 0,
    rated,
    notes: { warm: over.notes?.warm ?? '', cool: over.notes?.cool ?? '' },
    scores,
  }
}

console.log('\nthe seal\n')

{
  const nobody = row({ seeing: 'warm' })
  ok('neither of you has rated it', standing(nobody, 'warm') === 'open')
  ok('and there is no average to show', averageOf(nobody, 'warm') === null)

  const justMe = row({ warm: 8, seeing: 'warm' })
  ok('mine alone is waiting', standing(justMe, 'warm') === 'waiting')
  ok('and still shows me no average', averageOf(justMe, 'warm') === null)
  ok('mine is still mine to change', stillMine(justMe, 'warm'))

  /*
    The one that matters. Her score exists, the flag says so, and this device
    was refused the document — so the row arrives with a gap in it and the
    screen must say "yours is next" rather than "she has not rated it".
  */
  const hersOnly = row({ warm: 8, seeing: 'cool' })
  ok('she sees only that it is waiting on her', standing(hersOnly, 'cool') === 'hidden')
  ok('and cannot read the number', hersOnly.scores.warm === undefined)
  ok('and gets no average out of it', averageOf(hersOnly, 'cool') === null)

  const open = row({ warm: 8, cool: 6, seeing: 'cool' })
  ok('both in, and both are readable', standing(open, 'cool') === 'shown')
  ok('the average is the two of them', averageOf(open, 'cool') === 7)
  ok('and neither may change it now', !stillMine(open, 'cool') && !stillMine(open, 'warm'))
}

{
  /*
    A row that says both have rated but is missing a score is a moment, not a
    state: the flag and the score land together, and this device may have read
    the parent before it was allowed to read the child. The honest answer for
    that moment is "not yet" rather than half an average.
  */
  const half: Watched = {
    ...row({ warm: 8, cool: 6, seeing: 'warm' }),
    scores: { warm: { by: 'warm', score: 8, at: 1 } },
  }
  ok('a score still in flight is not half an average', averageOf(half, 'warm') === null)
  ok('though the row still reads as open', standing(half, 'warm') === 'shown')
}

console.log('\nthe two of you\n')

{
  ok('warm’s other half is cool', other('warm') === 'cool')
  ok('and back again', other('cool') === 'warm')

  // Whichever side is reading, the average is the same number.
  const seenByWarm = row({ warm: 9, cool: 4, seeing: 'warm' })
  const seenByCool = row({ warm: 9, cool: 4, seeing: 'cool' })
  ok(
    'the average does not depend on who is looking',
    averageOf(seenByWarm, 'warm') === averageOf(seenByCool, 'cool'),
  )
  ok('and it can land between halves', averageOf(seenByWarm, 'warm') === 6.5)
  ok('which is 3.3 stars', starsOf(6.5).toFixed(1) === '3.3')
}

console.log('\nscores\n')

{
  ok('a whole number in range is a score', isScore(7))
  ok('the floor is one half-star', isScore(LOWEST) && LOWEST === 1)
  ok('the ceiling is five stars', isScore(HIGHEST) && HIGHEST === STARS * 2)
  ok('zero is not a score', !isScore(0))
  ok('eleven is not a score', !isScore(11))
  ok('and neither is three and a half half-stars', !isScore(3.5))
  ok('nor a string that looks like one', !isScore('7'))

  ok('ten half-stars is five', starsOf(10) === 5)
  ok('seven is three and a half', starsOf(7) === 3.5)

  ok('a whole number says itself', starLabel(8) === '4')
  ok('an odd one wears the half', starLabel(7) === '3½')
  ok('and one half-star is just the half', starLabel(1) === '½')
}

{
  /*
    Rounded up to the next half rather than to the nearest one. A tap in the
    left half of the third star means three stars, which is what somebody
    aiming at a star means by hitting it — nearest would give the first half of
    every star to the star before it, and read as a control off by one.
  */
  ok('the very left edge is still half a star', scoreAt(0) === LOWEST)
  ok('the right edge is all five', scoreAt(1) === HIGHEST)
  ok('anywhere in the first star’s left half is a half', scoreAt(0.05) === 1)
  ok('its right half is a whole one', scoreAt(0.15) === 2)
  ok('landing on the third star gives three', scoreAt(0.45) === 5)
  ok('past the end is still five', scoreAt(1.4) === HIGHEST)
  ok('and before the start is still a half', scoreAt(-0.4) === LOWEST)
}

console.log('\nthe list itself\n')

{
  const rows = [
    row({ title: 'Dune Part Two', seeing: 'warm', at: Date.UTC(2026, 4, 2) }),
    row({ title: 'Arrival', seeing: 'warm', at: Date.UTC(2025, 10, 9) }),
    row({ title: 'Paddington', seeing: 'warm', at: Date.UTC(2025, 1, 3) }),
  ]

  const years = byYear(rows)
  ok('the years come out newest first', years.map((y) => y.year).join(',') === '2026,2025')
  ok('and hold the right films', years[1].rows.length === 2)
  ok('newest first inside a year', years[1].rows[0].title === 'Arrival')

  ok('a film already there is found', alreadyIn(rows, 'dune part two') !== null)
  ok('however it was spaced', alreadyIn(rows, '  Dune   Part  Two ') !== null)
  ok('and one that is not, is not', alreadyIn(rows, 'Dune') === null)
  ok('nothing is never already there', alreadyIn(rows, '   ') === null)

  ok('a title is tidied, never parsed', tidyTitle('  Dune   Part Two  ') === 'Dune Part Two')
  ok('and cut at a hundred and twenty', tidyTitle('x'.repeat(400)).length === 120)
}

{
  /*
    The summary must not move when *she* rates something. It counts only rows
    this device can already see a verdict on — anything else would leak both
    that she had rated and, over two or three films, roughly what she gave.
  */
  const before = summary(
    [row({ warm: 8, seeing: 'warm' }), row({ warm: 6, cool: 10, seeing: 'warm', title: 'b' })],
    'warm',
  )
  ok('three films, one of them open', before.seen === 2 && before.rated === 1)
  ok('and the average is only that one', before.average === 8)
  ok('an empty archive has no average', summary([], 'warm').average === null)
}

console.log('\nthe space bar\n')

{
  /*
    The rule the night screen's spacebar turns on: an empty field is somebody
    watching a film with a cursor in a box, and the space goes to the film.
  */
  const field = (over: Partial<Parameters<typeof spaceIsTheirs>[0]>) =>
    spaceIsTheirs({ tag: 'TEXTAREA', editable: false, type: '', value: '', ...over })

  ok('an empty composer gives the space up', !field({}))
  ok('one with a word in it keeps it', field({ value: 'hey' }))
  ok('a field holding only spaces gives it up too', !field({ value: '   ' }))
  ok('a text input is the same', !field({ tag: 'INPUT', type: 'text' }))
  ok('and keeps it once written in', field({ tag: 'INPUT', type: 'text', value: 'dune' }))
  ok('a contenteditable counts as a field', !field({ tag: 'DIV', editable: true }))
  ok('with its text as its value', field({ tag: 'DIV', editable: true, value: 'a' }))

  // The things a space operates rather than types into keep it, always.
  ok('a select keeps its space', field({ tag: 'SELECT' }))
  ok('a checkbox keeps its space', field({ tag: 'INPUT', type: 'checkbox' }))
  ok('a radio keeps its space', field({ tag: 'INPUT', type: 'radio' }))
  ok('a file button keeps its space', field({ tag: 'INPUT', type: 'file' }))
  ok('and anything that is not a field at all', field({ tag: 'BUTTON' }))
}

console.log(
  failed === 0
    ? '\n  the archive holds\n'
    : `\n  ${failed} of them do not\n`,
)
process.exit(failed === 0 ? 0 : 1)
