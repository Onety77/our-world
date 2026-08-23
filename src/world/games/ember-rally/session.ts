/**
 * The one fact the DOM half and the 3D half of the race share.
 *
 * Ember Rally is split in two on purpose. The briefing, the sealed line, the
 * result and the words all live in the DOM over the world, like every other
 * game in the Hollow. But the race itself is *the world* — it takes the
 * garden's own Canvas, its own renderer and its own tone-mapping, because a
 * second canvas would mean a second WebGL context (which phones ration) and a
 * second idea of what "lit" means (which is the thing that made the last
 * version look like it came from a different program).
 *
 * So: this store says a road is open, and `World` mounts the Stage. Nothing
 * per-frame goes through it — see the note on the technical law in PLAN.md.
 * React state at sixty frames a second is visible stutter, so the race writes
 * to its own refs and only touches this at the four moments that matter.
 */

import { create } from 'zustand'
import type { RallyRun } from './model'
import type { Track } from './track'

export type RacePhase = 'off' | 'ready' | 'running' | 'finished' | 'replay'

export interface RaceSession {
  phase: RacePhase
  /**
   * Which go this is. Counts up every time a road is opened.
   *
   * The Stage deliberately does *not* remount between attempts — rebuilding a
   * kilometre and a half of tunnel takes a fifth of a second, and "run it
   * again" should be instant. So it stays mounted and watches this number
   * instead: when it changes, the car, the recorder, the clock and the dust
   * are all put back to the start. Without it, pressing "run it again" left
   * the previous, already-finished car sitting on the finish line.
   */
  attempt: number
  track: Track | null
  /** Whose line to run against, if anyone's. */
  ghost: RallyRun | null
  ghostName: string
  /** Both runs, for the two-car replay. */
  replay: { mine: RallyRun; theirs: RallyRun } | null
  /** Where the pointer controls listen. Set by the DOM half when it mounts. */
  surface: HTMLElement | null
  /** Called once, with the run, when the car reaches the far fire. */
  onFinish: ((run: RallyRun) => void) | null

  open(input: {
    track: Track
    ghost: RallyRun | null
    ghostName?: string
    onFinish(run: RallyRun): void
  }): void
  watch(input: { track: Track; replay: { mine: RallyRun; theirs: RallyRun } }): void
  setSurface(el: HTMLElement | null): void
  begin(): void
  finish(): void
  close(): void
}

export const useRace = create<RaceSession>((set) => ({
  phase: 'off',
  attempt: 0,
  track: null,
  ghost: null,
  ghostName: '',
  replay: null,
  surface: null,
  onFinish: null,

  open: ({ track, ghost, ghostName = '', onFinish }) =>
    set((s) => ({
      phase: 'ready',
      attempt: s.attempt + 1,
      track,
      ghost,
      ghostName,
      replay: null,
      onFinish,
    })),

  watch: ({ track, replay }) =>
    set((s) => ({
      phase: 'replay',
      attempt: s.attempt + 1,
      track,
      replay,
      ghost: null,
      onFinish: null,
    })),

  setSurface: (surface) => set({ surface }),
  begin: () => set({ phase: 'running' }),
  finish: () => set({ phase: 'finished' }),

  close: () =>
    set({
      phase: 'off',
      track: null,
      ghost: null,
      ghostName: '',
      replay: null,
      onFinish: null,
      surface: null,
    }),
}))
