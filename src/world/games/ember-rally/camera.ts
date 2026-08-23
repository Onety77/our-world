/**
 * Where you watch the race from.
 *
 * The one decision that matters here: **the camera rides the road, not the
 * car.** It sits at a point some distance back along the centreline, at a
 * lateral offset that follows the car lazily, and looks at a point some
 * distance ahead along the same centreline.
 *
 * A camera hung behind the car in world space is the obvious way to do it and
 * it is wrong in a tunnel. It swings wide on every corner and buries itself in
 * the rock; it whips when the car goes sideways; and it needs a collision
 * system of its own to stop doing both. Riding the road, it is inside the
 * tunnel by construction, it leans into corners because the road does, and it
 * gets the long swooping arc through a hairpin for free.
 *
 * What is left is the feel, and that is four things:
 *
 *   the drift shows    the camera slides *against* the slide, so when the back
 *                      steps out you are looking at the car's flank
 *   speed opens up     the field of view widens, the camera drops, the walls
 *                      come closer to the edges of the frame
 *   the road tilts     roll from the banking and from lateral load
 *   the rock hits      shake, from the surface, from stones and from the wall
 */

import type { PerspectiveCamera } from 'three'
import { Vector3 } from 'three'
import { basisAt, roadPoint } from './geometry'
import { TOP_SPEED, slipOf, speedOf, type CarState } from './physics'
import { emptyRoad, roadAt, type RoadAt, type Track } from './track'

const FOV_STILL = 60
const FOV_FLAT_OUT = 82

/**
 * How much of a phone this is.
 *
 * 0 on a laptop, 1 on a phone held upright, and it matters more here than
 * anywhere else in the garden. **The field of view is vertical**, so a portrait
 * screen keeps the whole vertical angle and throws away the horizontal: at
 * 390×844 a sixty-degree camera has *thirty* degrees of horizontal view, which
 * is a telephoto lens. The tunnel walls fall outside the frame, the car ends up
 * the size of a thumbnail in the middle of a tall black picture, and none of it
 * is anybody's fault but the projection's.
 *
 * The fix is not one number. On a phone the camera comes in closer, drops, and
 * opens right up — and the road is aimed higher so the car sits low in the
 * frame with the tunnel running away above it, which is the only composition
 * that uses a tall screen for anything.
 */
function portraitAmount(aspect: number): number {
  return Math.min(1, Math.max(0, (1.15 - aspect) / 0.55))
}

/**
 * `?rally=car` parks the camera beside the car and circles it slowly.
 *
 * The same reasoning as `?hour=` and `?section=` in the garden: "drive until
 * you can see it" is not a check anybody can repeat, and the car is the one
 * thing in the race you otherwise only ever see from directly behind. It also
 * makes the shell reviewable without playing.
 */
const INSPECT =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('rally') === 'car'

export class ChaseCamera {
  /** Smoothed lateral offset of the camera, metres right of the middle. */
  private lateral = 0
  private back = 6
  private lift = 2.1
  private roll = 0
  private fov = FOV_STILL
  private shake = 0
  private orbit = 0
  private readonly here = new Vector3()
  private readonly target = new Vector3()
  private readonly road: RoadAt = emptyRoad()
  private started = false

  /** Knock it about. Called on stones, walls and hard landings. */
  jolt(amount: number) {
    this.shake = Math.min(1.4, this.shake + amount)
  }

  reset() {
    this.started = false
    this.shake = 0
  }

  update(
    camera: PerspectiveCamera,
    track: Track,
    car: CarState,
    dt: number,
    /** 0 before the flag, 1 once the race is running — see the opening move. */
    engagement = 1,
    /**
     * 0 while racing, 1 once it is over.
     *
     * Lifts the camera, stands it back and drops its aim, which floats the car
     * up into the top half of the frame — and leaves the near road clear for
     * the time to be written across. The result is laid over a car that is
     * still rolling, so the two have to be composed together rather than one
     * being dropped on top of the other.
     */
    settle = 0,
  ) {
    const v = speedOf(car)
    const fast = Math.min(1, v / TOP_SPEED)
    const slip = slipOf(car)
    const ease = (rate: number) => 1 - Math.exp(-rate * dt)

    if (INSPECT) {
      this.orbit += dt * 0.35
      const radius = 5.6
      roadAt(track, car.s + Math.cos(this.orbit) * radius, this.road)
      roadPoint(this.road, Math.sin(this.orbit) * radius, 1.5, this.here, basisAt(this.road))
      camera.position.copy(this.here)
      roadAt(track, car.s, this.road)
      roadPoint(this.road, car.n, 0.66, this.target, basisAt(this.road))
      camera.lookAt(this.target)
      if (camera.fov !== 34) {
        camera.fov = 34
        camera.updateProjectionMatrix()
      }
      return
    }

    /*
      Against the slide.

      When the back steps out to the right, the camera moves left, so the car
      turns across the frame and you can see down its side. This is the only
      way a chase camera ever shows a drift — a camera that stays dead behind
      the car shows you a car that is pointing where it is going, which is the
      one thing a drifting car is not doing.
    */
    const wantLateral = car.n * 0.72 - slip * 2.1
    this.lateral += (wantLateral - this.lateral) * ease(4.6)

    // Far enough back to see the whole car and the road under it. Closer than
    // this and the bonnet is the frame; further and the tunnel stops being
    // tight around you, which is the entire feeling down here.
    const phone = portraitAmount(camera.aspect)
    const wantBack =
      (7.6 + fast * 2.2 + (car.boostLeft > 0 ? 1 : 0)) * (1 - phone * 0.38) * (1 + settle * 0.5)
    const wantLift = (2.55 - fast * 0.5) * (1 - phone * 0.2) * (1 + settle * 0.75)
    this.back += (wantBack - this.back) * ease(2.4)
    this.lift += (wantLift - this.lift) * ease(3)

    // --- where it sits -------------------------------------------------------
    const behind = Math.max(0, car.s - this.back * (0.4 + engagement * 0.6))
    roadAt(track, behind, this.road)
    const basis = basisAt(this.road)
    roadPoint(this.road, this.lateral, this.lift, this.here, basis)

    // --- what it looks at ----------------------------------------------------
    // Ahead of the car, and biased toward the racing line, so the corner opens
    // up before you arrive at it rather than after.
    const lookAhead = car.s + 11 + fast * 15
    roadAt(track, lookAhead, this.road)
    const aimBasis = basisAt(this.road)
    const aimLateral = car.n * 0.45 + this.road.line * 0.4
    // Aimed higher on a phone, which pushes the car down the frame and gives
    // the tall screen the receding tunnel to fill itself with.
    roadPoint(this.road, aimLateral, 1.35 + phone * 1.5 - settle * 1.6, this.target, aimBasis)

    if (!this.started) {
      this.started = true
      camera.position.copy(this.here)
    } else {
      // A last light smoothing on the position itself. The road-following
      // above is already smooth; this only takes the edge off the frames where
      // the car crosses a band boundary.
      camera.position.lerp(this.here, ease(18))
    }

    // --- roll ----------------------------------------------------------------
    const lateralLoad = Math.max(-1, Math.min(1, car.yaw * v * 0.055))
    const wantRoll = -this.road.bank * 0.55 - lateralLoad * 0.055
    this.roll += (wantRoll - this.roll) * ease(4)

    // --- shake ---------------------------------------------------------------
    // Loose ground rumbles continuously; everything else is a hit that decays.
    if (car.rough) this.shake = Math.min(1.4, this.shake + dt * fast * 2.6)
    this.shake *= Math.exp(-4.4 * dt)
    const amount = this.shake * 0.055

    camera.lookAt(this.target)
    camera.rotateZ(this.roll)
    if (amount > 0.0004) {
      camera.position.x += (Math.random() - 0.5) * amount
      camera.position.y += (Math.random() - 0.5) * amount * 0.7
      camera.position.z += (Math.random() - 0.5) * amount
      camera.rotateZ((Math.random() - 0.5) * amount * 0.6)
    }

    // --- field of view -------------------------------------------------------
    const wantFov =
      FOV_STILL +
      (FOV_FLAT_OUT - FOV_STILL) * fast +
      (car.boostLeft > 0 ? 5 : 0) +
      // Opened right up on a phone to buy back some horizontal view. It costs
      // vertical distortion at the edges, and in a tube nobody sees it.
      phone * 21
    this.fov += (wantFov - this.fov) * ease(2.6)
    if (Math.abs(camera.fov - this.fov) > 0.05) {
      camera.fov = this.fov
      camera.updateProjectionMatrix()
    }
  }
}

// ---------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------

export type ShotKind = 'chase' | 'trackside' | 'low' | 'chamber' | 'nose'

export interface Shot {
  kind: ShotKind
  /** Seconds into the replay this shot begins. */
  at: number
  /** Which car it is framed on. */
  on: 'mine' | 'theirs'
  /** Where trackside shots stand, metres along and off the road. */
  s: number
  n: number
}

/**
 * Cut the replay before it runs.
 *
 * A director that decides shot by shot as it goes always cuts a beat late,
 * because the interesting thing has already happened by the time it can be
 * noticed. Both runs are already known here, so the whole thing is planned
 * against the actual gap between the two cars: cut *to* the overtake, not
 * after it.
 */
export function planShots(
  gapAt: (t: number) => number,
  duration: number,
): Shot[] {
  const shots: Shot[] = []
  const step = 0.25

  // Where the lead changes hands, and where they are closest.
  const events: number[] = []
  let previous = Math.sign(gapAt(0))
  let closest = { t: 0, gap: Infinity }
  for (let t = step; t < duration; t += step) {
    const gap = gapAt(t)
    const side = Math.sign(gap)
    if (side !== 0 && side !== previous && previous !== 0) events.push(t)
    if (Math.abs(gap) < closest.gap && t > 2) closest = { t, gap: Math.abs(gap) }
    previous = side
  }
  if (!events.includes(closest.t) && Number.isFinite(closest.gap)) events.push(closest.t)
  events.sort((a, b) => a - b)

  let at = 0
  let kindIndex = 0
  const rotation: ShotKind[] = ['chase', 'trackside', 'low', 'chamber', 'nose']

  while (at < duration - 0.5) {
    // Cut two seconds before whatever is about to happen, and hold through it.
    const next = events.find((e) => e > at + 1.6)
    const hold = next !== undefined ? Math.min(5.5, Math.max(2.4, next - at - 1.4)) : 3.6
    const kind: ShotKind =
      next !== undefined && next - at < 3 ? 'trackside' : rotation[kindIndex % rotation.length]
    kindIndex++
    shots.push({
      kind,
      at,
      on: shots.length % 3 === 2 ? 'theirs' : 'mine',
      s: 0,
      n: 0,
    })
    at += hold
  }

  // The last shot is always the fire, from the side, both cars arriving.
  shots.push({ kind: 'trackside', at: Math.max(0, duration - 2.6), on: 'mine', s: 0, n: 0 })
  return shots
}
