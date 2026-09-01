/**
 * The Tree's question ritual, walked end to end by both people.
 *
 * ---------------------------------------------------------------------------
 * **Two things here are easy to get wrong and impossible to see.**
 *
 * The first is *which clock the wait runs on*. It used to run from the moment a
 * question opened, which meant a question answered a day late produced the next
 * one instantly — you sealed your answer and the reply you had been waiting for
 * was replaced by a blank box in the same breath. It runs from the moment the
 * two of you finished now, and the difference only shows up if somebody
 * actually answers late, which nobody does on purpose.
 *
 * The second is the *round id*. Questions are one deterministic document per
 * period so that two phones opening one at the same instant produce one
 * question rather than two — and the rules make them create-only, so a second
 * create against an id that already exists is refused *silently*. Bucket the id
 * by the day while asking twice a day and the second question of any day
 * vanishes without a word.
 *
 * So this drives the real local backend through a whole cycle with a clock it
 * controls, and then checks the other backend says the same thing — because
 * there are two implementations of these rules and they have drifted before.
 *
 *   npm run questions
 * ---------------------------------------------------------------------------
 */

import { readFileSync } from 'node:fs'
import { QUESTION_BUILD, QUESTION_DAY } from '../src/data/questionPrompts'

let failed = 0
function ok(what: string, good: boolean, saw = '') {
  if (!good) failed++
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${good || !saw ? '' : `\n          ${saw}`}`)
}

/*
  A localStorage and a clock, because the mock keeps its questions in the first
  and reads the second directly. Both devices then share one store, which is the
  only way to have the two of them answer the same question from here.
*/
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
}

const realNow = Date.now
let clock = Date.UTC(2026, 8, 1, 9, 0, 0)
Date.now = () => clock
const hours = (n: number) => n * 3_600_000

const { createLocalDataLayer } = await import('../src/data/local')

/** A fresh layer each time, so both people read the store as it now stands. */
const as = (who: 'warm' | 'cool') => createLocalDataLayer(who)
function questionsNow() {
  const layer = as('warm')
  let seen: ReturnType<typeof layer.subscribe> extends never ? never : any = null
  const off = layer.subscribe((state) => { seen = state.questions })
  off()
  return seen
}

console.log(`\nHow long the next one takes to grow\n`)
console.log(`  ${(QUESTION_BUILD / 3_600_000).toFixed(0)} hours, where a day is ${QUESTION_DAY / 3_600_000}`)
ok('the wait is twelve hours', QUESTION_BUILD === hours(12), `${QUESTION_BUILD}ms`)

/*
  =========================================================================
  A whole cycle, with both of them answering.
  =========================================================================
*/
console.log(`\nOne question, answered by both\n`)

await as('warm').ensureQuestion()
let garden = questionsNow()
ok('a question opens on an empty Tree', garden.current !== null)
const first = garden.current!
console.log(`  opened "${first.prompt.slice(0, 52)}…"`)

clock += hours(3)
await as('warm').answerQuestion(first.id, 'mine')
garden = questionsNow()
ok('one answer does not complete it', garden.current?.completedAt == null)
ok('and nothing is growing yet', garden.nextAt === null,
  `nextAt is ${garden.nextAt}, which would start the clock before you are both done`)

/*
  The late answer is the case the old clock got wrong: a day and a half after
  the question opened, so `openedAt + a day` is long past and the next question
  would have been produced the instant this one landed.
*/
clock += hours(33)
await as('cool').answerQuestion(first.id, 'hers')
garden = questionsNow()
const completedAt = garden.current?.completedAt ?? null
ok('the second answer completes it', completedAt === clock)
ok('and the wait starts from that moment, not from when it opened',
  garden.nextAt === clock + QUESTION_BUILD,
  `nextAt is ${garden.nextAt}, completed at ${completedAt}, opened at ${first.openedAt}` +
    ` — off openedAt it would be ${first.openedAt + QUESTION_DAY}, which is already past`)

console.log(`\nAnd then it has to grow\n`)

clock += hours(11)
await as('warm').ensureQuestion()
garden = questionsNow()
ok('eleven hours later there is still no new question',
  garden.current?.id === first.id,
  'the next question arrived early')
ok('and the completed one is still what the Tree is holding',
  garden.current?.completedAt != null,
  'the answered question was replaced before it could be read')

clock += hours(2)
await as('warm').ensureQuestion()
garden = questionsNow()
ok('thirteen hours later the next one has grown',
  garden.current != null && garden.current.id !== first.id)
ok('and the answered one is still readable in the history',
  garden.history.some((round: { id: string }) => round.id === first.id),
  'the question you both just answered is not in the history')

/*
  =========================================================================
  Twice in one day, which is the case the round id can lose silently.

  The walk above answers late on purpose, so its two questions land on
  different dates and a day-shaped id would have survived it. This one is the
  ordinary rhythm — answer in the morning, the next one grows by the evening —
  and it is the one where an id keyed to the day hands the second question the
  first one's document. Create-only rules then refuse it without a word and the
  Tree simply stops asking.
  =========================================================================
*/
console.log(`\nTwice in one day\n`)
store.clear()
clock = Date.UTC(2026, 8, 10, 8, 0, 0)

await as('warm').ensureQuestion()
const morning = questionsNow().current!
clock += hours(1)
await as('warm').answerQuestion(morning.id, 'mine')
await as('cool').answerQuestion(morning.id, 'hers')
clock += hours(13)
await as('warm').ensureQuestion()
const evening = questionsNow().current!

console.log(`  ${new Date(morning.openedAt).toISOString().slice(0, 16)} → ${morning.id}`)
console.log(`  ${new Date(evening.openedAt).toISOString().slice(0, 16)} → ${evening.id}`)
ok('both questions opened on the same calendar day',
  Math.floor(morning.openedAt / QUESTION_DAY) === Math.floor(evening.openedAt / QUESTION_DAY),
  'the walk drifted onto two days, so this did not test the collision')
ok('and they are still two different documents', morning.id !== evening.id,
  `both are "${morning.id}" — the second question would be refused silently`)

/*
  The property the id relies on, swept rather than argued: any two openings are
  at least one building period apart, and a bucket that size can never give two
  such moments the same number.
*/
let collisions = 0
for (let start = 0; start < 400; start++) {
  const a = Date.UTC(2026, 0, 1) + start * 977_000
  const b = a + QUESTION_BUILD
  if (Math.floor(a / QUESTION_BUILD) === Math.floor(b / QUESTION_BUILD)) collisions++
}
ok('no two openings a building period apart can share a bucket', collisions === 0,
  `${collisions} of 400 collided`)

/*
  =========================================================================
  And the other backend has to say the same thing.

  These rules exist twice — once for the mock and once for the real database —
  and the two have drifted before. Read rather than run, because standing up
  Firestore in a check script is a much bigger lie than reading the file.
  =========================================================================
*/
console.log(`\nBoth backends tell the same story\n`)
for (const file of ['src/data/local.ts', 'src/data/firebase.ts']) {
  const source = readFileSync(file, 'utf8')
  const name = file.split('/').pop()
  ok(`${name} starts the wait from completedAt`,
    source.includes('completedAt + QUESTION_BUILD'),
    'it still measures from openedAt, so a late answer produces the next question instantly')
  ok(`${name} gates on it too`,
    /completedAt \?\? \w+\) \+ QUESTION_BUILD/.test(source),
    'ensureQuestion is not using the same clock as nextAt')
  ok(`${name} buckets the round id by the building period`,
    source.includes('question-${Math.floor(') && source.includes('/ QUESTION_BUILD)}`'),
    'the id is still day-shaped, so the second question of a day is dropped silently')
  ok(`${name} no longer measures the question wait in days`,
    !source.includes('openedAt + QUESTION_DAY'),
    'the old clock is still in there')
}

Date.now = realNow
console.log('')
if (failed > 0) {
  console.log(`  ${failed} thing(s) wrong.\n`)
  process.exit(1)
}
console.log('  the Tree asks once, waits twelve hours, and keeps what you answered\n')
