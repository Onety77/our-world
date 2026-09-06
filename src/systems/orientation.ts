/**
 * Holding the phone still while you are driving it.
 *
 * ---------------------------------------------------------------------------
 * A phone rotates when it is tilted, and steering a car by tilting is exactly
 * how Ember Rally is held. So the screen turns over in the middle of a corner,
 * the canvas re-lays out, the road jumps, and the run is gone — for a reason
 * that has nothing to do with the driving.
 *
 * **It locks whichever way you are already holding it, and this is the
 * decision in the file.** The obvious move is to force landscape, the way a
 * racing game on a console would, and it is wrong here: this world is built
 * portrait-first and verified at 390×844, the tunnel is composed for a tall
 * frame, and `styles.css` has real landscape rules rather than a fallback. A
 * race that seizes the phone and turns it sideways would be overriding a
 * design decision rather than protecting one. What is actually wrong is the
 * screen turning over *while you are using it*, and that is what this stops.
 *
 * **It works on an installed garden and quietly does nothing in a browser
 * tab.** Locking the orientation needs either fullscreen or an installed app,
 * which is the shape both of these phones are in — the world is on their home
 * screens. In a tab the call is refused, nothing is said, and the phone
 * behaves exactly as it did before.
 * ---------------------------------------------------------------------------
 */

import { useEffect } from 'react'

/*
  `ScreenOrientation.lock` is not in every version of the DOM library, and
  `unlock` is not always beside it. Narrowed here once rather than cast at the
  call site.
*/
type Lockable = ScreenOrientation & {
  lock?: (kind: OrientationLockType) => Promise<void>
  unlock?: () => void
}

function screenOrientation(): Lockable | null {
  if (typeof screen === 'undefined') return null
  const held = (screen as Screen & { orientation?: Lockable }).orientation
  return held && typeof held.lock === 'function' ? held : null
}

/**
 * Stop the screen turning over for as long as `active` is true.
 *
 * The lock is taken at the orientation the phone is in when the race starts,
 * which means turning the phone deliberately *before* a run still works and
 * turning it accidentally *during* one no longer does.
 */
export function useHoldOrientation(active: boolean): void {
  useEffect(() => {
    const orientation = screenOrientation()
    if (!active || !orientation) return

    let dropped = false

    /*
      `type` is the fine-grained one — `portrait-primary`, `landscape-secondary`
      — and locking to it rather than to `portrait` or `landscape` is what
      keeps a phone held upside down from being flipped the right way up as the
      lights go out.
    */
    void orientation
      .lock?.(orientation.type as OrientationLockType)
      .catch(() => {
        /*
          Refused: a browser tab rather than an installed garden, a desktop, a
          platform that does not do this. There is nothing to tell anybody —
          the screen keeps behaving the way it always has.
        */
      })

    return () => {
      if (dropped) return
      dropped = true
      try {
        orientation.unlock?.()
      } catch {
        /* Never locked in the first place. */
      }
    }
  }, [active])
}
