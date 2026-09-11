/**
 * Standing the car on the drawn road.
 *
 * ---------------------------------------------------------------------------
 * Render-only. Nothing here reads back into `CarState`, the tyre model or the
 * controls: the physics decides where the car *is* along and across the road,
 * and this decides where the picture of it sits on the picture of the road.
 *
 * Two steps, in the order the rig is built:
 *
 *   **the stance.** The drawn surface is sampled under all four wheel centres
 *   and the `ground` group — the road's tilt, which the wheels hang off — is
 *   fitted to those four heights: a plane, with the car's compass heading kept
 *   exactly as the simulation has it. So on a banked hairpin the car leans with
 *   the drawn bank and not with the one written in the notes, and on the
 *   Swaying Span it rolls with the boards on this frame.
 *
 *   **the tyres.** After steering and camber, each tyre — as the rings of its
 *   own lathe, shoulders and tread blocks, read off the wheel geometry — is
 *   settled against the surface under it, and the hub slides along the
 *   suspension until the lowest part of the tyre just touches. The spring
 *   above it stretches to follow. That is what puts a cambered outside tyre on
 *   its shoulder and an inside one on its tread, on a crowned road, to about a
 *   millimetre — the rest is the flats of a forty-eight-sided wheel.
 *
 * The surface comes from `roadSurface`, which is the rendered mesh itself. A
 * wheel with nothing marked under it — off the edge of the world, or in the
 * car studio where there is no road — keeps its resting height.
 * ---------------------------------------------------------------------------
 */

import { Matrix4, Quaternion, Vector3 } from 'three'
import { buildWheel, SPRING_MOUNT_Y, SPRING_POSITIONS, WHEEL_POSITIONS, WHEEL_RADIUS } from './car'
import type { CarRig } from './rig'
import { surfaceOf, type RoadSurface, type Support } from './roadSurface'
import type { Track } from './track'

/**
 * How far above or below the road's written height a drawn surface may be and
 * still be the one under this car. Wide enough for the bank of any hairpin and
 * the crest of the span; narrow enough that a road twenty metres overhead or
 * thirty underneath is never mistaken for this one.
 */
const WINDOW = 1.8

interface Contact {
  surface: RoadSurface
  /** Metres along the road, so the surface answers for this stretch and not one crossing it. */
  s: number
  elapsed: number
  /** The stance last frame — height and slopes in the root's frame — and when. */
  height: number
  dx: number
  dz: number
  fitted: number
}

/**
 * How quickly the body follows the ground it is fitted to, in seconds.
 *
 * The tyres are settled on the drawn road exactly, every frame. The body is
 * not: the Rootway's floor is drawn with a couple of centimetres of grain in
 * it, and a car whose whole body hopped with every grain at sixty frames a
 * second read as a rendering fault. So the fit eases, and the suspension takes
 * up the difference — which is what suspension is. Short enough that a crest
 * or a bank is still followed within a car's length.
 */
const SETTLE = 0.05
/** Where the tyre meets the road, ahead of and behind the wheel's centre, for the stance. */
const FOOTPRINT = 0.22

const contacts = new WeakMap<CarRig, Contact>()
const point = new Vector3()
const up = new Vector3()
const forward = new Vector3()
const right = new Vector3()
const rotation = new Matrix4()
const inverse = new Quaternion()
const heights = new Float64Array(4)
const support: Support = { y: 0, dx: 0, dz: 0 }

/**
 * Fit the car's road frame to what is drawn under its four wheels.
 *
 * Called from `placeCar` after the written-down placement, which it refines:
 * the root keeps its position along and across the road and its heading, and
 * only `ground` — tilt and height — is moved.
 */
export function placeTyreContact(rig: CarRig, track: Track, s: number, drop: number, elapsed: number) {
  rig.ground.position.set(0, 0, 0)
  const surface = drop === 0 ? surfaceOf(track) : undefined
  if (!surface) {
    contacts.delete(rig)
    return
  }
  let contact = contacts.get(rig)
  if (!contact) {
    contact = { surface, s, elapsed, height: 0, dx: 0, dz: 0, fitted: NaN }
    contacts.set(rig, contact)
  }
  contact.surface = surface
  contact.s = s
  contact.elapsed = elapsed

  /*
    The written height is the root's, at the middle of the road. A wheel on the
    high side of a bank sits well above it and one in a dip below, and that is
    what the window is for.

    Under each wheel, the highest of three points along its footprint rather
    than the one under its centre: a tyre bridges the gap between two boards
    of the span, and a centre point does not.
  */
  const near = rig.root.position.y
  forward.set(0, 0, 1).applyQuaternion(rig.root.quaternion)
  let missing = -1
  let found = 0
  for (let i = 0; i < 4; i++) {
    const [x, , z] = WHEEL_POSITIONS[i]
    point.set(x, 0, z).applyQuaternion(rig.root.quaternion).add(rig.root.position)
    let best = -Infinity
    for (let k = -1; k <= 1; k++) {
      reach.copy(point).addScaledVector(forward, k * FOOTPRINT)
      if (surface.supportAt(reach.x, reach.z, s, near, WINDOW, elapsed, support)) best = Math.max(best, support.y)
    }
    if (best > -Infinity) {
      heights[i] = best - near
      found++
    } else {
      missing = i
    }
  }
  /*
    A wheel with nothing drawn under it — over the lip of the verge on a road
    whose edge is the edge of the world. One can be taken from the other three,
    since four wheels on a plane are a parallelogram; fewer than three and the
    car stays where the notes put it.
  */
  if (found < 3) {
    contacts.delete(rig)
    return
  }
  if (found === 3) heights[missing] = heights[missing ^ 1] + heights[missing ^ 2] - heights[missing ^ 3]

  const halfTrack = WHEEL_POSITIONS[1][0]
  const front = WHEEL_POSITIONS[0][2]
  const rear = WHEEL_POSITIONS[2][2]
  let dx = (heights[1] + heights[3] - heights[0] - heights[2]) / (4 * halfTrack)
  let dz = (heights[0] + heights[1] - heights[2] - heights[3]) / (2 * (front - rear))
  let height = (heights[0] + heights[1] + heights[2] + heights[3]) / 4 - (dz * (front + rear)) / 2

  // Eased from last frame's fit, unless this is a new frame's worth of nowhere
  // near it: a restart, a rewind, or the first frame.
  const dt = elapsed - contact.fitted
  if (dt > 0 && dt < 0.5 && Math.abs(height - contact.height) < 0.25) {
    const ease = 1 - Math.exp(-dt / SETTLE)
    height = contact.height + (height - contact.height) * ease
    dx = contact.dx + (dx - contact.dx) * ease
    dz = contact.dz + (dz - contact.dz) * ease
  }
  contact.height = height
  contact.dx = dx
  contact.dz = dz
  contact.fitted = elapsed

  up.set(-dx, 1, -dz).normalize().applyQuaternion(rig.root.quaternion)
  forward.set(0, 0, 1).applyQuaternion(rig.root.quaternion)
  // Keep the simulation's compass heading exactly; only add the road's pitch.
  forward.y = -(up.x * forward.x + up.z * forward.z) / up.y
  forward.normalize()
  right.crossVectors(up, forward).normalize()
  rotation.makeBasis(right, up, forward)
  inverse.copy(rig.root.quaternion).invert()
  rig.ground.quaternion.setFromRotationMatrix(rotation).premultiply(inverse)
  rig.ground.position.y = height
}

/**
 * The tyre as rings: for each width across the rubber, how far out it reaches.
 *
 * A wheel is a lathe, and a lathe against a plane touches along a circle, so
 * the whole of the tyre's silhouette — shoulders, tread blocks and all — is a
 * handful of (across, radius) pairs. Read off the wheel's own geometry rather
 * than written down again here, so a new tread means new rings.
 */
let rings: Float32Array | undefined
function tyreRings() {
  if (rings) return rings
  const geometry = buildWheel()
  const positions = geometry.getAttribute('position')
  const reach = new Map<number, number>()
  let widest = 0
  for (let i = 0; i < positions.count; i++) {
    const r = Math.hypot(positions.getY(i), positions.getZ(i))
    // The rim and everything inside it never touch the road.
    if (r < 0.3) continue
    const x = Math.round(positions.getX(i) * 1000) / 1000
    reach.set(x, Math.max(reach.get(x) ?? 0, r))
    widest = Math.max(widest, r)
  }
  geometry.dispose()
  // A ring more than a few millimetres inside the widest cannot touch a road
  // a wheel is ever this nearly upright on.
  const kept: number[] = []
  for (const [x, r] of reach) if (r > widest - 0.004) kept.push(x, r)
  rings = new Float32Array(kept)
  return rings
}

const axle = new Vector3()
const centre = new Vector3()
const normal = new Vector3()
const down = new Vector3()
const tangent = new Vector3()
const reach = new Vector3()

/**
 * Settle each tyre on the surface. Run after steering, camber and spin, so it
 * is the tyre's final silhouette that is supported.
 */
export function poseTyreContact(rig: CarRig) {
  const contact = contacts.get(rig)
  if (!contact) return
  const { surface, s, elapsed } = contact
  const tyre = tyreRings()
  rig.root.updateMatrixWorld(true)
  const elements = rig.ground.matrixWorld.elements
  up.set(elements[4], elements[5], elements[6])
  const near = rig.root.position.y

  for (let i = 0; i < 4; i++) {
    const hub = rig.hubs[i]
    rig.spinners[i].updateWorldMatrix(true, false)
    const m = rig.spinners[i].matrixWorld.elements
    // The axle is the spinner's own x, which carries the steer and the camber.
    axle.set(m[0], m[1], m[2]).normalize()
    centre.set(m[12], m[13], m[14])
    /*
      Twice, because moving the hub along the suspension moves the tyre, on a
      bank slightly across the road as well as up, and the surface under the
      point that touches can change with it — a seam, or a board's edge.
    */
    for (let pass = 0; pass < 2; pass++) {
      let lift = -Infinity
      for (let k = 0; k < tyre.length; k += 2) {
        const across = tyre[k]
        const radius = tyre[k + 1]
        point.copy(centre).addScaledVector(axle, across)
        /*
          The bottom of this ring, and the arc either side of it.

          Straight down is where it touches a plane it is upright on. Against
          a banked road the touching point is round the ring a little, and on
          the span's boards the surface under one ring is not one plane at
          all — a tyre steered across the deck sits over a board and the gap
          beside it. So the arc is sampled every ten degrees for forty either
          way, each point against the surface under *it*, and the highest
          demand wins. Between samples the ring is at most a millimetre or so
          inside the truth, which is less than the flats of the drawn wheel.
        */
        normal.set(0, 1, 0)
        down.copy(normal).addScaledVector(axle, -normal.dot(axle))
        if (down.lengthSq() < 1e-12) continue
        down.normalize().negate()
        tangent.crossVectors(axle, down)
        for (let step = -4; step <= 4; step++) {
          const angle = step * 0.1745
          reach.copy(point).addScaledVector(down, radius * Math.cos(angle)).addScaledVector(tangent, radius * Math.sin(angle))
          if (!surface.supportAt(reach.x, reach.z, s, near, WINDOW, elapsed, support)) continue
          const separation = support.y - reach.y
          // How much a metre along the suspension raises this point off the plane.
          const along = up.y - support.dx * up.x - support.dz * up.z
          if (along > 0.1) lift = Math.max(lift, separation / along)
        }
      }
      if (!Number.isFinite(lift)) break
      hub.position.y += lift
      centre.addScaledVector(up, lift)
      if (Math.abs(lift) < 0.0002) break
    }
    // The top mount belongs to the rolling body; the bottom follows this hub.
    const spring = rig.springs[i]
    const [sx, sy, sz] = SPRING_POSITIONS[i]
    rig.body.updateMatrix()
    point.set(sx, sy, sz).applyMatrix4(rig.body.matrix)
    const span = SPRING_MOUNT_Y - WHEEL_RADIUS
    spring.scale.y = Math.max(0.5, Math.min(1.7, (point.y - hub.position.y) / span))
  }
  rig.root.updateMatrixWorld(true)
}
