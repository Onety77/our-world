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

const KEY = 'garden:clearing:v1'
interface Stored {
  companions: Partial<Record<UserId, Companion>>
  practices: Practice[]
  discoveries: Discovery[]
}
const read = (): Stored => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved?.companions && Array.isArray(saved.practices) && Array.isArray(saved.discoveries))
      return saved
  } catch {}
  return { companions: {}, practices: [], discoveries: [] }
}
export function localLearning(me: UserId): LearningData {
  const watchers = new Set<Parameters<LearningData['watchLearning']>[0]>()
  const view = () => {
    const data = read()
    return {
      ...emptyLearning(),
      ...data,
      practices: data.practices.filter((p) => p.by === me).sort((a, b) => b.at - a.at),
      loaded: true,
    }
  }
  const announce = () => {
    const state = view()
    watchers.forEach((fn) => fn(state))
  }
  const write = (state: Stored) => {
    localStorage.setItem(KEY, JSON.stringify(state))
    announce()
    window.dispatchEvent(new Event('clearing-saved'))
  }
  return {
    watchLearning(listener) {
      watchers.add(listener)
      listener(view())
      const changed = (event: Event) => {
        if (!(event instanceof StorageEvent) || event.key === KEY) announce()
      }
      window.addEventListener('storage', changed)
      window.addEventListener('clearing-saved', changed)
      return () => {
        watchers.delete(listener)
        window.removeEventListener('storage', changed)
        window.removeEventListener('clearing-saved', changed)
      }
    },
    async nameCompanion(name, coat) {
      const state = read(),
        old = state.companions[me]
      state.companions[me] = {
        name: cleanName(name),
        coat,
        adoptedAt: old?.adoptedAt ?? Date.now(),
        practiceDays: old?.practiceDays ?? [],
        completed: old?.completed ?? [],
      }
      write(state)
    },
    async keepPractice(practice) {
      validatePractice(practice, me)
      const state = read(),
        pet = state.companions[me]
      if (!pet) throw Error('Meet your companion first.')
      if (state.practices.some((p) => p.id === practice.id)) return
      state.practices.push(practice)
      pet.practiceDays = [...new Set([...pet.practiceDays, practice.day])]
      if (practice.passed) pet.completed = [...new Set([...pet.completed, practice.lesson])]
      write(state)
    },
    async shareDiscovery(practice, note) {
      const state = read()
      if (!state.practices.some((p) => p.id === practice.id && p.by === me))
        throw Error('Keep this practice before sharing it.')
      const original = state.practices.find((p) => p.id === practice.id && p.by === me)!
      const discovery: Discovery = {
        id: original.id,
        by: me,
        path: original.path,
        lesson: original.lesson,
        at: Date.now(),
        note: note.trim().slice(0, 600),
        drawing: original.drawing,
      }
      state.discoveries = [...state.discoveries.filter((d) => d.id !== practice.id), discovery]
      write(state)
    },
    async removeDiscovery(id) {
      const state = read()
      state.discoveries = state.discoveries.filter((d) => d.id !== id || d.by !== me)
      write(state)
    },
  }
}
