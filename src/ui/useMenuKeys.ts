/**
 * Arrows to choose, Enter to take it.
 *
 * ---------------------------------------------------------------------------
 * Every row of choices in this garden obeys the same contract, and it has to be
 * one piece of code or it will not — this lived inside the racer, which is why
 * the word game's screens quietly did not have it and nobody noticed until the
 * end of a race had a choice on it that a keyboard could not reach.
 *
 * **It moves real focus, and that is the important part.** The first version
 * kept its own idea of which item was selected and listened for Enter on the
 * window, which meant two selections existed at once: the one the highlight was
 * drawn from, and the browser's, which was wherever you had last clicked. Enter
 * then had to guess between them — it bailed out entirely whenever a button
 * happened to be focused, so pressing Enter after clicking anything did nothing
 * at all.
 *
 * Moving focus collapses the two into one. The browser activates the focused
 * button on Enter and Space by itself, so there is no Enter handler here to
 * disagree with it, and a screen reader is told which choice is current without
 * anything extra being said.
 *
 * Focus is only taken once the arrows have actually been used. Grabbing it on
 * mount would scroll the page to the buttons and, on a phone, is how a screen
 * ends up with a keyboard open over the thing you were reading.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface MenuKeys {
  /** Which choice is current. */
  selected: number
  /** Point at it directly — from `onFocus`, or a pointer landing on one. */
  choose(index: number): void
  /** Put on each choice, in order, so the arrows have something to focus. */
  ref(index: number): (node: HTMLElement | null) => void
}

export function useMenuKeys(count: number, loop = true): MenuKeys {
  const [selected, setSelected] = useState(0)
  const items = useRef<(HTMLElement | null)[]>([])
  /** Whether the arrows have been used, and focus is therefore ours to move. */
  const driving = useRef(false)

  // A row that gets shorter must not leave the selection past the end of it.
  useEffect(() => {
    setSelected((at) => Math.max(0, Math.min(count - 1, at)))
  }, [count])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const focused = document.activeElement
      // Somebody typing is not choosing.
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return
      const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      if (!forward && !back) return
      if (count === 0) return
      event.preventDefault()
      driving.current = true
      setSelected((at) => {
        const next = at + (forward ? 1 : -1)
        return loop ? (next + count) % count : Math.max(0, Math.min(count - 1, next))
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, loop])

  useEffect(() => {
    if (!driving.current) return
    // `preventScroll`, because the choices are usually already on screen and
    // the browser's idea of scrolling them into view fights the layout.
    items.current[selected]?.focus({ preventScroll: true })
  }, [selected])

  const ref = useCallback(
    (index: number) => (node: HTMLElement | null) => {
      items.current[index] = node
    },
    [],
  )

  return { selected, choose: setSelected, ref }
}
