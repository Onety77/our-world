/**
 * The time to beat.
 *
 * ---------------------------------------------------------------------------
 * **There was no score anywhere in this game.** You drove a road, it told you
 * how long you took, and then the number was gone — so the second run had
 * nothing to be better than and the tenth had nothing to show for the nine
 * before it. Her ghost exists and is the better opponent when there is one,
 * but there is not always one, and "on your own" meant driving against
 * nothing at all.
 *
 * So: the quickest clean-ish run per road, per device, kept forever.
 *
 * **Per device, in localStorage, and deliberately not in Firestore.** Two
 * reasons and the second is the one that decides it. The small one is that the
 * backend is not switched on yet, so anything written there cannot be tested
 * today. The large one is that this is not a *shared* number — the pair of you
 * already have a shared way of comparing runs and it is a great deal better
 * than a table of times: you race her recorded line and watch where she pulls
 * away. A leaderboard beside that would be a worse version of a thing this
 * game already does well.
 *
 * What it is for is the solitary case: you, on a road, trying to be quicker
 * than you were on Tuesday.
 *
 * The shape is a plain record keyed by stage, so lifting it into a document
 * later is a change of storage and not a change of meaning.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'
import type { StageId } from './model'

export interface Best {
  /** Milliseconds. */
  timeMs: number
  /** How many times the rock was hit on that run. Context, not a filter. */
  strikes: number
  /** Seconds spent sideways — the thing the road is actually about. */
  driftMs: number
  /** When, so "you have not driven this in a month" is answerable later. */
  at: number
}

export type Bests = Partial<Record<StageId, Best>>

const KEY = 'rally:best:v1'

function clean(raw: unknown): Bests {
  if (raw === null || typeof raw !== 'object') return {}
  const source = raw as Record<string, unknown>
  const out: Bests = {}
  for (const stage of ['rootway', 'moonbreak', 'stormcrown', 'firstlight'] as const) {
    const value = source[stage]
    if (value === null || typeof value !== 'object') continue
    const it = value as Record<string, unknown>
    const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)
    const timeMs = num(it.timeMs)
    // A zero or negative time is a bug upstream, not a very good lap.
    if (timeMs <= 0) continue
    out[stage] = {
      timeMs,
      strikes: Math.max(0, Math.round(num(it.strikes))),
      driftMs: Math.max(0, num(it.driftMs)),
      at: num(it.at),
    }
  }
  return out
}

function read(): Bests {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    return raw === null ? {} : clean(JSON.parse(raw))
  } catch {
    return {}
  }
}

function write(bests: Bests): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(bests))
  } catch {
    /* storage blocked; the run still happened, the device just forgets it */
  }
}

/**
 * What the most recent finished run did to the board.
 *
 * Kept here rather than worked out on the result screen, because `offer` is
 * called the instant the car crosses the line and the screen renders after —
 * by which time the old time has already been replaced and there is nothing
 * left to compare against. Written once per run, and the screen that reports
 * it does not have to keep a second copy of the board to do so.
 */
export interface Offer {
  stage: StageId
  /** True if this run went onto the board. */
  improved: boolean
  /** What it was measured against, or null if this road was never finished. */
  beatMs: number | null
  /** Signed milliseconds against that: negative is quicker. */
  byMs: number
}

interface BestState {
  bests: Bests
  lastOffer: Offer | null
  /**
   * Offer a finished run. Returns true if it was quicker than what was there.
   *
   * Returning the answer rather than having the caller compare is what lets
   * the end-of-run screen say *"a new best, by 1.4 s"* without either side
   * keeping a second copy of the old number.
   */
  offer(stage: StageId, run: Best): boolean
  forget(stage: StageId): void
  forgetAll(): void
}

export const useBest = create<BestState>((set, get) => ({
  bests: read(),
  lastOffer: null,

  offer(stage, run) {
    if (!Number.isFinite(run.timeMs) || run.timeMs <= 0) return false
    const had = get().bests[stage]
    const beatMs = had ? had.timeMs : null
    const byMs = had ? run.timeMs - had.timeMs : 0
    if (had && had.timeMs <= run.timeMs) {
      set({ lastOffer: { stage, improved: false, beatMs, byMs } })
      return false
    }
    const bests = { ...get().bests, [stage]: run }
    write(bests)
    set({ bests, lastOffer: { stage, improved: true, beatMs, byMs } })
    return true
  },

  forget(stage) {
    const bests = { ...get().bests }
    delete bests[stage]
    write(bests)
    set({ bests })
  },

  forgetAll() {
    write({})
    set({ bests: {} })
  },
}))

/**
 * Has anybody on this device ever finished anything?
 *
 * The one question the first-race tutorial asks. Any road counts: somebody who
 * has finished the Rootway knows which side of the screen turns left, and
 * being told again on the Moonbreak is being talked down to.
 */
export function hasFinishedARace(): boolean {
  return Object.keys(useBest.getState().bests).length > 0
}

/** `1:07.42`, or `47.19` under a minute. The same shape the run screen uses. */
export function timeLabel(ms: number): string {
  const total = Math.max(0, ms) / 1000
  const minutes = Math.floor(total / 60)
  const seconds = total - minutes * 60
  const body = seconds.toFixed(2).padStart(5, '0')
  return minutes > 0 ? `${minutes}:${body}` : body
}

/** `−1.42` / `+0.30`, for the gap to a best. Always signed. */
export function gapLabel(ms: number): string {
  const sign = ms <= 0 ? '−' : '+'
  return `${sign}${(Math.abs(ms) / 1000).toFixed(2)}`
}
