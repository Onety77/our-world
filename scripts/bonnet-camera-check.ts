import assert from 'node:assert/strict'
import { Group, PerspectiveCamera, Vector3 } from 'three'
import { BonnetCamera } from '../src/world/games/ember-rally/bonnetCamera'
import { createCar } from '../src/world/games/ember-rally/physics'
import { flatTrack } from './rally-fixture'

const body = new Group()
const car = createCar(flatTrack())
const point = new Vector3()
for (const aspect of [1.78, 2.16, 1.33]) {
  const camera = new PerspectiveCamera(56, aspect, .15, 400)
  const bonnet = new BonnetCamera()
  for (const yaw of [-1, 0, 1]) for (const roll of [-.25, 0, .25]) {
    body.position.set(123, 15, 234)
    body.rotation.set(.15, yaw, roll)
    car.vs = 38.89
    const before = JSON.stringify(car)
    for (let i = 0; i < 60; i++) bonnet.update(camera, body, car, 1 / 60)
    camera.updateMatrixWorld(true)
    point.copy(camera.position)
    body.worldToLocal(point)
    assert(point.distanceTo(new Vector3(0, 1.16, .38)) < 1e-8, 'camera must remain attached to the windscreen position')
    // A patch on the actual bonnet must stay in the lower portion of the image.
    point.set(0, .82, 1.2).applyMatrix4(body.matrixWorld).project(camera)
    assert(point.y > -1 && point.y < -.3 && Math.abs(point.x) < .01, `bonnet framing ${point.toArray()}`)
    assert(camera.fov >= 55 && camera.fov <= 74.1)
    assert.equal(JSON.stringify(car), before, 'changing view cannot change driving state')
  }
  bonnet.restore(camera)
  assert.equal(camera.near, .15)
  assert(camera.up.equals(new Vector3(0, 1, 0)))
  bonnet.restore(camera)
  assert.equal(camera.near, .15, 'restoring twice is safe')
}
console.log('PASS bonnet visibility on three screen shapes, attachment through banks/yaw, camera restoration and unchanged driving state.')
