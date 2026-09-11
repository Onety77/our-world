import { create } from 'zustand'
import { SAMPLE_MS, type RallyRun, type StageId } from './model'
import { TUNE } from './tuning'
import type { Track } from './track'

const STORAGE = 'rally:personal-lines:v1'
// Bump when handling or course construction changes without changing its data.
const REVISION = 'grip-2026-09-v1'
export interface PersonalLine { key: string; stage: StageId; at: number; run: RallyRun }

export function personalKey(track: Track): string {
  let hash = 2166136261
  const add = (value: string) => {
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  }
  add(`${REVISION}:${track.stage}:${track.seed}:${track.start}:${track.finishAt}`)
  for (const array of [track.x, track.y, track.z, track.width, track.curv, track.bank,
    track.grade, track.wet, track.sand, track.ruts, track.sway, track.gale, track.line]) {
    add(JSON.stringify(Array.from(array)))
  }
  add(JSON.stringify(track.split))
  for (const [key, value] of Object.entries(TUNE)) {
    if (!key.startsWith('camera') && !['bodyLean', 'leanLimit', 'bodyFloat'].includes(key)) add(`${key}:${value};`)
  }
  return `${track.stage}:${track.seed}:${hash >>> 0}`
}

export function validPersonalRun(raw: unknown): raw is RallyRun {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as RallyRun
  return r.v === 4 && Number.isFinite(r.timeMs) && r.timeMs > 0 && r.timeMs <= 1_800_000 &&
    Number.isFinite(r.strikes) && r.strikes >= 0 && Number.isFinite(r.driftMs) && r.driftMs >= 0 &&
    Array.isArray(r.path) && r.path.length >= 8 && r.path.length <= 72_008 && r.path.length % 4 === 0 &&
    Math.abs(r.path.length / 4 - (Math.floor(r.timeMs / SAMPLE_MS) + 2)) <= 1 &&
    r.path.every(n => Number.isSafeInteger(n) && Math.abs(n) < 100_000_000)
}

export function completePersonalRun(track: Track, run: RallyRun): boolean {
  return validPersonalRun(run) && run.path[1] / 100 <= track.start + 2 &&
    run.path[run.path.length - 3] / 100 >= track.finishAt - 2
}

function read(): PersonalLine[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((r): r is PersonalLine => r && typeof r.key === 'string' && r.key.length < 120 &&
      ['rootway', 'moonbreak', 'stormcrown', 'harmattan', 'nightfall'].includes(r.stage) &&
      Number.isFinite(r.at) && validPersonalRun(r.run)).slice(0, 8)
  } catch { return [] }
}

function persist(records: PersonalLine[]) {
  // Evict older course/tune combinations if this browser is short of storage.
  for (let count = records.length; count >= Math.min(1, records.length); count--) {
    try { localStorage.setItem(STORAGE, JSON.stringify(records.slice(0, count))); return } catch { /* local-only fallback */ }
  }
}

export const usePersonalBest = create<{
  records: PersonalLine[]
  offer(track: Track, key: string, run: RallyRun): boolean
  forget(stage?: StageId): void
}>((set, get) => ({
  records: read(),
  offer(track, key, run) {
    if (key !== personalKey(track) || !completePersonalRun(track, run)) return false
    const had = get().records.find(r => r.key === key)
    if (had && had.run.timeMs <= run.timeMs) return false
    const copy = { ...run, path: run.path.slice() }
    const records = [{ key, stage: track.stage, at: Date.now(), run: copy },
      ...get().records.filter(r => r.key !== key)].slice(0, 8)
    persist(records)
    set({ records })
    return true
  },
  forget(stage) {
    const records = stage ? get().records.filter(r => r.stage !== stage) : []
    persist(records); set({ records })
  },
}))

/** First forward crossing; reversing through a split cannot earn it twice. */
export function timeAtProgress(run: RallyRun, s: number): number | null {
  for (let i = 1; i < run.path.length / 4; i++) {
    const a = run.path[(i - 1) * 4 + 1] / 100, b = run.path[i * 4 + 1] / 100
    if (a <= s && b >= s && b > a) {
      const from = Math.min(run.timeMs, (i - 1) * SAMPLE_MS)
      const to = Math.min(run.timeMs, i * SAMPLE_MS)
      return from + (to - from) * (s - a) / (b - a)
    }
  }
  return null
}
