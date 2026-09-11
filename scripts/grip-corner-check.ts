import assert from 'node:assert/strict'
import { PerspectiveCamera } from 'three'
import { flatTrack } from './rally-fixture'
import { advanceCar, createCar, speedOf, slipOf, WHEEL_RADIUS } from '../src/world/games/ember-rally/physics'
import { ChaseCamera } from '../src/world/games/ember-rally/camera'
import { DERIVED } from '../src/world/games/ember-rally/tuning'
import { raceFrameDelta } from '../src/world/games/ember-rally/frameTime'

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const gas = { steer: 0, throttle: 1, brake: 0, handbrake: false, boost: false }
function corner(radius: number, direction: number, entry: number, brake = 0, wet = 0, sand = 0) {
  const road = flatTrack(3000, direction / radius)
  road.wet.fill(wet); road.sand.fill(sand)
  const car = createCar(road)
  car.s = 100; car.vs = entry / 3.6; car.gear = 4
  car.wheels.forEach(w => { w.omega = car.vs / WHEEL_RADIUS })
  let steer = 0, worst = 0, slip = 0
  for (let i = 0; i < 120 * 3; i++) {
    // A repeatable driver: anticipate the bend, then correct heading and lane
    // error. Use the keyboard's actual hand-rate, not instantaneous steering.
    const wanted = clamp(direction * 45 / radius * (entry / 120) ** 2 - (car.psi + slipOf(car)) * 4 - car.n * .14, -1, 1)
    const rate = DERIVED.steerRate + (DERIVED.steerRateFast - DERIVED.steerRate) * Math.min(1, speedOf(car) / 44)
    steer += (wanted - steer) * (1 - Math.exp(-rate / 120))
    advanceCar(road, car, { ...gas, steer, brake, throttle: brake ? 0 : 1 }, 1 / 120)
    worst = Math.max(worst, Math.abs(car.n))
    slip = Math.max(slip, Math.abs(slipOf(car)))
    assert(!car.drifting, 'ordinary steering must not latch a drift')
  }
  return { worst, slip, speed: speedOf(car) * 3.6 }
}
for (const direction of [-1, 1]) for (const [radius, entry] of [[100, 120], [120, 140], [70, 100]]) {
  const result = corner(radius, direction, entry)
  console.log(`r${radius}, ${entry} km/h, ${direction < 0 ? 'left' : 'right'}: max lane error ${result.worst.toFixed(2)} m, slip ${(result.slip * 180 / Math.PI).toFixed(1)}°, exit ${result.speed.toFixed(0)} km/h`)
  assert(result.worst < 2.8, 'a broad fast bend should fit within an eight-metre-wide road with body clearance without drifting')
  assert(result.slip < .16, 'grip corners should remain settled')
}
const tight = corner(30, 1, 140)
const slowed = corner(30, 1, 140, .65)
assert(tight.worst > 4, 'a hairpin at 140 still exceeds the grip limit')
assert(slowed.worst < tight.worst, 'braking must improve a too-fast entry')
const dry = corner(80, 1, 120)
const loose = corner(80, 1, 120, 0, 1, .8)
assert(loose.worst > dry.worst, 'wet and sand must retain their cornering cost')

const road = flatTrack(1000)
function shot(kmh: number, aspect: number) {
  const car = createCar(road)
  car.s = 150; car.vs = kmh / 3.6
  const camera = new PerspectiveCamera(56, aspect, .1, 300)
  const chase = new ChaseCamera()
  for (let i = 0; i < 180; i++) chase.update(camera, road, car, 1 / 60, 1)
  return camera
}
for (const aspect of [1.78, 2.16]) {
  const slow = shot(30, aspect), fast = shot(140, aspect)
  assert(fast.position.y < slow.position.y - .25, 'speed brings the road closer beneath the camera')
  assert(fast.fov > slow.fov + 8, 'speed progressively opens peripheral vision')
  assert(Math.abs(fast.position.z - slow.position.z) < .3, 'speed must not shrink the car by pulling far away')
}
console.log('PASS broad grip corners, braking limits, surface penalties and speed-camera cues.')

const runs = [15, 20, 30, 60, 120].map(fps => {
  const car = createCar(road)
  for (let i = 0; i < fps * 8; i++) {
    advanceCar(road, car, { ...gas, steer: i >= fps * 5 && i < fps * 6 ? .4 : 0 }, raceFrameDelta(1 / fps))
  }
  return car
})
for (const car of runs) {
  assert(Math.abs(car.s - runs[0].s) < .01, 'low rendering rates must not slow distance travelled')
  assert(Math.abs(car.n - runs[0].n) < .01, 'low rendering rates must not change the cornering line')
}
assert.equal(raceFrameDelta(60), .1)
assert.equal(raceFrameDelta(-1), 0)
assert.equal(raceFrameDelta(NaN), 0)
console.log('PASS equal simulated travel at 15–120 FPS, with long-pause protection.')
