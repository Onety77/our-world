/**
 * A horizontal choice row that answers a thumb as well as two arrow buttons.
 *
 * It waits until the gesture has a clear horizontal axis, keeps vertical page
 * movement native, and swallows the click produced after a real swipe so a
 * road card is never both changed and entered by the same finger.
 */

import { useEffect, type RefObject } from 'react'

const DECIDE = 9
const TRAVEL = 42
const FLICK = 24
const QUICK_MS = 360

export function useChoiceSwipe(
  ref: RefObject<HTMLElement | null>,
  step: (direction: -1 | 1) => void,
  enabled = true,
) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    let pointer: number | null = null
    let fromX = 0
    let fromY = 0
    let started = 0
    let horizontal: boolean | null = null
    let swallowTimer: number | null = null

    const down = (event: PointerEvent) => {
      if (pointer !== null) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, a')) return
      pointer = event.pointerId
      fromX = event.clientX
      fromY = event.clientY
      started = performance.now()
      horizontal = null
    }

    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      const dx = event.clientX - fromX
      const dy = event.clientY - fromY
      if (horizontal === null && Math.abs(dx) + Math.abs(dy) >= DECIDE) {
        horizontal = Math.abs(dx) > Math.abs(dy)
        if (horizontal) el.setPointerCapture?.(event.pointerId)
      }
    }

    const swallow = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
    }

    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      const dx = event.clientX - fromX
      const quick = performance.now() - started < QUICK_MS
      pointer = null
      if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId)
      if (horizontal !== true || (Math.abs(dx) < TRAVEL && !(quick && Math.abs(dx) >= FLICK))) {
        horizontal = null
        return
      }
      horizontal = null
      el.addEventListener('click', swallow, { capture: true, once: true })
      if (swallowTimer !== null) window.clearTimeout(swallowTimer)
      swallowTimer = window.setTimeout(() => {
        el.removeEventListener('click', swallow, true)
        swallowTimer = null
      }, 0)
      step(dx < 0 ? 1 : -1)
    }

    const cancel = () => {
      pointer = null
      horizontal = null
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', finish)
    el.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', finish)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('click', swallow, true)
      if (swallowTimer !== null) window.clearTimeout(swallowTimer)
    }
  }, [enabled, ref, step])
}
