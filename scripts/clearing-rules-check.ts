// Run against an isolated Firestore emulator on 127.0.0.1:8189, with
// firestore.rules placeholders replaced by warm@example.test / cool@example.test.
// The demo project ID and explicit emulator connection keep this off production.
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  connectFirestoreEmulator,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  terminate,
} from 'firebase/firestore'
import { firebaseLearning } from '../src/learning/firebaseLearning'
import type { LearningGarden, Practice } from '../src/learning/model'

const apps = ['warm', 'cool', 'outsider'].map((id) =>
  initializeApp({ projectId: 'demo-clearing', apiKey: 'demo-clearing' }, 'clearing-' + id),
)
const dbs = apps.map((app, i) => {
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8189, {
    mockUserToken: {
      sub: ['warm', 'cool', 'outsider'][i],
      email: ['warm@example.test', 'cool@example.test', 'outside@example.test'][i],
    },
  })
  return db
})
const [warmDb, coolDb, outsideDb] = dbs
const warm = firebaseLearning(warmDb, 'warm', Date.now),
  cool = firebaseLearning(coolDb, 'cool', Date.now)
const practice: Practice = {
  id: 'rule-check-' + Date.now(),
  by: 'warm',
  path: 'spanish',
  lesson: 'spanish-1',
  at: Date.now(),
  day: '2026-09-09',
  seconds: 45,
  score: 100,
  passed: true,
  recall: [{ card: 'spanish-1-1', correct: true }],
  drawing: '',
  reflection: 'Hola.',
}
const denied = async (work: () => Promise<unknown>, label: string) => {
  await assert.rejects(work, (error: any) => error.code === 'permission-denied')
  console.log('PASS ' + label)
}
let stop = () => {}
try {
  await warm.nameCompanion('Pip', 'honey')
  await warm.keepPractice(practice)
  await warm.keepPractice(practice)
  const saved = await getDoc(doc(warmDb, 'learning', 'warm', 'practices', practice.id))
  assert.equal(saved.data()?.score, 100)
  const pet = await getDoc(doc(coolDb, 'learning', 'warm'))
  assert.equal(pet.data()?.name, 'Pip')
  assert.equal(pet.data()?.practiceDays.length, 1)
  console.log('PASS cloud adoption, atomic practice save, idempotent retry, and shared companion')
  await denied(
    () => getDoc(doc(coolDb, 'learning', 'warm', 'practices', practice.id)),
    'partner cannot read private answers',
  )
  await denied(
    () => setDoc(doc(coolDb, 'learning', 'warm'), { name: 'Changed' }, { merge: true }),
    'partner cannot change your companion',
  )
  await denied(
    () =>
      setDoc(doc(warmDb, 'learning', 'warm', 'practices', practice.id), { ...practice, score: 50 }),
    'kept practice cannot be rewritten',
  )
  await denied(
    () =>
      setDoc(doc(warmDb, 'learning', 'warm', 'practices', 'invalid-score'), {
        ...practice,
        id: 'invalid-score',
        score: 101,
      }),
    'out-of-range scores rejected',
  )
  await denied(() => getDoc(doc(outsideDb, 'learning', 'warm')), 'outsiders cannot read companions')
  await denied(
    () => setDoc(doc(outsideDb, 'learning', 'warm'), { name: 'Intruder' }, { merge: true }),
    'outsiders cannot write companions',
  )
  await warm.shareDiscovery(practice, 'A phrase for tonight.')
  assert.equal(
    (await getDoc(doc(coolDb, 'learningDiscoveries', practice.id))).data()?.note,
    'A phrase for tonight.',
  )
  await denied(() => cool.removeDiscovery(practice.id), 'partner cannot delete your discovery')
  await denied(
    () =>
      setDoc(doc(coolDb, 'learningDiscoveries', practice.id), {
        id: practice.id,
        by: 'cool',
        path: 'spanish',
        lesson: 'spanish-1',
        at: Date.now(),
        note: 'Taken over',
        drawing: '',
      }),
    'partner cannot take over a discovery',
  )
  await denied(
    () => warm.shareDiscovery({ ...practice, drawing: 'not the kept drawing' }, 'Altered'),
    'only the kept drawing can be shared',
  )
  await denied(
    () => getDoc(doc(outsideDb, 'learningDiscoveries', practice.id)),
    'outsiders cannot read discoveries',
  )
  await cool.nameCompanion('Pebble', 'cloud')
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error('Cloud subscription did not load all four sources')),
      8000,
    )
    stop = cool.watchLearning((garden: LearningGarden) => {
      if (!garden.loaded) return
      try {
        assert.equal(garden.practices.length, 0)
        assert(garden.discoveries.some((d) => d.id === practice.id))
        assert.equal(garden.companions.warm?.name, 'Pip')
        clearTimeout(timeout)
        resolve()
      } catch (error) {
        clearTimeout(timeout)
        reject(error)
      }
    }, reject)
  })
  console.log(
    'PASS all cloud subscriptions load; shared discoveries arrive without private practices',
  )
  stop()
  await warm.removeDiscovery(practice.id)
  assert.equal((await getDoc(doc(coolDb, 'learningDiscoveries', practice.id))).exists(), false)
  await denied(
    () => deleteDoc(doc(warmDb, 'learning', 'warm', 'practices', practice.id)),
    'completed practice cannot be silently deleted',
  )
  console.log('PASS owner can remove their shared discovery')
  const levels = {
    garden: 1,
    tree: 0,
    river: 0,
    hollow: 0,
    stars: 0,
    clearing: 0.4,
    lanterns: 0,
    bleedClearing: 0,
    bleedLanterns: 0,
  }
  await setDoc(doc(warmDb, 'ambienceTuning', 'ours'), levels)
  await denied(
    () => setDoc(doc(warmDb, 'ambienceTuning', 'ours'), { ...levels, clearing: 2 }),
    'Clearing ambience stays in range',
  )
  await setDoc(doc(warmDb, 'ambienceTuning', 'ours'), {
    tree: 0,
    river: 0,
    hollow: 0,
    stars: 0,
    glasshouse: 0,
  })
  console.log('PASS current six-place and legacy ambience settings are accepted')
} finally {
  stop()
  await Promise.all(dbs.map((db) => terminate(db)))
  await Promise.all(apps.map((app) => deleteApp(app)))
}
