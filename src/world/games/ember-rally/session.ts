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
  /**
   * Stopped, mid-road, with the world still on screen behind it.
   *
   * Escape used to fall through to the garden's own key handling and take you
   * all the way out to the meadow — abandoning the run, with no warning and no
   * way back to it. A race you cannot put down is a race you can only play
   * when nothing else is happening, which is not what this is for.
   *
   * Only the solo road can pause in any meaningful sense today, and that is
   * fine: there is no live opponent to keep waiting. Her ghost is a recording
   * and it stops when your clock does. When there is real-time racing this has
   * to become "pause is yours alone, and only when you are alone".
   */
  paused: boolean
  /** Where the pointer controls listen. Set by the DOM half when it mounts. */
  surface: HTMLElement | null
  /**
   * The ember bar's fill, handed over by the DOM half.
   *
   * Written to directly, once a frame, by the Stage — never through React. A
   * meter has to move at sixty frames a second, and React state at sixty
   * frames a second is visible stutter. This is the same reason the music
   * beam and the pointer's gaze are written straight to their nodes.
   */
  emberBar: HTMLElement | null
  /**
   * The speedometer: the number, and the line under it.
   *
   * Two nodes rather than one root to look inside, because this is written
   * every frame and a `querySelector` per frame is a tree walk per frame for
   * something whose answer never changes. Same reason as the ember bar: no
   * React anywhere near it.
   */
  speedo: { value: HTMLElement; line: HTMLElement } | null
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
  setEmberBar(el: HTMLElement | null): void
  setSpeedo(nodes: { value: HTMLElement; line: HTMLElement } | null): void
  pause(): void
  resume(): void
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
  paused: false,
  surface: null,
  emberBar: null,
  speedo: null,
  onFinish: null,

  open: ({ track, ghost, ghostName = '', onFinish }) =>
    set((s) => ({
      phase: 'ready',
      paused: false,
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
      paused: false,
      attempt: s.attempt + 1,
      track,
      replay,
      ghost: null,
      onFinish: null,
    })),

  setSurface: (surface) => set({ surface }),
  setEmberBar: (emberBar) => set({ emberBar }),
  setSpeedo: (speedo) => set({ speedo }),
  begin: () => set({ phase: 'running' }),
  pause: () => set({ paused: true }),
  resume: () => set({ paused: false }),
  finish: () => set({ phase: 'finished' }),

  /*
    Closing a road puts the *race* away. It does not touch the three nodes.

    ---------------------------------------------------------------------------
    **This used to clear them, and it killed the meters on every attempt after
    the first.**

    `surface`, `emberBar` and `speedo` are not race state. They are live DOM
    nodes, registered by the effects of the components that render them, and
    the rule those components follow is the ordinary React one: the effect that
    sets a thing is the cleanup that clears it. Clearing them from here broke
    that rule, and the way it broke was invisible.

    `Road` re-runs its effect whenever the attempt changes — that is how "run
    it again" restarts the road without rebuilding a kilometre of scenery — and
    the cleanup half of that re-run called this. `EmberBar` and `Speed` mount
    once with `[]` and do not remount, so nothing ever put their nodes back:
    the machine went on writing to `null` and the two meters froze at whatever
    they happened to be showing when the last go ended. Which reads as random —
    zero if you restarted from the line, fifty-four if you restarted from
    fifty-four — and only clears when you leave to the menu, because that
    unmounts the components and their effects run again.

    The steering kept working through all of it, and that asymmetry is the
    whole diagnosis: `Road`'s effect *re-sets* the surface a line later, so the
    one node that was put back was the one that never appeared broken.
    ---------------------------------------------------------------------------
  */
  close: () =>
    set({
      phase: 'off',
      paused: false,
      track: null,
      ghost: null,
      ghostName: '',
      replay: null,
      onFinish: null,
    }),
}))
