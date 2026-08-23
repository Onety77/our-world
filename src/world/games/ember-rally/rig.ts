/**
 * One car, as a hierarchy of groups.
 *
 * Split out of `Race.tsx` because two things build a car now: the race, and
 * the studio in `Studio.tsx` that puts one on a turntable so it can be looked
 * at without driving anywhere. Neither should own the arrangement.
 *
 * Every transform here is applied from outside, each frame, by whoever is
 * driving it — the physics for yours, a recording for hers, a script for the
 * studio. What lives in this file is only *where the parts are and what they
 * are allowed to move*.
 */

import { useMemo } from 'react'
import { BufferGeometry, Group, Mesh, Vector3, type Material } from 'three'
import {
  SPRING_MOUNT_Y,
  SPRING_POSITIONS,
  WHEEL_POSITIONS,
  WHEEL_RADIUS,
  buildCarShell,
  buildCoilover,
  buildWheel,
} from './car'
import { basisAt, roadPoint, type RoadBasis } from './geometry'
import type { CarState } from './physics'
import { emptyRoad, roadAt, type Track } from './track'

/** Everything `poseWheels` needs. The studio has no physics behind it. */
export type Posture = Pick<CarState, 'wheels' | 'roll' | 'pitch' | 'heave'>

// The shell, the wheel and the spring never change, so they are built once for
// the life of the tab. Lazily, though — nobody who never opens the Hollow
// should pay for a car they are not going to drive.
let shellGeometry: BufferGeometry | null = null
let wheelGeometry: BufferGeometry | null = null
let springGeometry: BufferGeometry | null = null
export function carGeometry() {
  shellGeometry ??= buildCarShell()
  wheelGeometry ??= buildWheel()
  springGeometry ??= buildCoilover()
  return { shell: shellGeometry, wheel: wheelGeometry, spring: springGeometry }
}

/** How long a coilover is at rest, from its top mount to the wheel centre. */
export const SPRING_SPAN = SPRING_MOUNT_Y - WHEEL_RADIUS

// ---------------------------------------------------------------------------
// One car
// ---------------------------------------------------------------------------

/**
 * A shell, four wheels and two beams, with somewhere for the weight to go.
 *
 * Every transform is applied from outside, each frame, by whoever is driving
 * it — the physics for yours, a recording for hers. What lives here is only
 * the arrangement: an outer group placed on the road, a body group that rolls
 * and pitches inside it, and four wheels that steer and spin.
 *
 * The body group is worth its fifteen lines. A car whose shell is rigid to the
 * road weighs nothing, whatever the tyre model underneath is doing; a car that
 * squats under power, dives under braking and leans into a corner has mass
 * before you have felt a single bend.
 */
export interface CarRig {
  root: Group
  /** Takes the *road's* tilt. Everything else hangs off it. */
  ground: Group
  /** The car's own roll, pitch and heave. Shell, springs and beams. */
  body: Group
  /** Steers. Sits on the road, not on the body. */
  hubs: Group[]
  /** Leans with the body. */
  cambers: Group[]
  /** Turns. */
  spinners: Group[]
  springs: Group[]
  spin: number[]
}

export function useCarRig(
  material: Material,
  wheelMaterials: Material[],
  beamGeometry: BufferGeometry,
  beamMaterial: Material,
): CarRig {
  const { shell, wheel, spring } = carGeometry()

  return useMemo<CarRig>(() => {
    const root = new Group()
    const ground = new Group()
    const body = new Group()
    root.add(ground)
    ground.add(body)

    const shellMesh = new Mesh(shell, material)
    shellMesh.frustumCulled = false
    body.add(shellMesh)

    /*
      **The wheels hang off the road, not off the body.**

      They used to be children of the body, which meant that when the shell
      leaned into a corner the wheels leaned with it — all four of them, by the
      same amount, pivoting about the middle of the car. So the outside pair
      dug into the stone and the inside pair hung in the air, and the harder
      the car cornered the more obviously it was one rigid object being tilted
      rather than a body sitting on springs.

      A real car rolls *over* its wheels. So: the hubs sit on the ground plane
      and take the steering; the body above them takes the roll, the pitch and
      the heave; and the springs between them stretch to cover the difference.
      That one change is most of what makes the new suspension visible at all.
    */
    const hubs: Group[] = []
    const cambers: Group[] = []
    const spinners: Group[] = []
    const springs: Group[] = []

    for (let i = 0; i < WHEEL_POSITIONS.length; i++) {
      const [x, y, z] = WHEEL_POSITIONS[i]
      const hub = new Group()
      hub.position.set(x, y, z)
      const camber = new Group()
      const spinner = new Group()
      const mesh = new Mesh(wheel, wheelMaterials[i] ?? material)
      mesh.frustumCulled = false
      spinner.add(mesh)
      camber.add(spinner)
      hub.add(camber)
      ground.add(hub)
      hubs.push(hub)
      cambers.push(camber)
      spinners.push(spinner)

      const coil = new Group()
      const coilMesh = new Mesh(spring, material)
      coilMesh.frustumCulled = false
      coil.add(coilMesh)
      const [sx, sy, sz] = SPRING_POSITIONS[i]
      coil.position.set(sx, sy, sz)
      body.add(coil)
      springs.push(coil)
    }

    // The beams hang off the *body*, not the root, so they roll with the car.
    // Hung off the root they stay level while the shell leans, and the light
    // in the shader — which is taken from the body — would disagree with the
    // cone you can see.
    for (const side of [-0.46, 0.46]) {
      const beam = new Mesh(beamGeometry, beamMaterial)
      beam.position.set(side, 0.62, 1.62)
      /*
        Squashed flat, and that is the whole trick.

        A round cone from a lamp sixty centimetres off the ground spends most
        of its length *below* the road, and where it cuts the surface it draws
        a hard bright wedge across it. Real dipped beams are wide and shallow
        for exactly the same reason, so this is a low ellipse — which stays
        above the stone for eleven metres and looks like light in the air
        rather than a triangle painted on the ground.
      */
      beam.scale.set(1, 0.32, 1)
      beam.frustumCulled = false
      beam.renderOrder = 4
      body.add(beam)
    }

    /*
      And the pod, as one long narrow shaft.

      Where the dipped beams are wide and flat, this is the opposite: tall,
      thin and stretched to nearly three times the length, so it reads as a
      column of light thrown down the tunnel rather than as a pool on the
      floor. It is the visible half of `spotAt` in `materials.ts`, and the two
      have to agree or the light on the rock arrives from somewhere the dust
      says it did not.
    */
    const shaft = new Mesh(beamGeometry, beamMaterial)
    shaft.position.set(0, 0.86, 1.5)
    shaft.scale.set(0.28, 0.34, 2.7)
    shaft.frustumCulled = false
    shaft.renderOrder = 4
    body.add(shaft)

    return { root, ground, body, hubs, cambers, spinners, springs, spin: [0, 0, 0, 0] }
  }, [shell, wheel, spring, material, wheelMaterials, beamGeometry, beamMaterial])
}

/**
 * Put the wheels where the physics says they are.
 *
 * All four of these come out of the tyre model rather than out of the speed,
 * and that is the whole difference. A wheel driven from "how fast is the car
 * going" is a wheel that keeps rolling perfectly while the car is sideways
 * with the handbrake on — which is the exact moment anybody is looking at it.
 */
export function poseWheels(rig: CarRig, car: Posture) {
  for (let i = 0; i < 4; i++) {
    const wheel = car.wheels[i]
    const hub = rig.hubs[i]
    // Steering, and the suspension travel. The hub rides on the road, so the
    // travel moves the wheel by only the small amount a bump would.
    hub.rotation.y = wheel.steer * 1.12
    hub.position.y = WHEEL_RADIUS + wheel.travel * 0.35

    /*
      Camber, from the body's roll.

      A leaning body pulls the top of each wheel over with it, less than
      one-for-one because that is what suspension geometry is *for*. It is a
      small angle and it does a lot: a car whose wheels stay bolt upright
      while the shell leans looks like a toy on a tilting board.
    */
    rig.cambers[i].rotation.z = car.roll * 0.55 + wheel.travel * 0.4

    // And the rotation, straight off the wheel's own angular velocity — so a
    // locked wheel stops dead and a spinning one outruns the road.
    rig.spinners[i].rotation.x = wheel.spin

    // The spring covers whatever is left between the body and the wheel.
    const [sx, , sz] = SPRING_POSITIONS[i]
    const lean = -car.roll * sx - car.pitch * sz
    const length = SPRING_SPAN + car.heave + lean - wheel.travel * 0.35
    rig.springs[i].scale.y = Math.max(0.55, Math.min(1.5, length / SPRING_SPAN))
  }
}

/**
 * Her wheels, from a recording.
 *
 * Nothing wrote her wheel speeds down — four numbers a sample is the whole
 * budget — so they turn at however fast she just moved, and lock when the
 * recording says she was on the brakes hard enough to be sliding. It is a
 * guess, but it is a guess made from something she actually did.
 */
export function poseGhostWheels(rig: CarRig, speed: number, drift: number, spinning: boolean, dt: number) {
  for (let i = 0; i < 4; i++) {
    const rear = i >= 2
    const rate = (rear && spinning ? speed * 1.7 : speed) / WHEEL_RADIUS
    rig.spin[i] += rate * dt
    rig.spinners[i].rotation.x = rig.spin[i]
    rig.cambers[i].rotation.z = drift * 0.12
    rig.hubs[i].position.y = WHEEL_RADIUS
    if (i < 2) rig.hubs[i].rotation.y = -drift * 0.4
  }
}

const placeRoad = emptyRoad()
export const shotRoad = emptyRoad()
export const flatBasis = (): RoadBasis => ({
  fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0,
})
const placeBasis = flatBasis()
export const shotBasis = flatBasis()
const placePoint = new Vector3()

/**
 * Put a car on the road.
 *
 * `psi` is the car's heading *relative to the road*, right-positive, so its
 * world heading is the road's heading minus that — the one place the racer's
 * right-positive convention meets the world's compass. See `track.ts`.
 */
export function placeCar(
  rig: CarRig,
  track: Track,
  s: number,
  n: number,
  psi: number,
  roll: number,
  pitch: number,
  heave = 0,
) {
  const road = roadAt(track, s, placeRoad)
  const basis = basisAt(road, placeBasis)
  roadPoint(road, n, 0, placePoint, basis)
  rig.root.position.copy(placePoint)
  rig.root.rotation.set(0, road.heading - psi, 0)
  /*
    Two tilts, and they belong to different things.

    The road's own bank and slope go on `ground`, which carries the wheels as
    well as the body — the whole car lies on the stone, so a banked hairpin
    must not have it standing bolt upright on a tilted floor. The car's own
    roll and pitch go on `body` alone, above the wheels, because that is a
    thing happening in the springs. Putting both on one group is what made the
    old car tilt its wheels into the rock every time it leaned.
  */
  rig.ground.rotation.set(-road.grade, 0, road.bank)
  rig.body.rotation.set(pitch, 0, roll)
  rig.body.position.y = heave
}

