import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { mapBearing, mapOffset, routePoints } from '../src/world/games/ember-rally/mapPainter'
import { makeTrack, roadAtRoute } from '../src/world/games/ember-rally/track'

const origin = { x: 217, z: -813 }
const camera = new PerspectiveCamera(60, 1, .1, 1000)
for (const heading of [-Math.PI, -1.2, 0, .8, Math.PI, Math.PI * 7]) {
  camera.position.set(origin.x, 0, origin.z)
  camera.lookAt(origin.x + Math.sin(heading), 0, origin.z + Math.cos(heading))
  camera.updateMatrixWorld(true)
  const ahead = mapOffset({ x: origin.x + Math.sin(heading) * 100, z: origin.z + Math.cos(heading) * 100 }, origin, heading)
  assert(Math.abs(ahead.x) < 1e-9 && Math.abs(ahead.y + 100) < 1e-9, 'forward must be up at every heading')
  // Derive right from the real Three.js camera, not the map's own convention.
  const screenRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const right = mapOffset({ x: origin.x + screenRight.x * 23, z: origin.z + screenRight.z * 23 }, origin, heading)
  assert(Math.abs(right.x - 23) < 1e-9 && Math.abs(right.y) < 1e-9, 'world lateral displacement must remain visible')
  for (const yaw of [-.7, 0, .7]) {
    const facing = mapOffset({ x: origin.x + Math.sin(heading + yaw), z: origin.z + Math.cos(heading + yaw) }, origin, heading)
    const angle = mapBearing(heading + yaw, heading)
    assert(Math.abs(Math.sin(angle) - facing.x) < 1e-9 && Math.abs(-Math.cos(angle) - facing.y) < 1e-9,
      'car arrow must point in the same direction as the projected car')
  }
}
for (const stage of ['rootway', 'moonbreak', 'stormcrown', 'harmattan', 'nightfall'] as const) {
  const track = makeTrack(1, stage)
  const points = routePoints(track.x, track.z)
  assert.deepEqual(points[0], { x: track.x[0], z: track.z[0] })
  assert.deepEqual(points.at(-1), { x: track.x.at(-1), z: track.z.at(-1) }, 'finish cannot be dropped by sampling')
  for (const point of points) assert(Number.isFinite(point.x) && Number.isFinite(point.z))
  for (let s = 0; s < track.length - 40; s += 20) {
    const here = roadAtRoute(track, s, false), ahead = roadAtRoute(track, s + 40, false)
    camera.position.set(here.x, 0, here.z)
    camera.lookAt(here.x + Math.sin(here.heading), 0, here.z + Math.cos(here.heading))
    camera.updateMatrixWorld(true)
    const seen = new Vector3(ahead.x, 0, ahead.z).applyMatrix4(camera.matrixWorldInverse)
    const mapped = mapOffset(ahead, here, here.heading)
    assert(Math.abs(mapped.x - seen.x) < 1e-7, 'upcoming corner must appear on the same side as in the driving camera')
    assert(Math.abs(mapped.y - seen.z) < 1e-7, 'forward distance must remain unchanged')
  }
  if (track.split) {
    const split = track.split
    const branch = routePoints(split.x, split.z)
    for (const fraction of [0, .25, .5, .75, 1]) {
      const s = Math.floor(split.from + (split.to - split.from) * fraction)
      const road = roadAtRoute(track, s, true)
      const offset = mapOffset(road, road, road.heading)
      assert.equal(Math.abs(offset.x), 0); assert.equal(Math.abs(offset.y), 0)
      assert(branch.some(p => Math.hypot(p.x - road.x, p.z - road.z) < 4), 'shortcut marker must follow the drawn branch')
    }
  }
  console.log(`PASS ${stage}: real route samples and endpoints${track.split ? ', including shortcut alignment' : ''}`)
}
console.log('PASS heading wrap, forward orientation and lateral displacement')
