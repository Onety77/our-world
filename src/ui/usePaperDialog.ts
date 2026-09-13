import { useEffect, useRef } from 'react'

/** Keep keyboard focus on the paper and return it when the sheet is put away. */
export function usePaperDialog(active: boolean, close: () => void, initialFocus?: string) {
  const root = useRef<HTMLDivElement>(null)
  const dismiss = useRef(close)
  useEffect(() => { dismiss.current = close }, [close])
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement as HTMLElement | null
    const controls = () => Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
      .filter(node => node.getClientRects().length > 0)
    const frame = requestAnimationFrame(() => {
      const first = initialFocus ? root.current?.querySelector<HTMLElement>(initialFocus) : controls()[0]
      ;(first ?? root.current)?.focus({ preventScroll: true })
    })
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); dismiss.current()
      } else if (event.key === 'Tab') {
        const items = controls(), at = items.indexOf(document.activeElement as HTMLElement)
        event.preventDefault(); event.stopImmediatePropagation()
        if (items.length) {
          const next = at < 0 ? (event.shiftKey ? items.length - 1 : 0) : (at + (event.shiftKey ? -1 : 1) + items.length) % items.length
          items[next].focus()
        } else root.current?.focus()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', key, true)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [active, initialFocus])
  return root
}
