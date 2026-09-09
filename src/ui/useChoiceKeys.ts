import { useEffect, useRef } from 'react'
import { useArrival } from '@/systems/arrival'

// Directional navigation for the Hollow's open arrangements of choices.
// Real focus follows the light, so keyboard and assistive technology agree.
export function useChoiceKeys({
  screen,
  initial,
  onBack,
}: {
  screen: string
  initial: string
  onBack(): void
}) {
  const root = useRef<HTMLElement>(null)
  const back = useRef(onBack)
  useEffect(() => {
    back.current = onBack
  }, [onBack])

  useEffect(() => {
    const surface = root.current
    if (!surface) return
    let current: HTMLButtonElement | undefined
    let frame = 0
    const remembered = new Map<HTMLElement, HTMLButtonElement>()
    const available = (button: HTMLButtonElement) =>
      !button.disabled && button.getClientRects().length > 0
    const rows = () =>
      Array.from(surface.querySelectorAll<HTMLElement>('[data-choice-row]'))
        .map((row) => ({
          row,
          buttons: Array.from(row.querySelectorAll<HTMLButtonElement>('button')).filter(available),
        }))
        .filter(({ buttons }) => buttons.length)
    const mark = (button: HTMLButtonElement, focus = false) => {
      surface
        .querySelectorAll('[data-key-choice]')
        .forEach((node) => node.removeAttribute('data-key-choice'))
      current = button
      button.setAttribute('data-key-choice', '')
      const row = button.closest<HTMLElement>('[data-choice-row]')
      if (row) remembered.set(row, button)
      if (focus) {
        button.focus({ preventScroll: true })
        button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      }
    }
    const preferred = (group: ReturnType<typeof rows>[number]) => {
      const previous = remembered.get(group.row)
      return (
        group.buttons.find((button) => button === previous) ??
        group.buttons.find((button) => button.getAttribute('aria-pressed') === 'true') ??
        group.buttons[0]
      )
    }
    const starting = surface.querySelector<HTMLButtonElement>(initial)
    const first =
      starting && available(starting) ? starting : rows().flatMap((group) => group.buttons)[0]
    if (first) mark(first, !useArrival.getState().shut)

    const point = (event: Event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
      if (button && surface.contains(button) && available(button)) mark(button)
    }
    const key = (event: KeyboardEvent) => {
      if (useArrival.getState().shut || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return
      if (
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(
          event.key,
        )
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === 'Escape') {
        if (!event.repeat) back.current()
        return
      }
      const groups = rows()
      const buttons = groups.flatMap((group) => group.buttons)
      if (!buttons.length) return
      const focused = document.activeElement as HTMLButtonElement
      const active = buttons.includes(focused)
        ? focused
        : current && buttons.includes(current)
          ? current
          : first && buttons.includes(first)
            ? first
            : buttons[0]
      const at = groups.findIndex((group) => group.buttons.includes(active))
      const group = groups[at]
      const item = group.buttons.indexOf(active)
      const step =
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowUp' ||
        (event.key === 'Tab' && event.shiftKey)
          ? -1
          : 1
      if (event.key === 'Enter') {
        if (event.repeat) return
        active.click()
        const next = active.dataset.choiceNext
        if (next) {
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(() => {
            const destination = rows().find(({ row }) => row.dataset.choiceRow === next)
            if (destination) mark(preferred(destination), true)
          })
        }
        return
      }
      let next: HTMLButtonElement
      if (event.key === 'Tab') {
        next = buttons[(buttons.indexOf(active) + step + buttons.length) % buttons.length]
      } else {
        const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp'
        if (
          vertical &&
          groups.length > 1 &&
          (group.row.dataset.choiceAxis !== 'vertical' ||
            item + step < 0 ||
            item + step >= group.buttons.length)
        ) {
          next = preferred(groups[(at + step + groups.length) % groups.length])
        } else {
          next = group.buttons[(item + step + group.buttons.length) % group.buttons.length]
        }
      }
      mark(next, true)
      // Tracks and race modes preview immediately; Enter then advances a step.
      if (next.hasAttribute('data-choice-preview') && event.key !== 'Tab') next.click()
    }
    surface.addEventListener('focusin', point)
    surface.addEventListener('click', point)
    window.addEventListener('keydown', key, true)
    return () => {
      cancelAnimationFrame(frame)
      surface.removeEventListener('focusin', point)
      surface.removeEventListener('click', point)
      window.removeEventListener('keydown', key, true)
    }
  }, [screen, initial])
  return root
}
