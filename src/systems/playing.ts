/**
 * Which game is open, if any.
 *
 * Its own store, like the pot and the profile sheet. Opening a game is a
 * different act from reading a letter and from putting money by, and one
 * shared "something is open" flag is how three unrelated things end up
 * entangled.
 */

import { create } from 'zustand'

interface PlayingState {
  /** The id of the game being played, or null. */
  gameId: string | null
  /**
   * Playing on your own rather than against her.
   *
   * Seven timezones apart, most evenings only one of you is here — and a game
   * you can only start when she is available is a game you mostly cannot
   * start. Solo is not a lesser mode; it is the one that will get used on a
   * Tuesday.
   *
   * A solo round is a *separate round* with its own id, never a shared one
   * played alone. Sharing them would leave half-finished rounds in her Hollow
   * that she never agreed to play.
   */
  solo: boolean
  /**
   * A live round the two of you are in at the same time, by key.
   *
   * Null for everything asynchronous, which is nearly everything. When it is
   * set, this *is* the round key — not the date — and the game is told it is
   * playing a `race` so it can put a clock on the wall. How the two of you
   * come to be holding the same key is `Presence.racing`; see the note there.
   */
  race: string | null
  open(gameId: string, solo?: boolean): void
  /** Open a live round. Both of you must call this with the same key. */
  openRace(gameId: string, race: string): void
  close(): void
}

export const usePlaying = create<PlayingState>((set) => ({
  gameId: null,
  solo: false,
  race: null,
  open: (gameId, solo = false) => set({ gameId, solo, race: null }),
  openRace: (gameId, race) => set({ gameId, solo: false, race }),
  close: () => set({ gameId: null, solo: false, race: null }),
}))
