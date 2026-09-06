/**
 * The one mark the garden is allowed to leave outside itself.
 *
 * ---------------------------------------------------------------------------
 * Everything else in this world says what is waiting *from inside* — the mark
 * in the corner, the light on the thing she left, the fire throwing a few more
 * embers. All of it requires the garden to be open, which is the one state it
 * usually is not: two people seven timezones apart mostly leave things for
 * each other to find later.
 *
 * A notification is the loud answer to that and it already exists. This is the
 * quiet one: the number on the home-screen icon, which says *there is
 * something* without making a sound, without a lock screen preview, and
 * without asking for anything. It is the right weight for a world where almost
 * everything arrives while the other one is asleep.
 *
 * **It only works on an installed garden.** A page in a browser tab has no
 * icon to write on, and the API is simply absent there. So this is one of the
 * few things that genuinely rewards adding the world to the home screen, and
 * it is invisible until somebody does — which is the correct order: nothing
 * anywhere says "install for badges".
 *
 * **The count is unread messages and nothing else.** Not games waiting, not
 * thoughts, not memories. A badge is read as *how many things are addressed to
 * me*, and a number that silently pools four unrelated kinds is a number you
 * stop trusting the first time you open the world and cannot find four of
 * anything. The other kinds already have their own honest marks inside.
 * ---------------------------------------------------------------------------
 */

import { useEffect } from 'react'

type Badging = {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

function badging(): Badging | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as Navigator & Badging
  return typeof nav.setAppBadge === 'function' ? nav : null
}

/**
 * Put `count` on the icon, or take it off at zero.
 *
 * Every failure is swallowed. The documented one is a browser that has the
 * methods but refuses while the garden is not installed, and it rejects rather
 * than throwing, which is why this is `void`-and-catch rather than awaited
 * anywhere.
 */
export function mark(count: number): void {
  const api = badging()
  if (!api) return
  try {
    if (count > 0) void api.setAppBadge?.(count).catch(() => {})
    else void api.clearAppBadge?.().catch(() => {})
  } catch {
    /* No icon to write on. */
  }
}

/**
 * Keep the icon showing `count`.
 *
 * Called from `ui/Whisper`, which is mounted in every corner of the world and
 * already computes the number — so the badge follows the same fact the fold in
 * the corner does, and the two can never disagree.
 *
 * **Cleared on the way out**, so closing the garden with everything read does
 * not leave a number sitting on a home screen until the next visit.
 */
export function useBadge(count: number): void {
  useEffect(() => {
    mark(count)
  }, [count])

  useEffect(() => () => mark(0), [])
}
