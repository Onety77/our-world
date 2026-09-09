import { useEffect, useRef } from 'react'
import { useArrival } from '@/systems/arrival'

export function useClearingKeys(active: boolean, screen: string, onBack: () => void) {
  const root = useRef<HTMLElement>(null),
    back = useRef(onBack)
  useEffect(() => {
    back.current = onBack
  }, [onBack])
  useEffect(() => {
    const node = root.current
    if (!active || !node) return
    const choices = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,a[href]'),
      ).filter((el) => el.getClientRects().length > 0)
    const focus = (el?: HTMLElement) => {
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest' })
    }
    const initial = () =>
      node.querySelector<HTMLElement>('[data-autofocus]') ??
      choices().find((el) => !el.hasAttribute('data-back'))
    if (!useArrival.getState().shut) focus(initial())
    const key = (event: KeyboardEvent) => {
      if (useArrival.getState().shut || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!event.repeat) back.current()
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter'].includes(event.key))
        return
      const target = event.target as HTMLElement,
        fields = choices(),
        current = fields.indexOf(document.activeElement as HTMLElement)
      if (target.matches('input,textarea') && event.key !== 'Tab') {
        if (event.key === 'Enter' && target.matches('input') && !event.isComposing) {
          event.preventDefault()
          event.stopImmediatePropagation()
          if (!event.repeat) target.closest('form')?.requestSubmit()
        } else event.stopPropagation()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!event.repeat) {
          if (target.matches('button,a')) target.click()
          else focus(initial())
        }
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      const direction =
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowUp' ||
        (event.key === 'Tab' && event.shiftKey)
          ? -1
          : 1
      focus(fields[(current + direction + fields.length) % fields.length])
    }
    // Feedback replaces controls during a lesson. Restore focus only when the
    // previous control disappeared, never while someone is typing an answer.
    const observe = new MutationObserver(() => {
      if (document.activeElement === document.body && !useArrival.getState().shut) focus(initial())
    })
    observe.observe(node, { childList: true, subtree: true })
    window.addEventListener('keydown', key, true)
    return () => {
      observe.disconnect()
      window.removeEventListener('keydown', key, true)
    }
  }, [active, screen])
  return root
}
