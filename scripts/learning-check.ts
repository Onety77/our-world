import assert from 'node:assert/strict'
import { PATHS, allPhrases, BEATS } from '../src/learning/catalog'
import {
  cleanName,
  companionStage,
  normalizeAnswer,
  practiceDay,
  readDrawing,
  recallDue,
  rhythmScore,
  validatePractice,
  type Practice,
  type LearningGarden,
} from '../src/learning/model'
import { localLearning } from '../src/learning/localLearning'
import { clearPending, keepPending, readPending } from '../src/learning/pending'

const at = Date.UTC(2026, 8, 9, 23, 30),
  day = 86400000
const practice: Practice = {
  id: 'practice-one',
  by: 'warm',
  path: 'spanish',
  lesson: 'spanish-1',
  at,
  day: '2026-09-10',
  seconds: 100,
  score: 100,
  passed: true,
  recall: [{ card: 'spanish-1-1', correct: true }],
  drawing: '',
  reflection: 'A first hello.',
}
assert.equal(practiceDay(at, 'Africa/Lagos'), '2026-09-10')
assert.equal(practiceDay(at, 'America/Los_Angeles'), '2026-09-09')
assert.equal(practiceDay(Date.UTC(2026, 2, 8, 10, 30), 'America/Los_Angeles'), '2026-03-08')
assert.deepEqual(recallDue([practice], at + day - 1), [])
assert.deepEqual(recallDue([practice], at + day), ['spanish-1-1'])
const twice = { ...practice, id: 'practice-two', at: at + day }
assert.deepEqual(recallDue([twice, practice], at + day * 3), [])
assert.deepEqual(recallDue([twice, practice], at + day * 4), ['spanish-1-1'])
const miss = {
  ...practice,
  id: 'practice-three',
  at: at + day * 4,
  recall: [{ card: 'spanish-1-1', correct: false }],
}
assert.deepEqual(recallDue([twice, practice, miss], at + day * 5), ['spanish-1-1'])
assert.equal(normalizeAnswer('  ¿Cómo te llamas? '), 'cómo te llamas')
assert.equal(normalizeAnswer('A’a'), normalizeAnswer("A'a"))
assert.equal(rhythmScore([0, 750, 1500, 2250], [0, 1, 2, 3], 750).score, 100)
assert.equal(rhythmScore([0, 750, 1500, 2250, 2300, 2350, 2400, 2450], [0, 1, 2, 3], 750).score, 50)
assert.equal(rhythmScore([400, 1150, 1900, 2650], [0, 1, 2, 3], 750).score, 0)
assert.equal(rhythmScore([], BEATS['rhythm-1'], 750).score, 0)
assert.deepEqual(readDrawing('not json'), [])
assert.deepEqual(readDrawing('[[[10,20],[-1,2],[100000,3],["bad",2]]]'), [[[10, 20]]])
assert.equal(cleanName('  Little   Pip  '), 'Little Pip')
assert.throws(() => cleanName(' '))
assert.throws(() => validatePractice({ ...practice, by: 'cool' }, 'warm'))
assert.throws(() => validatePractice({ ...practice, score: NaN }, 'warm'))
assert.throws(() => validatePractice({ ...practice, recall: null as never }, 'warm'))
assert.throws(() => validatePractice({ ...practice, drawing: 'x'.repeat(60001) }, 'warm'))
assert.equal(PATHS.length, 5)
assert.equal(new Set(allPhrases.map((p) => p.id)).size, allPhrases.length)
assert(PATHS.every((p) => p.lessons.length >= 4))
console.log('PASS local dates, spaced recall, answer normalization, rhythm timing, and validation')

const cache = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => cache.get(k) ?? null,
    setItem: (k: string, v: string) => cache.set(k, v),
    removeItem: (k: string) => cache.delete(k),
  },
})
Object.defineProperty(globalThis, 'window', { value: new EventTarget() })
Object.defineProperty(globalThis, 'StorageEvent', {
  value: class extends Event {
    key: string | null = null
  },
})
const warm = localLearning('warm'),
  cool = localLearning('cool')
assert.equal(keepPending(practice), true)
assert.equal(readPending('warm')?.id, practice.id)
assert.equal(readPending('cool'), null)
clearPending({ ...practice, id: 'different-session' })
assert.equal(readPending('warm')?.id, practice.id)
clearPending(practice)
assert.equal(readPending('warm'), null)
let ours: LearningGarden, theirs: LearningGarden
const stopWarm = warm.watchLearning(
    (s) => (ours = s),
    () => {},
  ),
  stopCool = cool.watchLearning(
    (s) => (theirs = s),
    () => {},
  )
await assert.rejects(() => warm.keepPractice(practice))
await warm.nameCompanion('Pip', 'honey')
await warm.keepPractice(practice)
await warm.keepPractice(practice)
assert.equal(ours!.practices.length, 1)
assert.equal(theirs!.practices.length, 0)
assert.equal(theirs!.companions.warm?.name, 'Pip')
assert.equal(ours!.discoveries.length, 0)
await warm.keepPractice({ ...practice, id: 'practice-same-day' })
assert.equal(companionStage(ours!.companions.warm).days, 1)
await warm.shareDiscovery({ ...practice, drawing: 'forged' }, 'Try this with me.')
assert.equal(theirs!.discoveries[0].drawing, '')
await assert.rejects(() => cool.shareDiscovery(practice, 'Not mine.'))
await cool.removeDiscovery(practice.id)
assert.equal(theirs!.discoveries.length, 1)
await warm.removeDiscovery(practice.id)
assert.equal(theirs!.discoveries.length, 0)
for (let i = 1; i < 30; i++)
  await warm.keepPractice({
    ...practice,
    id: `practice-day-${i}`,
    at: at + i * day,
    day: practiceDay(at + i * day, 'Africa/Lagos'),
  })
assert.equal(companionStage(ours!.companions.warm).level, 3)
await warm.nameCompanion('Pebble', 'cloud')
assert.equal(companionStage(ours!.companions.warm).days, 30)
assert.equal(ours!.companions.warm?.completed.length, 1)
stopWarm()
stopCool()
console.log(
  'PASS idempotent saves, private practices, explicit sharing, ownership, growth, and renaming',
)
