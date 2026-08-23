/**
 * The music, and whether the two of you are hearing the same thing.
 *
 * ---------------------------------------------------------------------------
 * **Position is never stored as a number that ticks.**
 *
 * What is shared is an *anchor*: the track was at `at` seconds when the server
 * clock read `since`. Where it is now is arithmetic. That single decision is
 * what makes real sync possible:
 *
 *   · One write when somebody presses something, instead of a write a second,
 *     forever, from both devices.
 *   · Two phones agree from one fact, so they cannot drift apart between
 *     updates the way two independently-ticking counters would.
 *   · A device that was asleep, backgrounded or on a train with no signal
 *     catches up *correctly* the instant it wakes, rather than resuming
 *     wherever it left off.
 *
 * `since` comes from `DataLayer.now()` — the server clock, corrected for this
 * device's drift — and never from `Date.now()`. Two people seven timezones
 * apart routinely have phones a few seconds out from each other, and a few
 * seconds is plainly audible.
 *
 * ---------------------------------------------------------------------------
 * **Together, or on your own.**
 *
 * You are in step only while you are both actually here. That is the whole
 * rule, and it is read from presence, which the garden already keeps.
 *
 *   · **Together** — every control writes to the shared anchor and both of you
 *     follow it. Pausing pauses hers. Changing the track changes hers.
 *   · **Alone** — the same controls move a local anchor and touch nothing
 *     shared, so you can play your own thing at four in the morning without
 *     reaching into her evening.
 *
 * When she arrives and you are already playing something, the shared anchor is
 * adopted — being together *means* hearing the same thing, and a "together"
 * that quietly kept you on separate songs would be a label that lies. The
 * player says which of the two it is at all times, because a control that
 * silently reaches another person's device is not something to be coy about.
 */

import { create } from 'zustand'
import type { Listening, Track } from '@/data/types'

/** A silent, stopped anchor. */
export function quiet(): Listening {
  return { trackId: null, playing: false, at: 0, since: 0, by: 'warm' }
}

interface ListeningState {
  tracks: Track[]
  /** What the two of you share. Only obeyed while you are both here. */
  shared: Listening
  /** Your own, for when you are not. */
  mine: Listening
  /** True while she is here too. */
  together: boolean
  /** The player is open rather than folded away. */
  open: boolean

  setTracks(tracks: Track[]): void
  setShared(shared: Listening): void
  setMine(mine: Listening): void
  setTogether(together: boolean): void
  toggleOpen(): void
  close(): void
}

export const useListening = create<ListeningState>((set) => ({
  tracks: [],
  shared: quiet(),
  mine: quiet(),
  together: false,
  open: false,

  setTracks: (tracks) => set({ tracks }),
  setShared: (shared) => set({ shared }),
  setMine: (mine) => set({ mine }),
  setTogether: (together) => set({ together }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}))

/** Whichever anchor is in charge right now. */
export function current(s: ListeningState): Listening {
  return s.together ? s.shared : s.mine
}

/**
 * Where the track actually is, in seconds.
 *
 * `now` must be the *server* clock. Clamped at zero because a device whose
 * correction has not landed yet can briefly compute a position before the
 * anchor was set, and a negative seek throws in some browsers.
 */
export function positionOf(anchor: Listening, now: number): number {
  if (!anchor.playing) return Math.max(0, anchor.at)
  return Math.max(0, anchor.at + (now - anchor.since) / 1000)
}

/**
 * How far a track has got, 0..1, or null when the length is unknown.
 *
 * Null rather than a guess. A progress line that fills at an invented rate is
 * worse than no progress line — see `duration` in the Track type.
 */
export function progressOf(
  anchor: Listening,
  track: Track | undefined,
  now: number,
): number | null {
  if (!track || track.duration <= 0) return null
  return Math.max(0, Math.min(1, positionOf(anchor, now) / track.duration))
}

/** mm:ss, or an em dash when there is nothing honest to say. */
export function clock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const whole = Math.max(0, Math.floor(seconds))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** The track after this one, wrapping. Null when there is nothing to play. */
export function step(tracks: Track[], id: string | null, by: 1 | -1): string | null {
  if (tracks.length === 0) return null
  const at = tracks.findIndex((t) => t.id === id)
  if (at === -1) return tracks[0].id
  const next = (at + by + tracks.length) % tracks.length
  return tracks[next].id
}
