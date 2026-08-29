/**
 * Driving it, on a phone and on a keyboard.
 *
 *   keyboard
 *     ↑ / W               throttle
 *     ↓ / S               brake — and, held at a stand, reverse
 *     A / D, or ← / →     steer
 *     space               handbrake. This is the drift
 *     shift, or E         spend a measure of ember. Alt and AltGr also work
 *
 *   two thumbs, on a phone
 *     left of the screen, held      steer left
 *     right of the screen, held     steer right
 *     the throttle                  is not a control; it is always on
 *     the two buttons               the handbrake, and a measure of ember
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
 * The keyboard keeps all four. The phone does not, and the reason is that a
 * phone has two thumbs and no more: one is steering and the other is on the
 * buttons, so there is nothing left to hold a throttle with. See `touch.ts`
 * for what replaced it and why the handbrake is the brake.
 * ---------------------------------------------------------------------------
 *
 * **Steering on a phone is a side, not a drag.** It used to be relative — put
 * a thumb down anywhere on the left half and slide it — which reads well and
 * costs the first tenth of a second of every correction, because a drag means
 * nothing until it has an origin and the origin is wherever you happened to
 * land. That tenth of a second is the one a corner is decided in. Holding a
 * side has no origin to find: the moment the finger is down, the wheel is
 * winding on, at the same hand-speed a key gets.
 *
 * **And the hand has a speed everywhere.** The rate the wheels are *allowed*
 * to move at falls with speed. This is not the lock limit — that is in the
 * physics, where it belongs, and it is derived from how much lock the tyres
 * can actually use. This is the arms: nobody throws a wheel from lock to lock
 * at a hundred and sixty, and a game that lets you do it is a game where the
 * fast way round is to hammer the key.
 */

import type { CarInput } from './physics'
import { DERIVED } from './tuning'
import { drivingWithThumbs, releaseThumbs, thumb } from './touch'

export interface RallyControls {
  /** Read the current intention, and consume the boost tap if there is one. */
  read(speed: number): CarInput
  /** True once the player has done anything at all. Fades the opening line. */
  readonly engaged: boolean
  detach(): void
}

/**
 * What spends a measure of ember.
 *
 * Four keys for one action, which is three more than a control usually
 * deserves. The reason is that the single key it used to have — alt — is the
 * worst one on the board to have picked, and it took somebody being unable to
 * use the ember at all to notice:
 *
 * **On a great many keyboards the right-hand alt is AltGr**, and a browser
 * reports that as `AltGraph`, not as `Alt`. It never matched, so on those
 * keyboards the ember key did not exist — and since nothing on screen says
 * anything except "alt for the ember", there was no way to find that out. The
 * bar filled up and the button did nothing.
 *
 * **And a bare alt belongs to the operating system.** On Windows it reaches
 * for the menu bar; the handler prevents that, but a control that has to fight
 * the window manager for every press is a control that will keep going wrong on
 * machines nobody here has.
 *
 * `shift` is the one to teach. Every driving game ever made puts a boost
 * there, nothing else wants it, and there is one under *each* hand — which
 * matters, because this is played on the arrows by some people and on WASD by
 * others and those two grips leave different hands free. `e` is for ember and
 * is the easy reach from WASD. Alt and AltGr stay, because somebody has
 * already learned them.
 */
const BOOST_KEYS = new Set(['shift', 'e', 'alt', 'altgraph'])


/**
 * How fast the hand moves, in units of full lock per second.
 *
 * Both dials now, and both live in `tuning.ts`: `DERIVED.steerRate` is what
 * you get standing still and `DERIVED.steerRateFast` is what is left at the
 * top end. A car that answers a key as fast at a hundred and sixty as at
 * twenty is a car with no weight in the steering, however good the tyre model
 * underneath is — which is why the panel offers the falloff separately, as
 * "steering weight at speed", rather than one sensitivity number.
 *
 * Worth knowing before touching them: the top-end rate was raised a long way
 * once the steering *lock* became speed-limited by the tyres rather than by a
 * table. Before that, the rate was doing two jobs — being a hand, and quietly
 * stopping a car that had four times too much lock from being flung sideways —
 * and the second job made it far too slow for the first. At the equivalent of
 * about a quarter of today's value it took the better part of a second to wind
 * on full lock at speed, which is twenty-seven metres of tunnel: long enough
 * that pointing the car at a gap felt like asking it to consider the idea.
 */
/** Coming *off* lock is always quicker than going on. Hands work that way. */
const RETURN_BONUS = 1.55

/** Seconds⁻¹ for each pedal, on and off. Off is quicker: a foot lifts fast. */
const GAS_ON = 11
const GAS_OFF = 14
const BRAKE_ON = 12
const BRAKE_OFF = 16

export function attachControls(surface: HTMLElement): RallyControls {
  /*
    Asked once, when the road opens, rather than every frame.

    It decides whether the throttle exists, and a throttle that could appear
    and disappear mid-race because a Bluetooth mouse woke up is worse than one
    that is simply wrong on a machine nobody is using.
  */
  const phone = drivingWithThumbs()
  let steer = 0
  let throttle = 0
  let brake = 0
  let engaged = false
  let last = performance.now()

  // --- keyboard ------------------------------------------------------------
  const held = new Set<string>()
  let keyBoost = false

  const onKeyDown = (event: KeyboardEvent) => {
    // Somebody typing is not somebody driving. Nothing in the race has a text
    // field in it today, but W and E are letters and this window listener
    // outlives any one screen.
    const focused = document.activeElement
    if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return

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
    if (BOOST_KEYS.has(key) && !held.has(key)) keyBoost = true
    held.add(key)
  }
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.key.toLowerCase())
  // A window that loses focus mid-corner leaves a key stuck down for ever.
  const onBlur = () => {
    held.clear()
    sides.clear()
    releaseThumbs()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  // --- thumbs --------------------------------------------------------------
  /*
    Which sides are being held, by pointer.

    A map rather than a single id because two fingers on the same side is a
    thing hands do — a second finger landing must not cancel the first, and
    lifting either must not cancel the other. Tracking them individually is
    four lines and removes a whole class of "the car kept turning" bug.
  */
  const sides = new Map<number, -1 | 1>()
  let touchBoost = false

  const onDown = (event: PointerEvent) => {
    // A steering hold is a game input, never the beginning of the browser's
    // long-press selection/callout gesture.
    event.preventDefault()
    engaged = true
    const rect = surface.getBoundingClientRect()
    const side = event.clientX - rect.left < rect.width * 0.5 ? -1 : 1
    sides.set(event.pointerId, side)
    surface.setPointerCapture(event.pointerId)
  }

  /*
    A finger that slides across the middle changes its mind.

    Without this, sweeping a thumb from one side to the other keeps steering
    the way it started until it is lifted, which is precisely the situation
    somebody is in when they have oversteered and are trying to catch it — the
    one moment the control must not argue.
  */
  const onMove = (event: PointerEvent) => {
    if (!sides.has(event.pointerId)) return
    const rect = surface.getBoundingClientRect()
    sides.set(event.pointerId, event.clientX - rect.left < rect.width * 0.5 ? -1 : 1)
  }

  const onUp = (event: PointerEvent) => {
    sides.delete(event.pointerId)
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
      /*
        Both sides at once is straight ahead, exactly like both arrow keys.

        Summing rather than taking the last one down, because a hand resting a
        second thumb on the far side of the screen is asking for neither, and
        a control that picks the most recent would give it a full-lock turn.
      */
      let sided = 0
      for (const side of sides.values()) sided += side
      const thumbed = Math.max(-1, Math.min(1, sided))
      thumb.steer = thumbed
      const wanted = keyed !== 0 ? keyed : thumbed

      /*
        Move toward the input at a hand's speed rather than snapping to it.

        A keyboard is a switch and a thumb is not, and this is the same easing
        for both so the two feel like the same machine. The wheels themselves
        lag again inside the physics, which is where the weight comes from;
        this is the arms.
      */
      const fast = Math.min(1, speed / 44)
      let rate = DERIVED.steerRate + (DERIVED.steerRateFast - DERIVED.steerRate) * fast
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
      /*
        The throttle, which on a phone is not a control at all.

        Still eased rather than pinned to 1, because the same easing is what
        gives the car its pick-up away from the lights — a throttle that is
        already fully open on the first frame of the race launches on a wheel
        of smoke that nobody asked for.
      */
      const gas = phone ? 1 : held.has('arrowup') || held.has('w') ? 1 : 0
      throttle += (gas - throttle) * (1 - Math.exp(-(gas > throttle ? GAS_ON : GAS_OFF) * dt))

      const pedal = held.has('arrowdown') || held.has('s') ? 1 : 0
      brake += (pedal - brake) * (1 - Math.exp(-(pedal > brake ? BRAKE_ON : BRAKE_OFF) * dt))

      const handbrake = thumb.handbrake || held.has(' ') || held.has('spacebar')

      const spend = keyBoost || touchBoost || thumb.boost
      keyBoost = false
      touchBoost = false
      thumb.boost = false
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
  ...BOOST_KEYS,
])
