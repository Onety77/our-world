import assert from 'node:assert/strict'
import { Group, Vector3 } from 'three'
import { buildHarmattan } from '../src/world/games/ember-rally/Harmattan'
import { buildWheel, WHEEL_POSITIONS } from '../src/world/games/ember-rally/car'
import { nearbyHarmattanSurface, surfaceAt, surfaceHeight, type SurfaceTriangle } from '../src/world/games/ember-rally/harmattanSurface'
import { makeTrack, roadAt } from '../src/world/games/ember-rally/track'
import { createCar } from '../src/world/games/ember-rally/physics'
import { placeCar, poseWheels, poseGhostWheels, type CarRig } from '../src/world/games/ember-rally/rig'

const root = new Group(), ground = new Group(), body = new Group()
root.add(ground); ground.add(body)
const rig: CarRig = { root, ground, body, hubs: [], cambers: [], spinners: [], springs: [], boostJets: new Group(), spin: [0, 0, 0, 0] }
for (const position of WHEEL_POSITIONS) {
  const hub = new Group(), camber = new Group(), spinner = new Group(), spring = new Group()
  hub.position.fromArray(position)
  ground.add(hub); hub.add(camber); camber.add(spinner); body.add(spring)
  rig.hubs.push(hub); rig.cambers.push(camber); rig.spinners.push(spinner); rig.springs.push(spring)
}
const wheel = buildWheel().getAttribute('position')
const point = new Vector3()
const triangles: SurfaceTriangle[] = []
let poses = 0, worstSink = 0, worstGap = 0, maxTravel = 0
let poseTime = 0

for (const seed of [7, 1234]) {
  const track = makeTrack(seed, 'harmattan')
  // Independently check against the geometry actually handed to the renderer,
  // including triangle interiors, diagonals and 60 m chunk joins.
  const chunks = buildHarmattan(track)
  let checked = 0
  for (let chunk = 0; chunk < chunks.length; chunk++) {
    const geometry = chunks[chunk].geometry
    const positions = geometry.getAttribute('position')
    const indices = geometry.getIndex()!
    const first = chunk * 30
    const last = Math.min(Math.floor(track.length / 2), first + 30)
    for (let ring = first; ring < last; ring++) {
      nearbyHarmattanSurface(track, ring * 2, triangles)
      for (let k = 1; k <= 10; k++) for (let half = 0; half < 2; half++) {
        const offset = (ring - first) * 72 + k * 6 + half * 3
        point.set(0, 0, 0)
        for (let corner = 0; corner < 3; corner++) {
          const index = indices.getX(offset + corner)
          point.x += positions.getX(index) / 3
          point.y += positions.getY(index) / 3
          point.z += positions.getZ(index) / 3
        }
        const triangle = surfaceAt(triangles, point.x, point.z)
        assert(triangle, `Missing road triangle at ${ring * 2}`)
        // Wide shoulders can fold over one another inside a tight bend. Every
        // rendered triangle must exist, even when another lies above it.
        assert(triangles.some(t => surfaceAt([t], point.x, point.z) &&
          Math.abs(surfaceHeight(t, point.x, point.z) - point.y) < .0001),
        `Mesh mismatch ring=${ring} k=${k} half=${half}`)
        checked++
      }
    }
    geometry.dispose()
  }
  console.log(`Seed ${seed}: ${checked} rendered triangle interiors match the contact surface.`)
  const car = createCar(track)
  for (let s = track.start + 4; s < track.finishAt; s += 17.37) {
    const road = roadAt(track, s)
    for (const yaw of [0, -.95, .95, Math.PI / 2]) {
      const n = Math.sin(s) * Math.max(0, road.width - 2)
      car.roll = Math.sin(s) * .15
      car.pitch = Math.cos(s) * .08
      car.heave = Math.sin(s * .4) * .025
      car.wheels.forEach((w, i) => { w.spin = s * (i + 1); w.steer = i < 2 ? -yaw * .65 : 0 })
      const before = JSON.stringify(car)
      const started = performance.now()
      placeCar(rig, track, s, n, yaw, car.roll, car.pitch, car.heave)
      if (poses % 2) poseWheels(rig, car)
      else poseGhostWheels(rig, 30, .8, yaw, true, 1 / 60, yaw * .65)
      poseTime += performance.now() - started
      point.set(0, 0, 1).transformDirection(ground.matrixWorld)
      assert(Math.abs(Math.sin(Math.atan2(point.x, point.z) - (road.heading - yaw))) < 1e-8,
        'The visible compass heading must follow the driving simulation')
      assert.equal(JSON.stringify(car), before, 'Rendering must not change physics state')
      nearbyHarmattanSurface(track, s, triangles)
      for (let i = 0; i < 4; i++) {
        let gap = Infinity
        for (let v = 0; v < wheel.count; v++) {
          point.fromBufferAttribute(wheel, v).applyMatrix4(rig.spinners[i].matrixWorld)
          const triangle = surfaceAt(triangles, point.x, point.z)
          assert(triangle, `Missing wheel support at ${s}`)
          const distance = point.y - surfaceHeight(triangle, point.x, point.z)
          gap = Math.min(gap, distance)
        }
        worstSink = Math.max(worstSink, -gap)
        worstGap = Math.max(worstGap, gap)
        maxTravel = Math.max(maxTravel, Math.abs(rig.hubs[i].position.y - WHEEL_POSITIONS[i][1]))
        assert(gap >= -.001 && gap <= .001, `Wheel ${i} at s=${s}, yaw=${yaw}: gap ${gap}`)
      }
      poses++
    }
  }
}
console.log(`${poses} poses, all four complete wheel meshes: sink ${(worstSink * 1000).toFixed(3)} mm, gap ${(worstGap * 1000).toFixed(3)} mm; maximum suspension adjustment ${(maxTravel * 100).toFixed(1)} cm.`)
console.log(`Average render pose cost: ${(poseTime / poses).toFixed(2)} ms on this machine.`)

for (const stage of ['rootway', 'moonbreak', 'stormcrown'] as const) {
  const track = makeTrack(7, stage)
  const road = roadAt(track, 120)
  placeCar(rig, track, 120, 1, .8, .1, .05)
  const car = createCar(track)
  poseWheels(rig, car)
  assert.equal(ground.position.y, 0)
  assert.equal(ground.rotation.x, -road.grade)
  assert.equal(ground.rotation.z, road.bank)
  for (let i = 0; i < 4; i++) assert.equal(rig.hubs[i].position.y, WHEEL_POSITIONS[i][1])
}
console.log('Other stages retain their existing stance; player and ghost poses leave CarState untouched.')
