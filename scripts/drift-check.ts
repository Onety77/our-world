import assert from 'node:assert/strict'
import { PerspectiveCamera } from 'three'
import { flatTrack } from './rally-fixture'
import { ChaseCamera } from '../src/world/games/ember-rally/camera'
import { advanceCar, createCar, slipOf, speedOf, wallAt, type CarInput, type CarState } from '../src/world/games/ember-rally/physics'

const DT = 1 / 120
const gas: CarInput = { throttle: 1, brake: 0, steer: 0, handbrake: false, boost: false }
const road = flatTrack(12000)
road.width.fill(10000)
function moving(speed = 25) {
  const car = createCar(road)
  for (let i = 0; i < 3600 && speedOf(car) < speed; i++) advanceCar(road, car, gas, DT)
  assert(speedOf(car) >= speed)
  return car
}
function run(car: CarState, seconds: number, input: Partial<CarInput> = {}, track = road) {
  for (let i = 0; i < Math.round(seconds / DT); i++) advanceCar(track, car, { ...gas, ...input }, DT)
}
function enter(car: CarState, side = 1) {
  run(car, 0.22, { steer: side * 0.65, handbrake: true })
}
function check(name: string, test: () => void) {
  test()
  console.log(`PASS ${name}`)
}
function degrees(car: CarState) { return slipOf(car) * 180 / Math.PI }

check('a tap carries a sustained, powered drift in either direction', () => {
  for (const side of [-1, 1]) {
    const car = moving()
    enter(car, side)
    run(car, 1, { steer: side * 0.65 })
    for (let i = 0; i < 480; i++) {
      advanceCar(road, car, { ...gas, steer: side * 0.65 }, DT)
      assert(-side * degrees(car) > 27 && -side * degrees(car) < 42)
      assert(speedOf(car) > 19, 'drift loses its momentum')
      assert(car.steerAngle * side < -0.25, 'front wheels must visibly countersteer')
      assert(!car.touching)
    }
    console.log(`  ${side < 0 ? 'left' : 'right'}: ${Math.abs(degrees(car)).toFixed(1)} degrees, ${(speedOf(car) * 3.6).toFixed(1)} km/h`)
  }
})

check('steering changes the arc and throttle changes the angle', () => {
  const results = []
  for (const [steer, throttle] of [[-0.35, 1], [0.9, 1], [0.9, 0.4]]) {
    const car = moving()
    enter(car)
    run(car, 2, { steer, throttle })
    results.push({ angle: Math.abs(slipOf(car)), curve: car.yaw / speedOf(car) })
  }
  assert(results[1].curve > results[0].curve * 1.4, 'steering cannot tighten the arc')
  assert(results[1].angle > results[2].angle + 0.07, 'throttle cannot deepen the angle')
})

check('holding the drift button feeds power back into the rear wheels', () => {
  const car = moving()
  run(car, 5, { steer: 0.7, handbrake: true })
  assert(Math.abs(degrees(car)) > 28 && speedOf(car) > 20)
  assert(car.wheels.slice(2).every(wheel => wheel.omega > 30), 'rears stay locked')
})

check('a held slide follows a real curved road without touching its walls', () => {
  for (const side of [-1, 1]) {
    const car = moving()
    enter(car, side)
    run(car, 2, { steer: side * 0.4 })
    const corner = flatTrack(12000, side / 80)
    corner.width.fill(4.5)
    car.s = 100
    car.n = 0
    car.psi = -slipOf(car)
    let furthest = 0
    for (let i = 0; i < 480; i++) {
      // A test driver adjusts the steering as speed builds. The production
      // drift model has no knowledge of this road or its centreline.
      const headingError = car.psi + slipOf(car)
      const inward = 0.2 - side * (headingError * 8 + car.n * 0.15)
      const steer = side * Math.max(-0.45, Math.min(0.95, inward))
      advanceCar(corner, car, { ...gas, steer }, DT)
      furthest = Math.max(furthest, Math.abs(car.n))
      assert(!car.touching, `corner contact at ${i / 120}s`)
      assert(Math.abs(degrees(car)) > 25)
    }
    console.log(`  80m-radius corner: ${furthest.toFixed(2)}m maximum lateral deviation`)
    assert(car.s > 180)
  }
})

check('a sideways body contacts the wall before its nose passes through it', () => {
  const car = moving()
  enter(car)
  run(car, 1.5, { steer: 0.7 })
  const track = flatTrack(12000)
  track.width.fill(4)
  car.psi = 0.65
  car.n = wallAt({ ...car.road, width: 4 }) - 1.1
  const before = speedOf(car)
  advanceCar(track, car, { ...gas, steer: 0.7 }, DT)
  assert(car.touching && speedOf(car) < before)
  run(car, 0.1, { steer: 0.7 }, track)
  assert.equal(car.driftSide, 0, 'contact must release the drift balance')
})

check('drift framing keeps the camera inside the tunnel', () => {
  const car = moving()
  enter(car)
  run(car, 1.5, { steer: 0.7 })
  const track = flatTrack(12000)
  track.width.fill(4)
  car.n = 3.6
  for (const aspect of [16 / 9, 852 / 393, 393 / 852]) {
    const camera = new PerspectiveCamera(60, aspect, 0.1, 1000)
    new ChaseCamera().update(camera, track, car, 1 / 60)
    assert(Math.abs(camera.position.x) <= 3.201)
  }
})

check('lift, strong opposite lock, centred steering and brakes all exit', () => {
  for (const input of [{ throttle: 0, steer: -0.15 }, { steer: -1 }, { steer: 0 }, { brake: 0.7, throttle: 0 }]) {
    const car = moving()
    enter(car)
    run(car, 1.5, { steer: 0.7 })
    let maxChange = 0
    let previous = slipOf(car)
    for (let i = 0; i < 240; i++) {
      const control = { ...gas, ...input }
      // Unwind the catch once it has worked; holding full opposite lock for
      // two seconds asks for a new grip corner in the other direction.
      if (input.steer === -1 && i >= 120) control.steer = 0
      advanceCar(road, car, control, DT)
      maxChange = Math.max(maxChange, Math.abs(slipOf(car) - previous))
      previous = slipOf(car)
    }
    assert.equal(car.driftSide, 0)
    assert(Math.abs(degrees(car)) < 8, `exit slip ${degrees(car)}`)
    assert(maxChange < 0.055, `snapping exit ${maxChange}`)
  }
})

check('held and re-tapped drifts transition across an S bend without a spin', () => {
  for (const held of [false, true]) {
    const car = moving()
    enter(car)
    run(car, 1.5, { steer: 0.7, handbrake: held })
    let maxYaw = 0
    for (let i = 0; i < 240; i++) {
      advanceCar(road, car, { ...gas, steer: -0.7, handbrake: held || i < 26 }, DT)
      maxYaw = Math.max(maxYaw, Math.abs(car.yaw))
    }
    console.log(`  transition: ${degrees(car).toFixed(1)} degrees, ${(speedOf(car) * 3.6).toFixed(1)} km/h`)
    assert(degrees(car) > 25 && degrees(car) < 42)
    assert(speedOf(car) > 16 && maxYaw < 2.5)
  }
})

check('wet and sandy roads and lower entry speeds remain controllable', () => {
  for (const [speed, wet, sand] of [[14, 0, 0], [20, 1, 0], [25, 0, 0.8], [34, 0, 0]]) {
    const car = moving(speed)
    const track = flatTrack(12000)
    track.width.fill(10000)
    track.wet.fill(wet)
    track.sand.fill(sand)
    run(car, 0.22, { steer: 0.7, handbrake: true }, track)
    run(car, 3, { steer: 0.7 }, track)
    assert(Math.abs(degrees(car)) > 20 && Math.abs(degrees(car)) < 45)
    assert(speedOf(car) > 10)
    assert(car.wheels.every(w => Number.isFinite(w.omega) && w.load >= 0))
  }
})

check('low-speed and straight handbrake pulls still brake without latching a drift', () => {
  for (const [speed, steer] of [[6, 0.7], [25, 0]]) {
    const car = moving(speed)
    const before = speedOf(car)
    run(car, 0.7, { steer, handbrake: true, throttle: 0 })
    assert.equal(car.driftSide, 0)
    assert(speedOf(car) < before - 2)
  }
})

check('drift trajectories agree at 30, 60 and 120 fps', () => {
  const cars = [30, 60, 120].map(fps => {
    const car = moving()
    for (let i = 0; i < fps * 5; i++) {
      const t = i / fps
      advanceCar(road, car, { ...gas, steer: t < 2 ? 0.7 : -0.7,
        handbrake: t < 0.2 || (t >= 2 && t < 2.2), throttle: t >= 4 ? 0 : 1 }, 1 / fps)
    }
    return car
  })
  for (const car of cars) {
    assert(Math.abs(car.s - cars[0].s) < 0.12 && Math.abs(car.n - cars[0].n) < 0.12)
    assert(Math.abs(slipOf(car) - slipOf(cars[0])) < 0.01)
  }
})

check('unpowered exits add no speed and authored racing lines exert no force', () => {
  const a = moving(), b = moving()
  enter(a); enter(b)
  const other = flatTrack(12000)
  other.width.fill(10000)
  other.line.fill(20)
  run(a, 2, { steer: 0.7 }); run(b, 2, { steer: 0.7 }, other)
  assert(Math.abs(a.n - b.n) < 1e-9 && Math.abs(a.vs - b.vs) < 1e-9)
  const beforeLift = speedOf(a)
  // Give the loaded driveline and relaxed contact patches time to unload.
  run(a, 0.15, { throttle: 0 })
  let previous = speedOf(a)
  for (let i = 0; i < 240; i++) {
    advanceCar(road, a, { ...gas, throttle: 0 }, DT)
    assert(speedOf(a) <= previous + 0.005, `free energy during recovery: step ${i}, gain ${speedOf(a) - previous}`)
    previous = speedOf(a)
  }
  assert(speedOf(a) < beforeLift - 1)
})
