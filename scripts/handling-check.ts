import assert from 'node:assert/strict'
import { Group, PerspectiveCamera, Vector3 } from 'three'
import { flatTrack } from './rally-fixture'
import { advanceCar, createCar, speedOf, slipOf, WHEEL_RADIUS, type CarInput } from '../src/world/games/ember-rally/physics'
import { buildWheel, buildCarShell } from '../src/world/games/ember-rally/car'
import { makeTrack } from '../src/world/games/ember-rally/track'
import { spiritDriver } from '../src/world/games/ember-rally/spirit'
import { poseWheels, MESH_FOR_WHEEL, type CarRig } from '../src/world/games/ember-rally/rig'
import { ChaseCamera } from '../src/world/games/ember-rally/camera'
import { basisAt, roadPoint } from '../src/world/games/ember-rally/geometry'

const DT = 1 / 120
const gas: CarInput = { steer: 0, throttle: 1, brake: 0, handbrake: false, boost: false }
const neutral: CarInput = { ...gas, throttle: 0 }
const track = flatTrack(12000)
function moving(speed = 25) {
  const car = createCar(track)
  for (let i = 0; i < 120 * 30 && speedOf(car) < speed; i++) advanceCar(track, car, gas, DT)
  assert(speedOf(car) >= speed, 'car reaches test speed')
  return car
}
function run(car: ReturnType<typeof createCar>, seconds: number, input: CarInput) {
  for (let i = 0; i < Math.round(seconds / DT); i++) advanceCar(track, car, input, DT)
}
function check(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

check('standing start, stable high speed and predictable stopping', () => {
  const car = moving(100 / 3.6)
  assert(car.elapsed > 5 && car.elapsed < 10)
  run(car, 15, gas)
  assert(Math.abs(car.n) < 0.02 && Math.abs(car.yaw) < 0.01)
  assert(speedOf(car) > 34 && speedOf(car) < 38)
  const from = car.s
  for (let i = 0; i < 120 * 6 && car.vs > 0.6; i++) advanceCar(track, car, { ...neutral, brake: 1 }, DT)
  assert(car.vs < 0.7 && car.s - from < 75)
  assert(Math.abs(car.n) < 0.02)
})

check('lifting and trail braking tighten the line without snapping', () => {
  const results = []
  for (const [throttle, brake] of [[1, 0], [0, 0], [0, 0.2]]) {
    const car = moving(30)
    run(car, 1, { ...gas, steer: 0.55, throttle, brake })
    results.push(car.yaw)
    assert(Math.abs(slipOf(car)) < 0.18, `excess slip ${slipOf(car)}`)
  }
  assert(results[1] > results[0] && results[2] > results[0])
})

check('a brief handbrake pull rotates the rear and recovers on release', () => {
  const car = moving()
  run(car, 0.35, { ...gas, steer: 0.65 })
  const initial = Math.abs(slipOf(car))
  run(car, 0.22, { ...neutral, steer: 0.65, handbrake: true })
  const slipped = Math.abs(slipOf(car))
  console.log(`  slip ${(slipped * 180 / Math.PI).toFixed(1)}°, speed ${(speedOf(car) * 3.6).toFixed(1)} km/h`)
  assert(slipped > initial + 0.025)
  assert(speedOf(car) > 18)
  run(car, 2, { ...gas, throttle: 0.55, steer: -0.15 })
  assert(Math.abs(slipOf(car)) < 0.12, `failed to recover: ${slipOf(car)}`)
  assert(speedOf(car) > 15)
})

check('slides cannot supply energy or steer toward an authored racing line', () => {
  const car = moving()
  car.vn = -6
  car.drifting = true
  car.driftCharge = 1
  let previous = speedOf(car)
  for (let i = 0; i < 240; i++) {
    advanceCar(track, car, neutral, DT)
    assert(speedOf(car) < previous + 0.08, 'free speed on drift recovery')
    previous = speedOf(car)
  }
  const a = moving(), b = moving()
  const other = flatTrack(12000)
  other.line.fill(20)
  a.vn = b.vn = -5
  for (let i = 0; i < 240; i++) {
    advanceCar(track, a, { ...gas, steer: 0.3 }, DT)
    advanceCar(other, b, { ...gas, steer: 0.3 }, DT)
  }
  assert(Math.abs(a.n - b.n) < 1e-9 && Math.abs(a.vs - b.vs) < 1e-9)
})

check('simulation agrees at 30, 60 and 120 frames per second', () => {
  const cars = [30, 60, 120].map((fps) => {
    const car = createCar(track)
    for (let i = 0; i < fps * 8; i++) advanceCar(track, car,
      { ...gas, steer: i >= fps * 5 && i < fps * 6 ? 0.4 : 0 }, 1 / fps)
    return car
  })
  for (const car of cars) {
    assert(Math.abs(car.s - cars[0].s) < 0.01)
    assert(Math.abs(car.n - cars[0].n) < 0.01)
  }
})

check('inside front steers more and unloaded tyres do not invert', () => {
  const car = moving(12)
  run(car, 0.4, { ...gas, steer: 0.7 })
  assert(car.wheels[1].steer > car.wheels[0].steer)
  assert(car.wheels.every((wheel) => wheel.load >= 0 && Number.isFinite(wheel.omega)))
})

check('wall contact loses speed rather than overwriting the impact', () => {
  const road = flatTrack(12000)
  road.width.fill(4)
  const car = moving()
  car.n = 8
  car.vn = 4
  const before = speedOf(car)
  advanceCar(road, car, neutral, DT)
  assert(car.touching && speedOf(car) < before - 1)
})

check('visible steering matches the tyres and suspension keeps contact', () => {
  const groups = () => Array.from({ length: 4 }, () => new Group())
  const rig: CarRig = { root: new Group(), ground: new Group(), body: new Group(),
    hubs: groups(), cambers: groups(), spinners: groups(), springs: groups(), boostJets: new Group(), spin: [0, 0, 0, 0] }
  const car = moving(15)
  run(car, 0.5, { ...gas, steer: 0.7 })
  poseWheels(rig, car)
  for (let i = 0; i < 4; i++) {
    const index = MESH_FOR_WHEEL[i]
    assert.equal(rig.hubs[index].rotation.y, -car.wheels[i].steer)
    assert.equal(rig.hubs[index].position.y, WHEEL_RADIUS)
    assert.equal(rig.spinners[index].rotation.x, car.wheels[i].spin)
  }
})

check('chase camera keeps the car in frame on wide and tall screens', () => {
  for (const aspect of [16 / 9, 852 / 393, 393 / 852]) {
    const car = moving(30)
    const camera = new PerspectiveCamera(60, aspect, 0.1, 1000)
    const chase = new ChaseCamera()
    for (const n of [-4, 0, 4]) {
      car.n = n
      chase.reset()
      chase.update(camera, track, car, 1 / 60)
      camera.updateMatrixWorld()
      const point = roadPoint(car.road, n, 0.65, new Vector3(), basisAt(car.road)).project(camera)
      assert(Math.abs(point.x) < 0.8 && Math.abs(point.y) < 0.9, `car outside view ${point.toArray()}`)
    }
  }
})

check('wheel surfaces face outward and the car geometry remains finite', () => {
  const wheel = buildWheel()
  const positions = wheel.getAttribute('position'), normals = wheel.getAttribute('normal')
  const p = new Vector3(), n = new Vector3()
  // The first 48 rings of eight vertices are the round carcass.
  for (let i = 0; i < 48 * 8; i++) {
    p.fromBufferAttribute(positions, i)
    n.fromBufferAttribute(normals, i)
    if (Math.hypot(p.y, p.z) > 0.33) assert(p.y * n.y + p.z * n.z > 0)
  }
  assert(wheel.boundingSphere!.radius < WHEEL_RADIUS + 0.12)
  const shell = buildCarShell()
  assert(Array.from(shell.getAttribute('position').array).every(Number.isFinite))
  wheel.dispose(); shell.dispose()
})

check('the spirit completes every road with the same tyre model', () => {
  for (const stage of ['rootway', 'moonbreak', 'stormcrown', 'harmattan'] as const) {
    const road = makeTrack(7, stage)
    const car = createCar(road)
    const drive = spiritDriver(road, 7)
    let contact = 0
    for (let i = 0; i < 120 * 400 && !car.finished; i++) {
      advanceCar(road, car, drive(car, DT), DT)
      if (car.touching) contact++
      assert(Number.isFinite(car.s + car.vs + car.vn + car.yaw))
    }
    console.log(`  ${stage}: ${car.elapsed.toFixed(1)}s, ${(contact / (car.elapsed * 120) * 100).toFixed(1)}% wall contact`)
    assert(car.finished, `${stage} did not finish`)
    assert(contact / (car.elapsed * 120) < 0.08)
  }
})
