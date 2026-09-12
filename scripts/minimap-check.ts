import assert from 'node:assert/strict'
import { mapOffset, routePoints } from '../src/world/games/ember-rally/mapPainter'
import { makeTrack, roadAtRoute } from '../src/world/games/ember-rally/track'

const origin = { x: 217, z: -813 }
for (const heading of [-Math.PI, -1.2, 0, .8, Math.PI, Math.PI * 7]) {
  const ahead = mapOffset({ x: origin.x + Math.sin(heading) * 100, z: origin.z + Math.cos(heading) * 100 }, origin, heading)
  assert(Math.abs(ahead.x) < 1e-9 && Math.abs(ahead.y + 100) < 1e-9, 'forward must be up at every heading')
  const right = mapOffset({ x: origin.x + Math.cos(heading) * 23, z: origin.z - Math.sin(heading) * 23 }, origin, heading)
  assert(Math.abs(right.x - 23) < 1e-9 && Math.abs(right.y) < 1e-9, 'world lateral displacement must remain visible')
}
for (const stage of ['rootway', 'moonbreak', 'stormcrown', 'harmattan', 'nightfall'] as const) {
  const track = makeTrack(1, stage)
  const points = routePoints(track.x, track.z)
  assert.deepEqual(points[0], { x: track.x[0], z: track.z[0] })
  assert.deepEqual(points.at(-1), { x: track.x.at(-1), z: track.z.at(-1) }, 'finish cannot be dropped by sampling')
  for (const point of points) assert(Number.isFinite(point.x) && Number.isFinite(point.z))
  if (track.split) {
    const split = track.split
    const branch = routePoints(split.x, split.z)
    for (const fraction of [0, .25, .5, .75, 1]) {
      const s = Math.floor(split.from + (split.to - split.from) * fraction)
      const road = roadAtRoute(track, s, true)
      const offset = mapOffset(road, road, road.heading)
      assert.equal(offset.x, 0); assert.equal(Math.abs(offset.y), 0)
      assert(branch.some(p => Math.hypot(p.x - road.x, p.z - road.z) < 4), 'shortcut marker must follow the drawn branch')
    }
  }
  console.log(`PASS ${stage}: real route samples and endpoints${track.split ? ', including shortcut alignment' : ''}`)
}
console.log('PASS heading wrap, forward orientation and lateral displacement')
