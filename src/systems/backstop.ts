/**
 * The phone's back button, which until now did nothing at all.
 *
 * ---------------------------------------------------------------------------
 * **The garden has no URLs, and that is a decision, not an oversight.** You do
 * not navigate to the Hollow; you walk to it, and the address bar stays where
 * it was. That is right for a world, and it left one thing broken that nobody
 * on a keyboard would ever notice.
 *
 * Escape closes things. A game, a letter, a photograph, the pause screen —
 * every one of them listens for Escape and nothing else. **A phone has no
 * Escape key.** So the way out of a game on a phone was whatever button
 * happened to be drawn on that particular screen, and on the screens that
 * forgot to draw one there was no way out at all: not the on-screen control,
 * because there wasn't one, and not the system back button, because a
 * single-page app that never touches history has nothing for it to go back to.
 * Pressing it leaves the garden entirely.
 *
 * So: anything that takes over the screen puts one entry on the history stack
 * while it is open, and takes it off again when it closes. The back gesture
 * then means "close this", which is what it means everywhere else on a phone,
 * and it never leaves the garden until there is nothing left to close.
 *
 * **A stack, because these nest.** A game opens over the garden and a paused
 * screen opens over the game. Back should close the innermost thing, once, and
 * leave the rest alone.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef } from 'react'

/** Innermost last. Only the last one hears a back gesture. */
const stack: { id: number; close: () => void }[] = []
let nextId = 1
/**
 * True while we are the ones calling `history.back()` to tidy up.
 *
 * Closing something from a button inside the app has to consume the history
 * entry too, or the back gesture afterwards is a no-op that eats one press.
 * Consuming it means calling `history.back()`, which fires `popstate` again —
 * and without this flag that second event would close whatever is *underneath*
 * as well, so one tap on a button would close two screens.
 */
let tidying = false

function onPop() {
  if (tidying) {
    tidying = false
    return
  }
  const top = stack.pop()
  if (!top) return
  top.close()
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onPop)
}

/**
 * While `open` is true, the back gesture calls `close` instead of leaving.
 *
 * `close` is held in a ref rather than being a dependency, so a handler that
 * is rebuilt every render — which is nearly all of them — does not push and
 * pop a history entry on every frame.
 */
export function useBackCloses(open: boolean, close: () => void): void {
  const latest = useRef(close)
  latest.current = close

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const id = nextId++
    let closed = false
    const entry = {
      id,
      close: () => {
        closed = true
        latest.current()
      },
    }
    stack.push(entry)
    window.history.pushState({ backstop: id }, '')

    return () => {
      const at = stack.findIndex((item) => item.id === id)
      if (at >= 0) stack.splice(at, 1)
      /*
        Closed from inside the app rather than by a back gesture, so our
        history entry is still sitting there and has to be taken off. If the
        back gesture is what closed us, it has already been consumed and
        calling `back` again would step past something else.
      */
      if (!closed) {
        tidying = true
        window.history.back()
        // If the browser declines to move — no entry, a blocked history — the
        // flag would stay set and swallow the *next* real back gesture.
        window.setTimeout(() => {
          tidying = false
        }, 400)
      }
    }
  }, [open])
}
