/**
 * The Tree of Thoughts, walked without walking.
 *
 * The rest of the garden has one authored view per place. The Tree cannot:
 * every new thought occupies another branch and another point in the meadow,
 * so eventually every fixed view hides part of what the two of you made.
 * This is a camera orbit around the trunk, kept imperative because it is read
 * and written every frame. React has no reason to rerender while a hand moves.
 */

const TAU = Math.PI * 2
const DRAG_TURN = TAU
const KEY_TURN = Math.PI / 7
/**
 * A dolly rather than a field-of-view zoom. At the near end the papers are
 * large enough to choose with a thumb; at the far end the clearing still has
 * an edge, so pinching can never lose the Tree altogether.
 */
const MIN_ZOOM = 0.52
const MAX_ZOOM = 1.3

export const treeOrbit = {
  /** Where the hand has asked the camera to go, in radians. */
  angle: 0,
  /** The eased angle actually used by the camera. */
  current: 0,
  /** Release momentum, radians per second. */
  velocity: 0,
  dragging: false,
  /** Camera distance multiplier requested by a pinch. One is the authored view. */
  zoom: 1,
  /** Eased multiplier actually used by the camera. */
  zoomCurrent: 1,
  zooming: false,
}

let usedGesture = false

/**
 * True for the remainder of the pointer-up that ended a look/orbit gesture.
 * Flower picking checks this so releasing over a bloom never opens it.
 */
export function treeGestureUsed(): boolean {
  return usedGesture
}

export interface TreeOrbitHandle {
  detach(): void
}

/**
 * Attach Tree-only controls to the garden's transparent gesture surface.
 *
 * Sideways drag circles the trunk. Vertical touch movement remains available
 * to pointerLook, so a single finger can explore both axes without modes.
 * Two fingers pinch the camera toward or away from the Tree. Wheel input
 * covers both a mouse wheel and two-finger trackpad scrolling for turning.
 */
export function attachTreeOrbit(
  el: HTMLElement,
  active: () => boolean,
): TreeOrbitHandle {
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastAt = 0
  let axis: 'horizontal' | 'vertical' | null = null
  let moved = false
  const pointers = new Map<number, { x: number; y: number }>()
  let pinching = false
  let pinchStartDistance = 1
  let pinchStartZoom = 1

  const width = () => el.getBoundingClientRect().width || 1
  const interactive = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest('button, input, textarea, select, a'))

  const down = (event: PointerEvent) => {
    if (!active() || interactive(event.target)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinchStartDistance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
      pinchStartZoom = treeOrbit.zoom
      pinching = true
      moved = true
      treeOrbit.dragging = false
      treeOrbit.zooming = true
      treeOrbit.velocity = 0
      for (const id of pointers.keys()) el.setPointerCapture?.(id)
      return
    }

    // A third contact does not create a second interpretation of the gesture.
    if (pointers.size !== 1 || pointerId !== null) return
    pointerId = event.pointerId
    startX = lastX = event.clientX
    startY = event.clientY
    lastAt = performance.now()
    axis = null
    moved = false
    treeOrbit.velocity = 0
  }

  const move = (event: PointerEvent) => {
    const contact = pointers.get(event.pointerId)
    if (contact) {
      contact.x = event.clientX
      contact.y = event.clientY
    }

    if (pinching && pointers.size >= 2) {
      const [a, b] = [...pointers.values()]
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
      treeOrbit.zoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, pinchStartZoom * (pinchStartDistance / distance)),
      )
      return
    }

    if (event.pointerId !== pointerId) return
    const totalX = event.clientX - startX
    const totalY = event.clientY - startY

    if (axis === null) {
      if (Math.abs(totalX) < 6 && Math.abs(totalY) < 6) return
      axis = Math.abs(totalX) >= Math.abs(totalY) ? 'horizontal' : 'vertical'
      moved = true
      if (axis === 'horizontal') {
        treeOrbit.dragging = true
        el.setPointerCapture?.(event.pointerId)
      }
    }
    if (axis !== 'horizontal') return

    const now = performance.now()
    const dx = event.clientX - lastX
    const dt = Math.max(8, now - lastAt) / 1000
    const turn = -(dx / width()) * DRAG_TURN
    treeOrbit.angle += turn
    treeOrbit.velocity = Math.max(-3.8, Math.min(3.8, turn / dt))
    lastX = event.clientX
    lastAt = now
  }

  const finish = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return
    pointers.delete(event.pointerId)

    if (pinching || treeOrbit.zooming) {
      el.releasePointerCapture?.(event.pointerId)
      // Do not turn the one finger left behind into a new drag halfway through
      // a pinch. Both hands lift, then the next touch begins a fresh gesture.
      pointerId = null
      axis = null
      moved = false
      treeOrbit.dragging = false
      // Keep swallowing releases until the last finger from this pinch is up;
      // otherwise that last release could be mistaken for a tap on a letter.
      treeOrbit.zooming = pointers.size > 0
      pinching = pointers.size > 0
      usedGesture = true
      setTimeout(() => { usedGesture = false }, 0)
      return
    }

    if (event.pointerId !== pointerId) return
    pointerId = null
    if (axis === 'horizontal') el.releasePointerCapture?.(event.pointerId)
    treeOrbit.dragging = false

    if (moved) {
      usedGesture = true
      // Window-level thought picking runs later in this same pointer-up.
      setTimeout(() => { usedGesture = false }, 0)
    }
    axis = null
    moved = false
  }

  const wheel = (event: WheelEvent) => {
    if (!active() || interactive(event.target)) return
    event.preventDefault()
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? window.innerHeight
        : 1
    // Trackpads usually offer deltaX; an ordinary vertical mouse wheel should
    // be just as useful in a place with no page to scroll.
    const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.35
      ? event.deltaX
      : event.deltaY
    const turn = Math.max(-0.42, Math.min(0.42, raw * unit * 0.0024))
    treeOrbit.angle += turn
    treeOrbit.velocity = turn * 2.2
  }

  const key = (event: KeyboardEvent) => {
    if (!active() || event.repeat || interactive(event.target)) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      treeOrbit.angle += KEY_TURN
      treeOrbit.velocity = 0
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      treeOrbit.angle -= KEY_TURN
      treeOrbit.velocity = 0
    } else if (event.key === 'Home') {
      event.preventDefault()
      // Return to the authored front without unwinding every completed turn.
      treeOrbit.angle = Math.round(treeOrbit.current / TAU) * TAU
      treeOrbit.zoom = 1
      treeOrbit.velocity = 0
    }
  }

  const cancel = () => {
    pointers.clear()
    pinching = false
    pointerId = null
    axis = null
    moved = false
    treeOrbit.dragging = false
    treeOrbit.zooming = false
    treeOrbit.velocity = 0
  }

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', finish)
  el.addEventListener('pointercancel', finish)
  el.addEventListener('wheel', wheel, { passive: false })
  window.addEventListener('keydown', key)
  window.addEventListener('blur', cancel)

  return {
    detach() {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', finish)
      el.removeEventListener('pointercancel', finish)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', cancel)
    },
  }
}

/** Advance easing and release momentum once per camera frame. */
export function stepTreeOrbit(delta: number, active: boolean): void {
  if (!active) {
    treeOrbit.velocity = 0
    treeOrbit.dragging = false
    treeOrbit.zooming = false
    return
  }

  if (!treeOrbit.dragging && Math.abs(treeOrbit.velocity) > 0.002) {
    treeOrbit.angle += treeOrbit.velocity * delta
    treeOrbit.velocity *= Math.exp(-5.2 * delta)
  }

  treeOrbit.current +=
    (treeOrbit.angle - treeOrbit.current) * (1 - Math.exp(-7.5 * delta))
  treeOrbit.zoomCurrent +=
    (treeOrbit.zoom - treeOrbit.zoomCurrent) * (1 - Math.exp(-10 * delta))

  // Keep the numbers small after many complete circles without changing the
  // view or making the easing cross the long way around zero.
  if (!treeOrbit.dragging && Math.abs(treeOrbit.current) > TAU * 100) {
    const turns = Math.trunc(treeOrbit.current / TAU)
    treeOrbit.current -= turns * TAU
    treeOrbit.angle -= turns * TAU
  }
}
