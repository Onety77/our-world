/**
 * Where you are looking.
 *
 * With no avatar and no walking, this is the only thing that makes the garden
 * a space rather than a picture. It carries two related but different things,
 * and they are separate on purpose:
 *
 * `eased`  — the pointer as a gentle -1..1, smoothed. Cameras use it to *shift*
 *            a metre or two, which separates near from far. Parallax.
 * `gaze`   — an actual yaw and pitch, in radians. Cameras use it to *turn*.
 *
 * Parallax alone was what the garden had, and it was why nobody had ever seen
 * the sun. The sun sits sixty degrees up; a camera that leans one metre
 * sideways is still looking at the same patch of grass. Turning is what lets
 * you find the sky, the moon, the tops of the trees and your own feet — so the
 * world extends past the frame in every direction instead of being a
 * postcard that wobbles.
 *
 * Deliberately module-level and imperative. Read every frame by cameras, never
 * through React — see the technical law in PLAN.md.
 */

/** Raw pointer position across the window, -1 (left/top) to 1 (right/bottom). */
export const look = { x: 0, y: 0 }

/** Eased toward the raw pointer, so a flick doesn't snap the world. */
export const eased = { x: 0, y: 0 }

/**
 * How far you may turn, in radians.
 *
 * Asymmetric, because the interesting half of a sky is the top of it. Up
 * reaches forty-four degrees, which with a 55° field of view puts the top of
 * the frame past seventy — clear of the noon sun at its highest. Down reaches
 * far enough to put your own feet in shot and no further; there is nothing
 * below that except ground.
 */
export const GAZE = {
  /*
    Twenty-nine degrees each way. Wider than it needs to be for parallax,
    because it is not for parallax: with a 55° field of view this puts about
    sixty-eight degrees of azimuth within reach either side, which is what
    decides whether the sun can be found in the middle of the morning. At
    twenty it could not be, from about nine o'clock back.
  */
  yaw: 0.5, // ±29°
  up: 0.77, // 44°
  down: 0.46, // 26°
}

/** The turn to apply this frame. Radians. Positive pitch looks up. */
export const gaze = { yaw: 0, pitch: 0 }

/**
 * On a phone there is no hover, so a *vertical* drag turns the view instead.
 * Horizontal drags already belong to browsing places (see systems/swipe), and
 * the swipe recogniser ignores anything it decides is vertical — so the axis
 * it throws away is exactly the one going spare.
 *
 * It springs back on release rather than staying where it was put. Holding a
 * pitch would mean the garden could be left permanently staring at the ground
 * with no obvious way back; a peek that settles is both safer and nicer.
 */
const touch = { active: false, pitch: 0, startY: 0, from: 0 }

/** True once anything has told us this is a touch device. */
let isTouch = false

export function attachPointerLook(el: HTMLElement): () => void {
  const rect = () => el.getBoundingClientRect()

  const set = (clientX: number, clientY: number) => {
    const r = rect()
    look.x = ((clientX - r.left) / r.width) * 2 - 1
    look.y = ((clientY - r.top) / r.height) * 2 - 1
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      isTouch = true
      if (touch.active) {
        const r = rect()
        // Dragging *down* looks up, the way dragging a map moves the map.
        const travel = (touch.startY - e.clientY) / Math.max(1, r.height)
        touch.pitch = Math.max(-1, Math.min(1, touch.from - travel * 2.4))
      }
      return
    }
    set(e.clientX, e.clientY)
  }

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    isTouch = true
    touch.active = true
    touch.startY = e.clientY
    touch.from = touch.pitch
  }

  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    touch.active = false
  }

  // The pointer leaving is the honest signal that nobody is looking anywhere
  // in particular, so the frame returns to how it was composed.
  const onLeave = () => {
    look.x = 0
    look.y = 0
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('pointerleave', onLeave)
  window.addEventListener('blur', onLeave)

  return () => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('blur', onLeave)
  }
}

/**
 * Call once per frame, before reading `eased` or `gaze`.
 *
 * Two different rates on purpose. The parallax shift chases the pointer fairly
 * quickly because it is a small movement and lag there feels like drag; the
 * turn chases it more slowly, because a fast turn is nausea and a slow one
 * reads as somebody deciding to look.
 *
 * `scale` shrinks the whole turn. The garden takes the full range because
 * looking around *is* what you are doing out there; inside a place the frame
 * is composed around an activity and swinging forty degrees off it would be
 * wrong — but standing dead still is worse, and was the one thing the garden
 * had that its places did not. A third or so is enough to feel like a head
 * moving rather than a photograph.
 */
export function stepPointerLook(delta: number, scale = 1) {
  const quick = 1 - Math.exp(-4 * delta)
  eased.x += (look.x - eased.x) * quick
  eased.y += (look.y - eased.y) * quick

  if (isTouch && !touch.active) {
    // spring back to the composed frame over about a second
    touch.pitch += (0 - touch.pitch) * (1 - Math.exp(-2.6 * delta))
  }

  // -1 is the top of the window, and the top of the window is up.
  const wantPitchAt = isTouch ? touch.pitch : -eased.y
  const wantYaw = (isTouch ? 0 : eased.x) * GAZE.yaw * scale
  const wantPitch =
    (wantPitchAt >= 0 ? wantPitchAt * GAZE.up : wantPitchAt * GAZE.down) * scale

  const slow = 1 - Math.exp(-3.1 * delta)
  gaze.yaw += (wantYaw - gaze.yaw) * slow
  gaze.pitch += (wantPitch - gaze.pitch) * slow
}
