/**
 * Arrows to choose, Enter to take it.
 *
 * ---------------------------------------------------------------------------
 * Every row of choices in this garden obeys the same contract, and it has to be
 * one piece of code or it will not — this lived inside the racer, which is why
 * the word game's screens quietly did not have it and nobody noticed until the
 * end of a race had a choice on it that a keyboard could not reach.
 *
 * Arrow selection is deliberately not browser focus. Forcing focus onto each
 * choice made the browser draw circles and rectangles around controls whose
 * own warm light already says what is selected. It could also leave focus on
 * an old choice while the visual selection had moved elsewhere.
 *
 * Arrows now move one garden selection and Enter activates exactly that item.
 * Tab remains ordinary browser focus, and Enter on a Tab-focused control stays
 * native. There is one cursor, without making focus chrome part of the art.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface MenuKeys {
  /** Which choice is current. */
  selected: number
  /** Point at it directly — from `onFocus`, or a pointer landing on one. */
  choose(index: number): void
  /** Put on each choice, in order, so Enter knows what to activate. */
  ref(index: number): (node: HTMLElement | null) => void
}

type MenuAxis = 'both' | 'horizontal' | 'vertical'

export function useMenuKeys(
  count: number,
  loop = true,
  active = true,
  axis: MenuAxis = 'both',
): MenuKeys {
  const [selected, setSelected] = useState(0)
  const items = useRef<(HTMLElement | null)[]>([])
  const assigners = useRef<Array<(node: HTMLElement | null) => void>>([])

  // A row that gets shorter must not leave the selection past the end of it.
  useEffect(() => {
    setSelected((at) => Math.max(0, Math.min(count - 1, at)))
  }, [count])

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      const focused = document.activeElement
      // Somebody typing is not choosing.
      if (
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement ||
        focused instanceof HTMLSelectElement ||
        (focused instanceof HTMLElement && focused.isContentEditable)
      ) return
      const horizontal = axis === 'both' || axis === 'horizontal'
      const vertical = axis === 'both' || axis === 'vertical'
      const forward = (horizontal && event.key === 'ArrowRight') ||
        (vertical && event.key === 'ArrowDown')
      const back = (horizontal && event.key === 'ArrowLeft') ||
        (vertical && event.key === 'ArrowUp')
      if ((forward || back) && count > 1) {
        event.preventDefault()
        // Arrow selection belongs to the garden, not the browser's focus
        // ring. Release stale click/Tab focus without moving it to a new item.
        if (focused instanceof HTMLElement) focused.blur()
        setSelected((at) => {
          const direction = forward ? 1 : -1
          for (let step = 1; step <= count; step++) {
            const raw = at + direction * step
            if (!loop && (raw < 0 || raw >= count)) return at
            const next = (raw + count) % count
            const item = items.current[next]
            if (!(item instanceof HTMLButtonElement) || !item.disabled) return next
          }
          return at
        })
        return
      }
      if (event.key !== 'Enter' || event.repeat || count === 0) return
      // Native Tab + Enter is already correct. So is Enter on an unrelated
      // button such as "back". With no real focus, activate the warm choice.
      if (items.current.includes(focused as HTMLElement | null)) return
      if (focused instanceof HTMLButtonElement || focused instanceof HTMLAnchorElement) return
      event.preventDefault()
      items.current[selected]?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, axis, count, loop, selected])

  const ref = useCallback(
    (index: number) => {
      assigners.current[index] ??= (node: HTMLElement | null) => {
        items.current[index] = node
      }
      return assigners.current[index]
    },
    [],
  )

  return { selected, choose: setSelected, ref }
}
