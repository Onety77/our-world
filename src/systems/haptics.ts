/**
 * The one part of the garden you feel rather than see or hear.
 *
 * ---------------------------------------------------------------------------
 * Ember Rally has a car whose whole design is that everything it tells you is
 * *felt*: the ember is three lamps rather than a bar, the speed is the wind
 * and the walls, and the grip is weight moving across four tyres. The phone
 * has one more channel for exactly that kind of information and the garden was
 * not using it.
 *
 * **It is Android only, and that is fine here.** iOS gives a web page no
 * vibration API at all — Safari has never shipped one — so on an iPhone every
 * call in this file does nothing. That is not a gap to apologise for or to
 * work around; it is one of the two people getting a little more of the car
 * than the other, on a channel neither of them is told about.
 *
 * **Nothing in here is ever a notification.** The design law is explicit that
 * a room may be *more awake* but nothing may become an alert, and a phone
 * buzzing in a pocket because a thought arrived is the most alert thing this
 * world could possibly do. So these are only ever the physics of a car:
 * something the world did to you at the moment it happened, while you are
 * already holding the phone and looking at it.
 * ---------------------------------------------------------------------------
 */

/**
 * The vocabulary, in milliseconds, and it is deliberately small.
 *
 * A vibration motor has almost no dynamic range — the honest distinctions are
 * *a tick*, *a thump* and *a long one*, and anything more elaborate arrives as
 * mush. Each of these is named for the moment it belongs to rather than for
 * its shape, so a change to how a crash feels happens here and not in the
 * middle of the physics.
 */
export const FEEL = {
  /** One of the five countdown lights going out. */
  light: 12,
  /** The lights are out. Go. */
  away: [0, 26] as number[],
  /** Kerb, wall, or another car. Scaled by how hard — see `knock`. */
  knock: 18,
  /** The ember lights. */
  ember: [0, 10, 40, 22] as number[],
  /** Across the line. */
  finish: [0, 30, 60, 30, 60, 70] as number[],
} as const

function motor(): ((pattern: number | number[]) => boolean) | null {
  if (typeof navigator === 'undefined') return null
  const vibrate = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate
  return typeof vibrate === 'function' ? vibrate.bind(navigator) : null
}

/** Whether this phone has one. Nothing in the interface depends on knowing. */
export function canBeFelt(): boolean {
  return motor() !== null
}

/**
 * Buzz, if there is anything to buzz with.
 *
 * Never throws and never reports. A browser may also refuse silently — a page
 * that has not been touched yet, a tab that is not visible, a setting — and
 * every one of those is a car that feels the way it did last week.
 */
export function feel(pattern: number | number[]): void {
  const vibrate = motor()
  if (!vibrate) return
  try {
    vibrate(pattern)
  } catch {
    /* A phone that would rather not. */
  }
}

/**
 * A hit, at the weight it actually landed with.
 *
 * `force` is 0..1 — the physics already knows it, and a kerb and a wall
 * arriving as the same buzz would make the channel a light rather than an
 * instrument. Below a tenth nothing happens at all, because a tyre brushing a
 * kerb on the way through a corner is not an event and a phone that murmurs
 * continuously is a phone somebody switches off.
 */
export function knock(force: number): void {
  if (!(force > 0.1)) return
  feel(Math.round(FEEL.knock * Math.min(1, force) * 2.2))
}
