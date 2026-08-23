/**
 * Driving it, on a phone and on a keyboard.
 *
 *   keyboard
 *     ↑ / W               throttle
 *     ↓ / S               brake — and, held at a stand, reverse
 *     A / D, or ← / →     steer
 *     space               handbrake. This is the drift
 *     alt                 spend a measure of ember
 *
 *   a thumb
 *     left half, dragged sideways   steer
 *     right half, held              throttle
 *     right half, dragged down      off the throttle, onto the brake, and
 *                                   further still onto the handbrake
 *     right half, tapped            spend a measure of ember
 *
 * ---------------------------------------------------------------------------
 * **The car used to drive itself, and now it does not.**
 *
 * There was no throttle: the car went forward at full power for the whole run,
 * on the argument that a forty-second race should be playable one-handed in
 * bed. It made the game worse in a way that took a long time to see. A driver
 * who cannot lift cannot slow down for a corner — so every corner had to be
 * survivable flat out, and the only way to arrange that was to pile assists on
 * top of the tyre model until the car was being driven by the game.
 *
 * The phone keeps its one thumb. It just does more with it: where that thumb
 * sits *vertically* is the pedal, relative to wherever it landed, so one
 * gesture covers throttle, brake and handbrake continuously and none of it
 * needs a second hand.
 * ---------------------------------------------------------------------------
 *
 * **The steering is relative on a phone**, for the same reason it always was:
 * absolute steering is unusable one-handed, because your thumb cannot reach
 * the middle of the screen and the car is therefore permanently turning.
 *
 * **And the hand has a speed everywhere.** The rate the wheels are *allowed*
 * to move at falls with speed. This is not the lock limit — that is in the
 * physics, where it belongs, and it is derived from how much lock the tyres
 * can actually use. This is the arms: nobody throws a wheel from lock to lock
 * at a hundred and sixty, and a game that lets you do it is a game where the
 * fast way round is to hammer the key.
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
const LOCK_TRAVEL = 0.27
/** A press shorter and stiller than this is a tap, not a hold. */
const TAP_MS = 220
const TAP_SLOP = 16

/**
 * Where the right thumb's travel takes it, in fractions of the screen height.
 *
 * Down from where it landed: nothing for the first little way, so a thumb that
 * drifts while holding the throttle does not start braking; then off the gas
 * and onto the brake; then, at the bottom of the range, the handbrake as well.
 * A hairpin is one long pull downward, which is what it is in a car.
 */
const PEDAL_DEAD = 0.02
const PEDAL_BRAKE = 0.16
const PEDAL_HAND = 0.3

/**
 * How fast the hand moves, in units of full lock per second.
 *
 * Falls with speed. `STEER_RATE` is what you get standing still and
 * `STEER_RATE_FAST` is what is left at the top end; a car that answers a key
 * as fast at a hundred and sixty as at twenty is a car with no weight in the
 * steering, however good the tyre model underneath is.
 */
const STEER_RATE = 15
/**
 * And what is left at the top end.
 *
 * Raised a long way once the steering *lock* became speed-limited by the tyres
 * rather than by a table. Before that, the rate was doing two jobs — being a
 * hand, and quietly stopping a car that had four times too much lock from
 * being flung sideways — and the second job made it far too slow for the
 * first. At 4.2 it took the better part of a second to wind on full lock at
 * speed, which is twenty-seven metres of tunnel: long enough that pointing the
 * car at a gap felt like asking it to consider the idea.
 *
 * The lock is small at speed now, so the hand can move properly again.
 */
const STEER_RATE_FAST = 8.5
/** Coming *off* lock is always quicker than going on. Hands work that way. */
const RETURN_BONUS = 1.55

/** Seconds⁻¹ for each pedal, on and off. Off is quicker: a foot lifts fast. */
const GAS_ON = 11
const GAS_OFF = 14
const BRAKE_ON = 12
const BRAKE_OFF = 16

export function attachControls(surface: HTMLElement): RallyControls {
  let steer = 0
  let throttle = 0
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
    touchGas = 0
    touchBrake = 0
    touchHand = false
    steerPointer = null
    pedalPointer = null
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  // --- thumbs --------------------------------------------------------------
  let steerTarget = 0
  let steerPointer: number | null = null
  let steerOrigin = 0
  let pedalPointer: number | null = null
  let pedalOrigin = 0
  let pedalAt = 0
  let pedalFrom = 0
  let touchGas = 0
  let touchBrake = 0
  let touchHand = false
  let touchBoost = false

  const onDown = (event: PointerEvent) => {
    engaged = true
    const rect = surface.getBoundingClientRect()
    const leftHalf = event.clientX - rect.left < rect.width * 0.5
    if (leftHalf && steerPointer === null) {
      steerPointer = event.pointerId
      steerOrigin = event.clientX
      surface.setPointerCapture(event.pointerId)
    } else if (!leftHalf && pedalPointer === null) {
      pedalPointer = event.pointerId
      pedalAt = performance.now()
      pedalFrom = event.clientY
      pedalOrigin = event.clientY
      // Landing is the throttle. Everything else is measured down from here.
      touchGas = 1
      touchBrake = 0
      touchHand = false
      surface.setPointerCapture(event.pointerId)
    }
  }

  const onMove = (event: PointerEvent) => {
    const rect = surface.getBoundingClientRect()
    if (event.pointerId === steerPointer) {
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
      // A thumb has much more precision near the middle than at its edge. The
      // progressive curve keeps a ten-pixel correction a correction, while the
      // outer part of the travel still reaches full lock for a hairpin.
      steerTarget = Math.sign(amount) * Math.pow(Math.abs(amount), 1.35)
      return
    }
    if (event.pointerId !== pedalPointer) return

    /*
      One thumb, both pedals, by how far down it has come.

      Upward is ignored entirely — the throttle is already fully on when the
      thumb lands, and letting an upward drag do something would mean the
      pedal depended on where in the frame you happened to touch.
    */
    const down = (event.clientY - pedalOrigin) / rect.height
    if (down <= PEDAL_DEAD) {
      touchGas = 1
      touchBrake = 0
      touchHand = false
      // The origin follows a thumb that has crept upward, so the *next* pull
      // downward is measured from where the thumb actually is.
      if (down < 0) pedalOrigin = event.clientY
      return
    }
    const span = PEDAL_BRAKE - PEDAL_DEAD
    const onto = Math.min(1, (down - PEDAL_DEAD) / span)
    touchGas = 1 - onto
    touchBrake = onto
    touchHand = down > PEDAL_HAND
  }

  const onUp = (event: PointerEvent) => {
    if (event.pointerId === steerPointer) {
      steerPointer = null
      steerTarget = 0
    }
    if (event.pointerId === pedalPointer) {
      const quick = performance.now() - pedalAt < TAP_MS
      const still = Math.abs(event.clientY - pedalFrom) < TAP_SLOP
      if (quick && still) touchBoost = true
      pedalPointer = null
      touchGas = 0
      touchBrake = 0
      touchHand = false
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

      /*
        Two pedals, each easing on and off over a few hundredths of a second.

        Not a switch. Trail-braking — staying on the brake past the turn-in and
        breathing off it toward the apex — is the most useful thing a driver
        can do in this car, and it is impossible if the pedal is a boolean. The
        same easing gives the throttle its pick-up and, more importantly, its
        *release*: lifting is something you do over a moment, and lifting is
        how you tighten a line.
      */
      const gas = Math.max(held.has('arrowup') || held.has('w') ? 1 : 0, touchGas)
      throttle += (gas - throttle) * (1 - Math.exp(-(gas > throttle ? GAS_ON : GAS_OFF) * dt))

      const pedal = Math.max(held.has('arrowdown') || held.has('s') ? 1 : 0, touchBrake)
      brake += (pedal - brake) * (1 - Math.exp(-(pedal > brake ? BRAKE_ON : BRAKE_OFF) * dt))

      const handbrake = touchHand || held.has(' ') || held.has('spacebar')

      const spend = keyBoost || touchBoost
      keyBoost = false
      touchBoost = false
      return { steer, throttle, brake, handbrake, boost: spend }
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
