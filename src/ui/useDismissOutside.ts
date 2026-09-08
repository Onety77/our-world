import { useEffect, useRef, type RefObject } from 'react'

type Boundary = RefObject<HTMLElement | null>

/**
 * Dismiss a temporary surface when the primary pointer taps outside it.
 *
 * The complete pointer sequence is owned deliberately. The garden responds to
 * pointer-up and click as well as pointer-down, so consuming only one phase can
 * close a panel and enter a place with the rest of the same tap. Boundaries are
 * refs because several paper overlays have a sheet and a separate action row
 * which are both part of the same window.
 *
 * The callback and boundary list are kept current without rebinding the
 * document listener on every keystroke. Only open surfaces own a listener.
 */
export function useDismissOutside(
  active: boolean,
  onDismiss: () => void,
  boundaries: readonly Boundary[],
  options?: { allowOutsideDrag?: boolean },
): void {
  const dismissNow = useRef(onDismiss)
  const insideNow = useRef(boundaries)
  dismissNow.current = onDismiss
  insideNow.current = boundaries

  useEffect(() => {
    if (!active) return

    const targetInfo = (event: Event) => {
      const target = event.target
      if (!(target instanceof Node)) return null
      const element = target instanceof Element ? target : target.parentElement
      /*
        Inside means inside the *surface*, which is not the same as inside the
        element. A panel belonging to an open thing may be rendered somewhere
        else in the document entirely — the emoji board is a portal on the body,
        placed from the composer's rectangle so that appearing cannot rebuild
        the field it belongs to — and by the DOM it is outside every boundary
        listed here. Clicking it therefore dismissed the very composer it was
        serving, in the capture phase, before React's own handler on the button
        had a chance to run: the board could be driven from the keyboard and was
        completely dead to the mouse. Anything marked `data-inside` is part of
        whatever is open, wherever it happens to be rendered.
      */
      const inside =
        insideNow.current.some((boundary) => boundary.current?.contains(target)) ||
        Boolean(element?.closest('[data-inside]'))
      const control = Boolean(element?.closest(
        'button, input, textarea, select, a, [role="button"], [role="tab"]',
      ))
      return { inside, control }
    }

    const consume = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
    }

    let outsideWorldTap = false
    let movedOutside = false
    let ignoreClick = false
    let from = { x: 0, y: 0 }
    let dismissTimer = 0

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return
      const info = targetInfo(event)
      outsideWorldTap = Boolean(info && !info.inside && !info.control)
      movedOutside = false
      from = { x: event.clientX, y: event.clientY }
      if (outsideWorldTap && !options?.allowOutsideDrag) consume(event)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!outsideWorldTap) return
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > 9) {
        movedOutside = true
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || !outsideWorldTap) return
      if (movedOutside) {
        outsideWorldTap = false
        movedOutside = false
        ignoreClick = true
        return
      }
      consume(event)
      // A prevented pointer sequence may not produce a click on every mobile
      // browser, so this is the backstop. The zero-delay leaves the capture
      // click listener alive for browsers which do produce one.
      dismissTimer = window.setTimeout(() => dismissNow.current(), 0)
    }

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return
      if (ignoreClick) {
        ignoreClick = false
        return
      }
      const info = targetInfo(event)
      if (!info || info.inside) return

      /*
        The dismissing tap must not also act on the world underneath. A tap on
        the meadow used to fold the conversation and then enter the selected
        place with the very same pointer event. Real controls are different:
        tapping the music while messages are open should fold one and open the
        other in a single gesture, so those events are allowed through.
      */
      if (!info.control) consume(event)
      window.clearTimeout(dismissTimer)
      outsideWorldTap = false
      dismissNow.current()
    }

    const onPointerCancel = () => {
      outsideWorldTap = false
      window.clearTimeout(dismissTimer)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('pointercancel', onPointerCancel, true)
    document.addEventListener('click', onClick, true)
    return () => {
      window.clearTimeout(dismissTimer)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerCancel, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [active, options?.allowOutsideDrag])
}
