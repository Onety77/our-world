/**
 * Leaning in on something.
 *
 * When you take a letter down, the camera moves toward it before the paper
 * opens. Without that the sheet arrives out of nowhere and the letter you were
 * pointing at might as well have been a button — you never see the thing you
 * touched become the thing you're reading.
 *
 * Deliberately not zustand. This is read every frame by the camera and written
 * once per tap; a store subscription would mean React work in the middle of a
 * camera move, which is exactly what the walk stutter turned out to be.
 */

export interface Focus {
  /** World point being leaned toward. */
  x: number
  y: number
  z: number
  /** 0 = the ordinary camera, 1 = right in on the point. Eased by the rig. */
  amount: number
  /** What it's easing toward: 1 while something is open, 0 once it closes. */
  want: number
}

export const focus: Focus = { x: 0, y: 0, z: 0, amount: 0, want: 0 }

/**
 * Lean in on a world point. Re-aiming while already leaned in moves the target
 * without dropping back out, so opening a second letter glides across.
 */
export function focusOn(x: number, y: number, z: number) {
  focus.x = x
  focus.y = y
  focus.z = z
  focus.want = 1
}

export function clearFocus() {
  focus.want = 0
}

/**
 * How long the camera takes to get there, in seconds. Slow enough to read as a
 * move rather than a cut; short enough that it is over before you've finished
 * reaching for the paper.
 *
 * Someone who has asked their system for less motion gets none: the pose
 * changes in a frame and the paper doesn't wait for it. A camera gliding across
 * the screen is exactly the thing that setting is for.
 */
export const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

export const FOCUS_IN = reducedMotion ? 0.001 : 0.55
export const FOCUS_OUT = reducedMotion ? 0.001 : 0.4

/**
 * How far off the letter the camera settles, in metres.
 *
 * Not reading distance — the paper you read is the sheet on the screen. This
 * is the distance at which the letter is plainly the subject and you can still
 * see the branch it hangs from. Closer than about two metres and the camera
 * ends up inside the canopy, so what's behind the sheet is an anonymous dark
 * wall and the connection you were trying to draw is lost anyway.
 */
export const FOCUS_DISTANCE = 2.8
