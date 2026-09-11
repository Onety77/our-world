import assert from 'node:assert/strict'
import { makeTrack, roadAt, roadAtRoute } from '../src/world/games/ember-rally/track'
import { advanceCar, createCar, Recorder } from '../src/world/games/ember-rally/physics'
import { spiritDriver } from '../src/world/games/ember-rally/spirit'
import { buildTunnel } from '../src/world/games/ember-rally/geometry'
import { laySurface } from '../src/world/games/ember-rally/roadSurface'
import { runAt, SAMPLE_SHORTCUT } from '../src/world/games/ember-rally/model'
import { blendRoutePosition, runOnTrack } from '../src/world/games/ember-rally/routeSample'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'

const track = makeTrack(42, 'rootway'), split = track.split!
console.log({ main: split.mainLength, cut: split.shortcutLength,
  radius: 1 / Math.max(...Array.from(split.curv, Math.abs)),
  metric: [Math.min(...split.metric), Math.max(...split.metric)] })
const times: number[] = []
for (const mode of ['main', 'cut', 'mistake']) {
  const shortcut = mode !== 'main'
  const car = createCar(track)
  car.s = split.from + 5; car.n = shortcut ? 2 : 0; car.vs = 32
  const drive = spiritDriver(track, 7, 1, true)
  let sawCut = false
  const recorder = new Recorder()
  for (let i = 0; i < 120 * 90 && car.s < split.to; i++) {
    const input = drive(car, 1 / 120)
    if (mode === 'mistake' && car.s > split.hardAt - 35 && car.s < split.hardAt + 35) {
      input.steer = 0; input.throttle = 1; input.brake = 0
    }
    advanceCar(track, car, input, 1 / 120)
    recorder.sample(car)
    sawCut ||= car.shortcut
  }
  console.log({ mode, time: car.elapsed, s: car.s, strikes: car.strikes, sawCut })
  times.push(car.elapsed)
  assert(car.s >= split.to, 'both roads must be driveable')
  assert.equal(sawCut, shortcut)
  assert.equal(car.shortcut, false, 'the branch rejoins before the end of the piece')
  if (mode !== 'mistake') assert.equal(car.strikes, 0, 'a clean line must not hit invisible geometry')
  const run = recorder.finish(car)
  assert.equal(run.path.some((value, i) => i % 4 === 3 && (value & SAMPLE_SHORTCUT) !== 0), shortcut)
  if (shortcut) assert(runAt(run, car.elapsed * 500).shortcut, 'ghost playback retains the alternate route')
}
assert(times[0] - times[1] > 1 && times[0] - times[1] < 4, 'the reward is real but modest')
assert(times[2] > times[0], 'a missed bend should cost more than the shortcut saves')
for (const seed of [1, 7, 1234, 90210]) {
  const other = makeTrack(seed, 'rootway'), cut = other.split!
  assert.deepEqual(cut.x, split.x, 'daily scenery must not stretch the fork')
  assert(Math.max(...Array.from(cut.curv, Math.abs)) < 1 / 45)
  assert(Math.min(...cut.metric) > .5)
  for (const s of [cut.from, cut.rejoinAt, cut.to]) {
    const a = roadAt(other, s), b = roadAtRoute(other, s, true)
    assert(Math.hypot(a.x - b.x, a.z - b.z) < .001)
    assert(Math.abs(a.heading - b.heading) < .001)
  }
}
// Crossing the common floor in either direction preserves position, heading
// and speed. This also catches a camera snap caused by a route-frame jump.
for (const returning of [false, true]) {
  const car = createCar(track)
  car.s = split.from + 108; car.shortcut = returning; car.vs = 20
  car.n = returning ? -1.5 : 2.8
  const at = roadAtRoute(track, car.s, car.shortcut)
  const x = at.x - Math.cos(at.heading) * car.n, z = at.z + Math.sin(at.heading) * car.n
  const heading = at.heading - car.psi
  advanceCar(track, car, { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false }, 1 / 120)
  const after = roadAtRoute(track, car.s, car.shortcut)
  assert.equal(car.shortcut, !returning)
  assert(Math.hypot(after.x - Math.cos(after.heading) * car.n - x,
    after.z + Math.sin(after.heading) * car.n - z) < .18, 'no sideways teleport')
  assert(Math.abs(after.heading - car.psi - heading) < .002, 'world heading survives route selection')
  if (!returning) {
    const path = [2800, Math.round((split.from + 108) * 100), 0, 0,
      Math.round(car.n * 1000), Math.round(car.s * 100), Math.round(car.psi * 1000), SAMPLE_SHORTCUT]
    const run = { v: 4 as const, timeMs: 100, path, strikes: 0, driftMs: 0 }
    const world = (time: number) => {
      const sample = runOnTrack(track, run, time), r = roadAtRoute(track, sample.s, sample.shortcut)
      return new Vector3(r.x - Math.cos(r.heading) * sample.n, r.y, r.z + Math.sin(r.heading) * sample.n)
    }
    assert(world(49.9).distanceTo(world(50.1)) < .01, 'ghost cannot snap when the route flag changes')
    const live = blendRoutePosition(track, runAt(run, 0), runAt(run, 100), .501, runAt(run, 50.1))
    const replay = runOnTrack(track, run, 50.1)
    assert(Math.abs(live.n - replay.n) < .0001, 'live and recorded cars use the same junction projection')
  }
}
const chunks = buildTunnel(track), surface = laySurface(track, chunks)
let missing = 0
for (const shortcut of [false, true]) for (let s = split.from; s <= split.to; s += .8) {
  const r = roadAtRoute(track, s, shortcut)
  for (const n of [-r.width + 1, -1, 0, 1, r.width - 1]) {
    const out = { y: 0, dx: 0, dz: 0 }
    if (!surface.supportAt(r.x - Math.cos(r.heading) * n, r.z + Math.sin(r.heading) * n,
      s, r.y, 1, 0, out)) { missing++; console.log('missing', { shortcut, s, n }) }
  }
}
console.log({ missing })
assert.equal(missing, 0, 'every wheel position has a rendered road beneath it, including both joins')
const material = new MeshBasicMaterial({ side: DoubleSide })
const meshes = chunks.map(chunk => new Mesh(chunk.geometry, material))
for (const [from, to] of [[split.from + 95, split.from + 150], [split.to - 150, split.to - 70]]) {
  const a = roadAtRoute(track, from, true), b = roadAtRoute(track, to, true)
  const origin = new Vector3(a.x, a.y + 1.4, a.z), end = new Vector3(b.x, b.y + 1.4, b.z)
  const ray = new Raycaster(origin, end.clone().sub(origin).normalize(), .1, origin.distanceTo(end))
  assert.equal(ray.intersectObjects(meshes, false).length, 0, 'the cut is visible through its actual opening')
}
material.dispose()
for (const chunk of chunks) chunk.geometry.dispose()
console.log('PASS course shape, risk/reward, reversible route choice, ghost recording, sightlines and continuous road support.')
