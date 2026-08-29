/**
 * Whose day the world is having.
 *
 * ---------------------------------------------------------------------------
 * **The garden used to run on your own clock, and now it runs on hers.**
 *
 * The original rule was "you come here in your evening and it is evening here",
 * which is obvious and comfortable and does nothing at all — you already know
 * what time it is where you are, so the sky was telling you something you could
 * get by looking out of the window.
 *
 * Swapped, it does the one thing this whole world is for. It is nine at night
 * in Kano and four in the morning in Shanghai; you open the garden and it is
 * *four in the morning* — the light she is in, the wind she has, the hour her
 * meadow is under. And she opens it and gets your evening. Neither of you is
 * looking at your own weather. You are each standing in the other one's.
 *
 * Everything downstream of the hour follows for free, because everything in
 * this world already reads one number: the sky, the fog, the grass colour, the
 * wind, the ambient bed, the Hollow's fire, the Glasshouse's glass. Nothing
 * needed teaching.
 *
 * **The Stars stays consistent by construction.** Its far horizon has always
 * glowed with *the other one's* dawn — so when the sky flips to her hour, the
 * horizon flips to yours, and the place still says the true thing it always
 * said: when it is night here it is morning there. See `otherHour` below; the
 * section asks for "the one the sky is not running on" rather than naming a
 * person, which is what makes the swap invisible to it.
 * ---------------------------------------------------------------------------
 *
 * Per device and never synced. It is a way of looking, not a fact about the
 * world, and there is no version of this where one of you sets it for both.
 */

import { create } from 'zustand'
import type { Profile, UserId } from '@/data/types'
import { otherUser } from '@/data/types'
import { localHourIn } from './time'

/** Whose clock the sky runs on. */
export type Whose =
  /** Hers. The default, and the whole point — see above. */
  | 'theirs'
  /** Your own, which is what it used to be. */
  | 'mine'
  /**
   * This device's own clock, ignoring both profiles.
   *
   * For when a profile's timezone is wrong or has not been set yet, and for
   * checking that the garden looks right at the hour you are actually in.
   */
  | 'device'

const KEY = 'garden:whose-hour:v1'

function stored(): Whose {
  if (typeof localStorage === 'undefined') return 'theirs'
  const raw = localStorage.getItem(KEY)
  return raw === 'mine' || raw === 'device' ? raw : 'theirs'
}

interface WhoseState {
  whose: Whose
  set(whose: Whose): void
}

export const useWhoseHour = create<WhoseState>((set) => ({
  whose: stored(),
  set: (whose) => {
    try {
      localStorage.setItem(KEY, whose)
    } catch {
      /* a browser with storage blocked still works, it just forgets */
    }
    set({ whose })
  },
}))

/**
 * What each setting is called, where somebody has to choose between them.
 *
 * Run through `say` at the point it is read — from her side this is his hour.
 */
export const WHOSE_WORDS: Record<Whose, string> = {
  theirs: '{their} hour',
  mine: 'your hour',
  device: 'this device',
}

/**
 * The hour the world should be at, 0..24.
 *
 * `at` is passed in rather than read here so the caller controls how often the
 * clock is consulted — `localHourIn` goes through `Intl.DateTimeFormat`, which
 * is far too heavy for a value that changes once a minute.
 */
export function skyHour(
  profiles: Record<UserId, Profile>,
  me: UserId,
  whose: Whose,
  at: number,
): number {
  if (whose === 'device') {
    const d = new Date(at)
    return d.getHours() + d.getMinutes() / 60
  }
  const who = whose === 'mine' ? me : otherUser(me)
  return localHourIn(profiles[who].timeZone, at)
}

/**
 * The hour the sky is *not* running on — the one on the far horizon.
 *
 * The Stars asks for this rather than for "her hour", which is what keeps the
 * swap from ever contradicting itself: whichever clock the world is having,
 * the light on the other side of the plain belongs to the other one.
 *
 * With `device` there is no other person implied, so it falls back to hers —
 * that setting is a debugging view of the sky, not a third relationship.
 */
export function otherHour(
  profiles: Record<UserId, Profile>,
  me: UserId,
  whose: Whose,
  at: number,
): number {
  const who = whose === 'mine' ? otherUser(me) : me
  if (whose === 'device') return localHourIn(profiles[otherUser(me)].timeZone, at)
  return localHourIn(profiles[who].timeZone, at)
}
