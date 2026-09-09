/**
 * A visit to the Fold: what is up there, and how far through today you are.
 *
 * ---------------------------------------------------------------------------
 * `systems/fold` is the arithmetic and has no React in it. This is the live
 * state of *one visit* — which words are in front of you, whether the current
 * one has been turned over, and therefore how far the mist has pulled back.
 *
 * Fed by exactly one watcher mounted in `App` for the life of the session, the
 * same as the memories store and for the same reason: the hill has to be drawn
 * out in the garden as well as inside the place, so a second subscription would
 * be a second read of everything.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'
import type { FoldGarden, Practice, UserId, Word } from '@/data/types'
import { keptToday, sessionFor } from './fold'

/** What one visit is trying to get through. */
export interface Todo {
  /** The words due for this person now, in the order to show them. */
  words: Word[]
  /** Practices of the `days` kind not yet kept today, by this person. */
  marks: Practice[]
}

interface TendingState {
  practices: Practice[]
  words: Word[]
  loaded: boolean

  /**
   * The queue for this sitting, fixed when it starts.
   *
   * Fixed rather than recomputed, and that is the whole reason it is here: a
   * queue derived live from `dueAt` **shrinks under you as you answer**, so the
   * mist would jump forward on every word and the thing you were half way
   * through would quietly become the thing you had finished. A session is a
   * list decided once.
   */
  queue: Word[]
  /** How far down the queue. Equal to `queue.length` when it is finished. */
  at: number
  /** Whether the word in front of you has been turned over yet. */
  turned: boolean
  /** Marks made this visit, so the mist counts them without a refetch. */
  marked: string[]
  /**
   * How much there was to do when you arrived. Zero means nothing was due.
   *
   * `null` until `arrive` has been called, which is not the same as zero — see
   * the note on `arrive`. Everything that reads it treats null as "not yet
   * known" and leaves the mist where it is.
   */
  started: number | null

  /** True while the words are on screen. */
  sitting: boolean
  /**
   * The animal somebody last put a finger on, or null.
   *
   * Written by the *scene*, read by the DOM. It lives here rather than in the
   * section because `ui/Fold` has to say what the animal is, and importing the
   * herd into the interface layer would pull the whole section — its geometry,
   * its shaders and three — into the entry bundle, which is exactly what the
   * round of download work spent its time undoing.
   */
  touched: string | null

  /**
   * Which form is open, if any.
   *
   * ---------------------------------------------------------------------------
   * **Here rather than inside the threshold component, and that is a layout
   * fact rather than a preference.**
   *
   * `.threshold` is `position: fixed` with a `transform` on it for centring —
   * and *a transformed element becomes the containing block for its own
   * `position: fixed` descendants*. So a full-screen sheet rendered as a child
   * of the threshold does not fill the screen at all: `inset: 0` resolves
   * against a 34-rem box near the bottom of the page, and the form comes out as
   * a small dark panel with half its fields scrolled out of sight.
   *
   * Lifting it into the store lets `FoldSitting` render it at the top level,
   * where `inset: 0` means the window. It also lets `systems/attention` see it,
   * which a form covering the world has to be.
   * ---------------------------------------------------------------------------
   */
  forming: { kind: 'take' | 'word' | 'mark'; id?: string } | null

  setFold(fold: FoldGarden): void
  /**
   * How much was outstanding when you walked up the hill.
   *
   * ---------------------------------------------------------------------------
   * **Set on arrival, not when a session starts**, and getting that wrong is
   * what made the mist not exist at all in the first build: `started` was only
   * written by `begin`, so before anybody pressed anything it was zero, zero
   * means nothing-to-do, and nothing-to-do means the hill is clear. The place
   * opened in full view every time and the whole mechanic was invisible.
   *
   * Once per visit — a second call is ignored — because it is the *denominator*.
   * Recomputing it as you work would leave the fraction standing still.
   * ---------------------------------------------------------------------------
   */
  arrive(outstanding: number): void
  begin(queue: Word[], todo: number): void
  turnOver(): void
  advance(): void
  markDone(id: string): void
  touch(id: string | null): void
  form(next: { kind: 'take' | 'word' | 'mark'; id?: string } | null): void
  leave(): void
  /** End the visit. Called when the section unmounts — see the action. */
  leftTheHill(): void
}

export const useTending = create<TendingState>((set) => ({
  practices: [],
  words: [],
  loaded: false,
  queue: [],
  at: 0,
  turned: false,
  marked: [],
  started: null,
  sitting: false,
  touched: null,
  forming: null,

  setFold: (fold) =>
    set({ practices: fold.practices, words: fold.words, loaded: fold.loaded }),

  arrive: (outstanding) =>
    set((s) => (s.started === null ? { started: outstanding } : s)),

  begin: (queue, todo) =>
    set((s) => ({
      queue,
      at: 0,
      turned: false,
      sitting: true,
      // Never larger than what arriving already counted, or the mist would jump
      // backward the moment a session opened.
      started: s.started ?? Math.max(todo, queue.length),
    })),

  turnOver: () => set({ turned: true }),

  advance: () => set((s) => ({ at: Math.min(s.queue.length, s.at + 1), turned: false })),

  markDone: (id) =>
    set((s) => (s.marked.includes(id) ? s : { marked: [...s.marked, id] })),

  touch: (id) => set({ touched: id }),

  form: (next) => set({ forming: next }),

  leave: () => set({ sitting: false }),

  /*
    Walking back down the hill ends the visit.

    Without this, `started`, `at` and `marked` live for the whole time the tab
    is open — so coming back in the evening, after putting six new words in
    during the afternoon, would find the mist parked wherever the morning left
    it and no amount of work would move it. A visit is a visit.

    It cannot un-earn anything, and that is worth being clear about: the next
    arrival counts what is *outstanding*, so somebody who has finished the day
    walks straight back into a clear hill. What is thrown away is only the
    fraction, never the work.
  */
  leftTheHill: () =>
    set({ started: null, at: 0, marked: [], queue: [], turned: false, sitting: false, touched: null }),
}))

/**
 * Everything waiting for this person today.
 *
 * Words first, then the practices that are only ever "did you do it" — see the
 * two kinds in `data/types`. A `days` practice belonging to the other one is
 * not yours to mark, and a shared one is.
 */
export function todoFor(
  practices: Practice[],
  words: Word[],
  me: UserId,
  today: string,
  now: number,
): Todo {
  const mine = practices.filter((p) => !p.restingAt && (p.by === me || p.by === 'both'))
  const languages = new Set(mine.filter((p) => p.kind === 'words').map((p) => p.id))

  return {
    words: sessionFor(
      words.filter((w) => languages.has(w.practiceId)),
      me,
      now,
    ),
    marks: mine.filter((p) => p.kind === 'days' && !keptToday(p, today)),
  }
}

/**
 * How far the mist has pulled back, 0..1.
 *
 * ---------------------------------------------------------------------------
 * **Nothing to do means the hill is already clear**, and that is the nicest
 * rule in the section. Somebody who has kept everything today walks up to a
 * fold in full view with every animal on it — the work was already done, so
 * there is nothing to earn.
 *
 * It never falls back within a visit. Once you have seen the far side you have
 * seen it, and taking it away again because you stopped answering would be the
 * place tidying itself up behind you.
 * ---------------------------------------------------------------------------
 */
export function mistProgress(state: {
  started: number | null
  at: number
  marked: string[]
}): number {
  /*
    Not yet arrived. Thick, because the alternative — treating "we have not
    counted yet" as "there is nothing to do" — clears the hill for the first
    second of every visit and then rolls the fog back in on somebody who has
    work waiting. The place must never take something back.
  */
  if (state.started === null) return 0
  if (state.started <= 0) return 1
  const done = state.at + state.marked.length
  return Math.max(0, Math.min(1, done / state.started))
}
