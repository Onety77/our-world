import { useEffect, useRef, type PointerEvent, type MouseEvent } from 'react'

let releaseClickGuard: (() => void) | undefined
function consumeCompatibilityClick() {
  releaseClickGuard?.()
  const release = () => {
    window.removeEventListener('click', click, true)
    window.removeEventListener('pointerdown', release, true)
    clearTimeout(timer)
    releaseClickGuard = undefined
  }
  const click = (event: globalThis.MouseEvent) => {
    if (event.detail === 0) return // Keyboard and the deliberate button.click().
    event.preventDefault()
    event.stopImmediatePropagation()
    release()
  }
  // Survive the chooser unmounting: the release must not tap the new screen.
  window.addEventListener('click', click, true)
  window.addEventListener('pointerdown', release, { capture: true, once: true })
  const timer = window.setTimeout(release, 700)
  releaseClickGuard = release
}

/** Interior swipes page a choice; vertical scrolling and OS edge gestures stay native. */
export function useChoiceSwipe(browse: (step: number) => void, enabled = true) {
  const gesture = useRef<{ id: number; x: number; y: number; at: number; horizontal: boolean; button: HTMLButtonElement | null } | null>(null)
  const suppressClick = useRef(0)
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      suppressClick.current = 0
      if (!enabled || event.pointerType === 'mouse' || !event.isPrimary ||
        event.clientX < 28 || event.clientX > window.innerWidth - 28) {
        gesture.current = null
        return
      }
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), horizontal: false, button: (event.target as Element).closest('button') }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = gesture.current
      if (!start || start.id !== event.pointerId || start.horizontal) return
      const dx = Math.abs(event.clientX - start.x), dy = Math.abs(event.clientY - start.y)
      if (dy > 10 && dy > dx) { gesture.current = null; return }
      if (dx > 10 && dx > dy * 1.5) {
        start.horizontal = true
        // Keep the release on the stable row when its featured button changes.
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const start = gesture.current
      gesture.current = null
      if (!enabled || !start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      const distance = Math.abs(dx)
      if (Math.hypot(dx, dy) < 10 && !start.horizontal && performance.now() - start.at < 600 &&
        start.button && !start.button.disabled && start.button === (event.target as Element).closest('button')) {
        // Resolve taps and swipes together. Some touch browsers suppress their
        // compatibility click after a carousel replaces the previous target.
        suppressClick.current = performance.now() + 500
        consumeCompatibilityClick()
        event.preventDefault()
        event.stopPropagation()
        start.button.click()
        return
      }
      if (distance < 32 || distance < Math.abs(dy) * 1.5) return
      // Even a drag too short to turn the page must not launch a game on release.
      suppressClick.current = performance.now() + 500
      consumeCompatibilityClick()
      if (distance >= 60 || distance / Math.max(1, performance.now() - start.at) > 0.35) {
        // Finish the native touch sequence before replacing its target node.
        // Removing it during pointerup can swallow the next tap in Chromium.
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => browse(dx < 0 ? 1 : -1))
      }
    },
    onPointerCancel() { gesture.current = null },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (event.detail !== 0 && performance.now() < suppressClick.current) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
  }
}
