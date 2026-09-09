import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { UserId } from '@/data/types'
import {
  cleanName,
  emptyLearning,
  validatePractice,
  type Companion,
  type Discovery,
  type LearningData,
  type Practice,
} from './model'

export function firebaseLearning(db: Firestore, me: UserId, now: () => number): LearningData {
  const pet = doc(db, 'learning', me)
  return {
    watchLearning(listener, failure) {
      let state = emptyLearning()
      const ready = new Set<string>()
      const emit = (key: string) => {
        ready.add(key)
        state = { ...state, loaded: ready.size === 4 }
        listener(state)
      }
      const stop = (['warm', 'cool'] as const).map((who) =>
        onSnapshot(
          doc(db, 'learning', who),
          (snapshot) => {
            const raw = snapshot.data()
            const companion: Companion | undefined = raw
              ? {
                  name: String(raw.name ?? 'Little one'),
                  coat: ['honey', 'ink', 'cloud'].includes(raw.coat) ? raw.coat : 'honey',
                  adoptedAt: Number(raw.adoptedAt ?? 0),
                  practiceDays: Array.isArray(raw.practiceDays) ? raw.practiceDays : [],
                  completed: Array.isArray(raw.completed) ? raw.completed : [],
                }
              : undefined
            state = { ...state, companions: { ...state.companions, [who]: companion } }
            emit(who)
          },
          failure,
        ),
      )
      stop.push(
        onSnapshot(
          query(collection(db, 'learning', me, 'practices'), orderBy('at', 'desc')),
          (snapshot) => {
            state = {
              ...state,
              practices: snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as Practice),
            }
            emit('practices')
          },
          failure,
        ),
      )
      stop.push(
        onSnapshot(
          query(collection(db, 'learningDiscoveries'), orderBy('at', 'desc'), limit(40)),
          (snapshot) => {
            state = {
              ...state,
              discoveries: snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as Discovery),
            }
            emit('discoveries')
          },
          failure,
        ),
      )
      return () => stop.forEach((off) => off())
    },
    async nameCompanion(name, coat) {
      const current = await getDoc(pet)
      await setDoc(
        pet,
        { name: cleanName(name), coat, adoptedAt: current.data()?.adoptedAt ?? now() },
        { merge: true },
      )
    },
    async keepPractice(practice) {
      validatePractice(practice, me)
      const batch = writeBatch(db)
      batch.set(doc(db, 'learning', me, 'practices', practice.id), practice)
      batch.set(
        pet,
        {
          practiceDays: arrayUnion(practice.day),
          ...(practice.passed ? { completed: arrayUnion(practice.lesson) } : {}),
        },
        { merge: true },
      )
      await batch.commit()
    },
    async shareDiscovery(practice, note) {
      validatePractice(practice, me)
      await setDoc(doc(db, 'learningDiscoveries', practice.id), {
        id: practice.id,
        by: me,
        path: practice.path,
        lesson: practice.lesson,
        at: now(),
        note: note.trim().slice(0, 600),
        drawing: practice.drawing,
      })
    },
    async removeDiscovery(id) {
      await deleteDoc(doc(db, 'learningDiscoveries', id))
    },
  }
}
