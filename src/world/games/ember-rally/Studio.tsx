/**
 * The car, on a turntable.
 *
 * `?game=ember-rally&solo=1&rally=studio`
 *
 * ---------------------------------------------------------------------------
 * **Why this exists.**
 *
 * `?rally=car` already parks the camera beside the car and circles it, and it
 * was not enough. It circles the car *in the tunnel*, so looking at the machine
 * costs a whole road: a hundred and fifty thousand triangles of rock, a hundred
 * lanterns, the dust, and every one of those fragments running the full cave
 * lighting model. On real hardware that is fine. Under the software renderer
 * the screenshots are taken with it is **0.4 frames a second**, which means the
 * one part of this game that most needed looking at was the one part that could
 * not be looked at.
 *
 * So this draws the car and a piece of floor and nothing else, at thirty frames
 * a second, and it is worth its ninety lines twice over: once because it is the
 * only way to review the machine, and once because a car on a turntable doing
 * everything it can do is a genuinely nice thing to be able to show somebody.
 * ---------------------------------------------------------------------------
 *
 * It is not a screensaver. Every moving part is wired to the same uniform the
 * race drives it with, so what you are looking at is the real car: the wheels
 * steer and spin, the springs compress, the body leans on them, the discs come
 * up cherry under braking — **fronts before rears**, because the weight has
 * gone forward — and the tail fills one lamp at a time as the ember does. If
 * something is wrong with the car it is wrong here too.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute,
  CircleGeometry,
  CylinderGeometry,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import { WHEEL_RADIUS } from './car'
import {
  createLights,
  useBeamMaterial,
  useCarMaterial,
  useRockMaterial,
  useWheelMaterials,
} from './materials'
import { poseWheels, useCarRig, type Posture } from './rig'

export const STUDIO =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('rally') === 'studio'

/**
 * `&at=12.5` pins the turntable to one moment instead of letting it run.
 *
 * The same argument as `?hour=` in the garden, and here it is not a
 * convenience but the only thing that works. Every frame advances the clock by
 * at most a sixtieth of a second — the cap that stops a backgrounded tab
 * simulating four minutes at once — so on a renderer taking twenty seconds a
 * frame the turntable moves about a degree an hour. Waiting for the angle you
 * want is not a plan. Asking for it is.
 */
const PINNED = (() => {
  if (typeof location === 'undefined') return null
  const raw = new URLSearchParams(location.search).get('at')
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
})()

/** Seconds for one turn of the table, and for one pass of the script. */
const TURN = 26
const SCRIPT = 13

/** A wheel with nothing behind it but the script below. */
function blankWheel() {
  return {
    steer: 0,
    omega: 0,
    spin: 0,
    load: 2400,
    slipAngle: 0,
    slipRatio: 0,
    used: 0,
    travel: 0,
    // The turntable eases its own travel rather than running the car's spring,
    // so this is only here to satisfy the shape.
    travelVel: 0,
    heat: 0,
  }
}

export function CarStudio() {
  const { camera } = useThree()

  const lights = useMemo(() => createLights(), [])
  const rock = useRockMaterial(lights)
  const shell = useCarMaterial(lights, 'mine')
  const wheels = useWheelMaterials(lights, 'mine')
  const beamMaterial = useBeamMaterial(lights, '#ffcf96')

  const beamGeometry = useMemo(() => {
    const geo = new CylinderGeometry(2.2, 0.09, 13, 14, 1, true)
    geo.rotateX(Math.PI / 2)
    geo.translate(0, 0, 6.5)
    return geo
  }, [])
  useEffect(() => () => beamGeometry.dispose(), [beamGeometry])

  /*
    A piece of floor, in the rock's own material.

    Lit by exactly the same block as the tunnel is, so the brass reads the way
    it reads down there rather than the way it reads under a studio light. It
    needs the two attributes the rock shader expects; a plain colour and a
    little roughness are all that is wanted.
  */
  const ground = useMemo(() => {
    const geo = new CircleGeometry(26, 48)
    geo.rotateX(-Math.PI / 2)
    const count = geo.attributes.position.count
    const colour = new Float32Array(count * 3)
    const surface = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      colour[i * 3] = 0.1
      colour[i * 3 + 1] = 0.093
      colour[i * 3 + 2] = 0.088
      surface[i * 2] = 0.12
      surface[i * 2 + 1] = 0.85
    }
    geo.setAttribute('aColor', new BufferAttribute(colour, 3))
    geo.setAttribute('aSurface', new BufferAttribute(surface, 2))
    return geo
  }, [])
  useEffect(() => () => ground.dispose(), [ground])

  const rig = useCarRig(shell, wheels, beamGeometry, beamMaterial)

  const posture = useRef<Posture>({
    wheels: [blankWheel(), blankWheel(), blankWheel(), blankWheel()],
    roll: 0,
    pitch: 0,
    heave: 0,
  })
  const clock = useRef(0)
  const at = useRef(new Vector3())

  useEffect(() => {
    const perspective = camera as PerspectiveCamera
    const was = perspective.fov
    perspective.fov = 34
    perspective.updateProjectionMatrix()
    return () => {
      perspective.fov = was
      perspective.updateProjectionMatrix()
    }
  }, [camera])

  /*
    Three lamps standing round it.

    The car is behind its own headlights and lights almost none of itself — see
    the note on `CAR_FRAG` — so in a room with nothing else in it the whole
    machine is a silhouette. Two warm ones at the front quarters and one cool
    one behind is the oldest lighting setup there is, and it uses the lantern
    slots the tunnel already has rather than inventing a studio light nothing
    else in the game would understand.
  */
  useEffect(() => {
    const set = (slot: number, x: number, y: number, z: number, r: number, tint: number[]) => {
      lights.lamps[slot * 4] = x
      lights.lamps[slot * 4 + 1] = y
      lights.lamps[slot * 4 + 2] = z
      lights.lamps[slot * 4 + 3] = r
      lights.lampColors[slot * 3] = tint[0]
      lights.lampColors[slot * 3 + 1] = tint[1]
      lights.lampColors[slot * 3 + 2] = tint[2]
    }
    // Warm and strong enough to find the wood. The body is oiled boards and a
    // cool key light turns them into grey panels, which is a different car.
    set(0, -4.6, 3.4, 3.2, 15, [1.9, 1.12, 0.54])
    set(1, 5.0, 2.6, 1.4, 13, [1.35, 0.76, 0.36])
    set(2, 0.4, 3.0, -6.2, 14, [0.5, 0.68, 1.05])
    for (let slot = 3; slot < 10; slot++) set(slot, 0, -99, 0, 0.0001, [0, 0, 0])
  }, [lights])

  useFrame((_, rawDelta) => {
    const delta = Math.min(0.06, rawDelta)
    clock.current += delta
    const t = PINNED ?? clock.current
    /*
      Pinned means *settled*, not frozen at zero.

      Everything below eases toward its target, so a pinned frame drawn from a
      standing start shows the pose a twentieth of a second into it. On the
      first pinned frame the easings are run forward until they have arrived,
      which costs nothing and is the difference between a screenshot of the car
      braking and a screenshot of the car about to brake.
    */
    const settle = PINNED !== null && clock.current < 0.2 ? 60 : 1
    const beat = (t % SCRIPT) / SCRIPT
    const body = posture.current

    /*
      The script.

      Two things happen on a loop and everything else follows from them: the
      car steers left and right, and twice a lap it is braked hard. That is
      enough to show every part moving, because the parts are wired to each
      other the way they are in the race — brake and the nose dives, which
      moves load onto the front wheels, which compresses the front springs and
      lights the front discs first.
    */
    const steer = Math.sin(t * 0.62) * 0.42
    const brake = beat > 0.34 && beat < 0.5 ? 1 : beat > 0.78 && beat < 0.86 ? 0.7 : 0
    const rolling = 16 + Math.sin(t * 0.31) * 9
    const ember = (t % 20) / 20

    body.pitch += (-brake * 0.075 - body.pitch) * (1 - Math.exp(-6 * delta * settle))
    body.roll += (steer * 0.2 - body.roll) * (1 - Math.exp(-5 * delta * settle))
    body.heave += (-brake * 0.01 - body.heave) * (1 - Math.exp(-5 * delta * settle))

    for (let i = 0; i < 4; i++) {
      const wheel = body.wheels[i]
      const front = i < 2
      wheel.steer = front ? steer * 0.5 : 0
      // Weight forward under braking, and outward with the lean.
      const load = (front ? 0.5 + brake * 0.4 : 0.5 - brake * 0.4) * (1 + (i % 2 === 0 ? -1 : 1) * body.roll * 1.6)
      wheel.travel += ((load - 0.5) * 0.1 - wheel.travel) * (1 - Math.exp(-8 * delta * settle))
      // A hard brake locks the fronts, which is why they stop turning.
      const locked = front && brake > 0.9
      wheel.spin += (locked ? 0 : rolling / WHEEL_RADIUS) * delta
      const work = brake * (front ? 1 : 0.55)
      wheel.heat += (work - wheel.heat) * (1 - Math.exp(-(0.5 + work * 2.6) * delta * settle))
      const material = wheels[i]
      if (material) material.uniforms.uDisc.value = wheel.heat
    }

    poseWheels(rig, body)
    rig.root.position.set(0, 0, 0)
    rig.root.rotation.set(0, 0, 0)
    rig.ground.rotation.set(0, 0, 0)
    rig.body.rotation.set(body.pitch, 0, body.roll)
    rig.body.position.y = body.heave

    shell.uniforms.uGlow.value = ember
    shell.uniforms.uBrake.value = brake
    shell.uniforms.uPipe.value = ember > 0.94 ? 1 : 0

    // Where the light is actually coming from, taken off the rig — so when the
    // nose dives the beams dip into the floor exactly as they do on the road.
    rig.root.updateMatrixWorld(true)
    lights.headLeft.set(-0.46, 0.62, 1.66).applyMatrix4(rig.body.matrixWorld)
    lights.headRight.set(0.46, 0.62, 1.66).applyMatrix4(rig.body.matrixWorld)
    lights.spot.set(0, 0.86, 1.56).applyMatrix4(rig.body.matrixWorld)
    at.current.set(0, 0, 1).transformDirection(rig.body.matrixWorld).normalize()
    lights.headDir.copy(at.current)
    lights.uniforms.uTime.value = t
    lights.uniforms.uEmberPos.value.set(0, 0.5, -1.9)
    lights.uniforms.uEmberPower.value = 0.7 + ember * 0.8
    lights.uniforms.uGhostPower.value = 0

    // --- the turntable -------------------------------------------------------
    // A low orbit that rises and falls a little, so it passes through the two
    // views that matter: along the flank, and down over the shoulder.
    const angle = (t / TURN) * Math.PI * 2
    const radius = 6.1
    camera.position.set(
      Math.sin(angle) * radius,
      1.35 + Math.sin(t * 0.17) * 0.75 + 0.4,
      Math.cos(angle) * radius,
    )
    camera.lookAt(0, 0.62, 0)
  })

  return (
    <>
      <color attach="background" args={['#050403']} />
      <mesh geometry={ground} material={rock} position={[0, -0.002, 0]} />
      <primitive object={rig.root} />
    </>
  )
}
