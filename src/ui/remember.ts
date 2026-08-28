/**
 * A choice this device should still be making when you come back.
 *
 * ---------------------------------------------------------------------------
 * Written for the control room's tabs, and the reason is the drive loop rather
 * than tidiness. Tuning the car is: move a slider, press **drive it now**,
 * drive, come back, move it again — and "come back" is a *full page load*,
 * because the garden and the control room are different pages by design.
 *
 * Ordinary React state does not survive that. So tabs, added to make the page
 * navigable, would have quietly made the one loop the page exists for *worse*:
 * every single return would land you on the first tab, and you would re-find
 * your way to the same slider forty times an evening.
 *
 * Which is the general shape of it — a control that resets on every visit is
 * not a control, it is an obstacle — so this is not tab-specific.
 * ---------------------------------------------------------------------------
 *
 * Deliberately a string and not a generic. Everything that wants remembering
 * here is the name of something, storage holds strings anyway, and a
 * `JSON.parse` in this position is a way for one bad write to break a page.
 * The caller validates it back into whatever union it actually wanted, which
 * is the only place that check can be honest.
 */

import { useState } from 'react'

export function useRemembered(
  key: string,
  fallback: string,
): [string, (value: string) => void] {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return fallback
    try {
      return localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  })

  return [
    value,
    (next: string) => {
      try {
        localStorage.setItem(key, next)
      } catch {
        /* storage blocked; it still works, it just forgets */
      }
      setValue(next)
    },
  ]
}
