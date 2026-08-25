/**
 * Scattergories, measured.
 *
 * `npm run scatter`.
 *
 * Nothing in `rules.ts` touches React or the DOM, which means the whole game
 * can be dealt and scored in Node — and it has to be, because the two things
 * most likely to be wrong here are both invisible from the outside:
 *
 *   **the deal**, which must be identical on two phones that never speak, and
 *   must never put a letter next to a category with no answers in it;
 *
 *   **what counts as the same answer**, which decides whether somebody scores
 *   and is therefore the one piece of this game that can quietly be unfair.
 *
 * A wrong *merge* is much worse than a wrong miss: a miss means you both
 * score, a merge silently deletes a point somebody earned.
 */

import {
  ROUNDS,
  PER_SHEET,
  alliteration,
  begins,
  deal,
  dealMatch,
  same,
  score,
} from '../src/world/games/scattergories/rules'
import { CATEGORIES, DIE_FACES, fits } from '../src/world/games/scattergories/categories'

let failures = 0

function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(
    `  ${ok ? '·' : '✗'} ${what.padEnd(52)} ${ok ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`}`,
  )
}

console.log('\n  The list')
console.log('  ' + '-'.repeat(64))
console.log(`  · ${CATEGORIES.length} categories, ${DIE_FACES.length} faces on the die`)
// Some of them are genuinely short — "A bird", "A tree" — and should be.
check('every category has an id and words', CATEGORIES.every((c) => c.id && c.text.length > 4), true)
check('a few more plural spellings', [
  ['shoe', 'shoes'], ['canoe', 'canoes'], ['potato', 'potatoes'], ['box', 'boxes'],
].every(([x, y]) => same(x) === same(y)), true)
check('no two categories share an id', new Set(CATEGORIES.map((c) => c.id)).size, CATEGORIES.length)
check('no two categories share their words', new Set(CATEGORIES.map((c) => c.text)).size, CATEGORIES.length)
check('the die leaves out the barren letters', DIE_FACES.filter((f) => 'JQVXYZ'.includes(f)).length, 0)

/*
  Every letter must be able to fill a sheet.

  The real question is not "are there enough categories" but "are there enough
  *for this letter* once its exclusions are taken out" — and the answer has to
  be comfortably more than twelve, or the same few would come up every time
  that face is rolled.
*/
console.log('\n  Every face can fill a sheet')
console.log('  ' + '-'.repeat(64))
let thinnest = { letter: '', left: Infinity }
for (const face of DIE_FACES) {
  const left = CATEGORIES.filter((c) => fits(c, face)).length
  if (left < thinnest.left) thinnest = { letter: face, left }
}
check(
  `thinnest face is ${thinnest.letter}, with ${thinnest.left} to choose from`,
  thinnest.left > PER_SHEET * 4,
  true,
)

console.log('\n  Dealing is the same on both phones')
console.log('  ' + '-'.repeat(64))
const a = dealMatch(123456)
const b = dealMatch(123456)
check('the same seed deals the same match', JSON.stringify(a), JSON.stringify(b))
check('a different seed deals a different one', dealMatch(999).flatMap((r) => r.letter).join('') !== a.map((r) => r.letter).join(''), true)
check('four rounds', a.length, ROUNDS)
check('twelve categories each', a.every((r) => r.categories.length === PER_SHEET), true)
check('no category twice on one sheet', a.every((r) => new Set(r.categories.map((c) => c.id)).size === PER_SHEET), true)
check('no letter twice in a match', new Set(a.map((r) => r.letter)).size, ROUNDS)
check('every category fits its letter', a.every((r) => r.categories.every((c) => fits(c, r.letter))), true)

/*
  And it has to hold for *any* seed, not the one that happened to be tried.
  A thousand matches is four thousand sheets, which is more Scattergories than
  two people will play in a decade.
*/
let bad = 0
for (let seed = 1; seed <= 1000; seed++) {
  for (const round of dealMatch(seed * 2654435761)) {
    if (round.categories.length !== PER_SHEET) bad++
    if (new Set(round.categories.map((c) => c.id)).size !== PER_SHEET) bad++
    if (!round.categories.every((c) => fits(c, round.letter))) bad++
  }
}
check('a thousand matches deal cleanly', bad, 0)

console.log('\n  The same answer, typed two ways')
console.log('  ' + '-'.repeat(64))
const alike = (x: string, y: string) => same(x) === same(y)
check('The Lion King = lion king', alike('The Lion King', 'lion king'), true)
check('mother-in-law = mother in law', alike('mother-in-law', 'mother in law'), true)
check('Jollof  rice = jollof rice', alike('Jollof  rice', 'jollof rice'), true)
check('mango = Mangoes', alike('mango', 'Mangoes'), true)
check('lorry = lorries', alike('lorry', 'lorries'), true)
check('a bus = buses', alike('a bus', 'buses'), true)
check('Lagos! = lagos', alike('Lagos!', 'lagos'), true)
check('glass stays glass, not glas', same('glass'), 'glass')
check('dress stays dress', same('dress'), 'dress')
/*
  And the other direction, which matters more: two different answers must not
  be merged. A wrong merge deletes a point somebody earned.
*/
check('mouse is not mouses', alike('mouse', 'mouse s'), false)
check('bread is not beard', alike('bread', 'beard'), false)
check('Kano is not Kanu', alike('Kano', 'Kanu'), false)
check('sun is not sunday', alike('sun', 'sunday'), false)

console.log('\n  Beginning with the letter')
console.log('  ' + '-'.repeat(64))
check('Sokoto begins with S', begins('Sokoto', 'S'), true)
check('sokoto begins with S', begins('sokoto', 'S'), true)
check('The Lion King counts for L', begins('The Lion King', 'L'), true)
check('The Lion King counts for T as well', begins('The Lion King', 'T'), true)
check('Abuja does not begin with S', begins('Abuja', 'S'), false)
check('nothing does not begin with anything', begins('   ', 'S'), false)

console.log('\n  Scoring')
console.log('  ' + '-'.repeat(64))
{
  const mine = ['Sokoto', 'Suya', 'Spaghetti', 'Abuja', '', 'Suya', 'Silly Sam Smith']
  const hers = ['Sokoto', 'Sand', 'Sandwich', 'Anywhere', 'Salt', 'Soup', 'Sugar']
  const out = score(mine, hers, 'S')
  check('a match cancels', out.lines[0].verdict, 'matched')
  check('a unique answer scores one', out.lines[1].points, 1)
  check('so does another', out.lines[2].verdict, 'scored')
  check('the wrong letter is called that', out.lines[3].verdict, 'wrong-letter')
  check('a blank is a blank', out.lines[4].verdict, 'blank')
  check('the same answer twice is refused', out.lines[5].verdict, 'repeated')
  check('three S words are worth three', out.lines[6].points, 3)
  check('the total adds up', out.total, 1 + 1 + 3)
}
check('alliteration counts the words', alliteration('Silly Sam Smith', 'S'), 3)
check('and only the ones that qualify', alliteration('Sam the Man', 'S'), 1)
{
  // A challenge takes the point away, and only for that line.
  const out = score(['Sokoto', 'Suya'], ['Kano', 'Salt'], 'S', [0])
  check('a struck answer scores nothing', out.lines[0].verdict, 'struck')
  check('and the rest of the sheet is untouched', out.lines[1].points, 1)
}
{
  // The seal means a sheet is often scored against nothing at all.
  const out = score(['Sokoto', 'Suya'], [], 'S')
  check('scoring against an empty sheet works', out.total, 2)
}

console.log('\n  A round, as it would actually be dealt')
console.log('  ' + '-'.repeat(64))
{
  const round = deal(20260824, 0)
  console.log(`  the die shows  ${round.letter}`)
  for (const c of round.categories) console.log(`     ${c.text}`)
}

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of these are wrong.\n`)
  process.exitCode = 1
} else {
  console.log('  All of it holds.\n')
}
