/**
 * The music and the conversation, out of the way.
 *
 * ---------------------------------------------------------------------------
 * Those two share the bottom-right corner because every other corner of this
 * world is spoken for, and that is fine everywhere except one place: a phone
 * turned sideways, in front of a game's menu.
 *
 * A game menu is centred and wide, a phone in landscape is short, and the
 * corner is fixed to the bottom right — so the song title and the last thing
 * she said land directly on top of "start the engine". Nothing is broken and
 * everything is unreadable.
 *
 * The obvious fix is to hide them, and it is wrong: the music is *shared*, and
 * a control that vanishes when the screen gets small is a control somebody
 * will look for and conclude is gone. So it tucks instead, and leaves a handle
 * behind — the same gesture a phone uses for everything else that slides.
 *
 * **It tucks itself the first time it would be in the way**, and after that it
 * remembers what you chose for as long as the game is open. Automatic once is
 * helpful; automatic every time is a control fighting you.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'

interface CornerState {
  /** Slid off to the right, with only the handle showing. */
  tucked: boolean
  /**
   * True once something has tucked it on its own for this takeover, so it does
   * not keep doing it after you have pulled it back out.
   */
  decided: boolean
  /**
   * How far down the screen the handle sits, 0..1, or null for its usual place.
   *
   * Set by whatever put the panel away, so a shove near the top leaves the
   * handle near the top. See the note in the store.
   */
  at: number | null
  putAt(at: number | null): void
  toggle(): void
  /** Tuck it, but only if nobody has expressed an opinion yet. */
  tuckOnce(): void
  /** A new screen: whatever was decided about the last one no longer applies. */
  forget(): void
}

export const useCorner = create<CornerState>((set, get) => ({
  tucked: false,
  decided: false,
  /*
    Where the handle sits, as a fraction down the screen.

    It used to be pinned to the bottom right, which is where the corner lives —
    and that is not where the gesture happened. Shove the panel away with a
    thumb near the top of the screen and the thing it turns into appeared six
    inches lower, which reads as the panel not having gone anywhere and a
    different mark arriving somewhere else. A handle is a thing you put down;
    it should be where you put it.

    Null until something has been put down, and back to null when the panel is
    pulled out again — the next tuck decides afresh rather than inheriting a
    position from an hour ago.
  */
  at: null,
  putAt: (at) => set({ at }),
  toggle: () => set({ tucked: !get().tucked, decided: true }),
  tuckOnce: () => {
    if (get().decided) return
    set({ tucked: true, decided: true })
  },
  forget: () => set({ tucked: false, decided: false, at: null }),
}))

/**
 * Can this device put the corner away by hand?
 *
 * A finger, and nothing else. Where `cornerIsInTheWay` asks whether the corner
 * is *currently* a problem — and only tucks it for you when it is — this asks
 * whether the person holding the phone should be *allowed* to decide, which
 * they always should. The handle was gated on the same three conditions as the
 * automatic tuck, so on a phone held upright, in the Hollow, with a list of
 * songs over the middle of the screen, there was no way to move it: the one
 * situation the whole thing was built for.
 *
 * Still not on a laptop. There is room there, and a pointer that can go round.
 */
export function cornerCanBeTucked(): boolean {
  if (typeof matchMedia === 'undefined') return false
  return matchMedia('(pointer: coarse)').matches
}

/**
 * Is the corner in the way right now?
 *
 * Three things at once, and it needs all three. A finger, because this is
 * about thumbs and small screens. Sideways, because that is the shape that
 * puts a centred menu underneath a bottom-right corner. And something owning
 * the screen, because in the open garden the corner is not on top of anything
 * and tucking it there would be hiding a control for no reason.
 */
export function cornerIsInTheWay(takenOver: boolean): boolean {
  if (typeof matchMedia === 'undefined') return false
  return (
    takenOver &&
    matchMedia('(pointer: coarse)').matches &&
    matchMedia('(orientation: landscape)').matches
  )
}
