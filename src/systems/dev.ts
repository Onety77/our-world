/**
 * The way in to the control room, and the settings it sets.
 *
 * ---------------------------------------------------------------------------
 * **There is no interface in this world, and that now includes the dev panel.**
 *
 * It used to sit permanently in the top-left corner of every screen — a small
 * grey disclosure marked `dev`, over the meadow, over the cave, over the first
 * thing she will ever open. It was genuinely useful and it was the single most
 * out-of-place object in the garden, and "she can just ignore it" is not a
 * thing you get to say about a gift.
 *
 * So it is a *place you go*: `/dev7731`, which nothing links to and nothing
 * hints at. The garden does not render there at all. It is not a secret in the
 * security sense — the path is in the bundle, and anybody who could read the
 * bundle is already signed in as one of the two of you — it is a secret in the
 * sense that it is not lying around.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'

/** The one path. Changing it changes the address; nothing else refers to it. */
const DOOR = '/dev7731'

/**
 * Whether the control room is what should be on screen.
 *
 * Both a path and a query, deliberately. The path is the real address and is
 * what works once Firebase Hosting is rewriting every URL to `index.html`
 * (see `STEPS.md` 5.2). The query is the fallback for any host where that
 * rewrite has not been set up yet, so a missed hosting step cannot lock you
 * out of your own controls.
 */
export function atTheDoor(): boolean {
  if (typeof location === 'undefined') return false
  const path = location.pathname.replace(/\/+$/, '')
  return path === DOOR || new URLSearchParams(location.search).has('dev7731')
}

/** Leave the control room and go back into the world, keeping what was set. */
export function backToTheGarden(): void {
  if (typeof location === 'undefined') return
  location.href = '/'
}

// ---------------------------------------------------------------------------
// What the control room sets
// ---------------------------------------------------------------------------

const HOUR_KEY = 'garden:hour-override:v1'

function storedHour(): number | null {
  if (typeof window === 'undefined') return null
  // The URL still wins, so `?hour=18.6` in a screenshot script is unaffected by
  // whatever was last left set in here.
  const asked = new URLSearchParams(location.search).get('hour')
  if (asked !== null) {
    const value = Number(asked)
    if (Number.isFinite(value)) return ((value % 24) + 24) % 24
  }
  try {
    const raw = localStorage.getItem(HOUR_KEY)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

interface HourState {
  /** Null means live — whichever clock `systems/whoseHour` says. */
  override: number | null
  set(hour: number | null): void
}

/**
 * A pinned hour, if there is one.
 *
 * Kept here rather than as React state in `Garden`, because the control room
 * is a different page: state would be gone the moment you walked back into the
 * world to look at what you had set, which is the only reason to set it.
 */
export const useHourOverride = create<HourState>((set) => ({
  override: storedHour(),
  set: (override) => {
    try {
      if (override === null) localStorage.removeItem(HOUR_KEY)
      else localStorage.setItem(HOUR_KEY, String(override))
    } catch {
      /* storage blocked; it still works, it just forgets */
    }
    set({ override })
  },
}))
