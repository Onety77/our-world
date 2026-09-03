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
 * hints at. The garden does not render there at all.
 *
 * **And the path is now only half of it.** Hiddenness was the whole lock for a
 * while, on the reasoning that the address is in the bundle anyway and anybody
 * who can read the bundle is already signed in as one of the two of you. True,
 * and beside the point: the two of you are not the same person here. This is
 * the room where the car is retuned under her mid-corner, where a road comes
 * off the wall, where the sky gets pinned to an hour she is not living in. It
 * is Warm's room. So `mayOpenTheDoor` asks who is signed in, and Cool arriving
 * at the address gets the garden — not a refusal, not a bounce, just the
 * ordinary world, exactly as if she had typed any other path that isn't a
 * thing. A locked door tells you there is something behind it.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'
import { DATA_BACKEND } from '@/config'
import type { UserId } from '@/data/types'

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

/**
 * Whether this person may open it at all.
 *
 * On the real backend the answer comes from the address you signed in with:
 * `RealProvider` derives `me` from the email on the account and never
 * consults anything the browser can be told to say, so there is nothing here
 * to talk your way past by editing storage.
 *
 * On the local mock it is deliberately wide open, and that is not laziness.
 * There, `me` *is* a localStorage key with a dropdown pointed at it, so
 * gating on it would stop nobody who can open devtools — and it would strand
 * you, because "look at it as Cool" is a control **inside this room**. The
 * first time you used it you would be locked out of the only page carrying the
 * switch back, on a build with no real sign-in to fix it with.
 */
export function mayOpenTheDoor(me: UserId): boolean {
  if (DATA_BACKEND === 'local') return true
  return me === 'warm'
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
