import { useEffect, useRef, type RefObject } from 'react'

type Boundary = RefObject<HTMLElement | null>

/**
 * Dismiss a temporary surface when the primary pointer begins outside it.
 *
 * `pointerdown` makes this feel immediate on touch screens and avoids the
 * awkward case where a drag starts outside, finishes over the panel, and is
 * mistaken for a click inside. Boundaries are refs because several of the
 * paper overlays have a sheet and a separate row of actions which are both
 * part of the same window.
 *
 * The callback and boundary list are kept current without rebinding the
 * document listener on every keystroke. Only open surfaces own a listener.
 */
export function useDismissOutside(
  active: boolean,
  onDismiss: () => void,
  boundaries: readonly Boundary[],
): void {
  const dismissNow = useRef(onDismiss)
  const insideNow = useRef(boundaries)
  dismissNow.current = onDismiss
  insideNow.current = boundaries

  useEffect(() => {
    if (!active) return

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return
      const target = event.target
      if (!(target instanceof Node)) return
      if (insideNow.current.some((boundary) => boundary.current?.contains(target))) return

      /*
        The dismissing tap must not also act on the world underneath. A tap on
        the meadow used to fold the conversation and then enter the selected
        place with the very same pointer event. Real controls are different:
        tapping the music while messages are open should fold one and open the
        other in a single gesture, so those events are allowed through.
      */
      const element = target instanceof Element ? target : target.parentElement
      const aimedAtControl = element?.closest(
        'button, input, textarea, select, a, [role="button"], [role="tab"]',
      )
      if (!aimedAtControl) {
        event.preventDefault()
        event.stopPropagation()
      }
      dismissNow.current()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [active])
}
