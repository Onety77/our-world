/**
 * Steering, on a phone and on a keyboard.
 *
 * There is no throttle. The car drives itself forward, which is the single
 * decision that makes a forty-second race playable one-handed on a phone in
 * bed — and everything below is arranged so that the *same car* is being
 * driven either way, not two different games that share a road.
 *
 *   keyboard
 *     A / D, or ← / →     steer
 *     S, or ↓             brake. Weight forward, and it turns in harder
 *     space               handbrake. This is the drift
 *     alt                 spend a measure of ember
 *
 *   a thumb
 *     left half, dragged  steer
 *     right half, held    brake, and the handbrake that comes with it
 *     right half, tapped  spend a measure of ember
 *
 * The two schemes are not the same shape and deliberately so. A phone has two
 * thumbs and no modifier keys, so the brake and the handbrake arrive together
 * on a hold — which is what you want on a phone anyway, because the only
 * reason to touch either is a corner. A keyboard has ten fingers, so it gets
 * them apart, and the extra thing you can do with them — brake to load the
 * front, *then* yank it to rotate — is the difference between driving the car
 * and operating it.
 *
 * ---------------------------------------------------------------------------
 * **The steering is relative, on a phone.**
 *
 * Where your thumb lands is centre; how far you drag from there is lock.
 * Absolute steering — where the middle of the screen is straight ahead — is
 * unusable one-handed, because your thumb cannot reach the middle of the
 * screen and the car is therefore permanently turning.
 *
 * **And it is speed-sensitive, everywhere.**
 *
 * The rate the wheels are *allowed* to move at falls with speed. At walking
 * pace they go where you put them; at forty metres a second they take a beat.
 * This is not the lock limit — that is in the physics, where it belongs — it
 * is the *hand*: nobody throws a wheel from lock to lock at speed, and a game
 * that lets you do it is a game where the fast way round is to hammer the key.
 * ---------------------------------------------------------------------------
 */

import type { CarInput } from './physics'

export interface RallyControls {
  /** Read the current intention, and consume the boost tap if there is one. */
  read(speed: number): CarInput
  /** True once the player has done anything at all. Fades the opening line. */
  readonly engaged: boolean
  detach(): void
}

/** Full lock, as a fraction of the screen's width. */
const LOCK_TRAVEL = 0.17
/** A press shorter and stiller than this is a tap, not a hold. */
const TAP_MS = 220
const TAP_SLOP = 16

/**
 * How fast the hand moves, in units of full lock per second.
 *
 * Falls with speed. `STEER_RATE` is what you get standing still and
 * `STEER_RATE_FAST` is what is left at the top end; a car that answers a key
 * as fast at a hundred and sixty as at twenty is a car with no weight in the
 * steering, however good the tyre model underneath is.
 */
const STEER_RATE = 13
const STEER_RATE_FAST = 4.4
/** Coming *off* lock is always quicker than going on. Hands work that way. */
const RETURN_BONUS = 1.55

/** Seconds the brake takes to come fully on, and to come off. */
const BRAKE_ON = 9
const BRAKE_OFF = 16

export function attachControls(surface: HTMLElement): RallyControls {
  let steer = 0
  let brake = 0
  let engaged = false
  let last = performance.now()

  // --- keyboard ------------------------------------------------------------
  const held = new Set<string>()
  let keyBoost = false

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()
    if (!KEYS.has(key)) return
    /*
      Every one of these is prevented, and two of them have to be.

      Space scrolls the page. Alt, on its own, moves focus to the browser's
      menu bar on Windows — so an unprevented boost key takes the keyboard
      away from the game mid-corner and the next arrow press goes to a menu.
      Neither is recoverable from inside a forty-second race.
    */
    event.preventDefault()
    engaged = true
    // Edge-triggered: holding it is one measure of ember, not all of it.
    if (key === 'alt' && !held.has(key)) keyBoost = true
    held.add(key)
  }
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.key.toLowerCase())
  // A window that loses focus mid-corner leaves a key stuck down for ever.
  const onBlur = () => {
    held.clear()
    steerTarget = 0
    braking = false
    steerPointer = null
    brakePointer = null
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  // --- thumbs --------------------------------------------------------------
  let steerTarget = 0
  let steerPointer: number | null = null
  let steerOrigin = 0
  let braking = false
  let brakePointer: number | null = null
  let brakeAt = 0
  let brakeFrom = 0
  let touchBoost = false

  const onDown = (event: PointerEvent) => {
    engaged = true
    const rect = surface.getBoundingClientRect()
    const leftHalf = event.clientX - rect.left < rect.width * 0.5
    if (leftHalf && steerPointer === null) {
      steerPointer = event.pointerId
      steerOrigin = event.clientX
      surface.setPointerCapture(event.pointerId)
    } else if (!leftHalf && brakePointer === null) {
      brakePointer = event.pointerId
      brakeAt = performance.now()
      brakeFrom = event.clientX
      braking = true
      surface.setPointerCapture(event.pointerId)
    }
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== steerPointer) return
    const rect = surface.getBoundingClientRect()
    const travel = Math.max(40, rect.width * LOCK_TRAVEL)
    let amount = (event.clientX - steerOrigin) / travel
    // Past full lock the origin follows, so coming back off the lock responds
    // immediately instead of after however far you overshot.
    if (amount > 1) {
      steerOrigin = event.clientX - travel
      amount = 1
    } else if (amount < -1) {
      steerOrigin = event.clientX + travel
      amount = -1
    }
    steerTarget = amount
  }

  const onUp = (event: PointerEvent) => {
    if (event.pointerId === steerPointer) {
      steerPointer = null
      steerTarget = 0
    }
    if (event.pointerId === brakePointer) {
      const quick = performance.now() - brakeAt < TAP_MS
      const still = Math.abs(event.clientX - brakeFrom) < TAP_SLOP
      if (quick && still) touchBoost = true
      brakePointer = null
      braking = false
    }
  }

  surface.addEventListener('pointerdown', onDown)
  surface.addEventListener('pointermove', onMove)
  surface.addEventListener('pointerup', onUp)
  surface.addEventListener('pointercancel', onUp)

  return {
    get engaged() {
      return engaged
    },

    read(speed = 0): CarInput {
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now

      const keyed =
        (held.has('arrowleft') || held.has('a') ? -1 : 0) +
        (held.has('arrowright') || held.has('d') ? 1 : 0)
      const wanted = keyed !== 0 ? keyed : steerTarget

      /*
        Move toward the input at a hand's speed rather than snapping to it.

        A keyboard is a switch and a thumb is not, and this is the same easing
        for both so the two feel like the same machine. The wheels themselves
        lag again inside the physics, which is where the weight comes from;
        this is the arms.
      */
      const fast = Math.min(1, speed / 44)
      let rate = STEER_RATE + (STEER_RATE_FAST - STEER_RATE) * fast
      // Unwinding is quicker than winding on, which is what makes catching a
      // slide possible at all with a key rather than a wheel.
      if (Math.abs(wanted) < Math.abs(steer) || Math.sign(wanted) !== Math.sign(steer)) {
        rate *= RETURN_BONUS
      }
      steer += (wanted - steer) * (1 - Math.exp(-rate * dt))

      // The brake comes on and off over a few hundredths, so trail-braking is
      // something you can actually do rather than a switch you flick.
      const pedal =
        braking || held.has('arrowdown') || held.has('s') ? 1 : 0
      brake += (pedal - brake) * (1 - Math.exp(-(pedal > brake ? BRAKE_ON : BRAKE_OFF) * dt))

      // On a phone the hold does both; on a keyboard space is its own thing.
      const handbrake = braking || held.has(' ') || held.has('spacebar')

      const spend = keyBoost || touchBoost
      keyBoost = false
      touchBoost = false
      return { steer, brake, handbrake, boost: spend }
    },

    detach() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      surface.removeEventListener('pointerdown', onDown)
      surface.removeEventListener('pointermove', onMove)
      surface.removeEventListener('pointerup', onUp)
      surface.removeEventListener('pointercancel', onUp)
    },
  }
}

const KEYS = new Set([
  'arrowleft',
  'arrowright',
  'arrowdown',
  'arrowup',
  'a',
  'd',
  's',
  'w',
  ' ',
  'spacebar',
  'alt',
])
