import type { UserId } from '@/data/types'

export type PathId = 'spanish' | 'mandarin' | 'hausa' | 'drawing' | 'rhythm'
export type Coat = 'honey' | 'ink' | 'cloud'
export interface Companion {
  name: string
  coat: Coat
  adoptedAt: number
  practiceDays: string[]
  completed: string[]
}
export interface Recall {
  card: string
  correct: boolean
}
export interface Practice {
  id: string
  by: UserId
  path: PathId
  lesson: string
  at: number
  day: string
  seconds: number
  score: number
  passed: boolean
  recall: Recall[]
  drawing: string
  reflection: string
}
export interface Discovery {
  id: string
  by: UserId
  path: PathId
  lesson: string
  at: number
  note: string
  drawing: string
}
export interface LearningGarden {
  companions: Partial<Record<UserId, Companion>>
  practices: Practice[]
  discoveries: Discovery[]
  loaded: boolean
}
export const emptyLearning = (): LearningGarden => ({
  companions: {},
  practices: [],
  discoveries: [],
  loaded: false,
})
export interface LearningData {
  watchLearning(
    listener: (garden: LearningGarden) => void,
    failure: (error: Error) => void,
  ): () => void
  nameCompanion(name: string, coat: Coat): Promise<void>
  keepPractice(practice: Practice): Promise<void>
  shareDiscovery(practice: Practice, note: string): Promise<void>
  removeDiscovery(id: string): Promise<void>
}
export const PATH_IDS: PathId[] = ['spanish', 'mandarin', 'hausa', 'drawing', 'rhythm']
export function practiceDay(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  return ['year', 'month', 'day'].map((type) => parts.find((p) => p.type === type)?.value).join('-')
}
export function companionStage(companion?: Companion) {
  const days = new Set(companion?.practiceDays ?? []).size
  return {
    days,
    level: days >= 30 ? 3 : days >= 12 ? 2 : days >= 4 ? 1 : 0,
    name:
      days >= 30
        ? 'your old friend'
        : days >= 12
          ? 'a brave explorer'
          : days >= 4
            ? 'finding their feet'
            : 'a little newcomer',
    next: days < 4 ? 4 : days < 12 ? 12 : days < 30 ? 30 : null,
  }
}
export function normalizeAnswer(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[¿?¡!.,，。！？”“‘’"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
// A small, explicit review schedule. An error brings a phrase back tomorrow;
// correct retrievals spread it across 1, 3, 7, 14, and 30 days.
export function recallDue(practices: Practice[], now: number) {
  const stats = new Map<string, { due: number; successes: number }>()
  for (const practice of [...practices].sort((a, b) => a.at - b.at)) {
    for (const answer of practice.recall) {
      const previous = stats.get(answer.card)
      const successes = answer.correct ? (previous?.successes ?? 0) + 1 : 0
      const days = answer.correct ? [1, 3, 7, 14, 30][Math.min(4, successes - 1)] : 1
      stats.set(answer.card, { successes, due: practice.at + days * 86400000 })
    }
  }
  return [...stats]
    .filter(([, value]) => value.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id)
}
export function rhythmScore(taps: number[], beats: number[], beatMs: number) {
  const remaining = [...taps]
  let matched = 0,
    error = 0
  for (const beat of beats) {
    const distances = remaining.map((tap) => Math.abs(tap - beat * beatMs))
    const closest = Math.min(...distances)
    if (closest <= Math.min(200, beatMs * 0.3)) {
      matched++
      error += closest
      remaining.splice(distances.indexOf(closest), 1)
    }
  }
  return {
    score: Math.round((100 * matched) / Math.max(beats.length, taps.length, 1)),
    matched,
    error: matched ? Math.round(error / matched) : null,
  }
}
export type Stroke = [number, number][]
export function readDrawing(raw: string): Stroke[] {
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value
      .slice(0, 60)
      .filter(Array.isArray)
      .map((line) =>
        line
          .slice(0, 150)
          .filter(
            (p: unknown) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 700),
          ),
      ) as Stroke[]
  } catch {
    return []
  }
}
export function validatePractice(practice: Practice, me: UserId) {
  if (
    practice.by !== me ||
    !/^[a-zA-Z0-9-]{8,80}$/.test(practice.id) ||
    !PATH_IDS.includes(practice.path) ||
    !/^[a-z0-9-]{1,80}$/.test(practice.lesson) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(practice.day) ||
    !Number.isFinite(practice.at) ||
    practice.at <= 0 ||
    !Number.isFinite(practice.seconds) ||
    practice.seconds < 0 ||
    practice.seconds > 86400 ||
    !Number.isFinite(practice.score) ||
    practice.score < 0 ||
    practice.score > 100 ||
    typeof practice.passed !== 'boolean' ||
    !Array.isArray(practice.recall) ||
    practice.recall.length > 30 ||
    practice.recall.some(
      (r) =>
        !r || typeof r.card !== 'string' || r.card.length > 80 || typeof r.correct !== 'boolean',
    ) ||
    typeof practice.drawing !== 'string' ||
    practice.drawing.length > 60000 ||
    typeof practice.reflection !== 'string' ||
    practice.reflection.length > 600
  )
    throw Error('This practice could not be saved. Please try again.')
}
export function cleanName(name: string) {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean || clean.length > 24) throw Error('Choose a name between 1 and 24 characters.')
  return clean
}
